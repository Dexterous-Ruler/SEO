// ===========================================================================
// Content Opportunity engine — finds what content to create next, from FOUR
// real signals, then clusters + gap-checks against the site's own sitemap:
//   1. RANKING      — GSC top queries + DataForSEO ranked keywords (what you
//                     already rank for, esp. page-2 strikers worth a dedicated page)
//   2. COMPETITORS  — keyword gap vs saved competitors (what they rank for, you don't)
//   3. TRENDING     — DataForSEO keyword ideas seeded from your niche/top terms,
//                     with a rising-demand trend signal
//   4. SITEMAP      — your real published pages, to flag clusters with NO page = GAP
//
// Output = scored topic clusters ready to push to Airtable for content creation.
// Claude clusters/labels; all volumes/gaps/trends/scores are computed here.
// ===========================================================================
import { WordPressClient } from '../src/wp/client.js';
import { credsForSite, db } from './supabase.js';
import * as dfs from './dataforseo.js';
import * as gsc from './gsc.js';
import * as claude from './claude.js';

const STOP = new Set('the a an and or of for to in on with your you our how what why best top guide vs is are can do does will near me uk'.split(' '));
function tokens(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)); }
function cleanTitle(t) { return (t || '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(); }

// Deterministic fallback clustering — used when the Claude clustering call fails or
// returns nothing, so a run never discards the (paid) keyword data it just gathered.
// Groups keywords by their most common significant token; keeps groups of 2+.
function fallbackClusters(ranked) {
  const byTok = new Map();
  for (const k of ranked) {
    for (const t of new Set(tokens(k.keyword))) {
      if (!byTok.has(t)) byTok.set(t, []);
      byTok.get(t).push(k);
    }
  }
  const used = new Set();
  const out = [];
  for (const [tok, ks] of [...byTok.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const fresh = ks.filter((k) => !used.has(k.keyword));
    if (fresh.length < 2) continue;
    fresh.forEach((k) => used.add(k.keyword));
    const top = fresh.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
    out.push({
      label: tok,
      suggestedTitle: (top.keyword || tok).replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase()),
      intent: 'informational', format: 'guide',
      keywords: fresh.map((k) => k.keyword),
    });
    if (out.length >= 20) break;
  }
  return out;
}

// Does any sitemap page cover a cluster? Coverage = strong token overlap with a
// page title or URL slug. Returns the covering URL or null.
function coveringPage(cluster, pages) {
  const clusterToks = new Set([...tokens(cluster.label), ...tokens(cluster.suggestedTitle), ...tokens((cluster.keywords || [])[0])]);
  if (!clusterToks.size) return null;
  let best = null, bestScore = 0;
  for (const p of pages) {
    const pageToks = new Set([...tokens(p.title), ...tokens((p.url || '').split('/').filter(Boolean).pop())]);
    let overlap = 0; for (const t of clusterToks) if (pageToks.has(t)) overlap++;
    const score = overlap / clusterToks.size;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.6 ? best.url : null; // ≥60% of cluster tokens present on a page
}

export async function findOpportunities(siteId, { db: region, maxKeywords = 160, includeTrending = true, longRun = false } = {}) {
  const site = await db.getSite(siteId);
  if (!site) return { error: 'Site not found.' };
  const domain = (site.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const dbRegion = String(region || site.semrush_db || 'uk').toLowerCase(); // per-site target market (switchable from the UI)
  const sources = {};

  // 1) SITEMAP — real published pages (for gap detection + seeds).
  let pages = [];
  try {
    const { baseUrl, username, appPassword } = await credsForSite(siteId);
    const wp = new WordPressClient({ baseUrl, username, appPassword });
    const [pg, ps] = await Promise.all([
      wp.list('pages', { perPage: 100, fields: 'title,link' }).catch(() => []),
      wp.list('posts', { perPage: 100, fields: 'title,link' }).catch(() => []),
    ]);
    pages = [...pg, ...ps].map((r) => ({ title: cleanTitle(r.title?.rendered), url: r.link })).filter((p) => p.title && p.url);
  } catch (e) {}
  sources.sitemapPages = pages.length;

  // Pooled keyword map: keyword → { keyword, volume, cpc, position, trend, src:Set }
  const pool = new Map();
  const add = (k, src) => {
    if (!k || !k.keyword) return;
    const key = k.keyword.toLowerCase().trim();
    const cur = pool.get(key) || { keyword: k.keyword, volume: 0, cpc: 0, position: null, trend: 0, src: new Set() };
    cur.volume = Math.max(cur.volume, k.volume || 0);
    cur.cpc = Math.max(cur.cpc, k.cpc || 0);
    if (k.position != null && (cur.position == null || k.position < cur.position)) cur.position = k.position;
    if (k.trend) cur.trend = k.trend;
    cur.src.add(src);
    pool.set(key, cur);
  };

  // 2) RANKING — GSC queries (first-party) + DataForSEO ranked keywords.
  try {
    const saStr = await db.getGscSa(siteId).catch(() => null);
    if (saStr && site.gsc_property) {
      const snap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 });
      for (const q of (snap.topQueries || [])) add({ keyword: q.query, volume: q.impressions, position: q.position }, 'gsc');
      sources.gsc = (snap.topQueries || []).length;
    }
  } catch (e) {}
  if (dfs.hasKey()) {
    try { const ranked = await dfs.organicKeywords(domain, { db: dbRegion, limit: 100 }); ranked.forEach((k) => add(k, 'ranking')); sources.ranked = ranked.length; } catch (e) { sources.rankedError = String(e.message || e); }
  }

  // 3) COMPETITORS — keyword gap vs saved competitors, run in PARALLEL (they're
  //    independent; serially they were a large slice of the request budget).
  const competitors = Array.isArray(site.competitors) ? site.competitors.slice(0, 2) : [];
  if (dfs.hasKey() && competitors.length) {
    let gapCount = 0;
    const gs = await Promise.all(competitors.map((c) =>
      dfs.keywordGap(domain, c.replace(/^https?:\/\//, ''), { db: dbRegion, limit: 60, negatives: site.negative_keywords || [], extraBrands: competitors }).catch(() => null)));
    for (const g of gs) { if (!g) continue; g.gaps.forEach((k) => add({ ...k, position: null }, 'competitor')); gapCount += g.gaps.length; }
    sources.competitorGap = gapCount;
  }

  // 4) TRENDING — keyword ideas seeded from the site's strongest topics.
  if (includeTrending && dfs.hasKey()) {
    const seeds = [...pool.values()].sort((a, b) => b.volume - a.volume).slice(0, 5).map((k) => k.keyword);
    const seedTerms = seeds.length ? seeds : [domain.split('.')[0]];
    try { const ideas = await dfs.keywordIdeas(seedTerms, { db: dbRegion, limit: 120 }); ideas.forEach((k) => add(k, 'trending')); sources.trending = ideas.length; } catch (e) { sources.trendingError = String(e.message || e); }
  }

  if (pool.size < 3) return { error: 'Not enough keyword data — connect Search Console or DataForSEO, and add competitors.', sources, clusters: [] };

  // Rank the pool + cap for clustering (by volume).
  let ranked = [...pool.values()].map((k) => ({ ...k, src: [...k.src] })).sort((a, b) => b.volume - a.volume).slice(0, maxKeywords);

  // NICHE FILTER — the pool is fed by BROAD competitors and generic keyword ideas, so a
  // specialist site was getting high-volume but irrelevant clusters (family law, power of
  // attorney, "find a solicitor"). Filter the pool against this site's own service context
  // BEFORE clustering, using the same geo_context filter the keyword-gap route uses.
  // Fail-open, and never filter down to a stub.
  if (site.geo_context && ranked.length) {
    try {
      const keep = await claude.filterKeywordsByNiche({ keywords: ranked.map((k) => k.keyword), niche: site.geo_context, siteName: site.name, siteId });
      const keepSet = new Set(keep.map((k) => String(k).toLowerCase().trim()));
      const onNiche = ranked.filter((k) => keepSet.has(String(k.keyword).toLowerCase().trim()));
      if (onNiche.length >= 8) { sources.offNicheFiltered = ranked.length - onNiche.length; ranked = onNiche; }
    } catch (e) { /* fail-open: cluster the unfiltered pool */ }
  }

  // Cluster with Claude (labels/intent/title only — metrics stay deterministic).
  // niche: there is NO `niche` column — the site's real niche/service context lives in
  // geo_context. The old fallback passed stack.type (literally "WordPress"), so clustering
  // ran with no idea what the site sells and produced generic, off-topic clusters.
  const niche = (site.geo_context && String(site.geo_context).slice(0, 1500)) || (site.stack && site.stack.type) || '';
  // longRun = invoked from the background job (no edge cap) → a slightly larger budget.
  // NEVER let a clustering failure throw away every (paid) DataForSEO row we just gathered:
  // fall back to deterministic token clustering so the operator still gets a Content Plan.
  let clusters = [];
  try {
    clusters = await claude.clusterKeywords({ keywords: ranked, siteName: site.name, niche, siteId,
      ...(longRun ? { timeoutMs: 60000, deadlineMs: 120000 } : {}) });
  } catch (e) { sources.clusterError = String(e && e.message || e); }
  if (!clusters.length) {
    if (!sources.clusterError) sources.clusterError = 'clustering returned nothing';
    clusters = fallbackClusters(ranked);
    sources.clusterFallback = clusters.length;
  }
  const byKw = new Map(ranked.map((k) => [k.keyword.toLowerCase(), k]));

  const enriched = clusters.map((cl) => {
    const kws = (cl.keywords || []).map((kw) => byKw.get(String(kw).toLowerCase())).filter(Boolean);
    const totalVolume = kws.reduce((s, k) => s + (k.volume || 0), 0);
    const avgTrend = kws.length ? Math.round(kws.reduce((s, k) => s + (k.trend || 0), 0) / kws.length) : 0;
    const fromCompetitor = kws.some((k) => k.src.includes('competitor'));
    const ranksAlready = kws.some((k) => k.position != null);
    const coverUrl = coveringPage(cl, pages);
    const isGap = !coverUrl;
    const top = kws.slice().sort((a, b) => b.volume - a.volume)[0];
    // Opportunity score: volume (log) × gap bonus × trend bonus × competitor bonus.
    const volScore = Math.log10(1 + totalVolume);
    const score = Math.round(volScore * (isGap ? 1.6 : 1) * (avgTrend > 20 ? 1.4 : avgTrend > 0 ? 1.1 : 1) * (fromCompetitor ? 1.2 : 1) * 100) / 100;
    return {
      label: cl.label, intent: cl.intent || 'informational', format: cl.format || 'guide',
      suggestedTitle: cl.suggestedTitle || cl.label,
      primaryKeyword: top ? top.keyword : (cl.keywords || [])[0],
      keywords: kws.map((k) => ({ keyword: k.keyword, volume: k.volume, position: k.position, trend: k.trend, cpc: k.cpc })),
      keywordCount: kws.length,
      totalVolume, avgTrend, trending: avgTrend > 15,
      isGap, coveringUrl: coverUrl, fromCompetitor, ranksAlready,
      score,
    };
  }).filter((c) => c.keywordCount > 0).sort((a, b) => b.score - a.score);

  return {
    domain, region: dbRegion, sources,
    totalKeywords: pool.size, clusterCount: enriched.length,
    gapCount: enriched.filter((c) => c.isGap).length,
    trendingCount: enriched.filter((c) => c.trending).length,
    clusters: enriched,
  };
}

export default { findOpportunities };
