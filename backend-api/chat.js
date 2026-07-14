// ===========================================================================
// Agentic AI assistant — site-aware, with LIVE tools into Supabase + the engine.
// It KNOWS which site it's working on and can fetch that site's real data:
// audits, DataForSEO keywords, content-intel, GEO citation results, sitemap, and
// any URL. No more "please share your sitemap" — it just looks it up.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import { db, credsForSite } from './supabase.js';
import { WordPressClient } from '../src/wp/client.js';
import * as semrush from './dataforseo.js';  // DataForSEO behind the legacy SEMrush interface
import * as claudeMod from './claude.js';
import * as gsc from './gsc.js';
import { detectGscDaily } from './anomaly.js';
import * as tv from './traffic-value.js';
import { prioritizeFindings } from './prioritization.js';
import { suggestForSite as suggestInternalLinks } from './internal-links.js';
import { findOpportunities } from './content-opportunities.js';
import * as airtable from './airtable.js';
import { P } from './prompts.js';
import { discoverUrls } from '../src/lib/crawler.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const SB = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE;

function key() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  return k;
}

// Resilient Anthropic call: bounded by a timeout (so a stuck upstream can't hang
// the request until a proxy kills it → "Failed to fetch") and retried on the
// transient statuses Anthropic returns under load (429 rate-limit, 529 overloaded,
// 5xx). For stream:true we only guard the connection (headers); the caller then
// reads the body. Returns the raw Response.
async function anthropicFetch(payload, { stream = false, timeoutMs = 90000, retries = 2 } = {}) {
  const TRANSIENT = new Set([429, 500, 502, 503, 529]);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(stream ? { ...payload, stream: true } : payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (TRANSIENT.has(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < retries) { await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt))); continue; }
      throw new Error(e.name === 'AbortError' ? `Claude request timed out after ${Math.round(timeoutMs / 1000)}s — please retry` : e.message);
    }
  }
  throw lastErr || new Error('Claude request failed');
}

