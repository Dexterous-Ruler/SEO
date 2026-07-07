// ===========================================================================
// Content Engine — the unified "brain" that turns every content-opportunity
// PRODUCER into ONE normalized, deduped, scored queue a writer works from.
//
// Producers wired (each best-effort, in its own try/catch — a failing source
// never breaks the others):
//   • content-opportunities.js  findOpportunities → keyword clusters (source 'keywords')
//   • research.js               trendingIntel     → timely ideas     (source 'trending')
//   • dataforseo.js             peopleAlsoAsk     → PAA questions     (source 'paa', seeded from the top clusters)
//   • geo.js                    suggestPrompts    → AI-visibility gaps (source 'ai_visibility', OPTIONAL — Claude call, only when includeGeo)
//
// NORMALIZE → DEDUPE → MERGE → SCORE → PERSIST → (mirror to Airtable).
// dedupeKey() collapses "uk spouse visa cost" and "cost of a UK spouse visa"
// onto one record (sorted significant-token signature). Merging concatenates
// evidence (multi-source = higher confidence) and boosts the score. score()
// weights volume × niche-fit (vs the site's geo_context) × AEO/action value ×
// freshness × gap × multi-source, so off-niche items rank low.
//
// Storage = Supabase `content_opportunities` via PostgREST ONLY (no DDL). The
// table is created by supabase/content-engine.sql; every DB call degrades
// gracefully to { notProvisioned:true } when the table is absent (404/PGRST205).
// Mirrors backend-api/drift.js's save/get pattern exactly.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

import { db } from './supabase.js';
import { geoFor } from './prompts.js';
import { findOpportunities } from './content-opportunities.js';
import * as research from './research.js';
import * as dfs from './dataforseo.js';
import * as geo from './geo.js';
import * as airtable from './airtable.js';

const SB = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE;

function headers(extra) {
  return Object.assign({ apikey: SRV, Authorization: 'Bearer ' + SRV, 'Content-Type': 'application/json' }, extra || {});
}

// A migration-missing PostgREST response: table not in the schema cache.
const NOT_PROVISIONED = { error: 'content_opportunities table not provisioned — run supabase/content-engine.sql', notProvisioned: true };
function isMissingTable(status, body) {
  if (status === 404) return true;
  const b = (typeof body === 'string' ? body : JSON.stringify(body || '')) || '';
  return /PGRST205|PGRST202|could not find the table|relation .*content_opportunities.* does not exist/i.test(b);
}

