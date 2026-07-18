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

export async function findOpportunities(siteId, { db: region, maxKeywords = 160, includeTrending = true } = {}) {
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
  const ranked = [...pool.values()].map((k) => ({ ...k, src: [...k.src] })).sort((a, b) => b.volume - a.volume).slice(0, maxKeywords);

  // Cluster with Claude (labels/intent/title only — metrics stay deterministic).
  // niche: there is NO `niche` column — the site's real niche/service context lives in
  // geo_context. The old fallback passed stack.type (literally "WordPress"), so clustering
  // ran with no idea what the site sells and produced generic, off-topic clusters.
  const niche = (site.geo_context && String(site.geo_context).slice(0, 1500)) || (site.stack && site.stack.type) || '';
  const clusters = await claude.clusterKeywords({ keywords: ranked, siteName: site.name, niche, siteId });
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
