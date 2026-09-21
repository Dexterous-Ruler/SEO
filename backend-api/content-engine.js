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
import { marketFor } from './market.js';
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
  const market = marketFor(site.semrush_db);   // scope google_news sources to the site's country/language
  const active = (sources || []).filter((s) => s && s.active !== false);
  const perSource = [];
  const raw = [];
  for (const src of active) {
    const url = feeds.sourceToUrl(src, market);
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

// ---- competitor-sitemap producer (source 'competitor_sitemap') -------------
// Karim's ask: "scrape/upload a competitor's sitemap and give me articles to write
// and out-rank them." Walk each competitor's sitemap, turn every content URL into a
// niche-scored opportunity (their topic → our page), deduped by URL. These flow into
// the SAME Content Engine worklist as every other opportunity, niche-scored against
// geo_context (off-niche/excluded topics sink) and one-click draftable to the writer.
// Titles come from the URL slug (cheap, no per-page fetch); volume is unknown so these
// rely on niche-fit + the "competitor covers this" signal, complementing keywordGap
// (which already gives ranked they-rank-we-don't keywords with volume).
function slugTitle(u) {
  try {
    const seg = decodeURIComponent(new URL(u).pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '');
    if (!seg) return '';
    return seg.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  } catch { return ''; }
}
// Skip a competitor's non-article pages (site chrome, legal boilerplate, listings,
// auth/commerce, media) so the list is what they PUBLISH, not their nav.
const CSM_NONCONTENT = /\/(wp-content|wp-admin|wp-json|wp-includes|cart|checkout|my-account|account|login|log-in|signin|sign-in|signup|sign-up|register|tag|tags|category|categories|author|feed|comments|attachment|page\/\d+|search|sitemap|about|about-us|contact|contact-us|pricing|plans|privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|cookie|cookies|cookie-policy|careers|jobs|team|our-team|faq|faqs|support|help|demo|book-a-demo|press|partners|affiliates|thank-you|thanks|unsubscribe|legal-notice|disclaimer|refund|shipping|testimonials|reviews|features|integrations|changelog|status)(\/|$|\?|#)/i;
// A competitor's homepage / bare section index is not an article either.
function isIndexUrl(u) { try { const p = new URL(u).pathname.replace(/\/+$/, ''); return p.split('/').filter(Boolean).length === 0; } catch { return true; } }

// Auto-categorise a competitor topic for THIS site's content types (the same values
// the dashboard's "Create as" picker uses → airtable.normalizeCategory). Heuristic on
// the slug/title — good enough as a default the user can change before pushing.
function suggestTypeFor(site, title, url) {
  const t = (String(title || '') + ' ' + String(url || '')).toLowerCase();
  const n = ((site && site.name) || '') + ' ' + ((site && site.url) || '');
  if (/go-?legal\.ai/i.test(n)) {
    if (/how[\s-]?to|step[\s-]?by[\s-]?step|guide|tutorial|checklist for/.test(t)) return 'how-to-guide';
    if (/template|agreement|contract|\bform\b|\bletter\b|notice|policy|\bdeed\b|clause|nda|terms of|checklist|generator|\bwill\b|invoice/.test(t)) return 'smart_template';
    if (/what is|what are|meaning|definition|glossary|explained|difference between|\bvs\b|versus|defined/.test(t)) return 'legal_definition';
    if (/pathway|process|procedure|steps to|how does .* work|claim|dispute|litigation|tribunal|court|appeal|complaint/.test(t)) return 'legal_pathway';
    return 'blog';
  }
  if (/good\s?for/i.test(n)) {
    if (/recipe|how to make|how to cook|ingredients for|homemade|\bbake\b|baked|roast|smoothie|salad|soup|curry|pasta|breakfast|dinner|dessert/.test(t)) return 'recipe';
    if (/what is|is .* (good|bad) for|benefits of|side effects|meaning|definition|explained|ingredient/.test(t)) return 'definition';
    return 'blog';
  }
  // Law-firm / service sites (go-legal.co.uk, go-visa, settlement, fast-ila…): what a
  // competitor publishes is a case study, an expertise/service page, a guide, or an article.
  if (/case[\s-]?stud|our-cases|success[\s-]?stor|client[\s-]?stor|case[\s-]?result|recent[\s-]?cases|testimonial/.test(t)) return 'case_study';
  if (/\/(expertise|services?|practice-areas?|areas?-of-(law|practice|expertise)|what-we-do|specialisms?|specialities|solutions|our-services|legal-services)(\/|$)/.test(t)) return 'expertise';
  if (/how[\s-]?to|step[\s-]?by[\s-]?step|guide|checklist|explained|faq/.test(t)) return 'how-to-guide';
  return 'blog';
}

// Which jurisdiction a competitor page was written for (Karim: "genieai.co has ~20+
// jurisdictions — usually it's in the URL"). Labels are the SAME strings as the top-bar
// market list (dataforseo COUNTRIES labels, e.g. "United Kingdom", "UAE") so the list can
// follow the selected jurisdiction exactly. Signals, strongest first:
//   1. a locale segment in the URL — `xx-yy` (en-au, en-gb, pt-br, gb-au…: the COUNTRY is
//      whichever half is a country code) or a bare country code (/uk/, /us/, /au/…)
//   2. a country word in the title ("… Agreement UK")
//   3. the domain's country TLD (.co.uk, .com.au…)
// Otherwise "Not stated" — honest for .com/.co pages with no signal; never guessed.
const ISO_COUNTRY = {
  gb: 'United Kingdom', uk: 'United Kingdom', us: 'United States', ca: 'Canada', au: 'Australia', ie: 'Ireland', nz: 'New Zealand',
  in: 'India', ae: 'UAE', za: 'South Africa', sg: 'Singapore', de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy', nl: 'Netherlands',
  se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pl: 'Poland', pt: 'Portugal', ch: 'Switzerland', at: 'Austria', tr: 'Turkey',
  br: 'Brazil', mx: 'Mexico', co: 'Colombia', ar: 'Argentina', jp: 'Japan', hk: 'Hong Kong', my: 'Malaysia', ph: 'Philippines',
  pk: 'Pakistan', sa: 'Saudi Arabia', ng: 'Nigeria', id: 'Indonesia', qa: 'Qatar', be: 'Belgium', gr: 'Greece', cz: 'Czechia',
  hu: 'Hungary', ro: 'Romania', il: 'Israel', eg: 'Egypt', ke: 'Kenya', th: 'Thailand', vn: 'Vietnam', kr: 'South Korea', cn: 'China',
  cl: 'Chile', pe: 'Peru', bh: 'Bahrain', kw: 'Kuwait', om: 'Oman', cy: 'Cyprus', mt: 'Malta', lu: 'Luxembourg', ru: 'Russia',
  ua: 'Ukraine', tw: 'Taiwan', bd: 'Bangladesh', lk: 'Sri Lanka', gh: 'Ghana',
};
// Bare 2-letter path segments that are also English words / abbreviations — never treat
// these as a country on their own (they still resolve inside `xx-yy`, e.g. en-in → India).
const AMBIGUOUS_BARE = new Set(['it', 'in', 'me', 'no', 'at', 'be', 'is', 'to', 'by', 'do', 'so', 'on', 'or', 'as', 'an', 'if', 'of', 'up', 'us']);
const JX_TLD = { 'co.uk': 'gb', 'org.uk': 'gb', 'me.uk': 'gb', 'ac.uk': 'gb', 'uk': 'gb', 'com.au': 'au', 'net.au': 'au', 'org.au': 'au', 'co.nz': 'nz', 'co.in': 'in', 'com.sg': 'sg', 'co.za': 'za', 'com.br': 'br', 'com.mx': 'mx', 'co.jp': 'jp', 'com.hk': 'hk', 'com.my': 'my', 'com.ph': 'ph', 'com.pk': 'pk', 'com.sa': 'sa', 'com.ng': 'ng', 'co.id': 'id', 'com.tr': 'tr', 'co.kr': 'kr', 'com.cn': 'cn' };
const GENERIC_TLD = new Set(['com', 'net', 'org', 'io', 'co', 'app', 'ai', 'legal', 'law', 'info', 'biz', 'me', 'xyz', 'online', 'site', 'dev', 'tech', 'cloud', 'digital', 'agency', 'ltd', 'llc', 'inc', 'global', 'world', 'eu']);
const JX_WORDS = [
  [/\b(uk|united kingdom|england|wales|scotland|british|hmrc|companies house|england and wales)\b/i, 'gb'],
  [/\b(usa|united states|american|california|texas|new york|florida|delaware|irs)\b/i, 'us'],
  [/\b(australia|australian|nsw|queensland)\b/i, 'au'], [/\b(canada|canadian|ontario|british columbia|quebec)\b/i, 'ca'],
  [/\b(india|indian)\b/i, 'in'], [/\b(ireland|irish)\b/i, 'ie'], [/\b(uae|dubai|abu dhabi|emirates)\b/i, 'ae'],
  [/\b(new zealand)\b/i, 'nz'], [/\b(singapore)\b/i, 'sg'], [/\b(south africa)\b/i, 'za'], [/\b(malaysia)\b/i, 'my'],
  [/\b(hong kong)\b/i, 'hk'], [/\b(saudi)\b/i, 'sa'], [/\b(nigeria)\b/i, 'ng'], [/\b(philippines)\b/i, 'ph'], [/\b(pakistan)\b/i, 'pk'],
];
const isCountryCode = (c) => !!ISO_COUNTRY[c];
export function inferJurisdiction(host, url, title) {
  try {
    const segs = new URL(url).pathname.toLowerCase().split('/').filter(Boolean);
    for (const seg of segs.slice(0, 2)) {
      const m = seg.match(/^([a-z]{2})-([a-z]{2})$/);        // xx-yy: country is whichever half is a country code (en-au, gb-au, pt-br)
      if (m) { if (isCountryCode(m[2])) return ISO_COUNTRY[m[2]]; if (isCountryCode(m[1])) return ISO_COUNTRY[m[1]]; continue; }
      if (/^[a-z]{2}$/.test(seg) && isCountryCode(seg) && !AMBIGUOUS_BARE.has(seg)) return ISO_COUNTRY[seg];   // /uk/ /au/
      if (seg === 'usa') return ISO_COUNTRY.us;
    }
  } catch {}
  const t = String(title || '');
  for (const [re, code] of JX_WORDS) if (re.test(t)) return ISO_COUNTRY[code];
  const parts = String(host || '').toLowerCase().split('.');
  const two = parts.slice(-2).join('.'); const one = parts.slice(-1)[0];
  if (JX_TLD[two]) return ISO_COUNTRY[JX_TLD[two]];
  if (!GENERIC_TLD.has(one) && isCountryCode(one)) return ISO_COUNTRY[one];   // .de .fr .ie …
  return 'Not stated';
}

// `inputs` = saved competitor sources [{ id, url, label }] (or plain URL strings).
// Returns per-source stats keyed back by id so the caller can record lastScan/lastFound.
export async function ingestCompetitorSitemap(siteId, inputs, opts) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'Site not found.', saved: 0 };
  let list = (Array.isArray(inputs) && inputs.length) ? inputs : (Array.isArray(site.competitors) ? site.competitors : []);
  list = list.map((x) => (typeof x === 'string' ? { url: x } : (x && x.url ? x : null))).filter((x) => x && String(x.url || '').trim());
  // Dedupe by host, cap the batch so one click never fans out beyond the request budget.
  const seenHost = new Set();
  list = list.filter((x) => { let h = String(x.url).trim(); try { h = new URL(h.startsWith('http') ? h : 'https://' + h).hostname.replace(/^www\./, ''); } catch {} if (seenHost.has(h)) return false; seenHost.add(h); x.__host = h; return true; }).slice(0, 6);
  if (!list.length) return { error: 'No competitor website/sitemap URL provided (and none saved for this site).', saved: 0, needsInput: true };
  // SCAN PER JURISDICTION. Big competitors publish the same catalogue for 20+ countries
  // (genieai.co: 100k+ pages, 26 locales) — ingesting all of it is useless. We read the whole
  // sitemap (fast) to learn which countries they cover, then keep only the pages written
  // for the jurisdiction the user selected (default: the site's top-bar market), plus
  // unlabelled pages (a .com blog with no country signal may still be relevant).
  const wanted = String((opts && opts.jurisdiction) || marketFor(site && site.semrush_db).country || 'United Kingdom');
  const scoreSite = { id: siteId, __nicheCtx: geoFor(siteId) || '', __negatives: (Array.isArray(site.negative_keywords) ? site.negative_keywords : []).map((n) => String(n || '').toLowerCase().trim()).filter(Boolean) };
  const raw = [];
  // Fetch every competitor's sitemap CONCURRENTLY (each is internally bounded) so the
  // whole run stays inside the gateway request budget.
  // Read the WHOLE sitemap (big WordPress sites split posts across many child sitemaps),
  // not just the first few hundred URLs — Karim noticed results capping at 200/competitor.
  // Read the WHOLE sitemap (100k URLs ≈ 3s; it's the persist that's expensive, and that is
  // bounded below AFTER the jurisdiction filter) so no country's pages are cut off.
  const fetched = await Promise.all(list.map((src) => feeds.fetchSitemap(src.url, { maxUrls: 200000, maxChildren: 600 }).catch((e) => ({ error: String((e && e.message) || e), urls: [] }))));
  const perSource = [];
  for (let i = 0; i < list.length; i++) {
    const src = list[i]; const sm = fetched[i] || { urls: [] };
    const comp = src.__host || src.url;
    if (sm.error) { perSource.push({ id: src.id, input: src.url, competitor: comp, error: sm.error, urls: 0, made: 0 }); continue; }
    const urls = (sm.urls || []).filter((u) => !CSM_NONCONTENT.test(u) && !isIndexUrl(u));
    // 1) Tally which jurisdictions this competitor covers (the whole site, not just what we keep).
    const tally = {};
    const labelled = urls.map((u) => { const j = inferJurisdiction(comp, u, ''); tally[j] = (tally[j] || 0) + 1; return [u, j]; });
    const jurisdictions = Object.entries(tally).filter(([j]) => j !== 'Not stated').sort((a, b) => b[1] - a[1]).map(([j, n]) => ({ jurisdiction: j, pages: n }));
    // 2) Keep the pages written for the wanted jurisdiction (+ unlabelled ones).
    const kept = labelled.filter(([, j]) => j === wanted || j === 'Not stated');
    const matched = kept.length;
    let made = 0;
    for (const [u, j0] of kept) {
      const title = slugTitle(u);
      if (!title || title.length < 8 || title.split(' ').length < 2) continue;   // "About", "Blog" etc. are not topics
      // An unlabelled URL may still name its country in the title ("… Agreement UK").
      const jurisdiction = j0 === 'Not stated' ? inferJurisdiction(comp, u, title) : j0;
      if (jurisdiction !== wanted && jurisdiction !== 'Not stated') continue;
      const suggestedType = suggestTypeFor(site, title, u);
      const o = makeOpp(siteId, {
        source: 'competitor_sitemap',
        sourceRef: comp,
        title,
        primaryKeyword: title,
        intent: 'informational',
        actionType: 'article',
        evidence: [{ source: 'competitor_sitemap', detail: `A competitor covers this: ${comp}` }],
        payload: { link: u, competitor: comp, competitorSourceId: src.id || null, fromCompetitor: true, sourceType: 'competitor_sitemap', suggestedType, jurisdiction },
      });
      o.dedupeKey = 'csm:' + feedHash(String(u).replace(/[#?].*$/, '').toLowerCase());
      score(o, scoreSite);
      raw.push(o);
      if (++made >= 3000) break;   // hard bound per competitor per scan (a 3000-row chunked persist ≈ 10s)
    }
    const others = jurisdictions.map((x) => x.jurisdiction).filter((j) => j !== wanted);
    perSource.push({ id: src.id, input: src.url, competitor: comp, sitemap: sm.sitemapUrl, urls: urls.length, scannedFor: wanted, matched, made, capped: made >= 3000 && matched > made, jurisdictions, others });
  }
  const merged = dedupeMerge(raw);
  // Persist in CHUNKS: persist() pre-reads existing keys with ONE `dedupe_key=in.(...)`
  // query, and thousands of keys would exceed the URL length limit. 150/chunk keeps every
  // request small; chunks run sequentially so a big competitor still lands completely.
  let saved = 0, error = null, notProvisioned = false;
  for (let i = 0; i < merged.length; i += 150) {
    const res = await persist(siteId, merged.slice(i, i + 150));
    if (res.notProvisioned) { notProvisioned = true; error = res.error; break; }
    if (res.error && !error) error = res.error;
    saved += res.saved || 0;
  }
  return { saved, error, notProvisioned, fetched: raw.length, unique: merged.length, scannedFor: wanted, perSource };
}

// On-topic keyword pool (REAL volumes) for a competitor topic in the site's market.
// keyword_ideas is broad word-match SORTED BY VOLUME, so a shallow list is all generic
// one-worders ("agreement", "service") — pull a DEEP list (500) and keep only phrases
// that share ≥2 of the topic's stemmed words or contain its head phrase. related_keywords
// is seeded with the head phrase ("shareholder agreement") because the full slug rarely
// exists as a keyword. Returns diagnostics too (the /competitor-keyword-pool probe).
const KW_STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'by', 'with', 'how', 'what', 'is', 'are', 'your', 'our', 'vs', 'uk', 'from', 'into']);
const kwStem = (t) => t.replace(/ies$/, 'y').replace(/(ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
const kwWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !KW_STOP.has(t));
const kwToks = (s) => kwWords(s).map(kwStem);
export async function competitorKeywordPool(site, seed, negatives = []) {
  const topicToks = kwToks(seed);
  const headStem = topicToks.slice(-2).join(' ');
  const headRaw = kwWords(seed).slice(-2).join(' ');
  const need = Math.min(2, topicToks.length || 1);
  const onTopic = (kw) => { const kt = kwToks(kw); const ks = new Set(kt); let n = 0; for (const t of topicToks) if (ks.has(t)) n++; return n >= need || (headStem && kt.join(' ').includes(headStem)); };
  const out = { keywords: [], raw: { related: 0, ideas: 0 }, passed: 0, droppedOffTopic: 0, droppedNegative: 0, errors: [], sampleDropped: [], seeds: {} };
  if (!dfs.hasKey() || !seed) return out;
  const relSeeds = [...new Set([headRaw, String(seed).toLowerCase()].filter(Boolean))].slice(0, 2);
  const ideaSeeds = [...new Set([String(seed).toLowerCase(), headRaw, headStem].filter(Boolean))];
  out.seeds = { related: relSeeds, ideas: ideaSeeds };
  const results = await Promise.all([
    ...relSeeds.map((s) => dfs.relatedKeywords(s, { db: site.semrush_db, limit: 100, depth: 2 }).then((r) => ({ kind: 'related', r })).catch((e) => ({ kind: 'related', r: [], err: String((e && e.message) || e) }))),
    dfs.keywordIdeas(ideaSeeds, { db: site.semrush_db, limit: 500 }).then((r) => ({ kind: 'ideas', r })).catch((e) => ({ kind: 'ideas', r: [], err: String((e && e.message) || e) })),
  ]);
  const pool = new Map();
  for (const res of results) {
    if (res.err) out.errors.push(res.err);
    out.raw[res.kind] += (res.r || []).length;
    for (const k of (res.r || [])) {
      const kw = String(k.keyword || '').toLowerCase().trim(); if (!kw) continue;
      if (hitsNeg(kw, negatives)) { out.droppedNegative++; continue; }              // never build clusters in an excluded area
      if (!onTopic(kw)) { out.droppedOffTopic++; if (out.sampleDropped.length < 12) out.sampleDropped.push(kw + '(' + (k.volume || 0) + ')'); continue; }
      const prev = pool.get(kw); if (!prev || (k.volume || 0) > (prev.volume || 0)) pool.set(kw, { keyword: kw, volume: Number(k.volume) || 0 });
    }
  }
  out.keywords = [...pool.values()].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 100);
  out.passed = pool.size;
  return out;
}

// ---- "Take over this topic": competitor article → 3-5 keyword clusters --------------
// Karim: "click a button and get 3-5 keyword clusters based on that competitor article,
// so I can create 3-5 more pieces around it, choose the type, and out-rank them."
// 1) real related keywords + volumes from DataForSEO for the site's market (best-effort),
// 2) Claude groups them into clusters around the competitor topic,
// 3) each cluster is persisted as its own opportunity (source 'competitor_cluster',
//    payload.parentId = the competitor row) so it shows under the topic, survives
//    reloads, and pushes through the same autoDraft path (type + multi-jurisdiction).
export async function expandCompetitorTopic(siteId, oppId, { count = 4 } = {}) {
  if (!siteId || !oppId) return { error: 'siteId + id required' };
  const got = await fetchByIds(siteId, [oppId]);
  if (got.notProvisioned) return { ...NOT_PROVISIONED, clusters: [] };
  const parent = (got.items || [])[0];
  if (!parent) return { error: 'That topic is no longer here.', clusters: [] };
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'Site not found.', clusters: [] };
  const pp = (parent.payload && typeof parent.payload === 'object') ? parent.payload : {};
  const market = marketFor(site.semrush_db);
  const seed = String(parent.primary_keyword || parent.title || '').trim();
  const nicheCtx = geoFor(siteId) || '';
  const negatives = (Array.isArray(site.negative_keywords) ? site.negative_keywords : []).map((n) => String(n || '').toLowerCase().trim()).filter(Boolean);
  const scoreSite = { id: siteId, __nicheCtx: nicheCtx, __negatives: negatives };

  // 1) Real keyword pool (volumes), on-topic filtered — see competitorKeywordPool().
  const poolInfo = await competitorKeywordPool(site, seed, negatives);
  const keywords = poolInfo.keywords;
  const pool = new Map(keywords.map((k) => [k.keyword, k]));
  const dfsErrors = poolInfo.errors;

  // 2) Claude → clusters.
  let clusters = [];
  try {
    clusters = await claude.competitorClusters({ topic: parent.title, competitorUrl: pp.link, keywords, siteName: site.name, siteId, market, count });
  } catch (e) { return { error: 'Could not generate clusters: ' + String((e && e.message) || e), clusters: [], pool: keywords.length }; }
  if (!clusters.length) return { error: 'No clusters came back — try again.', clusters: [], pool: keywords.length };

  // 3) Persist one opportunity per cluster, under the parent.
  const raw = [];
  for (const c of clusters) {
    const kws = (Array.isArray(c.keywords) ? c.keywords : []).map((k) => String(k || '').toLowerCase().trim()).filter(Boolean)
      .map((kw) => ({ keyword: kw, volume: (pool.get(kw) || {}).volume || 0 }));
    if (!kws.length && !c.suggestedTitle) continue;
    const primary = (kws.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] || {}).keyword || String(c.label || c.suggestedTitle || '').toLowerCase();
    const totalVolume = kws.reduce((s, k) => s + (k.volume || 0), 0);
    const title = String(c.suggestedTitle || c.label || primary).trim();
    const label = String(c.label || title).trim();
    const angle = String(c.angle || '').trim();
    const o = makeOpp(siteId, {
      source: 'competitor_cluster',
      sourceRef: parent.id,
      title,
      primaryKeyword: primary,
      intent: c.intent || 'informational',
      actionType: 'article',
      clusterKey: label,
      evidence: [{ source: 'competitor_cluster', detail: `Cluster around "${String(parent.title || '').slice(0, 80)}"${pp.competitor ? ' (' + pp.competitor + ')' : ''}` }],
      payload: {
        parentId: parent.id, parentTitle: parent.title, competitor: pp.competitor || '', link: pp.link || '',
        label, suggestedTitle: title, primaryKeyword: primary, intent: c.intent || 'informational', format: c.format || '',
        totalVolume, keywords: kws, angle,
        // The writer row: Goal = the angle; Content Brief = angle + the keyword list with volumes.
        brief: { title, angle, outline: kws.length ? [{ h2: 'Target keywords (cover these)', points: kws.map((k) => k.keyword + (k.volume ? ` (~${k.volume}/mo)` : '')) }] : [] },
        jurisdiction: pp.jurisdiction || market.country, suggestedType: pp.category || pp.suggestedType || 'blog',
        fromCompetitor: true, sourceType: 'competitor_cluster', volumesReal: keywords.length > 0,
      },
    });
    o.dedupeKey = 'ccl:' + feedHash(String(parent.id) + '|' + label.toLowerCase());
    score(o, scoreSite);
    raw.push(o);
  }
  const res = await persist(siteId, raw);
  if (res.notProvisioned) return { ...NOT_PROVISIONED, clusters: [] };
  const rows = (res.rows || []).map((r) => ({ id: r.id, title: r.title, status: r.status, primaryKeyword: r.primary_keyword, keywords: (r.payload && r.payload.keywords) || [], totalVolume: (r.payload && r.payload.totalVolume) || 0, angle: (r.payload && r.payload.angle) || '', format: (r.payload && r.payload.format) || '', intent: r.intent, suggestedType: (r.payload && r.payload.suggestedType) || 'blog', jurisdiction: (r.payload && r.payload.jurisdiction) || 'Not stated' }));
  return { clusters: rows, saved: res.saved || 0, pool: keywords.length, volumesReal: keywords.length > 0, dfsErrors: dfsErrors.length ? dfsErrors : undefined, poolInfo: { raw: poolInfo.raw, passed: poolInfo.passed, droppedOffTopic: poolInfo.droppedOffTopic, seeds: poolInfo.seeds, sampleDropped: poolInfo.sampleDropped }, error: res.error };
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
      const res = await fetch(`${SB}/rest/v1/content_opportunities?site_id=eq.${encodeURIComponent(siteId)}&dedupe_key=in.(${encodeURIComponent(inList)})&select=dedupe_key,score,evidence,status`, { headers: headers() });
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
        // NEVER let a re-scan / re-poll reset progress: a row the user already pushed
        // (queued/in_review/published/done) or hid (dismissed) keeps that status. Without
        // this, merge-duplicates overwrote it with 'scored' and "Pushed ✓" items came
        // back as "New" — exactly the duplicate-content risk Karim flagged.
        if (prev.status && prev.status !== 'scored') row.status = prev.status;
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
export async function worklist(siteId, { status, actionType, source, excludeSource, limit = 50, offset = 0 } = {}) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, error: 'Supabase not configured.', items: [] };
  // `id.asc` tie-break keeps paging (offset) stable when many rows share a score.
  const parts = [`site_id=eq.${encodeURIComponent(siteId)}`, 'select=*', 'order=score.desc,id.asc', `limit=${Math.min(Math.max(Number(limit) || 50, 1), 500)}`];
  if (offset) parts.push(`offset=${Math.max(0, Number(offset) || 0)}`);
  if (status) parts.push(`status=eq.${encodeURIComponent(status)}`);
  if (actionType) parts.push(`action_type=eq.${encodeURIComponent(actionType)}`);
  if (source) parts.push(`source=eq.${encodeURIComponent(source)}`);
  if (excludeSource) parts.push(`source=neq.${encodeURIComponent(excludeSource)}`);   // e.g. keep competitor items on their own screen
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
// Fetch specific opportunities BY ID (any status / score). The explicit-push path must not
// depend on the top-N worklist window — a low-scored competitor topic sits far outside it
// once a site has thousands of rows (Go Legal AI: "selected opportunity not found").
export async function fetchByIds(siteId, ids) {
  if (!SB || !SRV) return { ...NOT_PROVISIONED, items: [] };
  const list = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 100);
  if (!list.length) return { items: [] };
  const inList = list.map((k) => `"${k.replace(/"/g, '')}"`).join(',');
  try {
    const res = await fetch(`${SB}/rest/v1/content_opportunities?site_id=eq.${encodeURIComponent(siteId)}&id=in.(${encodeURIComponent(inList)})&select=*`, { headers: headers() });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return { ...NOT_PROVISIONED, items: [] };
      return { error: `content_opportunities read → ${res.status} ${text.slice(0, 200)}`, items: [] };
    }
    let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
    return { items: Array.isArray(data) ? data : [] };
  } catch (e) { return { error: String(e.message || e), items: [] }; }
}

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
export async function updateOpp(id, patch) {
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

// The jurisdictions a site's writer can actually produce. go-legal.ai's n8n multilingual
// writer resolves exactly these 16 (its Country Language Config COUNTRIES map) and THROWS
// on anything else — so only offer those there. Other sites: every top-bar market.
const WRITER_JX_GO_LEGAL_AI = ['United Kingdom', 'United States', 'Canada', 'Australia', 'India', 'Philippines', 'UAE', 'Pakistan', 'Hong Kong', 'France', 'Germany', 'Spain', 'Sweden', 'Finland', 'Colombia', 'China'];
export function jurisdictionOptionsFor(site) {
  const all = dfs.COUNTRIES.map((c) => ({ db: c.db, label: c.label, language: c.language_name }));
  const n = ((site && site.name) || '') + ' ' + ((site && site.url) || '');
  if (!/go-?legal\.ai/i.test(n)) return all;
  const want = new Set(WRITER_JX_GO_LEGAL_AI);
  const list = all.filter((o) => want.has(o.label));
  if (!list.some((o) => o.label === 'China')) list.push({ db: 'cn', label: 'China', language: 'Chinese (Simplified)' });
  return list;
}
// Market objects for a list of top-bar labels ("United Kingdom", "UAE"…). Unknown labels
// still yield a market (English) so the Jurisdiction cell carries the name the writer
// resolves. Empty → just the default market (today's single-jurisdiction behaviour).
function marketsForLabels(labels, defaultMarket) {
  const list = (Array.isArray(labels) ? labels : []).map((l) => String(l || '').trim()).filter(Boolean);
  if (!list.length) return [defaultMarket];
  const byLabel = new Map(dfs.COUNTRIES.map((c) => [c.label.toLowerCase(), c]));
  const out = []; const seen = new Set();
  for (const l of list) {
    const key = l.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    const c = byLabel.get(key);
    out.push(c ? marketFor(c.db) : { db: null, country: l, language: l === 'China' ? 'Chinese (Simplified)' : 'English', currency: '', geo: '', preferDomains: [], scope: '' });
  }
  return out;
}

export async function autoDraft(siteId, { topN = 5, actionType, ids, category, jurisdictions, force } = {}) {
  if (!siteId) return { error: 'No site selected.' };
  const n = Math.min(Math.max(Number(topN) || 5, 1), 50);
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : (ids ? [ids] : []);

  // Answer-block BULK drafting stays in-place; but an explicit per-row id push always
  // goes to the Article Writer (user clicked "Push" on that specific opportunity).
  if (actionType === 'answer_block' && !idList.length) return await draftAnswerBlocks(siteId, n);

  let items;
  if (idList.length) {
    // Explicit per-row push: fetch the chosen rows BY ID (any status / score) — a row the
    // user clicked should always go. (Previously filtered the top-500 worklist window, which
    // silently dropped low-scored competitor topics on sites with thousands of rows.)
    const got = await fetchByIds(siteId, idList);
    if (got && got.notProvisioned) return { ...NOT_PROVISIONED, drafted: 0 };
    if (got && got.error && !(got.items && got.items.length)) return { error: got.error, drafted: 0 };
    items = (got.items || []).slice(0, 50);
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

  // 1b) VERIFICATION GATE. A legal/case-law brief carries a verification result; NEVER push
  //     one whose cited cases/statutes/rules aren't verified (Karim: "only push once it's
  //     verified"). `force` overrides after the operator has reviewed the flags.
  let blocked = [];
  if (!force) {
    const ok = [];
    for (const it of items) {
      const v = it.payload && it.payload.brief && it.payload.brief.verification;
      if (v && v.status && v.status !== 'verified') blocked.push({ id: it.id, title: it.title, verifyStatus: v.status, summary: v.summary });
      else ok.push(it);
    }
    items = ok;
    if (!items.length && blocked.length) return { drafted: 0, skipped: true, reason: 'verification-blocked', blocked, candidates: blocked.length };
  }

  // 2) Resolve the Article Writer table — the ONE n8n-watched table (cfg.table_gaps).
  let pat = null, cfg = null;
  try { pat = await db.getAirtablePat(siteId); } catch (e) { pat = null; }
  try { cfg = await db.getAirtableConfig(siteId); } catch (e) { cfg = null; }
  if (!pat || !cfg || !cfg.base_id) return { drafted: 0, skipped: true, reason: 'Airtable not configured', candidates: items.length };
  if (!cfg.table_gaps) return { drafted: 0, skipped: true, reason: 'No Article Writer table configured (table_gaps)', candidates: items.length };
  const baseId = cfg.base_id;
  const site = await db.getSite(siteId).catch(() => null);
  const market = marketFor(site && site.semrush_db);   // stamp Jurisdiction + Language onto each writer row

  let tables = [];
  try { tables = await airtable.listTables(pat, baseId); } catch (e) { tables = []; }
  const tbl = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
  if (!tbl) return { drafted: 0, skipped: true, reason: 'Configured Article Writer table no longer exists', candidates: items.length };

  // Ensure a long-text "Content Brief" column (folds into Description if it can't be created).
  const names = new Set((tbl.fields || []).map((f) => f.name));
  let briefField = 'Content Brief';
  if (!names.has('Content Brief')) { try { briefField = await airtable.ensureField(pat, baseId, tbl.id, 'Content Brief', 'multilineText'); } catch (e) { briefField = null; } }
  if (briefField) names.add(briefField);
  // Jurisdiction + Language columns (best-effort create; needs schema.bases:write).
  for (const col of ['Jurisdiction', 'Language']) {
    if (!names.has(col)) { try { const c = await airtable.ensureField(pat, baseId, tbl.id, col, 'singleLineText'); if (c) names.add(c); } catch (e) {} }
  }

  // 3) Map each opportunity → ONE Article Writer row PER JURISDICTION (Karim: "an NDA is
  //    relevant for every jurisdiction — push it to Airtable for all of them, in the right
  //    language"). `jurisdictions` = top-bar labels; default = the site's own market. The
  //    n8n writer derives the language from the Jurisdiction cell, so the France row is
  //    written in French, Germany in German, etc. Field-set-filtered so a differing
  //    per-site schema can't 422. `category` (per-push override) wins over anything stored.
  const markets = marketsForLabels(jurisdictions, market);
  const planned = [];   // { id, row, keyword, jurisdiction, key: 'keyword|jurisdiction' }
  for (const it of items) {
    const cluster = oppToCluster(it);
    const brief = (it.payload && it.payload.brief && typeof it.payload.brief === 'object') ? it.payload.brief : {};
    const cat = airtable.normalizeCategory(category || (it.payload && (it.payload.category || it.payload.suggestedType)) || (cluster && cluster.category));
    for (const mk of markets) {
      const row = airtable.mapArticleBrief(cluster, brief, briefField, names, cat, mk);
      if (!row || !row.Keyword) continue;
      const keyword = String(row.Keyword).trim().toLowerCase();
      planned.push({ id: it.id, row, keyword, jurisdiction: mk.country, key: keyword + '|' + String(mk.country || '').toLowerCase() });
    }
  }
  if (!planned.length) return { drafted: 0, skipped: true, reason: 'nothing mappable to draft', candidates: items.length };

  // De-dupe by (Keyword, Jurisdiction) against rows already in the table, so the same
  // keyword CAN exist once per country but never twice for the same one. An older row with
  // no Jurisdiction cell counts as the site's default market.
  const existing = new Set();
  try {
    let offset;
    do {
      const page = await airtable.listRecords(pat, baseId, tbl.id, { pageSize: 100, offset, fields: ['Keyword', 'Jurisdiction'] });
      for (const rec of (page.records || [])) {
        const f = rec.fields || {};
        const kw = String(f.Keyword || '').trim().toLowerCase(); if (!kw) continue;
        existing.add(kw + '|' + String(f.Jurisdiction || market.country || '').trim().toLowerCase());
      }
      offset = page.offset;
    } while (offset);
  } catch (e) { /* read failed → treat as none existing */ }

  const toCreate = [], seen = new Set(), createdIds = new Set(), dupIds = new Set();
  const perJurisdiction = {};
  let skippedDup = 0;
  for (const p of planned) {
    if (existing.has(p.key) || seen.has(p.key)) { skippedDup++; dupIds.add(p.id); continue; }
    seen.add(p.key);
    toCreate.push(p.row); createdIds.add(p.id);
    perJurisdiction[p.jurisdiction] = (perJurisdiction[p.jurisdiction] || 0) + 1;
  }
  // An item whose every jurisdiction is already in the writer → flip it to 'queued' so it
  // stops squatting in the scored top-N window (the auto-pilot wedge).
  for (const id of dupIds) if (!createdIds.has(id)) await setStatus(id, 'queued').catch(() => null);
  if (!toCreate.length) return { drafted: 0, skipped: true, reason: 'all candidates already in Article Writer table (now marked queued)', candidates: items.length, skippedDup };

  // 4) Push to the n8n-watched table, then flip the drafted opportunities → 'queued'.
  let pushed = 0;
  try { pushed = await airtable.createRecords(pat, baseId, tbl.id, toCreate); }
  catch (e) { return { error: `Article Writer push → ${String(e.message || e)}`, drafted: 0, candidates: items.length }; }

  let queued = 0;
  for (const id of createdIds) { const r = await setStatus(id, 'queued').catch(() => null); if (r && r.updated) queued++; }

  return { drafted: pushed, queued, skippedDup, candidates: items.length, table: tbl.name, jurisdictions: markets.map((m) => m.country), perJurisdiction, blocked: blocked.length ? blocked : undefined };
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
