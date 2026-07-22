// ===========================================================================
// DataForSEO integration — drop-in replacement for semrush.js. Same exported
// interface + return shapes, so server.js / chat.js call it unchanged.
//
// Uses the DataForSEO Labs API (pay-as-you-go, no monthly floor). Auth is HTTP
// Basic with the API login (account email) + API PASSWORD from
// https://app.dataforseo.com/api-access  (NOT the dashboard login password).
// Creds live in env (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD), never in the browser.
//
//   ranked_keywords      → a domain's organic keywords (keyword, pos, volume, cpc, url)
//   domain_rank_overview → organic traffic + keyword count
//   competitors_domain   → organic competitors
//   backlinks/summary    → backlink profile (optional)
// Cost ≈ $0.01/task + $0.0001/row. Zero npm deps (Node fetch + crypto-free Basic).
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import { limiters, caches, withTimeout, withRetry } from './infra.js';

const BASE = 'https://api.dataforseo.com/v3';

// Resilient transport for ALL DataForSEO calls: concurrency-capped (no provider
// stampede), 30s timeout (was unbounded → a hung call blocked), and transient
// network/timeout retry with backoff. Logical errors (NO_UNITS/auth/bad request)
// are NOT retried so the UI keeps its specific handling.
const isTransient = (e) => !!(e && (e.transient || e.code === 'ETIMEOUT' || /fetch failed|network|ECONNRESET|ETIMEDOUT|socket|aborted|EAI_AGAIN/i.test(String(e && e.message))));
function dfsFetch(url, opts) {
  return limiters.dataforseo.run(() => withRetry(() => withTimeout(fetch(url, opts), 30000, 'DataForSEO'), { retries: 2, base: 600, retryOn: isTransient }));
}

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set (add to .env — use the API password from app.dataforseo.com/api-access)');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// Per-site target market. Each site stores a `semrush_db` key (default 'uk');
// callers pass it as `db`. We map it to a DataForSEO location/language. UK stays
// the default so existing behaviour is unchanged when no country is chosen.
import { UK } from './uk.js';
export const COUNTRIES = [
  { db: 'uk', label: 'United Kingdom', location_name: 'United Kingdom',        language_name: 'English',    currency: 'GBP' },
  { db: 'us', label: 'United States',  location_name: 'United States',          language_name: 'English',    currency: 'USD' },
  { db: 'ca', label: 'Canada',         location_name: 'Canada',                 language_name: 'English',    currency: 'CAD' },
  { db: 'au', label: 'Australia',      location_name: 'Australia',              language_name: 'English',    currency: 'AUD' },
  { db: 'ie', label: 'Ireland',        location_name: 'Ireland',                language_name: 'English',    currency: 'EUR' },
  { db: 'nz', label: 'New Zealand',    location_name: 'New Zealand',            language_name: 'English',    currency: 'NZD' },
  { db: 'in', label: 'India',          location_name: 'India',                  language_name: 'English',    currency: 'INR' },
  { db: 'ae', label: 'UAE',            location_name: 'United Arab Emirates',   language_name: 'English',    currency: 'AED' },
  { db: 'za', label: 'South Africa',   location_name: 'South Africa',           language_name: 'English',    currency: 'ZAR' },
  { db: 'sg', label: 'Singapore',      location_name: 'Singapore',              language_name: 'English',    currency: 'SGD' },
  { db: 'de', label: 'Germany',        location_name: 'Germany',                language_name: 'German',     currency: 'EUR' },
  { db: 'fr', label: 'France',         location_name: 'France',                 language_name: 'French',     currency: 'EUR' },
  { db: 'es', label: 'Spain',          location_name: 'Spain',                  language_name: 'Spanish',    currency: 'EUR' },
  { db: 'it', label: 'Italy',          location_name: 'Italy',                  language_name: 'Italian',    currency: 'EUR' },
  { db: 'nl', label: 'Netherlands',    location_name: 'Netherlands',            language_name: 'Dutch',      currency: 'EUR' },
  { db: 'se', label: 'Sweden',         location_name: 'Sweden',                 language_name: 'Swedish',    currency: 'SEK' },
  { db: 'no', label: 'Norway',         location_name: 'Norway',                 language_name: 'Norwegian',  currency: 'NOK' },
  { db: 'dk', label: 'Denmark',        location_name: 'Denmark',                language_name: 'Danish',     currency: 'DKK' },
  { db: 'fi', label: 'Finland',        location_name: 'Finland',                language_name: 'Finnish',    currency: 'EUR' },
  { db: 'pl', label: 'Poland',         location_name: 'Poland',                 language_name: 'Polish',     currency: 'PLN' },
  { db: 'pt', label: 'Portugal',       location_name: 'Portugal',               language_name: 'Portuguese', currency: 'EUR' },
  { db: 'ch', label: 'Switzerland',    location_name: 'Switzerland',            language_name: 'German',     currency: 'CHF' },
  { db: 'at', label: 'Austria',        location_name: 'Austria',                language_name: 'German',     currency: 'EUR' },
  { db: 'tr', label: 'Turkey',         location_name: 'Turkey',                 language_name: 'Turkish',    currency: 'TRY' },
  { db: 'br', label: 'Brazil',         location_name: 'Brazil',                 language_name: 'Portuguese', currency: 'BRL' },
  { db: 'mx', label: 'Mexico',         location_name: 'Mexico',                 language_name: 'Spanish',    currency: 'MXN' },
  { db: 'co', label: 'Colombia',       location_name: 'Colombia',               language_name: 'Spanish',    currency: 'COP' },
  { db: 'ar', label: 'Argentina',      location_name: 'Argentina',              language_name: 'Spanish',    currency: 'ARS' },
  { db: 'jp', label: 'Japan',          location_name: 'Japan',                  language_name: 'Japanese',   currency: 'JPY' },
  { db: 'hk', label: 'Hong Kong',      location_name: 'Hong Kong',              language_name: 'English',    currency: 'HKD' },
  { db: 'my', label: 'Malaysia',       location_name: 'Malaysia',               language_name: 'English',    currency: 'MYR' },
  { db: 'ph', label: 'Philippines',    location_name: 'Philippines',            language_name: 'English',    currency: 'PHP' },
  { db: 'pk', label: 'Pakistan',       location_name: 'Pakistan',               language_name: 'English',    currency: 'PKR' },
  { db: 'sa', label: 'Saudi Arabia',   location_name: 'Saudi Arabia',           language_name: 'Arabic',     currency: 'SAR' },
  { db: 'ng', label: 'Nigeria',        location_name: 'Nigeria',                language_name: 'English',    currency: 'NGN' },
];
const COUNTRY_BY_DB = Object.fromEntries(COUNTRIES.map((c) => [c.db, c]));
export function countryFor(db) { return COUNTRY_BY_DB[(db || 'uk').toLowerCase()] || COUNTRY_BY_DB.uk; }
export function currencyFor(db) { return countryFor(db).currency; }
const locale = (db) => { const c = countryFor(db); return { location_name: c.location_name, language_name: c.language_name }; };
const cleanDomain = (d) => (d || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

// Low-level POST to a Labs endpoint. DataForSEO wraps results in tasks[].result[].
async function call(path, task) {
  const res = await dfsFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([task]),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || data.status_code === 40100) {
    throw new Error('DataForSEO auth failed — check DATAFORSEO_LOGIN + API password (app.dataforseo.com/api-access).');
  }
  // Account-level money errors → same NO_UNITS code the UI already handles.
  if (data.status_code === 40200 || /payment|balance|insufficient|funds/i.test(data.status_message || '')) {
    const e = new Error('DataForSEO balance exhausted — top up at app.dataforseo.com'); e.code = 'NO_UNITS'; throw e;
  }
  if (data.status_code !== 20000) throw new Error(`DataForSEO ${data.status_code}: ${data.status_message || res.status}`);
  const t = (data.tasks || [])[0];
  if (!t) return [];
  if (t.status_code === 40200) { const e = new Error('DataForSEO balance exhausted'); e.code = 'NO_UNITS'; throw e; }
  if (t.status_code !== 20000) throw new Error(`DataForSEO task ${t.status_code}: ${t.status_message}`);
  return (t.result && t.result[0] && t.result[0].items) || [];
}

