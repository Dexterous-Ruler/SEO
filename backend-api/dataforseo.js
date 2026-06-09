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

const BASE = 'https://api.dataforseo.com/v3';

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
];
const COUNTRY_BY_DB = Object.fromEntries(COUNTRIES.map((c) => [c.db, c]));
export function countryFor(db) { return COUNTRY_BY_DB[(db || 'uk').toLowerCase()] || COUNTRY_BY_DB.uk; }
export function currencyFor(db) { return countryFor(db).currency; }
const locale = (db) => { const c = countryFor(db); return { location_name: c.location_name, language_name: c.language_name }; };
const cleanDomain = (d) => (d || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

// Low-level POST to a Labs endpoint. DataForSEO wraps results in tasks[].result[].
async function call(path, task) {
  const res = await fetch(`${BASE}${path}`, {
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
  return items.map((it) => {
    const kd = it.keyword_data || {}, ki = kd.keyword_info || {};
    const se = (it.ranked_serp_element || {}).serp_item || {};
    return {
      keyword: kd.keyword || '',
      position: Number(se.rank_group || se.rank_absolute || 0),
      volume: Number(ki.search_volume || 0),
      cpc: Number(ki.cpc || 0),
      trafficPct: Number(se.etv || 0),   // estimated traffic value for this keyword
      url: se.url || '',
    };
  });
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
  const [mine, theirs] = await Promise.all([
    organicKeywords(targetDomain, { db, limit: perPull }).catch(() => []),
    organicKeywords(competitorDomain, { db, limit: perPull }).catch(() => []),
  ]);
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

export function hasKey() { return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD); }

export default { domainOverview, organicKeywords, competitors, backlinks, keywordGap, fullSnapshot, strikingDistance, keywordIdeas, relatedKeywords, apiUnits, hasKey };
