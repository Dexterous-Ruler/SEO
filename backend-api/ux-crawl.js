// ===========================================================================
// Static UX-defect crawler — the NO-CONSENT complement to the RUM beacon.
//
// Fetches a site's top ORGANIC pages (from GSC) and flags the UX/conversion
// defects that are already visible in the delivered HTML — broken internal
// links, dead CTAs, broken images/resources — weighted by the organic clicks
// each page earns, so the worst-exposed breakage surfaces first. Because it
// observes NO real visitor (just server-fetches public pages), it needs no
// consent and runs fully hands-off: on-demand + a weekly scheduler job.
//
// Zero-dep (regex extraction, global fetch), bounded fetch concurrency, and a
// cross-page URL cache so shared nav/footer links are only checked once.
// Emits the SAME event_type vocabulary the beacon uses (dest_404,
// broken_resource, broken_cta) so findings slot into the existing remediation
// matrix / Review Queue unchanged.
// ===========================================================================

const UA = 'Mozilla/5.0 (compatible; SentinelUXBot/1.0; +https://sentinel-goodfor-2e75db85.koyeb.app)';
const PAGE_TIMEOUT = 15000;
const LINK_TIMEOUT = 12000;
const POOL = 5;   // gentle concurrency — bursting made some sites rate-limit (false 0s)