async function sb(path) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SRV, Authorization: 'Bearer ' + SRV } });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Bounded page fetch. Node's undici fetch has NO total-request timeout (its
// header/body idle timeouts default to ~300s), so a slow/hanging origin on a
// model-supplied URL would otherwise hang the whole chat turn (and blow the edge
// cap). AbortController caps wall-clock (matching the Anthropic path's pattern);
// html is capped so a huge body can't balloon memory before the regex strip.
async function fetchHtmlBounded(url, { timeoutMs = 15000, maxChars = 1_500_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0 (assistant)' }, redirect: 'follow', signal: ctrl.signal });
    let html = await res.text();
    if (html.length > maxChars) html = html.slice(0, maxChars);
    return { ok: res.ok, status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPageText(url) {
  let html;
  try { ({ html } = await fetchHtmlBounded(url)); }
  catch (e) { return { title: '', text: '', url, error: e.name === 'AbortError' ? 'timed out after 15s' : e.message }; }
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: title.trim(), text: text.slice(0, 6000), url };
}

// ── Tool definitions exposed to Claude ─────────────────────────────────────
const TOOLS = [
  { name: 'get_site_overview', description: "Get the active site's profile: name, URL, stack (theme/builder/SEO plugin), scale (posts/pages/media), latest Lighthouse scores, and write-mode. Call this FIRST when you need to know about the site you're working on.", input_schema: { type: 'object', properties: {} } },
  { name: 'list_pages', description: "List the active site's actual published pages/posts (titles + URLs) from WordPress. Use instead of asking the user for their sitemap.", input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['pages', 'posts'], description: 'pages or posts' }, limit: { type: 'number' } }, required: [] } },
  { name: 'get_semrush_keywords', description: "Get the active site's top organic keywords from DataForSEO (keyword, position, search volume, URL).", input_schema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'get_striking_distance', description: "Get 'striking distance' keywords — the site's keywords ranking in positions 11-20 (page 2), sorted by search volume. These are the fastest wins to push onto page 1. Use this when asked which keywords are CLOSE to page 1, almost ranking, or quick wins.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_keyword_gaps', description: "Get keyword gaps — keywords the site's competitors rank for that it doesn't. Uses the site's saved competitors automatically. Returns high-value content opportunities.", input_schema: { type: 'object', properties: { competitor: { type: 'string', description: 'optional specific competitor domain' } } } },
  { name: 'get_content_intel', description: "Get Claude's content-intelligence analysis of the site: topic clusters, content gaps, and article suggestions (if previously run). Returns the most recent saved analysis.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_geo_visibility', description: "Get the site's AI-citation visibility (GEO): share-of-voice — how often AI assistants cite this site vs competitors, from the latest scan.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_latest_audit', description: "Get the site's latest SEO audit: Lighthouse scores + prioritized findings.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_traffic_anomalies', description: "Detect statistically significant anomalies (robust z ≥ 3.5) in the site's Google Search Console daily clicks and average position over the last 90 days. Use when asked about sudden traffic drops, ranking slips, whether a Google update hit the site, or 'is anything wrong'. Anchored on clicks, not impressions.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_content_opportunities', description: "Find what content to create next: keyword clusters built from the site's rankings (GSC), competitor keyword gaps, and trending demand (DataForSEO), each gap-checked against the sitemap (clusters with no existing page = content gap) and scored. Use when asked what to write, content gaps, keyword clusters, a content plan/calendar, or what's trending in the niche.", input_schema: { type: 'object', properties: {} } },
  { name: 'suggest_internal_links', description: "Propose contextual internal links across the site's real pages (anchor text + target URL, targets constrained to actual published pages — no invented URLs). Use when asked about internal linking, link building between pages, or improving site structure.", input_schema: { type: 'object', properties: { targetUrl: { type: 'string', description: 'optional: analyze one specific page' } } } },
  { name: 'extract_citable_facts', description: "Extract the citable facts + FAQ from a page to improve LLM/AI-search citation (GEO), and produce a ready FAQPage schema. Use when asked how to make a page more citable by AI assistants, or for FAQ/fact-structure suggestions.", input_schema: { type: 'object', properties: { url: { type: 'string', description: 'the page URL to analyze' } }, required: ['url'] } },
  { name: 'get_prioritized_worklist', description: "Get the site's audit findings ranked by RICE score ((Reach × Impact × Confidence) ÷ Effort), weighted by real GSC clicks-per-page when connected, with impact×effort quadrants (Quick win / Major project / Fill-in / Deprioritize). Use when asked 'what should I fix first', 'what's the priority', or for a worklist/roadmap.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_traffic_value', description: "Model the £/$ value of the site's organic rankings: estimated monthly clicks (volume × CTR-by-position) × CPC, per keyword and total, plus value-at-risk on page-2 keywords and the £ uplift of pushing them to page 1. Use for ROI/business-value questions ('what's our organic traffic worth', 'what's the biggest money opportunity'). CTR curve is calibrated from the site's own Search Console data when available.", input_schema: { type: 'object', properties: {} } },
  { name: 'fetch_url', description: 'Fetch any web page and return its title + main text (e.g. a competitor or a reference article the user links).', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  // ── ACTION (write) tools — perform REAL changes on the live site when the user asks ──
  { name: 'push_keywords_to_airtable', description: "ACTION: push keywords into the site's configured Airtable keyword column — this feeds the n8n article writer and creates real rows. Use ONLY when the user explicitly asks to push/add keywords or topics to Airtable (or 'send these to the writer'). Pass `keywords` to push specific ones; omit to auto-derive the site's content-gap keywords. De-dupes against existing rows.", input_schema: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' }, description: 'optional explicit keywords; omit to auto-derive content gaps' } } } },
  { name: 'push_article_brief', description: "ACTION: create a FULL article brief as a row in the site's Article Writer table (the n8n-watched table) — Title + Keyword + the whole content plan in the Content Brief column, so the writer builds the article from the plan, not a bare keyword. Use when the user wants to turn a content plan (e.g. one you built from a link they pasted) into a real article. Pass `title`, `keyword`, and `brief` (the full plan as markdown/text: angle, outline, sections, FAQs, target length); optional `description` (meta) and `goal` (one-line angle). De-dupes by Title (re-pushing the same title updates the brief). Set `startWriting:true` ONLY when the user explicitly says to write/publish it now — that sets Status='Write Article' and n8n generates + publishes a LIVE article to WordPress (costs API credits, writes live); it requires the site to be write-armed. Default leaves Status blank so the user flips it themselves.", input_schema: { type: 'object', properties: { title: { type: 'string', description: 'the article title' }, keyword: { type: 'string', description: 'the primary target keyword' }, brief: { type: 'string', description: 'the full content plan / brief as markdown or text (angle, outline, sections, FAQs, target length)' }, description: { type: 'string', description: 'optional meta description / summary' }, goal: { type: 'string', description: 'optional one-line goal / angle of the article' }, startWriting: { type: 'boolean', description: "set true ONLY if the user explicitly asked to write/publish now — triggers n8n to generate + publish live to WordPress" } }, required: ['title', 'keyword', 'brief'] } },
  { name: 'apply_page_meta', description: "ACTION: write an SEO meta field to a LIVE page/post and verify it stuck (read-back). Use when the user approves a title / meta-description / canonical change and asks you to push/apply/make it live. `url` = the page to change; `field` = title | meta_description | canonical; `value` = the new text. The site must be write-armed. This is a real, reversible change.", input_schema: { type: 'object', properties: { url: { type: 'string', description: 'the live page URL to update' }, field: { type: 'string', enum: ['title', 'meta_description', 'canonical'], description: 'which meta field' }, value: { type: 'string', description: 'the new value to write' } }, required: ['url', 'field', 'value'] } },
  { name: 'apply_schema_to_page', description: "ACTION: inject JSON-LD structured data (e.g. a FAQPage / Article / Organization schema) into a LIVE page via the seo-agent-optimize plugin. Use after extract_citable_facts produces a FAQPage, or when the user asks to add/push schema to a page. `url` = the page; `jsonld` = the JSON-LD object or string. The site must be write-armed.", input_schema: { type: 'object', properties: { url: { type: 'string', description: 'the live page URL' }, jsonld: { type: 'string', description: 'the JSON-LD as a string (or object)' } }, required: ['url', 'jsonld'] } },
  { name: 'apply_site_css', description: "ACTION: apply site-wide custom CSS to the LIVE site via the seo-agent-optimize plugin (e.g. an accessibility/contrast fix). Use only when the user explicitly approves a CSS change. The site must be write-armed.", input_schema: { type: 'object', properties: { css: { type: 'string', description: 'the CSS to inject site-wide' } }, required: ['css'] } },
];

// Resolve a write-capable WP client for a site, enforcing the write-armed gate.
// Returns { wp, site } or a string error message (so tools can return it verbatim).
async function wpForSite(siteId) {
  let creds;
  try { creds = await credsForSite(siteId); }
  catch (e) { return 'This site has no stored WordPress credentials — connect it on the Sites screen first.'; }
  if (creds.site && creds.site.write_armed === false) {
    return 'This site is READ-ONLY (write not armed). Tell the user to arm writes for "' + (creds.site.name || 'this site') + '" on the Admin/Sites screen before I can push changes to the live site.';
  }
  const wp = new WordPressClient({ baseUrl: creds.baseUrl, username: creds.username, appPassword: creds.appPassword });
  return { wp, site: creds.site };
}
async function resolvePostId(wp, url) {
  const slug = decodeURIComponent((String(url || '').replace(/\/$/, '').split('/').pop() || '')).toLowerCase();
  if (!slug) return null;
  for (const type of ['pages', 'posts']) {
    const rows = await wp.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id`).catch(() => []);
    if (Array.isArray(rows) && rows[0]) return { postId: rows[0].id, objectType: type };
  }
  return null;
}
const META_FIELD_MAP = { title: 'rank_math_title', meta_description: 'rank_math_description', canonical: 'rank_math_canonical_url' };

// Execute a tool call for a given siteId. Returns a string result.
async function runTool(name, input, siteId) {
  try {
    if (!siteId && name !== 'fetch_url') return 'No site is selected. Ask the user to pick an account first.';
    if (name === 'fetch_url') { const p = await fetchPageText(input.url); if (p.error) return `Could not fetch ${input.url} — ${p.error}. Proceed without it or ask the user to paste the content.`; return `Title: ${p.title}\nURL: ${p.url}\n\n${p.text}`; }

    const site = await db.getSite(siteId);
    if (!site) return 'Site not found.';
    const domain = (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (name === 'get_site_overview') {
      return JSON.stringify({
        name: site.name, url: site.url, role: site.role, write_armed: site.write_armed,
        stack: site.stack, scale: site.scale, scores: site.scores,
        competitors: site.competitors || [], semrush_db: site.semrush_db || 'uk',
      });
    }
    if (name === 'list_pages') {
      const { baseUrl, username, appPassword } = await credsForSite(siteId);
      const wp = new WordPressClient({ baseUrl, username, appPassword });
      const rows = await wp.list(input.type === 'posts' ? 'posts' : 'pages', { perPage: Math.min(input.limit || 50, 100), fields: 'title,link' });
      return JSON.stringify(rows.slice(0, input.limit || 50).map((r) => ({ title: (r.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim(), url: r.link })));
    }
    if (name === 'get_semrush_keywords') {
      if (!semrush.hasKey()) return 'DataForSEO not configured.';
      try {
        const kw = await semrush.organicKeywords(domain, { db: site.semrush_db || 'uk', limit: Math.min(input.limit || 30, 30) });
        return JSON.stringify(kw.map((k) => ({ keyword: k.keyword, position: k.position, volume: k.volume, url: k.url })));
      } catch (e) {
        if (e.code === 'NO_UNITS') { const u = await semrush.apiUnits(); return `DataForSEO API units are exhausted (${u || 0} remaining). Tell the user their DataForSEO quota is used up and they need to top up units or wait for the monthly reset — do NOT invent workarounds.`; }
        throw e;
      }
    }
    if (name === 'get_striking_distance') {
      if (!semrush.hasKey()) return 'DataForSEO not configured.';
      try {
        const r = await semrush.strikingDistance(domain, { db: site.semrush_db || 'uk', limit: 100 });
        if (!r.count) return `No page-2 (positions 11-20) keywords found in the top ${r.scanned} scanned. (${r.unitsRemaining} DataForSEO units left.)`;
        return JSON.stringify({ unitsRemaining: r.unitsRemaining, count: r.count, keywords: r.keywords.slice(0, 30) });
      } catch (e) {
        if (e.code === 'NO_UNITS') { const u = await semrush.apiUnits(); return `DataForSEO API units are exhausted (${u || 0} remaining). State this plainly to the user — they must top up DataForSEO units. Do NOT suggest manual workarounds as if the data were unavailable for another reason.`; }
        throw e;
      }
    }
    if (name === 'get_keyword_gaps') {
      if (!semrush.hasKey()) return 'DataForSEO not configured.';
      let comps = input.competitor ? [input.competitor] : (Array.isArray(site.competitors) ? site.competitors : []);
      if (!comps.length) return 'No competitors set for this site. Ask the user to add competitors (Settings/DataForSEO tab) or name one.';
      const units = await semrush.apiUnits();
      if (units != null && units < 25) return `DataForSEO API units are nearly/fully exhausted (${units} left) — keyword-gap analysis needs more. Tell the user to top up DataForSEO units. Do NOT fabricate alternatives.`;
      const map = new Map(); let unitsErr = false;
      for (const c of comps.slice(0, 2)) {
        try {
          const r = await semrush.keywordGap(domain, c.replace(/^https?:\/\//, ''), { db: site.semrush_db || 'uk', limit: 40, negatives: site.negative_keywords || [], extraBrands: comps });
          for (const g of r.gaps) { const k = g.keyword.toLowerCase(); if (!map.has(k) || map.get(k).volume < g.volume) map.set(k, g); }
        } catch (e) { if (e.code === 'NO_UNITS') { unitsErr = true; break; } }
      }
      if (unitsErr && map.size === 0) return `DataForSEO API units exhausted. Tell the user plainly; do NOT invent workarounds.`;
      const gaps = [...map.values()].sort((a, b) => b.volume - a.volume).slice(0, 40);
      return JSON.stringify({ competitors: comps, gaps: gaps.map((g) => ({ keyword: g.keyword, volume: g.volume, competitorPos: g.competitorPos })) });
    }
    if (name === 'get_content_intel') {
      // content-intel isn't persisted per-run; recompute a fresh lightweight one from titles
      const { baseUrl, username, appPassword } = await credsForSite(siteId);
      const wp = new WordPressClient({ baseUrl, username, appPassword });
      const posts = await wp.list('posts', { perPage: 100, fields: 'title' }).catch(() => []);
      const titles = posts.map((p) => (p.title?.rendered || '').replace(/&[a-z]+;/g, ' ').trim()).filter(Boolean);
      const stride = Math.max(1, Math.floor(titles.length / 80));
      const sample = titles.filter((_, i) => i % stride === 0).slice(0, 80);
      const intel = await claudeMod.contentIntelligence({ siteName: site.name, niche: site.stack?.type, titles: sample, siteId });
      return JSON.stringify({ clusters: intel.clusters, gaps: intel.gaps, suggestions: intel.suggestions });
    }
    if (name === 'get_geo_visibility') {
      const runs = await sb(`geo_runs?site_id=eq.${siteId}&select=share_of_voice,prompts_cited,prompts_total,competitors,created_at&order=created_at.desc&limit=1`);
      if (!runs.length) return 'No GEO scan yet. Suggest running the AI Visibility scan.';
      return JSON.stringify(runs[0]);
    }
    if (name === 'get_latest_audit') {
      const audits = await sb(`audits?site_id=eq.${siteId}&select=scores,findings,created_at&order=created_at.desc&limit=1`);
      if (!audits.length) return 'No audit yet. Suggest running an audit.';
      const a = audits[0];
      return JSON.stringify({ scores: a.scores, findings: (a.findings || []).slice(0, 15) });
    }
    if (name === 'get_traffic_anomalies') {
      const saStr = await db.getGscSa(siteId).catch(() => null);
      if (!saStr) return 'Google Search Console is not connected for this site — anomaly detection needs real click data. Suggest connecting GSC in the Search Console screen.';
      const property = site.gsc_property;
      if (!property) return 'GSC is connected but no property is selected. Ask the user to pick a property in the Search Console screen.';
      let snap;
      try { snap = await gsc.snapshot(JSON.parse(saStr), property, { days: 90 }); }
      catch (e) { return 'Could not pull GSC data: ' + e.message; }
      const r = detectGscDaily(snap.daily || []);
      if (!r.events.length) return 'No anomalies in the last 90 days — clicks and average position are within normal variation.';
      return JSON.stringify({ anomalyCount: r.events.length, events: r.events.slice(0, 12) });
    }
    if (name === 'get_content_opportunities') {
      const r = await findOpportunities(siteId, { maxKeywords: 140 });
      if (r.error) return r.error;
      return JSON.stringify({
        clusterCount: r.clusterCount, gapCount: r.gapCount, trendingCount: r.trendingCount, sources: r.sources,
        clusters: (r.clusters || []).slice(0, 14).map((c) => ({ title: c.suggestedTitle, intent: c.intent, format: c.format, totalVolume: c.totalVolume, keywords: c.keywordCount, gap: c.isGap, trending: c.trending, trend: c.avgTrend, fromCompetitor: c.fromCompetitor, score: c.score })),
      });
    }
    if (name === 'suggest_internal_links') {
      const r = await suggestInternalLinks(siteId, { maxSources: 6, targetUrl: input.targetUrl || null });
      if (r.error) return r.error;
      if (!r.count) return 'No strong internal-link opportunities found across the analyzed pages.';
      return JSON.stringify({ analyzed: r.analyzed, count: r.count, suggestions: r.suggestions.slice(0, 20) });
    }
    if (name === 'extract_citable_facts') {
      let fetched;
      try { fetched = await fetchHtmlBounded(input.url); }
      catch (e) { return `Could not fetch that page — ${e.name === 'AbortError' ? 'timed out after 15s' : e.message}.`; }
      const html = fetched.html;
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const facts = await claudeMod.extractCitableFacts({ url: input.url, title, text, niche: site.stack?.type, siteId });
      return JSON.stringify(facts);
    }
    if (name === 'get_prioritized_worklist') {
      const audits = await sb(`audits?site_id=eq.${siteId}&select=findings,created_at&order=created_at.desc&limit=1`);
      const findings = (audits.length && audits[0].findings) || [];
      if (!findings.length) return 'No audit findings yet — suggest running an audit first.';
      // Weight by real per-page clicks if GSC is connected.
      let trafficByPage = null;
      try {
        const saStr = await db.getGscSa(siteId).catch(() => null);
        if (saStr && site.gsc_property) {
          const snap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 });
          trafficByPage = {};
          for (const p of (snap.topPages || [])) { let path = p.page; try { path = new URL(p.page).pathname; } catch (e) {} trafficByPage[path] = (trafficByPage[path] || 0) + (p.clicks || 0); }
        }
      } catch (e) {}
      const ranked = prioritizeFindings(findings, { trafficByPage });
      const quadrants = ranked.reduce((m, it) => { m[it.quadrant] = (m[it.quadrant] || 0) + 1; return m; }, {});
      return JSON.stringify({ usedRealTraffic: !!trafficByPage, quadrants, top: ranked.slice(0, 12).map((r) => ({ title: r.title, page: r.page, priority: r.priority, quadrant: r.quadrant, impact: r.impact, effort: r.effort })) });
    }
    if (name === 'get_traffic_value') {
      // Reuse the most recent stored DataForSEO snapshot (no fresh units spent).
      const snaps = await sb(`semrush_snapshots?site_id=eq.${siteId}&kind=eq.snapshot&select=payload,created_at&order=created_at.desc&limit=1`).catch(() => []);
      const keywords = snaps.length && snaps[0].payload && snaps[0].payload.topKeywords;
      if (!keywords || !keywords.length) return 'No DataForSEO snapshot stored yet for this site — ask the user to load the DataForSEO tab first so we have keyword volume/position/CPC to value.';
      // Calibrate CTR from GSC if connected (free, per-site).
      let curve = tv.DEFAULT_CTR, curveSource = 'default';
      try {
        const saStr = await db.getGscSa(siteId).catch(() => null);
        if (saStr && site.gsc_property) {
          const gsnap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 });
          const cal = tv.calibrateCurve(gsnap.topQueries || [], { minImpr: 50 }); curve = cal.curve; curveSource = cal.source;
        }
      } catch (e) {}
      const currency = (site.semrush_db === 'us' ? 'USD' : 'GBP');
      const valued = tv.valueKeywords(keywords, { curve });
      const summary = tv.summarize(valued, { currency });
      const striking = valued.filter((k) => k.position >= 10.5 && k.position <= 20.5)
        .map((k) => ({ keyword: k.keyword, position: k.position, gain: tv.upliftValue(k, { curve, targetPos: 3 }) }))
        .sort((a, b) => b.gain.gainValue - a.gain.gainValue).slice(0, 8);
      return JSON.stringify({ curveSource, summary, topPage1Uplift: striking });
    }
    if (name === 'push_keywords_to_airtable') {
      const pat = await db.getAirtablePat(siteId).catch(() => null);
      if (!pat) return 'Airtable is not connected. Tell the user to connect it on the Airtable Sync screen first.';
      const cfg = await db.getAirtableConfig(siteId).catch(() => null);
      if (!cfg || !cfg.base_id || !cfg.table_gaps) return 'The Airtable base / table / keyword column is not configured for this site yet. Tell the user to set it on the Airtable Sync screen.';
      let keywords = Array.isArray(input.keywords) && input.keywords.length ? input.keywords : null;
      if (!keywords) {
        const r = await findOpportunities(siteId, { maxKeywords: 160 });
        if (r.error) return r.error;
        keywords = (r.clusters || []).filter((c) => c.isGap).map((c) => c.primaryKeyword).filter(Boolean);
      }
      if (!keywords.length) return 'No content-gap keywords found to push.';
      const res = await airtable.pushKeywords(pat, cfg.base_id, cfg.table_gaps, cfg.table_content || 'Keyword', keywords);
      await db.logAirtableSync({ site_id: siteId, kind: 'keywords', records_pushed: res.pushed, status: 'ok' }).catch(() => {});
      await db.upsertAirtableConfig(siteId, { last_sync: new Date().toISOString() }).catch(() => {});
      return JSON.stringify({ done: true, pushed: res.pushed, skippedAlreadyThere: res.skipped, candidates: keywords.length });
    }
    if (name === 'push_article_brief') {
      const pat = await db.getAirtablePat(siteId).catch(() => null);
      if (!pat) return 'Airtable is not connected. Tell the user to connect it on the Airtable screen first.';
      const cfg = await db.getAirtableConfig(siteId).catch(() => null);
      if (!cfg || !cfg.base_id || !cfg.table_gaps) return 'The Airtable base / Article Writer table is not configured for this site yet. Tell the user to set it on the Airtable screen.';
      const base = cfg.base_id;
      const title = String(input.title || '').trim();
      const keyword = String(input.keyword || '').trim();
      const brief = String(input.brief || '').trim();
      if (!title || !keyword) return 'I need at least a title and a keyword to create the brief.';
      // Resolve the Article Writer table (stored as table_gaps) + ensure the Content Brief column exists.
      let tables = [];
      try { tables = await airtable.listTables(pat, base); } catch (e) { return 'Could not read the Airtable base: ' + e.message; }
      const tbl = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
      if (!tbl) return 'The configured Article Writer table no longer exists in this base. Ask the user to re-pick it on the Airtable screen.';
      const names = new Set((tbl.fields || []).map((f) => f.name));
      let briefField = 'Content Brief';
      if (!names.has('Content Brief')) { try { briefField = await airtable.ensureField(pat, base, tbl.id, 'Content Brief', 'multilineText'); names.add(briefField); } catch (e) { briefField = null; } }
      // Build the content row (Status left OUT — set separately below only if writing now),
      // field-set-filtered so a differing per-site schema can never 422.
      const row = { Title: title, Keyword: keyword, 'Primary Keyword': keyword, Category: 'Blog' };
      if (input.goal) row['Goal of Article'] = String(input.goal);
      if (input.description) row.Description = String(input.description);
      if (brief) { if (briefField && briefField !== 'Description') row[briefField] = brief; else row.Description = (row.Description ? row.Description + '\n\n' : '') + brief; }
      for (const k of Object.keys(row)) if (!names.has(k)) delete row[k];
      // De-dupe by Title (case-insensitive) → upsert so re-pushing updates the brief.
      let existingId = null;
      try {
        let offset;
        do {
          const page = await airtable.listRecords(pat, base, tbl.id, { pageSize: 100, offset, fields: ['Title'] });
          for (const rec of (page.records || [])) { if (String((rec.fields || {}).Title || '').trim().toLowerCase() === title.toLowerCase()) { existingId = rec.id; break; } }
          offset = existingId ? null : page.offset;
        } while (offset);
      } catch (e) { /* read failed → treat as new */ }
      const action = existingId ? 'updated' : 'created';
      let recId = existingId;
      try {
        if (recId) await airtable.updateRecord(pat, base, tbl.id, recId, row);
        else { const r = await airtable.createRecord(pat, base, tbl.id, row); recId = r && r.id; }
      } catch (e) { return 'Could not write the brief to Airtable: ' + e.message; }
      // Optionally start the writer — a deliberate, write-armed-gated trigger. We set
      // Status via a SEPARATE update (a field CHANGE) so the n8n automation reliably fires.
      let triggered = false, blocked = null;
      if (input.startWriting) {
        if (site.write_armed === false) blocked = `"${site.name || 'this site'}" is READ-ONLY (write not armed) — n8n would publish a LIVE article. Ask the user to arm writes (top bar / Sites screen), then set Status to "Write Article".`;
        else if (!names.has('Status')) blocked = 'the Article Writer table has no Status field, so n8n can’t be triggered automatically — ask the user to flip the trigger manually.';
        else { try { await airtable.updateRecord(pat, base, tbl.id, recId, { Status: 'Write Article' }); triggered = true; } catch (e) { blocked = 'setting Status failed: ' + e.message; } }
      }
      await db.logAirtableSync({ site_id: siteId, kind: 'article_brief', records_pushed: 1, status: 'ok' }).catch(() => {});
      await db.upsertAirtableConfig(siteId, { last_sync: new Date().toISOString() }).catch(() => {});
      return JSON.stringify({
        done: true, action, table: tbl.name, title, writingStarted: triggered,
        note: triggered
          ? "Status set to 'Write Article' — n8n is now generating the article and will publish it to WordPress."
          : blocked
            ? `Brief ${action} in ${tbl.name}, but writing did NOT start: ${blocked}`
            : `Brief ${action} in ${tbl.name}. To create the article, set this row's Status to 'Write Article' (in the Airtable grid) and n8n will write + publish it.`,
      });
    }
    if (name === 'apply_page_meta') {
      const field = META_FIELD_MAP[input.field];
      if (!field) return 'Invalid field — use title, meta_description, or canonical.';
      if (!input.value) return 'No value supplied to write.';
      const g = await wpForSite(siteId); if (typeof g === 'string') return g;
      const found = await resolvePostId(g.wp, input.url);
      if (!found) return 'Could not find a live page matching ' + input.url + ' — check the URL.';
      try {
        const r = await g.wp.updateMetaVerified(found.objectType, found.postId, field, input.value, { force: true });
        if (g.site) await db.logActivity({ site_id: g.site.id, type: 'verified', actor: 'AI chat', icon: 'check', text: 'Applied ' + input.field + ' to live page #' + found.postId, meta: 'read-back ' + r.status }).catch(() => {});
        return JSON.stringify({ done: true, page: input.url, field: input.field, newValue: input.value, previous: r.old, status: r.status, reversible: true });
      } catch (e) { return 'Write failed: ' + e.message; }
    }
    if (name === 'apply_schema_to_page') {
      const g = await wpForSite(siteId); if (typeof g === 'string') return g;
      const found = await resolvePostId(g.wp, input.url);
      if (!found) return 'Could not find a live page matching ' + input.url + '.';
      const jsonld = typeof input.jsonld === 'string' ? input.jsonld : JSON.stringify(input.jsonld || {});
      try {
        const r = await g.wp.request(`${g.wp.baseUrl}/wp-json/seoagent/v1/schema`, { method: 'POST', body: { post_id: found.postId, jsonld } });
        if (g.site) await db.logActivity({ site_id: g.site.id, type: 'verified', actor: 'AI chat', icon: 'check', text: 'Applied schema to live page #' + found.postId, meta: 'JSON-LD' }).catch(() => {});
        return JSON.stringify({ done: true, page: input.url, postId: found.postId, ...r });
      } catch (e) { return 'Apply failed — is the seo-agent-optimize plugin installed on this site? ' + e.message; }
    }
    if (name === 'apply_site_css') {
      if (!input.css) return 'No CSS supplied.';
      const g = await wpForSite(siteId); if (typeof g === 'string') return g;
      try {
        const r = await g.wp.request(`${g.wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css: input.css } });
        if (g.site) await db.logActivity({ site_id: g.site.id, type: 'verified', actor: 'AI chat', icon: 'check', text: 'Applied custom CSS to live site', meta: (r && r.bytes) ? r.bytes + ' bytes' : '' }).catch(() => {});
        return JSON.stringify({ done: true, ...r });
      } catch (e) { return 'Apply failed — is the seo-agent-optimize plugin installed? ' + e.message; }
    }
    return 'Unknown tool';
  } catch (e) { return 'Error: ' + e.message; }
}

// Build the system prompt with the site already injected (so it's site-aware
// from message 1, even before any tool call).
function buildSystem(siteCtx, siteId) {
  const s = siteCtx || {};
  return `You are Sentinel's senior SEO & content strategist, working on a SPECIFIC WordPress site.

ACTIVE SITE: ${s.name || 'unknown'}${s.url ? ' (' + s.url + ')' : ''}
${s.stack ? 'Stack: ' + [s.stack.builder, s.stack.seo, s.stack.cache].filter(Boolean).join(', ') + '.' : ''}
${s.scale ? `Scale: ${s.scale.posts || 0} posts, ${s.scale.pages || 0} pages.` : ''}
${s.scores ? `Latest scores — Perf ${s.scores.performance}, A11y ${s.scores.accessibility}, SEO ${s.scores.seo}.` : ''}
${s.competitors && s.competitors.length ? 'Tracked competitors: ' + s.competitors.join(', ') + '.' : ''}

${P('chat.assistant', siteId)}`;
}

// Build a user message content array supporting text + images.
// images: array of public URLs (Supabase Storage). Claude accepts URL sources.
function buildUserContent(userText, images) {
  if (!images || !images.length) return userText;
  const blocks = [];
  for (const url of images) {
    blocks.push({ type: 'image', source: { type: 'url', url } });
  }
  if (userText) blocks.push({ type: 'text', text: userText });
  return blocks;
}

// Main entry: one assistant turn with an agentic tool loop. Supports images.
export async function chat({ messages = [], userText, images = [], siteId, siteCtx }) {
  // Always refresh site context server-side (authoritative).
  let ctx = siteCtx || {};
  if (siteId) {
    const s = await db.getSite(siteId).catch(() => null);
    if (s) ctx = { name: s.name, url: s.url, stack: s.stack, scale: s.scale, scores: s.scores, competitors: s.competitors };
  }
  const system = buildSystem(ctx, siteId);

  const convo = [...messages];
  const userContent = buildUserContent(userText, images);
  if (userContent) convo.push({ role: 'user', content: userContent });

  let guard = 0;
  while (guard++ < 8) {
    // max_tokens 8000 (was 3500): the assistant is told to produce full briefs/articles,
    // which routinely exceed 3500 output tokens and were being truncated mid-sentence.
    // Kept moderate on the NON-streaming path (no keepalive → the whole reply must land
    // inside the ~100s edge cap); the streaming path below runs a higher ceiling.
    const res = await anthropicFetch({ model: MODEL, max_tokens: 8000, system, tools: TOOLS, messages: convo });
    const data = await res.json();
    if (!res.ok) throw new Error(`Claude chat ${res.status}: ${data.error?.message || ''}`);

    const toolUses = (data.content || []).filter((b) => b.type === 'tool_use');
    const textOut = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    convo.push({ role: 'assistant', content: data.content });

    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      // stop_reason 'max_tokens' means the answer was cut off — say so instead of
      // returning a silently truncated reply the UI would present as complete.
      const reply = data.stop_reason === 'max_tokens'
        ? textOut + '\n\n_[Reply hit the length limit and was cut off — ask me to continue.]_'
        : textOut;
      return { reply, messages: convo, toolsUsed: convo.flatMap((m) => Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_use').map((b) => b.name) : []) };
    }

    const results = [];
    for (const tu of toolUses) {
      const out = await runTool(tu.name, tu.input || {}, siteId);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    convo.push({ role: 'user', content: results });
  }
  return { reply: 'That took too many steps — please narrow the question.', messages: convo };
}

// Generate a short, smart conversation title from the first exchange.
export async function generateTitle(userText, assistantText) {
  try {
    const res = await anthropicFetch({
      model: MODEL, max_tokens: 24, temperature: 0.3,
      messages: [{ role: 'user', content: `Write a 3-5 word title (no quotes, Title Case) summarizing this chat:\nUser: ${(userText || '').slice(0, 300)}\nAssistant: ${(assistantText || '').slice(0, 300)}\n\nTitle only:` }],
    }, { timeoutMs: 20000, retries: 1 });
    const data = await res.json();
    if (!res.ok) return null;
    const t = (data.content || []).map((b) => b.text || '').join('').trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    return t.slice(0, 60) || null;
  } catch (e) { return null; }
}

// Streaming variant. Runs the agentic tool loop, then STREAMS the final answer
// text via the provided callbacks: onText(delta), onTool(names), onToolResult().
// Returns { reply, messages, toolsUsed } once complete.
export async function chatStream({ messages = [], userText, images = [], siteId, onText, onTool }) {
  let ctx = {};
  if (siteId) {
    const s = await db.getSite(siteId).catch(() => null);
    if (s) ctx = { name: s.name, url: s.url, stack: s.stack, scale: s.scale, scores: s.scores, competitors: s.competitors };
  }
  const system = buildSystem(ctx, siteId);
  const convo = [...messages];
  const userContent = buildUserContent(userText, images);
  if (userContent) convo.push({ role: 'user', content: userContent });

  const toolsUsed = [];
  let guard = 0;
  while (guard++ < 8) {
    // max_tokens 16000 (was 3500): streaming keeps the socket alive with data, so the
    // low ceiling had no HTTP-timeout justification — it just truncated long briefs/
    // articles the assistant is instructed to produce. 16000 gives generous headroom
    // for realistic deliverables (it's a ceiling; short replies are unaffected).
    const res = await anthropicFetch({ model: MODEL, max_tokens: 16000, system, tools: TOOLS, messages: convo }, { stream: true });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Claude stream ${res.status}: ${e.error?.message || ''}`); }

    // Parse the SSE stream, reconstructing content blocks + emitting text deltas.
    const blocks = []; let stopReason = null; let curText = '';
    const reader = res.body.getReader();
    const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let ev; try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.type === 'error') {
          // Anthropic emits `event: error` (e.g. overloaded_error) AFTER the 200 header
          // when it fails mid-generation. This frame matched no branch and was silently
          // dropped, so the turn returned a blank/partial reply. Throw so the route emits
          // an honest error to the client instead of persisting a silent empty answer.
          throw new Error('Claude stream error: ' + (ev.error?.message || ev.error?.type || 'unknown'));
        }
        if (ev.type === 'content_block_start') {
          blocks[ev.index] = ev.content_block.type === 'tool_use'
            ? { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, input: {}, _json: '' }
            : { type: 'text', text: '' };
        } else if (ev.type === 'content_block_delta') {
          const b = blocks[ev.index]; if (!b) continue;
          if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; if (onText) onText(ev.delta.text); }
          else if (ev.delta.type === 'input_json_delta') { b._json += ev.delta.partial_json; }
        } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
          stopReason = ev.delta.stop_reason;
        }
      }
    }
    // finalize tool inputs
    for (const b of blocks) { if (b && b.type === 'tool_use') { try { b.input = b._json ? JSON.parse(b._json) : {}; } catch { b.input = {}; } delete b._json; } }
    convo.push({ role: 'assistant', content: blocks });

    const toolUses = blocks.filter((b) => b && b.type === 'tool_use');
    if (stopReason !== 'tool_use' || toolUses.length === 0) {
      let reply = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (stopReason === null && toolUses.length === 0) {
        // Stream ended with NO stop_reason and no tool calls → it was cut/aborted
        // mid-flight (not a clean finish). Don't present it as a complete answer.
        if (!reply) throw new Error('Claude stream ended with no content — please retry.');
        const note = '\n\n_[Response was interrupted before completing — please retry.]_';
        if (onText) onText(note); reply += note;
      } else if (stopReason === 'max_tokens') {
        const note = '\n\n_[Reply hit the length limit and was cut off — ask me to continue.]_';
        if (onText) onText(note); reply += note;
      }
      return { reply, messages: convo, toolsUsed };
    }
    // run tools
    if (onTool) onTool(toolUses.map((t) => t.name));
    toolUses.forEach((t) => toolsUsed.push(t.name));
    const results = [];
    for (const tu of toolUses) results.push({ type: 'tool_result', tool_use_id: tu.id, content: await runTool(tu.name, tu.input || {}, siteId) });
    convo.push({ role: 'user', content: results });
  }
  return { reply: 'That took too many steps — please narrow the question.', messages: convo, toolsUsed };
}

export default { chat, chatStream, generateTitle };
