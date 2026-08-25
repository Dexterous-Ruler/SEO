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
import * as claude from './claude.js';
import * as drift from './drift.js';
import feeds from './feeds.js';

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
// Whole-word match against a site's negative (excluded) terms — "visa" blocks "spouse visa"
// but not "advisable". negs are pre-lowercased.
function hitsNeg(text, negs) {
  if (!negs || !negs.length) return false;
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  return negs.some((n) => {
    if (!n) return false;
    let i = -1;
    while ((i = t.indexOf(n, i + 1)) !== -1) { const b = t[i - 1], a = t[i + n.length]; if (!/[a-z0-9]/.test(b) && !/[a-z0-9]/.test(a)) return true; }
    return false;
  });
}
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
    // Key on the KEYWORD first: titles are AI-regenerated per run ("UK Business
    // Structures: Sole Trader vs Limited Company" vs "…Explained: Sole Trader vs…"),
    // so a title-derived key re-admitted the same topic every weekly refresh. The
    // primary keyword is stable across runs.
    dedupeKey: dedupeKey(primaryKeyword || t || ''),
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

  // Excluded-area guard: a topic matching the site's negative_keywords is OFF-niche whatever
  // tokens it shares with the context. The niche context often NAMES excluded practice areas
  // ("does not do immigration/conveyancing…") to warn the writer off them, which the token
  // overlap above would otherwise REWARD — so sink anything that hits a negative.
  const negs = (site && site.__negatives) || [];
  const negHit = hitsNeg(opp.title || opp.primaryKeyword, negs);
  const negPenalty = negHit ? 0.03 : 1;

  const raw = baseline * nicheFit * actionVal * freshness * gapBonus * multiSrc * negPenalty;
  const value = Math.round(raw * 100) / 100;
  opp.scoreBreakdown = {
    baseline: Math.round(baseline * 100) / 100,
    volume,
    nicheFit: Math.round(nicheFit * 100) / 100,
    nicheHitFrac: Math.round(fitFrac * 100) / 100,
    actionVal, freshness, gapBonus, multiSrc, nSources, negHit,
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

export function dedupeMerge(opps) {
  const byKey = new Map();
  let anon = 0;
  for (const o of opps) {
    if (!o) continue;
    // dedupeKey can reduce to '' for all-stopword/short titles ("What is it?").
    // Don't drop those — fall back to a stable signature (normalized full title,
    // then primaryKeyword, then a unique id) so they still surface downstream.
    const key = o.dedupeKey
      || cleanTitle(o.title || '').toLowerCase()
      || String(o.primaryKeyword || '').toLowerCase().trim()
      || `__anon_${anon++}`;
    o.dedupeKey = key;   // write back the fallback so persist()/mirror dedupe on the SAME key we counted (else a zero-token opp is counted+mirrored but dropped from the saved worklist)
    const cur = byKey.get(key);
    if (cur) mergeInto(cur, o);
    else byKey.set(key, o);
  }
  return [...byKey.values()];
}

// ---- 3b) fuzzy merge (near-duplicate topics across sources) ----------------
// Exact dedupeMerge only collapses IDENTICAL token-sets. This second pass merges
// NEAR-duplicates a cross-source worklist would otherwise duplicate — e.g. a
// "self assessment tax return" keyword cluster and a "how to file a self
// assessment" PAA question. Two items merge when their significant-token sets
// overlap by Jaccard >= 0.6 AND share >= 2 core tokens (the second guard stops
// tiny sets fusing on one common word). Conservative by design — better to
// under-merge than wrongly fuse two distinct topics. mergeInto concatenates the
// evidence, so the multi-source bonus applies when the caller re-scores.
function tokenSet(o) { return new Set(tokens((o.title || '') + ' ' + (o.primaryKeyword || ''))); }
function jaccard(a, b) { let inter = 0; for (const t of a) if (b.has(t)) inter++; const uni = a.size + b.size - inter; return uni ? inter / uni : 0; }
export function fuzzyMerge(opps) {
  const clusters = [];   // { rep, toks }
  for (const o of opps) {
    const toks = tokenSet(o);
    let best = null, bestSim = 0;
    for (const c of clusters) { const sim = jaccard(toks, c.toks); if (sim > bestSim) { bestSim = sim; best = c; } }
    let shared = 0; if (best) for (const t of toks) if (best.toks.has(t)) shared++;
    if (best && bestSim >= 0.6 && shared >= 2) {
      mergeInto(best.rep, o);
      for (const t of toks) best.toks.add(t);   // widen so later items match the merged topic
    } else {
      clusters.push({ rep: o, toks });
    }
  }
  return clusters.map((c) => c.rep);
}

// ---- 1) ingest -------------------------------------------------------------
// Call every producer (best-effort), normalize into common records, dedupe +
// merge, then score. Returns { opps, sources } where sources is per-producer
// diagnostics (count or error) so a partial run is transparent.
export async function ingest(siteId, { db: region, includeTrending = true, includePaa = true, includeGeo = false } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'Site not found.', opps: [], sources: {} };
  const nicheCtx = geoFor(siteId) || '';
  const negatives = (Array.isArray(site.negative_keywords) ? site.negative_keywords : []).map((n) => String(n || '').toLowerCase().trim()).filter(Boolean);
  const scoreSite = { id: siteId, __nicheCtx: nicheCtx, __negatives: negatives };
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
  // Belt-and-suspenders: drop any producer's items (trending / PAA / AI-visibility) that land
  // in the site's EXCLUDED areas, so off-niche topics can't reach the queue at all.
  const cleaned = negatives.length ? raw.filter((o) => !hitsNeg(o.title || o.primaryKeyword, negatives)) : raw;
  if (negatives.length) sources.negativesDropped = raw.length - cleaned.length;
  const merged = fuzzyMerge(dedupeMerge(cleaned));
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

// ---- 5b) FEEDS producer (Content Radar) ------------------------------------
// The Google-Alerts-style lane: fetch each of a site's radar sources (Google
// Alert RSS, an outlet's RSS, or a Google News query), turn every fresh article
// into a scored content_opportunity (source 'feeds'), deduped by the article URL
// so re-polling never piles up the same story. These flow into the SAME queue as
// keyword/PAA/trending opportunities, niche-scored against the site's geo_context
// (off-niche news sinks), and are drafted into the Article Writer one click each.
// `sources` = [{ id, type:'google_alert'|'outlet_rss'|'google_news', url?, query?, label?, active? }].
// Compact, stable hash of a URL → short dedupe key (djb2 + length, base36).
function feedHash(s) { let h = 5381; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36) + str.length.toString(36); }

