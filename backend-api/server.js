// ===========================================================================
// Sentinel API server — thin HTTP layer over the existing wp-seo-agent engine.
// Zero external deps (Node built-in http) so there's no build/native risk.
//
// It exposes the engine's read-only audits, Rank Math reads, crawl, PSI, and
// the DRY_RUN-guarded write/apply/rollback to the frontend. Per-request site
// credentials are passed in (the frontend/Supabase owns secret storage), so the
// server is stateless and can serve multiple WordPress accounts.
// ===========================================================================
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WordPressClient } from '../src/wp/client.js';
import { getHead, parseHead } from '../src/wp/rankmath.js';
import { runPsiBatch, runPsiDetailed, runPsiMedian } from '../src/lib/psi.js';
import { discoverUrls, findOrphans } from '../src/lib/crawler.js';
import { prioritize } from '../src/lib/prioritize.js';
import { prioritizeFindings } from './prioritization.js';
import { auditHtml } from '../src/phases/04-seo.js';
import { detectStack } from './detect.js';
import { auditPage, proposeFromFinding } from './audit-pipeline.js';
import { db, credsForSite } from './supabase.js';
import * as claude from './claude.js';
import * as geo from './geo.js';
// Keyword/competitor data now comes from DataForSEO (pay-as-you-go) instead of
// SEMrush. The `semrush` alias is kept so existing call sites are unchanged;
// the module exposes the identical interface + return shapes.
import * as semrush from './dataforseo.js';
import * as airtable from './airtable.js';
import * as chatbot from './chat.js';
import * as gsc from './gsc.js';
import * as gscIndex from './gsc-index.js';
import { detectGscDaily, detectAuditHistory } from './anomaly.js';
import * as tv from './traffic-value.js';
import { correlationMatrix } from './correlation.js';
import { suggestForSite as suggestInternalLinks } from './internal-links.js';
import { generatePageSchema } from './schema-gen.js';
import { generateCssFixes } from './css-fixes.js';
import { findOpportunities } from './content-opportunities.js';
import * as research from './research.js';
import * as imageOpt from './image-optimize.js';
import * as prompts from './prompts.js';
import * as perplexity from './perplexity.js';

// Resolve credentials for an operation: prefer a stored siteId (secure — secret
// decrypted server-side), fall back to creds in the body (initial connect only).
async function resolveCreds(body) {
  if (body.siteId) {
    const { baseUrl, username, appPassword, site } = await credsForSite(body.siteId);
    return { creds: { baseUrl, username, appPassword }, site };
  }
  if (body.creds) return { creds: body.creds, site: null };
  throw new Error('No siteId or creds provided');
}

// Koyeb (and most PaaS) inject PORT; fall back to API_PORT then 8787 for local.
const PORT = Number(process.env.PORT || process.env.API_PORT || 8787);

// Static frontend (web/) so a single service serves the console + API in prod.
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};
async function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = normalize(join(WEB_DIR, p));
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': STATIC_MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) {
    // SPA-ish fallback: unknown GET paths → index.html (so deep links work).
    try { const idx = await readFile(join(WEB_DIR, 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(idx); }
    catch (_) { res.writeHead(404); res.end('Not found'); }
  }
}

// --- tiny helpers ----------------------------------------------------------
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-creds',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

// ── Google OAuth helpers (interactive "Connect with Google" flow) ──────────
const OAUTH_SECRET = process.env.SITE_SECRET_KEY || 'sentinel-dev-key';
// Public origin used to build the OAuth redirect URI. Behind a PaaS proxy we
// derive it from forwarded headers; PUBLIC_BASE_URL overrides (set it in prod to
// match the redirect URI registered on the Google OAuth client).
function publicOrigin(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}
const gscRedirectUri = (req) => `${publicOrigin(req)}/gsc-oauth-callback`;
// Signed, time-bounded state so the callback can trust the siteId it carries.
function signState(siteId) {
  const payload = `${siteId}.${Date.now()}`;
  const sig = createHmac('sha256', OAUTH_SECRET).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}
function verifyState(state) {
  try {
    const raw = Buffer.from(state, 'base64url').toString();
    const i = raw.lastIndexOf('.');
    const payload = raw.slice(0, i);
    const sig = raw.slice(i + 1);
    const expect = createHmac('sha256', OAUTH_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const [siteId, ts] = payload.split('.');
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null; // 10-min window
    return siteId;
  } catch (e) { return null; }
}

// Shift a YYYY-MM-DD date string by N days (UTC), returning YYYY-MM-DD.
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}

// Build a WP client from per-request credentials (never stored server-side).
function clientFrom(creds) {
  if (!creds?.baseUrl || !creds?.username || !creds?.appPassword) {
    throw new Error('Missing site credentials (baseUrl, username, appPassword)');
  }
  return new WordPressClient({
    baseUrl: creds.baseUrl,
    username: creds.username,
    appPassword: creds.appPassword,
  });
}

// Representative sample inputs for the "Test this prompt" preview. Each runs the
// prompt as the SYSTEM with this user message, on the right engine.
const PROMPT_SAMPLES = {
  'content.rules': { engine: 'claude', user: 'Write a meta description (140-160 characters) for a UK page titled "Divorce Solicitors London | Go Legal". Output only the meta description.' },
  'content.cluster': { engine: 'claude', user: 'Site: Go Legal. Niche: UK legal.\nKeywords (with volume):\ndivorce solicitor (9900)\ndivorce lawyer (8100)\nmake a will (3300)\nwill writing service (2400)\nemployment solicitor (1800)\nReturn the clustered JSON.' },
  'content.brief': { engine: 'claude', user: 'KEYWORD: uk evisa login\nINTENT: informational\n\n=== GROUNDED SUMMARY ===\nAn eVisa is a digital immigration status replacing BRPs. Users sign in to a UKVI account with their document, DOB and contact details.\n\n=== SOURCES ===\n[1] GOV.UK — https://www.gov.uk/evisa\n\n=== INTERNAL-LINK CANDIDATES ===\nUK visa fees → /visa-fees\n\nWrite the UK content brief as JSON.' },
  'research.ukScope': { engine: 'perplexity', user: 'Briefly: what is the standard processing time and fee for a passport renewal?' },
  'research.gather': { engine: 'perplexity', user: 'Topic: UK skilled worker visa\n\nGive the key current facts, recent changes, and main questions UK readers ask.' },
  'research.trending': { engine: 'perplexity', user: 'Niche: UK visas and immigration. What is trending in the UK this week?' },
  'research.facts': { engine: 'perplexity', user: 'Topic: UK spouse visa. List the current UK facts most useful to cite.' },
  'seo.internalLinks': { engine: 'claude', user: 'SOURCE PAGE: Divorce process explained (/divorce-process)\n\nSOURCE TEXT: A guide to the UK divorce process, financial settlements and child arrangements.\n\nCANDIDATE TARGET PAGES:\n1. Financial settlement guide → /financial-settlement\n2. Child arrangements → /child-arrangements\n\nReturn the JSON array.' },
  'seo.pageFacts': { engine: 'claude', user: 'URL: /uk-spouse-visa\nTITLE: UK Spouse Visa Guide\n\nPAGE TEXT: The UK spouse visa lets partners of British citizens live in the UK. It is valid for 33 months and requires meeting a financial requirement.\n\nReturn the JSON.' },
  'report.narrate': { engine: 'claude', user: 'Site: Go Legal\n\nComputed metrics:\n{"trafficValue":{"totalEstValue":4200,"currency":"GBP","valueAtRisk":900},"audit":{"latestComposite":78,"delta":-3},"search":{"clicks28":1200}}\n\nWrite the weekly executive briefing.' },
  'plan.project': { engine: 'claude', user: 'Site: Go Legal (https://go-legal.ai)\nNiche: UK legal\nGoals: reach 100/100 Lighthouse + improve content.\nCurrent scores: {"performance":62,"seo":85}\n\nWrite the plan.' },
  'chat.assistant': { engine: 'claude', user: 'Give me one concrete, high-impact SEO action for my UK legal site this week.' },
};

