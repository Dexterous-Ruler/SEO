// ===========================================================================
// Impact × Effort prioritization (RICE-style) — turns a flat list of audit
// findings into a ranked, defensible worklist.
//
// Replaces the old impactFor() heuristic (buckets on raw Lighthouse savings-ms
// — value-blind AND effort-blind). Here:
//   score = (Reach × Impact × Confidence) / Effort
//   Reach      — pages/visitors affected (GSC clicks on the page when known, else 1)
//   Impact     — category weight × severity (SEO/perf matter most for rankings)
//   Confidence — how sure the fix actually helps (recipe-backed fixes score high;
//                CWV is threshold-style so perf gets a haircut)
//   Effort     — engineering cost (a meta-tag write ≠ a render-path refactor)
// Every component is transparent and returned, so the ranking is auditable —
// no black box. Zero dependencies.
// ===========================================================================

// Category weight — how much this discipline moves the outcomes we care about.
const CAT_WEIGHT = { seo: 1.0, performance: 0.8, accessibility: 0.55, image: 0.6, 'best-practices': 0.4 };

// Effort (person-cost, 1 = trivial … 5 = multi-day) keyed by channel/discipline.
const EFFORT_BY_CHANNEL = { 'rest-write': 1, 'theme/css': 3, 'plugin': 2.5, 'server': 4, 'content': 2 };
function effortFor(f) {
  if (f.channel && EFFORT_BY_CHANNEL[f.channel] != null) return EFFORT_BY_CHANNEL[f.channel];
  if (f.disc === 'seo') return 1.2;          // metadata edits — cheap
  if (f.disc === 'image') return 1.5;        // re-export / compress
  if (f.disc === 'accessibility') return 3;  // markup/contrast work
  if (f.disc === 'performance') return 4;    // render-path / asset work
  return 2.5;
}

// Confidence the fix delivers the modeled gain (0..1).
function confidenceFor(f) {
  if (f._field || f.channel === 'rest-write') return 0.9; // deterministic write we control
  if (f.disc === 'seo') return 0.85;
  if (f.disc === 'accessibility') return 0.8;
  if (f.disc === 'image') return 0.85;
  if (f.disc === 'performance') return 0.55; // CWV is a weak, threshold-style factor
  return 0.6;
}

// Severity 1..10 from the finding's gap (gapPts) or impact label.
function severityFor(f) {
  if (f.gapPts != null) return Math.max(1, Math.min(10, f.gapPts));
  const lab = (f.impact || '').toLowerCase();
  return lab === 'high' ? 8 : lab === 'medium' ? 5 : 2;
}

// Reach multiplier from page traffic (GSC clicks). Log-damped so a 10k-click page
// doesn't swamp everything; unknown pages default to 1 (neutral).
function reachFor(f, trafficByPage) {
  const raw = trafficByPage ? (trafficByPage[f.page] ?? trafficByPage[(f.page || '').replace(/\/$/, '')]) : null;
  if (raw == null) return { reach: 1, clicks: null };
  const clicks = Math.max(0, Number(raw) || 0); // guard malformed/negative traffic
  return { reach: 1 + Math.log10(1 + clicks), clicks };
}

function quadrant(impact, effort) {
  const hiImpact = impact >= 4, hiEffort = effort >= 3;
  if (hiImpact && !hiEffort) return 'Quick win';
  if (hiImpact && hiEffort) return 'Major project';
  if (!hiImpact && !hiEffort) return 'Fill-in';
  return 'Deprioritize';
}

// Rank a list of findings. opts.trafficByPage: { page → clicks } (from GSC).
// opts.valueByPage: { page → £/mo } (from traffic-value) further boosts Impact.
function prioritizeFindings(findings, { trafficByPage = null, valueByPage = null } = {}) {
  const items = (findings || []).map((f) => {
    const catW = CAT_WEIGHT[f.disc] != null ? CAT_WEIGHT[f.disc] : 0.5;
    const severity = severityFor(f);
    const { reach, clicks } = reachFor(f, trafficByPage);
    const confidence = confidenceFor(f);
    const effort = effortFor(f);
    // Impact (0..~8): category weight × severity, optionally amplified by the
    // page's modelled £ value (normalized, log-damped).
    let impact = catW * severity * 0.8;
    let valueBoost = 1;
    if (valueByPage) {
      const v = valueByPage[f.page] ?? valueByPage[(f.page || '').replace(/\/$/, '')];
      if (v != null && v > 0) { valueBoost = 1 + Math.min(1.5, Math.log10(1 + v) / 2); impact *= valueBoost; }
    }
    impact = Math.round(impact * 10) / 10;
    const rice = (reach * impact * confidence) / effort;
    return {
      id: f.id, title: f.title, page: f.page, disc: f.disc, channel: f.channel,
      severity, reach: Math.round(reach * 100) / 100, clicks, confidence, effort,
      impact, valueBoost: Math.round(valueBoost * 100) / 100,
      score: Math.round(rice * 100) / 100,
      quadrant: quadrant(impact, effort),
      detail: f.detail,
    };
  });
  // Normalize score to 0..100 for display.
  const max = items.reduce((m, it) => Math.max(m, it.score), 0) || 1;
  for (const it of items) it.priority = Math.round((it.score / max) * 100);
  items.sort((a, b) => b.score - a.score);
  return items;
}

export { prioritizeFindings, CAT_WEIGHT };
export default { prioritizeFindings };
