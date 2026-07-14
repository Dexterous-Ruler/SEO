// ===========================================================================
// Anomaly detection — robust outlier flags on time-series (GSC clicks / position
// and audit-score history). Catches a Google-update hit or a tracking break
// within days instead of at the next monthly review.
//
// Method: per point, baseline = MEDIAN of a trailing window; scale = MAD of that
// window. Modified z-score z = 0.6745·(x − median)/MAD (Iglewicz–Hoaglin).
// Robust to the very spikes we're hunting — a mean/stdev z-score gets dragged by
// the outlier it's trying to find. Flag |z| ≥ 3.5 (the standard threshold).
//
// We anchor on CLICKS and POSITION, never impressions: GSC had an
// impression-inflation bug (May 2025–Apr 2026) that poisons impression baselines.
// Zero dependencies.
// ===========================================================================

function median(arr) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Median absolute deviation (robust spread).
function mad(arr, med) {
  const m = med == null ? median(arr) : med;
  if (m == null) return 0;
  return median(arr.map((x) => Math.abs(x - m)));
}

// EWMA smoothing — used for the "expected" line shown in charts.
function ewma(series, alpha = 0.3) {
  let e = null;
  return series.map((x) => { e = e == null ? x : alpha * x + (1 - alpha) * e; return e; });
}

// Detect anomalies in ONE numeric series.
//   values: number[]   (chronological)
//   dates:  string[]   (aligned with values; optional)
//   window: trailing points used for the robust baseline (default 14)
//   threshold: modified-z cutoff (default 3.5)
//   direction: 'drop' flags only negative spikes, 'rise' only positive, 'both' either
// Returns { points:[{i,date,value,expected,z,anomaly,direction}], anomalies:[...] }
function detectSeries(values, { dates = [], window = 14, threshold = 3.5, direction = 'both', minHistory } = {}) {
  // How many prior points we require before scoring. Dense series (GSC daily)
  // want a solid baseline; sparse series (audits run occasionally) must be able
  // to flag with fewer — else no anomaly can ever fire until ~8 data points.
  const minHist = minHistory != null ? minHistory : Math.min(7, window);
  const exp = ewma(values, 0.3);
  const points = values.map((v, i) => {
    // Baseline from the trailing window BEFORE this point (no leakage).
    const start = Math.max(0, i - window);
    const hist = values.slice(start, i);
    let z = 0, expected = exp[i];
    if (hist.length >= minHist) {
      const med = median(hist);
      const md = mad(hist, med);
      // 1.4826·MAD ≈ σ for normal data; guard MAD=0 with a tiny-window fallback.
      const scale = md > 0 ? 1.4826 * md : (med ? Math.max(1, med * 0.1) : 1);
      z = (v - med) / scale;
      expected = med;
    }
    const dir = z < 0 ? 'drop' : 'rise';
    let anomaly = Math.abs(z) >= threshold;
    if (anomaly && direction !== 'both' && dir !== direction) anomaly = false;
    return { i, date: dates[i] || null, value: v, expected: Math.round(expected * 100) / 100, z: Math.round(z * 100) / 100, anomaly, direction: dir };
  });
  return { points, anomalies: points.filter((p) => p.anomaly) };
}

// Run anomaly detection over a GSC daily series. Flags click DROPS and position
// RISES (worsening) — the two that signal a problem.
function detectGscDaily(daily, { window = 14, threshold = 3.5 } = {}) {
  const rows = (daily || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const dates = rows.map((r) => r.date);
  const clicks = detectSeries(rows.map((r) => r.clicks || 0), { dates, window, threshold, direction: 'drop' });
  const position = detectSeries(rows.map((r) => r.position || 0), { dates, window, threshold, direction: 'rise' });
  // Most-recent-first list of flagged events for the activity feed / chatbot.
  const events = [];
  for (const p of clicks.anomalies) events.push({ date: p.date, metric: 'clicks', value: p.value, expected: p.expected, z: p.z, severity: Math.abs(p.z) >= 5 ? 'high' : 'medium', note: `Clicks ${p.value} vs expected ~${p.expected} (z ${p.z})` });
  for (const p of position.anomalies) events.push({ date: p.date, metric: 'position', value: p.value, expected: p.expected, z: p.z, severity: Math.abs(p.z) >= 5 ? 'high' : 'medium', note: `Avg position worsened to ${p.value} vs ~${p.expected} (z ${p.z})` });
  events.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { clicks: clicks.points, position: position.points, events, latest: events[0] || null };
}

// Run anomaly detection over audit-score history (regression watch). Scores
// EACH category separately AND the composite — a single-category crash (e.g.
// Performance 90→55) barely moves the 4-way-averaged composite, so composite-
// only detection misses real regressions. We surface per-category drops.
function detectAuditHistory(history, { window = 10, threshold = 3.5, minHistory = 4 } = {}) {
  const rows = (history || []).slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const cats = ['performance', 'accessibility', 'bestPractices', 'seo'];
  // Composite = average of the categories that ACTUALLY have a score. A missing/
  // null category (PSI can return null for a category) must NOT be coerced to 0,
  // or the composite craters ~20+pts for that run and the detector cries wolf.
  // Returns null only when every category is absent (a fully-failed audit run).
  const comp = (s) => {
    const vals = cats.map((c) => s[c]).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((t, v) => t + v, 0) / vals.length) : null;
  };
  // Composite series (back-compat: same { points, anomalies } shape). Drop runs
  // whose composite is null (all categories failed) WITH their aligned dates, so
  // a failed run isn't scored as a huge 0-drop.
  const compRows = rows.map((r) => ({ ts: r.ts, v: comp(r.scores || {}) })).filter((x) => x.v != null);
  const res = detectSeries(compRows.map((x) => x.v), { dates: compRows.map((x) => x.ts), window, threshold, direction: 'drop', minHistory });
  // Per-category regression events.
  const events = [];
  for (const c of cats) {
    // Drop only the null points (a run where THIS category had no score), keeping
    // their aligned dates — instead of skipping the entire category, which would
    // silently blind us to real regressions across the rest of the history.
    const compact = [];
    for (const r of rows) { const v = (r.scores || {})[c]; if (v != null) compact.push({ ts: r.ts, v }); }
    if (!compact.length) continue;
    const d = detectSeries(compact.map((x) => x.v), { dates: compact.map((x) => x.ts), window, threshold, direction: 'drop', minHistory });
    for (const p of d.anomalies) {
      events.push({ date: p.date, category: c, value: p.value, expected: p.expected, z: p.z, severity: Math.abs(p.z) >= 5 ? 'high' : 'medium', note: `${c} score dropped to ${p.value} vs ~${p.expected} (z ${p.z})` });
    }
  }
  events.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { ...res, categoryEvents: events, regressionCount: res.anomalies.length + events.length };
}

export { detectSeries, detectGscDaily, detectAuditHistory, ewma, median, mad };
export default { detectSeries, detectGscDaily, detectAuditHistory };