// Account balance (in CENTS) — used by callers as a "units"-style budget gate.
// DataForSEO bills money not units; cents keeps the existing < 30 / < 40 gates
// meaningful (each keyword pull costs ~11 cents).
export async function apiUnits() {
  try {
    const res = await fetch(`${BASE}/appendix/user_data`, { headers: { Authorization: authHeader() } });
    const data = await res.json();
    const bal = data?.tasks?.[0]?.result?.[0]?.money?.balance;
    return bal == null ? null : Math.round(bal * 100); // dollars → cents
  } catch { return null; }
}

// Domain overview: organic traffic estimate + keyword count.
export async function domainOverview(domain, db = 'uk') {
  const items = await call('/dataforseo_labs/google/domain_rank_overview/live', { target: cleanDomain(domain), ...locale(db) });
  const m = items[0] && items[0].metrics && items[0].metrics.organic;
  if (!m) return null;
  return {
    rank: items[0].metrics?.organic?.pos_1 ?? null,
    organicKeywords: m.count ?? 0,
    organicTraffic: Math.round(m.etv ?? 0),
    organicCost: Math.round(m.estimated_paid_traffic_cost ?? 0),
  };
}

// Top organic keywords (position, volume, cpc, URL). `units` kept for signature
// parity (DataForSEO has no per-line unit cost, so we don't cap rows).
export async function organicKeywords(domain, { db = 'uk', limit = 50, units } = {}) {
  const items = await call('/dataforseo_labs/google/ranked_keywords/live', {
    target: cleanDomain(domain), ...locale(db),
    limit: Math.min(limit, 1000),
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
    filters: [['ranked_serp_element.serp_item.type', '=', 'organic']],
  });
  const rows = items.map((it) => {
    const kd = it.keyword_data || {}, ki = kd.keyword_info || {};
    const se = (it.ranked_serp_element || {}).serp_item || {};
    return {
      keyword: kd.keyword || '',
      position: Number(se.rank_group || se.rank_absolute || 0),
      volume: Number(ki.search_volume || 0),
      cpc: Number(ki.cpc || 0),
      etv: Number(se.etv || 0),          // estimated MONTHLY CLICKS (absolute), not a percent
      url: se.url || '',
    };
  });
  // `trafficPct` is rendered by the UI's "Top Keywords" table as `{trafficPct}%`.
  // etv is an ABSOLUTE click estimate (e.g. ~316 for a #1 keyword), so storing it
  // raw showed nonsensical values like "316.0%". Express it as a genuine 0–100
  // share: this keyword's estimated clicks as a percentage of the total estimated
  // organic traffic across the returned set (guard divide-by-zero).
  const totalEtv = rows.reduce((s, r) => s + r.etv, 0);
  return rows.map(({ etv, ...r }) => ({ ...r, trafficPct: totalEtv > 0 ? (etv / totalEtv) * 100 : 0 }));
}

