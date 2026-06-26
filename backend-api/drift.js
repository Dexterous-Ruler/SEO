// ===========================================================================
// Drift — "git for SEO". Snapshot a page's SEO-critical surface (title,
// canonical, meta robots, JSON-LD @types, headings, OG tags, word count, a
// stable content hash) and diff a fresh snapshot against a stored baseline to
// catch silent regressions: a canonical that flipped, a noindex that crept in,
// an FAQPage/HowTo schema block that vanished (answer-surface lost), an H1 that
// changed, a body that lost a third of its words.
//
// Baselines live in Supabase (drift_baselines) via PostgREST. There is NO
// direct Postgres connection, so the table is created by a manual migration
// (supabase/drift-baselines.sql). Every DB call degrades gracefully: if the
// table is absent (404 / PGRST205 / any non-2xx) we return a clear
// "not provisioned" message and never throw.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

const SB = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE;

const FETCH_TIMEOUT_MS = 15000;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function headers(extra) {
  return Object.assign({ apikey: SRV, Authorization: 'Bearer ' + SRV, 'Content-Type': 'application/json' }, extra || {});
}

// A migration-missing PostgREST response: table not in the schema cache.
const NOT_PROVISIONED = { error: 'drift_baselines table not provisioned — run supabase/drift-baselines.sql', notProvisioned: true };
function isMissingTable(status, body) {
  if (status === 404) return true;
  const b = (typeof body === 'string' ? body : JSON.stringify(body || '')) || '';
  return /PGRST205|PGRST202|could not find the table|relation .*drift_baselines.* does not exist/i.test(b);
}

// ---- HTML extraction helpers ----------------------------------------------
// Cheap, tolerant regex parsing (the codebase reads rendered HTML the same way
// in detect.js / schema-gen). No DOM, no deps.
function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return _; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } });
}
const clean = (s) => decodeEntities(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// Pull an attribute value off a tag matched by a name/property selector regex.
function metaContent(html, attrRe) {
  // Match <meta ... name|property="X" ... content="Y"> in either attribute order.
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!attrRe.test(tag)) continue;
    const m = tag.match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (m) return decodeEntities(m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4] || '')).trim();
  }
  return null;
}
function tagsText(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) { const t = clean(m[1]); if (t) out.push(t); }
  return out;
}

// Stable, dependency-free string hash (FNV-1a 32-bit → unsigned hex). NOT crypto
// — we only need a fast, deterministic fingerprint to tell "content changed".
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range without BigInt.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// Strip boilerplate (script/style/nav/header/footer/aside/svg/noscript) and
// reduce to the main visible text, so the content hash tracks the actual copy
// rather than chrome that changes on every request (nonces, CSRF tokens, …).
function mainText(html) {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Prefer the <main>/<article> region when present (the real content surface).
  const main = h.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && clean(main[2]).length > 200) h = main[2];
  return clean(h);
}