async function fetchWithTimeout(url, opts = {}, ms = LINK_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, ...opts, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

function absolutize(href, base) { try { return new URL(href, base).href; } catch { return null; } }
function originOf(u) { try { return new URL(u).origin; } catch { return ''; } }

// --- HTML extraction (delivered markup only; no JS execution) ---------------
function extract(html, pageUrl) {
  const origin = originOf(pageUrl);
  const raw = String(html || '');
  const notData = (s) => s && !/^data:/i.test(s);
  const grab = (re, src) => { const out = []; let x; while ((x = re.exec(src))) out.push((x[2] != null ? x[2] : x[3] || '').trim()); return out; };

  // Resource tags (<script src>, <link stylesheet>) are self-referencing — the URL is
  // real even when the tag is a <script>, so read them from the RAW html.
  const scripts = grab(/<script\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, raw).filter(notData);
  const styles = [];
  const linkRe = /<link\b[^>]*?>/gi; let lk;
  while ((lk = linkRe.exec(raw))) {
    const tag = lk[0];
    if (!/\brel\s*=\s*("[^"]*stylesheet[^"]*"|'[^']*stylesheet[^']*'|stylesheet)/i.test(tag)) continue;
    const hm = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (hm) { const v = (hm[2] != null ? hm[2] : hm[3] || '').trim(); if (notData(v)) styles.push(v); }
  }

  // Anchors + images come from the LIVE html — strip <script>/<template>/<style> because
  // those hold CLIENT-SIDE templates (e.g. JetSearch's tmpl-jet-ajax-search-results-item
  // with {{{data.link}}} Handlebars) whose <a>/<img> are NOT live links (the un-hydrated
  // placeholder 404s, but real users whose browser runs the JS never see it).
  // We KEEP <noscript>: WP lazy-load plugins put the REAL <img src> there as the no-JS
  // fallback, so stripping it would blind us to broken lazy-loaded images.
  const live = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const anchors = [];
  const aRe = /<a\b([^>]*?)href\s*=\s*("([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(live))) {
    const attrs = (m[1] || '') + (m[5] || '');
    const rawHref = (m[3] != null ? m[3] : m[4] || '').trim();
    const text = (m[6] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const looksButton = /\b(class|role)\s*=\s*("[^"]*"|'[^']*')/i.test(attrs) && /btn|button|cta|elementor-button|wp-block-button/i.test(attrs);
    anchors.push({ rawHref, text, looksButton });
  }
  // Images — prefer the real lazy-load URL (data-lazy-src / data-src / data-lazyload) that
  // WP LazyLoad/a3/Elementor inject, falling back to src; skip data: URI placeholders.
  const images = [];
  for (const tag of (live.match(/<img\b[^>]*>/gi) || [])) {
    for (const attr of ['data-lazy-src', 'data-src', 'data-lazyload', 'src']) {
      const mm = new RegExp('\\b' + attr + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
      if (mm) { const v = (mm[2] != null ? mm[2] : mm[3] || '').trim(); if (notData(v)) { images.push(v); break; } }
    }
  }

  return { origin, anchors, images, resources: [...new Set([...scripts, ...styles])] };
}

// Template syntax that leaked into an href/src is never a real URL (belt-and-suspenders
// for page-builder dynamic tags that survive outside <script>): {{ }}, {% %}, ${ }.
const hasTemplateSyntax = (u) => /%7[bd]|[{}]|%24%7b|\$\{/i.test(u || '');

// Only flag DEFINITIVELY-dead targets: 404 (not found) / 410 (gone). We deliberately
// do NOT flag 0 (network/timeout — usually the site rate-limiting our burst), 401/403
// (auth / bot-block), 429 (our own rate-limit), or 5xx (transient) — those manufacture
// false positives that would poison an autopilot review queue. A truly-removed WP page
// returns a real 404 anyway, so this misses nothing that matters.
const isBadStatus = (s) => s === 404 || s === 410;
// System / auth / commerce-action endpoints — not content, and often legitimately
// 401/403 for a logged-out crawler, so checking them just manufactures false positives.
const SKIP_PATH = /\/(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|wp-cron\.php)|\/feed\/?(\?|$)|[?&]add-to-cart=/i;

// --- crawl one site's top pages --------------------------------------------
// topPages: [{ page, clicks }]. Returns { defects:[...], pagesCrawled, totalDefects }.
export async function crawlSite(topPages, { limit = 12, maxPerPage = 40 } = {}) {
  const pages = (Array.isArray(topPages) ? topPages : []).filter((p) => p && p.page).slice(0, limit);
  const statusCache = new Map();   // url -> HTTP status (shared nav/footer links checked once)

  const check = async (url) => {
    if (statusCache.has(url)) return statusCache.get(url);
    let status = 0;
    try {
      let res = await fetchWithTimeout(url, { method: 'HEAD' });
      status = res.status;
      // Some servers/CDNs don't implement HEAD (405/501) or return 403 to it — retry GET.
      if (status === 0 || status === 403 || status === 405 || status === 501) {
        res = await fetchWithTimeout(url, { method: 'GET' });
        status = res.status;
      }
    } catch { status = 0; }
    statusCache.set(url, status);
    return status;
  };

  const runPool = async (urls, onResult) => {
    for (let i = 0; i < urls.length; i += POOL) {
      const batch = urls.slice(i, i + POOL);
      const results = await Promise.all(batch.map(check));
      results.forEach((s, j) => onResult(batch[j], s));
    }
  };

  const defects = [];
  for (const p of pages) {
    let html = '';
    try {
      const r = await fetchWithTimeout(p.page, { method: 'GET' }, PAGE_TIMEOUT);
      if (!r.ok) {
        // Only file a page-self defect for a genuinely dead page (404/410), matching
        // isBadStatus and the link-checking rule. 403/429/5xx are almost always
        // bot-protection or transient rate-limiting (these sites sit behind a CDN
        // bot-wall that 403s crawlers) — NOT a real defect. Flagging them would flood
        // the review queue with phantom "your ranking page is broken" proposals, so
        // skip the page instead.
        if (isBadStatus(r.status)) { defects.push({ type: 'dest_404', page: p.page, url: p.page, status: r.status, clicks: p.clicks || 0, detail: `the ranking page itself returns HTTP ${r.status}` }); }
        continue;
      }
      html = await r.text();
    } catch { continue; }

    const { origin, anchors, images, resources } = extract(html, p.page);

    // Which same-origin hrefs are button/CTA-styled, and their link text — so a
    // link that actually 404s can be labelled a broken CTA (high severity) vs a
    // plain broken link. We do NOT flag href="#"/javascript: — those are almost
    // always JS-handled (modals, OAuth) and only "broken" at runtime → beacon's job.
    const bare = (u) => (u || '').split('#')[0];
    const ctaHrefs = new Set();
    const textByHref = new Map();
    for (const a of anchors) {
      const u = absolutize(a.rawHref, p.page); if (!u) continue;
      if (a.looksButton) ctaHrefs.add(bare(u));
      if (a.text && !textByHref.has(bare(u))) textByHref.set(bare(u), a.text);
    }

    // 1) Broken internal links + CTAs — same-origin only (external bot-block → false positives).
    const links = [...new Set(anchors
      .map((a) => absolutize(a.rawHref, p.page))
      .filter((u) => u && originOf(u) === origin && !/^(mailto|tel):/i.test(u) && bare(u) !== bare(p.page) && !SKIP_PATH.test(u) && !hasTemplateSyntax(u)))
    ].slice(0, maxPerPage);
    await runPool(links, (url, s) => {
      if (!isBadStatus(s)) return;
      const isCta = ctaHrefs.has(bare(url));
      const label = textByHref.get(bare(url));
      defects.push({ type: isCta ? 'broken_cta' : 'dest_404', page: p.page, url, status: s, clicks: p.clicks || 0, detail: `${isCta ? 'CTA/button' : 'internal link'}${label ? ` “${label.slice(0, 50)}”` : ''} → ${s || 'unreachable'}` });
    });

    // 2) Broken images / scripts / stylesheets — same-origin (off-site CDN often bot-blocks).
    const assets = [...new Set([...images, ...resources].map((s) => absolutize(s, p.page)).filter((u) => u && originOf(u) === origin && !hasTemplateSyntax(u)))].slice(0, maxPerPage);
    await runPool(assets, (url, s) => { if (isBadStatus(s)) defects.push({ type: 'broken_resource', page: p.page, url, status: s, clicks: p.clicks || 0, detail: `resource → ${s || 'unreachable'}` }); });
  }

  // Collapse by TARGET, not by page: a dead link/asset in shared nav/footer is ONE
  // fix however many pages reference it. Aggregate the referencing pages' clicks so
  // exposure is summed, and report the highest-traffic referrer as the example page.
  // (Defects with no url — rare — stay keyed by page + detail.)
  const byKey = new Map();
  for (const d of defects) {
    const k = d.url ? `${d.type}|${d.url}` : `${d.type}|${d.page}|${d.detail}`;
    const ex = byKey.get(k);
    if (ex) {
      ex.refs += 1;
      ex.clicks += (d.clicks || 0);
      if ((d.clicks || 0) > ex._top) { ex._top = d.clicks || 0; ex.page = d.page; }
    } else {
      byKey.set(k, Object.assign({}, d, { refs: 1, clicks: d.clicks || 0, _top: d.clicks || 0 }));
    }
  }
  const uniq = [...byKey.values()].map((d) => {
    const out = Object.assign({}, d); delete out._top;
    if (d.refs > 1) out.detail = `${d.detail} · on ${d.refs} pages`;
    return out;
  }).sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  const byType = uniq.reduce((acc, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {});
  return { defects: uniq, pagesCrawled: pages.length, totalDefects: uniq.length, byType };
}

// Stable signature so re-runs update instead of duplicating (used when filing).
// Keyed by the broken TARGET (url) so a site-wide dead link is one proposal, not one
// per referencing page. Falls back to page+detail for the rare url-less defect.
export function defectSignature(siteId, d) {
  return `crawl:${siteId}:${d.type}:${d.url || (d.page + ':' + d.detail)}`.slice(0, 200);
}

// How each crawl defect maps into a Review-Queue proposal. All 'manual' — the fix
// needs a human to pick the correct target (re-point a link, replace an asset); we
// surface exactly what's broken and where. `db` is injected so this file stays free
// of a Supabase import; caller passes the shared db from supabase.js.
const CRAWL_FIX = {
  dest_404: { label: 'broken link', channel: 'manual', field: 'internal link', after: 'Re-point this internal link to the correct live URL, or add a 301 redirect.' },
  broken_cta: { label: 'dead CTA', channel: 'manual', field: 'CTA / button link', after: 'This button/CTA links to an error page. Point it at the correct live URL.' },
  broken_resource: { label: 'broken asset', channel: 'manual', field: 'page resource', after: 'Replace or remove this broken image / script / stylesheet.' },
};

// File defects into the Review Queue as proposals, de-duped against any still-open
// proposal for the same finding (so the weekly job never stacks duplicates).
export async function fileCrawlDefects(db, siteId, site, defects, { limit = 30 } = {}) {
  let filed = 0, skipped = 0; const created = [];
  for (const d of (Array.isArray(defects) ? defects : []).slice(0, limit)) {
    const sig = defectSignature(siteId, d);
    try { if (await db.findOpenProposal(siteId, sig)) { skipped++; continue; } } catch { /* dedup best-effort */ }
    const m = CRAWL_FIX[d.type] || CRAWL_FIX.dest_404;
    try {
      const p = await db.createProposal({
        site_id: siteId, owner: (site && site.owner) || null, finding_id: sig, disc: 'experience', risk: 'low',
        channel: m.channel, title: `UX: ${m.label} — ${String(d.url || d.page || '').replace(/^https?:\/\/[^/]+/, '') || '(page)'}`,
        page: d.page, impact: '+UX', target: 'staging', field: m.field,
        before_val: String((d.url || '') + (d.detail ? (d.url ? ' — ' : '') + d.detail : '')).slice(0, 500), after_val: m.after, status: 'proposed',
      });
      filed++; if (p && p.id) created.push(p.id);
    } catch { /* transient insert error — next run retries */ }
  }
  return { filed, skipped, created };
}

export default { crawlSite, defectSignature, fileCrawlDefects };