// Organic competitors (domains overlapping on keywords).
export async function competitors(domain, { db = 'uk', limit = 10 } = {}) {
  const items = await call('/dataforseo_labs/google/competitors_domain/live', { target: cleanDomain(domain), ...locale(db), limit: Math.min(limit, 100) });
  return items.map((it) => {
    const org = (it.metrics && it.metrics.organic) || {};
    return {
      domain: it.domain,
      competitionLevel: Number(it.avg_position ? (100 - Math.min(100, it.avg_position)) : 0),
      commonKeywords: Number(it.intersections || 0),
      organicKeywords: Number(org.count || 0),
      traffic: Number(Math.round(org.etv || 0)),
    };
  });
}

// Deterministic question-intent classifier (no AI). Returns one of
// 'definitional' | 'procedural' | 'comparative' | 'evaluative' | 'other'.
// Order: comparative → procedural → evaluative → definitional → other.
// Comparative first ("same as"/" or "/vs); procedural for how-to + consequence
// ("what happens if"); evaluative BEFORE definitional so "worst…to avoid" beats
// the "what are" lookup. Case-insensitive, word-boundary aware. 'other' is rare.
export function classifyQuestion(q) {
  const s = String(q || '').toLowerCase().trim();
  if (!s) return 'other';
  // comparative: vs / versus / difference between / compare / "same as" / whole-word " or " / better than
  if (/\b(vs|versus|compare|same\s+as)\b|\bdifference\s+between\b|\bor\b|\bbetter\s+than\b/.test(s)) return 'comparative';
  // procedural: how-to / process / consequence ("what happens if|when", "what (do|should) i do")
  if (/\b(how\s+to|how\s+do|how\s+can|how\s+does|steps\s+to|guide\s+to)\b|\bhow\s+long\s+does\b.*\btake\b|\bprocess\s+(of|for)\b|\bwhat\s+happens\s+(if|when|after)\b|\bwhat\s+(do|should)\s+i\s+do\b/.test(s)) return 'procedural';
  // evaluative: judgement / recommendation / risk — checked before definitional
  if (/\b(worth|best|worst|avoid|recommend|advisable)\b|^(is|are|should)\b|^can\s+(i|you|we|they)\b|^do\s+i\s+need\b|\bshould\s+(i|you|we)\b|\bhow\s+(serious|risky|dangerous|bad|safe)\b|\bwhich\b.*\b(avoid|best|worst|should)\b/.test(s)) return 'evaluative';
  // definitional / factual lookups: what is|are|does / define / meaning of / how much|many / cost of / when is|does|do / where
  if (/\b(what\s+is|what\s+are|what\s+does|define|meaning\s+of|how\s+much|how\s+many|cost\s+of|where)\b|\bwhen\s+(is|does|do)\b/.test(s)) return 'definitional';
  return 'other';
}

