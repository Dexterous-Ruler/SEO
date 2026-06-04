// Prioritization engine. You cannot drive 1,498 pages to 100/100 at once —
// rank them by impact = traffic × gap-to-100, so effort goes where it pays.
//
// Traffic comes from Search Console export (optional). Without it we fall back
// to a sitemap-priority/recency heuristic, so the engine still works on day one.

// gap = how far from perfect across the 4 categories (0 = already perfect).
export function scoreGap(scores = {}) {
  const cats = ['performance', 'accessibility', 'bestPractices', 'seo'];
  let gap = 0, counted = 0;
  for (const c of cats) {
    if (scores[c] != null) { gap += (100 - scores[c]); counted++; }
  }
  return counted ? gap : null; // null = no data yet
}

// Merge audit results with an optional traffic map { url: clicks } and rank.
// Returns items sorted by impact desc, each with a transparent breakdown.
export function prioritize(auditResults, { traffic = {}, defaultTraffic = 1 } = {}) {
  const items = auditResults
    .filter((r) => r && r.url && r.scores)
    .map((r) => {
      const gap = scoreGap(r.scores);
      const t = traffic[r.url] ?? traffic[r.url?.replace(/\/$/, '')] ?? defaultTraffic;
      const impact = gap == null ? 0 : gap * Math.max(t, 0.1);
      return {
        url: r.url,
        scores: r.scores,
        gap,
        traffic: t,
        impact: Math.round(impact),
        // Worst category first — tells the agent what to fix.
        weakest: weakestCategory(r.scores),
      };
    });
  items.sort((a, b) => b.impact - a.impact);
  return items;
}

function weakestCategory(scores = {}) {
  const cats = ['performance', 'accessibility', 'bestPractices', 'seo'];
  let worst = null, val = 101;
  for (const c of cats) {
    if (scores[c] != null && scores[c] < val) { val = scores[c]; worst = c; }
  }
  return worst ? { category: worst, score: val } : null;
}

// Parse a Search Console "Pages" CSV export → { url: clicks }.
export function trafficFromGscCsv(csv) {
  const map = {};
  const lines = csv.split('\n').filter(Boolean);
  for (const line of lines.slice(1)) {
    // GSC export: "Top pages","Clicks",... — naive split handles the common case
    const cols = line.split(',');
    const url = (cols[0] || '').replace(/^"|"$/g, '').trim();
    const clicks = Number((cols[1] || '').replace(/[^0-9.]/g, ''));
    if (url.startsWith('http') && !Number.isNaN(clicks)) map[url] = clicks;
  }
  return map;
}

export default { prioritize, scoreGap, trafficFromGscCsv };