export async function ingestFeeds(siteId, sources) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'Site not found.', saved: 0 };
  const scoreSite = { id: siteId, __nicheCtx: geoFor(siteId) || '', __negatives: (Array.isArray(site.negative_keywords) ? site.negative_keywords : []).map((n) => String(n || '').toLowerCase().trim()).filter(Boolean) };
  const active = (sources || []).filter((s) => s && s.active !== false);
  const perSource = [];
  const raw = [];
  for (const src of active) {
    const url = feeds.sourceToUrl(src);
    if (!url) { perSource.push({ id: src.id, label: src.label, error: 'no feed URL' }); continue; }
    const r = await feeds.fetchFeed(url).catch((e) => ({ error: String((e && e.message) || e), items: [] }));
    if (r.error) { perSource.push({ id: src.id, label: src.label || url, error: r.error, items: 0 }); continue; }
    // Feeds are reverse-chronological; keep the freshest 40 per source so a busy
    // Google News query doesn't flood the queue with stale back-catalogue.
    const its = (r.items || []).slice(0, 40);
    perSource.push({ id: src.id, label: src.label || r.feedTitle || url, items: its.length });
    for (const it of its) {
      if (!it.title || !it.link) continue;
      const o = makeOpp(siteId, {
        source: 'feeds',
        sourceRef: src.id,
        title: it.title,
        primaryKeyword: it.title,
        intent: 'informational',
        actionType: 'article',
        evidence: [{ source: 'feeds', detail: `${src.label || r.feedTitle || 'feed'}${it.published ? ' · ' + String(it.published).slice(0, 10) : ''}` }],
        payload: { link: it.link, summary: it.summary || '', published: it.published || null, sourceLabel: src.label || r.feedTitle || '', sourceType: src.type || 'outlet_rss', sourceId: src.id, guid: it.guid || it.link, trending: true },
      });
      // Dedupe on the article URL (stable), NOT the title — the same story keeps
      // the same link across polls, so the upsert merges instead of duplicating.
      // HASH the URL to a short key: persist() pre-reads existing keys with a
      // `dedupe_key=in.(...)` query, and dozens of full-URL keys blow past the URL
      // length limit ("fetch failed"). A compact hash keeps that query small.
      const canon = String(it.link || it.guid || it.title).replace(/[#?].*$/, '').toLowerCase();
      o.dedupeKey = 'feed:' + feedHash(canon);
      score(o, scoreSite);
      raw.push(o);
    }
  }
  const merged = dedupeMerge(raw);
  const res = await persist(siteId, merged);
  return { saved: res.saved || 0, error: res.error, notProvisioned: res.notProvisioned, fetched: raw.length, unique: merged.length, perSource };
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
export async function worklist(siteId, { status, actionType, source, limit = 50 } = {}) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured.', items: [] };
  const parts = [`site_id=eq.${encodeURIComponent(siteId)}`, 'select=*', 'order=score.desc', `limit=${Math.min(Math.max(Number(limit) || 50, 1), 500)}`];
  if (status) parts.push(`status=eq.${encodeURIComponent(status)}`);
  if (actionType) parts.push(`action_type=eq.${encodeURIComponent(actionType)}`);
  if (source) parts.push(`source=eq.${encodeURIComponent(source)}`);
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

// Purge saved opportunities that fall in the site's EXCLUDED areas (negative_keywords).
// Needed because the niche-bleed fix only stops NEW off-niche items — rows saved before it
// (e.g. 35 immigration topics on a disputes firm) linger in the worklist until cleared.
// Whole-word matched, service-role delete, re-runnable whenever the negatives change.
export async function cleanNegatives(siteId) {
  if (!SB || !SRV) return { error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE).' };
  const site = await db.getSite(siteId).catch(() => null);
  const negatives = (site && Array.isArray(site.negative_keywords) ? site.negative_keywords : []).map((n) => String(n || '').toLowerCase().trim()).filter(Boolean);
  if (!negatives.length) return { deleted: 0, scanned: 0, note: 'No excluded areas set for this site — add negative keywords first.' };
  let rows = [];
  try {
    const res = await fetch(`${SB}/rest/v1/content_opportunities?site_id=eq.${encodeURIComponent(siteId)}&select=id,title,primary_keyword`, { headers: headers() });
    const text = await res.text();
    if (!res.ok) { if (isMissingTable(res.status, text)) return NOT_PROVISIONED; return { error: `read → ${res.status} ${text.slice(0, 150)}` }; }
    rows = JSON.parse(text) || [];
  } catch (e) { return { error: String(e.message || e) }; }
  const hit = rows.filter((r) => hitsNeg((r.title || '') + ' ' + (r.primary_keyword || ''), negatives));
  if (!hit.length) return { deleted: 0, scanned: rows.length };
  const ids = hit.map((r) => `"${String(r.id).replace(/"/g, '')}"`).join(',');
  try {
    const res = await fetch(`${SB}/rest/v1/content_opportunities?id=in.(${encodeURIComponent(ids)})`, { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }) });
    const text = await res.text();
    if (!res.ok) return { error: `delete → ${res.status} ${text.slice(0, 150)}` };
    let data; try { data = JSON.parse(text); } catch { data = []; }
    return { deleted: Array.isArray(data) ? data.length : hit.length, scanned: rows.length };
  } catch (e) { return { error: String(e.message || e) }; }
}

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

  // Distinguish a clean run that genuinely found nothing new from a run where
  // every producer errored (no DataForSEO key, GSC down, no competitors, Claude
  // error, …). If nothing was ingested AND every source that ran reported an
  // error, this is a broken/misconfigured run, not an empty one — surface it as
  // an error so the operator gets a real diagnostic instead of a reassuring
  // green "no opportunities" toast.
  const srcEntries = Object.entries(ing.sources || {});
  const failedSrc = srcEntries.filter(([, s]) => s && s.error);
  if (opps.length === 0 && srcEntries.length > 0 && failedSrc.length === srcEntries.length) {
    out.allSourcesFailed = true;
    out.error = 'All content sources failed — ' + failedSrc.map(([k, s]) => `${k}: ${s.error}`).join('; ');
  }

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