// --- route handlers --------------------------------------------------------
const routes = {
  // Health check
  'GET /health': async () => ({ ok: true, engine: 'wp-seo-agent', version: '2.0' }),

  // SECURE multi-site connect: validate creds → detect stack → store the site
  // with the app password ENCRYPTED in Supabase → return the new site (no secret).
  // This is the canonical "Add a WordPress account" path. Generic for any site.
  'POST /site-connect': async (body) => {
    const creds = body.creds;
    if (!creds?.baseUrl || !creds?.username || !creds?.appPassword) {
      throw new Error('Provide baseUrl, username, appPassword');
    }
    const wp = clientFrom(creds);
    const me = await wp.whoAmI();                         // validates auth
    const det = await detectStack(wp, creds.baseUrl).catch(() => ({}));
    const host = creds.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const name = body.name || host;
    const row = {
      name, url: creds.baseUrl, username: creds.username,
      staging_url: body.staging || null,
      glyph: (name[0] || '?').toUpperCase(),
      favicon: body.favicon || '#1A746B',
      status: 'connected',
      role: (me.roles && me.roles[0]) || '—',
      // Write-armed by default so the agent can carry out approved fixes. The
      // human approval gate + kill switch + verify-after-write remain the real
      // guards — nothing writes without an explicit approve→apply.
      write_armed: body.writeArmed === false ? false : true,
      mu_plugin: !!det.muPlugin, selftest: det.selftest || 'missing',
      stack: det.stack || null, scale: det.scale || null, caps: det.caps || null,
    };
    let site;
    if (body.siteId) site = await db.updateSite(body.siteId, row);
    else site = await db.createSite(row);
    await db.setSecret(site.id, creds.appPassword);        // encrypt at rest
    await db.logActivity({ site_id: site.id, type: 'connection', actor: 'You', icon: 'link',
      text: (body.siteId ? 'Re-authenticated ' : 'Connected ') + name, meta: 'role: ' + row.role });
    return { site, user: { id: me.id, name: me.name, roles: me.roles } };
  },

  // Validate connection + return the authenticated user (wp:check)
  'POST /connect': async (body) => {
    const wp = clientFrom(body.creds);
    const me = await wp.whoAmI();
    return { ok: true, user: { id: me.id, name: me.name, roles: me.roles } };
  },

  // Auto-detect the site's stack (theme, builder, SEO/cache/image/security plugins, scale)
  'POST /detect': async (body) => {
    const wp = clientFrom(body.creds);
    return detectStack(wp, body.creds.baseUrl);
  },

  // Crawl the sitemap → URL list (+ optional orphans)
  'POST /crawl': async (body) => {
    const { urls, indexUrl } = await discoverUrls({ baseUrl: body.creds.baseUrl });
    let orphans = null;
    if (body.orphans) orphans = await findOrphans(urls, { sampleLimit: 120 });
    return { indexUrl, count: urls.length, urls, orphans };
  },

  // Full audit of one page → scores + findings + draft proposals (UI shapes).
  // withContent=true → Claude drafts real meta/title values into proposals.
  'POST /audit-full': async (body) => {
    return auditPage(body.url, { creds: body.creds, withContent: !!body.withContent });
  },

  // Single finding → one draft proposal (the "Propose fix" button)
  'POST /propose-fix': async (body) => {
    return { proposal: proposeFromFinding(body.finding || {}) };
  },

  // PSI scoring for a set of URLs (defaults to the provided list)
  'POST /psi': async (body) => {
    const urls = body.urls || [];
    const results = await runPsiBatch(urls, {
      strategy: body.strategy || 'mobile',
      key: process.env.PSI_KEY,
      concurrency: 3,
    });
    return { results };
  },

  // Median-of-N PSI: runs PageSpeed n times (default 3), returns median scores
  // + IQR (run-to-run noise band) so trends/deltas aren't plotting variance.
  'POST /psi-median': async (body) => {
    const urls = body.urls || (body.url ? [body.url] : []);
    const n = Math.min(Math.max(parseInt(body.n, 10) || 3, 1), 5);
    const strategy = body.strategy || 'mobile';
    const results = [];
    for (const url of urls) {
      try {
        results.push(await runPsiMedian(url, { strategy, n, key: process.env.PSI_KEY }));
      } catch (e) {
        results.push({ url, strategy, error: String(e && e.message || e) });
      }
    }
    return { results };
  },

  // Detailed single-URL PSI (opportunities + failing audits with selectors)
  'POST /psi-detail': async (body) => {
    return runPsiDetailed(body.url, {
      strategy: body.strategy || 'mobile',
      categories: body.categories || ['performance', 'accessibility', 'best-practices', 'seo'],
      key: process.env.PSI_KEY,
    });
  },

  // Read on-page SEO for a URL (HTML fallback — works without Rank Math headless)
  'POST /seo-read': async (body) => {
    const res = await fetch(body.url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
    const html = await res.text();
    const head = parseHead(html);
    const audit = auditHtml(body.url, html);
    return { head, findings: audit.findings, proposals: audit.proposals };
  },

  // Rank Math getHead (if the site has Headless CMS Support enabled)
  'POST /rankmath-head': async (body) => {
    return getHead(body.url, { baseUrl: body.creds.baseUrl });
  },

  // Prioritize audit results by impact = traffic × gap
  'POST /prioritize': async (body) => {
    return { ranked: prioritize(body.results || [], { traffic: body.traffic || {} }) };
  },

  // RICE-style finding prioritization: (Reach × Impact × Confidence) / Effort.
  // Reach is injected from real GSC clicks-per-page when connected, so the
  // worklist reflects business value, not just Lighthouse savings. Returns a
  // ranked list + impact×effort scatter points + quadrant counts.
  'POST /prioritize-findings': async (body) => {
    const siteId = body.siteId;
    // Source findings: client-supplied, else the latest stored audit.
    let findings = Array.isArray(body.findings) ? body.findings : null;
    if (!findings && siteId) {
      try {
        const audits = await db.listAudits(siteId, 1).catch(() => []);
        // listAudits selects scores/cwv only; fetch findings separately.
        const rows = await fetch(`${process.env.SUPABASE_URL}/rest/v1/audits?site_id=eq.${siteId}&select=findings&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
        findings = (rows && rows[0] && rows[0].findings) || [];
      } catch (e) { findings = []; }
    }
    findings = findings || [];
    if (!findings.length) return { error: 'No findings to prioritize — run an audit first.', ranked: [], empty: true };

    // Build trafficByPage (path → clicks) from GSC, if connected.
    let trafficByPage = null;
    try {
      const saStr = siteId ? await db.getGscSa(siteId).catch(() => null) : null;
      const site = siteId ? await db.getSite(siteId).catch(() => null) : null;
      const property = site && site.gsc_property;
      if (saStr && property) {
        const snap = await gsc.snapshot(JSON.parse(saStr), property, { days: 28 });
        trafficByPage = {};
        for (const p of (snap.topPages || [])) {
          let path = p.page; try { path = new URL(p.page).pathname; } catch (e) {}
          trafficByPage[path] = (trafficByPage[path] || 0) + (p.clicks || 0);
        }
      }
    } catch (e) { /* GSC optional */ }

    const ranked = prioritizeFindings(findings, { trafficByPage });
    const quadrants = ranked.reduce((m, it) => { m[it.quadrant] = (m[it.quadrant] || 0) + 1; return m; }, {});
    return { ranked, quadrants, hasTraffic: !!trafficByPage, count: ranked.length };
  },

  // ── GEO / AI-citation tracking ────────────────────────────────────────
  // Suggest a buyer-intent prompt set for a site (Claude).
  'POST /geo-prompts': async (body) => {
    const titles = body.sampleTitles || [];
    const prompts = await geo.suggestPrompts({ siteName: body.siteName, niche: body.niche, sampleTitles: titles });
    return { prompts };
  },

  // Run a citation-tracking pass: query prompts via Claude+web-search, detect
  // whether the domain is cited, compute share-of-AI-voice vs competitors.
  'POST /geo-track': async (body) => {
    const out = await geo.runCitationTracking({
      targetDomain: body.targetDomain,
      prompts: body.prompts || [],
      competitors: body.competitors || [],
    });
    // Persist the run + the prompt set.
    if (body.siteId) {
      try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/geo_runs`, {
          method: 'POST',
          headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ site_id: body.siteId, engine: 'claude', share_of_voice: out.shareOfVoice, prompts_total: out.promptsTotal, prompts_cited: out.promptsCited, results: out.results, competitors: out.competitors }),
        });
      } catch (e) { /* best-effort persist */ }
    }
    return out;
  },

  // GEO enablement: generate llms.txt + AI-bot robots + (optional) write them.
  'POST /geo-enable': async (body) => {
    const { creds, site } = await resolveCreds(body);
    const base = creds.baseUrl.replace(/\/$/, '');
    const llms = geo.buildLlmsTxt({ siteName: body.siteName || (site && site.name), baseUrl: base, summary: body.summary, pages: body.pages || [] });
    const robots = geo.buildAiRobots({ allow: body.allow !== false, sitemapUrl: base + '/sitemap_index.xml' });
    return { llmsTxt: llms, aiRobots: robots, note: 'Review, then publish llms.txt at site root and merge the robots rules.' };
  },

  // ── DataForSEO ────────────────────────────────────────────────────────────
  'POST /semrush-snapshot': async (body) => {
    if (!semrush.hasKey()) return { error: 'DataForSEO not configured (set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)', needsKey: true };
    const domain = (body.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    // Pre-check units so we can return a clear error instead of blank arrays.
    const units = await semrush.apiUnits();
    if (units != null && units < 30) {
      return { error: `DataForSEO API units too low (${units} left) to load a full snapshot — top up your DataForSEO plan.`, noUnits: true, unitsRemaining: units };
    }
    let snap;
    try { snap = await semrush.fullSnapshot(domain, { db: body.db || 'uk' }); }
    catch (e) {
      if (e.code === 'NO_UNITS') { const u = await semrush.apiUnits(); return { error: `DataForSEO API units exhausted (${u} left).`, noUnits: true, unitsRemaining: u }; }
      return { error: 'DataForSEO: ' + e.message };
    }
    // If the overview is empty (domain not in DataForSEO DB), say so.
    if (!snap.overview && (!snap.topKeywords || !snap.topKeywords.length)) {
      return { error: `No DataForSEO data found for ${domain} in the ${(body.db || 'uk').toUpperCase()} database. The domain may have little organic presence or be in a different region.`, empty: true, ...snap };
    }
    if (body.siteId) {
      try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/semrush_snapshots`, {
          method: 'POST',
          headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ site_id: body.siteId, domain, kind: 'snapshot', payload: snap }),
        });
      } catch (e) {}
    }
    return snap;
  },

  // Traffic-value modeling: rankings → £. estClicks = volume × CTR(position);
  // value = estClicks × CPC. CTR curve is calibrated from the site's own GSC
  // CTR-by-position when connected (else a sensible default curve). Reuses
  // client-supplied keywords to avoid spending DataForSEO units; fetches only if
  // none provided AND units allow.
  'POST /traffic-value': async (body) => {
    const currency = (body.db === 'us' ? 'USD' : 'GBP');
    // 1) Calibrate the CTR curve from GSC, if connected (free, per-site).
    let curve = tv.DEFAULT_CTR, curveSource = 'default';
    try {
      const saStr = await db.getGscSa(body.siteId).catch(() => null);
      const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
      const property = site && site.gsc_property;
      if (saStr && property) {
        const snap = await gsc.snapshot(JSON.parse(saStr), property, { days: 28 });
        const cal = tv.calibrateCurve(snap.topQueries || [], { minImpr: 50 });
        curve = cal.curve; curveSource = cal.source;
      }
    } catch (e) { /* fall back to default curve */ }

    // 2) Source the keyword list. Prefer client-supplied (already paid for).
    let keywords = Array.isArray(body.keywords) ? body.keywords : null;
    if (!keywords) {
      if (!semrush.hasKey()) return { error: 'No keywords supplied and DataForSEO not configured.', needsKey: true };
      const units = await semrush.apiUnits();
      if (units != null && units < 30) return { error: `No cached keywords and DataForSEO units too low (${units} left) to fetch them. Load the DataForSEO tab first, or top up units.`, noUnits: true, unitsRemaining: units };
      const domain = (body.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      try { const snap = await semrush.fullSnapshot(domain, { db: body.db || 'uk' }); keywords = snap.topKeywords || []; }
      catch (e) { if (e.code === 'NO_UNITS') { const u = await semrush.apiUnits(); return { error: `DataForSEO units exhausted (${u} left).`, noUnits: true }; } return { error: 'DataForSEO: ' + e.message }; }
    }
    if (!keywords.length) return { error: 'No keywords available to model traffic value. Load DataForSEO data first.', empty: true };

    // 3) Value + summarize.
    const valued = tv.valueKeywords(keywords, { curve });
    const summary = tv.summarize(valued, { currency });
    // Striking-distance uplift (page-2 → page-1 value at stake).
    const striking = valued.filter((k) => k.position >= 10.5 && k.position <= 20.5)
      .map((k) => ({ ...k, uplift: tv.upliftValue(k, { curve, targetPos: 3 }) }))
      .sort((a, b) => b.uplift.gainValue - a.uplift.gainValue).slice(0, 15);
    return { currency, curveSource, summary, keywords: valued.slice(0, 50), striking };
  },

  // Striking-distance keywords (positions 11-20) — fastest page-1 wins.
  'POST /semrush-striking': async (body) => {
    if (!semrush.hasKey()) return { error: 'DataForSEO not configured (set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)', needsKey: true };
    const t = (body.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    try {
      return await semrush.strikingDistance(t, { db: body.db || 'uk', limit: body.limit || 30 });
    } catch (e) {
      if (e.code === 'NO_UNITS') { const u = await semrush.apiUnits(); return { error: 'DataForSEO API units exhausted', unitsRemaining: u, noUnits: true }; }
      throw e;
    }
  },

  // Remaining DataForSEO API units (for showing a balance in the UI).
  'POST /semrush-units': async () => {
    if (!semrush.hasKey()) return { units: null, needsKey: true };
    return { units: await semrush.apiUnits() };
  },

  'POST /semrush-keyword-gap': async (body) => {
    if (!semrush.hasKey()) return { error: 'DataForSEO not configured (set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)', needsKey: true };
    const t = (body.target || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let negatives = body.negatives || [];
    let competitors = body.competitors || (body.competitor ? [body.competitor] : []);
    // If a siteId is given, merge the site's saved competitors + negative keywords.
    if (body.siteId) {
      const site = await db.getSite(body.siteId).catch(() => null);
      if (site) {
        if (!competitors.length && Array.isArray(site.competitors)) competitors = site.competitors;
        if (Array.isArray(site.negative_keywords)) negatives = [...negatives, ...site.negative_keywords];
      }
    }
    competitors = competitors.map((c) => (c || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    if (!competitors.length) return { error: 'No competitor set for this site. Add a competitor below first.', gaps: [] };
    // Pre-check units (gap needs ~2 pulls per competitor).
    const units = await semrush.apiUnits();
    if (units != null && units < 40) {
      return { error: `DataForSEO API units too low (${units} left) for a keyword-gap analysis — top up your DataForSEO plan.`, noUnits: true, unitsRemaining: units, gaps: [] };
    }
    // Run the gap for each competitor, merge + dedupe (keep highest volume).
    const map = new Map(); let unitsErr = false;
    for (const c of competitors) {
      try {
        const r = await semrush.keywordGap(t, c, { db: body.db || 'uk', limit: 120, negatives, extraBrands: competitors.filter((x) => x !== c) });
        for (const g of r.gaps) { const k = g.keyword.toLowerCase(); if (!map.has(k) || map.get(k).volume < g.volume) map.set(k, { ...g, competitor: c }); }
      } catch (e) { if (e.code === 'NO_UNITS') { unitsErr = true; break; } }
    }
    if (unitsErr && map.size === 0) { const u = await semrush.apiUnits(); return { error: `DataForSEO API units exhausted (${u} left).`, noUnits: true, unitsRemaining: u, gaps: [] }; }
    const gaps = [...map.values()].sort((a, b) => b.volume - a.volume).slice(0, body.limit || 80);
    return { target: t, competitors, gapCount: gaps.length, gaps };
  },

  // ── Agentic AI assistant ─────────────────────────────────────────────────
  // Site-aware with LIVE tools + image input + resumable history.
  'POST /chat': async (body) => {
    const r = await chatbot.chat({
      messages: body.apiHistory || body.messages || [],
      userText: body.text, images: body.images || [], siteId: body.siteId,
    });
    // Persist to a conversation (create or update). Stores both the UI-facing
    // display messages and the full Claude api_history for perfect resume.
    let convoId = body.conversationId;
    try {
      if (body.siteId) {
        const display = body.displayMessages || [];
        if (!convoId) {
          const title = (body.text || 'New chat').slice(0, 60);
          const c = await db.createConversation(body.siteId, title);
          convoId = c.id;
        }
        await db.saveConversation(convoId, {
          messages: [...display, { role: 'assistant', text: r.reply, tools: r.toolsUsed || [] }],
          apiHistory: r.messages,
          messageCount: (display.length || 0) + 1,
        });
      }
    } catch (e) { /* persistence best-effort */ }
    return { ...r, conversationId: convoId };
  },

  // List a site's saved conversations (for the history sidebar).
  'POST /chat-list': async (body) => {
    return { conversations: await db.listConversations(body.siteId).catch(() => []) };
  },
  // Load one conversation fully (messages + api_history for resume).
  'POST /chat-load': async (body) => {
    const c = await db.getConversation(body.conversationId).catch(() => null);
    return { conversation: c };
  },
  'POST /chat-delete': async (body) => {
    await db.deleteConversation(body.conversationId).catch(() => {});
    return { ok: true };
  },
  'POST /chat-rename': async (body) => {
    await db.saveConversation(body.conversationId, { title: body.title }).catch(() => {});
    return { ok: true };
  },

  // Image upload proxy: browser sends base64; we store in Supabase Storage and
  // return a public URL (kept out of the JSON so conversations stay light).
  'POST /chat-upload-image': async (body) => {
    const { dataUrl } = body;
    if (!dataUrl) throw new Error('No image data');
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('Invalid image data URL');
    const mime = m[1]; const buf = Buffer.from(m[2], 'base64');
    const ext = mime.split('/')[1];
    const name = `${body.siteId || 'x'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/chat-images/${name}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': mime },
      body: buf,
    });
    if (!res.ok) throw new Error('Upload failed: ' + (await res.text()).slice(0, 120));
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/chat-images/${name}`;
    return { url };
  },

  // ── Google Search Console ────────────────────────────────────────────────
  // Connect: validate the service-account JSON, store encrypted, list properties.
  'POST /gsc-connect': async (body) => {
    let sa;
    try { sa = typeof body.serviceAccount === 'string' ? JSON.parse(body.serviceAccount) : body.serviceAccount; }
    catch (e) { return { error: 'Invalid JSON — paste the full service-account key file.' }; }
    if (!sa || !sa.client_email) return { error: 'That doesn\'t look like a service-account key (missing client_email).' };
    let sites;
    try { sites = await gsc.listSites(sa); }
    catch (e) { return { error: e.message }; }
    await db.setGscSa(body.siteId, JSON.stringify(sa));
    return { ok: true, serviceAccountEmail: sa.client_email, properties: sites };
  },

  // Save the chosen GSC property for a site.
  'POST /gsc-set-property': async (body) => {
    await db.updateSite(body.siteId, { gsc_property: body.property });
    return { ok: true };
  },

  // Status: is GSC connected + which property + auth method.
  'POST /gsc-status': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    const site = await db.getSite(body.siteId).catch(() => null);
    let method = null, email = null;
    if (saStr) { try { const c = JSON.parse(saStr); method = c.refresh_token ? 'oauth' : 'service_account'; email = c.email || c.client_email || null; } catch (e) {} }
    return { connected: !!saStr, property: site && site.gsc_property, method, email, oauthAvailable: gsc.oauthConfigured() };
  },

  // Whether one-click Google sign-in is available on this server (client id/secret set).
  'POST /gsc-oauth-config': async () => ({ configured: gsc.oauthConfigured() }),

  // List the GSC properties the stored credential (OAuth or SA) can access.
  // Used by the UI after the one-click OAuth popup completes.
  'POST /gsc-properties': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected for this site.', needsConnect: true };
    try { return { properties: await gsc.listSites(JSON.parse(saStr)) }; }
    catch (e) { return { error: e.message }; }
  },

  // Disconnect: drop the stored credential + selected property.
  'POST /gsc-disconnect': async (body) => {
    await db.setGscSa(body.siteId, '').catch(() => {});
    await db.updateSite(body.siteId, { gsc_property: null }).catch(() => {});
    return { ok: true };
  },

  // Pull a GSC snapshot (totals, top queries/pages, daily series, striking).
  // Persists the daily series into gsc_daily for trend/anomaly analysis.
  'POST /gsc-snapshot': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected for this site.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = body.property || (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected. Pick one after connecting.', needsProperty: true };
    let snap;
    try { snap = await gsc.snapshot(JSON.parse(saStr), property, { days: body.days || 28 }); }
    catch (e) { if (e.code === 'NO_ACCESS') return { error: e.message, noAccess: true }; return { error: e.message }; }
    // Persist daily series (best-effort) for time-series analysis.
    try {
      const rows = (snap.daily || []).map((d) => ({ site_id: body.siteId, date: d.date, dim: 'date', clicks: d.clicks, impressions: d.impressions, ctr: d.ctr, position: d.position }));
      if (rows.length) {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/gsc_daily`, {
          method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json' },
          body: JSON.stringify(rows),
        });
      }
    } catch (e) {}
    return snap;
  },

  // Anomaly detection on GSC daily series: flags click DROPS + position RISES
  // beyond the run-of-the-mill (robust modified-z ≥ 3.5). Catches Google-update
  // hits / tracking breaks within days. Feeds the activity feed + chatbot.
  'POST /gsc-anomalies': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected for this site.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = body.property || (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected. Pick one after connecting.', needsProperty: true };
    let snap;
    // Need a longer window so the trailing baseline has history (default 90d).
    try { snap = await gsc.snapshot(JSON.parse(saStr), property, { days: body.days || 90 }); }
    catch (e) { if (e.code === 'NO_ACCESS') return { error: e.message, noAccess: true }; return { error: e.message }; }
    const result = detectGscDaily(snap.daily || [], { window: body.window || 14, threshold: body.threshold || 3.5 });
    return { property, days: body.days || 90, ...result };
  },

  // ── GSC Index Health (auto-index, de-index detection, ranking drops) ────
  // Shared resolver for the GSC service account + property.
  // Auto-submit URLs to Google's Indexing API (beyond the manual 10/day limit).
  'POST /gsc-submit-urls': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected.', needsConnect: true };
    let urls = Array.isArray(body.urls) ? body.urls : [];
    // If none supplied, pull recent WP content (posts+pages) as the candidate set.
    if (!urls.length) {
      try {
        const { baseUrl, username, appPassword } = await credsForSite(body.siteId);
        const wp = new WordPressClient({ baseUrl, username, appPassword });
        const [pg, ps] = await Promise.all([
          wp.list('pages', { perPage: 50, fields: 'link' }).catch(() => []),
          wp.list('posts', { perPage: 50, fields: 'link' }).catch(() => []),
        ]);
        urls = [...pg, ...ps].map((r) => r.link).filter(Boolean);
      } catch (e) {}
    }
    if (!urls.length) return { error: 'No URLs to submit.' };
    try { return await gscIndex.submitUrls(JSON.parse(saStr), urls, { type: body.type || 'URL_UPDATED' }); }
    catch (e) { return { error: 'Indexing API: ' + e.message + ' — ensure the Indexing API is enabled and the service account is an OWNER of the property.' }; }
  },

  // Detect which top pages are NOT indexed (URL Inspection API).
  'POST /gsc-index-health': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = body.property || (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected.', needsProperty: true };
    try { return await gscIndex.indexHealth(JSON.parse(saStr), property, { limit: body.limit || 40 }); }
    catch (e) { if (e.code === 'NO_ACCESS') return { error: e.message, noAccess: true }; return { error: e.message }; }
  },

  // Surface queries whose ranking has dropped (refresh candidates).
  'POST /gsc-ranking-drops': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = body.property || (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected.', needsProperty: true };
    try { return await gscIndex.rankingDrops(JSON.parse(saStr), property, { windowDays: body.windowDays || 28 }); }
    catch (e) { return { error: e.message }; }
  },

  // Anomaly detection on this site's audit composite-score history (regression watch).
  'POST /audit-anomalies': async (body) => {
    const history = body.history || [];
    if (!history.length) return { error: 'No audit history to analyze yet.', points: [], anomalies: [] };
    return detectAuditHistory(history, { window: body.window || 8, threshold: body.threshold || 3.5 });
  },

  // Correlation analysis: does fixing CWV/scores actually move THIS site's
  // rankings? Joins audit PSI/CWV history with GSC daily position+clicks by date,
  // then computes a Spearman correlation matrix. Strictly correlational + small-n
  // aware — the UI labels it as such.
  'POST /correlation': async (body) => {
    const siteId = body.siteId;
    if (!siteId) return { error: 'No site selected.' };
    let audits = [];
    try { audits = await db.listAudits(siteId, 300); } catch (e) { return { error: 'Could not load audit history: ' + e.message }; }
    if (!audits || audits.length < 3) return { error: 'Not enough audit history yet — run audits over time to build a correlation panel.', n: audits ? audits.length : 0, insufficient: true };

    // Pull GSC daily (if connected) to join rankings/clicks onto audit dates.
    let dailyByDate = {};
    try {
      const saStr = await db.getGscSa(siteId).catch(() => null);
      const site = await db.getSite(siteId).catch(() => null);
      const property = site && site.gsc_property;
      if (saStr && property) {
        const snap = await gsc.snapshot(JSON.parse(saStr), property, { days: body.days || 90 });
        for (const d of (snap.daily || [])) dailyByDate[d.date] = d;
      }
    } catch (e) { /* GSC optional — fall back to internal-only correlations */ }
    const hasGsc = Object.keys(dailyByDate).length > 0;

    // Build the observation panel. Each audit → one row; join the GSC row on the
    // same calendar date when available (GSC lags ~2-3d, so also try ±1 day).
    const panel = audits.map((a) => {
      const date = (a.created_at || '').slice(0, 10);
      let g = dailyByDate[date];
      if (!g) { // nearest within 2 days
        for (let off = 1; off <= 2 && !g; off++) {
          const d1 = shiftDate(date, -off), d2 = shiftDate(date, off);
          g = dailyByDate[d1] || dailyByDate[d2];
        }
      }
      return { scores: a.scores || {}, cwv: a.cwv || {}, gsc: g ? { position: g.position, clicks: g.clicks, ctr: g.ctr } : {} };
    });

    // Metrics — invert "lower is better" so every column reads "higher = better".
    const metrics = [
      { key: 'scores.performance', label: 'Perf score' },
      { key: 'scores.seo', label: 'SEO score' },
      { key: 'scores.accessibility', label: 'A11y score' },
      { key: 'cwv.lcp', label: 'LCP', invert: true },
      { key: 'cwv.tbt', label: 'TBT', invert: true },
      { key: 'cwv.cls', label: 'CLS', invert: true },
    ];
    if (hasGsc) {
      metrics.push({ key: 'gsc.position', label: 'Avg position', invert: true });
      metrics.push({ key: 'gsc.clicks', label: 'Clicks' });
    }
    const result = correlationMatrix(panel, metrics);
    // Highlight CWV/score ↔ ranking pairs specifically (the question that matters).
    const rankingKeys = new Set(['gsc.position', 'gsc.clicks']);
    const rankingPairs = result.pairs.filter((p) => rankingKeys.has(p.aKey) || rankingKeys.has(p.bKey));
    return { ...result, hasGsc, rankingPairs, note: 'Correlational, not causal. CWV is a weak, threshold-style ranking factor; treat small-n results with caution.' };
  },

  // Executive scorecard — ONE deterministic aggregation of everything that
  // matters: organic value, value at risk, SoV, composite-score trend +
  // significance, traffic/ranking anomalies, top decaying pages, and the top of
  // the prioritized worklist. Every number is computed here (never by Claude);
  // missing sources degrade gracefully to null rather than blanking the screen.
  'POST /exec-scorecard': async (body) => {
    const siteId = body.siteId;
    if (!siteId) return { error: 'No site selected.' };
    const site = await db.getSite(siteId).catch(() => null);
    if (!site) return { error: 'Site not found.' };
    const card = { site: { name: site.name, url: site.url }, generatedFor: 'weekly', sources: {} };

    // --- audit composite trend + regression significance ---
    try {
      const audits = await db.listAudits(siteId, 60);
      if (audits && audits.length) {
        const comp = (s) => Math.round((((s || {}).performance || 0) + ((s || {}).accessibility || 0) + ((s || {}).bestPractices || 0) + ((s || {}).seo || 0)) / 4);
        const series = audits.map((a) => ({ ts: a.created_at, composite: comp(a.scores), scores: a.scores }));
        const latest = series[series.length - 1];
        const prev = series.length > 1 ? series[series.length - 2] : null;
        const anomalies = detectAuditHistory(audits.map((a) => ({ ts: a.created_at, scores: a.scores })));
        card.audit = {
          latestComposite: latest.composite,
          prevComposite: prev ? prev.composite : null,
          delta: prev ? latest.composite - prev.composite : null,
          scores: latest.scores,
          trend: series.slice(-12).map((p) => ({ ts: p.ts, composite: p.composite })),
          regressionFlags: anomalies.regressionCount || 0,
          categoryRegressions: (anomalies.categoryEvents || []).slice(0, 5),
        };
        card.sources.audit = true;
      }
    } catch (e) { card.sources.auditError = String(e.message || e); }

    // --- traffic value (from stored DataForSEO snapshot; no fresh units) ---
    try {
      const snaps = await fetch(`${process.env.SUPABASE_URL}/rest/v1/semrush_snapshots?site_id=eq.${siteId}&kind=eq.snapshot&select=payload&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
      const keywords = snaps && snaps[0] && snaps[0].payload && snaps[0].payload.topKeywords;
      if (keywords && keywords.length) {
        // Calibrate CTR from GSC if available.
        let curve = tv.DEFAULT_CTR;
        try {
          const saStr = await db.getGscSa(siteId).catch(() => null);
          if (saStr && site.gsc_property) { const gs = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 }); curve = tv.calibrateCurve(gs.topQueries || [], { minImpr: 50 }).curve; }
        } catch (e) {}
        const valued = tv.valueKeywords(keywords, { curve });
        const summary = tv.summarize(valued, { currency: site.semrush_db === 'us' ? 'USD' : 'GBP' });
        card.trafficValue = { currency: summary.currency, totalEstValue: summary.totalEstValue, totalEstClicks: summary.totalEstClicks, valueAtRisk: summary.page2AtRiskValue, page2Count: summary.page2Count };
        card.sources.trafficValue = true;
      }
    } catch (e) { card.sources.trafficValueError = String(e.message || e); }

    // --- GSC totals + traffic/ranking anomalies ---
    try {
      const saStr = await db.getGscSa(siteId).catch(() => null);
      if (saStr && site.gsc_property) {
        const snap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 90 });
        const totals28 = (snap.daily || []).slice(-28).reduce((m, d) => { m.clicks += d.clicks || 0; m.impressions += d.impressions || 0; return m; }, { clicks: 0, impressions: 0 });
        const anomalies = detectGscDaily(snap.daily || []);
        card.search = {
          clicks28: totals28.clicks,
          impressions28: totals28.impressions,
          anomalyCount: anomalies.events.length,
          anomalies: anomalies.events.slice(0, 5),
          clicksTrend: (snap.daily || []).slice(-28).map((d) => ({ date: d.date, clicks: d.clicks })),
        };
        card.sources.search = true;
      }
    } catch (e) { card.sources.searchError = String(e.message || e); }

    // --- GEO share-of-voice (latest run) ---
    try {
      const runs = await fetch(`${process.env.SUPABASE_URL}/rest/v1/geo_runs?site_id=eq.${siteId}&select=share_of_voice,prompts_cited,prompts_total,created_at&order=created_at.desc&limit=2`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
      if (runs && runs.length) {
        card.geo = { shareOfVoice: runs[0].share_of_voice, promptsCited: runs[0].prompts_cited, promptsTotal: runs[0].prompts_total, prevShareOfVoice: runs[1] ? runs[1].share_of_voice : null };
        card.sources.geo = true;
      }
    } catch (e) { card.sources.geoError = String(e.message || e); }

    // --- prioritized worklist (top quick wins) ---
    try {
      const rows = await fetch(`${process.env.SUPABASE_URL}/rest/v1/audits?site_id=eq.${siteId}&select=findings&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
      const findings = rows && rows[0] && rows[0].findings;
      if (findings && findings.length) {
        const ranked = prioritizeFindings(findings);
        card.worklist = { total: ranked.length, quickWins: ranked.filter((r) => r.quadrant === 'Quick win').length, top: ranked.slice(0, 5).map((r) => ({ title: r.title, page: r.page, priority: r.priority, quadrant: r.quadrant })) };
        card.sources.worklist = true;
      }
    } catch (e) { card.sources.worklistError = String(e.message || e); }

    return card;
  },

  // Executive narrative — Claude writes a weekly briefing OVER the deterministic
  // scorecard. Claude narrates; it never computes a number.
  'POST /exec-narrative': async (body) => {
    const metrics = body.metrics;
    if (!metrics) return { error: 'No metrics supplied. Load the scorecard first.' };
    try {
      const narrative = await claude.narrate({ siteName: (metrics.site && metrics.site.name) || 'this site', metrics });
      return { narrative };
    } catch (e) { return { error: 'Narrative generation failed: ' + e.message }; }
  },

  // Research-backed content brief (UK): Tavily + Perplexity gather live sources,
  // Claude structures a writer-ready brief with cited facts + internal links.
  'POST /content-brief': async (body) => {
    if (!body.keyword) return { error: 'A keyword/cluster is required.' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const excludeDomain = site ? (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') : undefined;
    // Internal-link candidates from the site's real pages (best-effort).
    let internalLinkCandidates = [];
    if (body.siteId) {
      try {
        const { baseUrl, username, appPassword } = await credsForSite(body.siteId);
        const wp = new WordPressClient({ baseUrl, username, appPassword });
        const [pg, ps] = await Promise.all([
          wp.list('pages', { perPage: 100, fields: 'title,link' }).catch(() => []),
          wp.list('posts', { perPage: 100, fields: 'title,link' }).catch(() => []),
        ]);
        internalLinkCandidates = [...pg, ...ps].map((r) => ({ title: (r.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim(), url: r.link })).filter((p) => p.title && p.url);
      } catch (e) {}
    }
    try {
      return await research.contentBrief({
        keyword: body.keyword, intent: body.intent,
        siteName: site && site.name, niche: (site && site.niche) || (site && site.stack && site.stack.type),
        excludeDomain, internalLinkCandidates, now: Date.now(),
      });
    } catch (e) { return { error: 'Brief generation failed: ' + e.message }; }
  },

  // Live UK trending intelligence for a niche (news-weighted), with sources.
  'POST /trending-intel': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const niche = body.niche || (site && site.niche) || (site && site.stack && site.stack.type) || (site && site.name);
    if (!niche) return { error: 'No niche to research.' };
    try { return await research.trendingIntel({ niche, now: Date.now() }); }
    catch (e) { return { error: 'Trending analysis failed: ' + e.message }; }
  },

  // Research-engine status (which keys are configured).
  'POST /research-status': async () => research.status(),

  // ── Prompt admin (editable system prompts, live via Supabase) ───────────
  'POST /prompts-list': async () => ({ prompts: prompts.list(), status: prompts.status() }),
  'POST /prompt-save': async (body) => {
    if (!body.key || body.content == null) return { error: 'key and content required' };
    try { await prompts.save(body.key, body.content, { model: body.model, temperature: body.temperature }); return { ok: true, key: body.key }; }
    catch (e) { return { error: e.message }; }
  },
  'POST /prompt-reset': async (body) => {
    if (!body.key) return { error: 'key required' };
    try { const def = await prompts.resetToDefault(body.key); return { ok: true, content: def }; }
    catch (e) { return { error: e.message }; }
  },
  'POST /prompts-status': async () => prompts.status(),
  // Admin control-centre status: integrations, balances, server + prompt health.
  'POST /admin-status': async () => {
    const r = research.status();
    let dfsBalance = null;
    try { if (semrush.hasKey()) dfsBalance = await semrush.apiUnits(); } catch (e) {}
    return {
      integrations: {
        claude: { configured: !!process.env.ANTHROPIC_API_KEY, label: 'Anthropic Claude', detail: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5' },
        dataforseo: { configured: semrush.hasKey(), label: 'DataForSEO (keywords)', detail: dfsBalance != null ? `$${(dfsBalance / 100).toFixed(2)} balance` : 'pay-as-you-go' },
        perplexity: { configured: r.perplexity, label: 'Perplexity (research)', detail: 'web-grounded answers' },
        tavily: { configured: r.tavily, label: 'Tavily (retrieval)', detail: 'source search/extract' },
        psi: { configured: !!process.env.PSI_KEY, label: 'PageSpeed Insights', detail: 'Lighthouse scoring' },
        supabase: { configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE), label: 'Supabase', detail: 'data + secrets' },
      },
      prompts: prompts.status(),
      server: { version: '2.0', uptimeSec: Math.round(process.uptime()), node: process.version, model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929', dryRun: process.env.DRY_RUN !== 'false' },
      scope: 'United Kingdom (UK-only)',
    };
  },
  // Recent saved versions of a prompt (for one-click revert).
  'POST /prompt-history': async (body) => {
    if (!body.key) return { error: 'key required' };
    return { versions: await prompts.history(body.key) };
  },
  // Run a prompt on a representative sample WITHOUT saving — live preview.
  'POST /prompt-test': async (body) => {
    const { key, content } = body;
    if (!key || content == null) return { error: 'key and content required' };
    const sample = PROMPT_SAMPLES[key] || { engine: 'claude', user: 'Briefly demonstrate how you respond to a typical request.' };
    try {
      // Honour the per-prompt model/temperature (use the unsaved values if sent).
      const model = body.model !== undefined ? body.model : prompts.modelFor(key);
      const temperature = body.temperature !== undefined && body.temperature !== '' && body.temperature != null ? Number(body.temperature) : prompts.tempFor(key);
      if (sample.engine === 'perplexity') {
        if (!perplexity.hasKey()) return { error: 'Perplexity not configured — cannot test research prompts.' };
        const r = await perplexity.ask({ system: content, user: sample.user, model: model || 'fast', temperature: temperature != null ? temperature : undefined, maxTokens: 500 });
        return { output: r.answer, engine: 'perplexity', model: model || 'fast', sources: r.sources, cost: r.cost };
      }
      const txt = await claude.complete({ system: [{ type: 'text', text: content }], messages: [{ role: 'user', content: sample.user }], maxTokens: 800, model: model || undefined, temperature: temperature != null ? temperature : 0.3 });
      return { output: txt, engine: 'claude', model: model || 'default' };
    } catch (e) { return { error: e.message }; }
  },

  // Content opportunities: keyword clusters from ranking + competitors + trends,
  // gap-checked against the sitemap. The content-planning brain → Airtable.
  'POST /content-opportunities': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    try {
      return await findOpportunities(body.siteId, { db: body.db, maxKeywords: body.maxKeywords || 160, includeTrending: body.includeTrending !== false });
    } catch (e) { return { error: 'Content-opportunity analysis failed: ' + e.message }; }
  },

  // Internal-links engine: propose contextual in-content links across the site's
  // real pages (targets constrained to the actual corpus — no invented URLs).
  'POST /internal-links': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    try {
      const r = await suggestInternalLinks(body.siteId, { maxSources: body.maxSources || 8, targetUrl: body.targetUrl || null });
      return r;
    } catch (e) { return { error: 'Internal-link analysis failed: ' + e.message }; }
  },

  // Per-page schema generator: builds a JSON-LD @graph (WebPage + BreadcrumbList,
  // Article for posts, LegalService/Person/FAQ for YMYL/legal) ready to publish.
  'POST /generate-schema': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const page = body.page;
    if (!page || !page.url) return { error: 'A page (with url) is required.' };
    const cfg = body.schemaConfig || {};
    const baseUrl = (site && site.url) ? site.url.replace(/\/$/, '') : new URL(page.url).origin;
    // Org defaults from the site row; overridable from the request.
    const org = Object.assign({
      name: (site && site.name) || undefined,
      url: baseUrl,
      logo: site && site.logo,
    }, cfg.org || {});
    // Treat legal/YMYL niches as legal unless told otherwise.
    const niche = ((site && site.stack && site.stack.type) || (site && site.niche) || '').toLowerCase();
    const isLegal = cfg.isLegal != null ? cfg.isLegal : /legal|law|solicit|attorney/.test(niche);
    const schema = generatePageSchema(
      { url: page.url, title: page.title, description: page.description, type: page.type || 'page', datePublished: page.datePublished, dateModified: page.dateModified, image: page.image, lang: page.lang },
      { org, baseUrl, siteName: org.name, isLegal, author: cfg.author, areaServed: cfg.areaServed, faqs: body.faqs }
    );
    return { schema, json: JSON.stringify(schema, null, 2), isLegal, types: (schema['@graph'] || []).map((n) => n['@type']) };
  },

  // AI-SEO fact extraction: surface citable facts + FAQ from a page to improve
  // LLM/answer-engine citation; returns a ready FAQPage schema too.
  'POST /ai-seo-facts': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const url = body.url || (body.page && body.page.url);
    if (!url) return { error: 'A page url is required.' };
    let title = body.title || '', text = '';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
      const html = await res.text();
      title = title || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return { error: 'Could not fetch the page: ' + e.message }; }
    const niche = (site && site.stack && site.stack.type) || '';
    let facts;
    try { facts = await claude.extractCitableFacts({ url, title, text, niche }); }
    catch (e) { return { error: 'Fact extraction failed: ' + e.message }; }
    // Ground with CURRENT, cited UK facts from the live web (Perplexity), so the
    // on-page facts reflect today's reality, not just what's already on the page.
    let grounded = null;
    if (research.status().perplexity) {
      try { const g = await research.citableFactsGrounded({ topic: title || url, niche, now: Date.now() }); if (!g.error) grounded = { summary: g.summary, sources: g.sources }; } catch (e) {}
    }
    // Build a FAQPage schema from the extracted Q&A (ready to publish).
    const { buildFaqPage } = await import('./schema-gen.js');
    const faqSchema = buildFaqPage(url, facts.faqs);
    return { url, title, ...facts, grounded, faqSchema: faqSchema ? { '@context': 'https://schema.org', ...faqSchema } : null };
  },

  // Image optimization: scan the media library for heavy raster images.
  'POST /media-scan': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    try { return await imageOpt.scanMedia(body.siteId, { minKB: body.minKB || 80, limit: body.limit || 60 }); }
    catch (e) { return { error: 'Media scan failed: ' + e.message }; }
  },
  // Compress images to WebP. apply=false previews savings; apply=true uploads.
  'POST /media-optimize': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    try { return await imageOpt.optimizeImages(body.siteId, { ids: body.ids || null, quality: body.quality || 80, max: body.max || 8, apply: !!body.apply }); }
    catch (e) { return { error: 'Image optimization failed: ' + e.message }; }
  },
  // Speed test: run PageSpeed (median-of-N) on a URL for mobile + desktop.
  'POST /speed-test': async (body) => {
    const url = body.url;
    if (!url) return { error: 'A URL is required.' };
    const strat = body.strategy || 'mobile';
    try {
      const r = await runPsiMedian(url, { strategy: strat, n: body.n || 2, key: process.env.PSI_KEY });
      return { url, strategy: strat, scores: r.scores, scoresIqr: r.scoresIqr, cwv: r.cwv, field: r.field, runs: r.runs };
    } catch (e) { return { error: 'Speed test failed: ' + e.message }; }
  },

  // modern-css fix generator: turn audit findings into real, reviewable CSS.
  'POST /generate-css': async (body) => {
    let findings = Array.isArray(body.findings) ? body.findings : null;
    if (!findings && body.siteId) {
      try {
        const rows = await fetch(`${process.env.SUPABASE_URL}/rest/v1/audits?site_id=eq.${body.siteId}&select=findings&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
        findings = (rows && rows[0] && rows[0].findings) || [];
      } catch (e) { findings = []; }
    }
    findings = findings || [];
    const result = generateCssFixes(findings);
    // Stamp the date here (scripts/modules avoid Date in pure logic).
    result.css = result.css.replace('{{DATE}}', new Date().toISOString().slice(0, 10));
    if (!result.rules.length) return { error: 'No CSS-fixable findings in the latest audit (contrast, target-size, font-display, CLS, etc.).', css: '', rules: [] };
    return result;
  },

  // Content-decay detector: high-value pages losing clicks (GSC), cross-referenced
  // with WordPress modified-date ("old + declining = refresh now").
  'POST /content-decay': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Connect Google Search Console first — content decay needs real click data.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected.', needsProperty: true };
    let decay;
    try { decay = await gsc.contentDecay(JSON.parse(saStr), property, { windowDays: body.windowDays || 28 }); }
    catch (e) { if (e.code === 'NO_ACCESS') return { error: e.message, noAccess: true }; return { error: e.message }; }

    // Enrich with WP modified-date where we can resolve the page → post.
    try {
      const { baseUrl, username, appPassword } = await credsForSite(body.siteId);
      const wp = new WordPressClient({ baseUrl, username, appPassword });
      for (const d of decay.pages.slice(0, 20)) {
        try {
          const path = new URL(d.page).pathname.replace(/\/+$/, '');
          const slug = path.split('/').filter(Boolean).pop();
          if (!slug) continue;
          for (const type of ['posts', 'pages']) {
            const hits = await wp.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id,modified`, { method: 'GET' }).catch(() => []);
            if (Array.isArray(hits) && hits.length) {
              d.modified = hits[0].modified;
              const ageDays = Math.round((Date.now() - new Date(hits[0].modified).getTime()) / 86400000);
              d.ageDays = ageDays;
              d.stale = ageDays > 180; // not updated in 6 months
              d._type = type; d._id = hits[0].id;
              break;
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    return decay;
  },

  // Generate a substantive refresh brief for one decaying page (Claude).
  // NOT a date bump — a real content-improvement plan.
  'POST /content-decay-brief': async (body) => {
    const page = body.page;
    if (!page) return { error: 'No page specified' };
    let pageText = '';
    try {
      const res = await fetch(page.url || page, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
      const html = await res.text();
      pageText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch (e) {}
    const brief = await claude.draftFix({
      finding: { title: 'Content refresh for a decaying page', detail: `This page lost ${page.clicksLost} clicks (${page.pctDrop}% drop), position drifted ${page.positionDrift > 0 ? '+' : ''}${page.positionDrift}. Write a SUBSTANTIVE refresh brief: what new sections/stats/examples to add, what's outdated, how to regain rankings. NOT a date bump.`, page: page.page },
      pageContext: { excerpt: pageText },
    });
    return { brief };
  },

  // Save/read a site's competitors + negative keywords (per-site config).
  'POST /site-competitors': async (body) => {
    const patch = {};
    if (Array.isArray(body.competitors)) patch.competitors = body.competitors;
    if (Array.isArray(body.negativeKeywords)) patch.negative_keywords = body.negativeKeywords;
    const site = await db.updateSite(body.siteId, patch);
    return { competitors: site.competitors || [], negativeKeywords: site.negative_keywords || [] };
  },

  // ── Airtable ─────────────────────────────────────────────────────────────
  // Connect: validate the PAT, store it encrypted, list available bases.
  'POST /airtable-connect': async (body) => {
    const { siteId, pat } = body;
    if (!siteId || !pat) throw new Error('siteId and pat required');
    const bases = await airtable.listBases(pat);   // validates the PAT
    await db.setAirtablePat(siteId, pat);
    await db.upsertAirtableConfig(siteId, { connected: true });
    return { ok: true, bases };
  },

  // List tables in a chosen base (for field/table mapping in the UI).
  'POST /airtable-tables': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    const tables = await airtable.listTables(pat, body.baseId);
    return { tables };
  },

  // Save the base + table selections for a site.
  'POST /airtable-config': async (body) => {
    const cfg = await db.upsertAirtableConfig(body.siteId, {
      base_id: body.baseId, table_gaps: body.tableGaps, table_content: body.tableContent, table_geo: body.tableGeo,
    });
    return { config: cfg };
  },

  // Read current Airtable config + connection status for a site.
  'POST /airtable-status': async (body) => {
    const cfg = await db.getAirtableConfig(body.siteId);
    const pat = await db.getAirtablePat(body.siteId).catch(() => null);
    return { connected: !!pat, config: cfg || null };
  },

  // THE FLOW: gather DataForSEO keyword-gaps + Claude content suggestions + GEO
  // citation results for a site and push them into the configured Airtable tables.
  // Auto-creates tables (if the PAT has schema:write) using SCHEMAS.
  'POST /airtable-sync': async (body) => {
    const { siteId } = body;
    const pat = await db.getAirtablePat(siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    const cfg = await db.getAirtableConfig(siteId);
    if (!cfg || !cfg.base_id) return { error: 'No Airtable base selected', needsConfig: true };

    const now = new Date().toISOString();
    const kinds = body.kinds || ['gaps', 'content', 'geo'];
    const out = {};
    const baseId = cfg.base_id;

    // helper: ensure a table then push rows
    async function push(kind, tableName, rows, schema) {
      if (!rows.length) { out[kind] = { pushed: 0, note: 'no rows' }; return; }
      let table = tableName;
      try { const t = await airtable.ensureTable(pat, baseId, tableName || defaultName(kind), schema); table = t.name; }
      catch (e) { /* schema:write may be missing; fall back to provided name */ table = tableName || defaultName(kind); }
      const pushed = await airtable.createRecords(pat, baseId, table, rows);
      out[kind] = { pushed, table };
      await db.logAirtableSync({ site_id: siteId, kind, records_pushed: pushed, status: 'ok' });
    }
    function defaultName(k) { return { gaps: 'SEO Keyword Gaps', content: 'Content Suggestions', geo: 'AI Citation Results', opportunities: 'Content Opportunities' }[k]; }

    // 1) Keyword gaps (DataForSEO) — needs a competitor; uses body.competitor or the data passed in.
    if (kinds.includes('gaps')) {
      let gaps = body.gaps;
      if (!gaps && semrush.hasKey() && body.competitor) {
        const site = await db.getSite(siteId);
        const dom = (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const g = await semrush.keywordGap(dom, body.competitor, { db: site.semrush_db || 'uk' }).catch(() => ({ gaps: [] }));
        gaps = g.gaps;
      }
      await push('gaps', cfg.table_gaps, airtable.mapGaps(gaps || [], 'DataForSEO', now), airtable.SCHEMAS.gaps);
    }
    // 2) Content suggestions (passed from the UI's content-intel result)
    if (kinds.includes('content')) {
      await push('content', cfg.table_content, airtable.mapContent(body.suggestions || [], now), airtable.SCHEMAS.content);
    }
    // 3) GEO citation results (passed from the UI's last GEO run)
    if (kinds.includes('geo')) {
      await push('geo', cfg.table_geo, airtable.mapGeo(body.geoResults || [], now), airtable.SCHEMAS.geo);
    }
    // 4) Content opportunities (keyword clusters from the Content screen).
    if (kinds.includes('opportunities')) {
      await push('opportunities', cfg.table_opportunities, airtable.mapOpportunities(body.clusters || [], now), airtable.SCHEMAS.opportunities);
    }

    await db.upsertAirtableConfig(siteId, { last_sync: now });
    return { ok: true, synced: out, at: now };
  },

  // Content intelligence: gaps, suggestions, keyword clusters for a site.
  // Pulls the site's post/page titles via REST, then asks Claude to analyze.
  'POST /content-intel': async (body) => {
    const { creds } = await resolveCreds(body);
    const wp = clientFrom(creds);
    // Gather a representative sample of titles across posts + pages.
    const titles = [];
    try {
      const posts = await wp.list('posts', { perPage: 100, fields: 'title' });
      for (const p of posts) titles.push((p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim());
    } catch (e) {}
    try {
      const pages = await wp.list('pages', { perPage: 100, fields: 'title' });
      for (const p of pages) titles.push((p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim());
    } catch (e) {}
    const clean = titles.filter(Boolean);
    if (clean.length === 0) {
      return { error: 'No published posts or pages found on this site to analyze. Add content, or check that the REST API exposes posts/pages.', empty: true };
    }
    // Stride a diverse sample across the whole library (not just the newest 90).
    const sample = [];
    const step = Math.max(1, Math.floor(clean.length / 90));
    for (let i = 0; i < clean.length && sample.length < 90; i += step) sample.push(clean[i]);
    let intel;
    try {
      intel = await claude.contentIntelligence({ siteName: body.siteName || creds.baseUrl, niche: body.niche, titles: sample });
    } catch (e) {
      return { error: 'Content analysis failed: ' + e.message };
    }
    if (intel._parseError || (!intel.clusters || !intel.clusters.length)) {
      return { error: 'The AI returned an unexpected format analyzing your content. Try again — if it persists, the site may have too few/unclear titles.', _raw: intel._raw, analyzedTitles: clean.length };
    }
    return { analyzedTitles: clean.length, sampledTitles: sample.length, ...intel };
  },

  // Generate real fix content with Claude (meta description, title, alt, generic).
  // Used to fill a proposal's "after" value with human-reviewable copy.
  'POST /generate-content': async (body) => {
    const t = body.task;
    if (t === 'meta_description') return { value: await claude.metaDescription(body.input || {}) };
    if (t === 'title') return { value: await claude.titleRewrite(body.input || {}) };
    if (t === 'alt') return { value: await claude.altText(body.input || {}) };
    return { value: await claude.draftFix({ finding: body.finding || {}, pageContext: body.input || {} }) };
  },

  // Apply one approved meta change — verify-after-write. Supports secure siteId
  // (secret decrypted server-side) OR creds-in-body. DRY_RUN honored.
  'POST /apply-meta': async (body) => {
    const { creds, site } = await resolveCreds(body);
    // Block writes when the site is not write-armed (unless explicitly forced & not dry).
    if (site && site.write_armed === false && !body.force) {
      return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    }
    const wp = clientFrom(creds);
    if (body.dryRun) {
      return { status: 'dry-run', wouldWrite: { id: body.postId, field: body.field, value: body.value } };
    }
    const r = await wp.updateMetaVerified(body.objectType || 'posts', body.postId, body.field, body.value, { force: true });
    if (body.proposalId) {
      await db.updateProposal(body.proposalId, { status: r.status === 'verified' ? 'verified' : 'failed', old_value: r.old, post_id: body.postId, object_type: body.objectType || 'posts', applied_at: new Date().toISOString() }).catch(() => {});
    }
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: 'Verified write — ' + body.field, meta: 'read-back OK' }).catch(() => {});
    return r;
  },

  // Roll back a meta change to a prior value (siteId or creds).
  'POST /rollback-meta': async (body) => {
    const { creds, site } = await resolveCreds(body);
    const wp = clientFrom(creds);
    const r = await wp.updateMetaVerified(body.objectType || 'posts', body.postId, body.field, body.oldValue, { force: true });
    if (body.proposalId) await db.updateProposal(body.proposalId, { status: 'rolled-back' }).catch(() => {});
    if (site) await db.logActivity({ site_id: site.id, type: 'rolled-back', actor: 'You', icon: 'undo', text: 'Rolled back — ' + body.field, meta: 'value restored' }).catch(() => {});
    return { ...r, rolledBack: true };
  },
};

// --- server ----------------------------------------------------------------
const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;

  // ── Google OAuth: one-click "Connect with Google" (redirect flow) ──────────
  // GET /gsc-oauth-start → bounce the user to Google's consent screen.
  if (key === 'GET /gsc-oauth-start') {
    if (!gsc.oauthConfigured()) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('Google OAuth is not configured on this server (set GOOGLE_OAUTH_CLIENT_ID/SECRET).'); }
    const siteId = url.searchParams.get('siteId');
    if (!siteId) { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Missing siteId'); }
    const authUrl = gsc.oauthAuthUrl({ state: signState(siteId), redirectUri: gscRedirectUri(req) });
    res.writeHead(302, { Location: authUrl });
    return res.end();
  }
  // GET /gsc-oauth-callback → Google redirects back here with ?code & ?state.
  if (key === 'GET /gsc-oauth-callback') {
    const closePage = (ok, msg) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Search Console</title>
<body style="font-family:system-ui;background:#ECECEC;color:#1c2b2a;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:360px;padding:24px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.12)">
<div style="font-size:42px">${ok ? '✅' : '⚠️'}</div>
<h2 style="margin:8px 0">${ok ? 'Search Console connected' : 'Connection failed'}</h2>
<p style="color:#5a6b69;font-size:14px">${msg || (ok ? 'You can close this window.' : '')}</p></div>
<script>try{if(window.opener){window.opener.postMessage({type:'gsc-oauth',ok:${ok ? 'true' : 'false'}},'*');}}catch(e){}
setTimeout(function(){try{window.close();}catch(e){} if(!window.closed){location.replace('/?screen=gsc');}}, ${ok ? 1200 : 2500});</script>`);
    };
    try {
      const error = url.searchParams.get('error');
      if (error) return closePage(false, 'Google said: ' + error);
      const code = url.searchParams.get('code');
      const siteId = verifyState(url.searchParams.get('state') || '');
      if (!code || !siteId) return closePage(false, 'Invalid or expired authorization. Please try again.');
      const creds = await gsc.oauthExchangeCode({ code, redirectUri: gscRedirectUri(req) });
      await db.setGscSa(siteId, JSON.stringify(creds));
      return closePage(true, creds.email ? ('Connected as ' + creds.email + '. Choose a property in the dashboard.') : 'Choose a property in the dashboard.');
    } catch (e) {
      return closePage(false, e.message);
    }
  }

  // ── Streaming chat (Server-Sent Events) — special-cased outside JSON routes.
  if (key === 'POST /chat-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Heartbeat: the agentic loop has long idle gaps (Claude "thinking" before the
    // first token, and server-side tool execution that can run 30-60s). With no
    // bytes flowing, proxies/load-balancers kill the connection and the browser
    // throws "Failed to fetch". A comment ping every 15s keeps it alive; SSE
    // comment lines (": ...") are ignored by the client parser.
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 15000);
    try {
      const body = await readBody(req);
      const r = await chatbot.chatStream({
        messages: body.apiHistory || [], userText: body.text, images: body.images || [], siteId: body.siteId,
        onText: (delta) => sse('delta', { text: delta }),
        onTool: (names) => sse('tools', { tools: names }),
      });
      // Persist (create/update conversation) + auto-title on first exchange.
      let convoId = body.conversationId;
      let title = null;
      try {
        if (body.siteId) {
          const display = body.displayMessages || [];
          if (!convoId) {
            title = await chatbot.generateTitle(body.text, r.reply);
            const c = await db.createConversation(body.siteId, title || (body.text || 'New chat').slice(0, 60));
            convoId = c.id;
          }
          await db.saveConversation(convoId, {
            messages: [...display, { role: 'assistant', text: r.reply, tools: r.toolsUsed || [] }],
            apiHistory: r.messages, messageCount: (display.length || 0) + 1,
          });
        }
      } catch (e) { /* best-effort */ }
      sse('done', { reply: r.reply, toolsUsed: r.toolsUsed, conversationId: convoId, title });
    } catch (e) {
      sse('error', { error: e.message });
    } finally {
      clearInterval(heartbeat);
    }
    return res.end();
  }

  const handler = routes[key];
  if (!handler) {
    // Any unmatched GET is a static asset (the only GET API route, /health, is
    // matched above) → serve from web/ (serveStatic SPA-falls-back to index).
    // Note: do NOT gate on the path prefix — files like /api.jsx start with
    // "/api" and must still be served.
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    return send(res, 404, { error: `No route ${key}` });
  }
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = await handler(body, url);
    send(res, 200, out);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sentinel up on :${PORT}  (console + API)  (PSI_KEY ${process.env.PSI_KEY ? 'set' : 'MISSING'})`);
  // Load editable prompt overrides from Supabase + seed the catalogue.
  prompts.init().then(() => console.log(`[prompts] ${prompts.status().count} registered, ${prompts.status().overridden} overridden`)).catch(() => {});
});

// --- crash safety -----------------------------------------------------------
// A single-process zero-dep server must survive a stray rejection/throw from a
// fire-and-forget DB write, a timer, or a third-party fetch. Log and keep
// serving instead of dying — per-request errors are already caught and returned
// as 400s above; these guards only catch what escapes a request's try/catch.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
// If the listen() itself fails (e.g. port busy), exit with a clear message
// rather than throwing a raw EADDRINUSE stack.
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — another Sentinel API is running. Stop it first, or set API_PORT.`);
    process.exit(1);
  }
  console.error('[server error]', err && err.stack ? err.stack : err);
});