// ---- token/dedupe helpers (reuse content-opportunities.js's tokens()/STOP) --
const STOP = new Set('the a an and or of for for to in on with your you our how what why best top guide vs is are can do does will near me uk'.split(' '));
export function tokens(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)); }
function cleanTitle(t) { return (t || '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(); }

// Normalized token SIGNATURE: lowercase, strip stopwords/punct, sort the
// significant tokens, join. So "uk spouse visa cost" and "cost of a UK spouse
// visa" both collapse to "cost spouse visa" and collide.
export function dedupeKey(text) {
  const toks = [...new Set(tokens(text))].sort();
  return toks.join(' ');
}

// ---- normalized opportunity record ----------------------------------------
// actionType routing: PAA / definitional / short-answer → 'answer_block';
// AI-visibility → 'geo'; else 'article'.
const ANSWER_PATTERNS = new Set(['definitional', 'evaluative']);   // dfs.classifyQuestion patterns that read best as a direct answer block
function makeOpp(siteId, { source, sourceRef, title, primaryKeyword, intent, actionType, clusterKey, score, scoreBreakdown, evidence, payload }) {
  const t = cleanTitle(title || primaryKeyword || '');
  return {
    siteId,
    source,
    sourceRef: sourceRef || null,
    title: t,
    primaryKeyword: (primaryKeyword || t) || null,
    intent: intent || 'informational',
    actionType: actionType || 'article',
    clusterKey: clusterKey || null,
    dedupeKey: dedupeKey(t || primaryKeyword || ''),
    score: score != null ? score : 0,
    scoreBreakdown: scoreBreakdown || {},
    evidence: Array.isArray(evidence) ? evidence : [],
    status: 'scored',
    payload: payload || {},
  };
}

// ---- 4) score --------------------------------------------------------------
// Unified 0-100-ish opportunity score. Multiplicative so a weak factor (esp.
// niche-fit) can sink an item: an off-niche topic scores near zero.
//   baseline   = log10(1 + volume)                 — demand
//   nicheFit   = fraction of title tokens present in the site's geo_context
//                (strong multiplier: off-niche → low)
//   actionVal  = AEO bonus for answer_block / geo (answer-first + AI-cited win)
//   freshness  = trending bonus
//   gapBonus   = no page covers this yet
//   multiSrc   = >1 distinct producer agrees (confidence)
export function score(opp, site) {
  const p = opp.payload || {};
  const volume = Number(p.totalVolume != null ? p.totalVolume : (p.volume || 0)) || 0;
  const baseline = Math.log10(1 + volume) || 0.3;   // floor so a zero-volume-but-relevant item isn't fully zeroed

  // niche-fit: overlap of the title's tokens with the site's niche context.
  const nicheCtx = (site && (site.__nicheCtx != null ? site.__nicheCtx : (site.id ? geoFor(site.id) : ''))) || '';
  const nicheToks = new Set(tokens(nicheCtx));
  const titleToks = tokens(opp.title || opp.primaryKeyword || '');
  let hit = 0; for (const t of titleToks) if (nicheToks.has(t)) hit++;
  // If we have no niche context at all, don't punish (neutral 1); otherwise a
  // strong multiplier from 0.25 (off-niche) → 1.5 (fully on-niche).
  const fitFrac = titleToks.length ? hit / titleToks.length : 0;
  const nicheFit = !nicheToks.size ? 1 : (0.25 + 1.25 * fitFrac);

  // action / AEO value: answer blocks + AI-visibility items are worth more.
  const actionVal = opp.actionType === 'answer_block' ? 1.35 : opp.actionType === 'geo' ? 1.5 : 1;

  // freshness: trending signal.
  const trending = !!(p.trending || (Number(p.avgTrend) > 15) || opp.source === 'trending');
  const freshness = trending ? 1.3 : 1;

  // gap bonus: no page covers this topic yet.
  const gapBonus = p.isGap ? 1.6 : 1;

  // multi-source bonus: distinct producers agreeing.
  const nSources = new Set((opp.evidence || []).map((e) => e && e.source).filter(Boolean)).size || 1;
  const multiSrc = nSources >= 3 ? 1.5 : nSources === 2 ? 1.25 : 1;

  const raw = baseline * nicheFit * actionVal * freshness * gapBonus * multiSrc;
  const value = Math.round(raw * 100) / 100;
  opp.scoreBreakdown = {
    baseline: Math.round(baseline * 100) / 100,
    volume,
    nicheFit: Math.round(nicheFit * 100) / 100,
    nicheHitFrac: Math.round(fitFrac * 100) / 100,
    actionVal, freshness, gapBonus, multiSrc, nSources,
    value,
  };
  opp.score = value;
  return value;
}

// ---- 3) merge on dedupeKey -------------------------------------------------
// Keep ONE record per dedupeKey: concat evidence (multi-source), keep the
// richest title/keyword/payload, union sources. Re-scored by the caller after
// merge so the multi-source bonus applies.
function richer(a, b) { return (String(b || '').length > String(a || '').length) ? b : a; }
function mergeInto(base, extra) {
  base.title = richer(base.title, extra.title);
  base.primaryKeyword = base.primaryKeyword || extra.primaryKeyword;
  base.intent = base.intent || extra.intent;
  base.clusterKey = base.clusterKey || extra.clusterKey;
  base.sourceRef = base.sourceRef || extra.sourceRef;
  // Prefer the more "actionable" action type when they differ: answer_block/geo
  // over a plain article (they carry an AEO win), but never downgrade.
  const rank = { geo: 3, answer_block: 2, article: 1 };
  if ((rank[extra.actionType] || 0) > (rank[base.actionType] || 0)) { base.actionType = extra.actionType; base.source = extra.source; }
  // Evidence: concat + de-dup by (source|detail).
  const seen = new Set((base.evidence || []).map((e) => `${e.source}|${e.detail}`));
  for (const e of (extra.evidence || [])) { const k = `${e.source}|${e.detail}`; if (!seen.has(k)) { base.evidence.push(e); seen.add(k); } }
  // Payload: merge, preferring the record that carried volume/cluster detail.
  base.payload = Object.assign({}, extra.payload, base.payload);
  if ((Number(extra.payload && extra.payload.totalVolume) || 0) > (Number(base.payload && base.payload.totalVolume) || 0)) {
    base.payload.totalVolume = extra.payload.totalVolume;
  }
  base.payload.isGap = base.payload.isGap || (extra.payload && extra.payload.isGap);
  base.payload.trending = base.payload.trending || (extra.payload && extra.payload.trending);
  return base;
}

function dedupeMerge(opps) {
  const byKey = new Map();
  for (const o of opps) {
    if (!o || !o.dedupeKey) continue;
    const cur = byKey.get(o.dedupeKey);
    if (cur) mergeInto(cur, o);
    else byKey.set(o.dedupeKey, o);
  }
  return [...byKey.values()];
}

// ---- 1) ingest -------------------------------------------------------------
// Call every producer (best-effort), normalize into common records, dedupe +
// merge, then score. Returns { opps, sources } where sources is per-producer
// diagnostics (count or error) so a partial run is transparent.
export async function ingest(siteId, { db: region, includeTrending = true, includePaa = true, includeGeo = false } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'Site not found.', opps: [], sources: {} };
  const nicheCtx = geoFor(siteId) || '';
  const scoreSite = { id: siteId, __nicheCtx: nicheCtx };
  const sources = {};
  const raw = [];

  // -- A) KEYWORD CLUSTERS (content-opportunities.js) → source 'keywords' -----
  let clusters = [];
  try {
    const found = await findOpportunities(siteId, { db: region, includeTrending });
    clusters = (found && Array.isArray(found.clusters)) ? found.clusters : [];
    sources.keywords = { count: clusters.length };
    if (found && found.error && !clusters.length) sources.keywords.error = found.error;
    for (const cl of clusters) {
      raw.push(makeOpp(siteId, {
        source: 'keywords',
        sourceRef: cl.label,
        title: cl.suggestedTitle || cl.label,
        primaryKeyword: cl.primaryKeyword,
        intent: cl.intent,
        actionType: 'article',
        clusterKey: cl.label,
        evidence: [{ source: 'keywords', detail: `${cl.keywordCount || 0} kw · ${cl.totalVolume || 0}/mo${cl.isGap ? ' · gap' : ''}${cl.fromCompetitor ? ' · competitor' : ''}` }],
        payload: {
          totalVolume: cl.totalVolume, avgTrend: cl.avgTrend, trending: cl.trending,
          isGap: cl.isGap, coveringUrl: cl.coveringUrl, fromCompetitor: cl.fromCompetitor,
          format: cl.format, keywords: cl.keywords, keywordCount: cl.keywordCount,
          label: cl.label, suggestedTitle: cl.suggestedTitle, primaryKeyword: cl.primaryKeyword, intent: cl.intent,
        },
      }));
    }
  } catch (e) { sources.keywords = { error: String(e.message || e) }; }

  // -- B) TRENDING (research.trendingIntel) → source 'trending' ---------------
  if (includeTrending) {
    try {
      const trend = await research.trendingIntel({ niche: (site.niche || ''), context: nicheCtx, db: region, now: Date.now() });
      const ideas = (trend && Array.isArray(trend.ideas)) ? trend.ideas : [];
      sources.trending = { count: ideas.length };
      if (trend && trend.error && !ideas.length) sources.trending.error = trend.error;
      for (const idea of ideas) {
        raw.push(makeOpp(siteId, {
          source: 'trending',
          sourceRef: 'trendingIntel',
          title: idea.title,
          primaryKeyword: idea.keyword,
          intent: 'informational',
          actionType: 'article',
          evidence: [{ source: 'trending', detail: idea.whyNow || 'timely this week' }],
          payload: { trending: true, whyNow: idea.whyNow, angle: idea.angle, keyword: idea.keyword },
        }));
      }
    } catch (e) { sources.trending = { error: String(e.message || e) }; }
  }

  // -- C) PEOPLE-ALSO-ASK (dataforseo.peopleAlsoAsk) → source 'paa' -----------
  // Seed from the top-3 cluster primary keywords (real PAA questions per seed).
  if (includePaa) {
    try {
      if (!dfs.hasKey()) { sources.paa = { error: 'DataForSEO not configured' }; }
      else {
        const seeds = clusters
          .slice().sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0))
          .map((c) => c.primaryKeyword).filter(Boolean).slice(0, 3);
        const dbRegion = String(region || site.semrush_db || 'uk').toLowerCase();
        let qCount = 0;
        for (const seed of seeds) {
          try {
            const paa = await dfs.peopleAlsoAsk(seed, { db: dbRegion });
            for (const q of (paa.questions || [])) {
              const pattern = q.pattern || dfs.classifyQuestion(q.question);
              const actionType = ANSWER_PATTERNS.has(pattern) ? 'answer_block' : 'article';
              qCount++;
              raw.push(makeOpp(siteId, {
                source: 'paa',
                sourceRef: seed,
                title: q.question,
                primaryKeyword: q.question,
                intent: pattern === 'comparative' ? 'commercial' : 'informational',
                actionType,
                clusterKey: seed,
                evidence: [{ source: 'paa', detail: `PAA (${pattern}) · seed "${seed}"` }],
                payload: { pattern, snippetFormat: q.snippetFormat, seed, paaAnswer: q.answer, paaUrl: q.url },
              }));
            }
          } catch (e) { /* per-seed best-effort */ }
        }
        sources.paa = { count: qCount, seeds };
      }
    } catch (e) { sources.paa = { error: String(e.message || e) }; }
  }

  // -- D) AI-VISIBILITY (geo.suggestPrompts) → source 'ai_visibility' ---------
  // OPTIONAL (a Claude call) — only when includeGeo. actionType 'geo'.
  if (includeGeo) {
    try {
      const sampleTitles = clusters.map((c) => c.suggestedTitle || c.label).filter(Boolean).slice(0, 30);
      const prompts = await geo.suggestPrompts({ siteName: site.name, niche: site.niche || '', sampleTitles, context: nicheCtx });
      const list = Array.isArray(prompts) ? prompts : [];
      sources.ai_visibility = { count: list.length };
      for (const p of list) {
        const q = (p && p.prompt) || '';
        if (!q) continue;
        raw.push(makeOpp(siteId, {
          source: 'ai_visibility',
          sourceRef: 'suggestPrompts',
          title: q,
          primaryKeyword: q,
          intent: (p && p.intent) || 'informational',
          actionType: 'geo',
          evidence: [{ source: 'ai_visibility', detail: `buyer-intent prompt (${(p && p.intent) || 'informational'})` }],
          payload: { aiPrompt: q, intent: (p && p.intent) || 'informational' },
        }));
      }
    } catch (e) { sources.ai_visibility = { error: String(e.message || e) }; }
  }

  // Dedupe + merge across producers, then score (multi-source bonus now applies).
  const merged = dedupeMerge(raw);
  for (const o of merged) score(o, scoreSite);
  merged.sort((a, b) => b.score - a.score);

  return { opps: merged, sources, count: merged.length };
}