// ---- 10) async run (fire-and-forget) --------------------------------------
// The full pipeline (DataForSEO + GSC + Claude cluster + Perplexity + PAA) runs
// longer than the edge gateway's sync-response cap, so a blocking /engine-run
// 504s even though the work completes. startRun kicks it off in the background
// and tracks status in-process; the UI polls runStatus and reloads the worklist
// when done. (Node keeps the promise alive after the HTTP response returns.)
const RUNS = new Map();   // siteId -> { status, startedAt, finishedAt, count, ... }
export function startRun(siteId, opts = {}) {
  if (!siteId) return { error: 'No site selected.' };
  const prev = RUNS.get(siteId);
  if (prev && prev.status === 'running') return { started: false, alreadyRunning: true, status: 'running', startedAt: prev.startedAt };
  RUNS.set(siteId, { status: 'running', startedAt: Date.now() });
  run(siteId, opts)
    .then((r) => RUNS.set(siteId, { status: r.error ? 'error' : 'done', startedAt: (RUNS.get(siteId) || {}).startedAt, finishedAt: Date.now(), count: r.count, byAction: r.byAction, bySource: r.bySource, saved: r.saved, notProvisioned: r.notProvisioned, airtable: r.airtable, sources: r.sources, allSourcesFailed: r.allSourcesFailed, error: r.error }))
    .catch((e) => RUNS.set(siteId, { status: 'error', finishedAt: Date.now(), error: String(e.message || e) }));
  return { started: true, status: 'running' };
}
// Not in the map = either never run this process, OR the run was lost to a restart
// (the map is in-memory). The UI only polls this AFTER a started:true, so a miss during
// a poll means "lost" — return a distinct 'unknown' so the UI can say "re-run" instead
// of falling through to a false "no opportunities".
export function runStatus(siteId) { return RUNS.get(siteId) || { status: 'unknown', reason: 'no active run — it may have completed or been lost to a restart; re-run' }; }

