// ===========================================================================
// feeds.js — Content Radar's ingestion layer. Zero-dep RSS/Atom fetch + parse.
//
// Purpose in the system: Karim wants a "Google Alerts" style signal — target
// specific keywords and news outlets, and turn fresh published articles into
// content briefs. Google Alerts has no API but every alert exposes an RSS feed;
// most outlets publish RSS too; and Google News offers a free RSS search. This
// module fetches any of those, parses RSS 2.0 OR Atom (Google Alerts is Atom),
// and normalizes each entry to { title, link, summary, published, guid }.
//
// It deliberately does NOT score/store — that's the Content Engine's job. The
// radar routes hand these normalized items to content-engine as a new producer
// (source 'feeds') so they are niche-scored (geo_context) + deduped alongside
// every other opportunity, then one click drafts a brief into the Article Writer.
//
// Zero-dep, global fetch, hard AbortController timeout on every network call.
// Feed XML is well-formed enough that a tolerant regex parser beats pulling in
// an XML dependency; CDATA + the common HTML entities are handled.
// ===========================================================================
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);
const UA = 'Mozilla/5.0 (compatible; SentinelRadar/1.0; +https://sentinel)';

// --- tiny HTML/XML entity + tag helpers ------------------------------------
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
// decode entities FIRST (so &lt;b&gt; becomes a real tag) THEN strip tags, so no
// markup leaks into the reader-facing snippet.
function stripTags(s) { return decodeEntities(String(s || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
// pull the FIRST <tag>…</tag> inner content within a block
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}

// Google Alerts (and some aggregators) wrap the real URL in a redirect:
// https://www.google.com/url?...&url=https://real... OR ...?q=https://real...
function unwrapUrl(u) {
  const s = String(u || '').trim();
  const m = s.match(/[?&](?:url|q)=(https?[^&]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return s;
}

// --- parse one feed document (RSS 2.0 <item> OR Atom <entry>) ---------------
export function parseFeed(xml) {
  const doc = String(xml || '');
  const feedTitle = stripTags(tag(doc, 'title')) || '';
  const items = [];
  const isAtom = /<entry[\s>]/i.test(doc) && !/<item[\s>]/i.test(doc);
  const blocks = doc.match(isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let link = '';
    if (isAtom) {
      // <link href="..."/> — prefer rel="alternate" / no rel
      const links = [...b.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => ({ href: m[1], rel: (m[0].match(/rel=["']([^"']+)["']/i) || [])[1] || 'alternate' }));
      link = (links.find((l) => l.rel === 'alternate') || links[0] || {}).href || '';
    } else {
      link = stripTags(tag(b, 'link')) || (b.match(/<link[^>]*>([^<]+)/i) || [])[1] || '';
    }
    link = unwrapUrl(link);
    const title = stripTags(tag(b, 'title'));
    const rawSummary = tag(b, isAtom ? 'summary' : 'description') || tag(b, 'content') || tag(b, 'content:encoded');
    const summary = stripTags(rawSummary).slice(0, 600);
    const pub = stripTags(tag(b, isAtom ? 'updated' : 'pubDate') || tag(b, 'published') || tag(b, 'dc:date'));
    let published = null;
    if (pub) { const d = new Date(pub); if (!isNaN(d.getTime())) published = d.toISOString(); }
    const guid = stripTags(tag(b, isAtom ? 'id' : 'guid')) || link || title;
    if (!title && !link) continue;
    items.push({ title, link, summary, published, guid });
  }
  return { feedTitle, items };
}

// --- fetch + parse one feed URL --------------------------------------------
export async function fetchFeed(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status}`, items: [] };
    const xml = await res.text();
    if (!/<rss|<feed|<rdf:RDF/i.test(xml)) return { error: 'Not an RSS/Atom feed (no <rss>/<feed> root). For Google Alerts, choose "Deliver to: RSS feed" and copy that URL.', items: [] };
    const { feedTitle, items } = parseFeed(xml);
    return { feedTitle, items };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'feed fetch timed out' : String((e && e.message) || e).slice(0, 120), items: [] };
  } finally { clearTimeout(t); }
}

// --- build a Google News RSS search URL (free, no key) ----------------------
// A keyword watch, optionally scoped to a domain (site:) or recency (when:7d).
export function googleNewsRss(query, { region = 'GB', lang = 'en' } = {}) {
  const q = encodeURIComponent(String(query || '').trim());
  const hl = `${lang}-${region}`;
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${region}&ceid=${region}:${lang}`;
}

// Normalize any radar source definition to a fetchable URL.
// type: 'google_alert' | 'outlet_rss' → the url IS the feed; 'google_news' → build from query.
// `market` (optional, from marketFor(site.semrush_db)) scopes a google_news search
// to the site's country/language instead of hard-locking to GB/en.
export function sourceToUrl(src, market) {
  if (!src) return '';
  if (src.type === 'google_news') {
    const opts = market && market.geo ? { region: market.geo, lang: (String(market.language || 'English').slice(0, 2).toLowerCase() === 'en' ? 'en' : googleLang(market)) } : {};
    return googleNewsRss(src.query || src.label || '', opts);
  }
  return String(src.url || '').trim();
}
// Best-effort ISO-639 language code from a market's language NAME (Google News
// wants a 2-letter hl language). Defaults to English — most target markets we
// support publish English content, and en is always a safe Google News locale.
function googleLang(market) {
  const L = { english: 'en', german: 'de', french: 'fr', spanish: 'es', italian: 'it', dutch: 'nl', portuguese: 'pt', swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', polish: 'pl', turkish: 'tr', japanese: 'ja', arabic: 'ar' };
  return L[String((market && market.language) || '').toLowerCase()] || 'en';
}

// --- competitor sitemap discovery + walk -----------------------------------
// Pull every content URL from a competitor's sitemap(s) so we can mine the topics
// they cover (and out-rank them). Real sites hide their sitemap in many ways, so
// discovery is layered, cheapest + most authoritative first:
//   1. the pasted URL, when it is itself a sitemap;
//   2. the CANONICAL origin (follow the homepage redirect: bare → www, http → https;
//      a bare domain with a dead certificate is retried as www.) and EVERY `Sitemap:`
//      line of robots.txt, read on the typed AND the canonical origin (sitemaps often
//      live at /en/sitemap.xml, /google_sitemap.xml, /sitemap1.xml + /sitemap2.xml …);
//   3. the usual paths on the canonical origin — the first one that parses wins.
// Every <loc> inside a <sitemapindex> is a child sitemap whatever its extension
// (Sitecore serves /sitecore/api/sitemap/xmlsitemap?id=…); nested indexes are walked
// (depth ≤ 3, visited de-duped); gzip bodies are inflated by their magic bytes;
// <loc>/<lastmod> may be CDATA-wrapped (All in One SEO). Children are fetched at most
// 4 at a time with a per-request timeout (WAFs rate-limit bursts) and the whole walk
// is bounded by maxChildren / maxUrls / budgetMs. Each URL's <lastmod> is returned too.
//
// Bot protection is DETECTED, never evaded. A Cloudflare / Imperva / Akamai … challenge
// comes back as `blocked: true` with a plain-English reason, distinct from "no sitemap".
// No challenge solving, no headless browser, no proxies, no header tricks — only a
// normal browser User-Agent. The caller falls back to Google ranking data instead.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const XML_ACCEPT = 'application/xml, text/xml;q=0.9, */*;q=0.8';
const SITEMAP_PATHS = ['/sitemap_index.xml', '/sitemap.xml', '/wp-sitemap.xml', '/sitemap-index.xml', '/sitemap.xml.gz', '/sitemap/sitemap.xml', '/sitemaps/sitemap.xml', '/sitemap/'];
const MAX_DOC_BYTES = 64 * 1024 * 1024;   // the protocol caps one sitemap file at 50 MB uncompressed
const MAX_DECLARED = 50;                  // robots.txt Sitemap: lines walked as roots
const SITEMAP_FILE = /\.(?:xml|gz)(?:[?#]|$)/i;   // a .xml / .xml.gz / .gz URL is a sitemap file, never an article
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const docKey = (u) => String(u || '').replace(/#.*$/, '');
const cmpOrder = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// --- bot-protection detection (never circumvention) ---
// STRONG markers are specific to bot-protection interstitials, so they are safe to test
// even on a 200 page; WEAK ones only count on a 401/403/429/503 response.
const BLOCK_STRONG = /<title>\s*(?:just a moment|attention required|checking your browser|pardon our interruption|ddos-guard|access denied|one more step)|cf-chl-|cf_chl_|\/cdn-cgi\/challenge-platform|_incapsula_resource|incapsula incident|sucuri website firewall|px-captcha|captcha-delivery\.com|wordfence|has been limited by the site owner/i;
const BLOCK_WEAK = /captcha|access denied|request blocked|you have been blocked|security check|unusual traffic|automated (?:access|requests|queries)|\bbots?\b/i;
function blockVendor(headers, sample) {
  const server = String(headers.get('server') || '').toLowerCase();
  if (headers.get('cf-mitigated') || headers.get('cf-ray') || server.includes('cloudflare') || /cf-chl|cf_chl|challenge-platform|cloudflare/i.test(sample)) return 'Cloudflare';
  if (headers.get('x-iinfo') || /incapsula|imperva/i.test(sample)) return 'Imperva';
  if (server.includes('akamai') || /akamai|edgesuite\.net/i.test(sample)) return 'Akamai';
  if (server.includes('sucuri') || /sucuri/i.test(sample)) return 'Sucuri';
  if (server.includes('datadome') || /datadome|captcha-delivery/i.test(sample)) return 'DataDome';
  if (/px-captcha|perimeterx/i.test(sample)) return 'PerimeterX';
  if (/wordfence/i.test(sample)) return 'Wordfence';
  if (server.includes('hcdn') || /hostinger/i.test(sample)) return 'Hostinger';
  return '';
}
// null, or { strong, status, vendor, by, reason }. `strong` = a recognised bot-protection
// page (stop asking that host); a bare 401/403/429 is the weaker "refused".
function detectBlock(status, headers, text) {
  const sample = String(text || '').slice(0, 30000);
  const mitigated = !!headers.get('cf-mitigated');
  const xmlish = /^\s*(?:<\?xml|<urlset|<sitemapindex|<rss|<feed)/i.test(sample);
  let strong = mitigated || (!xmlish && BLOCK_STRONG.test(sample));
  if (!strong && [401, 403, 429, 503].includes(status) && BLOCK_WEAK.test(sample)) strong = true;
  if (!strong && status !== 401 && status !== 403 && status !== 429) return null;
  const vendor = blockVendor(headers, sample);
  if (!strong) {
    return status === 429
      ? { strong: false, status, vendor, by: 'rate limit (HTTP 429)', reason: 'the site is rate-limiting automated requests (HTTP 429)' }
      : { strong: false, status, vendor, by: `HTTP ${status}`, reason: `the site refuses automated access (HTTP ${status})` };
  }
  const by = vendor === 'Cloudflare'
    ? ((mitigated || /just a moment|cf-chl|cf_chl|challenge-platform/i.test(sample)) ? 'Cloudflare challenge' : 'Cloudflare block')
    : (vendor ? `${vendor} bot protection` : 'bot protection');
  return { strong: true, status, vendor, by, reason: `the site blocks automated access (${by})` };
}
function netReason(e) {
  if (e && e.name === 'AbortError') return 'the site did not respond in time';
  const cause = (e && e.cause) || {};
  const code = String(cause.code || (Array.isArray(cause.errors) && cause.errors[0] && cause.errors[0].code) || (e && e.code) || '');
  if (/CERT_HAS_EXPIRED/i.test(code)) return 'its security certificate has expired';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME|ALTNAME/i.test(code)) return 'its security certificate is not valid';
  if (/ENOTFOUND|EAI_AGAIN/i.test(code)) return 'the domain does not resolve';
  if (/ECONNREFUSED/i.test(code)) return 'the connection was refused';
  if (/ECONNRESET|UND_ERR_SOCKET|EPIPE/i.test(code)) return 'the connection was dropped';
  if (/TOO_LARGE/.test(code)) return 'the sitemap file is too large';
  return String(cause.message || (e && e.message) || e || 'request failed').slice(0, 120);
}

// --- polite fetches ---
// Read a body into a Buffer, refusing anything over MAX_DOC_BYTES (decompressed).
async function readBody(res, ctrl) {
  const tooLarge = () => { ctrl.abort(); return Object.assign(new Error('sitemap file too large'), { code: 'TOO_LARGE' }); };
  if (Number(res.headers.get('content-length') || 0) > MAX_DOC_BYTES) throw tooLarge();
  if (!res.body) return Buffer.alloc(0);
  const chunks = []; let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_DOC_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}
// One GET (hard timeout, redirects followed). Never throws. Inflates a gzip body by its
// magic bytes (servers label .xml.gz inconsistently) and flags bot challenges.
async function fetchDocOnce(url, timeoutMs, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: accept }, signal: ctrl.signal, redirect: 'follow' });
    let buf = await readBody(res, ctrl);
    for (let i = 0; i < 2 && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b; i++) buf = await gunzipAsync(buf, { maxOutputLength: MAX_DOC_BYTES });
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    const block = detectBlock(res.status, res.headers, text);
    const ra = String(res.headers.get('retry-after') || '').trim();
    const retryAfterMs = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now()) || 0) : 0;
    return { ok: res.ok && !block, status: res.status, finalUrl: res.url || url, text: res.ok && !block ? text : '', block, retryAfterMs };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, text: '', block: null, error: netReason(e) };
  } finally { clearTimeout(t); }
}
// A 429 (or a plain, non-challenge 503) is retried ONCE after the server's Retry-After,
// capped at 8s — honouring the rate limit, not working around it.
async function fetchDoc(url, { timeoutMs = 25000, accept = XML_ACCEPT, retry = true } = {}) {
  const r = await fetchDocOnce(url, timeoutMs, accept);
  if (retry && (r.status === 429 || (r.status === 503 && !(r.block && r.block.strong)))) {
    await sleep(Math.min(Math.max(r.retryAfterMs || 2000, 1000), 8000));
    return fetchDocOnce(url, timeoutMs, accept);
  }
  return r;
}
// Where does the site really live? GET the homepage following redirects and keep only
// the final URL (the body is never read). A challenged homepage still tells us that.
async function probeOrigin(origin, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(origin + '/', { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }, signal: ctrl.signal, redirect: 'follow' });
    try { if (res.body) await res.body.cancel(); } catch { /* already closed */ }
    return { finalUrl: res.url || origin + '/', status: res.status };
  } catch (e) {
    return { error: netReason(e) };
  } finally { clearTimeout(t); }
}