// ---- 5) persist ------------------------------------------------------------
// Upsert into content_opportunities keyed unique(site_id, dedupe_key), merging
// on conflict. PostgREST merge-duplicates replaces the row, so we pre-merge
// against any existing rows (concat evidence, max score) to preserve multi-run
// history. Graceful → { notProvisioned:true }.
function rowFor(o) {
  return {
    site_id: o.siteId || null,
    source: o.source || null,
    source_ref: o.sourceRef || null,
    title: o.title || null,
    primary_keyword: o.primaryKeyword || null,
    intent: o.intent || null,
    action_type: o.actionType || null,
    cluster_key: o.clusterKey || null,
    dedupe_key: o.dedupeKey || null,
    score: o.score != null ? o.score : 0,
    score_breakdown: o.scoreBreakdown || {},
    evidence: o.evidence || [],
    status: o.status || 'scored',
    payload: o.payload || {},
    updated_at: new Date().toISOString(),
  };
}

export async function persist(siteId, opps) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE missing).' };
  const list = (opps || []).filter((o) => o && o.dedupeKey);
  if (!list.length) return { saved: 0 };

  // Pre-merge against existing rows for the same (site, dedupe_key): concat
  // evidence + take the max score, so a re-run never loses prior multi-source
  // signal. Read the existing keys in ONE request.
  try {
    const keys = [...new Set(list.map((o) => o.dedupeKey))];
    const inList = keys.map((k) => `"${String(k).replace(/"/g, '')}"`).join(',');
    const existing = {};
    if (inList) {
      const res = await fetch(`${SB}/rest/v1/content_opportunities?site_id=eq.${encodeURIComponent(siteId)}&dedupe_key=in.(${encodeURIComponent(inList)})&select=dedupe_key,score,evidence`, { headers: headers() });
      const text = await res.text();
      if (!res.ok) {
        if (isMissingTable(res.status, text)) return NOT_PROVISIONED;
        return { error: `content_opportunities read → ${res.status} ${text.slice(0, 200)}` };
      }
      let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
      for (const r of (Array.isArray(data) ? data : [])) existing[r.dedupe_key] = r;
    }

    const rows = list.map((o) => {
      const row = rowFor(o);
      const prev = existing[o.dedupeKey];
      if (prev) {
        row.score = Math.max(Number(row.score) || 0, Number(prev.score) || 0);
        const seen = new Set((row.evidence || []).map((e) => `${e.source}|${e.detail}`));
        for (const e of (Array.isArray(prev.evidence) ? prev.evidence : [])) {
          const k = `${e.source}|${e.detail}`; if (!seen.has(k)) { row.evidence.push(e); seen.add(k); }
        }
      }
      return row;
    });

    const res = await fetch(`${SB}/rest/v1/content_opportunities?on_conflict=site_id,dedupe_key`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(rows),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return NOT_PROVISIONED;
      return { error: `content_opportunities upsert → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
    return { saved: Array.isArray(data) ? data.length : rows.length, rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ---- 6) worklist -----------------------------------------------------------
// SELECT ordered by score desc, optionally filtered by status/actionType. Graceful.
export async function worklist(siteId, { status, actionType, limit = 50 } = {}) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured.', items: [] };
  const parts = [`site_id=eq.${encodeURIComponent(siteId)}`, 'select=*', 'order=score.desc', `limit=${Math.min(Math.max(Number(limit) || 50, 1), 500)}`];
  if (status) parts.push(`status=eq.${encodeURIComponent(status)}`);
  if (actionType) parts.push(`action_type=eq.${encodeURIComponent(actionType)}`);
  try {
    const res = await fetch(`${SB}/rest/v1/content_opportunities?${parts.join('&')}`, { headers: headers() });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return { ...NOT_PROVISIONED, items: [] };
      return { error: `content_opportunities read → ${res.status} ${text.slice(0, 200)}`, items: [] };
    }
    let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
    return { items: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: String(e.message || e), items: [] };
  }
}

// ---- 7) setStatus / dismiss ------------------------------------------------
export async function setStatus(id, status) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured.' };
  try {
    const res = await fetch(`${SB}/rest/v1/content_opportunities?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return NOT_PROVISIONED;
      return { error: `content_opportunities patch → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { updated: true, item: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export async function dismiss(id) { return setStatus(id, 'dismissed'); }

// ---- 8) mirrorToAirtable ---------------------------------------------------
// OPTIONAL best-effort: if the site has an Airtable PAT + base configured,
// upsert a unified "Content Command" table (Title, Source(s), Action, Score,
// Intent, Status, Keyword). De-dupes by Title against the existing column so
// re-runs don't create duplicate rows. Skips silently if Airtable isn't set up.
const CONTENT_COMMAND_TABLE = 'Content Command';
const CONTENT_COMMAND_SCHEMA = [
  { name: 'Title', type: 'singleLineText' },
  { name: 'Keyword', type: 'singleLineText' },
  { name: 'Source(s)', type: 'singleLineText' },
  { name: 'Action', type: 'singleLineText' },
  { name: 'Intent', type: 'singleLineText' },
  { name: 'Score', type: 'number', options: { precision: 2 } },
  { name: 'Status', type: 'singleLineText' },
  { name: 'Synced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
];

export async function mirrorToAirtable(siteId, opps) {
  const list = (opps || []).filter((o) => o && o.title);
  if (!list.length) return { skipped: true, reason: 'no opportunities' };
  let pat = null, cfg = null;
  try { pat = await db.getAirtablePat(siteId); } catch (e) { pat = null; }
  try { cfg = await db.getAirtableConfig(siteId); } catch (e) { cfg = null; }
  if (!pat || !cfg || !cfg.base_id) return { skipped: true, reason: 'Airtable not configured' };
  const baseId = cfg.base_id;
  const table = (cfg && cfg.table_content_command) || CONTENT_COMMAND_TABLE;

  try {
    // Ensure the table exists (needs schema.bases:write; falls through if not).
    await airtable.ensureTable(pat, baseId, table, CONTENT_COMMAND_SCHEMA).catch(() => {});
    // De-dupe by Title against what's already there.
    let existing = new Set();
    try { existing = await airtable.listFieldValues(pat, baseId, table, 'Title'); } catch (e) {}
    const now = new Date().toISOString();
    const rows = [];
    for (const o of list) {
      const title = cleanTitle(o.title);
      if (!title || existing.has(title.toLowerCase())) continue;
      const srcs = [...new Set((o.evidence || []).map((e) => e && e.source).filter(Boolean))];
      rows.push({
        Title: title,
        Keyword: o.primaryKeyword || '',
        'Source(s)': (srcs.length ? srcs : [o.source]).join(', '),
        Action: o.actionType || 'article',
        Intent: o.intent || '',
        Score: Number(o.score) || 0,
        Status: 'To Do',
        'Synced At': now,
      });
    }
    if (!rows.length) return { mirrored: 0, skipped: false };
    const mirrored = await airtable.createRecords(pat, baseId, table, rows);
    return { mirrored };
  } catch (e) {
    // Airtable mirror is strictly best-effort — never break the run.
    return { skipped: true, reason: String(e.message || e) };
  }
}

// ---- 9) run ----------------------------------------------------------------
// ingest → persist → mirrorToAirtable. Returns a compact summary with counts
// by action + by source. Surfaces notProvisioned so the caller can prompt the
// operator to run the migration.
export async function run(siteId, opts = {}) {
  const ing = await ingest(siteId, opts);
  if (ing && ing.error && !(ing.opps && ing.opps.length)) return { error: ing.error, count: 0, sources: ing.sources || {} };
  const opps = ing.opps || [];

  const byAction = {}; const bySource = {};
  for (const o of opps) {
    byAction[o.actionType] = (byAction[o.actionType] || 0) + 1;
    bySource[o.source] = (bySource[o.source] || 0) + 1;
  }

  const saved = await persist(siteId, opps);
  const out = { count: opps.length, byAction, bySource, sources: ing.sources || {} };
  if (saved && saved.notProvisioned) out.notProvisioned = true;
  else if (saved && saved.error) out.persistError = saved.error;
  else out.saved = saved.saved;

  // Airtable mirror never blocks the run.
  if (opts.mirror !== false) {
    const m = await mirrorToAirtable(siteId, opps).catch((e) => ({ skipped: true, reason: String(e.message || e) }));
    out.airtable = m;
  }
  return out;
}

export default { ingest, dedupeKey, tokens, score, persist, worklist, setStatus, dismiss, mirrorToAirtable, run };