// ---- 11) autoDraft ---------------------------------------------------------
// One-click "queue for writing": take the top-N SCORED opportunities and hand
// them to the EXISTING Article Writer pipeline — the ONE n8n-watched Airtable
// table (stored as cfg.table_gaps, id tblVTpv8JG5lZRiF2). We DON'T rebuild the
// writer: we map each opportunity into that table's row shape via
// airtable.mapArticleBrief (Title + Keyword + Content Brief), de-dupe by Keyword
// (case-insensitive) against what's already there, push, then flip the pushed
// rows' status → 'queued' in Supabase so they leave the "scored" backlog. The
// n8n flow watches the table and does the actual generate+publish (its Status
// column is left for the operator to flip to the write trigger — a click here
// never auto-fires generation). HEAVY (Airtable read+write). Graceful:
//   • notProvisioned  → content_opportunities table missing
//   • { skipped, reason } → no Airtable / no Article Writer table / nothing to draft
// Rebuild a cluster-ish object from a persisted opportunity row (payload carries
// the original cluster detail: keywords, volume, format, gap/coverage).
function oppToCluster(row) {
  const p = (row && row.payload && typeof row.payload === 'object') ? row.payload : {};
  return {
    suggestedTitle: row.title || p.suggestedTitle || null,
    label: p.label || row.cluster_key || null,
    primaryKeyword: row.primary_keyword || p.primaryKeyword || null,
    keyword: row.primary_keyword || p.primaryKeyword || null,
    intent: row.intent || p.intent || null,
    format: p.format || null,
    totalVolume: p.totalVolume || 0,
    keywords: Array.isArray(p.keywords) ? p.keywords : [],
    isGap: !!p.isGap,
    coveringUrl: p.coveringUrl || null,
  };
}

