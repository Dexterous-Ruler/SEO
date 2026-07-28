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
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WordPressClient } from '../src/wp/client.js';
import { getHead, parseHead } from '../src/wp/rankmath.js';
import { runPsiBatch, runPsiDetailed, runPsiMedian } from '../src/lib/psi.js';
import { discoverUrls, findOrphans } from '../src/lib/crawler.js';
import { prioritize } from '../src/lib/prioritize.js';
import { prioritizeFindings } from './prioritization.js';
import { auditHtml } from '../src/phases/04-seo.js';
import { detectStack } from './detect.js';
import { auditPage, proposeFromFinding, metaFieldMap, writeMetaResilient, rendersAsArchive, archivePostType } from './audit-pipeline.js';
import { db, credsForSite } from './supabase.js';
import * as claude from './claude.js';
import { detectLiveCms } from './site-health.js';
import { marketFor } from './market.js';
import selftest from './selftest.js';
import * as geo from './geo.js';
// Keyword/competitor data now comes from DataForSEO (pay-as-you-go) instead of
// SEMrush. The `semrush` alias is kept so existing call sites are unchanged;
// the module exposes the identical interface + return shapes.
import * as semrush from './dataforseo.js';
import * as airtable from './airtable.js';
import * as adapters from './consent-adapters.js';
import * as chatbot from './chat.js';
import * as gsc from './gsc.js';
import * as gscIndex from './gsc-index.js';
import { startScheduler } from './scheduler.js';
import { detectGscDaily, detectAuditHistory } from './anomaly.js';
import * as tv from './traffic-value.js';
import { correlationMatrix } from './correlation.js';
import { suggestForSite as suggestInternalLinks, editablePageContent, insertableIn, normText, resolveSourceByUrl, linkedAnchorTexts, alreadyLinked } from './internal-links.js';
import { generatePageSchema, validateSchema, schemaForAnswerBlock, localSchemaForSite, localReadiness } from './schema-gen.js';
import { scoreContent, verifyClaims, humanize } from './content-quality.js';
import { generateCssFixes } from './css-fixes.js';
import { generateA11yFixes } from './a11y-fixes.js';
import { findOpportunities } from './content-opportunities.js';
import * as research from './research.js';
import * as imageOpt from './image-optimize.js';
import * as prompts from './prompts.js';
import * as perplexity from './perplexity.js';
import * as n8n from './n8n.js';
import * as uxcrawl from './ux-crawl.js';

// Resolve n8n credentials for a request: PREFER the encrypted server-side config
// (connect once — the key lives only in Supabase, pgcrypto-encrypted), and fall
// back to creds in the request body only for legacy BYO-key browsers. The key is
// never logged. Hoisted so the /n8n-* route handlers below can call it.
async function n8nCreds(body) {
  const cfg = await db.getN8nConfig().catch(() => null);
  const baseUrl = (cfg && cfg.baseUrl) || (body && body.baseUrl) || '';
  const apiKey = (cfg && cfg.apiKey) || (body && body.apiKey) || '';
  return { baseUrl, apiKey };
}

// Balance block-level tags so injected content can't break OUT of its container — an
// unclosed/orphan <div> is exactly what dropped Fast ILA's sidebar (the malformed HTML
// escaped the theme's Post Content widget). Stack-based: drop orphan closers that would
// close an ancestor, and close anything still open at the end.
const BALANCE_BLOCK = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'ul', 'ol', 'li', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'figure', 'blockquote']);
const BALANCE_VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
function balanceBlockTags(html) {
  const stack = [], out = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
  let last = 0, m;
  while ((m = re.exec(html))) {
    out.push(html.slice(last, m.index)); last = re.lastIndex;
    const closing = m[1] === '/', tag = m[2].toLowerCase(), selfC = m[3] === '/' || BALANCE_VOID.has(tag), full = m[0];
    if (!BALANCE_BLOCK.has(tag) || selfC) { out.push(full); continue; }
    if (!closing) { stack.push(tag); out.push(full); continue; }
    const idx = stack.lastIndexOf(tag);
    if (idx === -1) { /* orphan closer → drop it */ continue; }
    while (stack.length > idx + 1) out.push('</' + stack.pop() + '>');   // close inner-left-open first
    stack.pop(); out.push(full);
  }
  out.push(html.slice(last));
  while (stack.length) out.push('</' + stack.pop() + '>');               // close anything still open
  return out.join('');
}

// Does THIS post store its content in Elementor widgets (_elementor_data)? If so, the
// safe push is the targeted widget swap; if not (classic post_content, even wrapped in an
// Elementor theme template), a BALANCED post_content write is safe. Returns { elementor,
// widgets } from the mu-plugin, or { elementor:false } if it can't tell / mu too old.
async function elementorContentState(wp, postId) {
  try {
    const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/elementor-content`, { method: 'POST', body: { post_id: postId, list: true } });
    return { elementor: !!(r && r.elementor), widgets: (r && r.widgets) || [] };
  } catch (e) { return { elementor: false, widgets: [] }; }
}

// Enforce the content style rules the model must never violate, no matter what it emits:
//  • no horizontal rules / divider lines (section breaks) in article content;
//  • no standalone "Related Resources / Further Reading / Useful Links / See Also"
//    link-dump section (its heading + everything to the next heading/end is removed).
function stripBannedContentBlocks(html) {
  let s = String(html || '');
  // horizontal rules / dividers
  s = s.replace(/<hr\b[^>]*>/gi, '');
  // standalone "Related Resources / Further Reading …" link-dump section
  s = s.replace(/<h([1-3])\b[^>]*>\s*(?:related\s+resources|further\s+reading|useful\s+links|see\s+also|related\s+(?:articles|reading|links|guides|posts))\s*<\/h\1>[\s\S]*?(?=<h[1-3]\b|$)/gi, '');
  // an EMPTY case-law / examples section — a "courts say / case law" heading whose block
  // only contains a "no cases verified / none found" placeholder must be removed whole
  // (Karim: if the case-law section has no cases, remove the entire section).
  s = s.replace(/<h[1-3]\b[^>]*>[^<]*(?:courts?\s+say|case\s?law|case\s+examples|relevant\s+case|key\s+cases|notable\s+cases)[^<]*<\/h[1-3]>[\s\S]*?(?=<h[1-3]\b|$)/gi,
    (block) => /no\s+cases?\s+verified|no\s+verified\s+case|none\s+(?:found|verified)|no\s+relevant\s+cases|no\s+case\s?law|not\s+verified\s+in\s+(?:the\s+)?(?:supplied\s+)?sources/i.test(block) ? '' : block);
  return s.replace(/(\r?\n){3,}/g, '\n\n').trim();
}

// The heavy part of a content rewrite = decayBrief + refreshArticle (two Claude calls).
// On long pages this exceeds the edge gateway's ~100s response cap → 504. So it runs in
// the BACKGROUND (started via /content-rewrite {start:true}); the client polls
// /content-rewrite-status. This helper does the generation and returns the preview.
async function generateRewritePreview({ wp, found, page, site, siteId, brief, feedback, priorDraft }) {
  const builder = (site && site.stack && site.stack.builder) || '';
  const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content,title`).catch(() => null);
  const rawHtml = (post && post.content && (post.content.raw != null ? post.content.raw : '')) || '';
  const rawText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (rawText.length < 60) return { status: 'manual', builder, reason: `This page has no editable post content to auto-rewrite${builder ? ` (it’s built with ${builder})` : ''} — generate the Brief and edit it directly in your builder.` };
  const title = (post && post.title && (post.title.raw || post.title.rendered)) || page.title || '';
  let br = brief;
  if (!br) { try { br = await claude.decayBrief({ page, pageContext: { excerpt: rawText.slice(0, 4000) }, siteId }); } catch (e) { br = ''; } }
  // Real internal-link targets from THIS site's published pages/posts, so the refresh can
  // only link to URLs that actually exist (Karim: it was giving wrong internal URLs — the
  // model invents them when it has no real list to draw from).
  let linkCandidates = [];
  try {
    const [pg, ps] = await Promise.all([
      wp.list('pages', { perPage: 100, fields: 'title,link' }).catch(() => []),
      wp.list('posts', { perPage: 100, fields: 'title,link' }).catch(() => []),
    ]);
    linkCandidates = [...(Array.isArray(pg) ? pg : []), ...(Array.isArray(ps) ? ps : [])]
      .map((r) => ({ title: ((r.title && r.title.rendered) || '').replace(/&[a-z#0-9]+;/gi, ' ').trim(), url: r.link }))
      .filter((p) => p.title && p.url);
    // Put booking/consultation/contact pages FIRST so the CTA target is never truncated
    // off the list (e.g. go-legal's /free-consultation/).
    const isCta = (u) => /free-consultation|\/book|consult|appointment|\/contact/i.test(u || '');
    linkCandidates.sort((a, b) => (isCta(b.url) ? 1 : 0) - (isCta(a.url) ? 1 : 0));
    linkCandidates = linkCandidates.slice(0, 60);
  } catch (e) {}
  let newHtml = '';
  try { newHtml = await claude.refreshArticle({ page: { ...page, title }, currentContent: rawHtml || rawText, brief: br, linkCandidates, feedback, priorDraft, siteId }); }
  catch (e) { return { error: 'Rewrite failed: ' + e.message }; }
  // Defensive: strip anything the style rules forbid, regardless of the model —
  //  • horizontal rules / divider lines (Karim: never section-break lines in content)
  //  • a trailing "Related Resources / Further Reading" link-dump section (Karim: no
  //    random link lists — internal links must be woven into the prose instead).
  const clean = stripBannedContentBlocks(
    String(newHtml || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  );
  if (clean.length < 80) return { error: 'The rewrite came back empty — try again.' };
  return { status: 'preview', postId: found.id, type: found.type, title, brief: br, newHtml: clean,
    oldWords: rawText.split(/\s+/).filter(Boolean).length, newWords: clean.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length };
}
const REWRITES = new Map();   // `${siteId}:${postId}` -> { status:'running'|'done'|'error', result?, error?, at }
const _atRecCache = new Map();  // `${base}:${table}:${filter}` -> { all, exp } — 10s TTL absorbs the grid's poll bursts
const OPP_RUNS = new Map();     // siteId -> { status:'running'|'done'|'error', result?, error?, at } — content-opportunities background job
// Values that must NEVER reach a live <title>/description. SAL's /about/ shipped with a
// literal "(generated on approval)" as BOTH its title and og:title — written by an early
// apply before any guard existed, and invisible to length-based checks because it is short.
const PLACEHOLDER_RE = /agent-drafted fix|review before apply|generated on approval|generated on publish|to be generated|placeholder|lorem ipsum|\{\{|\bTBD\b|\[insert |^\(.*\)$/i;
// Brand tokens for a site (from its name + domain label). Used to catch cross-site
// contamination — e.g. settlement's /expertise/ pages carry "Fast ILA" copy (clone
// residue), which is a DIFFERENT connected site's brand appearing on this one.
function brandTokensForSite(s) {
  const toks = new Set();
  const push = (raw) => {
    let t = String(raw || '').toLowerCase().trim();
    if (!t) return;
    try { if (/^https?:\/\//.test(t)) t = new URL(t).hostname; } catch (e) {}
    t = t.replace(/^www\./, '').replace(/\.(co\.uk|com|org|net|app|ai|io|uk)$/g, '');
    const spaced = t.replace(/[-_.]+/g, ' ').trim();
    const tight = t.replace(/[-_.]+/g, '').trim();
    if (spaced.length >= 5) toks.add(spaced);
    if (tight.length >= 5) toks.add(tight);
  };
  push(s && s.name); push(s && s.url);
  return [...toks];
}
// The brand tokens of OTHER connected sites that don't also belong to this one.
async function foreignBrandTokens(site) {
  try {
    const own = new Set(brandTokensForSite(site));
    const all = await db.listSites();
    const out = new Set();
    for (const o of (all || [])) {
      if (!o || o.id === (site && site.id)) continue;
      for (const t of brandTokensForSite(o)) if (!own.has(t)) out.add(t);
    }
    return [...out];
  } catch (e) { return []; }
}
const META_RUNS = new Map();   // siteId -> metadata-repair background job
const AUDIT_RUNS = new Map();  // siteId -> { status, progress?, result?, error?, at } — scope-aware audit background job
const MEDIA_RUNS = new Map();  // siteId -> image-optimization background job (download+convert+upload is heavy)
const BRIEF_RUNS = new Map();  // siteId -> content-brief background job (SERP research + Claude runs >95s)
// The site's niche context PLUS its target market, for claude.filterKeywordsByNiche. Without
// the market, another country's terms survive the service test (a UK visa firm was seeded
// with "visa go australia" and got a whole PAA set about Australian visas).
function nicheWithMarket(site, db) {
  const ctx = (site && site.geo_context) || '';
  if (!ctx) return ctx;
  let label = '';
  try { label = (semrush.countryFor(db || (site && site.semrush_db) || 'uk') || {}).label || ''; } catch (e) {}
  return label ? `${ctx}\n\nTARGET MARKET: ${label} — this business sells to this market. Drop keywords about another country's system, rules, fees or providers.` : ctx;
}
import { limiters, infraStats, withTimeout, HEAVY_MAX_QUEUE, Limiter, TTLCache } from './infra.js';
import * as jobs from './jobs.js';
import * as drift from './drift.js';
import * as indexnow from './indexnow.js';
import * as engine from './content-engine.js';

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

// Static frontend. Prefer the precompiled production build (web/dist — minified,
// gzipped, no Babel) when present; fall back to web/ for local no-build dev.
const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const WEB_DIST = join(WEB_SRC, 'dist');
const WEB_DIR = existsSync(join(WEB_DIST, 'index.html')) ? WEB_DIST : WEB_SRC;
// BUILD_ID identifies the RUNNING build (bundle mtime at process start). The SPA compares it
// against /status on a slow poll and shows a "Reload" banner on mismatch — an open tab could
// otherwise run week-old code forever, making every fix look like it "didn't work".
const BUILD_ID = (() => {
  try { return String(Math.round(statSync(join(WEB_DIR, 'soft-dashboard.js')).mtimeMs)); }
  catch (e) { try { return String(Math.round(statSync(join(WEB_DIR, 'index.html')).mtimeMs)); } catch (e2) { return String(Date.now()); } }
})();

// Canonical mu-plugin shipped in the container — read by /push-mu-update to self-update
// sites. Cached after first read (immutable per deploy).
const MU_PLUGIN_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'wp-plugin', 'seo-agent-optimize.php');
let _muCache = null;
function readMuPlugin() {
  if (_muCache) return _muCache;
  const code = readFileSync(MU_PLUGIN_FILE, 'utf8');
  const version = (code.match(/Version:\s*([0-9][0-9.]*)/) || [])[1] || '';
  const sha256 = createHash('sha256').update(code, 'utf8').digest('hex');
  _muCache = { code, version, sha256 };
  return _muCache;
}
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};
const GZIPPABLE = new Set(['.js', '.css', '.html', '.svg', '.json']);
async function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = normalize(join(WEB_DIR, p));
  // Anchor the containment check on a path-separator boundary so a sibling dir whose name
  // merely extends WEB_DIR (e.g. `<web>-x`) can't pass a bare startsWith() prefix check.
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + sep)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const ext = extname(file).toLowerCase();
    const type = STATIC_MIME[ext] || 'application/octet-stream';
    const lastMod = st.mtime.toUTCString();
    // Cheap repeat-load: revalidate via Last-Modified → 304 (no body) when unchanged.
    if (req.headers['if-modified-since'] === lastMod) { res.writeHead(304); return res.end(); }
    // Serve a precompiled .gz sibling when the client accepts gzip.
    let sendFile = file, encoding = null;
    if (GZIPPABLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && existsSync(file + '.gz')) {
      sendFile = file + '.gz'; encoding = 'gzip';
    }
    const body = await readFile(sendFile);
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Last-Modified': lastMod, Vary: 'Accept-Encoding' };
    if (encoding) headers['Content-Encoding'] = encoding;
    res.writeHead(200, headers);
    res.end(body);
  } catch (e) {
    // SPA-ish fallback: unknown GET paths → index.html (so deep links work).
    try { const idx = await readFile(join(WEB_DIR, 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(idx); }
    catch (_) { res.writeHead(404); res.end('Not found'); }
  }
}

// --- tiny helpers ----------------------------------------------------------
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // CORS deliberately NOT wildcard: the dashboard is served same-origin by this very
    // process, so browsers need no CORS at all. Reflecting only localhost (dev) closes
    // the drive-by hole where any web page could fire authenticated-looking writes.
    ...corsHeaders(res.req),
  });
  res.end(data);
}
function corsHeaders(req) {
  const origin = (req && req.headers && req.headers.origin) || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-creds, x-sentinel-key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  }
  return {};
}

// ── API AUTH ──────────────────────────────────────────────────────────────────
// When SENTINEL_DASHBOARD_KEY is set, EVERY mutating/API POST must carry it in the
// x-sentinel-key header. Anyone could previously POST /apply-meta etc. straight at
// the public Koyeb URL. The dashboard stores the key locally after a one-time
// prompt. Unset env = auth off (deploy-safe until the operator sets the secret).
const DASH_KEY = process.env.SENTINEL_DASHBOARD_KEY || '';
const AUTH_EXEMPT = new Set(['POST /ux-beacon']);   // public beacon; GETs are read-only status/static
function authOk(req) {
  if (!DASH_KEY) return true;
  const got = String(req.headers['x-sentinel-key'] || '');
  if (got.length !== DASH_KEY.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(DASH_KEY)); } catch (e) { return false; }
}

// ── SERVER-SIDE KILL SWITCH ───────────────────────────────────────────────────
// The dashboard's kill switch was per-tab React state — another tab (or the API)
// happily kept writing. Now it's persisted (app_secrets) and enforced HERE, at the
// dispatcher, for every route that can mutate WordPress/Airtable/n8n. 10s cache.
const WRITE_ROUTE_RE = /^POST \/(apply-|rollback-|embed-video|remove-video-embed|fix-|normalize-video-embeds|strip-internal-labels|content-refresh|content-rewrite|content-restore|content-apply-elementor|airtable-sync|airtable-push|airtable-update-record|airtable-create-record|airtable-ensure-field|n8n-update-prompts|n8n-run|n8n-set-active|n8n-prompt-rollback|engine-autodraft|engine-sync-published|media-optimize|page-optimize-images|cleanup-webp-dupes|publish-|arm-beacon|aeo-apply)/;
let _kill = { v: false, exp: 0 };
async function killSwitchOn() {
  if (Date.now() < _kill.exp) return _kill.v;
  let v = false;
  try { v = (await db.getAppSecret('kill_switch')) === '1'; } catch (e) { v = _kill.v; }
  _kill = { v, exp: Date.now() + 10000 };
  return v;
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

const MAX_BODY = Number(process.env.MAX_BODY_BYTES) || 6 * 1024 * 1024; // 6 MB cap
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) { const e = new Error('Request body too large'); e.code = 'EBODY'; throw e; }
    chunks.push(c);
  }
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

// Insert an <a> link into raw post HTML at the first plain-text occurrence of
// `anchor`, never nesting inside an existing <a>…</a> and never if a link to the
// same target already exists. Returns { html, changed, reason }.
function insertAnchorLink(html, anchor, href) {
  if (!html || !anchor) return { html, changed: false, reason: 'Empty content or anchor.' };
  if (html.includes('href="' + href + '"') || html.includes("href='" + href + "'")) {
    return { html, changed: false, reason: 'A link to that target already exists on this page.' };
  }
  const esc = anchor.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[\\s>(\\[“"\'])(' + esc + ')([\\s<).,;:!?”"\'])', 'i');
  // Split out existing anchors and HTML tags so we only match visible text.
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>)/i);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg || seg[0] === '<') continue;              // skip tags + existing links
    if (re.test(seg)) {
      parts[i] = seg.replace(re, (m, p1, p2, p3) => p1 + '<a href="' + href + '">' + p2 + '</a>' + p3);
      return { html: parts.join(''), changed: true };
    }
  }
  return { html, changed: false, reason: 'The anchor text was not found in the page’s editable text (it may live in a page-builder widget).' };
}

// ── Content-decay refresh block ───────────────────────────────────────────
// A marked, idempotent, reversible "freshness" block prepended to a page's
// content. Markers are HTML comments so the block is easy to find, replace on
// re-refresh, and strip on undo — the original article body is never touched.
const REFRESH_OPEN = '<!--seoagent-refresh-->';
const REFRESH_CLOSE = '<!--/seoagent-refresh-->';
const REFRESH_RE = /<!--seoagent-refresh-->[\s\S]*?<!--\/seoagent-refresh-->\s*/g;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Build the freshness block HTML from Claude's structured parts.
function buildRefreshBlock(parts, monthYear) {
  const heading = parts.heading || ('Updated for ' + (monthYear || 'this year'));
  const bullets = (parts.points || []).filter(Boolean).map((p) => '<li>' + esc(p) + '</li>').join('');
  const intro = parts.intro ? '<p>' + esc(parts.intro) + '</p>' : '';
  const ul = bullets ? '<ul>' + bullets + '</ul>' : '';
  const note = parts.note ? '<p><em>' + esc(parts.note) + '</em></p>' : '';
  const stamp = '<p style="font-size:.85em;opacity:.7;margin-top:.5em">Reviewed and updated ' + esc(monthYear || '') + '</p>';
  const inner = '<div class="seoagent-refresh" style="border-left:3px solid #2f6fed;padding:.25em 0 .25em 1em;margin:0 0 1.25em">'
    + '<h2 style="margin:.2em 0">' + esc(heading) + '</h2>' + intro + ul + note + stamp + '</div>';
  return REFRESH_OPEN + '\n' + inner + '\n' + REFRESH_CLOSE + '\n';
}

// Insert (or replace an existing) refresh block at the TOP of post_content.
function applyRefreshBlock(raw, blockHtml) {
  const had = REFRESH_RE.test(raw); REFRESH_RE.lastIndex = 0;
  const stripped = raw.replace(REFRESH_RE, '');
  return { html: blockHtml + stripped, replaced: had };
}
// Remove the refresh block (undo). Returns {html, removed}.
function stripRefreshBlock(raw) {
  const had = REFRESH_RE.test(raw); REFRESH_RE.lastIndex = 0;
  return { html: raw.replace(REFRESH_RE, ''), removed: had };
}

// Submit a single freshened URL to Google's Indexing API. Never throws —
// returns a small status object the UI can surface ({ok|skipped|error}).
async function submitOneForIndex(siteId, url) {
  const saStr = await db.getGscSa(siteId).catch(() => null);
  if (!saStr) return { skipped: true, reason: 'Google not connected — content updated, but not auto-submitted for indexing.' };
  try {
    const r = await gscIndex.submitUrls(JSON.parse(saStr), [url], { type: 'URL_UPDATED' });
    return { ok: true, result: r };
  } catch (e) {
    return { error: 'Indexed-submit failed: ' + e.message + ' — enable the Indexing API and make the service account an OWNER of the property.' };
  }
}

// Sentinel's outbound (egress) IP — what a site's firewall sees. Cached 1h.
// Needed so users can allowlist us in Wordfence/Sucuri/etc.
let _egressIp = { v: null, exp: 0 };
async function serverEgressIp() {
  if (_egressIp.v && _egressIp.exp > Date.now()) return _egressIp.v;
  for (const u of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
    try { const r = await fetch(u); if (r.ok) { const ip = (await r.text()).trim(); if (/^[0-9a-f:.]{3,45}$/i.test(ip)) { _egressIp = { v: ip, exp: Date.now() + 3600000 }; return ip; } } } catch (e) {}
  }
  return null;
}

// Representative sample inputs for the "Test this prompt" preview, DERIVED FROM THE
// SELECTED SITE so the test reflects the site you're working on (not a hardcoded
// go-visa/go-legal topic). Each runs the prompt as the SYSTEM with this user message,
// on the right engine. `site` may be null (falls back to neutral wording).
function sampleFor(key, site) {
  const s = site || {};
  const name = s.name || 'your site';
  const url = s.url || '';
  const niche = (s.stack && s.stack.type) || s.niche || 'this site’s topic';
  const topic = niche;
  const mkt = (s.semrush_db ? String(s.semrush_db) : 'uk').toUpperCase();
  const M = {
    'content.rules': { engine: 'claude', user: `Write a meta description (140-160 characters) for a ${mkt} ${name} page about ${topic}. Output only the meta description.` },
    'content.cluster': { engine: 'claude', user: `Site: ${name}. Niche: ${niche} (${mkt}).\nKeywords (with volume):\n${topic} (2900)\nbest ${topic} (1600)\n${topic} cost (880)\nhow to choose ${topic} (520)\n${topic} explained (390)\nReturn the clustered JSON.` },
    'content.brief': { engine: 'claude', user: `KEYWORD: ${topic}\nINTENT: informational\n\n=== GROUNDED SUMMARY ===\nA concise, factual overview of ${topic} for a ${mkt} audience on ${name}.\n\n=== SOURCES ===\n[1] Official ${mkt} source\n\n=== INTERNAL-LINK CANDIDATES ===\nRelated guide → /guide\n\nWrite the ${mkt} content brief as JSON for ${name}.` },
    'research.ukScope': { engine: 'perplexity', user: `Briefly, for a ${mkt} audience: give the key current facts about ${topic}.` },
    'research.gather': { engine: 'perplexity', user: `Topic: ${topic} (${mkt})\n\nGive the key current facts, recent changes, and the main questions ${mkt} readers ask.` },
    'research.trending': { engine: 'perplexity', user: `Niche: ${niche} (${mkt}). What is trending this week?` },
    'research.facts': { engine: 'perplexity', user: `Topic: ${topic} (${mkt}). List the current facts most useful to cite.` },
    'seo.internalLinks': { engine: 'claude', user: `SOURCE PAGE: ${topic} explained (/guide)\n\nSOURCE TEXT: A ${mkt} guide to ${topic} for ${name} readers, covering the basics, costs and how to choose.\n\nCANDIDATE TARGET PAGES:\n1. ${topic} costs → /costs\n2. How to choose ${topic} → /choose\n\nReturn the JSON array.` },
    'seo.externalLinks': { engine: 'claude', user: `PAGE URL: /guide\nTITLE: ${topic} guide\nNICHE: ${niche}\n\nPAGE TEXT (excerpt):\nA ${mkt} overview of ${topic} for ${name} readers, with the key facts and where official guidance is published.\n\nReturn the JSON array of authoritative external-link suggestions.` },
    'seo.pageFacts': { engine: 'claude', user: `URL: /guide\nTITLE: ${topic} guide\n\nPAGE TEXT: A ${mkt} overview of ${topic} for ${name} readers, including the key facts, requirements and typical costs.\n\nReturn the JSON.` },
    'report.narrate': { engine: 'claude', user: `Site: ${name}\n\nComputed metrics:\n{"trafficValue":{"totalEstValue":4200,"currency":"GBP","valueAtRisk":900},"audit":{"latestComposite":78,"delta":-3},"search":{"clicks28":1200}}\n\nWrite the weekly executive briefing.` },
    'plan.project': { engine: 'claude', user: `Site: ${name}${url ? ' (' + url + ')' : ''}\nNiche: ${niche} (${mkt})\nGoals: reach 100/100 Lighthouse + improve content.\nCurrent scores: {"performance":62,"seo":85}\n\nWrite the plan.` },
    'chat.assistant': { engine: 'claude', user: `Give me one concrete, high-impact SEO action for ${name} this week.` },
  };
  return M[key] || { engine: 'claude', user: `Briefly demonstrate how you respond to a typical request for ${name}.` };
}

