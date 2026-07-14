// ===========================================================================
// Correlation analysis — does fixing performance actually move THIS site's
// rankings? We hold both PSI/CWV history (audits) and GSC outcomes (position,
// clicks). Join them into a page×time panel and compute pairwise SPEARMAN rank
// correlation (robust to non-linearity + outliers; CWV→ranking is a weak,
// threshold-style relationship, not linear).
//
// ALWAYS correlational, never causal — and meaningless at small n. We report n
// and an approximate two-sided p-value, and the UI must label it as such.
// Zero dependencies.
// ===========================================================================

// Average-rank transform (ties share the mean of their rank span).
function rankify(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(x, y) {
  const n = x.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i]; }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

// Spearman ρ = Pearson on the rank-transformed series.
function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return { rho: null, n: x.length };
  const rho = pearson(rankify(x), rankify(y));
  const n = x.length;
  // Approximate two-sided p-value via t-distribution (df = n-2).
  let p = null;
  if (Math.abs(rho) < 1 && n > 2) {
    const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
    p = studentTwoSidedP(t, n - 2);
  } else if (Math.abs(rho) >= 1) p = 0;
  return { rho: Math.round(rho * 1000) / 1000, n, p: p == null ? null : Math.round(p * 1000) / 1000 };
}

// Two-sided p-value for Student's t (regularized incomplete beta). Good enough
// for a "is this even worth looking at" flag — not a stats-package replacement.
function studentTwoSidedP(t, df) {
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x); // = 2 * one-sided tail
}
function betai(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
function betacf(a, b, x) {
  const MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function gammaln(xx) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = xx, y = xx, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Build a correlation matrix over a panel of observations.
//   panel: array of objects (each an aligned observation)
//   metrics: [{key, label, invert?}]  — invert flips sign so "higher = better"
//            for metrics where lower is better (position, LCP, CLS, INP).
// Returns { matrix:[[...]], metrics, n, pairs:[{a,b,rho,p,n,strength}] }.
function correlationMatrix(panel, metrics) {
  const cols = metrics.map((m) => panel.map((r) => {
    const v = getPath(r, m.key);
    return v == null ? null : (m.invert ? -v : v);
  }));
  const M = metrics.length;
  const matrix = Array.from({ length: M }, () => new Array(M).fill(null));
  const pairs = [];
  for (let i = 0; i < M; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < M; j++) {
      // Pairwise-complete: drop rows where either metric is null.
      const xs = [], ys = [];
      for (let r = 0; r < panel.length; r++) {
        if (cols[i][r] != null && cols[j][r] != null) { xs.push(cols[i][r]); ys.push(cols[j][r]); }
      }
      const s = spearman(xs, ys);
      matrix[i][j] = matrix[j][i] = s.rho;
      if (s.rho != null) pairs.push({ a: metrics[i].label, b: metrics[j].label, aKey: metrics[i].key, bKey: metrics[j].key, rho: s.rho, p: s.p, n: s.n, strength: strengthLabel(s.rho, s.n, s.p) });
    }
  }
  // Honest headline n: rows that actually contributed to at least one pairwise
  // correlation (>=2 non-null metric values). panel.length overstates usable
  // observations when GSC dates don't align and many rows are half-empty.
  let n = 0;
  for (let r = 0; r < panel.length; r++) {
    let present = 0;
    for (let i = 0; i < M; i++) { if (cols[i][r] != null) { present++; if (present >= 2) break; } }
    if (present >= 2) n++;
  }
  pairs.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
  return { metrics: metrics.map((m) => m.label), matrix, n, pairs };
}

function getPath(obj, path) {
  const parts = path.split('.');
  let v = obj;
  for (const p of parts) { if (v == null) return null; v = v[p]; }
  return typeof v === 'number' ? v : (v == null ? null : Number(v) || null);
}

function strengthLabel(rho, n, p) {
  if (n < 8) return 'too few points';
  const a = Math.abs(rho);
  const sig = p != null && p < 0.05;
  const mag = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'negligible';
  return sig ? `${mag} (p<0.05)` : `${mag} (not significant)`;
}

export { spearman, pearson, correlationMatrix };
export default { spearman, pearson, correlationMatrix };