// Patch arbitrary columns on one opportunity (status + payload etc.). Graceful.
async function updateOpp(id, patch) {
  const body = Object.assign({}, patch, { updated_at: new Date().toISOString() });
  let res;
  try { res = await fetch(`${SB}/rest/v1/content_opportunities?id=eq.${id}`, { method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(body) }); }
  catch (e) { return { error: String(e.message || e) }; }
  const text = await res.text();
  if (isMissingTable(res.status, text)) return { ...NOT_PROVISIONED };
  if (!res.ok) return { error: `update ${res.status}` };
  let rows = []; try { rows = JSON.parse(text); } catch (e) {}
  return { updated: true, item: rows[0] };
}

// Answer-block opportunities: GENERATE the answer-first block with claude.answerBlock
// (best-effort per item), stash it on payload.draft, and move to 'in_review' so the
// operator can review + apply it. Does NOT touch the Article Writer.
async function draftAnswerBlocks(siteId, n) {
  const wl = await worklist(siteId, { status: 'scored', actionType: 'answer_block', limit: n });
  if (wl && wl.notProvisioned) return { ...NOT_PROVISIONED, drafted: 0, inReview: 0 };
  const items = (wl.items || []).slice(0, n);
  if (!items.length) return { drafted: 0, inReview: 0, skipped: true, reason: 'no scored answer-block opportunities' };
  const site = await db.getSite(siteId).catch(() => null);
  let inReview = 0, failed = 0;
  for (const it of items) {
    try {
      const block = await claude.answerBlock({ url: site && site.url, title: it.title, query: it.primary_keyword || it.title, siteId });
      if (block && !block.error && (block.answer || block.heading)) {
        const payload = Object.assign({}, it.payload || {}, { draft: block });
        const u = await updateOpp(it.id, { status: 'in_review', payload });
        if (u && u.updated) inReview++; else failed++;
      } else { failed++; }
    } catch (e) { failed++; }
  }
  return { drafted: inReview, inReview, failed, candidates: items.length, kind: 'answer_block' };
}

