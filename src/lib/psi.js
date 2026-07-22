import { config } from '../config.js';

// Google PageSpeed Insights (PSI) API client — the SCALE tier.
// Runs on Google's servers (no local Chrome), 25,000 req/day free, includes
// CrUX field data. This is how we audit 1,498 URLs without melting a laptop.
//
// Get a key: Google Cloud Console → enable PageSpeed Insights API → create key
// → RESTRICT it (an exposed unrestricted key once cost a dev $55k). Put in $PSI_KEY.

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

function pct(v) { return v == null ? null : Math.round(v * 100); }

// Run PSI for one URL + strategy (mobile|desktop). Returns normalized summary.
export async function runPsi(url, { strategy = 'mobile', key = process.env.PSI_KEY } = {}) {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append('category', c);
  if (key) params.set('key', key);

  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PSI ${res.status} for ${url}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const lr = data.lighthouseResult || {};
  const cat = lr.categories || {};
  const audits = lr.audits || {};

  const scores = {
    performance: pct(cat.performance?.score),
    accessibility: pct(cat.accessibility?.score),
    bestPractices: pct(cat['best-practices']?.score),
    seo: pct(cat.seo?.score),
  };
  const cwv = {
    lcp: audits['largest-contentful-paint']?.numericValue ?? null,
    inp: audits['interaction-to-next-paint']?.numericValue ?? null,
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    fcp: audits['first-contentful-paint']?.numericValue ?? null,
    tbt: audits['total-blocking-time']?.numericValue ?? null,
  };
  // CrUX field data (real-user), when available for the URL/origin.
  const field = data.loadingExperience?.metrics
    ? {
        lcp: data.loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
        inp: data.loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
        cls: data.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null,
        overall: data.loadingExperience.overall_category ?? null,
      }
    : null;

  return { url, strategy, scores, cwv, field, source: 'psi' };
}

// Statistics helpers.
function median(arr) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
function iqr(arr) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (a.length < 2) return 0;
  const q = (p) => { const i = (a.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return Math.round((q(0.75) - q(0.25)) * 10) / 10;
}

// Run PSI N times and return MEDIAN scores + IQR (run-to-run noise band).
// Lighthouse lab scores have ±5-10pt variance; the median of N is ~2x stabler.
// Returns { url, strategy, scores (median), scoresIqr, runs, cwv (median), field }.
export async function runPsiMedian(url, { strategy = 'mobile', key = process.env.PSI_KEY, n = 3 } = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    try { runs.push(await runPsi(url, { strategy, key })); }
    catch (e) { if (i === 0) throw e; /* tolerate later-run failures */ }
  }
  if (!runs.length) throw new Error('PSI returned no runs');
  const cats = ['performance', 'accessibility', 'bestPractices', 'seo'];
  const scores = {}, scoresIqr = {};
  for (const c of cats) {
    const vals = runs.map((r) => r.scores[c]);
    scores[c] = median(vals);
    scoresIqr[c] = iqr(vals);
  }
  const cwvKeys = ['lcp', 'inp', 'cls', 'fcp', 'tbt'];
  const cwv = {};
  for (const k of cwvKeys) cwv[k] = median(runs.map((r) => r.cwv[k]));
  // Field (CrUX) is already a stable 28-day aggregate — take the last run's.
  const field = runs[runs.length - 1].field;
  return { url, strategy, scores, scoresIqr, runs: runs.length, cwv, field, source: 'psi-median' };
}

// Decide if a score change is SIGNIFICANT vs run-to-run noise.
// significant when |delta| > max(1.5 × IQR, 2) — IQR from the baseline run.
export function isSignificantChange(delta, baselineIqr) {
  if (delta == null) return false;
  const band = Math.max(1.5 * (baselineIqr || 0), 2);
  return Math.abs(delta) > band;
}

// Batch PSI over many URLs with concurrency + polite throttling.
// Returns results in input order; failures become { url, error }.
export async function runPsiBatch(urls, { strategy = 'mobile', concurrency = 4, key, onResult } = {}) {
  const results = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      try {
        const r = await runPsi(urls[i], { strategy, key });
        results[i] = r;
      } catch (e) {
        results[i] = { url: urls[i], error: e.message };
      }
      if (onResult) onResult(results[i], i, urls.length);
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, urls.length) }, worker);
  await Promise.all(pool);
  return results;
}

export function hasKey() {
  return Boolean(process.env.PSI_KEY);
}

// Full audit detail for one URL+category — returns the raw audits map plus a
// distilled view (opportunities, failing diagnostics, failing-element items).
// Retries on PSI "lite" responses (the API sometimes omits audits under load).
// retries 5→2, backoff 8s→4s: the old worst case (~5 calls + 32s of sleeps ≈ 150-200s)
// STRUCTURALLY exceeded the 95s request budget — the route 504'd while retries kept
// burning PSI quota behind the abandoned request.
export async function runPsiDetailed(url, { strategy = 'mobile', categories = ['performance'], key = process.env.PSI_KEY, retries = 2, backoffMs = 4000 } = {}) {
  const params = new URLSearchParams({ url, strategy });
  for (const c of categories) params.append('category', c);
  if (key) params.set('key', key);

  let lr = null, lastErr = null;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`${ENDPOINT}?${params}`);
    const j = await res.json().catch(() => ({}));
    if (j.error) { lastErr = j.error.message; }
    else if (j.lighthouseResult?.audits) { lr = j.lighthouseResult; break; }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, backoffMs));
  }
  if (!lr) throw new Error(`PSI detailed failed for ${url}: ${lastErr || 'lite response (no audits)'}`);

  const A = lr.audits;
  const opportunities = [];
  for (const id in A) {
    const a = A[id];
    if (a?.details?.type === 'opportunity' && a.numericValue > 0) {
      opportunities.push({ id, title: a.title, ms: Math.round(a.numericValue) });
    }
  }
  opportunities.sort((x, y) => y.ms - x.ms);

  // Lighthouse itself says which category each audit belongs to (auditRefs) — use that as
  // authoritative rather than guessing from the audit id downstream.
  const auditCategory = {};
  try {
    for (const [catKey, catObj] of Object.entries(lr.categories || {})) {
      for (const ref of (catObj.auditRefs || [])) if (!auditCategory[ref.id]) auditCategory[ref.id] = catKey;
    }
  } catch (e) { /* best-effort */ }
  const failing = [];
  for (const id in A) {
    const a = A[id];
    if (a && a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative') {
      failing.push({ id, title: a.title, score: a.score, displayValue: a.displayValue || null, items: a.details?.items?.length || 0, category: auditCategory[id] || null });
    }
  }

  // All requested category scores (0-100), keyed by UI-friendly names.
  const catScore = (k) => lr.categories[k]?.score != null ? Math.round(lr.categories[k].score * 100) : null;
  const allScores = {
    performance: catScore('performance'),
    accessibility: catScore('accessibility'),
    bestPractices: catScore('best-practices'),
    seo: catScore('seo'),
  };

  return {
    url, strategy,
    score: Math.round((lr.categories[categories[0]]?.score ?? 0) * 100),
    allScores,
    metrics: {
      lcp: A['largest-contentful-paint']?.numericValue ?? null,
      tbt: A['total-blocking-time']?.numericValue ?? null,
      cls: A['cumulative-layout-shift']?.numericValue ?? null,
      si: A['speed-index']?.numericValue ?? null,
    },
    opportunities,
    failing,
    audits: A,
  };
}

export default { runPsi, runPsiMedian, isSignificantChange, runPsiBatch, runPsiDetailed, hasKey };
