// ===========================================================================
// Traffic-value modeling — turns rankings into money.
//   estimated clicks = search_volume × CTR(position)
//   traffic value    = estimated clicks × CPC
// Per keyword and aggregated per site. This is the metric a budget-holder
// actually cares about: "£X/mo of organic traffic" and "£Y at risk".
//
// The positional CTR curve is the crux. We ship a sensible default (blended
// organic CTR by position, ~2024 industry aggregates) BUT calibrate it
// per-site from the site's OWN Search Console CTR-by-position when available —
// a genuine differentiator over tools that use a static curve. Zero deps.
// ===========================================================================

// Default blended organic CTR by SERP position (1-indexed). Positions beyond
// the list fall through to a small page-3+ floor. Sourced from public 2024
// aggregate CTR studies (AWR / Backlinko-style), rounded.
const DEFAULT_CTR = {
  1: 0.316, 2: 0.158, 3: 0.096, 4: 0.072, 5: 0.0535,
  6: 0.0426, 7: 0.0338, 8: 0.0286, 9: 0.0246, 10: 0.0221,
  11: 0.0119, 12: 0.0109, 13: 0.0102, 14: 0.0095, 15: 0.0089,
  16: 0.0084, 17: 0.0079, 18: 0.0075, 19: 0.0071, 20: 0.0067,
};
const FLOOR_CTR = 0.0035; // position 21+ (page 3 and beyond)

// CTR for a (possibly fractional) position from a curve object.
function ctrAt(position, curve = DEFAULT_CTR) {
  if (position == null || position <= 0) return 0;
  const p = position;
  if (p <= 1) return curve[1];
  if (p >= 20) {
    // Page-2 tail (20-21) holds the pos-20 CTR; page 3+ drops to the floor.
    if (p <= 21) return curve[20] || FLOOR_CTR;
    return FLOOR_CTR;
  }
  // Linear interpolation between the two bracketing integer positions.
  const lo = Math.floor(p), hi = Math.ceil(p);
  const cl = curve[lo] != null ? curve[lo] : FLOOR_CTR;
  const ch = curve[hi] != null ? curve[hi] : FLOOR_CTR;
  return cl + (ch - cl) * (p - lo);
}

// Calibrate a per-site CTR curve from GSC query rows (each {position, ctr,
// impressions}). Buckets by rounded position, takes the impression-weighted
// mean CTR per position, and only overrides the default where we have enough
// signal (≥ minImpr impressions in that bucket). Returns a full curve object.
function calibrateCurve(gscRows, { minImpr = 50 } = {}) {
  const buckets = {}; // pos -> {imprSum, ctrWeighted}
  for (const r of gscRows || []) {
    const pos = Math.round(r.position);
    if (pos < 1 || pos > 20) continue;
    const impr = r.impressions || 0;
    if (!impr) continue;
    if (!buckets[pos]) buckets[pos] = { impr: 0, w: 0 };
    buckets[pos].impr += impr;
    buckets[pos].w += (r.ctr || 0) * impr;
  }
  const curve = { ...DEFAULT_CTR };
  let calibratedPositions = 0;
  for (const pos of Object.keys(buckets)) {
    const b = buckets[pos];
    if (b.impr >= minImpr) { curve[pos] = b.w / b.impr; calibratedPositions++; }
  }
  // Enforce monotonic non-increase (CTR shouldn't rise with worse position) to
  // smooth out sparse-bucket noise.
  for (let p = 2; p <= 20; p++) {
    if (curve[p] > curve[p - 1]) curve[p] = curve[p - 1];
  }
  // Provenance must match the curve actually returned. With 1–3 calibrated
  // buckets the curve is a HYBRID (site overrides on top of the default base),
  // not pure default — reporting 'default' there misstated what the valuation
  // used. Report: >=4 = 'site-calibrated', 1–3 = 'partial', 0 = 'default'.
  const source = calibratedPositions >= 4 ? 'site-calibrated'
    : calibratedPositions > 0 ? 'partial'
    : 'default';
  return { curve, calibratedPositions, source };
}

// Value a list of keywords. Each kw: {keyword, volume, position, cpc, url}.
// Returns the same list enriched with estClicks + estValue, sorted by value.
function valueKeywords(keywords, { curve = DEFAULT_CTR } = {}) {
  return (keywords || []).map((k) => {
    // Clamp to ≥0 — SEMrush/GSC can return blanks or malformed values.
    const volume = Math.max(0, Number(k.volume) || 0);
    const cpc = Math.max(0, Number(k.cpc) || 0);
    const position = Math.max(0, Number(k.position) || 0);
    const ctr = ctrAt(position, curve);
    const estClicks = Math.round(volume * ctr);
    const estValue = Math.round(estClicks * cpc * 100) / 100;
    return { ...k, ctr: Math.round(ctr * 10000) / 10000, estClicks, estValue };
  }).sort((a, b) => b.estValue - a.estValue);
}

// Potential value if a keyword reached a target position (default page-1, pos 3).
// Used for "value at stake" on striking-distance keywords.
function upliftValue(k, { curve = DEFAULT_CTR, targetPos = 3 } = {}) {
  const volume = Number(k.volume) || 0, cpc = Number(k.cpc) || 0;
  const cur = Math.round(volume * ctrAt(Number(k.position) || 0, curve));
  const tgt = Math.round(volume * ctrAt(targetPos, curve));
  const gainClicks = Math.max(0, tgt - cur);
  return { gainClicks, gainValue: Math.round(gainClicks * cpc * 100) / 100, targetPos };
}

// Aggregate a valued keyword list into site-level totals.
function summarize(valued, { currency = 'GBP' } = {}) {
  const totalClicks = valued.reduce((s, k) => s + (k.estClicks || 0), 0);
  const totalValue = Math.round(valued.reduce((s, k) => s + (k.estValue || 0), 0) * 100) / 100;
  // "At risk": value tied up in page-2 (11-20) keywords — volatile, easily lost or won.
  const page2 = valued.filter((k) => k.position >= 10.5 && k.position <= 20.5);
  const atRiskValue = Math.round(page2.reduce((s, k) => s + (k.estValue || 0), 0) * 100) / 100;
  return {
    currency,
    totalEstClicks: totalClicks,
    totalEstValue: totalValue,
    monthlyValueLabel: `${totalValue.toLocaleString()} ${currency}/mo`,
    page2Count: page2.length,
    page2AtRiskValue: atRiskValue,
    topByValue: valued.slice(0, 10),
  };
}

export { DEFAULT_CTR, ctrAt, calibrateCurve, valueKeywords, upliftValue, summarize };
export default { ctrAt, calibrateCurve, valueKeywords, upliftValue, summarize };