export async function autoDraft(siteId, { topN = 5, actionType, ids } = {}) {
  if (!siteId) return { error: 'No site selected.' };
  const n = Math.min(Math.max(Number(topN) || 5, 1), 50);
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : []);

  // Answer-block BULK drafting stays in-place; but an explicit per-row id push always
  // goes to the Article Writer (user clicked "Push" on that specific opportunity).
  if (actionType === 'answer_block' && !idList.length) return await draftAnswerBlocks(siteId, n);

  let items;
  if (idList.length) {
    // Explicit per-row push: pull the full worklist (any status) and pick the chosen ids —
    // a row the user clicked should always go, regardless of score/status.
    const wl = await worklist(siteId, { limit: 500 });
    if (wl && wl.notProvisioned) return { ...NOT_PROVISIONED, drafted: 0 };
    if (wl && wl.error && !(wl.items && wl.items.length)) return { error: wl.error, drafted: 0 };
    const idSet = new Set(idList);
    items = (wl.items || []).filter((it) => idSet.has(it.id)).slice(0, 50);
    if (!items.length) return { drafted: 0, skipped: true, reason: 'selected opportunity not found' };
  } else {
    // 1) Top SCORED opportunities (highest score first). Over-fetch (n×4) BEFORE the
    //    article-only filter — slicing to n first meant answer_block/geo rows consumed
    //    the batch and could shrink an "auto-draft top 5" to 2 or 0 articles.
    const wl = await worklist(siteId, { status: 'scored', actionType, limit: n * 4 });
    if (wl && wl.notProvisioned) return { ...NOT_PROVISIONED, drafted: 0 };
    if (wl && wl.error && !(wl.items && wl.items.length)) return { error: wl.error, drafted: 0 };
    // Article path only: never push an answer_block/geo item to the Article Writer,
    // even if actionType was left blank.
    items = (wl.items || []).filter((it) => it.action_type !== 'answer_block' && it.action_type !== 'geo').slice(0, n);
    if (!items.length) return { drafted: 0, skipped: true, reason: 'no scored article opportunities to draft' };
  }

  // 2) Resolve the Article Writer table — the ONE n8n-watched table (cfg.table_gaps).
  let pat = null, cfg = null;
  try { pat = await db.getAirtablePat(siteId); } catch (e) { pat = null; }
  try { cfg = await db.getAirtableConfig(siteId); } catch (e) { cfg = null; }
  if (!pat || !cfg || !cfg.base_id) return { drafted: 0, skipped: true, reason: 'Airtable not configured', candidates: items.length };
  if (!cfg.table_gaps) return { drafted: 0, skipped: true, reason: 'No Article Writer table configured (table_gaps)', candidates: items.length };
  const baseId = cfg.base_id;

  let tables = [];
  try { tables = await airtable.listTables(pat, baseId); } catch (e) { tables = []; }
  const tbl = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
  if (!tbl) return { drafted: 0, skipped: true, reason: 'Configured Article Writer table no longer exists', candidates: items.length };

  // Ensure a long-text "Content Brief" column (folds into Description if it can't be created).
  const names = new Set((tbl.fields || []).map((f) => f.name));
  let briefField = 'Content Brief';
  if (!names.has('Content Brief')) { try { briefField = await airtable.ensureField(pat, baseId, tbl.id, 'Content Brief', 'multilineText'); } catch (e) { briefField = null; } }
  if (briefField) names.add(briefField);

  // 3) Map each opportunity → an Article Writer row (Title + Keyword + brief),
  //    field-set-filtered so a differing per-site schema can't 422.
  const rowById = new Map();   // opportunity id → { row, keyword }
  for (const it of items) {
    const cluster = oppToCluster(it);
    const brief = (it.payload && it.payload.brief && typeof it.payload.brief === 'object') ? it.payload.brief : {};
    const row = airtable.mapArticleBrief(cluster, brief, briefField, names);
    if (row && row.Keyword) rowById.set(it.id, { row, keyword: String(row.Keyword).trim().toLowerCase() });
  }
  if (!rowById.size) return { drafted: 0, skipped: true, reason: 'nothing mappable to draft', candidates: items.length };

  // De-dupe by Keyword (case-insensitive) against rows already in the table.
  const existing = new Set();
  try {
    let offset;
    do {
      const page = await airtable.listRecords(pat, baseId, tbl.id, { pageSize: 100, offset, fields: ['Keyword'] });
      for (const rec of (page.records || [])) { const v = String((rec.fields || {}).Keyword || '').trim().toLowerCase(); if (v) existing.add(v); }
      offset = page.offset;
    } while (offset);
  } catch (e) { /* read failed → treat as none existing */ }

  const toCreate = [], draftedIds = [], dupIds = [], seen = new Set();
  let skippedDup = 0;
  for (const [id, { row, keyword }] of rowById) {
    if (keyword && (existing.has(keyword) || seen.has(keyword))) { skippedDup++; dupIds.push(id); continue; }
    if (keyword) seen.add(keyword);
    toCreate.push(row);
    draftedIds.push(id);
  }
  // A duplicate IS in the writer already — flip it to 'queued' so it stops squatting
  // in the scored top-N window. (Previously it stayed 'scored' forever, and once the
  // top N were all dups, auto-draft never drafted anything again — the auto-pilot wedge.)
  for (const id of dupIds) await setStatus(id, 'queued').catch(() => null);
  if (!toCreate.length) return { drafted: 0, skipped: true, reason: 'all candidates already in Article Writer table (now marked queued)', candidates: items.length, skippedDup };

  // 4) Push to the n8n-watched table, then flip the drafted opportunities → 'queued'.
  let pushed = 0;
  try { pushed = await airtable.createRecords(pat, baseId, tbl.id, toCreate); }
  catch (e) { return { error: `Article Writer push → ${String(e.message || e)}`, drafted: 0, candidates: items.length }; }

  let queued = 0;
  for (const id of draftedIds) { const r = await setStatus(id, 'queued').catch(() => null); if (r && r.updated) queued++; }

  return { drafted: pushed, queued, skippedDup, candidates: items.length, table: tbl.name };
}