// --- parsing ---
// Root element of an XML doc (prolog, comments, PIs, DOCTYPE skipped): 'urlset',
// 'sitemapindex', 'rss', 'feed', 'rdf', 'html' … or '' when there is no markup at all.
function rootElement(text) {
  const head = String(text || '').slice(0, 65536)
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>/gi, '');
  const m = head.match(/<(?:[\w.-]+:)?([A-Za-z][\w.-]*)[\s>/]/);
  return m ? m[1].toLowerCase() : '';
}
const LOC_RE = /<(?:([\w.-]+):)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi;
const NON_PAGE_NS = /^(?:image|video|news|xhtml|mobile|geo|pagemap)$/i;   // <image:loc> etc. describe the page, they aren't pages
function cleanLoc(raw, base) {
  let s = decodeEntities(raw).replace(/[\r\n\t]+/g, '').trim().replace(/ /g, '%20');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) { try { s = new URL(s, base).href; } catch { return ''; } }
  return /^https?:\/\//i.test(s) ? s : '';
}
function locsIn(block, base, firstOnly) {
  const out = []; let m;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(block)) !== null) {
    if (m[1] && NON_PAGE_NS.test(m[1])) continue;
    const loc = cleanLoc(m[2], base);
    if (loc) { out.push(loc); if (firstOnly) break; }
  }
  return out;
}
function lastmodIn(block) {
  const m = block.match(/<(?:[\w.-]+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?lastmod\s*>/i)
    || block.match(/<(?:[\w.-]+:)?publication_date\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?publication_date\s*>/i);   // Google News sitemaps
  if (!m) return null;
  const d = new Date(decodeEntities(m[1]).trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// One sitemap document → { kind: 'index'|'urlset'|'feed'|'text', entries: [{ loc, lastmod }] },
// or null when it isn't a sitemap (an HTML page, soft-404, challenge page …).
export function parseSitemapDoc(text, base) {
  const s = String(text || '');
  const root = rootElement(s);
  if (root === 'sitemapindex' || root === 'urlset') {
    const isIndex = root === 'sitemapindex';
    const name = isIndex ? 'sitemap' : 'url';
    const blockRe = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`, 'gi');
    const entries = []; let m;
    while ((m = blockRe.exec(s)) !== null) {
      const loc = locsIn(m[1], base, true)[0];
      if (loc) entries.push({ loc, lastmod: lastmodIn(m[1]) });
    }
    if (!entries.length) for (const loc of locsIn(s, base, false)) entries.push({ loc, lastmod: null });   // bare <loc>s, no wrappers
    return { kind: isIndex ? 'index' : 'urlset', entries };
  }
  if (root === 'rss' || root === 'feed' || root === 'rdf') {
    const entries = parseFeed(s).items.map((it) => ({ loc: cleanLoc(it.link, base), lastmod: it.published || null })).filter((e) => e.loc);
    return { kind: 'feed', entries };
  }
  if (!root) {   // plain-text sitemap: one URL per line (allowed by sitemaps.org)
    const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const urls = lines.filter((l) => /^https?:\/\/\S+$/i.test(l));
    if (urls.length && urls.length >= lines.length * 0.8) return { kind: 'text', entries: urls.map((loc) => ({ loc, lastmod: null })) };
  }
  return null;
}

// --- discovery ---
function looksLikeSitemapUrl(u) {
  if (/\/robots\.txt$/i.test(u.pathname)) return false;
  return SITEMAP_FILE.test(u.pathname) || /sitemap/i.test(u.pathname + u.search);
}
// The canonical origin: follow the homepage redirect (bare → www, http → https). A host
// whose certificate/DNS is broken (farrer.co.uk's bare-domain certificate has expired)
// is retried as www. (or bare, when www. was typed), then over plain http.
async function resolveOrigin(given, deadline) {
  const typed = given.origin;
  const h = given.hostname;
  const port = given.port ? ':' + given.port : '';
  const alt = (/^www\./i.test(h) ? h.slice(4) : 'www.' + h) + port;
  const tries = [typed, `${given.protocol}//${alt}`];
  if (given.protocol === 'https:') tries.push(`http://${h}${port}`);
  let error = '';
  for (const o of tries) {
    if (Date.now() > deadline) break;
    const r = await probeOrigin(o);
    if (r.finalUrl) { const c = originOf(r.finalUrl) || o; return { canonical: c, reachable: true, redirected: c !== typed }; }
    error = error || r.error || '';
  }
  return { canonical: typed, reachable: false, redirected: false, error };
}
// Resolve a robots.txt Sitemap: value and repair a missing slash after the host
// ("https://www.myerson.co.uksitemap.xml" → "https://www.myerson.co.uk/sitemap.xml").
function repairSitemapUrl(value, base, hosts) {
  let u; try { u = new URL(String(value || '').trim(), base); } catch { return ''; }
  if (!/^https?:$/.test(u.protocol)) return '';
  for (const h of hosts) {
    const rest = u.hostname.startsWith(h) ? u.hostname.slice(h.length) : '';
    if (u.hostname !== h && /^[\w.-]+\.(?:xml|gz|txt)$/i.test(rest)) return `${u.protocol}//${h}/${rest}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  }
  return u.href;
}
// Every `Sitemap:` line of robots.txt on the canonical AND the typed origin.
async function robotsSitemaps(typed, canonical, redirected, deadline) {
  const out = []; const seen = new Set(); const fetched = new Set();
  let block = null, reachable = false, origin = '';
  for (const o of [...new Set([canonical, typed])]) {
    const url = o + '/robots.txt';
    if (fetched.has(url) || Date.now() > deadline) continue;
    const r = await fetchDoc(url, { timeoutMs: 12000, accept: 'text/plain, */*;q=0.8', retry: false });
    fetched.add(url); if (r.finalUrl) fetched.add(r.finalUrl);
    if (r.status) reachable = true;
    if (r.block) { if (!block || (r.block.strong && !block.strong)) block = r.block; continue; }
    if (!r.ok) continue;
    const fin = originOf(r.finalUrl);
    if (!redirected && !origin && o === typed && fin && fin !== typed) origin = fin;   // robots.txt went bare → www although the (challenged) homepage didn't
    if (rootElement(r.text) === 'html') continue;   // a soft-404 page, not a robots file
    const hosts = [...new Set([hostOf(r.finalUrl), hostOf(o), hostOf(canonical), hostOf(typed)].filter(Boolean))].sort((a, b) => b.length - a.length);
    const re = /^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim; let m;
    while ((m = re.exec(r.text)) !== null) {
      const u = repairSitemapUrl(m[1], r.finalUrl, hosts);
      if (u && !seen.has(docKey(u))) { seen.add(docKey(u)); out.push(u); }
    }
  }
  return { sitemaps: out, block, reachable, origin };
}

// --- the bounded walk ---
// Root jobs come from the discovery phases; nested indexes enqueue their children. URLs
// are re-assembled in SITEMAP ORDER at the end (every doc carries its position path),
// whatever order the concurrent fetches finished in.
function makeWalker({ maxUrls, maxChildren, maxDepth, concurrency, timeoutMs, deadline }) {
  const visited = new Set(), blockedHosts = new Set();
  const docs = [], roots = [];
  const lastmod = new Map();
  const S = { urlCount: 0, children: 0, scheduled: 0, skipped: 0, blockedDocs: 0, failed: 0, truncated: false, timedOut: false, block: null, weak: null, rootSeq: 0 };

  function schedule(queue, entries, depth, parentOrder) {
    if (depth > maxDepth) { S.skipped += entries.length; return; }
    let list = [];
    entries.forEach((e, i) => { const k = docKey(e.loc); if (visited.has(k)) return; visited.add(k); list.push({ url: e.loc, lastmod: e.lastmod || '', i }); });
    const room = Math.max(0, maxChildren - S.scheduled);
    if (list.length > room) {
      // More child sitemaps than the budget allows: read the most recently updated first.
      if (list.some((x) => x.lastmod)) list = list.slice().sort((a, b) => (a.lastmod === b.lastmod ? 0 : a.lastmod < b.lastmod ? 1 : -1));
      S.skipped += list.length - room;
      list = list.slice(0, room);
    }
    S.scheduled += list.length;
    for (const x of list) queue.push({ url: x.url, depth, order: parentOrder.concat(x.i), kind: 'child' });
  }
  function absorb(doc, job, queue) {
    if (doc.kind === 'index') { schedule(queue, doc.entries, job.depth + 1, job.order); return; }
    const urls = [], nested = [];
    for (const e of doc.entries) {
      // A .xml / .gz loc inside a <urlset> is a (non-standard) nested sitemap, never an article.
      if (SITEMAP_FILE.test(e.loc)) { if (/sitemap/i.test(e.loc)) nested.push(e); continue; }
      if (urls.length >= maxUrls) { S.truncated = true; continue; }
      urls.push(e.loc);
      if (e.lastmod) { const prev = lastmod.get(e.loc); if (!prev || e.lastmod > prev) lastmod.set(e.loc, e.lastmod); }
    }
    docs.push({ order: job.order, urls });
    S.urlCount += urls.length;
    if (nested.length) schedule(queue, nested, job.depth + 1, job.order);
  }
  async function handle(job, queue) {
    const host = hostOf(job.url);
    const r = await fetchDoc(job.url, { timeoutMs });
    if (job.kind === 'child') S.children++;
    if (r.block) {
      if (r.block.strong || r.block.status === 429) {
        if (!S.block || (r.block.strong && !S.block.strong)) S.block = r.block;
        if (r.block.strong) blockedHosts.add(host);   // stop asking a host that challenges us
        S.blockedDocs++;
      } else if (!job.guessed) {                       // a plain 403 on a guessed path just means "not here"
        S.weak = S.weak || r.block;
        if (job.kind === 'child') S.failed++;
      }
      return;
    }
    if (!r.ok) { if (job.kind === 'child') S.failed++; return; }
    const doc = parseSitemapDoc(r.text, r.finalUrl);
    if (!doc || !doc.entries.length) { if (job.kind === 'child') S.failed++; return; }
    if (job.kind === 'root') roots.push({ url: job.url, order: job.order });
    absorb(doc, job, queue);
  }
  function run(queue) {
    return new Promise((resolve) => {
      let active = 0;
      const pump = () => {
        while (active < concurrency && queue.length) {
          if (S.urlCount >= maxUrls || Date.now() > deadline) {
            if (S.urlCount >= maxUrls) S.truncated = true; else S.timedOut = true;
            S.skipped += queue.length; queue.length = 0; break;
          }
          const job = queue.shift();
          if (blockedHosts.has(hostOf(job.url))) { S.blockedDocs++; continue; }
          active++;
          handle(job, queue).catch(() => { S.failed++; }).finally(() => { active--; pump(); });
        }
        if (!queue.length && !active) resolve();
      };
      pump();
    });
  }
  return {
    S,
    found: () => roots.length > 0,
    hostBlocked: (h) => blockedHosts.has(h),
    async walk(urls, { guessed = false } = {}) {
      const queue = [];
      for (const u of urls) {
        const k = docKey(u); if (!u || visited.has(k)) continue; visited.add(k);
        queue.push({ url: u, depth: 0, order: [S.rootSeq++], kind: 'root', guessed });
      }
      if (queue.length) await run(queue);
    },
    collect() {
      docs.sort((a, b) => cmpOrder(a.order, b.order));
      roots.sort((a, b) => cmpOrder(a.order, b.order));
      const seen = new Set(), urls = [];
      let capped = false;
      outer: for (const d of docs) {
        for (const u of d.urls) {
          if (seen.has(u)) continue;
          if (urls.length >= maxUrls) { capped = true; break outer; }
          seen.add(u); urls.push(u);
        }
      }
      const lm = {};
      for (const u of urls) { const v = lastmod.get(u); if (v) lm[u] = v; }
      return { urls, lastmod: lm, sitemaps: roots.map((r) => r.url), capped };
    },
  };
}

// input: a competitor homepage/domain OR an explicit sitemap URL. Returns
//   { sitemapUrl, sitemaps[], origin, urls[], lastmod{ url: iso }, children, partial, blocked,
//     blockedBy?, warning?, reason?, error? }
// `urls` = content URLs (strings) in sitemap order, ≤ maxUrls; `lastmod` only has URLs whose
// entry carried a date. `error` + `reason` ('blocked'|'not_found'|'unreachable'|'empty'|
// 'bad_input') are set only when NO URL was found. `blocked` = bot protection stopped us
// reading all (error set) or part (`partial`, `warning`) of it; `blockedBy` names it.
export async function fetchSitemap(input, { maxUrls = 400, maxChildren = 12, concurrency = 4, timeoutMs = 25000, maxDepth = 3, budgetMs = 120000 } = {}) {
  const fail = (reason, error) => ({ error, reason, blocked: false, urls: [], lastmod: {}, sitemaps: [], children: 0, partial: false });
  const raw = String(input || '').trim();
  if (!raw) return fail('bad_input', 'no url');
  let given;
  try { given = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw.replace(/^\/+/, '')); }
  catch { return fail('bad_input', 'bad url'); }
  if (!/^https?:$/.test(given.protocol) || !given.hostname.includes('.')) return fail('bad_input', 'bad url');
  const deadline = Date.now() + Math.max(5000, Number(budgetMs) || 120000);
  const W = makeWalker({
    maxUrls: Math.max(1, Number(maxUrls) || 400), maxChildren: Math.max(0, Number(maxChildren) || 0), maxDepth: Math.max(1, Number(maxDepth) || 3),
    concurrency: Math.min(4, Math.max(1, Number(concurrency) || 4)), timeoutMs: Math.max(1000, Number(timeoutMs) || 25000), deadline,
  });
  let origin = given.origin, reachable = true, netError = '', robotsBlock = null, declared = 0;
  // 1) the pasted URL is itself a sitemap
  if (looksLikeSitemapUrl(given)) await W.walk([given.href]);
  // 2) discovery: canonical origin → robots.txt Sitemap: lines → the usual paths
  if (!W.found()) {
    const o = await resolveOrigin(given, deadline);
    origin = o.canonical; reachable = o.reachable; netError = o.error || '';
    const rb = await robotsSitemaps(given.origin, origin, o.redirected, deadline);
    if (rb.origin) origin = rb.origin;
    if (rb.reachable) reachable = true;
    robotsBlock = rb.block;
    declared = rb.sitemaps.length;
    if (declared) await W.walk(rb.sitemaps.slice(0, MAX_DECLARED));
    if (!W.found() && reachable) {
      const host = hostOf(origin);
      for (const p of SITEMAP_PATHS) {
        if (Date.now() > deadline) { W.S.timedOut = true; break; }
        if (W.found() || W.hostBlocked(host)) break;
        await W.walk([origin + p], { guessed: true });
        if (!W.found()) await sleep(250);   // sequential + spaced: we are guessing
      }
    }
  }
  const S = W.S;
  const c = W.collect();
  const out = {
    sitemapUrl: c.sitemaps[0], sitemaps: c.sitemaps, origin, urls: c.urls, lastmod: c.lastmod, children: S.children,
    // partial = we read SOME of the sitemap but not all of it (caps, time, blocked/failed files)
    partial: c.urls.length > 0 && !!(S.skipped || S.blockedDocs || S.failed || S.truncated || c.capped), blocked: false,
  };
  if (c.urls.length) {
    if (S.blockedDocs && S.block) Object.assign(out, { blocked: true, blockedBy: S.block.by, warning: `some sitemap files could not be read — ${S.block.reason}` });
    return out;
  }
  // Nothing at all — say why, in plain words.
  const blk = S.block || (robotsBlock && robotsBlock.strong ? robotsBlock : null) || S.weak || robotsBlock;
  if (blk) return Object.assign(out, { blocked: true, blockedBy: blk.by, reason: 'blocked', error: blk.reason });
  if (W.found()) return Object.assign(out, { reason: 'empty', error: S.failed ? 'the sitemap was found but its files could not be read' : 'the sitemap lists no pages' });
  if (!reachable) return Object.assign(out, { reason: 'unreachable', error: `couldn't reach the site (${netError || 'no response'})` });
  if (S.timedOut) return Object.assign(out, { reason: 'unreachable', error: 'the site took too long to respond' });
  return Object.assign(out, {
    reason: 'not_found',
    error: declared
      ? `no sitemap found (robots.txt lists ${declared} sitemap${declared === 1 ? '' : 's'} but ${declared === 1 ? 'it does' : 'they do'} not load; also checked ${SITEMAP_PATHS.length} usual places such as /sitemap.xml)`
      : `no sitemap found (checked robots.txt and ${SITEMAP_PATHS.length} usual places such as /sitemap.xml and /sitemap_index.xml)`,
  });
}

export default { parseFeed, fetchFeed, googleNewsRss, sourceToUrl, stripTags, unwrapUrl, fetchSitemap, parseSitemapDoc };