// --- route handlers --------------------------------------------------------
const routes = {
  // Health check
  'GET /health': async () => ({ ok: true, engine: 'wp-seo-agent', version: '2.0' }),
  // Sentinel's outbound IP — to allowlist in a site's security plugin/firewall.
  'GET /server-ip': async () => ({ ip: await serverEgressIp() }),
  'POST /server-ip': async () => ({ ip: await serverEgressIp() }),
  // Live-site health: what actually renders the public domain (WordPress / Drupal
  // / Wix / parked). Drives the "edits won't show on your live site" banner so we
  // never silently edit a WordPress backend that isn't what the domain serves.
  'POST /site-health': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const url = body.url || (site && (site.url || site._rawUrl));
    if (!url) return { error: 'No site URL' };
    const live = await detectLiveCms(url).catch((e) => ({ cms: 'Unknown', isWordPress: false, nonWordPress: false, error: e.message }));
    return {
      url, liveCms: live.cms, isWordPress: !!live.isWordPress, nonWordPress: !!live.nonWordPress, parked: !!live.parked,
      reachable: live.reachable !== false, title: live.title || '',
      mismatch: live.nonWordPress
        ? (live.parked
            ? `This domain appears to be parked / for sale. There’s no live WordPress site to optimize.`
            : `Your live site is served by ${live.cms}, not WordPress. On-page fixes Sentinel applies to the WordPress install will NOT appear on the live ${live.cms} pages.`)
        : null,
    };
  },
  // Observability: live load, provider limiter/breaker state, cache hit rates.
  'GET /status': async () => ({ ok: true, version: '2.0', buildId: BUILD_ID, uptimeSec: Math.round(process.uptime()), inFlight: INFLIGHT, infra: infraStats(), jobs: jobs.stats(), ux: { enabled: process.env.RUM_ENABLED === 'true', ...uxStats } }),

  // FULL-SYSTEM SELF-TEST — every subsystem × every site, entirely backend-side (read-only;
  // each check individually timeout-bounded). `siteId` optional to test one site.
  // curl -X POST <base>/selftest-full  → pass/warn/fail matrix. The no-frontend test rig.
  'POST /selftest-full': async (body) => selftest.runSelftest({ siteId: body.siteId }),

  // Persisted, SERVER-enforced kill switch (see dispatcher). {on:boolean} to set; no body reads.
  'POST /kill-switch': async (body) => {
    if (typeof body.on === 'boolean') {
      await db.setAppSecret('kill_switch', body.on ? '1' : '');
      _kill = { v: body.on, exp: Date.now() + 10000 };
      await db.logActivity({ type: 'config', actor: 'You', icon: 'alert', text: body.on ? 'KILL SWITCH ENGAGED — all live writes paused (server-enforced)' : 'Kill switch released — writes re-enabled', meta: 'server-side' }).catch(() => {});
    }
    return { on: await killSwitchOn() };
  },

  // ── Durable job queue ──────────────────────────────────────────────────────
  // Enqueue a registered background job → returns the job (poll /jobs/get).
  'POST /jobs/run': async (body) => {
    if (!body.type) return { error: 'type required' };
    try {
      const payload = body.payload || {};
      return await jobs.enqueue(body.type, payload, { siteId: body.siteId || payload.siteId || null, idempotencyKey: body.idempotencyKey || null });
    } catch (e) { return { error: e.message }; }
  },
  'POST /jobs/get': async (body) => { const j = await jobs.getJob(body.id); return j || { error: 'job not found' }; },
  'POST /jobs/list': async (body) => ({ jobs: await jobs.listJobs(body.siteId || null, body.limit || 20) }),

  // SECURE multi-site connect: validate creds → detect stack → store the site
  // with the app password ENCRYPTED in Supabase → return the new site (no secret).
  // This is the canonical "Add a WordPress account" path. Generic for any site.
  'POST /site-connect': async (body) => {
    const creds = body.creds;
    if (!creds?.baseUrl || !creds?.username || !creds?.appPassword) {
      throw new Error('Provide baseUrl, username, appPassword');
    }
    const wp = clientFrom(creds);
    let me;
    try { me = await wp.whoAmI(); }                       // validates auth
    catch (e) {
      const msg = String((e && e.message) || e);
      if (/blocked|security reasons|firewall|cloudflare|\b403\b|forbidden/i.test(msg)) {
        const ip = await serverEgressIp().catch(() => null);
        throw new Error(`A security plugin/firewall on this site (e.g. Wordfence or Sucuri) is BLOCKING Sentinel’s server${ip ? ` — our IP is ${ip}` : ''}. It was likely auto-blocked by earlier failed-login attempts. Fix: in Wordfence → Tools → Live Traffic / Blocking, remove the block, then All Options → "Allowlisted IP addresses" add ${ip || 'our IP'}. (Or briefly disable the firewall.) Then reconnect.`);
      }
      if (/401|not currently logged in|rest_not_logged_in|incorrect password|invalid/i.test(msg)) {
        throw new Error('WordPress rejected the login (401). Create a fresh Application Password on this site (Users → Profile → Application Passwords) and reconnect — use the WordPress username, not the email, if the email keeps failing.');
      }
      throw new Error('Could not connect: ' + msg.slice(0, 200));
    }
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
      stack: det.stack || null, scale: det.scale || null, caps: body.caps || det.caps || null,
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

  // Re-detect a STORED site's stack by siteId (no app password needed) and update
  // the saved mu_plugin / selftest / stack / scale. The mu_plugin flag is captured
  // at connect time, so it goes stale after the plugin is installed/updated — this
  // lets the Sites screen refresh detection without reconnecting.
  'POST /site-redetect': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const { creds } = await resolveCreds(body);
    const wp = clientFrom(creds);
    const det = await detectStack(wp, creds.baseUrl).catch((e) => ({ error: String((e && e.message) || e) }));
    if (det.error) return { error: 'Detection failed: ' + det.error };
    const patch = { mu_plugin: !!det.muPlugin, selftest: det.selftest || 'missing', stack: det.stack || null, scale: det.scale || null, caps: det.caps || null };
    await db.updateSite(body.siteId, patch).catch(() => {});
    return { ok: true, siteId: body.siteId, muPlugin: !!det.muPlugin, selftest: det.selftest || 'missing', stack: det.stack || null };
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
    // Pick the meta storage that matches the site's DETECTED SEO plugin so writes
    // actually render (Rank Math keys are inert on a site with no SEO plugin).
    let seoPlugin = body.seoPlugin || null;
    if (!seoPlugin && body.siteId) {
      const site = await db.getSite(body.siteId).catch(() => null);
      seoPlugin = (site && site.stack && site.stack.seo) || null;
    }
    return auditPage(body.url, { creds: body.creds, withContent: !!body.withContent, siteId: body.siteId, seoPlugin });
  },

  // Single finding → one draft proposal (the "Propose fix" button)
  'POST /propose-fix': async (body) => {
    return { proposal: proposeFromFinding(body.finding || {}) };
  },

  // SCOPE-AWARE AUDIT (background job): the modal's Single/Key/Full-site selector was
  // dead — every choice audited only the homepage. Key = home + top pages from the
  // sitemap; Full = home + a sample across the sitemap. Runs page-by-page in the
  // background (each page is a full PSI pass, ~25s) with real progress; results merge
  // into one report (scores averaged, findings/proposals concatenated per page).
  'POST /audit-scope-start': async (body) => {
    if (!body.siteId || !body.url) return { error: 'siteId + url required' };
    const cur = AUDIT_RUNS.get(body.siteId);
    if (cur && cur.status === 'running') return { status: 'running', progress: cur.progress };
    const scope = body.scope === 'full' ? 'full' : body.scope === 'key' ? 'key' : 'single';
    const site = await db.getSite(body.siteId).catch(() => null);
    const seoPlugin = (site && site.stack && site.stack.seo) || null;
    const home = String(body.url).replace(/\/$/, '') + '/';
    // Enumerate target URLs up front so progress has a real total.
    let urls = [home];
    if (scope !== 'single') {
      try {
        const found = await discoverUrls({ baseUrl: home.replace(/\/$/, ''), max: 500 });
        const list = (found && (found.urls || found)) || [];
        const others = list.map(String).filter((u) => u.replace(/\/$/, '') !== home.replace(/\/$/, ''));
        if (scope === 'key') {
          // "Key pages" = the shallowest paths (top-level templates & money pages).
          others.sort((a, b) => (a.split('/').filter(Boolean).length - b.split('/').filter(Boolean).length) || (a.length - b.length));
          urls = [home, ...others.slice(0, 4)];
        } else {
          // "Full (sampled)" = an even sample across the whole sitemap, 12 pages max.
          const stride = Math.max(1, Math.floor(others.length / 11));
          urls = [home, ...others.filter((_, i) => i % stride === 0).slice(0, 11)];
        }
      } catch (e) { /* sitemap unreachable → single-page fallback, reported in result */ }
    }
    AUDIT_RUNS.set(body.siteId, { status: 'running', progress: { done: 0, total: urls.length, current: urls[0] }, at: Date.now() });
    (async () => {
      const pages = [];
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        const run = AUDIT_RUNS.get(body.siteId);
        if (!run || run.status !== 'running') return;   // superseded
        run.progress = { done: i, total: urls.length, current: u };
        try {
          // withContent (Claude-drafted metadata) only for the homepage — per-page Claude
          // drafting across 12 pages would be slow and costly for marginal gain.
          const r = await auditPage(u, { creds: body.creds, withContent: i === 0 && !!body.withContent, siteId: body.siteId, seoPlugin });
          pages.push({ url: u, ...r });
        } catch (e) { pages.push({ url: u, error: String(e && e.message || e).slice(0, 200) }); }
      }
      const okPages = pages.filter((p) => !p.error && p.scores);
      if (!okPages.length) { AUDIT_RUNS.set(body.siteId, { status: 'error', error: 'Every page audit failed — ' + (pages[0] && pages[0].error || 'unknown'), at: Date.now() }); return; }
      // Merge: average category scores (homepage ×2 weight), concat findings/proposals.
      const scores = {};
      for (const k of ['performance', 'accessibility', 'bestPractices', 'seo']) {
        let sum = 0, w = 0;
        okPages.forEach((p, idx) => { const v = p.scores && p.scores[k]; if (v != null) { const wt = idx === 0 ? 2 : 1; sum += v * wt; w += wt; } });
        scores[k] = w ? Math.round(sum / w) : null;
      }
      const findings = okPages.flatMap((p) => p.findings || []);
      const proposals = okPages.flatMap((p) => p.proposals || []);
      const result = { scores, findings, proposals, cwv: okPages[0].cwv || null, scope, pagesAudited: okPages.length, pagesFailed: pages.length - okPages.length, urls: pages.map((p) => ({ url: p.url, error: p.error || null })) };
      AUDIT_RUNS.set(body.siteId, { status: 'done', result, at: Date.now() });
    })();
    return { status: 'running', progress: { done: 0, total: urls.length, current: urls[0] } };
  },
  'POST /audit-scope-status': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const r = AUDIT_RUNS.get(body.siteId);
    if (!r) return { status: 'unknown', reason: 'no active audit — it may have been lost to a restart; re-run' };
    if (Date.now() - r.at > 20 * 60 * 1000) { AUDIT_RUNS.delete(body.siteId); return { status: 'unknown', reason: 'expired — re-run' }; }
    if (r.status === 'done') return { status: 'done', ...r.result };
    if (r.status === 'error') return { status: 'error', error: r.error };
    return { status: 'running', progress: r.progress };
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
    let titles = Array.isArray(body.sampleTitles) ? body.sampleTitles.filter(Boolean) : [];
    let niche = body.niche;
    // Ground on the site's REAL page/post titles. Without them (the UI used to pass
    // an empty list + the tech-stack type as "niche"), Claude guessed the product
    // category from the brand name alone — e.g. "GoodFor" → employee-recognition
    // prompts for a food/skincare scanner. Fetch the actual titles like /content-intel.
    if (body.siteId && titles.length < 5) {
      try {
        const { creds, site } = await resolveCreds(body);
        const wp = clientFrom(creds);
        const got = [];
        try { const pages = await wp.list('pages', { perPage: 100, fields: 'title' }); for (const p of (pages || [])) got.push((p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim()); } catch (e) {}
        try { const posts = await wp.list('posts', { perPage: 100, fields: 'title' }); for (const p of (posts || [])) got.push((p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim()); } catch (e) {}
        const clean = got.filter(Boolean);
        if (clean.length) {
          const sample = [];
          const step = Math.max(1, Math.floor(clean.length / 30));
          for (let i = 0; i < clean.length && sample.length < 30; i += step) sample.push(clean[i]);
          titles = sample;
        }
        if (!niche && site && site.niche) niche = site.niche;
      } catch (e) { /* fall back to whatever the caller passed */ }
    }
    // Collect prompts already used in recent scans so each scan surfaces NEW
    // buyer-intent queries ("the ones we want to show up for") instead of repeats.
    let exclude = Array.isArray(body.exclude) ? body.exclude.filter(Boolean) : [];
    if (body.siteId) {
      try {
        const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/geo_runs?site_id=eq.${body.siteId}&select=results&order=created_at.desc&limit=6`, {
          headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE },
        });
        if (r.ok) { const rows = await r.json(); for (const row of (rows || [])) for (const res of (row.results || [])) if (res && res.prompt) exclude.push(res.prompt); }
      } catch (e) { /* best-effort — fall back to no exclusions */ }
    }
    exclude = [...new Set(exclude)];
    // Per-site operator context ("what this site is about") steers prompt generation.
    let context = body.context || '';
    if (!context && body.siteId) { try { const st = await db.getSite(body.siteId); if (st && st.geo_context) context = st.geo_context; } catch (e) {} }
    const prompts = await geo.suggestPrompts({ siteName: body.siteName, niche, sampleTitles: titles, exclude, context });
    return { prompts, groundedOn: titles.length, excluded: exclude.length, usedContext: !!context };
  },

  // Run a citation-tracking pass: query prompts via Claude+web-search, detect
  // whether the domain is cited, compute share-of-AI-voice vs competitors.
  'POST /geo-track': async (body) => {
    const out = await geo.runCitationTracking({
      siteId: body.siteId,
      targetDomain: body.targetDomain,
      prompts: body.prompts || [],
      competitors: body.competitors || [],
    });
    // Distinguish "genuinely 0 citations" from "the scan could not run". When web
    // search is unavailable (bad model/account, or a transient outage) EVERY prompt
    // errors, so runCitationTracking returns shareOfVoice:0 over an all-error results
    // array — indistinguishable from a real "not cited anywhere" result. Persisting
    // that writes a real-looking 0 into geo_runs (trend history + exec scorecard), so
    // if NO prompt actually completed we skip the write and surface the failure instead.
    const rows = Array.isArray(out && out.results) ? out.results : [];
    const errored = rows.filter((r) => r && r.error);
    const answered = rows.length - errored.length;
    out.promptsErrored = errored.length;
    if (rows.length && answered === 0) {
      return { error: 'AI-citation scan could not run — web search was unavailable for every prompt, so no scan was saved. Retry shortly.', scanFailed: true, promptsErrored: errored.length, promptsTotal: rows.length, sample: (errored[0] && errored[0].error) || null };
    }
    // Persist the run + the prompt set.
    if (body.siteId) {
      // Up/down vs the PREVIOUS scan — fetch the last run BEFORE inserting this one.
      try {
        const pr = await fetch(`${process.env.SUPABASE_URL}/rest/v1/geo_runs?site_id=eq.${body.siteId}&select=share_of_voice,prompts_cited,prompts_total,created_at&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } });
        if (pr.ok) { const rows = await pr.json(); const p = rows && rows[0]; if (p) { out.previous = { shareOfVoice: p.share_of_voice, promptsCited: p.prompts_cited, promptsTotal: p.prompts_total, at: p.created_at }; out.delta = { shareOfVoice: (out.shareOfVoice || 0) - (p.share_of_voice || 0), promptsCited: (out.promptsCited || 0) - (p.prompts_cited || 0) }; } }
      } catch (e) { /* best-effort delta */ }
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

  // Recent AI-visibility scans (newest first) — drives the scan-history/trend card.
  'POST /geo-history': async (body) => {
    if (!body.siteId) return { runs: [] };
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/geo_runs?site_id=eq.${body.siteId}&select=share_of_voice,prompts_cited,prompts_total,created_at&order=created_at.desc&limit=12`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } });
      if (!r.ok) return { runs: [] };
      const rows = await r.json();
      return { runs: (rows || []).map((x) => ({ shareOfVoice: x.share_of_voice, promptsCited: x.prompts_cited, promptsTotal: x.prompts_total, at: x.created_at })) };
    } catch (e) { return { runs: [], error: e.message }; }
  },

  // AI share-of-voice time-series (citation_snapshots): points oldest→newest +
  // latest/previous SoV delta + direction. Degrades gracefully ({ notProvisioned })
  // when the snapshots table hasn't been migrated yet.
  'POST /geo-citation-trend': async (body) => geo.citationTrend(body.siteId),

  // GEO enablement: generate llms.txt + AI-bot robots, and (when apply:true) PUBLISH
  // them to the live site via the mu-plugin (serves /llms.txt + merges robots.txt).
  'POST /geo-enable': async (body) => {
    const { creds, site } = await resolveCreds(body);
    const base = creds.baseUrl.replace(/\/$/, '');
    const wp = clientFrom(creds);
    // Ground llms.txt in REAL site data so it isn't a generic stub: the WP site
    // title + tagline, the actual key pages, and a Claude-written factual summary
    // + per-page notes. All best-effort — never blocks generation/publish.
    const clean = (t) => String(t || '').replace(/&#0*38;|&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
    let siteName = body.siteName || (site && site.name) || base;
    let tagline = '';
    try {
      const root = await (await fetch(base + '/wp-json', { headers: { 'User-Agent': 'wp-seo-agent/2.0' } })).json();
      if (root && root.name) siteName = clean(root.name);
      if (root && root.description) tagline = clean(root.description);
    } catch (e) { /* not reachable — keep stored name */ }
    let pages = Array.isArray(body.pages) ? body.pages : [];
    if (!pages.length) {
      try {
        const got = await wp.list('pages', { perPage: 100, fields: 'title,link' });
        pages = (got || []).map((p) => ({ title: clean(p.title && p.title.rendered), url: p.link })).filter((p) => p.title && p.url);
      } catch (e) {}
      if (pages.length < 3) {
        try {
          const posts = await wp.list('posts', { perPage: 20, fields: 'title,link' });
          for (const p of (posts || [])) { const t = clean(p.title && p.title.rendered); if (t && p.link) pages.push({ title: t, url: p.link }); }
        } catch (e) {}
      }
      pages = pages.slice(0, 15);
    }
    // Claude: concise factual summary + per-page notes (best-effort; falls back to tagline).
    let summary = body.summary || '';
    if (!summary || !pages.some((p) => p.note)) {
      const enr = await geo.summarizeForLlms({ siteName, tagline, pages });
      if (!summary) summary = enr.summary;
      pages = pages.map((p) => ({ ...p, note: p.note || (enr.notes && enr.notes[p.title]) || '' }));
    }
    const llms = geo.buildLlmsTxt({ siteName, baseUrl: base, summary, pages });
    // No Sitemap line — the mu-plugin MERGES this into the site's existing robots.txt
    // which already declares the correct sitemap (hardcoding sitemap_index.xml was
    // wrong for WP-core/wp-sitemap.xml sites and produced a duplicate/404 entry).
    const robots = geo.buildAiRobots({ allow: body.allow !== false });
    if (!body.apply) {
      return { llmsTxt: llms, aiRobots: robots, note: 'Review, then publish llms.txt at site root and merge the robots rules.' };
    }
    // Publish to the live site (requires the mu-plugin v1.8.0+ + write-armed).
    if (site && site.write_armed === false && !body.force) {
      return { llmsTxt: llms, aiRobots: robots, status: 'blocked', reason: 'site is read-only (write not armed)' };
    }
    const published = {};
    try { published.llms = await wp.publishLlmsTxt(llms); } catch (e) { published.llmsError = e.message; }
    try { published.robots = await wp.publishAiRobots(robots); } catch (e) { published.robotsError = e.message; }
    const ok = !!(published.llms && published.llms.ok && published.robots && published.robots.ok);
    const physicalRobots = !!(published.robots && published.robots.physicalRobots);
    if (site) {
      await db.logActivity({
        site_id: site.id, type: ok ? 'verified' : 'error', actor: 'Agent', icon: 'globe',
        text: 'Published llms.txt + AI-robots', meta: ok ? (base + '/llms.txt') : (published.llmsError || published.robotsError || 'publish failed'),
      }).catch(() => {});
    }
    return { llmsTxt: llms, aiRobots: robots, applied: true, ok, published, llmsUrl: base + '/llms.txt', physicalRobots };
  },

  // ── Experience Monitor (UX & conversion-defect monitoring) ─────────────────
  // ADDITIVE + INERT. Read/admin routes; the high-volume ingest is special-cased
  // before the dispatcher (see createServer). All of this returns empty/false until
  // RUM_ENABLED=true AND the site is armed (sites.rum_armed) — see EXPERIENCE-MONITOR-PLAN.md §12.
  'POST /beacon-status': async (body) => {
    const enabled = process.env.RUM_ENABLED === 'true';
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    let eventCount = 0;
    if (site) {
      try {
        const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ux_events?site_id=eq.${body.siteId}&select=id`, { method: 'GET', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, Prefer: 'count=exact', Range: '0-0' } });
        eventCount = Number((r.headers.get('content-range') || '').split('/')[1] || 0);
      } catch (e) { /* table may not exist yet → 0 */ }
    }
    return { enabled, armed: !!(site && site.rum_armed), signedOff: !!(site && site.rum_signed_off), hasKey: !!(site && site.rum_key), eventCount };
  },

  // Worklist — aggregated defects for a site. Derived metrics (defect_rate,
  // clicks_exposed) are computed HERE from the accumulated counts + the GSC clicks
  // joined in the rollup, so they're never stale. "exposed" is directional, not "lost".
  'POST /ux-defects': async (body) => {
    if (!body.siteId) return { defects: [], beacon: { armed: false } };
    const site = await db.getSite(body.siteId).catch(() => null);
    let rows = [];
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ux_defects?site_id=eq.${body.siteId}&status=eq.open&select=*&order=occurrences.desc&limit=300`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } });
      if (r.ok) rows = await r.json();
    } catch (e) { /* no table yet → empty worklist */ }
    const W = { high: 1, moderate: 0.5, low: 0.25 };
    const ALWAYS = new Set(['js_error', 'unhandled_rejection', 'broken_resource', 'ajax_4xx', 'dest_404']);  // captured at 100%, not sampled
    const defects = (rows || []).map((d) => {
      const sr = (d.sample_detail && Number(d.sample_detail.sr) > 0) ? Number(d.sample_detail.sr) : 1;
      // ALWAYS-types: occurrences are 100%-basis but pageviews_seen is sampled-basis — scale the
      // numerator by sr so the rate matches its denominator (prevents the ~100% inflation). Sampled
      // idle-scan types (broken_cta/form_validation) already share the sampled basis.
      const num = ALWAYS.has(d.event_type) ? (d.occurrences || 0) * sr : (d.occurrences || 0);
      const dr = d.pageviews_seen > 0 ? Math.min(num / d.pageviews_seen, 1) : null;
      const w = W[d.confidence] || 0.5;
      const exposed = (d.gsc_clicks != null && dr != null) ? Math.round(d.gsc_clicks * dr * w) : null;
      return { ...d, defect_rate: dr, clicks_exposed: exposed, rice_score: exposed };
    });
    defects.sort((a, b) => (b.clicks_exposed || 0) - (a.clicks_exposed || 0) || (b.occurrences || 0) - (a.occurrences || 0));
    const totals = { exposed: defects.reduce((s, d) => s + (d.clicks_exposed || 0), 0), defects: defects.length };
    return { defects: defects.slice(0, 200), totals, beacon: { armed: !!(site && site.rum_armed), signedOff: !!(site && site.rum_signed_off) } };
  },

  // Ignore / propose / apply on a defect. 'propose' (and 'apply', which v1 routes the
  // same way for human approval) create a normal `proposals` row → it flows through the
  // EXISTING Review Queue → approval → mu-plugin loop. No new fix-side write surface.
  'POST /ux-defect-action': async (body) => {
    if (!body.id || !body.siteId) return { error: 'id + siteId required' };
    const patch = async (fields) => fetch(`${process.env.SUPABASE_URL}/rest/v1/ux_defects?id=eq.${body.id}&site_id=eq.${body.siteId}`, { method: 'PATCH', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }) });
    if (body.action === 'ignore') {
      try { await patch({ status: 'ignored' }); } catch (e) { return { error: e.message }; }
      return { ok: true, status: 'ignored' };
    }
    if (body.action === 'propose' || body.action === 'apply') {
      // Load the defect, map it to a proposal via the remediation matrix, enqueue it.
      let d = null;
      try { const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ux_defects?id=eq.${body.id}&site_id=eq.${body.siteId}&select=*&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }); const rows = r.ok ? await r.json() : []; d = rows[0]; } catch (e) {}
      if (!d) return { error: 'defect not found' };
      // Mirror the frontend's createProposal: pass the site's owner (nullable in this
      // deployment — existing proposals carry null owner and insert/render fine).
      const siteRow = await db.getSite(body.siteId).catch(() => null);
      const det = d.sample_detail || {};
      const M = {
        broken_resource: { channel: 'rest-write', field: 'image URL', before: det.src || d.selector || d.page, after: 'Replace the broken image with a working same-origin URL.' },
        ajax_4xx: { channel: 'manual', field: 'endpoint', before: (det.src || '') + (det.status ? ' → ' + det.status : ''), after: 'Fix the failing first-party request / form handler.' },
        dest_404: { channel: 'rest-write', field: 'internal link', before: 'landed on 404, referred from ' + (det.referrer || d.page), after: 'Re-point the source link to the correct live URL (or add a 301).' },
        broken_cta: { channel: 'manual', field: 'CTA href', before: '“' + (det.label || '') + '” → ' + (d.selector || ''), after: 'Set the CTA href to its intended destination.' },
        form_validation: { channel: 'manual', field: (det.field || 'field') + ' (' + (det.validity || '') + ')', before: 'repeated validation failure', after: 'Clarify the field requirement / fix the validation rule.' },
        js_error: { channel: 'manual', field: 'JS error', before: det.message || '(uncaught error)', after: 'Investigate the uncaught JavaScript error on this page.' },
        unhandled_rejection: { channel: 'manual', field: 'JS promise', before: det.message || '(unhandled rejection)', after: 'Investigate the unhandled promise rejection on this page.' },
      };
      const m = M[d.event_type] || { channel: 'manual', field: d.event_type, before: d.selector || d.page, after: 'Review this UX defect.' };
      let created = null;
      try {
        created = await db.createProposal({
          site_id: body.siteId, owner: (siteRow && siteRow.owner) || null, finding_id: d.signature, disc: 'experience', risk: 'low',
          channel: m.channel, title: 'UX: ' + d.event_type.replace(/_/g, ' ') + ' — ' + d.page,
          page: d.page, impact: '+UX', target: 'staging', field: m.field,
          before_val: String(m.before).slice(0, 500), after_val: m.after, status: 'proposed',
        });
      } catch (e) { return { error: 'could not create proposal: ' + e.message }; }
      try { await patch({ status: 'proposed', proposal_id: created && created.id }); } catch (e) {}
      return { ok: true, status: 'proposed', proposalId: created && created.id, note: 'Added to the Review Queue — approve there to push it live.' };
    }
    return { error: 'unknown action' };
  },

  // Arm/disarm the beacon for a site. Gated on RUM_ENABLED + per-site compliance sign-off.
  // Mints a per-site rum_key and tells that site's mu-plugin to (de)activate the loader.
  'POST /arm-beacon': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    if (process.env.RUM_ENABLED !== 'true') return { ok: false, reason: 'disabled', note: 'Experience Monitor is off — set RUM_ENABLED=true on the server first.' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'site not found' };
    if (body.on && !site.rum_signed_off) return { ok: false, reason: 'not-signed-off', note: 'Complete the per-site compliance sign-off (sets rum_signed_off) before arming.' };
    let rumKey = site.rum_key;
    if (body.on && !rumKey) rumKey = createHmac('sha256', process.env.SITE_SECRET_KEY || 'sentinel').update(site.id + ':' + Date.now()).digest('base64url').slice(0, 32);
    await db.updateSite(body.siteId, { rum_armed: !!body.on, ...(rumKey ? { rum_key: rumKey } : {}) }).catch(() => {});
    try {
      const { creds } = await resolveCreds({ siteId: body.siteId });
      const wp = clientFrom(creds);
      const endpoint = process.env.PUBLIC_BASE_URL || 'https://sentinel-goodfor-2e75db85.koyeb.app';
      // Consent gate: the beacon stays inert until this cookie=value is present. Defaults to
      // Complianz's per-category statistics cookie (cmplz_statistics=allow), overridable per-arm
      // via body.consent. Fail-safe: if the cookie is never set, the beacon never collects.
      // Pass the caller's FULL consent gate through — some CMPs match a SUBSTRING
      // (`contains`, e.g. CookieYes cookieyes-consent=…analytics:yes; Cookiebot;
      // Borlabs; Moove) rather than an exact value; the beacon's consentPresent()
      // honours contains / value / any. Previously this rebuilt the gate from cookie+
      // value only, DROPPING `contains` and forcing value='allow' → those CMPs' gate
      // could never be satisfied and the beacon collected nothing. Falls back to
      // Complianz's cmplz_statistics=allow. Fail-safe: no cookie → never collects.
      let consent;
      if (body.consent && body.consent.cookie) {
        consent = { mode: 'required', cookie: String(body.consent.cookie) };
        if (body.consent.contains != null) consent.contains = String(body.consent.contains);
        else if (body.consent.value != null) consent.value = String(body.consent.value);
        // else: any non-empty value of that cookie counts as consent
      } else {
        consent = { mode: 'required', cookie: 'cmplz_statistics', value: 'allow' };
      }
      // Sample rate must be a 0–1 fraction (the beacon does Math.random() < sample).
      // Accept a percentage defensively (e.g. 5 → 0.05) so a UI that sends "5" for 5%
      // doesn't arm 100% sampling.
      let sample = Number(body.sample); if (!(sample > 0)) sample = Number(process.env.RUM_SAMPLE) || 0.05; if (sample > 1) sample = sample / 100;
      const cfg = { armed: !!body.on, key: rumKey || '', endpoint, sample, consent };
      await wp.request(`${creds.baseUrl}/wp-json/seoagent/v1/set-ux-beacon`, { method: 'POST', body: { config: cfg } });
    } catch (e) { return { ok: true, armed: !!body.on, warn: 'site flag set, but the mu-plugin loader was not updated (needs v1.9.0): ' + e.message }; }
    return { ok: true, armed: !!body.on };
  },

  // Record (or revoke) the per-site compliance sign-off (DPIA) that GATES arming.
  // This is the operator asserting the privacy review is done — it only flips the
  // rum_signed_off flag; it does NOT arm the beacon (that stays a separate, explicit
  // step in /arm-beacon). Without this route the flag had no setter, so no site could
  // ever be armed from the UI — the whole Experience Monitor stayed unusable.
  'POST /sign-off-compliance': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    if (body.on && !body.confirm) return { error: 'Confirm the compliance sign-off (DPIA) to proceed.', needsConfirm: true };
    try { await db.updateSite(body.siteId, { rum_signed_off: !!body.on }); }
    catch (e) { return { error: 'Could not record sign-off: ' + e.message }; }
    return { ok: true, signedOff: !!body.on };
  },

  // ── Static UX crawler (NO consent — the beacon's structural counterpart) ────
  // Fetches the site's top ORGANIC pages (GSC) and flags HTTP-verified breakage —
  // broken internal links, dead CTAs, broken images/scripts/styles — clicks-weighted.
  // `file:true` (and the weekly scheduler job) route findings into the Review Queue,
  // de-duped. No visitor is observed, so unlike the beacon this needs no sign-off.
  'POST /ux-crawl': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const site = await db.getSite(body.siteId).catch(() => null);
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    let topPages = [];
    if (saStr && site && site.gsc_property) {
      try { const snap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 }); topPages = snap.topPages || []; } catch (e) {}
    }
    if (!topPages.length && site && site.url) {
      topPages = [{ page: /^https?:/i.test(site.url) ? site.url : 'https://' + site.url, clicks: 0 }];  // fallback: scan the homepage
    }
    if (!topPages.length) return { error: 'No pages to scan — connect Google Search Console (or set the site URL) first.', needsConnect: true };
    const res = await uxcrawl.crawlSite(topPages, { limit: Math.min(body.limit || 10, 20) });
    if (body.file) { const filed = await uxcrawl.fileCrawlDefects(db, body.siteId, site, res.defects); return { ...res, filed: filed.filed, skipped: filed.skipped }; }
    return res;
  },
  // File selected crawl defects into the Review Queue (the "Send to review" action).
  'POST /ux-crawl-file': async (body) => {
    if (!body.siteId || !Array.isArray(body.defects)) return { error: 'siteId + defects[] required' };
    const site = await db.getSite(body.siteId).catch(() => null);
    const filed = await uxcrawl.fileCrawlDefects(db, body.siteId, site, body.defects);
    return { ok: true, ...filed };
  },

  // Probe a site's consent + tracker stack (READ-ONLY) — drives the UX Activation panel.
  // Detects the installed CMP + the consent cookie to gate on, lists trackers needing a
  // gate, and reports armed / signed-off / mu-plugin state. siteId optional → all sites.
  'POST /site-probe': async (body) => {
    const list = body.siteId ? [await db.getSite(body.siteId).catch(() => null)].filter(Boolean) : await db.listSites().catch(() => []);
    const sites = [];
    for (const site of list) {
      const row = { siteId: site.id, name: site.name, url: site.url, armed: !!site.rum_armed, signedOff: !!site.rum_signed_off, hasKey: !!site.rum_key };
      try {
        const { creds } = await resolveCreds({ siteId: site.id });
        const wp = clientFrom(creds);
        const plugins = await wp.request('/plugins?_fields=plugin,status&per_page=200').catch(() => null);
        if (Array.isArray(plugins)) {
          const active = plugins.filter((p) => p && p.status === 'active').map((p) => String(p.plugin || '').split('/')[0].toLowerCase());
          const { cmp, trackers } = adapters.detectConsent(active);
          row.pluginsReadable = true;
          row.cmp = cmp ? { name: cmp.name, slug: cmp.slug, cookie: cmp.cookie, value: cmp.value || null, contains: cmp.contains || null, review: !!cmp.review } : null;
          row.trackers = trackers.map((t) => ({ name: t.name, match: t.match }));
          row.consent = adapters.consentConfigFor(cmp);   // null → no CMP: needs first-party banner / manual install
        } else {
          row.pluginsReadable = false;   // WP /plugins blocked (security plugin/host) — mu-plugin probe is the fallback
        }
        const self = await wp.request(`${creds.baseUrl}/wp-json/seoagent/v1/optimize-selftest`).catch(() => null);
        row.muPlugin = self ? { reachable: true, version: (self && (self.version || self.v)) || null } : { reachable: false };
        row.bannerSupported = !!(self && Array.isArray(self.features) && self.features.indexOf('consent_banner') !== -1);
        // No third-party CMP, but our first-party banner is enabled → that's the consent source.
        if (!row.cmp && self && self.consent_banner_enabled) {
          row.cmp = { name: 'First-party banner', slug: 'seoagent', cookie: 'seoagent_consent', value: 'statistics', firstParty: true };
          row.consent = adapters.FIRST_PARTY_CONSENT;
        }
      } catch (e) { row.error = e.message; }
      sites.push(row);
    }
    return { sites, rumEnabled: process.env.RUM_ENABLED === 'true', muLatest: (() => { try { return readMuPlugin().version; } catch (e) { return null; } })() };
  },

  // Static self-test: fetch the homepage and verify the wiring observable server-side
  // (beacon loader + RUM config injected, a CMP present, tracker present + best-effort
  // neutralization). Cookie-on-accept + client-side blocking are verified in-browser, or
  // post-arm via /status ux.accepted climbing.
  'POST /beacon-selftest': async (body) => {
    const { creds } = await resolveCreds({ siteId: body.siteId });
    const base = String(creds.baseUrl || '').replace(/\/+$/, '');
    let html = '';
    try {
      const r = await fetch(base + '/?sentinel_selftest=' + Date.now(), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelSelfTest/1.0)' }, redirect: 'follow' });
      html = (await r.text()) || '';
    } catch (e) { return { error: 'fetch failed: ' + e.message }; }
    const lower = html.toLowerCase();
    const checks = {
      beaconLoaderPresent: /ux-beacon\.js/.test(lower),
      sentinelRumConfig: /__sentinel_rum/.test(lower),
      cmpPresent: /(cmplz|complianz|cookieyes|cookie-law-info|cookiebot|borlabs|moove_gdpr|cookie_notice)/.test(lower),
      hotjarPresent: /hotjar/.test(lower),
    };
    const m = lower.match(/<script[^>]*>[^]*?hotjar[^]*?<\/script>/);
    checks.hotjarNeutralizedServerSide = checks.hotjarPresent ? (m ? /text\/plain/.test(m[0]) : null) : null;   // advisory: many CMPs block client-side
    checks.firstPartyBannerPresent = /seoagent-consent/.test(lower);
    return { url: base, checks };
  },

  // Enable/disable the first-party consent banner on a site's mu-plugin (the no-CMP
  // fallback). Returns the consent config to arm with — gates the beacon on
  // seoagent_consent=statistics. Requires mu-plugin v1.10.0+.
  'POST /set-consent-banner': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const { creds } = await resolveCreds({ siteId: body.siteId });
    const wp = clientFrom(creds);
    const cfg = {
      enabled: body.enabled !== false,
      cookie: 'seoagent_consent',
      text: body.text || 'We use privacy-friendly analytics to understand how this site is used and improve it. No personal data, session recording, or cross-site tracking.',
      accept: body.accept || 'Accept',
      decline: body.decline || 'Decline',
      policyUrl: body.policyUrl || '',
      policyLabel: body.policyLabel || 'Privacy Policy',
    };
    try {
      const r = await wp.request(`${creds.baseUrl}/wp-json/seoagent/v1/set-consent-banner`, { method: 'POST', body: { config: cfg } });
      if (!r || r.ok !== true) return { error: 'mu-plugin did not accept the banner config (needs v1.10.0)' };
    } catch (e) { return { error: 'mu-plugin not updated (needs v1.10.0): ' + e.message }; }
    return { ok: true, enabled: cfg.enabled, consent: adapters.FIRST_PARTY_CONSENT };
  },

  // Self-update a site's mu-plugin to the canonical version shipped in this build. The code
  // travels through the authenticated channel (never a request-supplied URL); the mu-plugin
  // validates sha256 + markers + no-downgrade and health-checks with auto-rollback.
  'POST /push-mu-update': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    let mu;
    try { mu = readMuPlugin(); } catch (e) { return { error: 'canonical mu-plugin not in container: ' + e.message }; }
    if (!mu.version) return { error: 'could not parse canonical mu-plugin version' };
    const { creds } = await resolveCreds({ siteId: body.siteId });
    const wp = clientFrom(creds);
    try {
      const r = await wp.request(`${creds.baseUrl}/wp-json/seoagent/v1/self-update`, { method: 'POST', body: { code: mu.code, version: mu.version, sha256: mu.sha256 } });
      if (!r || r.ok !== true) return { error: 'self-update not confirmed', detail: r };
      return { ok: true, version: r.updated_to || mu.version };
    } catch (e) { return { error: 'self-update failed (site needs mu-plugin v1.11.0+ with /self-update installed once first): ' + e.message }; }
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
    const currency = semrush.currencyFor(body.db);
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
    if (!t) return { error: 'A domain is required.' };   // else DataForSEO returns a cryptic "Invalid Field: target"
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
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    if (site) {
      if (!competitors.length && Array.isArray(site.competitors)) competitors = site.competitors;
      if (Array.isArray(site.negative_keywords)) negatives = [...negatives, ...site.negative_keywords];
    }
    competitors = competitors.map((c) => (c || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    if (!competitors.length) return { error: 'No competitor set for this site. Add a competitor below first.', gaps: [] };
    // Pre-check units (gap needs ~2 pulls per competitor).
    const units = await semrush.apiUnits();
    if (units != null && units < 40) {
      return { error: `DataForSEO API units too low (${units} left) for a keyword-gap analysis — top up your DataForSEO plan.`, noUnits: true, unitsRemaining: units, gaps: [] };
    }
    // Run the gap for the TOP competitors in PARALLEL, merge + dedupe (keep highest
    // volume). Capped at 4: fast-ila has 12 saved competitors and the old unbounded
    // SERIAL loop could not fit inside the 95s request budget.
    const gapComps = competitors.slice(0, 4);
    const map = new Map(); let unitsErr = false;
    const settled = await Promise.all(gapComps.map((c) =>
      semrush.keywordGap(t, c, { db: body.db || 'uk', limit: 120, negatives, extraBrands: competitors.filter((x) => x !== c) })
        .then((r) => ({ c, r }), (e) => ({ c, e }))));
    for (const { c, r, e } of settled) {
      if (e) { if (e.code === 'NO_UNITS') unitsErr = true; continue; }
      for (const g of r.gaps) { const k = g.keyword.toLowerCase(); if (!map.has(k) || map.get(k).volume < g.volume) map.set(k, { ...g, competitor: c }); }
    }
    if (unitsErr && map.size === 0) { const u = await semrush.apiUnits(); return { error: `DataForSEO API units exhausted (${u} left).`, noUnits: true, unitsRemaining: u, gaps: [] }; }
    let gaps = [...map.values()].sort((a, b) => b.volume - a.volume);
    const rawCount = gaps.length;
    // Niche filter: drop keywords that don't fit THIS site's niche (uses geo_context),
    // so a broad competitor's off-topic keywords don't pollute the gap list. Fail-open.
    let offNicheFiltered = 0;
    if (site && site.geo_context && gaps.length && body.nicheFilter !== false) {
      try {
        const candidates = gaps.slice(0, 200);   // filter the top-volume slice (Haiku, fast) — matches the model's 200-keyword window
        const keep = await claude.filterKeywordsByNiche({ keywords: candidates.map((g) => g.keyword), niche: nicheWithMarket(site, body.db || (site && site.semrush_db)), siteName: site.name, siteId: body.siteId });
        const keepSet = new Set(keep.map((k) => String(k).toLowerCase().trim()));
        const nf = candidates.filter((g) => keepSet.has(g.keyword.toLowerCase().trim()));
        if (nf.length) { offNicheFiltered = candidates.length - nf.length; gaps = nf; }
      } catch (e) { /* fail-open: keep unfiltered */ }
    }
    gaps = gaps.slice(0, body.limit || 80);
    return { target: t, competitors, gapCount: gaps.length, offNicheFiltered, gaps };
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
        const saveRow = {
          messages: [...display, { role: 'assistant', text: r.reply, tools: r.toolsUsed || [] }],
          apiHistory: r.messages, messageCount: (display.length || 0) + 1, siteId: body.siteId,
        };
        const saved = await db.saveConversation(convoId, saveRow);
        if (!saved && body.conversationId) {
          // Supplied conversationId isn't this site's → don't cross-write; persist to a fresh one.
          const c = await db.createConversation(body.siteId, (body.text || 'New chat').slice(0, 60));
          convoId = c.id;
          await db.saveConversation(convoId, saveRow);
        }
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

  // Disconnect: the connection is global (one Google account), so disconnecting
  // clears the credential + selected property for ALL sites.
  'POST /gsc-disconnect': async () => {
    // GSC is a SHARED credential here ("connect once on any site → covers all"; getGscSa
    // falls back to any connected site's SA). A per-site disconnect can't hold — clearing
    // one site's SA just re-resolves via the fallback — so disconnect is GLOBAL and the UI
    // says so. Clears every site's stored GSC credential.
    await db.clearAllGscSa().catch(() => {});
    return { ok: true, all: true };
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
        const summary = tv.summarize(valued, { currency: semrush.currencyFor(site.semrush_db) });
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
      const narrative = await claude.narrate({ siteName: (metrics.site && metrics.site.name) || 'this site', metrics, siteId: (metrics.site && metrics.site.id) || body.siteId });
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
        excludeDomain, internalLinkCandidates, siteId: body.siteId, db: site && site.semrush_db, now: Date.now(),
      });
    } catch (e) { return { error: 'Brief generation failed: ' + e.message }; }
  },
  // Background wrapper — a content brief does SERP research + several Claude calls and can
  // run past the ~95s request cap (504'd at 102s on a slow keyword). Start → poll, same
  // pattern as the audit/metadata/media jobs. Keyed by siteId (the UI runs one at a time).
  'POST /content-brief-start': async (body) => {
    if (!body.keyword) return { error: 'A keyword/cluster is required.' };
    const key = body.siteId || 'nosite';
    const cur = BRIEF_RUNS.get(key);
    if (cur && cur.status === 'running') return { status: 'running' };
    BRIEF_RUNS.set(key, { status: 'running', at: Date.now(), keyword: body.keyword });
    (async () => {
      try {
        const r = await routes['POST /content-brief'](body);
        BRIEF_RUNS.set(key, { status: r && r.error ? 'error' : 'done', result: r, error: r && r.error, at: Date.now(), keyword: body.keyword });
      } catch (e) { BRIEF_RUNS.set(key, { status: 'error', error: String(e && e.message || e), at: Date.now() }); }
    })();
    return { status: 'running' };
  },
  'POST /content-brief-status': async (body) => {
    const key = body.siteId || 'nosite';
    const r = BRIEF_RUNS.get(key);
    if (!r) return { status: 'unknown', reason: 'no active run — re-run' };
    if (Date.now() - r.at > 10 * 60 * 1000) { BRIEF_RUNS.delete(key); return { status: 'unknown', reason: 'expired — re-run' }; }
    if (r.status === 'done') return { status: 'done', ...(r.result || {}) };
    if (r.status === 'error') return { status: 'error', error: r.error };
    return { status: 'running', keyword: r.keyword };
  },
  // Turn a short gap keyword into a publishable article TITLE (niche-grounded). Fast — no
  // research — so the Keyword Gap "plan article" flow can regenerate the title on feedback.
  'POST /gap-title': async (body) => {
    if (!body.keyword) return { error: 'A keyword is required.' };
    try {
      const title = await claude.gapTitle({ keyword: body.keyword, angle: body.angle, current: body.currentTitle, feedback: body.feedback, siteId: body.siteId });
      return { title };
    } catch (e) { return { error: 'Title generation failed: ' + String(e.message || e).slice(0, 80) }; }
  },

  // Live UK trending intelligence for a niche (news-weighted), with sources.
  'POST /trending-intel': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    // The site's geo_context describes WHAT it does + WHO it serves — the real niche signal
    // (there is no `niche` column; stack.type is empty + name is just a domain → generic news).
    // Focus on the niche-defining sections (ground truth / audience / services) and DROP the
    // platform-Role/Precedence/compliance boilerplate, which otherwise drowns the niche signal.
    const gc = body.context || (site && site.geo_context) || '';
    let context = '';
    if (gc) {
      const wanted = /ground truth|canonical|audience|scope|what we|services|about|brand|positioning|specialis|we provide|we offer|cover/i;
      const secs = gc.split(/\n(?=#{1,3}\s)/).filter((s) => wanted.test((s.split('\n')[0] || '')));
      context = (secs.join('\n\n') || gc).slice(0, 6000);
    }
    const niche = body.niche || (site && site.stack && site.stack.type) || (site && site.name) || 'this site';
    if (!context && !niche) return { error: 'No niche to research.' };
    try { return await research.trendingIntel({ niche, context, db: body.db || (site && site.semrush_db), now: Date.now() }); }
    catch (e) { return { error: 'Trending analysis failed: ' + e.message }; }
  },

  // Research-engine status (which keys are configured).
  'POST /research-status': async () => research.status(),

  // ── Prompt admin (editable system prompts, live via Supabase) ───────────
  'POST /prompts-list': async (body) => ({ prompts: prompts.list(body && body.siteId), status: prompts.status() }),
  'POST /prompt-save': async (body) => {
    if (!body.key || body.content == null) return { error: 'key and content required' };
    try { await prompts.save(body.key, body.content, { model: body.model, temperature: body.temperature, siteId: body.siteId || null }); return { ok: true, key: body.key, siteId: body.siteId || null }; }
    catch (e) { return { error: e.message }; }
  },
  'POST /prompt-reset': async (body) => {
    if (!body.key) return { error: 'key required' };
    try { const def = await prompts.resetToDefault(body.key, body.siteId || null); return { ok: true, content: def }; }
    catch (e) { return { error: e.message }; }
  },
  'POST /prompts-status': async () => prompts.status(),
  // Admin control-centre status: integrations, balances, server + prompt health.
  // Observability: recent route errors + per-route health for the Health panel, so a
  // feature failing in the wild surfaces instead of being found by clicking a dead button.
  'POST /admin-health': async () => {
    const routesArr = [...ROUTE_STATS.entries()].map(([key, s]) => ({
      key, ok: s.ok, err: s.err, lastOk: s.lastOk, lastErr: s.lastErr, lastErrMsg: s.lastErrMsg,
      errRate: (s.ok + s.err) ? Math.round((s.err / (s.ok + s.err)) * 100) : 0,
    })).sort((a, b) => (b.err - a.err) || (b.errRate - a.errRate));
    return {
      now: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      errors: ERR_RING.slice(-40).reverse(),
      routes: routesArr,
      summary: {
        routesTracked: routesArr.length,
        totalOk: routesArr.reduce((n, r) => n + r.ok, 0),
        totalErrors: routesArr.reduce((n, r) => n + r.err, 0),
        failing: routesArr.filter((r) => r.err > 0 && r.errRate >= 25).map((r) => r.key),
      },
    };
  },

  'POST /admin-status': async (body) => {
    const r = research.status();
    let dfsBalance = null;
    try { if (semrush.hasKey()) dfsBalance = await semrush.apiUnits(); } catch (e) {}
    // Per-active-site target market (semrush_db) drives the displayed scope — no longer
    // a hardcoded "UK only". Falls back to UK when no site is passed (back-compat).
    const scopeSite = body && body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const scopeMarket = marketFor(scopeSite && scopeSite.semrush_db);
    // The DRY_RUN env gates nothing on the write routes (they use verify-after-write +
    // per-site write_armed + the kill switch), so reporting it as "no live writes" was
    // false. Expose the REAL server-enforced global gate — the kill switch — instead.
    const killSwitch = await killSwitchOn().catch(() => false);
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
      server: { version: '2.0', uptimeSec: Math.round(process.uptime()), node: process.version, model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929', killSwitch, writesPaused: killSwitch },
      country: scopeMarket.country,
      scope: `${scopeMarket.country}${scopeMarket.db === 'uk' ? ' (UK-only)' : ''}`,
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
    // Run the preview AGAINST THE SELECTED SITE: load it, derive a site-relevant sample,
    // and prepend the active-site context the real flows inject — so testing fast-ila
    // reflects fast-ila, not whatever site the global prompt was authored for.
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const sample = sampleFor(key, site);
    try {
      // Honour the per-prompt model/temperature (use the unsaved values if sent).
      const model = body.model !== undefined ? body.model : prompts.modelFor(key);
      const temperature = body.temperature !== undefined && body.temperature !== '' && body.temperature != null ? Number(body.temperature) : prompts.tempFor(key);
      if (sample.engine === 'perplexity') {
        if (!perplexity.hasKey()) return { error: 'Perplexity not configured — cannot test research prompts.' };
        const r = await perplexity.ask({ system: content, user: sample.user, model: model || 'fast', temperature: temperature != null ? temperature : undefined, maxTokens: 500 });
        return { output: r.answer, engine: 'perplexity', model: model || 'fast', sources: r.sources, cost: r.cost, site: site ? site.name : null };
      }
      const siteBlock = site ? `ACTIVE SITE: ${site.name}${site.url ? ' (' + site.url + ')' : ''}${site.stack && site.stack.type ? ' — ' + site.stack.type : ''}. Target market: ${(site.semrush_db || 'uk').toString().toUpperCase()}. Write specifically for THIS site.\n\n` : '';
      const txt = await claude.complete({ system: [{ type: 'text', text: siteBlock + content }], messages: [{ role: 'user', content: sample.user }], maxTokens: 800, model: model || undefined, temperature: temperature != null ? temperature : 0.3 });
      return { output: txt, engine: 'claude', model: model || 'default', site: site ? site.name : null };
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

  // Same analysis, run as a BACKGROUND job so it can never hit the ~95s request cap
  // (GSC + DataForSEO pulls + a large Claude clustering call routinely exceed it, which
  // surfaced to the operator as "That request took too long and timed out"). Mirrors the
  // content-engine startRun/runStatus pattern: start returns immediately, the UI polls.
  'POST /content-opportunities-start': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const cur = OPP_RUNS.get(body.siteId);
    if (cur && cur.status === 'running') return { status: 'running', at: cur.at };
    OPP_RUNS.set(body.siteId, { status: 'running', at: Date.now() });
    (async () => {
      try {
        const r = await findOpportunities(body.siteId, { db: body.db, maxKeywords: body.maxKeywords || 160, includeTrending: body.includeTrending !== false, longRun: true });
        OPP_RUNS.set(body.siteId, { status: 'done', result: r, at: Date.now() });
      } catch (e) {
        OPP_RUNS.set(body.siteId, { status: 'error', error: 'Content-opportunity analysis failed: ' + (e && e.message || e), at: Date.now() });
      }
    })();
    return { status: 'running', at: Date.now() };
  },
  'POST /content-opportunities-status': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const r = OPP_RUNS.get(body.siteId);
    if (!r) return { status: 'unknown', reason: 'no active run — it may have completed or been lost to a restart; re-run' };
    // RESULTS ARE NOT CONSUMED ON READ: the operator navigates away mid-run and comes back,
    // and the screen must still be able to show what finished. Kept for OPP_TTL_MS, so a
    // run started on one screen is still there when they return (and keeps polling if it's
    // still going). Cleared on a fresh start, or when it ages out.
    const OPP_TTL_MS = 15 * 60 * 1000;
    if (Date.now() - r.at > OPP_TTL_MS) { OPP_RUNS.delete(body.siteId); return { status: 'unknown', reason: 'the last run has expired — re-run' }; }
    if (r.status === 'done') return { status: 'done', at: r.at, ...(r.result || {}) };
    if (r.status === 'error') return { status: 'error', error: r.error, at: r.at };
    return { status: 'running', at: r.at };
  },

  // People Also Ask: real Google PAA questions for a seed keyword, in the active
  // site's market (semrush_db). Read-only research; the UI pushes the questions to
  // the Airtable keyword column so the writer answers one per article. Uses the
  // existing DataForSEO account (SERP advanced) — no new vendor/key.
  'POST /people-also-ask': async (body) => {
    if (!semrush.hasKey()) return { error: 'DataForSEO not configured — add DATAFORSEO_LOGIN + API password.' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const market = (site && site.semrush_db) || body.db || 'uk';
    // Seed is now OPTIONAL: with no keyword we derive seeds from THIS site's own context —
    // its highest-volume ranking keywords, else its geo_context service description. The
    // operator shouldn't have to guess a seed for their own site.
    let seed = String(body.keyword || '').trim();
    const derived = [];
    if (!seed) {
      if (!site) return { error: 'A seed keyword is required (no site selected).' };
      // 1) the site's own ranking keywords — highest volume first (real demand, on-topic).
      //    A site ranks for plenty of BRAND and off-market terms (e.g. a competitor's brand,
      //    or another country's system). Those make terrible seeds: Google answers them
      //    literally and the whole PAA set ends up about that brand/country. So the
      //    candidates are service-filtered (market-aware) BEFORE we pick the top 3.
      try {
        const dom = (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const kw = await semrush.organicKeywords(dom, { db: market, limit: 60 });   // returns a bare array
        const rows = (Array.isArray(kw) ? kw : (kw && (kw.keywords || kw.rows)) || [])
          .filter((k) => k && k.keyword && String(k.keyword).split(/\s+/).length <= 6)
          .sort((a, b) => (b.volume || 0) - (a.volume || 0));
        let cand = rows.slice(0, 40).map((k) => k.keyword);
        if (site.geo_context && cand.length) {
          try {
            const keep = await claude.filterKeywordsByNiche({ keywords: cand, niche: nicheWithMarket(site, market), siteName: site.name, siteId: body.siteId });
            const keepSet = new Set(keep.map((k) => String(k).toLowerCase().trim()));
            const onService = cand.filter((k) => keepSet.has(String(k).toLowerCase().trim()));
            if (onService.length) cand = onService;
          } catch (e) { /* fail-open: use the unfiltered candidates */ }
        }
        for (const k of cand.slice(0, 3)) derived.push(k);
      } catch (e) { /* fall through to context-derived seeds */ }
      // 2) fall back to distilling the site's niche/service context into search-like seeds.
      if (!derived.length && site.geo_context) {
        try {
          const txt = await claude.complete({
            system: [{ type: 'text', text: 'You turn a website\'s service description into the SHORT search queries its customers actually type into Google. Return ONLY a JSON array of 3 lowercase query strings, 2-5 words each, no brand names, no prose.' }],
            model: 'claude-haiku-4-5-20251001', maxTokens: 300, temperature: 0,
            messages: [{ role: 'user', content: `SITE: ${site.name || ''}\n\nWHAT THIS SITE DOES:\n${String(site.geo_context).slice(0, 2000)}\n\nReturn the JSON array of 3 seed queries.` }],
          });
          const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
          for (const q of arr.slice(0, 3)) if (q && String(q).trim()) derived.push(String(q).trim());
        } catch (e) { /* leave derived empty */ }
      }
      if (!derived.length) return { error: 'Could not derive a seed from this site — add site context (Settings) or type a keyword.' };
      seed = derived[0];
    }
    // Query each seed (bounded to 3) and merge, de-duped by question text.
    const seeds = derived.length ? derived.slice(0, 3) : [seed];
    // PARALLEL — each seed is an independent DataForSEO SERP call; serially, 3 seeds at
    // depth 2 could outrun the request cap.
    const settled = await Promise.all(seeds.map((s) =>
      semrush.peopleAlsoAsk(s, { db: market, depth: body.depth || 2 }).then((r) => ({ r }), (e) => ({ e }))));
    if (settled.every((x) => x.e)) {
      const noUnits = settled.some((x) => x.e && x.e.code === 'NO_UNITS');
      return { error: noUnits ? 'DataForSEO balance exhausted — top up at app.dataforseo.com' : ('People Also Ask lookup failed: ' + (settled[0].e && settled[0].e.message || 'unknown error')) };
    }
    let res = null;
    for (const { r: one } of settled.filter((x) => x.r)) {
      if (!res) res = { ...one, questions: [...(one.questions || [])] };
      else {
        const seen = new Set(res.questions.map((q) => String(q.question || '').toLowerCase()));
        for (const q of (one.questions || [])) { const k = String(q.question || '').toLowerCase(); if (k && !seen.has(k)) { seen.add(k); res.questions.push(q); } }
      }
    }
    if (!res) return { error: 'People Also Ask lookup failed for every seed — try again or enter a keyword.' };
    res.seedsUsed = seeds;
    res.autoSeeded = !!derived.length;
    // Auto-derived seeds can be short/ambiguous (e.g. the acronym "ila" returned "Is ILA a
    // girl's name?"). Run the questions through the site's niche filter so only on-topic
    // ones survive. Fail-open — never return nothing because the filter erred.
    if (res.autoSeeded && site && site.geo_context && (res.questions || []).length) {
      try {
        const keep = await claude.filterKeywordsByNiche({ keywords: res.questions.map((q) => q.question), niche: nicheWithMarket(site, body.db || (site && site.semrush_db)), siteName: site.name, siteId: body.siteId });
        const keepSet = new Set(keep.map((k) => String(k).toLowerCase().trim()));
        const kept = res.questions.filter((q) => keepSet.has(String(q.question).toLowerCase().trim()));
        if (kept.length) { res.offNicheFiltered = res.questions.length - kept.length; res.questions = kept; }
      } catch (e) { /* fail-open */ }
    }
    // Optional: push each PAA question to the Airtable Article Writer table as a brief,
    // reusing the EXISTING airtable-sync brief path (mapArticleBrief → the n8n-watched
    // table). The question becomes the suggested title; its pattern rides along so the
    // writer knows the best snippet format. Default (no push) returns the data unchanged.
    if (body.push && body.siteId) {
      const clusters = (res.questions || []).map((q) => ({
        suggestedTitle: q.question,
        primaryKeyword: q.seed || seed,
        keyword: q.seed || seed,
        label: q.question,
        intent: q.pattern,
        format: q.snippetFormat,
        answer: q.answer,   // Google's PAA snippet → the row's Description
      }));
      try {
        res.airtable = await routes['POST /airtable-sync']({ siteId: body.siteId, kinds: ['opportunities'], clusters });
      } catch (e) { res.airtable = { error: 'Airtable push failed: ' + e.message }; }
    }
    return res;
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

  // Suggest authoritative EXTERNAL (outbound) links for a page — links to
  // high-authority sources (gov/official/established) that strengthen the page.
  // Read-only: returns suggestions; applying is a separate, approved action.
  'POST /external-links': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const url = body.targetUrl;
    if (!url) return { error: 'A page URL is required.' };
    try {
      const { creds, site } = await resolveCreds(body);
      const wp = clientFrom(creds);
      // Ground on the page's EDITABLE content (same as internal links) — so every
      // anchor we surface is one the inserter can actually place. This is what
      // eliminates "Add in editor": we never suggest nav/header/footer/menu text.
      const src = await resolveSourceByUrl(wp, url);
      const { text, units, authoritative } = await editablePageContent(wp, src);
      if (authoritative && !units.length) {
        return { sourcePage: url, count: 0, suggestions: [], note: 'No editable body text on this page — its visible text lives in the nav/header/footer or non-editable widgets, which can’t take an in-content link.' };
      }
      const niche = (site && site.niche) || (site && site.stack && site.stack.type) || '';
      // Surface Claude failures (e.g. credit exhaustion) instead of a silent empty list.
      let arr = [], aiError = null;
      try { arr = await claude.externalLinkSuggestions({ url, title: src.title || '', text: (text || '').slice(0, 5000), niche, siteId: body.siteId }); }
      catch (e) { aiError = String((e && e.message) || e); }
      // Drop anchors already linked on the rendered page (the inserter skips existing links).
      let linkedTexts = [];
      if ((arr || []).length) { try { const rh = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } }).then((r) => r.text()); linkedTexts = linkedAnchorTexts(rh); } catch (e) {} }
      // Keep only anchors the inserter would actually place: a boundary match inside a
      // SINGLE editable unit (faithful to the plugin), and not already a link on the page.
      const normUnits = units.map(normText);
      const applicable = (arr || [])
        .filter((l) => l.anchor && insertableIn(l.anchor, normUnits) && !alreadyLinked(l.anchor, linkedTexts))
        .map((l) => ({ ...l, sourceId: src.id, sourceType: src.type }));
      return { sourcePage: url, count: applicable.length, suggestions: applicable, droppedNotApplicable: (arr || []).length - applicable.length, aiError };
    } catch (e) { return { error: 'External-link analysis failed: ' + e.message }; }
  },

  // Apply ONE approved link (internal or external) into a live page's content.
  // Safe on Classic/Gutenberg; detects Elementor/page-builder & empty bodies and
  // returns status:'manual' (their content lives outside the standard WP field).
  'POST /apply-link': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    const { sourcePage, anchor, targetUrl } = body;
    if (!sourcePage || !anchor || !targetUrl) return { error: 'sourcePage, anchor and targetUrl are required.' };
    let found = null;
    // 1) BEST: the caller already resolved the post id (internal-links) — use it
    // directly. Robust for the homepage, custom post types, nested/odd permalinks.
    if (body.sourceId) {
      for (const type of [body.sourceType, 'pages', 'posts'].filter(Boolean)) {
        const row = await wp.request(`/${type}/${encodeURIComponent(body.sourceId)}?_fields=id`).catch(() => null);
        if (row && row.id) { found = { id: row.id, type }; break; }
      }
    }
    // 2) Resolve from the URL. Handle the HOMEPAGE (empty path) via the front-page
    // setting — its "slug" is the domain, which never matches a page slug.
    if (!found) {
      let path = '';
      try { path = new URL(sourcePage).pathname.replace(/\/+$/, ''); } catch (e) { path = String(sourcePage).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
      if (path === '' || path === '/') {
        const settings = await wp.request('/settings').catch(() => null);
        const fid = settings && (settings.page_on_front || settings.show_on_front === 'page' && settings.page_on_front);
        if (fid) { const row = await wp.request(`/pages/${fid}?_fields=id`).catch(() => null); if (row && row.id) found = { id: row.id, type: 'pages' }; }
        // Last resort: a page whose link is the site root.
        if (!found) { const pgs = await wp.request('/pages?per_page=100&_fields=id,link').catch(() => []); const root = (wp.baseUrl || '').replace(/\/+$/, ''); const hit = (pgs || []).find((p) => String(p.link || '').replace(/\/+$/, '') === root); if (hit) found = { id: hit.id, type: 'pages' }; }
      }
      if (!found) {
        const slug = decodeURIComponent((path.split('/').pop() || '')).toLowerCase();
        if (slug) for (const type of ['pages', 'posts']) { const rows = await wp.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id`).catch(() => []); if (Array.isArray(rows) && rows[0]) { found = { id: rows[0].id, type }; break; } }
      }
    }
    if (!found) return { status: 'manual', reason: 'Could not resolve the source page on WordPress.' };
    // Honesty guard: if the live site isn't actually served by this WordPress
    // (e.g. Drupal/Wix in front, or a parked domain), a successful WP write won't
    // show on the live page — so we must NOT report a plain "applied to live".
    const live = await detectLiveCms(sourcePage).catch(() => null);
    const liveWarn = (live && live.nonWordPress)
      ? { notOnLive: true, liveCms: live.cms, liveWarning: live.parked
          ? `Saved to WordPress, but ${(() => { try { return new URL(sourcePage).hostname; } catch (e) { return 'this domain'; } })()} appears to be parked/for-sale — there’s no live page to show it on.`
          : `Saved to WordPress, but your live site is served by ${live.cms} (not WordPress), so this link will NOT appear on the live page.` }
      : {};
    // Preferred path: the optimize plugin inserts into standard content AND
    // Elementor widgets (server-side, safe). Falls through if the plugin is absent.
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/insert-link`, { method: 'POST', body: { post_id: found.id, anchor, target_url: targetUrl } });
      if (r && r.ok && ['content', 'elementor', 'exists'].includes(r.mode)) {
        if (site) await db.logActivity({ site_id: site.id, type: liveWarn.notOnLive ? 'warning' : 'verified', actor: 'Agent', icon: 'link', text: `Linked “${anchor}” → ${targetUrl}`, meta: liveWarn.notOnLive ? `WordPress only — live site is ${liveWarn.liveCms}` : (r.mode === 'elementor' ? 'Elementor widget' : (r.mode === 'exists' ? 'already linked' : 'page content')) }).catch(() => {});
        return { status: 'verified', sourcePage, anchor, targetUrl, postId: found.id, mode: r.mode, reversible: true, ...liveWarn };
      }
      if (r && r.ok === false && r.mode === 'not_found') return { status: 'manual', reason: r.reason || 'Anchor text not found in the page content or Elementor widgets.' };
    } catch (e) { /* plugin not installed → fall back to standard-content insertion below */ }
    const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content`).catch(() => null);
    const raw = (post && post.content && (post.content.raw != null ? post.content.raw : '')) || '';
    const builder = (site && site.stack && site.stack.builder) || '';
    const isBuilder = /elementor|beaver|divi|bricks|wpbakery/i.test(builder);
    if (isBuilder || raw.trim().length < 40) {
      // We only reach here when the optimize plugin call failed (absent), so on a
      // page-builder site the real fix is installing the plugin on THIS site.
      return { status: 'manual', pluginMissing: true, reason: isBuilder
        ? `The “seo-agent-optimize” plugin isn’t installed on this ${builder} site, so links can’t be pushed into the page-builder content. Install the v1.4.0 plugin (wp-content/mu-plugins/) on THIS site — ${site ? (site.name || '') : ''} — then re-run.`
        : 'This page has no editable standard content and the optimize plugin isn’t installed here — install it on this site, or add the link in your editor.' };
    }
    const ins = insertAnchorLink(raw, anchor, targetUrl);
    if (!ins.changed) return { status: 'manual', reason: ins.reason };
    const upd = await wp.update(found.type, found.id, { content: ins.html }, { force: true });
    if (upd && upd.dryRun) return { status: 'dry-run', wouldLink: { sourcePage, anchor, targetUrl } };
    const after = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content`).catch(() => null);
    const stuck = !!(after && after.content && String(after.content.raw || '').includes(targetUrl));
    if (site) await db.logActivity({ site_id: site.id, type: (stuck && liveWarn.notOnLive) ? 'warning' : (stuck ? 'verified' : 'failed'), actor: 'Agent', icon: 'link', text: `Linked “${anchor}” → ${targetUrl}`, meta: liveWarn.notOnLive ? `WordPress only — live site is ${liveWarn.liveCms}` : sourcePage }).catch(() => {});
    return { status: stuck ? 'verified' : 'silent-failure', sourcePage, anchor, targetUrl, postId: found.id, reversible: true, ...liveWarn };
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

  // ── Live "apply" layer (needs the seo-agent-optimize mu-plugin installed) ──
  // Is the optimize mu-plugin present? (Tells the UI/automation whether schema/CSS
  // can be auto-applied and WebP auto-served.)
  'POST /optimize-status': async (body) => {
    try {
      const { creds } = await resolveCreds(body);
      const wp = clientFrom(creds);
      // Reachability probe — distinguishes "WP connection broken" (bad creds/URL)
      // from "plugin not installed". Both otherwise look like installed:false.
      let reachable = false, connErr = null;
      try { const me = await wp.request('/users/me?_fields=id'); reachable = !!(me && me.id); }
      catch (e) { connErr = String((e && e.message) || e).slice(0, 180); }
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/optimize-selftest`).catch(() => null);
      return { installed: !!(r && r.ok), version: (r && r.version) || null, features: (r && r.features) || [], reachable, error: reachable ? null : (connErr || 'WordPress REST not reachable with the stored credentials — reconnect this site.') };
    } catch (e) { return { installed: false, reachable: false, error: e.message }; }
  },
  // Auto-install + activate a server-level WebP plugin (Converter for Media) via
  // the WP plugins REST API — the right tool for images (handles all paths, CSS
  // backgrounds, AVIF). Needs an admin app-password with install_plugins.
  'POST /install-webp-plugin': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    const slug = body.slug || 'webp-converter-for-media';
    try {
      const list = await wp.request(`${wp.baseUrl}/wp-json/wp/v2/plugins`).catch(() => []);
      const existing = Array.isArray(list) ? list.find((p) => (p.plugin || '').split('/')[0] === slug || p.textdomain === slug) : null;
      if (existing) {
        if (existing.status !== 'active') await wp.request(`${wp.baseUrl}/wp-json/wp/v2/plugins/${existing.plugin}`, { method: 'POST', body: { status: 'active' } });
        return { ok: true, already: true, plugin: existing.plugin, status: 'active' };
      }
      const r = await wp.request(`${wp.baseUrl}/wp-json/wp/v2/plugins`, { method: 'POST', body: { slug, status: 'active' } });
      if (site) await db.logActivity({ site_id: site.id, type: 'connection', actor: 'Agent', icon: 'check', text: 'Installed WebP plugin — Converter for Media', meta: 'auto image WebP/AVIF' }).catch(() => {});
      return { ok: true, installed: true, plugin: r.plugin, status: r.status };
    } catch (e) { return { error: 'Install failed — the WordPress app-password user needs admin (install_plugins). ' + e.message }; }
  },

  // Resolve a page URL → post/page id (by slug) so schema can be attached.
  // Apply per-page JSON-LD schema to the live site via the mu-plugin.
  'POST /apply-schema': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    let postId = body.postId;
    if (!postId && body.url) {
      // Resolve the page id. Handle the HOMEPAGE (empty path) via the front-page
      // setting — its "slug" is the domain, which never matches a page slug — so
      // homepage-level schema (e.g. the FAQPage facts block) can be attached.
      let path = '';
      try { path = new URL(body.url).pathname.replace(/\/+$/, ''); } catch (e) { path = String(body.url).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
      if (path === '' || path === '/') {
        const settings = await wp.request('/settings').catch(() => null);
        const fid = settings && settings.page_on_front;
        if (fid) { const row = await wp.request(`/pages/${fid}?_fields=id`).catch(() => null); if (row && row.id) postId = row.id; }
        if (!postId) { const pgs = await wp.request('/pages?per_page=100&_fields=id,link').catch(() => []); const root = (wp.baseUrl || '').replace(/\/+$/, ''); const hit = (pgs || []).find((p) => String(p.link || '').replace(/\/+$/, '') === root); if (hit) postId = hit.id; }
      }
      if (!postId) {
        const slug = decodeURIComponent((path.split('/').pop() || '')).toLowerCase();
        if (slug) for (const type of ['pages', 'posts']) {
          const rows = await wp.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id`).catch(() => []);
          if (Array.isArray(rows) && rows[0]) { postId = rows[0].id; break; }
        }
      }
    }
    if (!postId) return { error: 'Could not resolve the page — pass postId or a valid page URL.' };
    const jsonld = typeof body.jsonld === 'string' ? body.jsonld : JSON.stringify(body.jsonld || body.schema || {});
    // Validate the JSON-LD graph before writing. WARN-ONLY: warnings (deprecated
    // types, etc.) never block the publish — they ride along on the response so the
    // UI can surface them. Only HARD errors (ok===false with errors[]) block the write.
    let validation = null;
    try { validation = validateSchema(jsonld); } catch (e) { validation = { ok: true, errors: [], warnings: ['validation skipped: ' + e.message] }; }
    if (validation && validation.ok === false && Array.isArray(validation.errors) && validation.errors.length) {
      return { error: 'Schema validation failed: ' + validation.errors.join('; '), validation };
    }
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/schema`, { method: 'POST', body: { post_id: postId, jsonld } });
      // Read-back: confirm the JSON-LD actually RENDERS, not merely that the store
      // accepted it. A schema block written to an archive-served URL is stored but never
      // output (the mu-plugin prints it on is_singular() only), which used to report a
      // false "verified". Fetch the page and look for a ld+json block carrying our marker.
      let rendered = null;
      const pageUrl = body.url || (body.page && (body.page.url || body.page)) || '';
      if (pageUrl) {
        try {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
          let html = '';
          try { const rr = await fetch(new URL(pageUrl, wp.baseUrl).href, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal }); if (rr.ok) html = await rr.text(); } finally { clearTimeout(t); }
          if (html) {
            const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
            rendered = blocks.some((b) => /data-seoagent|seoagent/i.test(b)) || blocks.length > 0;
          }
        } catch (e) {}
      }
      const verified = rendered === true;
      if (site) await db.logActivity({ site_id: site.id, type: verified ? 'verified' : 'warning', actor: 'Agent', icon: verified ? 'check' : 'alert', text: (verified ? 'Applied schema to live page #' : 'Schema stored but not confirmed rendering on #') + postId, meta: 'JSON-LD' }).catch(() => {});
      return { ok: true, postId, validation, rendered, verified, ...(rendered === false ? { warning: 'Stored, but no JSON-LD block was found rendering on the page — it may be a non-singular/archive URL, or a cache is serving stale HTML.' } : {}), ...r };
    } catch (e) { return { error: 'Apply failed — is the seo-agent-optimize mu-plugin installed? ' + e.message }; }
  },
  // AI-VISIBILITY AUTO-PUSH: generate the site's ENTITY SIGNALS (Organization + LegalService
  // for legal niches) and apply them to the homepage in one click. Deterministic (no LLM /
  // no Anthropic credits) and uses the existing mu-plugin /schema endpoint — these are the
  // structured-data signals ChatGPT/Perplexity/Google use to identify and cite the brand.
  'POST /apply-entity-signals': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (!site) return { error: 'Site not found.' };
    if (site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    const baseUrl = (site.url || '').replace(/\/+$/, '');
    if (!baseUrl) return { error: 'Site has no URL.' };
    // Detect legal/YMYL across niche AND the site's name/URL — the niche field is often empty,
    // but go-VISA / go-LEGAL / SETTLEMENT-agreement self-identify in their name/domain.
    const hay = (((site.stack && site.stack.type) || '') + ' ' + (site.niche || '') + ' ' + (site.name || '') + ' ' + (site.url || '')).toLowerCase();
    const isLegal = body.isLegal != null ? body.isLegal : /legal|lawyer|solicit|attorney|immigration|visa|barrister|settlement|tribunal|conveyanc|\blaw\b/.test(hay);
    // Deterministic entity @graph for the homepage (Organization [+ LegalService] + WebPage).
    const schema = generatePageSchema(
      { url: baseUrl + '/', title: site.name || baseUrl, type: 'page' },
      { org: { name: site.name || baseUrl, url: baseUrl, logo: site.logo }, baseUrl, siteName: site.name || baseUrl, isLegal, areaServed: body.areaServed }
    );
    // Resolve the homepage post (front-page setting, then a page whose link is the site root).
    let postId = null;
    try {
      const settings = await wp.request('/settings').catch(() => null);
      const fid = settings && settings.page_on_front;
      if (fid) { const row = await wp.request(`/pages/${fid}?_fields=id`).catch(() => null); if (row && row.id) postId = row.id; }
    } catch (e) {}
    if (!postId) { const pgs = await wp.request('/pages?per_page=100&_fields=id,link').catch(() => []); const root = baseUrl.replace(/\/+$/, ''); const hit = (pgs || []).find((p) => String(p.link || '').replace(/\/+$/, '') === root); if (hit) postId = hit.id; }
    if (!postId) return { error: 'Could not resolve the homepage on WordPress to attach entity schema. Set a static front page, or apply schema per-page from the Schema tab.' };
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/schema`, { method: 'POST', body: { post_id: postId, jsonld: JSON.stringify(schema) } });
      const types = (schema['@graph'] || []).map((n) => n['@type']);
      await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'sparkles', text: 'Published AI entity signals (Organization' + (isLegal ? ' + LegalService' : '') + ') to homepage', meta: 'AI visibility · JSON-LD' }).catch(() => {});
      return { ok: true, postId, isLegal, types, ...r };
    } catch (e) { return { error: 'Apply failed — is the seo-agent-optimize plugin installed on this site? ' + e.message }; }
  },
  // Apply site-wide custom CSS to the live site via the mu-plugin.
  'POST /apply-css': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    const css = String(body.css || '').trim();
    if (!css) return { error: 'No CSS to apply.' };
    try {
      // ACCUMULATE, don't overwrite. This route used to POST body.css straight to the
      // mu-plugin /css store, REPLACING whatever was there — so applying the CSS-fixes
      // tab wiped every previously-applied per-proposal fix, and the live <style> often
      // ended up empty. Store this blob under a stable key and rebuild the live bundle as
      // the UNION of every stored rule group (same store /apply-css-fixes uses).
      if (site) {
        await db.upsertCssFix(site.id, { proposalId: 'css-tab', auditId: 'css-tab', note: 'CSS Fixes tab', css });
        const rows = await db.listCssFixes(site.id);
        const bundle = `/* seo-agent accumulated CSS fixes — ${rows.length} rule group(s), rebuilt ${new Date().toISOString().slice(0, 10)} */\n`
          + rows.map((r) => `\n/* [${r.audit_id || r.proposal_id || 'rule'}]${r.note ? ' ' + r.note : ''} */\n${r.css}`).join('\n');
        const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css: bundle } });
        await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: 'Applied custom CSS to live site', meta: `bundle now ${rows.length} rule group(s)` }).catch(() => {});
        return { ok: true, ruleGroups: rows.length, ...r };
      }
      // Raw-creds callers (no site row) — direct write, nothing to accumulate against.
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css } });
      return { ok: true, ...r };
    } catch (e) { return { error: 'Apply failed — is the seo-agent-optimize mu-plugin installed? ' + e.message }; }
  },

  // ACCUMULATING CSS apply: each rule is persisted per-proposal in css_fixes and the live
  // bundle is rebuilt as the UNION of every stored rule — so applying a new batch can no
  // longer wipe previously applied fixes, and per-proposal rollback is possible.
  // body: { siteId, items:[{proposalId, auditId, note, css}] } → { ok, applied:[proposalId], bytes }.
  'POST /apply-css-fixes': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const items = (body.items || []).filter((i) => i && i.css && String(i.css).trim());
    if (!items.length) return { error: 'No CSS rules to apply.' };
    const wp = clientFrom(creds);
    for (const i of items) await db.upsertCssFix(site.id, { proposalId: i.proposalId, auditId: i.auditId, note: i.note, css: i.css });
    const rows = await db.listCssFixes(site.id);
    const bundle = `/* seo-agent accumulated CSS fixes — ${rows.length} rule group(s), rebuilt ${new Date().toISOString().slice(0, 10)} */\n`
      + rows.map((r) => `\n/* [${r.audit_id || r.proposal_id || 'rule'}]${r.note ? ' ' + r.note : ''} */\n${r.css}`).join('\n');
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css: bundle } });
      await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: `Applied ${items.length} CSS fix(es) — bundle now ${rows.length} rule group(s)`, meta: (r && r.bytes) ? r.bytes + ' bytes' : '' }).catch(() => {});
      return { ok: true, applied: items.map((i) => i.proposalId).filter(Boolean), ruleGroups: rows.length, ...r };
    } catch (e) { return { error: 'Apply failed — is the seo-agent-optimize mu-plugin installed? ' + e.message }; }
  },

  // BULK ON-PAGE METADATA REPAIR — the substantive SEO fix.
  // The audit only ever surfaced technical debris (broken links, a11y) because it audited
  // ONE page; site-wide, the real gap is metadata: on SAL 13 of 14 pages shipped with NO
  // meta description and 13 titles overflowed the SERP. This walks the site's real pages,
  // generates what's missing with the site's own niche context, writes via the SAME
  // verified meta path (read-back confirmed), and reports per page.
  // Background wrapper — a full-site pass (fetch + generate + verified write per page)
  // runs for minutes and cannot fit the ~95s request cap (it 504'd at 20 pages).
  // Start → poll, same pattern as the audit/opportunity jobs.
  'POST /fix-page-metadata-start': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const cur = META_RUNS.get(body.siteId);
    if (cur && cur.status === 'running') return { status: 'running', progress: cur.progress };
    META_RUNS.set(body.siteId, { status: 'running', progress: { done: 0, total: 0 }, at: Date.now() });
    (async () => {
      try {
        const r = await routes['POST /fix-page-metadata']({ ...body, _progress: (p) => { const run = META_RUNS.get(body.siteId); if (run) run.progress = p; } });
        META_RUNS.set(body.siteId, { status: r && r.error ? 'error' : 'done', result: r, error: r && r.error, at: Date.now() });
      } catch (e) { META_RUNS.set(body.siteId, { status: 'error', error: String(e && e.message || e), at: Date.now() }); }
    })();
    return { status: 'running', progress: { done: 0, total: 0 } };
  },
  'POST /fix-page-metadata-status': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const r = META_RUNS.get(body.siteId);
    if (!r) return { status: 'unknown', reason: 'no active run — re-run' };
    if (Date.now() - r.at > 20 * 60 * 1000) { META_RUNS.delete(body.siteId); return { status: 'unknown', reason: 'expired — re-run' }; }
    if (r.status === 'done') return { status: 'done', ...(r.result || {}) };
    if (r.status === 'error') return { status: 'error', error: r.error };
    return { status: 'running', progress: r.progress };
  },

  // body: { siteId, limit?, dryRun?, fixTitles?, types? } → { pages:[{url,desc,title,status}] }
  'POST /fix-page-metadata': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (!body.dryRun && site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    const seoPlugin = (site && site.stack && site.stack.seo) || null;
    const FIELD = metaFieldMap(seoPlugin);
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
    const types = Array.isArray(body.types) && body.types.length ? body.types : ['pages', 'posts'];
    // 1) Enumerate real published content.
    const items = [];
    for (const t of types) {
      try {
        const rows = await wp.request(`/${t}?per_page=${limit}&status=publish&_fields=id,link,title`);
        for (const r of (rows || [])) items.push({ id: r.id, type: t, url: r.link, title: (r.title && r.title.rendered || '').replace(/&[a-z#0-9]+;/gi, ' ').trim() });
      } catch (e) { /* type unavailable on this site */ }
    }
    if (!items.length) return { error: 'No published pages/posts found to check.' };
    // Cross-site brand guard: regenerate meta that carries ANOTHER connected site's brand
    // (clone residue), and never write generated copy that still references one.
    const foreign = await foreignBrandTokens(site);
    const hasForeignBrand = (s) => { const x = String(s || '').toLowerCase(); return foreign.some((b) => x.includes(b)); };
    const out = [];
    const work = items.slice(0, limit);
    let _i = 0;
    for (const it of work) {
      if (typeof body._progress === 'function') body._progress({ done: _i++, total: work.length, current: it.url });
      const rec = { url: it.url, id: it.id, type: it.type };
      // 2) Read what the page ACTUALLY renders today (authoritative — covers whatever
      //    SEO plugin owns the head), bounded so one slow page can't stall the batch.
      let html = '';
      try {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
        try { const r = await fetch(it.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }, signal: ctrl.signal }); if (r.ok) html = await r.text(); }
        finally { clearTimeout(timer); }
      } catch (e) { /* fall through — treat as missing */ }
      const head = html ? html.slice(0, Math.max(html.indexOf('</head>'), 60000)) : '';
      const curDesc = ((head.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '').trim();
      const curTitle = ((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
      rec.hadDesc = curDesc.length; rec.hadTitle = curTitle.length;
      // Body signal for the generator: headings + first real prose.
      const headings = (html.match(/<h[12][^>]*>[\s\S]*?<\/h[12]>/gi) || []).map((x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
      const excerpt = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<(nav|header|footer|aside|form|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
      // This URL may be served by a post-type archive rather than the Page we hold an
      // ID for. Meta written to that page verifies but can never render (the bridge is
      // is_singular()-only), so archives take the option-backed path instead.
      if (html && rendersAsArchive(html)) {
        rec.archive = true;
        const pt = archivePostType(html);
        // Addressable archives get real copy through the archive-meta option; anything
        // else (category/date/author) we report honestly rather than fake a write.
        if (!pt || curDesc.length >= 70) {
          rec.descStatus = !pt
            ? 'not-applicable (URL renders an archive this repair cannot address)'
            : 'ok (already set)';
          out.push(rec); continue;
        }
        try {
          let desc = String(await claude.metaDescription({ url: it.url, title: curTitle || it.title, headings, excerpt, siteId: body.siteId })).replace(/^["']|["']$/g, '').trim();
          if (desc.length > 160) {
            const cut = desc.slice(0, 160);
            const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
            desc = lastStop > 90 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-–—]$/, '') + '.';
          }
          rec.desc = desc.replace(/\s+/g, ' ').trim();
          rec.archivePostType = pt;
          if (body.dryRun) rec.descStatus = 'dry-run';
          else {
            const r = await wp.request(`${creds.baseUrl}/wp-json/seoagent/v1/archive-meta`, { method: 'POST', body: { post_type: pt, description: rec.desc } });
            const stuck = r && r.ok && r.stored && String(r.stored.description || '') === rec.desc;
            rec.descStatus = stuck ? 'verified' : 'failed: archive-meta write did not stick';
          }
        } catch (e) { rec.descStatus = 'failed: ' + String(e.message || e).slice(0, 80); }
        out.push(rec); continue;
      }
      // 3) Meta description — generate when missing/too short to rank OR when the current
      //    one carries a foreign brand (cross-site clone residue).
      const descForeign = curDesc && hasForeignBrand(curDesc);
      if (descForeign) rec.descForeignBrand = true;
      if (curDesc.length < 70 || descForeign) {
        try {
          let desc = String(await claude.metaDescription({ url: it.url, title: curTitle || it.title, headings, excerpt, siteId: body.siteId })).replace(/^["']|["']$/g, '').trim();
          // Never publish a mid-word truncation: the generator's token ceiling can cut the
          // last sentence ("…get expert legal advice toda"). Trim back to the last complete
          // sentence, else the last whole word, and keep it inside Google's ~160 display.
          if (desc.length > 160) {
            const cut = desc.slice(0, 160);
            const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
            desc = lastStop > 90 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-–—]$/, '') + '.';
          }
          desc = desc.replace(/\s+/g, ' ').trim();
          rec.desc = desc;
          // Guard: refuse to write copy that STILL names another site's brand.
          if (hasForeignBrand(desc)) { rec.descStatus = 'skipped: generated copy still referenced another site’s brand'; }
          else if (!body.dryRun && desc) {
            const r = await writeMetaResilient(wp, it.type, it.id, FIELD.meta_description, desc, 'meta_description');
            rec.descStatus = r.status; if (r.viaFallback) rec.descVia = r.viaFallback;
          } else rec.descStatus = 'dry-run';
        } catch (e) { rec.descStatus = 'failed: ' + String(e.message || e).slice(0, 80); }
      } else rec.descStatus = 'ok (already set)';
      // 4) Title — opt-in (fixTitles). Rewrite when it would truncate in the SERP OR when
      //    it is a leftover placeholder (short, so no length check would ever catch it).
      const titleIsPlaceholder = !curTitle || PLACEHOLDER_RE.test(curTitle);
      const titleForeign = curTitle && hasForeignBrand(curTitle);
      if (titleIsPlaceholder) rec.titlePlaceholder = curTitle || '(empty)';
      if (titleForeign) rec.titleForeignBrand = true;
      // Rewrite when it would truncate in the SERP, is a leftover placeholder, OR carries
      // another site's brand (clone residue) — the last one is short so no length check
      // would ever catch it. A wrong-brand title is fixed even when fixTitles is off.
      if ((body.fixTitles && (curTitle.length > 62 || titleIsPlaceholder)) || titleForeign) {
        try {
          let t = String(await claude.titleRewrite({ url: it.url, currentTitle: curTitle, brand: (site && site.name) || '', siteId: body.siteId })).replace(/^["']|["']$/g, '').trim();
          // A slightly-long rewrite is still far better than the 100-char original it
          // replaces: drop the trailing brand/qualifier segment rather than abandoning
          // the fix (one page kept a 102-char title because its rewrite was 65).
          if (t.length > 65) {
            const cut = t.slice(0, 65);
            const sep = Math.max(cut.lastIndexOf(' | '), cut.lastIndexOf(' - '), cut.lastIndexOf(' – '), cut.lastIndexOf(': '));
            t = (sep > 24 ? cut.slice(0, sep) : cut.slice(0, cut.lastIndexOf(' '))).trim();
          }
          rec.title = t;
          if (hasForeignBrand(t)) { rec.titleStatus = 'skipped: generated title still referenced another site’s brand'; }
          else if (!body.dryRun && t && t.length <= 65) {
            const r = await writeMetaResilient(wp, it.type, it.id, FIELD.title, t, 'title');
            rec.titleStatus = r.status; if (r.viaFallback) rec.titleVia = r.viaFallback;
          } else rec.titleStatus = body.dryRun ? 'dry-run' : 'skipped (could not shorten safely)';
        } catch (e) { rec.titleStatus = 'failed: ' + String(e.message || e).slice(0, 80); }
      }
      out.push(rec);
    }
    const wrote = out.filter((r) => r.descStatus === 'verified' || r.titleStatus === 'verified').length;
    if (site && !body.dryRun) await db.logActivity({ site_id: site.id, type: wrote ? 'verified' : 'warning', actor: 'Agent', icon: 'check', text: `On-page metadata repair — ${wrote} page(s) updated`, meta: `${out.length} checked` }).catch(() => {});
    return { ok: true, checked: out.length, wrote, pages: out };
  },

  // ACCESSIBILITY DOM FIXES — the channel that never existed. Audits like skip-link,
  // link-name, label, landmark-one-main and aria-* cannot be fixed in CSS, so every one
  // of them approved into "needs manual action · nothing was written" forever. This
  // generates an idempotent repair script (+ any paired CSS), stores it via the
  // mu-plugin, and read-back verifies. body: { siteId, findings:[{auditId|_auditId}] }.
  'POST /apply-a11y-fixes': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    let findings = Array.isArray(body.findings) ? body.findings : null;
    if (!findings && body.siteId) {
      try {
        const rows = await fetch(`${process.env.SUPABASE_URL}/rest/v1/audits?site_id=eq.${body.siteId}&select=findings&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
        findings = (rows && rows[0] && rows[0].findings) || [];
      } catch (e) { findings = []; }
    }
    const gen = generateA11yFixes(findings || []);
    if (!gen.fixableCount) return { ok: false, applied: [], rules: [], reason: 'No DOM-fixable accessibility findings in this set.' };
    const wp = clientFrom(creds);
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/a11y-js`, { method: 'POST', body: { js: gen.js } });
      // Paired CSS (e.g. the skip-link's visually-hidden styling) rides the accumulating
      // CSS store so it survives later CSS applies.
      if (gen.css) {
        await db.upsertCssFix(site.id, { auditId: 'a11y-support', note: 'Support styles for the accessibility DOM fixes', css: gen.css });
        const rows = await db.listCssFixes(site.id);
        const bundle = `/* seo-agent accumulated CSS fixes — ${rows.length} rule group(s) */\n` + rows.map((x) => `\n/* [${x.audit_id || x.proposal_id || 'rule'}]${x.note ? ' ' + x.note : ''} */\n${x.css}`).join('\n');
        await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css: bundle } }).catch(() => {});
      }
      // Read back: the stored script must actually be there.
      const back = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/a11y-js`, { method: 'GET' }).catch(() => null);
      const verified = !!(back && back.bytes > 0);
      await db.logActivity({ site_id: site.id, type: verified ? 'verified' : 'warning', actor: 'Agent', icon: 'check', text: `Applied ${gen.fixableCount} accessibility DOM fix(es) to the live site`, meta: gen.rules.map((x) => x.auditId).join(', ') }).catch(() => {});
      return { ok: true, verified, bytes: (r && r.bytes) || gen.js.length, rules: gen.rules, applied: gen.rules.map((x) => x.auditId) };
    } catch (e) {
      return { error: 'Apply failed — needs seo-agent-optimize mu-plugin v1.20.0+ (Sites → update plugin). ' + e.message };
    }
  },

  // Per-proposal CSS rollback: remove that rule from the store, re-apply the remaining
  // bundle. The previously-bogus "rollback = meta write" path for css proposals is gone.
  'POST /rollback-css': async (body) => {
    const { creds, site } = await resolveCreds(body);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    if (!body.proposalId) return { error: 'proposalId required' };
    await db.deleteCssFix(site.id, body.proposalId);
    const rows = await db.listCssFixes(site.id);
    const bundle = rows.length
      ? `/* seo-agent accumulated CSS fixes — ${rows.length} rule group(s), rebuilt ${new Date().toISOString().slice(0, 10)} */\n` + rows.map((r) => `\n/* [${r.audit_id || r.proposal_id || 'rule'}]${r.note ? ' ' + r.note : ''} */\n${r.css}`).join('\n')
      : `/* seo-agent CSS fixes — none active */\n`;
    const wp = clientFrom(creds);
    try {
      await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css: bundle } });
      await db.updateProposal(body.proposalId, { status: 'rolled-back' }).catch(() => {});
      await db.logActivity({ site_id: site.id, type: 'rolled-back', actor: 'You', icon: 'undo', text: 'Rolled back a CSS fix', meta: `${rows.length} rule group(s) remain` }).catch(() => {});
      return { ok: true, ruleGroups: rows.length };
    } catch (e) { return { error: 'Rollback failed: ' + e.message }; }
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
    try { facts = await claude.extractCitableFacts({ url, title, text, niche, siteId: body.siteId }); }
    catch (e) { return { error: 'Fact extraction failed: ' + e.message }; }
    // Ground with CURRENT, cited UK facts from the live web (Perplexity), so the
    // on-page facts reflect today's reality, not just what's already on the page.
    let grounded = null;
    if (research.status().perplexity) {
      try { const g = await research.citableFactsGrounded({ topic: title || url, niche, db: site && site.semrush_db, siteId: body.siteId, now: Date.now() }); if (!g.error) grounded = { summary: g.summary, sources: g.sources }; } catch (e) {}
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
    // On a real apply, skip images already converted to WebP (no duplicate uploads).
    try { return await imageOpt.optimizeImages(body.siteId, { ids: body.ids || null, quality: body.quality || 80, max: body.max || 10, apply: !!body.apply, skipExisting: body.skipExisting != null ? !!body.skipExisting : !!body.apply, onProgress: body._progress }); }
    catch (e) { return { error: 'Image optimization failed: ' + e.message }; }
  },
  // Background wrapper — download + sharp-convert + re-upload per image runs for
  // minutes on a heavy library and 504'd the synchronous route at the 95s cap
  // (confirmed live via /admin-health: "request POST /media-optimize timed out after
  // 95000ms"). Start → poll, same pattern as the metadata/audit jobs.
  'POST /media-optimize-start': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    if (body.apply) {
      const site = await db.getSite(body.siteId).catch(() => null);
      if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes first.' };
    }
    const cur = MEDIA_RUNS.get(body.siteId);
    if (cur && cur.status === 'running') return { status: 'running', progress: cur.progress };
    MEDIA_RUNS.set(body.siteId, { status: 'running', progress: { done: 0, total: 0 }, at: Date.now() });
    (async () => {
      try {
        const r = await routes['POST /media-optimize']({ ...body, _progress: (p) => { const run = MEDIA_RUNS.get(body.siteId); if (run) run.progress = p; } });
        MEDIA_RUNS.set(body.siteId, { status: r && r.error ? 'error' : 'done', result: r, error: r && r.error, at: Date.now() });
      } catch (e) { MEDIA_RUNS.set(body.siteId, { status: 'error', error: String(e && e.message || e), at: Date.now() }); }
    })();
    return { status: 'running', progress: { done: 0, total: 0 } };
  },
  'POST /media-optimize-status': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const r = MEDIA_RUNS.get(body.siteId);
    if (!r) return { status: 'unknown', reason: 'no active run — re-run' };
    if (Date.now() - r.at > 20 * 60 * 1000) { MEDIA_RUNS.delete(body.siteId); return { status: 'unknown', reason: 'expired — re-run' }; }
    if (r.status === 'done') return { status: 'done', ...(r.result || {}) };
    if (r.status === 'error') return { status: 'error', error: r.error };
    return { status: 'running', progress: r.progress };
  },
  // Remove duplicate WebP copies (X.webp, X-1.webp … X-N.webp). apply=false = dry run.
  'POST /cleanup-webp-dupes': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    if (body.apply) {
      const site = await db.getSite(body.siteId).catch(() => null);
      if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes first.' };
    }
    try { return await imageOpt.cleanupDuplicateWebp(body.siteId, { apply: !!body.apply }); }
    catch (e) { return { error: 'WebP cleanup failed: ' + e.message }; }
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
    // The stored audit findings — pulled either as the source (no body.findings) OR to
    // ENRICH the slim {auditId,title} findings the frontend sends with the per-element
    // `contrastNodes` needed for the automatic color-contrast fix (they'd otherwise be
    // stripped and contrast would fall back to "nothing to write").
    let stored = [];
    if (body.siteId) {
      try {
        const rows = await fetch(`${process.env.SUPABASE_URL}/rest/v1/audits?site_id=eq.${body.siteId}&select=findings&order=created_at.desc&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } }).then((r) => r.json()).catch(() => []);
        stored = (rows && rows[0] && rows[0].findings) || [];
      } catch (e) { stored = []; }
    }
    if (!findings) findings = stored;
    else {
      // Merge contrastNodes from the stored audit into matching color-contrast findings.
      const nodesByAudit = {};
      for (const s of stored) { const id = s._auditId || s.auditId || s.id; if (id && s.contrastNodes && s.contrastNodes.length) nodesByAudit[id] = s.contrastNodes; }
      findings = findings.map((f) => {
        const id = f._auditId || f.auditId || f.id;
        const isC = /contrast/i.test(id || '') || /contrast/i.test(f.title || '');
        if (isC && !(f.contrastNodes && f.contrastNodes.length)) {
          const nodes = nodesByAudit[id] || nodesByAudit['color-contrast'];
          if (nodes) return { ...f, contrastNodes: nodes };
        }
        return f;
      });
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

    // Enrich with WP modified-date where we can resolve the page → post. Run the
    // per-page lookups CONCURRENTLY (bounded pool) — doing them serially meant up to
    // 20 pages × 2 WP calls = ~40 sequential round-trips (~30s of "Analyzing…", and a
    // timeout risk on slower WP hosts). Bounded to POOL in flight so we don't trip a
    // site's rate limiter / security plugin.
    try {
      const { baseUrl, username, appPassword } = await credsForSite(body.siteId);
      const wp = new WordPressClient({ baseUrl, username, appPassword });
      const targets = decay.pages.slice(0, 20);
      const enrichOne = async (d) => {
        try {
          const path = new URL(d.page).pathname.replace(/\/+$/, '');
          const slug = path.split('/').filter(Boolean).pop();
          if (!slug) return;
          for (const type of ['posts', 'pages']) {
            // Short, no-retry bound: 8 of these run concurrently, so a slow host must not
            // let them stack toward the 95s cap. Worst case ceil(20/8)=3 batches × 2
            // types × 8s ≈ 48s — comfortably under the request timeout.
            const hits = await wp.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id,modified`, { method: 'GET', timeoutMs: 8000, retries: 0 }).catch(() => []);
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
      };
      const POOL = 8;
      for (let i = 0; i < targets.length; i += POOL) {
        await Promise.all(targets.slice(i, i + POOL).map(enrichOne));
      }
    } catch (e) {}

    return decay;
  },

  // Generate a substantive refresh brief for one decaying page (Claude).
  // NOT a date bump — a real content-improvement plan.
  'POST /content-decay-brief': async (body) => {
    const page = body.page;
    if (!page) return { error: 'No page specified' };
    // The decay page object stores its URL in `.page` (GSC shape); older callers pass a
    // raw string or a `.url`. Reading only `.url` meant we fetched the object itself
    // ("[object Object]") → empty → "No Page Content Available". Resolve all three.
    const pageUrl = (typeof page === 'string') ? page : (page.page || page.url);
    let pageText = '';
    if (pageUrl) try {
      const res = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } });
      const html = await res.text();
      pageText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch (e) {}
    const brief = await claude.decayBrief({ page, pageContext: { excerpt: pageText }, siteId: body.siteId });
    return { brief };
  },

  // One-click content REFRESH for a decaying page: generate a grounded freshness
  // block, push it live (idempotent, reversible), and re-index — no chat needed.
  //   apply:false → preview the block.  apply:true → write live + submit to index.
  'POST /content-refresh': async (body) => {
    const page = body.page || {};
    const pageUrl = page.url || page.page || body.url;
    if (!pageUrl) return { error: 'No page specified' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const niche = (site && (site.niche || (site.stack && site.stack.niche))) || '';
    let monthYear = ''; try { monthYear = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }); } catch (e) {}

    // QUIET refresh — never inserts a visible content block (operators found the inserted block
    // too generic/not useful). Strips any prior block, bumps the page's modified date (a real
    // ranking-freshness signal), and re-indexes. Returns before the legacy block-gen path below.
    if (!body.apply) {
      return { status: 'preview', quiet: true, note: "Quiet refresh: bumps the page's freshness/modified date and re-submits it for indexing — no content block is added." };
    }
    if (site && site.write_armed === false && !body.force) {
      return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then refresh.' };
    }
    {
      let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
      const wp = new WordPressClient(creds);
      let found = (page._id && page._type) ? { id: page._id, type: page._type } : null;
      if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
      if (!found || !found.id) return { status: 'manual', reason: 'Could not match this URL to a WordPress post/page.', manualHint: 'Re-save the page in your editor to bump its modified date.' };
      let touched = false, removedBlock = false;
      try {
        const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/refresh-block`, { method: 'POST', body: { post_id: found.id, remove: true, touch: true, open: REFRESH_OPEN, close: REFRESH_CLOSE } });
        if (r && r.ok) { touched = true; removedBlock = !!r.replaced; }
      } catch (e) { /* mu-plugin absent/old → classic fallback */ }
      if (!touched) {
        try {
          const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content`).catch(() => null);
          const raw = (post && post.content && (post.content.raw != null ? post.content.raw : '')) || '';
          if (raw.length) { const s = stripRefreshBlock(raw); await wp.update(found.type, found.id, { content: s.html }, { force: true }); touched = true; removedBlock = s.removed; }
        } catch (e) {}
      }
      const indexed = await submitOneForIndex(body.siteId, pageUrl);
      if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'sparkles', text: `Refreshed “${page.title || pageUrl}”`, meta: 'freshness date + re-indexed' + (removedBlock ? ' · removed old block' : '') }).catch(() => {});
      return { status: 'applied', via: 'quiet', quiet: true, removedBlock, indexed, postId: found.id, note: 'Freshness date bumped + re-indexed' + (removedBlock ? ' (removed a prior block)' : '') + ' — no content block added.' };
    }

    // ── Legacy block-insertion path below is no longer reached (kept for reference) ──
    // 1) Ground the refresh in the page's real ARTICLE body — NOT the nav/footer/marketing
    //    chrome (grabbing the whole page made blocks restate site-wide product blurbs &
    //    ratings). Prefer the mu-plugin's builder-aware page-text, then the WP post content,
    //    then a raw page fetch (last resort, includes chrome).
    let pageText = '';
    if (body.siteId) {
      try {
        const gCreds = await credsForSite(body.siteId);
        const gwp = new WordPressClient(gCreds);
        let gf = (page._id && page._type) ? { id: page._id, type: page._type } : null;
        if (!gf) { try { gf = await gwp.resolvePostByUrl(pageUrl); } catch (e) {} }
        if (gf && gf.id) {
          try { const pt = await gwp.request(`${gwp.baseUrl}/wp-json/seoagent/v1/page-text?post_id=${gf.id}`); if (pt && pt.text && String(pt.text).trim().length > 80) pageText = String(pt.text).replace(/\s+/g, ' ').trim().slice(0, 4000); } catch (e) {}
          if (!pageText) { try { const post = await gwp.request(`/${gf.type}/${gf.id}?_fields=content`); const rnd = (post && post.content && post.content.rendered) || ''; if (rnd) pageText = rnd.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000); } catch (e) {} }
        }
      } catch (e) {}
    }
    if (!pageText) {
      try {
        const res = await fetch(pageUrl, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
        const html = await res.text();
        pageText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
      } catch (e) {}
    }

    // 2) Generate the freshness block (Claude — strictly grounded, no invented facts).
    const parts = await claude.refreshContent({
      url: pageUrl, title: page.title || '', currentText: pageText, niche,
      decay: { clicksLost: page.clicksLost, pctDrop: page.pctDrop, positionDrift: page.positionDrift },
      monthYear, siteId: body.siteId,
    });
    const blockHtml = buildRefreshBlock(parts, monthYear);
    // A clean, paste-ready version (markers stripped) for the manual fallback.
    const pasteHtml = blockHtml.replace(REFRESH_OPEN + '\n', '').replace('\n' + REFRESH_CLOSE + '\n', '');

    // Quality gate — never insert a filler block. If the page yielded no article-specific
    // substance, skip rather than add a generic "Updated for …" stamp (what reads as
    // "a block that doesn't say anything").
    const realPoints = (parts.points || []).filter((p) => String(p || '').trim().length > 12);
    if (!(String(parts.intro || '').trim().length > 50 && realPoints.length >= 2)) {
      return { status: 'thin', reason: 'This page didn\'t yield enough article-specific content for a meaningful refresh, so no block was added (it would just be a generic "updated" stamp). Add substantive updates to the page, or refresh it manually.', parts, blockHtml: pasteHtml, monthYear };
    }

    if (!body.apply) {
      return { status: 'preview', parts, blockHtml: pasteHtml, monthYear, willIndex: true };
    }

    // 3) Apply live. Resolve the post, gate on write-arming, write, verify.
    if (site && site.write_armed === false && !body.force) {
      return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then refresh.', blockHtml: pasteHtml };
    }
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const wp = new WordPressClient(creds);
    // Prefer the IDs the decay scan already resolved; else resolve by URL.
    let found = (page._id && page._type) ? { id: page._id, type: page._type } : null;
    if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
    if (!found || !found.id) return { status: 'manual', reason: 'Could not match this URL to a WordPress post/page.', blockHtml: pasteHtml, manualHint: 'Open the page in your editor and paste the block at the top.' };

    // 3a) Plugin path first — Elementor/Divi-aware prepend (if the optimize plugin
    //     is installed and new enough to expose refresh-block).
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/refresh-block`, { method: 'POST', body: { post_id: found.id, block_html: pasteHtml, open: REFRESH_OPEN, close: REFRESH_CLOSE } });
      if (r && r.ok) {
        const indexed = await submitOneForIndex(body.siteId, pageUrl);
        if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'sparkles', text: `Refreshed “${page.title || pageUrl}”`, meta: r.replaced ? 'updated block' : 'added block' }).catch(() => {});
        return { status: 'applied', via: r.mode || 'plugin', replaced: !!r.replaced, parts, blockHtml: pasteHtml, indexed, postId: found.id, reversible: true };
      }
    } catch (e) { /* plugin absent / old → fall back to post_content below */ }

    // 3b) Server-side path — prepend the marked block to post_content. Safe for
    //     classic/Gutenberg posts; not for page-builder pages (content wouldn't render).
    const builder = (site && site.stack && site.stack.builder) || '';
    const isBuilder = /elementor|beaver|divi|bricks|wpbakery/i.test(builder);
    const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content`).catch(() => null);
    const raw = (post && post.content && (post.content.raw != null ? post.content.raw : '')) || '';
    if (isBuilder || raw.trim().length < 40) {
      return { status: 'manual', builder: builder || 'page-builder', pluginMissing: true, blockHtml: pasteHtml,
        reason: `This is a ${builder || 'page-builder'} page, so the refresh can’t be auto-written into the visible content. Install/update the “seo-agent-optimize” plugin on this site to enable one-click refresh here, or paste the block manually.`,
        manualHint: `In ${builder || 'your page builder'}: edit the page → add a Text/HTML widget at the very top → paste the block below → Update. (Updating the page also refreshes its “modified” date, which is itself a ranking-freshness signal.)` };
    }
    const { html, replaced } = applyRefreshBlock(raw, blockHtml);
    const upd = await wp.update(found.type, found.id, { content: html }, { force: true });
    if (upd && upd.dryRun) return { status: 'dry-run', blockHtml: pasteHtml };
    const after = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content,modified`).catch(() => null);
    const stuck = !!(after && after.content && String(after.content.raw || '').includes(REFRESH_OPEN));
    if (!stuck) {
      if (site) await db.logActivity({ site_id: site.id, type: 'failed', actor: 'Agent', icon: 'sparkles', text: `Refresh didn’t stick on “${page.title || pageUrl}”`, meta: pageUrl }).catch(() => {});
      return { status: 'silent-failure', reason: 'The update was sent but the block isn’t in the saved content (a security plugin may strip HTML).', blockHtml: pasteHtml };
    }
    // 3c) Re-index the freshened URL.
    const indexed = await submitOneForIndex(body.siteId, pageUrl);
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'sparkles', text: `Refreshed “${page.title || pageUrl}”`, meta: replaced ? 'updated block + re-indexed' : 'added block + re-indexed' }).catch(() => {});
    return { status: 'applied', via: 'content', replaced, parts, blockHtml: pasteHtml, indexed, postId: found.id, modified: after && after.modified, reversible: true };
  },

  // Undo a content refresh — strip the marked freshness block from the page.
  'POST /content-refresh-undo': async (body) => {
    const page = body.page || {};
    const pageUrl = page.url || page.page || body.url;
    if (!pageUrl) return { error: 'No page specified' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.' }; }
    const wp = new WordPressClient(creds);
    let found = (page._id && page._type) ? { id: page._id, type: page._type } : null;
    if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
    if (!found || !found.id) return { error: 'Could not resolve the page.' };
    // Try plugin undo first (handles Elementor), else strip from post_content.
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/refresh-block`, { method: 'POST', body: { post_id: found.id, remove: true, open: REFRESH_OPEN, close: REFRESH_CLOSE } });
      if (r && r.ok) return { status: 'removed', via: r.mode || 'plugin' };
    } catch (e) {}
    const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=content`).catch(() => null);
    const raw = (post && post.content && (post.content.raw != null ? post.content.raw : '')) || '';
    const { html, removed } = stripRefreshBlock(raw);
    if (!removed) return { status: 'none', reason: 'No refresh block found on this page.' };
    await wp.update(found.type, found.id, { content: html }, { force: true });
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    if (site) await db.logActivity({ site_id: site.id, type: 'config', actor: 'You', icon: 'undo', text: `Removed refresh from “${page.title || pageUrl}”`, meta: pageUrl }).catch(() => {});
    return { status: 'removed', via: 'content' };
  },

  // Content Decay → full REWRITE of a decaying page (reviewed: apply:false previews, apply:true
  // writes). Generates the refresh brief if not supplied, rewrites the EXISTING post content via
  // Claude per the brief, and (apply) writes it back to the SAME WordPress post — gated on
  // write-armed; WordPress keeps a revision so it's reversible. Builder pages fall back to manual.
  'POST /content-rewrite': async (body) => {
    const page = body.page || {};
    const pageUrl = page.url || page.page || body.url;
    if (!pageUrl) return { error: 'No page specified' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const wp = new WordPressClient(creds);
    let found = (page._id && page._type) ? { id: page._id, type: page._type } : null;
    if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
    if (!found || !found.id) return { status: 'manual', reason: 'Could not match this URL to a WordPress post/page — rewrite it in the editor using the Brief.' };
    // Apply a REVIEWED rewrite directly — publish exactly what was previewed (no re-generation).
    if (body.apply && body.html && String(body.html).trim().length > 80) {
      if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then apply the rewrite.' };
      const clean = stripBannedContentBlocks(String(body.html).replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim());
      const elx = await elementorContentState(wp, found.id);
      if (elx.elementor && elx.widgets.length && !body.force) return { status: 'manual-builder', builder: 'Elementor', canElementorPush: true, postId: found.id, type: found.type, url: pageUrl, newHtml: clean, reason: 'This page’s content lives in Elementor widgets — writing it to the raw content field would break the layout. Use “Push into Elementor (safe)” (it swaps only the article widget, and saves a backup).', reversible: 'Reversible — a backup is saved (use Restore).' };
      const upd = await wp.update(found.type, found.id, { content: balanceBlockTags(clean) }, { force: true });   // balance tags so it can't break out of the theme’s content widget
      if (upd && upd.dryRun) return { status: 'dry-run' };
      const after = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=modified`).catch(() => null);
      const indexed = await submitOneForIndex(body.siteId, pageUrl);
      if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'You', icon: 'sparkles', text: `Rewrote & refreshed “${page.title || pageUrl}”`, meta: 'reviewed full rewrite + re-indexed (WordPress revision saved)' }).catch(() => {});
      return { status: 'applied', postId: found.id, url: pageUrl, indexed, modified: after && after.modified, reversible: 'WordPress keeps a revision — restore the previous version from the post’s Revisions if needed.' };
    }
    // Generation is heavy (2 Claude calls) and 504s at the edge on long pages, so when the
    // caller asks (start:true) run it in the BACKGROUND and let them poll /content-rewrite-status.
    const jobId = `${body.siteId}:${found.id}`;
    if (body.start && !body.apply) {
      const prevJob = REWRITES.get(jobId);
      if (prevJob && prevJob.status === 'running') return { started: true, jobId, postId: found.id, status: 'running' };
      REWRITES.set(jobId, { status: 'running', at: Date.now() });
      generateRewritePreview({ wp, found, page, site, siteId: body.siteId, brief: body.brief, feedback: body.feedback, priorDraft: body.priorDraft })
        .then((r) => REWRITES.set(jobId, { status: (r && !r.error) ? 'done' : 'error', result: r, error: r && r.error, at: Date.now() }))
        .catch((e) => REWRITES.set(jobId, { status: 'error', error: String(e.message || e), at: Date.now() }));
      return { started: true, jobId, postId: found.id, status: 'running' };
    }
    // Synchronous generate (short pages / preview), or the generation half of an apply.
    const gen = await generateRewritePreview({ wp, found, page, site, siteId: body.siteId, brief: body.brief, feedback: body.feedback, priorDraft: body.priorDraft });
    if (!gen || gen.status !== 'preview') return gen || { error: 'Rewrite failed.' };
    if (!body.apply) return gen;
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then apply the rewrite.' };
    const clean = gen.newHtml, title = gen.title;
    const elx = await elementorContentState(wp, found.id);
    if (elx.elementor && elx.widgets.length && !body.force) return { status: 'manual-builder', builder: 'Elementor', canElementorPush: true, postId: found.id, type: found.type, title, brief: gen.brief, newHtml: clean, reason: 'This page’s content lives in Elementor widgets — writing it to the raw content field would break the layout. Use “Push into Elementor (safe)” (it swaps only the article widget, and saves a backup).', reversible: 'Reversible — a backup is saved (use Restore).' };
    const upd = await wp.update(found.type, found.id, { content: balanceBlockTags(clean) }, { force: true });   // balance tags so it can't break out of the theme’s content widget
    if (upd && upd.dryRun) return { status: 'dry-run', newHtml: clean };
    const after = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=modified`).catch(() => null);
    const indexed = await submitOneForIndex(body.siteId, pageUrl);
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'sparkles', text: `Rewrote & refreshed “${title || pageUrl}”`, meta: 'full content rewrite + re-indexed (WordPress revision saved)' }).catch(() => {});
    return { status: 'applied', postId: found.id, url: pageUrl, indexed, modified: after && after.modified, reversible: 'WordPress keeps a revision — restore the previous version from the post’s Revisions if needed.' };
  },
  // Poll a background rewrite generation started with /content-rewrite {start:true}.
  'POST /content-rewrite-status': async (body) => {
    if (!body.siteId || !body.postId) return { error: 'siteId + postId required' };
    const j = REWRITES.get(`${body.siteId}:${body.postId}`);
    // No record for a job we were asked to poll: the in-memory REWRITES map is gone (process
    // restart / redeploy) or the job never started. Report a DISTINCT status so the UI can
    // surface a real "re-run" message instead of an indefinite spinner or a false idle.
    if (!j) return { status: 'unknown', reason: 'job not found — it may have completed or been lost to a restart; re-run' };
    if (j.status === 'done') return { status: 'done', ...(j.result || {}) };
    if (j.status === 'error') return { status: 'error', error: j.error || 'generation failed' };
    return { status: 'running', at: j.at };
  },

  // Append a responsive YouTube embed to a post/page (classic/Gutenberg HTML — e.g. the
  // n8n-authored posts; NOT for Elementor layouts, which store content as JSON). Idempotent
  // (skips when the video id is already in the content). Inserted just before the FIRST <h2>
  // (i.e. right after the intro), appended at the end if the post has no <h2>. WordPress
  // keeps a revision, so /content-restore is the undo.
  'POST /embed-video': async (body) => {
    const pageUrl = body.pageUrl || body.url;
    const vidUrl = String(body.videoUrl || '');
    const m = vidUrl.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,20})/);
    if (!body.siteId || !pageUrl || !m) return { error: 'siteId, pageUrl and a valid YouTube videoUrl are required' };
    const videoId = m[1];
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    let found = null; try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {}
    if (!found || !found.id) return { error: 'Could not match this URL to a WordPress post/page.' };
    const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=id,title,content`);
    const raw = String((post.content && (post.content.raw != null ? post.content.raw : post.content.rendered)) || '');
    if (!raw) return { error: 'Could not read the post content.' };
    // ONE video per article: if the post already carries ANY YouTube embed (n8n's, a
    // manual one, a different id), do not stack another on top of it.
    if (!raw.includes(videoId) && /<iframe[^>]*youtube(?:-nocookie)?\.com\/embed\//.test(raw)) {
      return { ok: true, already: true, otherVideo: true, postId: found.id, videoId, note: 'post already has a different YouTube embed — not adding a second' };
    }
    if (raw.includes(videoId)) {
      // Repair pass — idempotent, fixes two historical template defects in place:
      // (1) unclosed <div> inside the figure (unclosed divs have broken this site before);
      // (2) missing referrerpolicy on the iframe — Safari strips the referer on cross-site
      //     iframes without an explicit attribute, and YouTube now answers that with
      //     "Error 153: Video player configuration error" instead of playing.
      let fixed = raw;
      if (fixed.includes('</iframe></figure>')) fixed = fixed.split('</iframe></figure>').join('</iframe></div></figure>');
      fixed = fixed.replace(/(<iframe\b(?![^>]*\breferrerpolicy=)[^>]*youtube(?:-nocookie)?\.com\/embed\/[^>]*?)(\s*\/?>)/g, '$1 referrerpolicy="strict-origin-when-cross-origin"$2');
      if (fixed !== raw) {
        await wp.request(`/${found.type}/${found.id}`, { method: 'POST', body: { content: fixed } });
        if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: `Repaired video embed markup on post #${found.id}`, meta: 'div close + referrerpolicy (YT error 153)' }).catch(() => {});
        return { ok: true, already: true, repaired: true, postId: found.id, videoId };
      }
      return { ok: true, already: true, postId: found.id, videoId };
    }
    const safeTitle = String(body.title || 'Fast ILA — video guide').replace(/"/g, '&quot;');
    const embed = `\n\n<figure class="yt-embed" style="margin:28px 0;"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${safeTitle}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></figure>\n\n`;
    const h2 = raw.search(/<h2[\s>]/i);
    const content = h2 > 0 ? raw.slice(0, h2) + embed + raw.slice(h2) : raw + embed;
    await wp.request(`/${found.type}/${found.id}`, { method: 'POST', body: { content } });
    const check = await wp.request(`/${found.type}/${found.id}?_fields=content`).catch(() => null);
    const stuck = !!(check && check.content && String(check.content.rendered || '').includes(videoId));
    if (site) await db.logActivity({ site_id: site.id, type: stuck ? 'verified' : 'warning', actor: 'Agent', icon: 'sparkles', text: `Embedded YouTube video into “${((post.title && post.title.rendered) || pageUrl).slice(0, 70)}”`, meta: 'youtube ' + videoId + (stuck ? ' · verified' : ' · not visible in render') }).catch(() => {});
    return { ok: true, postId: found.id, type: found.type, videoId, verified: stuck };
  },

  // Remove ONE specific YouTube embed from a post (undo for a double-embed or a broken
  // placeholder like embed/XXXX). Strips the embed's wrapping container (figure.yt-embed /
  // div.youtube-embed-container / bare iframe) for the given videoId only. Revision-backed.
  'POST /remove-video-embed': async (body) => {
    const pageUrl = body.pageUrl || body.url;
    const videoId = String(body.videoId || '').trim();
    if (!body.siteId || !pageUrl || !/^[A-Za-z0-9_-]{2,20}$/.test(videoId)) return { error: 'siteId, pageUrl and videoId required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    let found = null; try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {}
    if (!found || !found.id) return { error: 'Could not match this URL to a WordPress post/page.' };
    const post = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=id,title,content`);
    const raw = String((post.content && (post.content.raw != null ? post.content.raw : post.content.rendered)) || '');
    if (!raw.includes(`/embed/${videoId}`)) return { ok: true, absent: true, postId: found.id, videoId };
    const esc = videoId.replace(/[-]/g, '\\-');
    // Bounded matches: never cross the wrapper's own closing tag, so a wrapper that does
    // NOT contain this id can never be spanned/removed by accident.
    const inFigure = `(?:(?!</figure>)[\\s\\S])*?`;
    const inDiv = `(?:(?!</div>)[\\s\\S])*?`;
    let content = raw
      // figure.yt-embed wrapper (our template)
      .replace(new RegExp(`<figure class="yt-embed"[^>]*>${inFigure}/embed/${esc}${inFigure}</figure>\\s*`, 'g'), '')
      // div.youtube-embed-container wrapper (the n8n template — holds only the iframe)
      .replace(new RegExp(`<div class="youtube-embed-container"[^>]*>${inDiv}/embed/${esc}${inDiv}</div>\\s*`, 'g'), '');
    // bare iframe fallback (no recognized wrapper)
    content = content.replace(new RegExp(`<iframe[^>]*/embed/${esc}[^>]*>\\s*</iframe>\\s*`, 'g'), '');
    if (content === raw) return { error: 'Embed found but its wrapper was not recognized — not touching the content.' };
    await wp.request(`/${found.type}/${found.id}`, { method: 'POST', body: { content } });
    const check = await wp.request(`/${found.type}/${found.id}?_fields=content`).catch(() => null);
    const gone = !!(check && !String((check.content && check.content.rendered) || '').includes(`/embed/${videoId}`));
    if (site) await db.logActivity({ site_id: site.id, type: gone ? 'verified' : 'warning', actor: 'Agent', icon: 'undo', text: `Removed YouTube embed ${videoId} from post #${found.id}`, meta: gone ? 'verified gone' : 'still present after save' }).catch(() => {});
    return { ok: true, postId: found.id, videoId, removed: gone };
  },

  // Remove BROKEN YouTube embeds from published posts. A real YouTube id is exactly 11
  // chars of [A-Za-z0-9_-]; anything else (e.g. the literal template placeholder "XXXX",
  // or "VIDEO_ID") is not a video and renders as YouTube's "An error occurred" player.
  // Deletes the whole video block — figure/lead-in/caption wrapper included — so no empty
  // shell is left behind. Revision-backed, read-back verified, idempotent.
  'POST /fix-broken-embeds': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    const VALID = /^[A-Za-z0-9_-]{11}$/;
    const posts = await wp.request(`/posts?orderby=date&order=desc&per_page=${body.limit || 30}&status=publish,draft,pending,future,private&context=edit&_fields=id,title,content`);
    const fixed = [];
    for (const p of (posts || [])) {
      const raw = String((p.content && (p.content.raw != null ? p.content.raw : p.content.rendered)) || '');
      const bad = [...new Set([...raw.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]))].filter((id) => !VALID.test(id));
      if (!bad.length) continue;
      let content = raw;
      for (const id of bad) {
        const esc = id.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');
        const inFig = `(?:(?!<\\/figure>)[\\s\\S])*?`;
        const inDiv = `(?:(?!<\\/div>)[\\s\\S])*?`;
        content = content
          .replace(new RegExp(`<figure[^>]*>${inFig}/embed/${esc}${inFig}</figure>\\s*`, 'g'), '')
          .replace(new RegExp(`<div class="youtube-embed-container"[^>]*>${inDiv}/embed/${esc}${inDiv}</div>\\s*`, 'g'), '')
          .replace(new RegExp(`<iframe[^>]*/embed/${esc}[^>]*>\\s*</iframe>\\s*`, 'g'), '');
      }
      if (content === raw) { fixed.push({ id: p.id, badIds: bad, removed: false, note: 'wrapper not recognised — left untouched' }); continue; }
      await wp.request(`/posts/${p.id}`, { method: 'POST', body: { content } });
      const check = await wp.request(`/posts/${p.id}?_fields=content`).catch(() => null);
      const gone = !!(check && !bad.some((id) => String((check.content && check.content.rendered) || '').includes('/embed/' + id)));
      fixed.push({ id: p.id, title: (p.title && p.title.rendered || '').slice(0, 70), badIds: bad, removed: gone });
      if (site) await db.logActivity({ site_id: site.id, type: gone ? 'verified' : 'warning', actor: 'Agent', icon: 'undo', text: `Removed broken video embed (${bad.join(', ')}) from “${(p.title && p.title.rendered || '#' + p.id).slice(0, 55)}”`, meta: 'placeholder id — not a real video' }).catch(() => {});
    }
    return { ok: true, scanned: (posts || []).length, fixed };
  },

  // Normalize YouTube embed MARKUP on already-published posts to one canonical form.
  // A writer's embed markup evolves in its prompt, but pages published under an older
  // version keep that older markup forever — so a single site ends up serving several
  // generations of iframe at once (e.g. youtube-nocookie + referrerpolicy, an autoplay
  // permission, or the current clean form) and only the newest ones play reliably.
  // This rewrites the WRAPPER ONLY: the video id in each block is preserved exactly, so a
  // page never changes which video it shows, and re-running is a no-op once normalized.
  // Ids that aren't real 11-char YouTube ids are left alone — removing those is
  // /fix-broken-embeds' job, not this route's. Revision-backed, read-back verified.
  'POST /normalize-video-embeds': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    const VALID = /^[A-Za-z0-9_-]{11}$/;
    // The one form that is known-good on these sites: youtube.com (not nocookie), an
    // explicit ?rel=0, no referrerpolicy, and no autoplay in the permission list.
    const canonical = (id) => `<div class="youtube-embed-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 1.5em 0;">\n<iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" src="https://www.youtube.com/embed/${id}?rel=0" title="YouTube video player" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>\n</div>`;
    const only = Array.isArray(body.postIds) && body.postIds.length ? new Set(body.postIds.map(Number)) : null;
    const posts = await wp.request(`/posts?orderby=date&order=desc&per_page=${body.limit || 30}&status=publish,draft,pending,future,private&context=edit&_fields=id,title,content`);
    const changed = [];
    for (const p of (posts || [])) {
      if (only && !only.has(Number(p.id))) continue;
      const raw = String((p.content && (p.content.raw != null ? p.content.raw : p.content.rendered)) || '');
      const seen = [];
      // Non-greedy to the first </div>: the container holds a single iframe and no nested div.
      const content = raw.replace(/<div class="youtube-embed-container"[^>]*>[\s\S]*?<\/div>/g, (block) => {
        const m = block.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]+)/);
        if (!m || !VALID.test(m[1])) return block;
        seen.push(m[1]);
        return canonical(m[1]);
      });
      if (content === raw) continue;
      await wp.request(`/posts/${p.id}`, { method: 'POST', body: { content } });
      const check = await wp.request(`/posts/${p.id}?_fields=content`).catch(() => null);
      // A lazy-load plugin may move the src to data-lazy-src, so assert on the URL, not on src=.
      const html = String((check && check.content && check.content.rendered) || '');
      const verified = seen.every((id) => html.includes(`/embed/${id}?rel=0`)) && !/youtube-nocookie/.test(html);
      changed.push({ id: p.id, title: (p.title && p.title.rendered || '').slice(0, 70), videos: seen, verified });
      if (site) await db.logActivity({ site_id: site.id, type: verified ? 'verified' : 'warning', actor: 'Agent', icon: 'check', text: `Normalized video embed (${seen.join(', ')}) on “${(p.title && p.title.rendered || '#' + p.id).slice(0, 55)}”`, meta: verified ? 'canonical markup verified live' : 'saved but read-back did not confirm' }).catch(() => {});
    }
    return { ok: true, scanned: (posts || []).length, changed };
  },

  // Strip INTERNAL strategy labels that leaked into reader-facing copy. The writer agents
  // receive directives named Hidden Insight / Semantic Analysis / Search Intent / Article
  // Goal etc. and are meant to APPLY them silently; occasionally one gets printed as a
  // heading prefix ("[Hidden Insight] Getting Your ILA Certificate…"). Removes only the
  // label wrapper — the heading text itself is preserved. Revision-backed, idempotent.
  'POST /strip-internal-labels': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    const LABEL = '(?:hidden insight|semantic analysis|search intent|article goal|writing style|target audience|content brief|primary keyword|key takeaway directive)';
    // "[Hidden Insight] Title" / "(Hidden Insight) Title" / "Hidden Insight: Title" — inside a heading only.
    const reHead = new RegExp(`(<h[1-6][^>]*>)\\s*(?:[\\[(]\\s*${LABEL}\\s*[\\])]|${LABEL}\\s*:)\\s*`, 'gi');
    const posts = await wp.request(`/posts?orderby=date&order=desc&per_page=${body.limit || 30}&status=publish,draft,pending,future,private&context=edit&_fields=id,title,content`);
    const fixed = [];
    for (const p of (posts || [])) {
      const raw = String((p.content && (p.content.raw != null ? p.content.raw : p.content.rendered)) || '');
      const content = raw.replace(reHead, '$1');
      if (content === raw) continue;
      await wp.request(`/posts/${p.id}`, { method: 'POST', body: { content } });
      const check = await wp.request(`/posts/${p.id}?_fields=content`).catch(() => null);
      const clean = !!(check && !reHead.test(String((check.content && check.content.rendered) || '')));
      fixed.push({ id: p.id, title: (p.title && p.title.rendered || '').slice(0, 70), verified: clean });
      if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: `Removed leaked internal label from “${(p.title && p.title.rendered || '#' + p.id).slice(0, 60)}”`, meta: 'writer directive printed as a heading' }).catch(() => {});
    }
    return { ok: true, scanned: (posts || []).length, fixed };
  },

  // Clean unresolved contact placeholders out of PUBLISHED posts. The writer agents are
  // (correctly) told to emit {PHONE}/{BOOKING_URL} rather than invent contact details when
  // APPROVED FACTS is empty — but until the prompts carried the real values, those tokens
  // reached live pages. Scans recent posts, resolves the tokens to the site's real values,
  // saves (WordPress revision = undo), read-back verifies. Idempotent.
  'POST /fix-contact-tokens': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const phone = String(body.phone || '020 7459 4037');
    const tel = String(body.tel || 'tel:+442074594037');
    const book = String(body.bookingUrl || 'https://fast-ila.co.uk/book-now/');
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    const posts = await wp.request(`/posts?orderby=date&order=desc&per_page=${body.limit || 30}&status=publish,draft,pending,future,private&context=edit&_fields=id,title,content,link`);
    const fixed = [], stillTokened = [];
    for (const p of (posts || [])) {
      const raw = String((p.content && (p.content.raw != null ? p.content.raw : p.content.rendered)) || '');
      if (!/\{(?:PHONE|PHONE_TEL|BOOKING_URL)\}/.test(raw)) continue;
      const content = raw
        .replace(/call\s+\{PHONE\}/gi, `call <a href="${tel}">${phone}</a>`)
        .replace(/\{PHONE_TEL\}/g, tel)
        .replace(/\{PHONE\}/g, `<a href="${tel}">${phone}</a>`)
        .replace(/href="\{BOOKING_URL\}"/g, `href="${book}"`)
        .replace(/use\s+\{BOOKING_URL\}\s+to\s+book/gi, `<a href="${book}">book online</a>`)
        .replace(/\{BOOKING_URL\}/g, `<a href="${book}">${book.replace('https://', '').replace(/\/$/, '')}</a>`);
      await wp.request(`/posts/${p.id}`, { method: 'POST', body: { content } });
      const check = await wp.request(`/posts/${p.id}?_fields=content`).catch(() => null);
      const clean = !!(check && !/\{(?:PHONE|PHONE_TEL|BOOKING_URL)\}/.test(String((check.content && check.content.rendered) || '')));
      fixed.push({ id: p.id, title: (p.title && p.title.rendered || '').slice(0, 70), verified: clean });
      if (!clean) stillTokened.push(p.id);
      if (site) await db.logActivity({ site_id: site.id, type: clean ? 'verified' : 'warning', actor: 'Agent', icon: 'check', text: `Resolved contact placeholders on “${(p.title && p.title.rendered || '#' + p.id).slice(0, 60)}”`, meta: '{PHONE}/{BOOKING_URL} → real values' }).catch(() => {});
    }
    return { ok: true, scanned: (posts || []).length, fixed, stillTokened };
  },

  // Undo a bad auto-apply: restore a page's PREVIOUS WordPress revision — the one-click
  // revert for when a rewrite broke the layout. `list:true` returns recent revisions with a
  // text preview so the UI can offer a picker; otherwise restores `revisionId` (or the
  // version just before the latest save) into post_content.
  'POST /content-restore': async (body) => {
    const pageUrl = (body.page && (body.page.url || body.page.page)) || body.url;
    if (!body.siteId || !pageUrl) return { error: 'siteId and page url required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    const wp = new WordPressClient(creds);
    let found = (body.page && body.page._id && body.page._type) ? { id: body.page._id, type: body.page._type } : null;
    if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
    if (!found || !found.id) return { error: 'Could not match this URL to a WordPress post/page.' };
    // Elementor pages: prefer the Elementor content backup (the correct undo for a builder
    // page — the layout lives in _elementor_data, not post_content). Only when there's no
    // such backup do we fall back to post_content revisions below.
    if (!body.list && !body.revisionId) {
      if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then restore.' };
      try {
        const er = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/elementor-restore`, { method: 'POST', body: { post_id: found.id } });
        if (er && er.ok && er.restored) {
          if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'You', icon: 'undo', text: `Restored previous Elementor content of “${pageUrl}”`, meta: 'elementor backup' }).catch(() => {});
          await submitOneForIndex(body.siteId, pageUrl).catch(() => {});
          return { status: 'restored', mode: 'elementor', postId: found.id, url: pageUrl };
        }
      } catch (e) { /* mu-plugin < 1.15.0 or no Elementor backup → post_content revisions */ }
    }
    let revs;
    try { revs = await wp.request(`/${found.type}/${found.id}/revisions?per_page=8&context=edit&_fields=id,modified,content`); } catch (e) { return { error: 'Could not read revisions: ' + e.message }; }
    if (!Array.isArray(revs) || revs.length < 2) return { error: 'No earlier revision available to restore for this page.' };
    if (body.list) {
      return { status: 'revisions', postId: found.id, revisions: revs.map((r) => ({ id: r.id, modified: r.modified, preview: String((r.content && (r.content.raw || r.content.rendered)) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) })) };
    }
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then restore.' };
    const target = body.revisionId ? revs.find((r) => r.id === body.revisionId) : revs[1];  // revs[0]=current, revs[1]=version before it
    const raw = target && target.content && (target.content.raw != null ? target.content.raw : '');
    if (!raw || raw.length < 20) return { error: 'That revision has no restorable content.' };
    await wp.update(found.type, found.id, { content: raw }, { force: true });
    const after = await wp.request(`/${found.type}/${found.id}?context=edit&_fields=modified`).catch(() => null);
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'You', icon: 'undo', text: `Restored previous version of “${pageUrl}”`, meta: `reverted to revision ${target.id} (${target.modified})` }).catch(() => {});
    return { status: 'restored', postId: found.id, url: pageUrl, revisionId: target.id, restoredFrom: target.modified, modified: after && after.modified };
  },

  // SAFE Elementor push — the "push automatically" for builder pages. Instead of
  // overwriting post_content (which breaks the layout), it locates the article-body TEXT
  // widget inside _elementor_data and swaps ONLY that widget's content (mu-plugin v1.15.0
  // backs it up first for one-click undo). Layout/columns/sidebar untouched.
  'POST /content-apply-elementor': async (body) => {
    const page = body.page || {};
    const pageUrl = page.url || page.page || body.url;
    const html = String(body.html || '');
    if (!body.siteId || !pageUrl || html.trim().length < 40) return { error: 'siteId, page url, and html required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const site = await db.getSite(body.siteId).catch(() => null);
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes for it first, then push.' };
    const wp = new WordPressClient(creds);
    let found = (page._id && page._type) ? { id: page._id, type: page._type } : null;
    if (!found) { try { found = await wp.resolvePostByUrl(pageUrl); } catch (e) {} }
    if (!found || !found.id) return { error: 'Could not match this URL to a WordPress post/page.' };
    const clean = html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let listed;
    try { listed = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/elementor-content`, { method: 'POST', body: { post_id: found.id, list: true } }); }
    catch (e) { return { error: 'This needs mu-plugin v1.15.0 — update it on the site (UX Activation → Update mu-plugin): ' + e.message, needsMuUpdate: true }; }
    if (listed && listed.elementor === false) return { status: 'not-elementor', reason: 'This page is not built with Elementor — use the normal Rewrite apply.' };
    const widgets = (listed && listed.widgets) || [];
    if (!widgets.length) return { status: 'no-widget', reason: 'No editable text widget found in this Elementor page — paste the rewrite into the builder manually.' };
    if (body.listOnly) return { status: 'widgets', postId: found.id, widgets };   // read-only: inspect the widgets without writing
    const target = body.widgetId ? widgets.find((w) => w.id === body.widgetId) : widgets.slice().sort((a, b) => (b.chars || 0) - (a.chars || 0))[0];  // article body = largest text widget
    if (!target) return { status: 'no-widget', reason: 'Target widget not found on the page.' };
    let rep;
    try { rep = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/elementor-content`, { method: 'POST', body: { post_id: found.id, widget_id: target.id, html: clean } }); }
    catch (e) { return { error: 'Elementor content replace failed: ' + e.message }; }
    if (!rep || !rep.ok) return { error: (rep && rep.reason) || 'Elementor replace did not apply.' };
    const indexed = await submitOneForIndex(body.siteId, pageUrl);
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'You', icon: 'sparkles', text: `Pushed rewrite into Elementor content of “${page.title || pageUrl}”`, meta: `widget ${target.id} · layout preserved · backup saved` }).catch(() => {});
    return { status: 'applied-elementor', postId: found.id, url: pageUrl, widgetId: target.id, widgetChars: target.chars, widgetCount: widgets.length, indexed, reversible: 'Use “Restore” to undo — the previous Elementor content was backed up.' };
  },

  // Site-wide cleanup: strip any legacy freshness block from EVERY post/page that has one.
  // Calls the mu-plugin's idempotent remove on each id (a true no-op where there's no block,
  // so untouched pages aren't re-saved or re-dated). Removes both classic + Elementor blocks.
  'POST /refresh-blocks-purge': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    let creds; try { creds = await credsForSite(body.siteId); } catch (e) { return { error: 'Connect this WordPress site first.', needsConnect: true }; }
    const wp = new WordPressClient(creds);
    const site = await db.getSite(body.siteId).catch(() => null);
    // Fast path: one server-side DB pass in the mu-plugin (v1.14.0+) — no per-page round-trips.
    try {
      const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/refresh-blocks-purge`, { method: 'POST', body: {} });
      if (r && r.ok) {
        if (site && r.removed) await db.logActivity({ site_id: site.id, type: 'config', actor: 'You', icon: 'undo', text: `Removed ${r.removed} legacy refresh block(s) site-wide`, meta: `classic ${r.classic_found}, elementor ${r.elementor_found}` }).catch(() => {});
        return { ok: true, removed: r.removed, classicFound: r.classic_found, elementorFound: r.elementor_found, via: 'bulk' };
      }
    } catch (e) { /* mu-plugin < 1.14.0 → slow per-page fallback */ }
    // Fallback (older mu-plugin): per-page remove (can 504 on large sites).
    let scanned = 0, removed = 0, failed = 0;
    for (const type of ['posts', 'pages']) {
      for (let pageN = 1; pageN <= 15; pageN++) {
        let rows;
        try { rows = await wp.request(`/${type}?per_page=100&page=${pageN}&status=publish,draft,private&_fields=id`); } catch (e) { break; }
        if (!Array.isArray(rows) || !rows.length) break;
        for (const r of rows) { scanned++; try { const rr = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/refresh-block`, { method: 'POST', body: { post_id: r.id, remove: true, open: REFRESH_OPEN, close: REFRESH_CLOSE } }); if (rr && rr.ok && rr.replaced) removed++; } catch (e) { failed++; } }
        if (rows.length < 100) break;
      }
    }
    if (site && removed) await db.logActivity({ site_id: site.id, type: 'config', actor: 'You', icon: 'undo', text: `Removed ${removed} legacy refresh block(s) site-wide`, meta: `${scanned} pages scanned` }).catch(() => {});
    return { ok: true, scanned, removed, failed, via: 'fallback' };
  },

  // Optimise the images USED ON one page (content-decay "refresh & optimise").
  // apply=false previews; apply=true converts the page's heavy raster images to WebP.
  'POST /page-optimize-images': async (body) => {
    const url = (body.page && (body.page.url || body.page.page)) || body.url;
    if (!body.siteId || !url) return { error: 'siteId and url required' };
    if (body.apply) {
      const site = await db.getSite(body.siteId).catch(() => null);
      if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'This site is read-only — arm writes first.' };
    }
    try { return await imageOpt.optimizePageImages(body.siteId, url, { apply: !!body.apply, max: body.max || 12 }); }
    catch (e) { return { error: 'Page image optimize failed: ' + e.message }; }
  },

  // Save/read a site's competitors + negative keywords (per-site config).
  'POST /site-competitors': async (body) => {
    const patch = {};
    if (Array.isArray(body.competitors)) patch.competitors = body.competitors;
    if (Array.isArray(body.negativeKeywords)) patch.negative_keywords = body.negativeKeywords;
    const site = await db.updateSite(body.siteId, patch);
    return { competitors: site.competitors || [], negativeKeywords: site.negative_keywords || [] };
  },

  // List supported DataForSEO target markets, and set a site's market (semrush_db).
  'POST /site-database': async (body) => {
    if (body.db) {
      const valid = semrush.COUNTRIES.some((c) => c.db === String(body.db).toLowerCase());
      if (!valid) return { error: 'Unsupported market: ' + body.db };
      const site = await db.updateSite(body.siteId, { semrush_db: String(body.db).toLowerCase() });
      await db.logActivity({ site_id: body.siteId, type: 'config', actor: 'You', icon: 'globe', text: 'Changed keyword market to ' + semrush.countryFor(body.db).label, meta: String(body.db).toUpperCase() }).catch(() => {});
      return { db: site.semrush_db, countries: semrush.COUNTRIES };
    }
    return { countries: semrush.COUNTRIES };
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

  // Per-site setup completeness (for the site-switcher badge): the 4 setup steps
  // — WP connected, GSC property chosen, Airtable base+column set, an audit run.
  'POST /sites-setup': async () => {
    const sites = await db.listSites().catch(() => []);
    const out = [];
    for (const s of (sites || [])) {
      const [gscSa, air, pat, audits] = await Promise.all([
        db.getGscSa(s.id).catch(() => null),
        db.getAirtableConfig(s.id).catch(() => null),
        db.getAirtablePat(s.id).catch(() => null),
        db.listAudits(s.id, 1).catch(() => []),
      ]);
      out.push({
        id: s.id,
        connected: s.status === 'connected',
        gsc: !!(gscSa && s.gsc_property),
        airtable: !!(pat && air && air.table_gaps),
        audit: Array.isArray(audits) && audits.length > 0,
      });
    }
    return { sites: out };
  },

  // ── Embedded Airtable grid: read & edit the site's table from the dashboard ──
  // Shared resolver: returns the PAT + base + table for the site, or an error obj.
  // Lists a page of records + the table's field schema (with select options) so
  // the grid can render proper editable cells (esp. the Status dropdown → n8n).
  'POST /airtable-records': async (body) => {
    const { siteId } = body;
    const pat = await db.getAirtablePat(siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    const cfg = await db.getAirtableConfig(siteId);
    if (!cfg || !cfg.base_id) return { error: 'Configure the Airtable base first.', needsConfig: true };
    try {
      const tables = await airtable.listTables(pat, cfg.base_id);
      if (!tables.length) return { error: 'No tables in this Airtable base.', needsConfig: true };
      // Which table to show: an explicit body.table (id/name) if it's in the base,
      // else the configured keyword table, else the first table. Lets the grid switch
      // between the keyword/content table and the GEO "AI Citation Results" table.
      let target = null;
      if (body.table) target = tables.find((t) => t.id === body.table || t.name === body.table);
      if (!target && cfg.table_gaps) target = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
      if (!target) target = tables[0];
      // Server-side search across the WHOLE table (not just the loaded page) — essential
      // when a table holds thousands of rows. Build a case-insensitive substring match
      // over the table's text-like fields; the term is sanitised so it can't break the
      // formula. Falls back to no filter (normal paging) when there's no search.
      let filterByFormula;
      if (body.search != null && String(body.search).trim()) {
        const term = String(body.search).toLowerCase().replace(/[^a-z0-9 _\-&.]/g, ' ').trim();
        if (term) {
          const SEARCHABLE = new Set(['singleLineText', 'multilineText', 'richText', 'singleSelect', 'multipleSelects', 'url', 'email', 'phoneNumber', 'formula', 'autoNumber', 'barcode']);
          const cols = (target.fields || []).filter((f) => SEARCHABLE.has(f.type) && !/[{}]/.test(f.name)).map((f) => `FIND("${term}",LOWER({${f.name}}&""))`);
          if (cols.length) filterByFormula = `OR(${cols.join(',')})`;
        }
      }
      // NEWEST-FIRST: Airtable's default order is insertion order (oldest first), which
      // buried fresh pushes behind "next 50 → next 50 → …". Sweep the table (25-page /
      // 2500-row safety cap), sort by createdTime desc, and page NUMERICALLY over the
      // sorted list — recent rows are always on page one. (Legacy opaque Airtable offsets
      // coerce to NaN → page 0.) A short server-side cache absorbs the browser's 12s poll
      // + tab-wake bursts so the sweep costs ~1 run per TTL, not 8+ Airtable calls per tick
      // (Airtable rate-limits at 5 req/s/base; a 429 there also breaks saves and n8n).
      const cacheKey = `${cfg.base_id}:${target.id}:${filterByFormula || ''}`;
      let all; const hit = _atRecCache.get(cacheKey);
      if (hit && hit.exp > Date.now()) { all = hit.all; }
      else {
        all = [];
        let atOffset; let pages = 0;
        do {
          const pg = await airtable.listRecords(pat, cfg.base_id, target.id, { pageSize: 100, offset: atOffset, filterByFormula });
          for (const r of (pg.records || [])) all.push(r);
          atOffset = pg.offset; pages++;
        } while (atOffset && pages < 25);
        all.sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')));
        all._truncated = !!atOffset;   // >2500 rows — the oldest tail beyond the cap wasn't fetched
        _atRecCache.set(cacheKey, { all, exp: Date.now() + 10000 });
        if (_atRecCache.size > 40) { for (const [k, v] of _atRecCache) if (v.exp < Date.now()) _atRecCache.delete(k); }
      }
      const start = Math.max(0, Number(body.offset) || 0);
      const size = body.pageSize || 50;
      const page = { records: all.slice(start, start + size), offset: (start + size) < all.length ? String(start + size) : undefined };
      // Which table is the MASTER content list (the n8n-watched Article Writer)?
      const masterT = cfg.table_gaps ? tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps) : null;
      return {
        total: all.length, truncated: all._truncated || undefined,
        masterTableId: (masterT && masterT.id) || null,
        fields: target.fields || [], tableName: target.name, tableId: target.id,
        records: page.records, offset: page.offset,
        tables: tables.map((t) => ({ id: t.id, name: t.name })),
        keywordField: cfg.table_content || 'Keyword',
      };
    } catch (e) { return { error: e.message }; }
  },
  // Patch one record's fields (inline cell edit / Status change that triggers n8n).
  'POST /airtable-update-record': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected' };
    const cfg = await db.getAirtableConfig(body.siteId);
    if (!cfg || !cfg.base_id) return { error: 'Not configured' };
    if (!body.recordId) return { error: 'recordId required' };
    const tbl = body.table || cfg.table_gaps;  // edit the table the grid is viewing
    if (!tbl) return { error: 'Not configured' };
    try {
      const record = await airtable.updateRecord(pat, cfg.base_id, tbl, body.recordId, body.fields || {});
      // Invalidate the records cache for this base — an edit/Status-flip used to visually
      // REVERT for up to 10s because the next poll served the pre-write cached sweep.
      for (const k of _atRecCache.keys()) if (k.startsWith(cfg.base_id + ':')) _atRecCache.delete(k);
      return { record };
    }
    catch (e) { return { error: e.message }; }
  },
  // Add a new row.
  'POST /airtable-create-record': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected' };
    const cfg = await db.getAirtableConfig(body.siteId);
    if (!cfg || !cfg.base_id) return { error: 'Not configured' };
    const tbl = body.table || cfg.table_gaps;
    if (!tbl) return { error: 'Not configured' };
    try {
      const record = await airtable.createRecord(pat, cfg.base_id, tbl, body.fields || {});
      for (const k of _atRecCache.keys()) if (k.startsWith(cfg.base_id + ':')) _atRecCache.delete(k);
      return { record };
    }
    catch (e) { return { error: e.message }; }
  },

  // List the bases this site's stored PAT can access (for the per-site dropdown).
  'POST /airtable-bases': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    try { return { bases: await airtable.listBases(pat) }; }
    catch (e) { return { error: e.message }; }
  },

  // List tables (with their fields) in a chosen base — for the table + keyword-field dropdowns.
  'POST /airtable-tables': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    if (!body.baseId) return { error: 'A base is required.' };   // else Airtable returns a bare 404
    try { return { tables: await airtable.listTables(pat, body.baseId) }; }
    catch (e) { return { error: e.message }; }
  },

  // Create a column/field on a table if it doesn't already exist (idempotent).
  // Needs the PAT to have schema.bases:write. Used e.g. to add a "YT Link" column
  // to an Article Writer table so an n8n workflow can embed a per-article video.
  'POST /airtable-ensure-field': async (body) => {
    const pat = await db.getAirtablePat(body.siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    if (!body.baseId || !body.tableId || !body.name) return { error: 'baseId, tableId, name required' };
    try {
      const tables = await airtable.listTables(pat, body.baseId).catch(() => []);
      const tbl = (tables || []).find((t) => t.id === body.tableId || t.name === body.tableId);
      if (tbl && (tbl.fields || []).some((f) => f.name === body.name)) return { ok: true, existed: true, name: body.name };
      const created = await airtable.ensureField(pat, body.baseId, body.tableId, body.name, body.type || 'singleLineText');
      if (!created) return { error: 'could not create field — the PAT may lack schema.bases:write scope' };
      return { ok: true, created: true, name: created };
    } catch (e) { return { error: e.message }; }
  },

  // Save the per-site destination: base + the table & keyword column to fill.
  // NOTE: the airtable_config table predates this flow, so we reuse two existing
  // columns — table_gaps = keyword TABLE (id), table_content = keyword FIELD name.
  'POST /airtable-config': async (body) => {
    const patch = {};
    if (body.baseId !== undefined) patch.base_id = body.baseId;
    if (body.tableKeywords !== undefined) patch.table_gaps = body.tableKeywords;
    if (body.keywordField !== undefined) patch.table_content = body.keywordField;
    const cfg = await db.upsertAirtableConfig(body.siteId, patch);
    return { config: cfg };
  },

  // Read current Airtable config + connection status for a site.
  // Surfaces the repurposed columns under clear names for the UI.
  'POST /airtable-status': async (body) => {
    const cfg = await db.getAirtableConfig(body.siteId);
    const pat = await db.getAirtablePat(body.siteId).catch(() => null);
    const view = cfg ? { ...cfg, table_keywords: cfg.table_gaps || null, keyword_field: cfg.table_content || null } : null;
    return { connected: !!pat, config: view };
  },

  // THE KEYWORD FLOW: push content-gap keywords into this site's Airtable table,
  // filling ONLY the chosen keyword column (one row per keyword). Airtable's own
  // automation then writes the articles. De-dupes against existing rows.
  'POST /airtable-push-keywords': async (body) => {
    const { siteId } = body;
    const pat = await db.getAirtablePat(siteId);
    if (!pat) return { error: 'Airtable not connected', needsConnect: true };
    const cfg = await db.getAirtableConfig(siteId);
    if (!cfg || !cfg.base_id) return { error: 'No Airtable base selected for this site.', needsConfig: true };
    const table = cfg.table_gaps;                 // repurposed: keyword table
    const field = cfg.table_content || 'Keyword'; // repurposed: keyword field
    if (!table) return { error: 'No Airtable table selected for this site.', needsConfig: true };

    // Keywords: use the list the UI passed, else derive content-GAP keywords
    // (clusters with no existing page) from the opportunity engine.
    let keywords = Array.isArray(body.keywords) && body.keywords.length ? body.keywords : null;
    let gapClusters = null, derived = false;
    if (!keywords) {
      const r = await findOpportunities(siteId, { maxKeywords: body.maxKeywords || 160 });
      if (r.error) return { error: r.error };
      gapClusters = (r.clusters || []).filter((c) => c.isGap);
      keywords = gapClusters.map((c) => c.primaryKeyword).filter(Boolean);
      derived = true;
    }
    if (!keywords.length) return { error: 'No content-gap keywords found to push — run a Content Plan first, or add competitors/connect Search Console.', pushed: 0 };

    // Internal Links column: for each keyword, attach 2-3 relevant EXISTING pages
    // (topic match) so n8n's article writer can link to them. Best-effort — needs
    // the PAT to allow creating the field (schema.bases:write) if it's missing.
    let extras = null, linkField = null;
    if (body.includeInternalLinks !== false) {
      try {
        const tables = await airtable.listTables(pat, cfg.base_id);
        const tbl = tables.find((t) => t.id === table || t.name === table);
        let f = tbl && (tbl.fields || []).find((x) => /internal\s*link/i.test(x.name));
        if (!f && tbl) { const created = await airtable.ensureField(pat, cfg.base_id, tbl.id, 'Internal Links', 'multilineText'); if (created) f = { name: created }; }
        if (f) {
          linkField = f.name;
          const { baseUrl, username, appPassword } = await credsForSite(siteId);
          const wp = new WordPressClient({ baseUrl, username, appPassword });
          const [pg, ps] = await Promise.all([
            wp.list('pages', { perPage: 100, fields: 'title,link' }).catch(() => []),
            wp.list('posts', { perPage: 100, fields: 'title,link' }).catch(() => []),
          ]);
          const STOP = new Set('the and for you your our how what why best top guide vs are can with from into a an of to in on at is it this that'.split(' '));
          const tok = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
          const pages = [...pg, ...ps].map((p) => ({ title: (p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim(), url: p.link })).filter((p) => p.title && p.url).map((p) => ({ url: p.url, toks: new Set(tok(p.title)) }));
          extras = {};
          const clusters = gapClusters || keywords.map((k) => ({ primaryKeyword: k }));
          for (const c of clusters) {
            const kw = c.primaryKeyword || c; if (!kw) continue;
            const ct = new Set(tok(kw + ' ' + (c.suggestedTitle || '')));
            const top = pages.map((p) => ({ url: p.url, score: [...ct].filter((t) => p.toks.has(t)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
            if (top.length) extras[kw] = { [linkField]: top.map((x) => x.url).join('\n') };
          }
        }
      } catch (e) { extras = null; /* push keywords without links */ }
    }

    try {
      let res;
      try {
        res = await airtable.pushKeywords(pat, cfg.base_id, table, field, keywords, { extras });
      } catch (e) {
        // The optional "Internal Links" enrichment column may not exist/be writable on this
        // table (no schema-write scope). NEVER let that block the core keyword push — retry
        // with just the keyword column so the writer still gets every keyword.
        if (extras && /unknown field|422|invalid|cannot|field/i.test(e.message || '')) {
          res = await airtable.pushKeywords(pat, cfg.base_id, table, field, keywords, {});
          linkField = null;
        } else throw e;
      }
      await db.logAirtableSync({ site_id: siteId, kind: 'keywords', records_pushed: res.pushed, status: 'ok' }).catch(() => {});
      await db.upsertAirtableConfig(siteId, { last_sync: new Date().toISOString() }).catch(() => {});
      return { ok: true, ...res, candidates: keywords.length, derived, field, linkField };
    } catch (e) { return { error: 'Airtable push failed: ' + e.message }; }
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
      // Best-effort audit log — a missing airtable_sync_log table must not 500 a sync
      // whose rows already landed in Airtable (matches the guard on the other callers).
      await db.logAirtableSync({ site_id: siteId, kind, records_pushed: pushed, status: 'ok' }).catch(() => {});
    }
    function defaultName(k) { return { gaps: 'SEO Keyword Gaps', content: 'Content Suggestions', geo: 'AI Citation Results', geo_competitors: 'AI Competitor Share', geo_opportunities: 'AI Visibility Opportunities', opportunities: 'Content Opportunities' }[k]; }

    // Resolve the site's Article Writer table — the ONE n8n-watched table (stored as
    // table_gaps). Returns {tableId, tableName, briefField, fieldSet} or null if the
    // config is unset OR points at a missing/stale table (so callers fall back). All
    // content pushes (keywords, clusters, briefs) land here — never a new table —
    // which is what the client wants (one table → the one article-writer workflow).
    let _awTarget;
    async function articleWriterTarget() {
      if (_awTarget !== undefined) return _awTarget;
      const tref = cfg.table_gaps;
      if (!tref) return (_awTarget = null);
      let tables = [];
      try { tables = await airtable.listTables(pat, baseId); } catch (e) { tables = []; }
      const tbl = tables.find((t) => t.id === tref || t.name === tref);
      if (!tbl) return (_awTarget = null);   // table_gaps points to a deleted/stale table
      let briefField = 'Content Brief';
      const names = new Set((tbl.fields || []).map((f) => f.name));
      if (!names.has('Content Brief')) { try { briefField = await airtable.ensureField(pat, baseId, tbl.id, 'Content Brief', 'multilineText'); } catch (e) { briefField = null; } }
      if (briefField) names.add(briefField);
      return (_awTarget = { tableId: tbl.id, tableName: tbl.name, briefField, fieldSet: names });
    }
    // Push rows into the Article Writer table, field-set-filtered (so a differing
    // schema can't 422) and de-duped (case-insensitive) by `dedupeField`.
    async function pushToArticleWriter(kind, rows, dedupeField, opts) {
      const upsert = !!(opts && opts.upsert);
      const aw = await articleWriterTarget();
      if (!aw) return false;   // not resolvable → caller falls back to legacy behaviour
      // Carry the dedupe key from the ORIGINAL row — if the target table lacks the dedupe
      // column, field-filtering would strip it and every push would duplicate silently.
      let r = (rows || []).filter(Boolean).map((row) => ({ row, key: dedupeField ? String(row[dedupeField] || '').trim().toLowerCase() : '' }));
      if (aw.fieldSet) r = r.map(({ row, key }) => { const o = {}; for (const k of Object.keys(row)) if (aw.fieldSet.has(k)) o[k] = row[k]; return { row: o, key }; }).filter(({ row }) => Object.keys(row).length);
      // Map existing dedupeField value → recordId (paginated), so we can either skip
      // dupes or (upsert) PATCH them to backfill new fields like Content Brief.
      const existing = new Map();
      if (dedupeField && r.length) {
        try {
          let offset;
          do {
            const page = await airtable.listRecords(pat, baseId, aw.tableId, { pageSize: 100, offset, fields: [dedupeField] });
            for (const rec of (page.records || [])) { const v = String((rec.fields || {})[dedupeField] || '').trim().toLowerCase(); if (v && !existing.has(v)) existing.set(v, rec.id); }
            offset = page.offset;
          } while (offset);
        } catch (e) { /* read failed → treat as none existing */ }
      }
      let created = 0, updated = 0, skipped = 0;
      const toCreate = [], batch = new Set();
      for (const { row, key } of r) {
        if (key && existing.has(key)) {
          if (upsert) { try { await airtable.updateRecord(pat, baseId, aw.tableId, existing.get(key), row); updated++; } catch (e) { skipped++; } }
          else skipped++;
        } else if (key && batch.has(key)) { skipped++; }
        else { if (key) batch.add(key); toCreate.push(row); }
      }
      if (toCreate.length) created = await airtable.createRecords(pat, baseId, aw.tableId, toCreate);
      out[kind] = { pushed: created, updated, skipped, table: aw.tableName };
      // Best-effort audit log — must not 500 a sync whose rows already landed in Airtable.
      await db.logAirtableSync({ site_id: siteId, kind, records_pushed: created + updated, status: 'ok' }).catch(() => {});
      return true;
    }

    // 1) Keyword gaps (DataForSEO) — needs a competitor; uses body.competitor or the data passed in.
    if (kinds.includes('gaps')) {
      let gaps = body.gaps;
      if (!gaps && semrush.hasKey() && body.competitor) {
        const site = await db.getSite(siteId);
        const dom = (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const g = await semrush.keywordGap(dom, body.competitor, { db: site.semrush_db || 'uk' }).catch(() => ({ gaps: [] }));
        gaps = g.gaps;
      }
      // Writer-ready rows (Title + Keyword + Content Brief) — NOT bare keyword rows whose
      // stat fields get filtered away, leaving half-empty "ghost" rows in the master list.
      const aw = await articleWriterTarget();
      const rows = aw
        ? airtable.mapGapBriefs(gaps || [], aw.briefField)
        : airtable.mapGaps(gaps || [], 'DataForSEO', now);
      // Land keywords in the Article Writer table (de-duped by Keyword); only if that
      // table isn't configured do we fall back to a dedicated 'SEO Keyword Gaps' table.
      const done = await pushToArticleWriter('gaps', rows, 'Keyword');
      if (!done) await push('gaps', cfg.table_gaps, airtable.mapGaps(gaps || [], 'DataForSEO', now), airtable.SCHEMAS.gaps);
    }
    // 2) Content suggestions (passed from the UI's content-intel result).
    //    NOTE: cfg.table_content stores the KEYWORD FIELD name (see /airtable-config), not
    //    a table — passing it as a table name created/wrote a table literally named after
    //    the field. Suggestions always go to the default 'Content Suggestions' table.
    if (kinds.includes('content')) {
      await push('content', null, airtable.mapContent(body.suggestions || [], now), airtable.SCHEMAS.content);
    }
    // 3) GEO citation results (passed from the UI's last GEO run).
    //    De-dupe against prompts already in the table so re-scans don't pile up
    //    duplicate rows (the table accumulates one row per prompt over time).
    if (kinds.includes('geo')) {
      let geoRows = airtable.mapGeo(body.geoResults || [], now);
      if (geoRows.length) {
        try {
          const t = cfg.table_geo || defaultName('geo');
          const seen = await airtable.listFieldValues(pat, baseId, t, 'Prompt');
          const before = geoRows.length;
          geoRows = geoRows.filter((r) => !seen.has(String(r.Prompt || '').trim().toLowerCase()));
          out.geoSkipped = before - geoRows.length;
        } catch (e) { /* table may not exist yet → push all (ensureTable creates it) */ }
      }
      await push('geo', cfg.table_geo, geoRows, airtable.SCHEMAS.geo);
      // Competitor share-of-voice — the SECOND result set. Different shape, so its own
      // dedicated table ('AI Competitor Share') in the same base. Each scan appends a
      // timestamped snapshot (no de-dupe → a share-of-voice trend over time).
      const compRows = airtable.mapCompetitors(body.geoCompetitors || [], body.geoTarget || null, now);
      if (compRows.length) await push('geo_competitors', cfg.table_geo_competitors, compRows, airtable.SCHEMAS.geo_competitors);
    }
    // 4) Content opportunities (keyword clusters from the Content screen) → the SAME
    //    Article Writer table (one row per cluster, carrying its brief if generated),
    //    NOT a separate table. De-duped by Title. Falls back to a dedicated
    //    'Content Opportunities' table only when no Article Writer table is configured.
    if (kinds.includes('opportunities')) {
      const aw = await articleWriterTarget();
      const clusters = body.clusters || [];
      if (aw) {
        const rows = clusters.map((c) => airtable.mapArticleBrief(c, c.brief || null, aw.briefField, null));
        await pushToArticleWriter('opportunities', rows, 'Title', { upsert: true });
      } else {
        await push('opportunities', cfg.table_opportunities, airtable.mapOpportunities(clusters, now), airtable.SCHEMAS.opportunities);
      }
    }
    // 5) AI-visibility opportunities — queries where AI answers DON'T cite this site yet.
    //    These are content to WRITE, so they belong in the master Article Writer alongside
    //    every other opportunity — previously they only ever landed in the read-only
    //    "AI Visibility Opportunities" tracking table, where nothing could be written from
    //    them. Now: writer-ready rows (Title + Keyword + Content Brief), de-duped by Title;
    //    the tracking table is still written too (it's the scan-history log), and remains
    //    the fallback when no Article Writer table is configured.
    if (kinds.includes('geo_opportunities')) {
      const opps = (body.geoOpportunities || []).filter((r) => r && r.prompt && !r.error);
      const aw = await articleWriterTarget();
      if (aw && opps.length) {
        const rows = opps.map((r) => {
          const q = String(r.prompt).trim();
          const title = q.charAt(0).toUpperCase() + q.slice(1);
          const cited = (r.citedDomains || []).join(', ');
          const lines = [
            `AI-visibility gap: AI assistants answer this query WITHOUT citing us.`,
            `Query: ${q}`,
            r.intent ? `Intent: ${r.intent}` : '',
            cited ? `Currently cited instead: ${cited}` : '',
            '',
            'Write the definitive, directly-quotable answer to this query: lead with a crisp 2-3 sentence answer, then the supporting detail, so AI assistants can cite us for it.',
          ].filter((l) => l !== '');
          const row = { Title: title, Keyword: q, 'Primary Keyword': q, Category: 'Blog',
            Description: `AI-visibility gap — AI answers this query without citing us${cited ? ` (cites ${cited})` : ''}. Answer it definitively and quotably.` };
          if (aw.briefField) row[aw.briefField] = lines.join('\n');
          return row;
        });
        await pushToArticleWriter('geo_opportunities', rows, 'Title', { upsert: true });
      }
      // Tracking table (scan history) — also the fallback when no Article Writer exists.
      let oppRows = airtable.mapGeoOpportunities(body.geoOpportunities || [], now);
      if (oppRows.length) {
        try {
          const t = cfg.table_geo_opportunities || defaultName('geo_opportunities');
          const seen = await airtable.listFieldValues(pat, baseId, t, 'Query');
          const before = oppRows.length;
          oppRows = oppRows.filter((r) => !seen.has(String(r.Query || '').trim().toLowerCase()));
          out.geoOppsSkipped = before - oppRows.length;
        } catch (e) { /* table may not exist yet → push all (ensureTable creates it) */ }
      }
      // The tracking table is a SECONDARY scan log. When the writer push already succeeded,
      // a missing/permission-blocked log table must not surface as the operation's error
      // (it was reporting "Airtable 403" for a push that had in fact landed).
      try {
        await push(aw ? 'geo_opportunities_log' : 'geo_opportunities', cfg.table_geo_opportunities, oppRows, airtable.SCHEMAS.geo_opportunities);
      } catch (e) {
        if (!aw) throw e;   // no writer table → the log WAS the destination, so it's fatal
        out.geo_opportunities_log = { pushed: 0, note: 'tracking table unavailable: ' + (e && e.message || e) };
      }
    }

    // 6) Content brief → the EXISTING "Article Writer" table (the n8n-watched table,
    //    stored as table_gaps). One rich row — Title + Keyword + meta + the full plan
    //    in a "Content Brief" column — so the article writer has the dashboard's brief
    //    as context instead of a bare keyword. We do NOT set the triggering Status:
    //    the user flips it to "Write Article" in the grid (the existing trigger), so a
    //    button click never auto-fires generation/publish (which costs API credits).
    if (kinds.includes('article_brief')) {
      const aw = await articleWriterTarget();
      if (!aw) { out.article_brief = { error: 'No Article Writer table configured for this site.' }; }
      else {
        const row = airtable.mapArticleBrief(body.cluster || {}, body.brief || null, aw.briefField, null);
        if (!row) { out.article_brief = { pushed: 0, note: 'no brief' }; }
        else { await pushToArticleWriter('article_brief', [row], 'Title', { upsert: true }); }
      }
    }

    await db.upsertAirtableConfig(siteId, { last_sync: now });
    return { ok: true, synced: out, at: now };
  },

  // Content intelligence: gaps, suggestions, keyword clusters for a site.
  // Pulls the site's post/page titles via REST, then asks Claude to analyze.
  'POST /content-intel': async (body) => {
    const { creds, site } = await resolveCreds(body);
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
      intel = await claude.contentIntelligence({ siteName: body.siteName || creds.baseUrl, niche: body.niche, titles: sample, siteId: body.siteId, market: marketFor(site && site.semrush_db) });
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
    const sid = body.siteId || null;
    if (t === 'meta_description') return { value: await claude.metaDescription({ ...(body.input || {}), siteId: sid }) };
    if (t === 'title') return { value: await claude.titleRewrite({ ...(body.input || {}), siteId: sid }) };
    if (t === 'alt') return { value: await claude.altText({ ...(body.input || {}), siteId: sid }) };
    return { value: await claude.draftFix({ finding: body.finding || {}, pageContext: body.input || {}, siteId: sid }) };
  },

  // Apply one approved meta change — verify-after-write. Supports secure siteId
  // (secret decrypted server-side) OR creds-in-body. DRY_RUN honored.
  // Outcome measurement: did the applied fixes actually move the needle? Compares the
  // GSC performance of the APPLIED pages in a 28-day window BEFORE the changes began vs
  // the most recent 28 days. Two page-dimension GSC queries (free) matched to the verified
  // proposals — no per-page storage needed. Honest about sparse / too-recent data.
  'POST /apply-impact': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'site not found' };
    const applied = await db.listAppliedProposals(body.siteId).catch(() => []);
    if (!applied || !applied.length) return { noChanges: true, note: 'No applied changes yet — approve & apply fixes, then check back after ~2 weeks of Google data.' };
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr || !site.gsc_property) return { needsConnect: true, note: 'Connect Google Search Console for this site to measure impact.' };
    let sa; try { sa = JSON.parse(saStr); } catch (e) { return { error: 'stored GSC credential is unreadable' }; }

    const base = site.url && /^https?:/i.test(site.url) ? site.url : 'https://' + (site.url || '');
    const pathOf = (u) => { try { return new URL(u, base).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return String(u || '').replace(/\/+$/, '') || '/'; } };
    const ymd = (d) => new Date(d).toISOString().slice(0, 10);
    const shift = (d, days) => ymd(new Date(new Date(d).getTime() + days * 86400000));
    const firstApply = applied[0].applied_at ? new Date(applied[0].applied_at) : null;
    const lastApply = applied[applied.length - 1].applied_at ? new Date(applied[applied.length - 1].applied_at) : null;
    const afterStart = gsc.daysAgo(30), afterEnd = gsc.daysAgo(2);
    const beforeEnd = firstApply ? shift(firstApply, -2) : gsc.daysAgo(60);
    const beforeStart = firstApply ? shift(firstApply, -30) : gsc.daysAgo(88);

    let before, after;
    try {
      [before, after] = await Promise.all([
        gsc.query(sa, site.gsc_property, { startDate: beforeStart, endDate: beforeEnd, dimensions: ['page'], rowLimit: 5000 }),
        gsc.query(sa, site.gsc_property, { startDate: afterStart, endDate: afterEnd, dimensions: ['page'], rowLimit: 5000 }),
      ]);
    } catch (e) {
      if (e.code === 'NO_ACCESS') return { error: e.message, needsProperty: true };
      return { error: 'GSC query failed: ' + e.message };
    }
    const byPage = new Map();
    for (const p of applied) { const path = pathOf(p.page); if (!byPage.has(path)) byPage.set(path, { path, page: p.page, fields: [], appliedAt: p.applied_at }); byPage.get(path).fields.push(p.field); }
    const idx = (rows) => { const m = new Map(); for (const r of rows || []) { const path = pathOf(r.keys && r.keys[0]); if (byPage.has(path)) m.set(path, r); } return m; };
    const b = idx(before), a = idx(after);
    const changes = [];
    let sBefC = 0, sAftC = 0, sBefI = 0, sAftI = 0, pBefW = 0, pBefI = 0, pAftW = 0, pAftI = 0, improved = 0, measured = 0;
    for (const pg of byPage.values()) {
      const bb = b.get(pg.path), aa = a.get(pg.path);
      if (!bb && !aa) { changes.push({ page: pg.page, fields: [...new Set(pg.fields)], appliedAt: pg.appliedAt, measurable: false, reason: 'no Google data for this page yet' }); continue; }
      measured++;
      const bc = bb ? bb.clicks : 0, ac = aa ? aa.clicks : 0, bi = bb ? bb.impressions : 0, ai = aa ? aa.impressions : 0;
      const bp = bb ? bb.position : null, ap = aa ? aa.position : null;
      sBefC += bc; sAftC += ac; sBefI += bi; sAftI += ai;
      if (bp != null) { pBefW += bp * (bi || 1); pBefI += (bi || 1); }
      if (ap != null) { pAftW += ap * (ai || 1); pAftI += (ai || 1); }
      const posDelta = (bp != null && ap != null) ? Math.round((bp - ap) * 10) / 10 : null;   // +ve = ranking IMPROVED
      if (ac > bc || (posDelta != null && posDelta > 0)) improved++;
      changes.push({ page: pg.page, fields: [...new Set(pg.fields)], appliedAt: pg.appliedAt, measurable: true,
        clicks: { before: bc, after: ac, delta: ac - bc },
        impressions: { before: bi, after: ai, delta: ai - bi },
        position: { before: bp != null ? Math.round(bp * 10) / 10 : null, after: ap != null ? Math.round(ap * 10) / 10 : null, delta: posDelta } });
    }
    changes.sort((x, y) => ((y.clicks ? y.clicks.delta : -1e9) - (x.clicks ? x.clicks.delta : -1e9)));
    const avgPosB = pBefI ? pBefW / pBefI : null, avgPosA = pAftI ? pAftW / pAftI : null;
    const recentDays = lastApply ? Math.round((Date.now() - lastApply.getTime()) / 86400000) : null;
    return {
      window: { before: `${beforeStart} → ${beforeEnd}`, after: `${afterStart} → ${afterEnd}` },
      pagesApplied: byPage.size, pagesMeasured: measured, pagesImproved: improved,
      tooRecent: recentDays != null && recentDays < 14,
      summary: {
        clicks: { before: sBefC, after: sAftC, delta: sAftC - sBefC },
        impressions: { before: sBefI, after: sAftI, delta: sAftI - sBefI },
        avgPosition: { before: avgPosB != null ? Math.round(avgPosB * 10) / 10 : null, after: avgPosA != null ? Math.round(avgPosA * 10) / 10 : null, delta: (avgPosB != null && avgPosA != null) ? Math.round((avgPosB - avgPosA) * 10) / 10 : null },
      },
      changes: changes.slice(0, 100),
      note: recentDays != null && recentDays < 14 ? 'Some changes were applied recently — Google needs ~2-4 weeks to reflect them, so the "after" numbers may understate the eventual impact.' : null,
    };
  },

  'POST /apply-meta': async (body) => {
    const { creds, site } = await resolveCreds(body);
    // Block writes when the site is not write-armed (unless explicitly forced & not dry).
    if (site && site.write_armed === false && !body.force) {
      return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    }
    const wp = clientFrom(creds);
    // Resolve the target post: prefer an explicit postId, else look it up from the
    // page URL (audit proposals carry `page`, not a post_id, until first applied).
    let objectType = body.objectType || 'posts';
    let postId = body.postId;
    if (!postId) {
      let pageUrl = body.url || (body.page && (body.page.url || body.page)) || '';
      try { pageUrl = new URL(pageUrl, creds.baseUrl).href; } catch (e) {}
      const found = pageUrl ? await wp.resolvePostByUrl(pageUrl).catch(() => null) : null;
      if (found) { postId = found.id; objectType = found.type; }
    }
    if (!postId) return { status: 'failed', reason: 'Could not resolve which page to update from the URL — check the page exists.' };
    if (body.dryRun) {
      return { status: 'dry-run', wouldWrite: { id: postId, field: body.field, value: body.value } };
    }
    // Archive guard: if this URL is served by a post-type archive rather than the Page we
    // resolved, meta written to that page verifies but can NEVER render (the mu-plugin
    // bridge is is_singular()-only). Detect it and refuse honestly instead of banking a
    // fake success. The bulk metadata repair handles archives via the archive-option path.
    {
      const pageUrl = body.url || (body.page && (body.page.url || body.page)) || '';
      if (pageUrl) {
        let html = '';
        try {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
          try { const rr = await fetch(new URL(pageUrl, creds.baseUrl).href, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal }); if (rr.ok) html = await rr.text(); } finally { clearTimeout(t); }
        } catch (e) {}
        if (html && rendersAsArchive(html)) {
          const pt = archivePostType(html);
          return { status: 'not-applicable', archive: true, reason: pt
            ? `This URL renders the "${pt}" archive, not a single page. Use the site-wide metadata repair — it writes archive meta the right way.`
            : 'This URL renders an archive (category/date/author), which this single-page apply cannot address.' };
        }
      }
    }
    // Refuse placeholder/no-op writes: proposals whose `after` was never concretely drafted
    // ("Agent-drafted fix (review before apply)", template braces, or the un-writable
    // catch-all field 'metadata') used to be written VERBATIM to the live page.
    {
      const v = String(body.value || '');
      const placeholder = !v.trim() || PLACEHOLDER_RE.test(v) || String(body.field) === 'metadata';
      if (placeholder) return { status: 'needs-edit', reason: 'This proposal has no concrete value to write yet — edit the “after” text (or use Propose fix to draft one) before applying.' };
    }
    const r = await wp.updateMetaVerified(objectType, postId, body.field, body.value, { force: true });
    if (body.proposalId) {
      await db.updateProposal(body.proposalId, { status: r.status === 'verified' ? 'verified' : 'failed', old_value: r.old, post_id: postId, object_type: objectType, applied_at: new Date().toISOString() }).catch(() => {});
    }
    if (site) await db.logActivity({ site_id: site.id, type: 'verified', actor: 'Agent', icon: 'check', text: 'Verified write — ' + body.field, meta: 'read-back OK' }).catch(() => {});
    return r;
  },

  // Roll back a meta change to a prior value (siteId or creds).
  'POST /rollback-meta': async (body) => {
    const { creds, site } = await resolveCreds(body);
    // Same write gate as every other mutating route — a rollback is still a live write.
    if (site && site.write_armed === false && !body.force) return { status: 'blocked', reason: 'site is read-only (write not armed)' };
    const wp = clientFrom(creds);
    let objectType = body.objectType || 'posts';
    let postId = body.postId;
    if (!postId) {
      let pageUrl = body.url || (body.page && (body.page.url || body.page)) || '';
      try { pageUrl = new URL(pageUrl, creds.baseUrl).href; } catch (e) {}
      const found = pageUrl ? await wp.resolvePostByUrl(pageUrl).catch(() => null) : null;
      if (found) { postId = found.id; objectType = found.type; }
    }
    if (!postId) return { error: 'Could not resolve which page to roll back from the URL.' };
    // Never write a placeholder back to the live page. When the prior value was itself a
    // placeholder — most often the literal "(empty)" that means "there was nothing here
    // before" — restoring it verbatim would PUBLISH "(empty)" as the real title/description.
    // In that case DELETE the meta key so the field genuinely returns to empty.
    const prior = String(body.oldValue == null ? '' : body.oldValue);
    let r;
    if (!prior.trim() || PLACEHOLDER_RE.test(prior)) {
      // Clear the field to genuine empty (verify-after-write confirms ''), rather than
      // republishing "(empty)". If a plugin coerces empty, fall back to a plain write.
      r = await wp.updateMetaVerified(objectType, postId, body.field, '', { force: true })
        .catch(async () => { await wp.updateMeta(objectType, postId, { [body.field]: '' }, { force: true }).catch(() => {}); return { status: 'cleared', field: body.field, new: '' }; });
      r.clearedPlaceholder = true;
    } else {
      r = await wp.updateMetaVerified(objectType, postId, body.field, body.oldValue, { force: true });
    }
    if (body.proposalId) await db.updateProposal(body.proposalId, { status: 'rolled-back' }).catch(() => {});
    if (site) await db.logActivity({ site_id: site.id, type: 'rolled-back', actor: 'You', icon: 'undo', text: 'Rolled back — ' + body.field, meta: r.clearedPlaceholder ? 'field cleared' : 'value restored' }).catch(() => {});
    return { ...r, rolledBack: true };
  },

  // ── AEO / Answer Engine ─────────────────────────────────────────────────────
  // Generate a featured-snippet/AEO answer block for a target query. PREVIEW ONLY
  // — never auto-publishes; the frontend shows it for review before any /apply.
  // Fetches the live page text the same way /ai-seo-facts does, then asks Claude
  // (sys('aeo.answerBlock') auto-prepends the per-site geo_context niche block).
  'POST /aeo-answer-block': async (body) => {
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    const market = marketFor(site && site.semrush_db);
    const url = body.url || (body.page && body.page.url) || '';
    const query = body.query || '';
    if (!query) return { error: 'A target query is required.' };
    let title = body.title || '', currentContent = body.currentContent || '';
    // If no content was passed but we have a URL, fetch + strip the page (same as /ai-seo-facts).
    // Bound the fetch with a 15s timeout so a slow/hung origin can't burn the whole request
    // budget and 504 at the edge — on abort we just fall through to the query-only path.
    if (!currentContent && url) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' }, signal: ctrl.signal });
        const html = await res.text();
        title = title || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
        currentContent = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } catch (e) { /* fall through — answerBlock can work query-only */ }
      finally { clearTimeout(t); }
    }
    try {
      const block = await claude.answerBlock({ url, title, query, currentContent, format: body.format, market: market.country, siteId: body.siteId });
      return block;
    } catch (e) { return { error: 'Answer block generation failed: ' + e.message }; }
  },

  // Classify the best featured-snippet format (paragraph|list|table|video) for a
  // query given its SERP features. Niche-aware via sys('aeo.snippetFormat').
  'POST /aeo-snippet-format': async (body) => {
    if (!body.query) return { error: 'A query is required.' };
    try {
      return await claude.classifySnippetFormat({ query: body.query, serpFeatures: body.serpFeatures, siteId: body.siteId });
    } catch (e) { return { error: 'Snippet-format classification failed: ' + e.message }; }
  },

  // Build the JSON-LD @graph for an AEO answer block (WebPage [+Speakable], FAQPage?,
  // HowTo?) from a generated block. NOT heavy — pure/sync, no network/LLM. Derives
  // siteName/baseUrl from the site row (same as /generate-schema). Returns the graph +
  // its validation so the UI can preview before applying.
  'POST /aeo-block-schema': async (body) => {
    const block = body.block;
    if (!block || typeof block !== 'object') return { error: 'A block object is required.' };
    const url = body.url || (block && block.url) || '';
    if (!url) return { error: 'A page url is required.' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    let baseUrl;
    try { baseUrl = (site && site.url) ? site.url.replace(/\/+$/, '') : new URL(url).origin; }
    catch (e) { return { error: 'Invalid url.' }; }
    const siteName = (site && site.name) || baseUrl;
    const org = { name: siteName, url: baseUrl, logo: site && site.logo };
    const market = marketFor(site && site.semrush_db);
    const { graph, validation } = schemaForAnswerBlock(url, block, { org, baseUrl, siteName, market: market.country });
    return { graph, validation };
  },

  // Apply an AEO answer-block schema to the live page. HEAVY (writes via the mu-plugin).
  // Builds the graph with schemaForAnswerBlock, then publishes through the SAME path as
  // /apply-schema (write-armed gating, page resolution, validation, mu-plugin /schema
  // write) — no second writer. Returns what /apply-schema returns + the block validation.
  'POST /aeo-apply-block-schema': async (body) => {
    const block = body.block;
    if (!block || typeof block !== 'object') return { error: 'A block object is required.' };
    const url = body.url || (block && block.url) || '';
    if (!url) return { error: 'A page url is required.' };
    const site = body.siteId ? await db.getSite(body.siteId).catch(() => null) : null;
    let baseUrl;
    try { baseUrl = (site && site.url) ? site.url.replace(/\/+$/, '') : new URL(url).origin; }
    catch (e) { return { error: 'Invalid url.' }; }
    const siteName = (site && site.name) || baseUrl;
    const org = { name: siteName, url: baseUrl, logo: site && site.logo };
    const market = marketFor(site && site.semrush_db);
    const { graph, validation } = schemaForAnswerBlock(url, block, { org, baseUrl, siteName, market: market.country });
    // Reuse the existing apply-schema writer (single source of truth for the write).
    const applied = await routes['POST /apply-schema']({ siteId: body.siteId, creds: body.creds, url, jsonld: JSON.stringify(graph), force: body.force });
    return { ...applied, validation };
  },

  // ── Local Pack / LocalBusiness (NAP) schema ────────────────────────────────
  // Build the LocalBusiness-family @graph (WebPage + LegalService) for a site from
  // its geo_context NAP. NOT heavy — pure/sync, no network/LLM. Loads the site the
  // same way /generate-schema does and derives the market from semrush_db.
  'POST /local-schema': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'Site not found.' };
    const market = marketFor(site.semrush_db);
    const { graph, validation, nap } = localSchemaForSite({
      url: site.url,
      geoContext: site.geo_context,
      siteName: site.name,
      market: market.country,
      areaServed: body.areaServed,
    });
    return { graph, validation, nap };
  },

  // Score a page's Local Pack readiness (NAP present, LocalBusiness JSON-LD, tel:
  // link, postcode). NOT heavy — one fetch + regex parse. Fetches the page text the
  // same way /ai-seo-facts / /content-score do, and reuses drift.snapshotPage for
  // the page's JSON-LD @types (easiest source).
  'POST /local-readiness': async (body) => {
    const url = body.url || (body.page && body.page.url);
    if (!url) return { error: 'A page url is required.' };
    let html = '', text = '';
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
      html = await res.text();
      text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return { error: 'Could not fetch the page: ' + e.message }; }
    // jsonLdTypes from the drift snapshot (tolerant JSON-LD @type extractor).
    let jsonLdTypes = [];
    try { const snap = await drift.snapshotPage(url); if (snap && Array.isArray(snap.jsonLdTypes)) jsonLdTypes = snap.jsonLdTypes; } catch (e) {}
    return localReadiness({ html, jsonLdTypes, text });
  },

  // Apply the LocalBusiness (NAP) schema to the live site. HEAVY (writes via the
  // mu-plugin). Builds the graph with localSchemaForSite, then publishes through the
  // SAME path as /apply-schema (write-armed gating, page resolution, validation,
  // mu-plugin /schema write) — no second writer. Returns what /apply-schema returns +
  // the build validation + the parsed nap.
  'POST /apply-local-schema': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'Site not found.' };
    const market = marketFor(site.semrush_db);
    const { graph, validation, nap } = localSchemaForSite({
      url: site.url,
      geoContext: site.geo_context,
      siteName: site.name,
      market: market.country,
      areaServed: body.areaServed,
    });
    // Reuse the existing apply-schema writer (single source of truth for the write).
    const applied = await routes['POST /apply-schema']({ siteId: body.siteId, creds: body.creds, url: body.url || site.url, jsonld: JSON.stringify(graph), force: body.force });
    return { ...applied, validation, nap };
  },

  // Humanize text — strip AI-tell phrasing/cadence (content-quality.js). NOT heavy —
  // pure/sync, no network/LLM.
  'POST /content-humanize': async (body) => {
    if (!body.text) return { error: 'Pass text to humanize.' };
    return humanize(body.text);
  },

  // Offline content quality score + claim verification. NOT heavy — pure/sync, no
  // network/LLM. Accepts raw html or a url (fetched + stripped the existing way).
  'POST /content-score': async (body) => {
    let html = body.html || '';
    if (!html && body.url) {
      try {
        const res = await fetch(body.url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
        html = await res.text();
      } catch (e) { return { error: 'Could not fetch the page: ' + e.message }; }
    }
    if (!html) return { error: 'Pass html or a url to score.' };
    return { ...scoreContent(html), verify: verifyClaims(html) };
  },

  // GSC snippet-steal intel: pos 2–10 quick wins, question/PAA queries, and rising
  // zero-click visibility. Loads the GSC service account + property exactly like
  // /gsc-snapshot does, and mirrors its not-connected/not-selected handling.
  'POST /gsc-snippet-steal': async (body) => {
    const saStr = await db.getGscSa(body.siteId).catch(() => null);
    if (!saStr) return { error: 'Google Search Console not connected for this site.', needsConnect: true };
    const site = await db.getSite(body.siteId).catch(() => null);
    const property = body.property || (site && site.gsc_property);
    if (!property) return { error: 'No GSC property selected. Pick one after connecting.', needsProperty: true };
    const sa = JSON.parse(saStr);
    try {
      const [quickWins, questions, rising] = await Promise.all([
        gsc.quickWins(sa, property, {}),
        gsc.questionQueries(sa, property, {}),
        gsc.snippetVisibility(sa, property, {}),
      ]);
      return { property, quickWins, questions, rising };
    } catch (e) { if (e.code === 'NO_ACCESS') return { error: e.message, noAccess: true }; return { error: e.message }; }
  },

  // Validate a JSON-LD schema (object, bare @graph array, or JSON string) before
  // shipping. NOT heavy — pure/sync. Returns { ok, errors, warnings }.
  'POST /validate-schema': async (body) => {
    return validateSchema(body.schema);
  },

  // ── Drift ("git for SEO") ──────────────────────────────────────────────────
  // Snapshot a page's SEO-critical surface (title/canonical/robots/schema/word
  // count/content hash). NOT heavy — a single fetch + regex parse, no LLM/WP.
  // Returns the snapshot object (carries { error } on fetch failure).
  'POST /drift-snapshot': async (body) => {
    if (!body.url) return { error: 'A page url is required.' };
    return drift.snapshotPage(body.url);
  },

  // Diff a fresh snapshot against the stored baseline. First run for a (site,url)
  // sets the baseline; later runs return { drift:{ severity, changes } }. Passes
  // notProvisioned / baselineSet / drift straight through from the module. The
  // baseline lives in Supabase (drift_baselines) — degrades gracefully to a
  // "not provisioned" message until supabase/drift-baselines.sql is run.
  'POST /drift-check': async (body) => {
    if (!body.url) return { error: 'A page url is required.' };
    return drift.checkDrift(body.siteId || null, body.url, { updateBaseline: !!body.updateBaseline });
  },

  // ── IndexNow (instant re-crawl: Bing / Yandex / Seznam / Naver …) ───────────
  // Derive the deterministic IndexNow key for a site + the text-file the operator
  // must publish at the host root. NOT heavy. Host is derived from the site url.
  'POST /indexnow-key': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'site not found' };
    const host = indexnow.normalizeHost(site.url || site._rawUrl || '');
    if (!host) return { error: 'This site has no usable URL to derive a host from.' };
    const key = indexnow.keyFromSeed(body.seed || body.siteId || host);
    return { key, host, keyFile: indexnow.keyFileContent(key), publishAt: 'https://' + host + '/' + key + '.txt' };
  },

  // Submit changed URLs to the IndexNow network. Host is derived from the site
  // url; pass the key from /indexnow-key (and publish its key file first). Returns
  // the submit result incl. keyMissing:true when the key file isn't published.
  'POST /indexnow-submit': async (body) => {
    if (!body.siteId) return { error: 'siteId required' };
    if (!body.key) return { error: 'A key is required — call /indexnow-key first and publish its key file.' };
    const site = await db.getSite(body.siteId).catch(() => null);
    if (!site) return { error: 'site not found' };
    const host = indexnow.normalizeHost(site.url || site._rawUrl || '');
    if (!host) return { error: 'This site has no usable URL to derive a host from.' };
    return indexnow.submit(host, body.key, body.urls || []);
  },

  // ── Content Engine — the unified content-opportunity "brain" ────────────────
  // ingest every producer (keyword clusters + trending + PAA + optional AI-vis) →
  // normalize → dedupe/merge → score → persist to Supabase content_opportunities
  // → best-effort Airtable mirror. HEAVY (it calls the producers, incl. DataForSEO
  // SERP + optional Claude). Returns { count, byAction, bySource, sources, saved? }.
  // notProvisioned rides through until supabase/content-engine.sql is run.
  // Kick the full ingest in the BACKGROUND and return immediately — the pipeline
  // (DataForSEO + GSC + Claude + Perplexity + PAA) runs longer than the edge
  // sync cap, so a blocking call 504s. The UI polls /engine-run-status and
  // reloads the worklist when status === 'done'.
  'POST /engine-run': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    return engine.startRun(body.siteId, {
      db: body.db,
      includeTrending: body.includeTrending !== false,
      includePaa: body.includePaa !== false,
      includeGeo: !!body.includeGeo,
    });
  },

  // Poll the background run's status: { status:'idle'|'running'|'done'|'error', count?, byAction?, airtable?, ... }.
  'POST /engine-run-status': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    return engine.runStatus(body.siteId);
  },

  // The scored worklist for a site (ordered by score desc), filterable by status /
  // actionType. NOT heavy — a single Supabase read. Passes { notProvisioned:true }
  // straight through so the UI can prompt the operator to run the migration.
  'POST /engine-worklist': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    return engine.worklist(body.siteId, { status: body.status, actionType: body.actionType, limit: body.limit });
  },

  // Set the status of one opportunity (e.g. queued / in_progress / published).
  // NOT heavy — a single Supabase PATCH. notProvisioned rides through.
  'POST /engine-set-status': async (body) => {
    if (!body.id) return { error: 'id required' };
    if (!body.status) return { error: 'status required' };
    return engine.setStatus(body.id, body.status);
  },

  // Dismiss one opportunity (status → 'dismissed'). NOT heavy.
  'POST /engine-dismiss': async (body) => {
    if (!body.id) return { error: 'id required' };
    return engine.dismiss(body.id);
  },

  // Auto-draft the top-N SCORED opportunities into the EXISTING Article Writer
  // pipeline — the ONE n8n-watched Airtable table (cfg.table_gaps). Maps each to a
  // Title + Keyword + Content Brief row, de-dupes by Keyword, pushes, and flips the
  // drafted opportunities → 'queued'. HEAVY (Airtable read+write). Reuses the
  // existing writer flow — it does NOT generate/publish here (n8n does that).
  // → { drafted, queued, skippedDup, candidates, table } | { skipped, reason } | { notProvisioned }.
  'POST /engine-autodraft': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    return engine.autoDraft(body.siteId, { topN: body.topN, actionType: body.actionType, ids: body.ids });
  },

  // Close the loop opposite autodraft: read the n8n-watched Article Writer table
  // (cfg.table_gaps) for rows the n8n flow marked complete (Status + published URL),
  // match each back to an open opportunity by Keyword, advance 'queued'/'in_review'
  // → 'published', and capture a drift baseline for each published URL. HEAVY
  // (Airtable read + one page-snapshot per published URL).
  // → { published, baselines, completed, candidates, table } | { skipped, reason } | { notProvisioned }.
  'POST /engine-sync-published': async (body) => {
    if (!body.siteId) return { error: 'No site selected.' };
    return engine.syncPublished(body.siteId);
  },

  // ── n8n control panel ──────────────────────────────────────────────────────
  // Thin, STATELESS proxy to the n8n public API. The base URL + API key arrive in
  // each request body from the browser (localStorage) — never stored or logged
  // here. Lets the operator pick a workflow, edit each node's prompts, run it, and
  // inspect node errors. See backend-api/n8n.js.
  // Connect ONCE: validate the creds, then store the base URL + API key ENCRYPTED
  // server-side (pgcrypto in Supabase). After this the browser never sends the key
  // again — every /n8n-* call resolves it from the encrypted store. Never echoes it.
  'POST /n8n-connect': async (body) => {
    if (!body.baseUrl || !body.apiKey) return { error: 'Provide the n8n base URL and API key to connect.' };
    const probe = await n8n.listWorkflows(body.baseUrl, body.apiKey);  // reject a bad key before persisting
    if (probe && probe.error) return { error: probe.error };
    await db.setN8nConfig(body.baseUrl, body.apiKey);
    return { ok: true, connected: true, baseUrl: body.baseUrl, writerCount: probe.writerCount, total: probe.total };
  },
  // Is n8n connected server-side? Returns the base URL (safe) but NEVER the key.
  'POST /n8n-status': async () => {
    const cfg = await db.getN8nConfig().catch(() => null);
    return { connected: !!(cfg && cfg.apiKey && cfg.baseUrl), baseUrl: (cfg && cfg.baseUrl) || null };
  },
  // Remove the stored n8n credential (blank the ciphertext).
  'POST /n8n-disconnect': async () => {
    await db.clearN8nConfig().catch(() => {});
    return { ok: true, connected: false };
  },

  // ── Firecrawl (robust page reader for the chat tool) ───────────────────────
  // Store the API key ENCRYPTED in app_secrets, validated against Firecrawl first.
  // Resolved server-side by readPage(); the key is NEVER returned to a browser.
  'POST /firecrawl-connect': async (body) => {
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) return { error: 'Provide the Firecrawl API key.' };
    let ok = false, detail = '';
    try {
      const r = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', { headers: { Authorization: `Bearer ${apiKey}` } });
      ok = r.ok; if (!r.ok) detail = `Firecrawl rejected the key (HTTP ${r.status}).`;
    } catch (e) { detail = 'Could not reach Firecrawl to validate the key: ' + (e && e.message || e); }
    if (!ok) return { error: detail || 'Invalid Firecrawl key.' };
    await db.setAppSecret('firecrawl_api_key', apiKey);
    return { ok: true, connected: true };
  },
  // Is Firecrawl connected server-side? Never returns the key itself.
  'POST /firecrawl-status': async () => {
    const k = await db.getAppSecret('firecrawl_api_key').catch(() => null);
    return { connected: !!k };
  },
  'POST /firecrawl-disconnect': async () => {
    await db.setAppSecret('firecrawl_api_key', '').catch(() => {});
    return { ok: true, connected: false };
  },
  'POST /n8n-workflows': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    return n8n.listWorkflows(baseUrl, apiKey);
  },
  'POST /n8n-workflow-prompts': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id) return { error: 'workflow id required' };
    return n8n.getWorkflowPrompts(baseUrl, apiKey, body.id);
  },
  'POST /n8n-update-prompts': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id || !Array.isArray(body.edits)) return { error: 'id + edits[] required' };
    const r = await n8n.updatePrompts(baseUrl, apiKey, body.id, body.edits);
    // Record the change as an undo-history entry (before/after per path, last 10 per
    // workflow). Best-effort: history must never block or fail the save itself.
    if (r && r.ok && Array.isArray(r.captured) && r.captured.length) {
      try {
        await db.addN8nPromptHistory({ workflow_id: String(body.id), workflow_name: r.workflowName || null, edits: r.captured, source: 'dashboard' });
        await db.pruneN8nPromptHistory(String(body.id), 10);
      } catch (e) { /* best-effort */ }
    }
    return r;
  },
  // Undo history for one workflow's prompt edits (newest first, capped at 10).
  'POST /n8n-prompt-history': async (body) => {
    if (!body.id) return { error: 'workflow id required' };
    const rows = await db.listN8nPromptHistory(String(body.id), 10).catch(() => []);
    return { history: rows || [] };
  },
  // Roll a workflow's prompts back to the values BEFORE a recorded edit. The rollback
  // is itself recorded (source='rollback'), so it can be undone too.
  'POST /n8n-prompt-rollback': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id || !body.historyId) return { error: 'id + historyId required' };
    const row = await db.getN8nPromptHistoryRow(body.historyId).catch(() => null);
    if (!row || String(row.workflow_id) !== String(body.id)) return { error: 'History entry not found for this workflow.' };
    const edits = (Array.isArray(row.edits) ? row.edits : []).map((c) => ({ nodeId: c.nodeId, path: c.path, value: c.before == null ? '' : c.before }));
    if (!edits.length) return { error: 'Nothing to roll back in this entry.' };
    const r = await n8n.updatePrompts(baseUrl, apiKey, body.id, edits);
    if (r && r.ok && Array.isArray(r.captured) && r.captured.length) {
      try {
        await db.addN8nPromptHistory({ workflow_id: String(body.id), workflow_name: r.workflowName || null, edits: r.captured, source: 'rollback' });
        await db.pruneN8nPromptHistory(String(body.id), 10);
      } catch (e) { /* best-effort */ }
    }
    return (r && r.ok) ? { ok: true, restored: edits.length } : r;
  },
  'POST /n8n-run': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id) return { error: 'workflow id required' };
    return n8n.runWorkflow(baseUrl, apiKey, body.id, body.payload);
  },
  'POST /n8n-executions': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id) return { error: 'workflow id required' };
    return n8n.getExecutions(baseUrl, apiKey, body.id, { status: body.status });
  },
  // Activate / deactivate a workflow. Deliberately NOT a delete: retiring a duplicate or
  // wrong-base flow stops it answering its webhook immediately, but stays one call away
  // from being switched back on. Permanent deletion remains a manual step in n8n.
  'POST /n8n-set-active': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id) return { error: 'workflow id required' };
    if (typeof body.active !== 'boolean') return { error: 'active (boolean) required' };
    return n8n.setActive(baseUrl, apiKey, body.id, body.active);
  },
  // Read one node's RAW parameters (read-only) — inspect field-mapper nodes (Set etc.)
  // that the prompts view doesn't surface, e.g. to debug "Content Brief not fed".
  'POST /n8n-node-params': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.id) return { error: 'workflow id required' };
    return n8n.getNodeParams(baseUrl, apiKey, body.id, body.nodeName);
  },
  // What did one node actually OUTPUT during a given execution? (bounded, read-only)
  'POST /n8n-execution-data': async (body) => {
    const { baseUrl, apiKey } = await n8nCreds(body);
    if (!baseUrl || !apiKey) return { error: 'Connect n8n first (base URL + API key).' };
    if (!body.executionId) return { error: 'executionId required' };
    return n8n.getExecutionNodeData(baseUrl, apiKey, body.executionId, body.nodeName);
  },
};

// --- server ----------------------------------------------------------------
// ── Server lifecycle + load state ───────────────────────────────────────────
let INFLIGHT = 0;
let SHUTTING_DOWN = false;
// Response deadline for a single request. Set just UNDER the ~100s edge/gateway
// response cap this file is built around (see server.js:120, 2350, 3251) so the
// server returns a clean JSON 504 naming the route — and releases the heavy-limiter
// slot — a few seconds BEFORE the edge severs the socket with its own generic 504.
// The old 280s default was ~3x the edge cap, so it could never fire first and gave
// no protection. NOTE: withTimeout (infra.js) is a Promise.race — it only bounds the
// RESPONSE we send the client; it CANNOT cancel the underlying handler, so the
// Claude/DataForSEO/GSC/crawl work keeps running to completion in the background (it
// simply no longer holds a heavy slot once we've 504'd). Routes that legitimately run
// longer than this don't block on it: they kick off background work and return fast to
// be polled (e.g. /content-rewrite {start:true} → /content-rewrite-status, /engine-run
// → /engine-run-status, /jobs/run → /jobs/get), so this ceiling never truncates them.
const REQ_TIMEOUT_MS = Number(process.env.REQ_TIMEOUT_MS) || 95000; // < ~100s edge cap
// Heavy = calls an external model/API or does CPU work; routed through the heavy
// concurrency limiter + backpressure. Unknown keys simply skip it (harmless).
// Membership is kept in sync with the real route keys above — every entry must be a
// live 'METHOD /path'. (Phantom keys are harmless but hide drift; missing heavy keys
// silently lose their throttle + backpressure. Reconciled 2026-07: dropped 7 phantoms
// — /project-plan, /narrate, /scorecard, /weekly-briefing, /research, /auditPage,
// /generate-opportunities — and added the genuinely slow routes below.)
const HEAVY_ROUTES = new Set([
  'POST /content-intel', 'POST /generate-content', 'POST /generate-schema', 'POST /generate-css',
  'POST /ai-seo-facts', 'POST /internal-links', 'POST /external-links', 'POST /apply-link',
  'POST /content-decay', 'POST /content-decay-brief', 'POST /content-refresh', 'POST /content-rewrite', 'POST /content-restore', 'POST /content-apply-elementor', 'POST /content-brief',
  'POST /semrush-snapshot', 'POST /semrush-keyword-gap', 'POST /semrush-striking', 'POST /traffic-value', 'POST /apply-impact',
  'POST /media-scan', 'POST /media-optimize', 'POST /page-optimize-images', 'POST /cleanup-webp-dupes', 'POST /airtable-sync',
  'POST /aeo-answer-block', 'POST /aeo-snippet-format', 'POST /aeo-apply-block-schema',
  'POST /apply-local-schema', 'POST /engine-autodraft', 'POST /engine-sync-published',
  'POST /n8n-run',
  'POST /ux-crawl',
  'POST /fix-page-metadata', 'POST /fix-page-metadata-start', 'POST /apply-a11y-fixes', 'POST /fix-contact-tokens', 'POST /embed-video', 'POST /remove-video-embed', 'POST /strip-internal-labels', 'POST /fix-broken-embeds', 'POST /selftest-full',   // WP read+write loops over posts (selftest: many vendor probes)
  // Added: renamed/omitted routes that genuinely call Claude / DataForSEO / GSC / PSI / crawl.
  'POST /content-opportunities',            // renamed from the phantom /generate-opportunities (DataForSEO + clustering + Claude)
  'POST /audit-full',                       // full page crawl + PSI + on-page SEO read
  'POST /psi', 'POST /psi-median', 'POST /psi-detail',   // PageSpeed Insights API (external, multi-URL / N-run)
  'POST /correlation',                      // GSC snapshot join over audit history
  'POST /gsc-snippet-steal',                // 3 parallel GSC API pulls
  'POST /trending-intel',                   // Tavily/Perplexity + Claude research
  'POST /exec-narrative',                   // Claude weekly-briefing narration
  'POST /people-also-ask',                  // DataForSEO SERP-advanced PAA
  'POST /prompt-test',                      // live Claude/Perplexity prompt preview
  'POST /airtable-push-keywords',           // findOpportunities (DataForSEO + Claude) + WP fetches
  'POST /geo-track', 'POST /geo-prompts', 'POST /geo-enable',  // Claude web-search citation pass + prompt gen + llms.txt
]);

// ── Experience Monitor — UX beacon ingest (the high-volume hot path) ─────────
// Cheapest route in the file: no Claude/WP/external fetch, no heavy work, a shed
// BEFORE readBody/JSON.parse, a schema allowlist that REJECTS any PII-ish key, and
// site_id stamped on every row. Only reached when RUM_ENABLED==='true' (default off).
const UX_KEY_CACHE = new TTLCache({ max: 200, ttlMs: 5 * 60 * 1000 });  // rum_key → {siteId} | null
const UX_SITE_RATE = new TTLCache({ max: 200, ttlMs: 60 * 1000 });      // siteId → events this minute (flood breaker)
const uxLimiter = new Limiter(4, 'ux-ingest');
const UX_EVENT_TYPES = new Set(['js_error', 'unhandled_rejection', 'broken_resource', 'ajax_4xx', 'dest_404', 'broken_cta', 'form_validation', 'pageview',
  'dead_click', 'rage_click', 'console_error', 'form_abandon', 'inp_slow']);   // last 5 = Phase-2 heuristic signals
const UX_BANNED_KEYS = ['value', 'innerHTML', 'outerHTML', 'html', 'screenshot', 'text'];   // PII / replay-adjacent — reject the whole event
const UX_DETAIL_KEYS = ['message', 'source', 'lineno', 'colno', 'stackHash', 'src', 'status', 'tag', 'referrer', 'label', 'field', 'fieldType', 'validity', 'dur'];  // PII-free, scrubbed at source ('dur' = INP latency ms; 'value' is banned)
const UX_MODERATE = new Set(['broken_cta', 'dead_click', 'rage_click', 'console_error', 'form_abandon', 'inp_slow']);   // heuristic/composite → MODERATE confidence (advisory, never auto-applied)
const uxStats = { accepted: 0, droppedCap: 0, droppedRate: 0, tripped: 0 };  // surfaced on /status
let UX_BUCKET = { tokens: 200, ts: Date.now() };  // process-wide token bucket (~20/s refill)
function uxTakeToken() {
  const now = Date.now();
  const refill = Math.floor((now - UX_BUCKET.ts) / 50);
  if (refill > 0) { UX_BUCKET.tokens = Math.min(200, UX_BUCKET.tokens + refill); UX_BUCKET.ts = now; }
  if (UX_BUCKET.tokens <= 0) return false;
  UX_BUCKET.tokens--; return true;
}
async function uxResolveSite(k) {
  if (!k || typeof k !== 'string' || k.length > 64) return null;
  const cached = UX_KEY_CACHE.get(k); if (cached !== undefined) return cached;
  let site = null;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/sites?rum_key=eq.${encodeURIComponent(k)}&select=id,rum_armed&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE } });
    if (r.ok) { const rows = await r.json(); const row = rows && rows[0]; if (row && row.rum_armed) site = { siteId: row.id }; }
  } catch (e) { /* unknown key → drop */ }
  UX_KEY_CACHE.set(k, site);
  return site;
}
function uxReadCapped(req, cap = 65536) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > cap) { req.destroy(); reject(new Error('too big')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function uxRow(ev, siteId, page, ipHash, pv) {
  if (!ev || typeof ev !== 'object') return null;
  for (const bad of UX_BANNED_KEYS) if (Object.prototype.hasOwnProperty.call(ev, bad)) return null;  // PII guard (defence-in-depth; beacon already scrubs)
  const t = ev.type;                                  // beacon wire shape: { type, count, selector, +detail fields }
  if (!UX_EVENT_TYPES.has(t)) return null;
  const detail = {};
  for (const f of UX_DETAIL_KEYS) { const v = ev[f]; if (v !== undefined && v !== null) detail[f] = (typeof v === 'string') ? v.slice(0, 200) : v; }
  return {
    site_id: siteId, page: String(page || '/').slice(0, 300), event_type: t,
    selector: ev.selector ? String(ev.selector).slice(0, 300) : null, role: null,
    confidence: UX_MODERATE.has(t) ? 'moderate' : 'high',
    count: Math.min(Math.max(1, Number(ev.count) || 1), 1000),
    detail, ip_hash: ipHash, pv_id: pv ? String(pv).slice(0, 40) : null, beacon_ver: null,
  };
}
async function uxBeaconIngest(req) {
  if (Number(req.headers['content-length'] || 0) > 65536) { uxStats.droppedCap++; return; }  // shed BEFORE reading
  const raw = await uxReadCapped(req).catch(() => null);
  if (!raw) return;
  let body; try { body = JSON.parse(raw); } catch { return; }
  const site = await uxResolveSite(body && body.k);
  if (!site) return;                                                 // unknown/disarmed key — drop BEFORE spending a token (so a bad client can't starve real sites)
  if (!uxTakeToken()) { uxStats.droppedRate++; return; }             // process-wide rate cap
  // Anonymise the client IP before hashing: /24 for IPv4, /64 (first 4 hextets) for IPv6.
  let ipRaw = String((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim();
  ipRaw = ipRaw.includes(':') ? (ipRaw.split(':').slice(0, 4).join(':') + '::') : ipRaw.replace(/\.\d+$/, '.0');
  const ipHash = createHmac('sha256', process.env.SITE_SECRET_KEY || 'sentinel').update(ipRaw + ':' + new Date().toISOString().slice(0, 10)).digest('hex').slice(0, 16);
  const sr = (Number(body.sr) > 0 && Number(body.sr) <= 1) ? Number(body.sr) : null;
  const evs = Array.isArray(body.e) ? body.e.slice(0, 50) : [];
  const rows = evs.map((ev) => uxRow(ev, site.siteId, body.p, ipHash, body.pv)).filter(Boolean);
  if (sr != null) for (const r of rows) r.detail = { ...r.detail, sr };  // carry sample rate → per-type defect_rate normalisation at read
  if (!rows.length) return;
  // Per-site flood circuit-breaker: a broken deploy floods js_error at 100% sampling.
  // >2000 events/min from one site → auto-disarm it (the events we 100%-sample are
  // exactly what a flood produces). Stops accepting immediately + alerts.
  const rate = (UX_SITE_RATE.get(site.siteId) || 0) + rows.length;
  UX_SITE_RATE.set(site.siteId, rate);
  if (rate > 2000) {
    uxStats.tripped++;
    UX_KEY_CACHE.set(body.k, null);  // disarm in-cache instantly (until TTL refresh from DB)
    db.updateSite(site.siteId, { rum_armed: false }).catch(() => {});
    db.logActivity({ site_id: site.siteId, type: 'alert', actor: 'Experience Monitor', icon: 'alert', text: 'Beacon auto-disarmed — ingest flood (>2000 events/min)', meta: 'circuit-breaker' }).catch(() => {});
    return;
  }
  uxStats.accepted += rows.length;
  await uxLimiter.run(() => fetch(`${process.env.SUPABASE_URL}/rest/v1/ux_events`, { method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) }));
}

// ── Observability: a small in-memory ring of recent route errors + per-route
// success/error counts, exposed via /admin-health. So a feature breaking in the wild
// SURFACES (a Health panel) instead of being discovered by clicking a dead button.
// In-memory → resets on redeploy; a lightweight signal, not a full APM.
const ERR_RING = [];
const ROUTE_STATS = new Map();   // key -> { ok, err, lastOk, lastErr, lastErrMsg }
function recordRoute(key, ok, errMsg) {
  let s = ROUTE_STATS.get(key);
  if (!s) { s = { ok: 0, err: 0, lastOk: 0, lastErr: 0, lastErrMsg: '' }; ROUTE_STATS.set(key, s); }
  const now = TS();
  if (ok) { s.ok++; s.lastOk = now; }
  else {
    s.err++; s.lastErr = now; s.lastErrMsg = String(errMsg || '').slice(0, 240);
    ERR_RING.push({ key, ts: now, msg: s.lastErrMsg });
    if (ERR_RING.length > 120) ERR_RING.shift();
  }
}
function TS() { try { return Date.now(); } catch (e) { return 0; } }

// ── Per-IP rate limit (sliding window) on the JSON API. A public backend needs a
// floor of abuse protection; the limit is generous so real operator use never trips
// it, and it fails OPEN (any limiter error → allow).
const RL = new Map();   // ip -> number[] (timestamps)
const RL_WINDOW_MS = 60000, RL_MAX = Number(process.env.RATE_LIMIT_PER_MIN) || 600;
function rateLimited(ip) {
  try {
    const now = TS();
    let arr = RL.get(ip); if (!arr) { arr = []; RL.set(ip, arr); }
    while (arr.length && arr[0] < now - RL_WINDOW_MS) arr.shift();
    if (arr.length >= RL_MAX) return true;
    arr.push(now);
    if (RL.size > 5000) { for (const [k, v] of RL) if (!v.length || v[v.length - 1] < now - RL_WINDOW_MS) RL.delete(k); }
    return false;
  } catch (e) { return false; }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;

  // API auth — every POST (incl. /chat-stream) except the public beacon. 401 carries a
  // distinct code so the dashboard can prompt for the key once and retry.
  if (req.method === 'POST' && !AUTH_EXEMPT.has(key) && !authOk(req)) {
    return send(res, 401, { error: 'This dashboard is locked. Enter the access key to continue.', code: 'auth_required' });
  }
  // Server-enforced kill switch: blocks every mutating route regardless of which tab
  // (or API client) is calling. Toggled via POST /kill-switch.
  if (WRITE_ROUTE_RE.test(key) && await killSwitchOn()) {
    return send(res, 423, { status: 'blocked', error: 'Kill switch is engaged — all live writes are paused.', code: 'kill_switch' });
  }

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
      const credStr = JSON.stringify(creds);
      await db.setGscSa(siteId, credStr);
      // GLOBAL model: one Google account covers EVERY site. Write the fresh token
      // to all connected sites so reconnecting once refreshes them all (each keeps
      // its own gsc_property). Future new sites fall back to it automatically.
      let synced = 0;
      try { const sites = await db.listSites(); for (const s of (sites || [])) { if (s.id !== siteId && (!s.status || s.status === 'connected')) { await db.setGscSa(s.id, credStr).catch(() => {}); synced++; } } } catch (e) {}
      return closePage(true, (creds.email ? ('Connected as ' + creds.email + '. ') : '') + 'This Google account now covers all ' + (synced + 1) + ' site(s) — pick each one’s property in the dashboard.');
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
      ...corsHeaders(req),
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
          const saveRow = {
            messages: [...display, { role: 'assistant', text: r.reply, tools: r.toolsUsed || [] }],
            apiHistory: r.messages, messageCount: (display.length || 0) + 1, siteId: body.siteId,
          };
          const saved = await db.saveConversation(convoId, saveRow);
          if (!saved && body.conversationId) {
            // The supplied conversationId does not belong to this site (raced/buggy client) → do
            // NOT cross-write; start a fresh conversation for this site and persist there instead.
            title = await chatbot.generateTitle(body.text, r.reply);
            const c = await db.createConversation(body.siteId, title || (body.text || 'New chat').slice(0, 60));
            convoId = c.id;
            await db.saveConversation(convoId, saveRow);
          }
        }
      } catch (e) { /* best-effort */ }
      // Deliver the authoritative api_history WITH this response so the browser sets its
      // resume-memory synchronously — no separate load round-trip that a fast follow-up
      // message can race (that race is what made the assistant "forget" a just-built plan).
      sse('done', { reply: r.reply, toolsUsed: r.toolsUsed, conversationId: convoId, title, apiHistory: r.messages });
    } catch (e) {
      sse('error', { error: e.message });
    } finally {
      clearInterval(heartbeat);
    }
    return res.end();
  }

  // ── UX beacon ingest (Experience Monitor) — special-cased: 204 empty so
  // sendBeacon stays fire-and-forget; cheapest path; INERT unless RUM_ENABLED.
  if (key === 'POST /ux-beacon') {
    if (process.env.RUM_ENABLED === 'true') { try { await uxBeaconIngest(req); } catch (e) { /* never surface to the beacon */ } }
    res.writeHead(204); return res.end();
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
  // Rate limit the JSON API (generous; fails open). Static assets already returned above.
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (rateLimited(ip)) { res.setHeader('Retry-After', '10'); return send(res, 429, { error: 'Too many requests — slow down and retry shortly.' }); }
  // Drain mode: reject new work while shutting down so in-flight can finish.
  if (SHUTTING_DOWN) { res.setHeader('Retry-After', '3'); return send(res, 503, { error: 'Server restarting — retry shortly.' }); }
  // Backpressure: shed load when too many heavy ops are already queued.
  const heavy = HEAVY_ROUTES.has(key);
  if (heavy && limiters.heavy.pending > HEAVY_MAX_QUEUE) {
    res.setHeader('Retry-After', '5');
    return send(res, 503, { error: 'Server busy — too many heavy operations queued. Please retry shortly.' });
  }
  INFLIGHT++;
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const exec = () => withTimeout(handler(body, url), REQ_TIMEOUT_MS, 'request ' + key);
    const out = heavy ? await limiters.heavy.run(exec) : await exec();
    send(res, 200, out);
    recordRoute(key, true);
  } catch (e) {
    recordRoute(key, false, e && e.message);
    if (e && e.code === 'EBODY') send(res, 413, { error: 'Request body too large.' });
    else if (e && e.code === 'ETIMEOUT') send(res, 504, { error: e.message });
    else if (e && e.code === 'ECIRCUIT') { res.setHeader('Retry-After', '20'); send(res, 503, { error: e.message }); }
    else send(res, 400, { error: e.message });
  } finally { INFLIGHT--; }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sentinel up on :${PORT}  (console + API)  (PSI_KEY ${process.env.PSI_KEY ? 'set' : 'MISSING'})`);
  // Load editable prompt overrides from Supabase + seed the catalogue.
  prompts.init().then(() => console.log(`[prompts] ${prompts.status().count} registered, ${prompts.status().overridden} overridden`)).catch(() => {});
  // Start the analysis-only automation scheduler (auto-index, GSC health alerts,
  // content-gap keyword push). Never writes to live pages. Disable: AUTOMATION_ENABLED=false.
  try { startScheduler(); } catch (e) { console.error('[scheduler] failed to start', e && e.message); }
  // Register durable background-job handlers + start the worker pool. Long tasks
  // can be enqueued via /jobs/run and survive crashes/redeploys.
  try {
    jobs.register('content.intel', (p) => routes['POST /content-intel']({ siteId: p.siteId, siteName: p.siteName, niche: p.niche }));
    jobs.startWorker();
  } catch (e) { console.error('[jobs] failed to start', e && e.message); }
});

// --- graceful shutdown ------------------------------------------------------
// Koyeb sends SIGTERM on redeploy. Stop taking new work, let in-flight requests
// drain (so a mid-write isn't severed), then exit — with a hard cap so we never
// hang a deploy.
function gracefulShutdown(sig) {
  if (SHUTTING_DOWN) return;
  SHUTTING_DOWN = true;
  console.log(`[shutdown] ${sig} — draining ${INFLIGHT} in-flight request(s)…`);
  try { server.close(() => console.log('[shutdown] listener closed')); } catch (e) {}
  const started = Date.now();
  const poll = setInterval(() => {
    if (INFLIGHT <= 0 || Date.now() - started > 25000) {
      clearInterval(poll);
      console.log(`[shutdown] exiting (in-flight=${INFLIGHT})`);
      process.exit(0);
    }
  }, 400);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