// Collect the @type values of every JSON-LD block, tolerating parse errors and
// @graph nesting. Returns a de-duplicated, sorted array of type strings.
function jsonLdTypes(html) {
  const types = new Set();
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const collect = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (typeof node !== 'object') return;
    const t = node['@type'];
    if (typeof t === 'string') types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => { if (typeof x === 'string') types.add(x); });
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(collect);
  };
  while ((m = re.exec(html))) {
    let raw = (m[1] || '').trim();
    if (!raw) continue;
    try { collect(JSON.parse(raw)); }
    catch {
      // Tolerate trailing commas / multiple concatenated objects → salvage @type strings.
      const tm = raw.match(/"@type"\s*:\s*("([^"]+)"|\[[^\]]*\])/gi) || [];
      for (const seg of tm) {
        const arr = seg.match(/"([^"]+)"/g) || [];
        arr.slice(1).forEach((q) => types.add(q.replace(/"/g, '')));
      }
    }
  }
  return [...types].sort();
}

// ---- 1) snapshotPage -------------------------------------------------------
// Fetch a URL (desktop UA, follow redirects, 15s timeout) and capture its
// SEO-critical surface. Returns the snapshot object, or { error } on failure.
export async function snapshotPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res, html = '';
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html,application/xhtml+xml' },
    });
    html = await res.text();
  } catch (e) {
    clearTimeout(timer);
    return { url, error: String(e && e.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : (e.message || e)), capturedAt: new Date().toISOString() };
  }
  clearTimeout(timer);

  const status = res.status;
  const finalUrl = res.url || url;

  const titleM = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? clean(titleM[1]) : null;

  const metaDescription = metaContent(html, /\bname\s*=\s*["']description["']/i);

  const canonM = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i);
  let canonical = null;
  if (canonM) { const h = canonM[0].match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i); if (h) canonical = decodeEntities(h[2] != null ? h[2] : (h[3] != null ? h[3] : h[4] || '')).trim(); }

  const robots = metaContent(html, /\bname\s*=\s*["']robots["']/i);
  const metaRobots = robots != null ? robots.toLowerCase() : null;
  const noindex = metaRobots != null && /\bnoindex\b/.test(metaRobots);
  const nofollow = metaRobots != null && /\bnofollow\b/.test(metaRobots);

  const text = mainText(html);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    url,
    finalUrl,
    status,
    redirected: finalUrl !== url,
    title,
    metaDescription,
    canonical,
    metaRobots,
    noindex,
    nofollow,
    h1: tagsText(html, 'h1'),
    h2: tagsText(html, 'h2'),
    h3: tagsText(html, 'h3'),
    jsonLdTypes: jsonLdTypes(html),
    ogTitle: metaContent(html, /\bproperty\s*=\s*["']og:title["']/i),
    ogDescription: metaContent(html, /\bproperty\s*=\s*["']og:description["']/i),
    ogImage: metaContent(html, /\bproperty\s*=\s*["']og:image["']/i),
    wordCount,
    contentHash: fnv1a(text),
    capturedAt: new Date().toISOString(),
  };
}

// ---- 2) diffSnapshots ------------------------------------------------------
// Apply weighted rules across CRITICAL | WARNING | INFO and roll up to an
// overall severity. Returns { severity, changes:[{ rule, severity, field, before, after }] }.
const ANSWER_SCHEMA = new Set(['FAQPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'QAPage', 'Recipe']);
const SEV_RANK = { critical: 3, warning: 2, info: 1, none: 0 };
const norm = (s) => (s == null ? '' : String(s).trim());
const arr = (a) => (Array.isArray(a) ? a : []);

export function diffSnapshots(baseline, current) {
  const changes = [];
  const add = (rule, severity, field, before, after) => changes.push({ rule, severity, field, before, after });
  const b = baseline || {};
  const c = current || {};

  // A fetch that now fails outright is the worst case.
  if (c.error && !b.error) add('fetch-failed', 'critical', 'error', null, c.error);

  // 1) HTTP status regressions.
  const bs = Number(b.status) || 0, cs = Number(c.status) || 0;
  if (cs >= 500) add('status-5xx', 'critical', 'status', bs || null, cs);
  else if (cs >= 400) add('status-4xx', 'critical', 'status', bs || null, cs);
  else if (bs && cs && bs !== cs && cs >= 300) add('status-changed', 'warning', 'status', bs, cs);

  // 2) Canonical — removed or pointed elsewhere is a CRITICAL indexation risk.
  if (norm(b.canonical) && !norm(c.canonical)) add('canonical-removed', 'critical', 'canonical', b.canonical, null);
  else if (norm(b.canonical) !== norm(c.canonical) && (norm(b.canonical) || norm(c.canonical))) add('canonical-changed', 'critical', 'canonical', b.canonical || null, c.canonical || null);

  // 3) noindex / nofollow added — page (or its links) dropped from the index.
  if (!b.noindex && c.noindex) add('noindex-added', 'critical', 'metaRobots', b.metaRobots || null, c.metaRobots || null);
  else if (b.noindex && !c.noindex) add('noindex-removed', 'info', 'metaRobots', b.metaRobots || null, c.metaRobots || null);
  if (!b.nofollow && c.nofollow) add('nofollow-added', 'warning', 'metaRobots', b.metaRobots || null, c.metaRobots || null);

  // 4) JSON-LD schema lost — esp. answer-surface schema that earns rich results.
  const bTypes = new Set(arr(b.jsonLdTypes)), cTypes = new Set(arr(c.jsonLdTypes));
  for (const t of bTypes) {
    if (!cTypes.has(t)) {
      if (ANSWER_SCHEMA.has(t)) add('answer-schema-lost', 'warning', 'jsonLdTypes', t, null);
      else add('schema-type-lost', 'info', 'jsonLdTypes', t, null);
    }
  }
  for (const t of cTypes) if (!bTypes.has(t)) add('schema-type-added', 'info', 'jsonLdTypes', null, t);

  // 5) H1 changed (or count changed) — primary on-page signal.
  const bH1 = arr(b.h1), cH1 = arr(c.h1);
  if (norm(bH1[0]) !== norm(cH1[0]) && (bH1.length || cH1.length)) add('h1-changed', 'warning', 'h1', bH1[0] || null, cH1[0] || null);
  if (bH1.length !== cH1.length) add('h1-count-changed', 'info', 'h1', bH1.length, cH1.length);

  // 6) Title changed.
  if (norm(b.title) !== norm(c.title) && (norm(b.title) || norm(c.title))) add('title-changed', 'warning', 'title', b.title || null, c.title || null);

  // 7) Meta description changed.
  if (norm(b.metaDescription) !== norm(c.metaDescription) && (norm(b.metaDescription) || norm(c.metaDescription))) add('meta-description-changed', 'info', 'metaDescription', b.metaDescription || null, c.metaDescription || null);

  // 8) Open Graph tags removed / changed.
  for (const f of ['ogTitle', 'ogDescription', 'ogImage']) {
    if (norm(b[f]) && !norm(c[f])) add('og-removed', 'info', f, b[f], null);
    else if (norm(b[f]) !== norm(c[f]) && norm(c[f])) add('og-changed', 'info', f, b[f] || null, c[f]);
  }

  // 9) Word count dropped > 30% — likely a truncated/broken render or thin-content regression.
  const bw = Number(b.wordCount) || 0, cw = Number(c.wordCount) || 0;
  if (bw >= 50 && cw < bw * 0.7) add('wordcount-dropped', 'warning', 'wordCount', bw, cw);
  else if (bw >= 50 && cw > bw * 1.5) add('wordcount-spiked', 'info', 'wordCount', bw, cw);

  // 10) Content hash changed — the body copy moved (catch-all, low severity).
  if (norm(b.contentHash) && norm(c.contentHash) && b.contentHash !== c.contentHash) add('content-changed', 'info', 'contentHash', b.contentHash, c.contentHash);

  let severity = 'none';
  for (const ch of changes) if (SEV_RANK[ch.severity] > SEV_RANK[severity]) severity = ch.severity;
  return { severity, changes };
}

// ---- 3) Baseline persistence (PostgREST, graceful) -------------------------
export async function saveBaseline(siteId, url, snapshot) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE missing).' };
  const row = {
    site_id: siteId || null,
    url,
    snapshot,
    content_hash: (snapshot && snapshot.contentHash) || null,
    created_at: new Date().toISOString(),
  };
  try {
    const res = await fetch(`${SB}/rest/v1/drift_baselines?on_conflict=site_id,url`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify([row]),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return NOT_PROVISIONED;
      return { error: `drift_baselines upsert → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { saved: true, baseline: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export async function getBaseline(siteId, url) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE missing).' };
  const sidFilter = siteId ? `site_id=eq.${encodeURIComponent(siteId)}` : 'site_id=is.null';
  try {
    const res = await fetch(`${SB}/rest/v1/drift_baselines?${sidFilter}&url=eq.${encodeURIComponent(url)}&select=*&limit=1`, { headers: headers() });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return NOT_PROVISIONED;
      return { error: `drift_baselines read → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
    return { baseline: Array.isArray(data) ? (data[0] || null) : (data || null) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ---- 4) checkDrift ---------------------------------------------------------
// Snapshot the page; if there is no baseline yet, store one and report it set.
// Otherwise diff against the baseline and (optionally) refresh it.
export async function checkDrift(siteId, url, { updateBaseline = false } = {}) {
  const snapshot = await snapshotPage(url);

  const got = await getBaseline(siteId, url);
  if (got && got.notProvisioned) return { ...NOT_PROVISIONED, snapshot };
  if (got && got.error && !('baseline' in got)) return { error: got.error, snapshot };

  const existing = got && got.baseline;
  if (!existing) {
    const saved = await saveBaseline(siteId, url, snapshot);
    if (saved && saved.notProvisioned) return { ...NOT_PROVISIONED, snapshot };
    return { baselineSet: true, snapshot, saved: !!(saved && saved.saved) };
  }

  const drift = diffSnapshots(existing.snapshot, snapshot);

  let rebaselined = false;
  if (updateBaseline) {
    const saved = await saveBaseline(siteId, url, snapshot);
    rebaselined = !!(saved && saved.saved);
  }

  return { drift, baselineAt: existing.created_at, snapshot, rebaselined };
}

export default { snapshotPage, diffSnapshots, saveBaseline, getBaseline, checkDrift };