// Pattern → recommended featured-snippet format. Definitional/evaluative answers
// read best as a tight paragraph; procedural as an ordered list; comparative as a table.
const SNIPPET_FORMAT_BY_PATTERN = { definitional: 'paragraph', procedural: 'list', comparative: 'table', evaluative: 'paragraph' };
const snippetFormatFor = (pattern) => SNIPPET_FORMAT_BY_PATTERN[pattern] || 'paragraph';

// People Also Ask: real Google PAA *questions* (+ related searches) for a seed
// keyword, in the site's market. This is the ONLY source that returns true PAA
// questions — Labs endpoints return related keywords, not questions. Uses the
// existing DataForSEO account (SERP organic live/advanced, ~$0.002/seed). The UI
// pushes these questions to Airtable so the writer answers one per article.
// Each question additionally carries `pattern` (intent class) + `snippetFormat`
// (the structure most likely to win the featured snippet for that intent).
export async function peopleAlsoAsk(keyword, { db = 'uk', depth = 2 } = {}) {
  const items = await call('/serp/google/organic/live/advanced', {
    keyword: String(keyword || '').trim(),
    ...locale(db),
    device: 'desktop',
    people_also_ask_click_depth: Math.min(Math.max(Number(depth) || 2, 1), 4),
  });
  const questions = [], related = [];
  for (const el of (items || [])) {
    if (el && el.type === 'people_also_ask') {
      for (const pa of (el.items || [])) {
        const q = (pa && pa.title) || '';
        const ex = (pa && pa.expanded_element && pa.expanded_element[0]) || {};
        if (q) { const pattern = classifyQuestion(q); questions.push({ question: q, answer: String(ex.description || '').slice(0, 400), url: ex.url || '', domain: ex.domain || '', seed: pa.seed_question || keyword, pattern, snippetFormat: snippetFormatFor(pattern) }); }
      }
    } else if (el && el.type === 'related_searches') {
      for (const r of (el.items || [])) { const t = typeof r === 'string' ? r : (r && r.title); if (t) related.push(t); }
    }
  }
  const seen = new Set();
  const uniqQ = questions.filter((x) => { const k = x.question.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return { keyword: String(keyword || '').trim(), questions: uniqQ, related: [...new Set(related)] };
}

// Backlink profile summary (optional — separate API; cheap, catchable).
export async function backlinks(domain) {
  try {
    const res = await fetch(`${BASE}/backlinks/summary/live`, {
      method: 'POST', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify([{ target: cleanDomain(domain), internal_list_limit: 1, backlinks_status_type: 'live' }]),
    });
    const data = await res.json();
    const r = data?.tasks?.[0]?.result?.[0];
    if (!r) return null;
    return { total: r.backlinks, domains: r.referring_domains, urls: r.referring_pages, score: r.rank };
  } catch { return null; }
}

// ---- keyword-gap helpers (same logic/heuristics as the SEMrush module) ------
function brandTokens(domain) {
  const host = (domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const stem = host.split('.')[0];
  const parts = stem.split(/[-_]/).filter((p) => p.length >= 3);
  return [stem, ...parts].map((p) => p.toLowerCase());
}
function isRelevantKeyword(kw, { brands = [], negatives = [] } = {}) {
  const k = (kw || '').toLowerCase().trim();
  if (!k) return false;
  if (/^[a-z]{1,2}\d?$/.test(k)) return false;
  if (/\b(symbol|sign|logo)\b/.test(k) && /\b[a-z]\b/.test(k)) return false;
  for (const b of brands) { if (b && k.includes(b)) return false; }
  for (const n of negatives) { const t = (n || '').toLowerCase().trim(); if (t && k.includes(t)) return false; }
  return true;
}

// Keyword gap: keywords the competitor ranks for that the target doesn't.
export async function keywordGap(targetDomain, competitorDomain, { db = 'uk', limit = 60, negatives = [], extraBrands = [], rows = 200 } = {}) {
  const perPull = Math.max(40, Math.floor(rows / 2));
  // Distinguish "target pull FAILED" from "target genuinely ranks for nothing": when the
  // target fetch errors but the competitor's succeeds, the subtraction makes EVERYTHING
  // the competitor ranks for look like a gap — fabricated results. Fail loudly instead.
  let mineFailed = false;
  const [mine, theirs] = await Promise.all([
    organicKeywords(targetDomain, { db, limit: perPull }).catch(() => { mineFailed = true; return []; }),
    organicKeywords(competitorDomain, { db, limit: perPull }).catch(() => []),
  ]);
  if (mineFailed && theirs.length) { const e = new Error(`Could not read ${targetDomain}'s own keywords — gap results would be fabricated. Retry shortly.`); e.code = 'TARGET_PULL_FAILED'; throw e; }
  if (!theirs.length && !mine.length) { const e = new Error('No DataForSEO data for these domains'); e.code = 'NO_DATA'; throw e; }
  const mineSet = new Set(mine.map((r) => (r.keyword || '').toLowerCase()));
  const brands = [...brandTokens(competitorDomain), ...extraBrands.flatMap(brandTokens)];
  const all = theirs.filter((r) => r.keyword && !mineSet.has(r.keyword.toLowerCase())).sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const filtered = all.filter((r) => isRelevantKeyword(r.keyword, { brands, negatives }));
  const gaps = filtered.slice(0, limit).map((r) => ({ keyword: r.keyword, volume: r.volume || 0, competitorPos: r.position || 0, cpc: r.cpc || 0, url: r.url }));
  return { target: targetDomain, competitor: competitorDomain, gapCount: gaps.length, filteredOut: all.length - filtered.length, gaps };
}

// Full snapshot: overview + top keywords + competitors + backlinks.
export async function fullSnapshot(domain, { db = 'uk' } = {}) {
  const [overview, keywords, comps, links] = await Promise.all([
    domainOverview(domain, db).catch((e) => ({ _error: e.message })),
    organicKeywords(domain, { db, limit: 40 }).catch(() => []),
    competitors(domain, { db, limit: 8 }).catch(() => []),
    backlinks(domain).catch(() => null),
  ]);
  return { domain, db, overview, topKeywords: keywords, competitors: comps, backlinks: links || null };
}

// Striking distance: positions 11-20, by volume. Server-side filter so we only
// fetch the rows we want.
export async function strikingDistance(domain, { db = 'uk', limit = 30 } = {}) {
  const items = await call('/dataforseo_labs/google/ranked_keywords/live', {
    target: cleanDomain(domain), ...locale(db),
    limit: Math.min(Math.max(limit, 100), 1000),
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
    filters: [
      ['ranked_serp_element.serp_item.type', '=', 'organic'], 'and',
      ['ranked_serp_element.serp_item.rank_group', '>', 10], 'and',
      ['ranked_serp_element.serp_item.rank_group', '<', 21],
    ],
  });
  const close = items.map((it) => {
    const kd = it.keyword_data || {}, ki = kd.keyword_info || {};
    const se = (it.ranked_serp_element || {}).serp_item || {};
    return { keyword: kd.keyword || '', position: Number(se.rank_group || 0), volume: Number(ki.search_volume || 0), cpc: Number(ki.cpc || 0), url: se.url || '' };
  }).filter((k) => k.position >= 11 && k.position <= 20).sort((a, b) => b.volume - a.volume).slice(0, limit);
  const bal = await apiUnits().catch(() => null);
  return { unitsRemaining: bal, scanned: items.length, count: close.length, keywords: close };
}

// Compute a trend % from DataForSEO's monthly_searches array (recent 3 months
// vs the prior 3). Positive = rising demand ("trending"), negative = declining.
function trendFromMonthly(monthly) {
  const m = (monthly || []).filter((x) => x && x.search_volume != null);
  if (m.length < 6) return 0;
  const recent = m.slice(-3).reduce((s, x) => s + x.search_volume, 0) / 3;
  const prior = m.slice(-6, -3).reduce((s, x) => s + x.search_volume, 0) / 3;
  if (!prior) return 0;
  return Math.round(((recent - prior) / prior) * 100);
}

function mapIdea(it) {
  const ki = (it.keyword_info) || (it.keyword_data && it.keyword_data.keyword_info) || {};
  const kw = it.keyword || (it.keyword_data && it.keyword_data.keyword) || '';
  return {
    keyword: kw,
    volume: Number(ki.search_volume || 0),
    cpc: Number(ki.cpc || 0),
    competition: Number(ki.competition || 0),
    difficulty: Number((it.keyword_properties && it.keyword_properties.keyword_difficulty) || ki.keyword_difficulty || 0),
    trend: trendFromMonthly(ki.monthly_searches),
  };
}

// Keyword IDEAS — expansion + trending demand around seed term(s). Each result
// carries volume, CPC, difficulty, and a trend % (rising vs falling). This is
// the "what is trending" source.
export async function keywordIdeas(seeds, { db = 'uk', limit = 100 } = {}) {
  const list = (Array.isArray(seeds) ? seeds : [seeds]).filter(Boolean).slice(0, 20);
  if (!list.length) return [];
  const items = await call('/dataforseo_labs/google/keyword_ideas/live', {
    keywords: list, ...locale(db), limit: Math.min(limit, 1000),
    order_by: ['keyword_info.search_volume,desc'],
  });
  return items.map(mapIdea).filter((k) => k.keyword);
}

// RELATED keywords — semantically related terms (depth-based expansion) for
// cluster building. Returns keyword + volume + trend.
export async function relatedKeywords(seed, { db = 'uk', limit = 100, depth = 2 } = {}) {
  const items = await call('/dataforseo_labs/google/related_keywords/live', {
    keyword: String(seed || '').toLowerCase(), ...locale(db), limit: Math.min(limit, 1000), depth,
  });
  // related_keywords nests data under keyword_data
  return items.map((it) => mapIdea(it.keyword_data ? it : { keyword_data: it })).filter((k) => k.keyword);
}

// ===========================================================================
// BACKLINKS API (Link Engine) — separate DataForSEO product, same account/auth.
// Backlinks are global (not geo-locked), so no locale is applied here.
// ===========================================================================
async function blRaw(path, task) {
  const res = await dfsFetch(`${BASE}${path}`, {
    method: 'POST', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify([task]),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || data.status_code === 40100) throw new Error('DataForSEO auth failed — check DATAFORSEO_LOGIN + API password.');
  if (data.status_code === 40200 || /payment|balance|insufficient|funds/i.test(data.status_message || '')) { const e = new Error('DataForSEO balance exhausted — top up at app.dataforseo.com'); e.code = 'NO_UNITS'; throw e; }
  if (isNoBacklinksSub(data.status_code, data.status_message)) throw noBacklinksSubError();
  if (data.status_code !== 20000) throw new Error(`DataForSEO ${data.status_code}: ${data.status_message || res.status}`);
  const t = (data.tasks || [])[0];
  if (!t) return null;
  if (t.status_code === 40200) { const e = new Error('DataForSEO balance exhausted'); e.code = 'NO_UNITS'; throw e; }
  if (isNoBacklinksSub(t.status_code, t.status_message)) throw noBacklinksSubError();
  if (t.status_code !== 20000) throw new Error(`DataForSEO task ${t.status_code}: ${t.status_message}`);
  return (t.result && t.result[0]) || null;
}
// The Backlinks API is a SEPARATE DataForSEO subscription from Labs/keyword data —
// a fresh account has keyword access but not backlinks (code 40204 / access denied).
function isNoBacklinksSub(code, msg) { return code === 40204 || /access denied|not.*subscrib|activate your subscription|subscription to/i.test(msg || ''); }
function noBacklinksSubError() {
  const e = new Error("The DataForSEO Backlinks API isn't activated on your account yet. It's a separate subscription from the keyword data — activate it (from ~$100/mo) at app.dataforseo.com/backlinks-subscription, then retry. Your keyword tools are unaffected.");
  e.code = 'NO_BACKLINKS_SUB';
  return e;
}

// Full backlink-profile overview: rank (0–1000), backlink & referring-domain
// counts, spam score, do-follow ratio.
export async function backlinksSummary(domain) {
 return caches.dataforseo.wrap('blsummary:' + cleanDomain(domain), async () => {
  const r = await blRaw('/backlinks/summary/live', { target: cleanDomain(domain), internal_list_limit: 1, backlinks_status_type: 'live', include_subdomains: true });
  if (!r) return null;
  const total = r.backlinks || 0;
  const dofollow = r.referring_links_attributes && r.referring_links_attributes.dofollow != null ? r.referring_links_attributes.dofollow : (r.dofollow || null);
  return {
    target: r.target,
    rank: r.rank ?? null,
    backlinks: total,
    referringDomains: r.referring_domains ?? 0,
    referringMainDomains: r.referring_main_domains ?? r.referring_domains ?? 0,
    referringPages: r.referring_pages ?? 0,
    spamScore: r.backlinks_spam_score ?? null,
    dofollow: dofollow,
    dofollowRatio: total && dofollow != null ? Math.round((dofollow / total) * 100) : null,
    brokenBacklinks: r.broken_backlinks ?? 0,
    referringIps: r.referring_ips ?? 0,
  };
 });
}

// Referring domains (the unit that drives DR/DA): domain, its rank, link count,
// spam score, first-seen / lost.
export async function referringDomains(domain, { limit = 100, status = 'live', orderBy = 'rank,desc' } = {}) {
 return caches.dataforseo.wrap(`refdoms:${cleanDomain(domain)}:${status}:${limit}:${orderBy}`, async () => {
  const r = await blRaw('/backlinks/referring_domains/live', {
    target: cleanDomain(domain), limit: Math.min(limit, 1000), backlinks_status_type: status,
    order_by: [orderBy], include_subdomains: true,
  });
  const items = (r && r.items) || [];
  return items.map((it) => ({
    domain: it.domain,
    rank: it.rank ?? null,
    backlinks: it.backlinks ?? 0,
    dofollow: it.referring_links_attributes ? (it.referring_links_attributes.dofollow || 0) : null,
    spamScore: it.backlink_spam_score ?? null,
    firstSeen: it.first_seen || null,
    lostDate: it.lost_date || null,
    isLost: !!it.lost_date,
  })).filter((d) => d.domain);
 });
}

// Anchor-text distribution — used to flag exact-match over-optimisation (spam risk).
export async function backlinkAnchors(domain, { limit = 50 } = {}) {
 return caches.dataforseo.wrap(`anchors:${cleanDomain(domain)}:${limit}`, async () => {
  const r = await blRaw('/backlinks/anchors/live', { target: cleanDomain(domain), limit: Math.min(limit, 1000), backlinks_status_type: 'live' });
  const items = (r && r.items) || [];
  return items.map((it) => ({ anchor: it.anchor, referringDomains: it.referring_domains ?? 0, backlinks: it.backlinks ?? 0 })).filter((a) => a.anchor != null);
 });
}

// Competitor LINK GAP (flagship): domains linking to >=1 of the competitor
// targets but NOT to `site`. Returns prospects with the referring domain, its
// rank, and how many competitors it links to.
export async function domainIntersection(site, competitors, { limit = 100 } = {}) {
  const comps = (competitors || []).map(cleanDomain).filter(Boolean).slice(0, 20);
  if (!comps.length) return [];
  const cacheKey = `intersect:${cleanDomain(site)}:${[...comps].sort().join(',')}:${limit}`;
  return caches.dataforseo.wrap(cacheKey, async () => {
  const targets = {}; comps.forEach((c, i) => { targets[String(i + 1)] = c; });
  const r = await blRaw('/backlinks/domain_intersection/live', {
    targets, exclude_targets: [cleanDomain(site)], limit: Math.min(limit, 1000),
    backlinks_status_type: 'live', order_by: ['1.rank,desc'],
  });
  const items = (r && r.items) || [];
  return items.map((it) => {
    const inter = it.intersection_result || it.intersection || {};
    const linkedTargets = Object.keys(inter).filter((k) => inter[k] != null);
    const first = inter[linkedTargets[0]] || {};
    return {
      domain: it.domain || first.domain || null,
      rank: it.rank ?? first.rank ?? null,
      spamScore: it.backlink_spam_score ?? first.backlink_spam_score ?? null,
      competitorsLinked: linkedTargets.length,
      competitorDomains: linkedTargets.map((k) => targets[k]).filter(Boolean),
    };
  }).filter((d) => d.domain);
  });
}

export function hasKey() { return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD); }

export default { domainOverview, organicKeywords, competitors, backlinks, keywordGap, fullSnapshot, strikingDistance, keywordIdeas, relatedKeywords, peopleAlsoAsk, classifyQuestion, apiUnits, hasKey, backlinksSummary, referringDomains, backlinkAnchors, domainIntersection };