// ---- 12) syncPublished -----------------------------------------------------
// Close the loop opposite autoDraft. autoDraft pushes opportunities INTO the
// n8n-watched Article Writer table (cfg.table_gaps) and flips them → 'queued';
// the n8n flow generates + publishes, then back-writes a Status like "Article
// Complete" + a published URL onto that same row. syncPublished reads those
// completed rows, matches each back to a still-open opportunity by Keyword
// (case-insensitive — the same key autoDraft de-dupes on), advances it
// 'queued'/'in_review' → 'published', and captures a drift.checkDrift baseline
// for the published URL so future drift checks have something to diff against.
// HEAVY (Airtable read + one page-snapshot per published URL). Graceful:
//   • notProvisioned  → content_opportunities table missing
//   • { skipped, reason } → no Airtable / no Article Writer table
// A row is "complete" when its Status matches DONE_STATUS and it carries a URL.
const DONE_STATUS = /article\s*complete|complete|published|done/i;

// Is this URL a genuinely-live published article, or a draft masquerading as done? The
// n8n "Wordpress make post" node has no status param, so it defaults to DRAFT; a draft's
// ?p=<id> URL 301s to the homepage for logged-out visitors (or 404s). Marking that
// "published" — and drift-baselining the redirect — recorded the site HOMEPAGE as the
// article. Confirm the URL resolves 200 to something other than the site root.
async function isLivePublished(url, siteRoot) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try { res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelBot/2.0)' }, signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res || !res.ok) return false;
    const norm = (u) => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    const finalUrl = norm(res.url || url);
    const root = norm(siteRoot);
    if (root && (finalUrl === root)) return false;      // 301'd to homepage → not really published
    if (/[?&](p|page_id)=\d+/.test(res.url || url)) return false;  // stayed a bare guid → draft/private
    return true;
  } catch (e) { return false; }
}
const URL_FIELDS = ['Published URL', 'Published Url', 'URL', 'Url', 'Link', 'Article URL', 'Published Link'];
function firstUrl(fields) {
  for (const k of URL_FIELDS) {
    const v = fields && fields[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  // Fall back: any field whose value looks like an http(s) URL.
  for (const v of Object.values(fields || {})) {
    if (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim())) return v.trim();
  }
  return null;
}

export async function syncPublished(siteId) {
  if (!siteId) return { error: 'No site selected.' };

  // 1) Still-open opportunities we could mark published, keyed by Keyword.
  //    We only advance rows currently 'queued' or 'in_review' (autoDraft set
  //    'queued'; an operator may have moved some to 'in_review').
  const openByKw = new Map();   // keyword(lower) → opportunity row
  for (const status of ['queued', 'in_review']) {
    const wl = await worklist(siteId, { status, limit: 500 });
    if (wl && wl.notProvisioned) return { ...NOT_PROVISIONED, published: 0 };
    for (const it of (wl.items || [])) {
      const kw = String(it.primary_keyword || '').trim().toLowerCase();
      if (kw && !openByKw.has(kw)) openByKw.set(kw, it);
    }
  }

  // 2) Resolve the Article Writer table (cfg.table_gaps) — same one autoDraft writes.
  let pat = null, cfg = null;
  try { pat = await db.getAirtablePat(siteId); } catch (e) { pat = null; }
  try { cfg = await db.getAirtableConfig(siteId); } catch (e) { cfg = null; }
  if (!pat || !cfg || !cfg.base_id) return { published: 0, skipped: true, reason: 'Airtable not configured', candidates: openByKw.size };
  if (!cfg.table_gaps) return { published: 0, skipped: true, reason: 'No Article Writer table configured (table_gaps)', candidates: openByKw.size };
  const baseId = cfg.base_id;

  let tables = [];
  try { tables = await airtable.listTables(pat, baseId); } catch (e) { tables = []; }
  const tbl = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
  if (!tbl) return { published: 0, skipped: true, reason: 'Configured Article Writer table no longer exists', candidates: openByKw.size };

  // 3) Scan the table for completed rows (Status matches + has a URL). Paginate.
  const completed = [];   // { keyword, url }
  try {
    let offset;
    do {
      const page = await airtable.listRecords(pat, baseId, tbl.id, { pageSize: 100, offset });
      for (const rec of (page.records || [])) {
        const f = rec.fields || {};
        const status = String(f.Status || f.status || '');
        if (!DONE_STATUS.test(status)) continue;
        const url = firstUrl(f);
        if (!url) continue;
        const kw = String(f.Keyword || f.keyword || '').trim().toLowerCase();
        if (kw) completed.push({ keyword: kw, url });
      }
      offset = page.offset;
    } while (offset);
  } catch (e) {
    return { published: 0, skipped: true, reason: `Article Writer read → ${String(e.message || e)}`, candidates: openByKw.size };
  }

  // 4) Match completed rows → open opportunities by Keyword; advance to
  //    'published' and capture a drift baseline for the published URL.
  const siteRow = await db.getSite(siteId).catch(() => null);
  const siteRoot = siteRow && siteRow.url ? String(siteRow.url) : '';
  let published = 0, baselines = 0, skippedNotLive = 0;
  const seenKw = new Set(), seenUrl = new Set();
  const errors = [];
  for (const { keyword, url } of completed) {
    if (seenKw.has(keyword)) continue;
    seenKw.add(keyword);
    const opp = openByKw.get(keyword);
    if (!opp) continue;   // completed article with no matching open opportunity — ignore.

    // Verify it's genuinely live before advancing (and before drift-baselining a redirect).
    // A draft stays 'queued' — nothing is lost, and it advances on the next sync once live.
    if (!(await isLivePublished(url, siteRoot))) { skippedNotLive++; continue; }

    const patched = await setStatus(opp.id, 'published').catch((e) => ({ error: String(e.message || e) }));
    if (patched && patched.notProvisioned) return { ...NOT_PROVISIONED, published };
    if (!(patched && patched.updated)) { if (patched && patched.error) errors.push(patched.error); continue; }
    published++;

    // Drift baseline — best-effort, never blocks the status advance. One per URL.
    if (!seenUrl.has(url)) {
      seenUrl.add(url);
      const d = await drift.checkDrift(siteId, url).catch((e) => ({ error: String(e.message || e) }));
      if (d && (d.baselineSet || d.rebaselined || d.drift)) baselines++;
      else if (d && d.error) errors.push(`drift ${url} → ${d.error}`);
    }
  }

  const out = { published, baselines, completed: completed.length, candidates: openByKw.size, table: tbl.name };
  if (skippedNotLive) out.skippedNotLive = skippedNotLive;   // done in Airtable but the URL isn't live (draft) — left queued
  if (errors.length) out.errors = errors.slice(0, 10);
  return out;
}

export default { ingest, dedupeKey, tokens, score, persist, worklist, setStatus, dismiss, mirrorToAirtable, run, startRun, runStatus, autoDraft, syncPublished, fuzzyMerge };
