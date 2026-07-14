// ===========================================================================
// modern-css fix generator — turns Lighthouse/a11y findings into ACTUAL,
// reviewable CSS code (not just text advice). Closes the "text-only proposals,
// no CSS generation" gap.
//
// Philosophy: only emit SAFE, conservative, broadly-correct rules that a human
// reviews before they hit a child theme. We never touch live theme files
// directly from the web path — we generate the CSS block, show it in the review
// queue, and (CLI) append it to the child-theme stylesheet on approval.
// Zero dependencies.
// ===========================================================================

// Deterministic rule templates keyed by Lighthouse/axe audit id. Each returns
// { css, note, manual } — `manual` flags fixes that need a value we can't infer.
const RULES = {
  // CLS: reserve space for media so layout doesn't jump.
  'layout-shift-elements': () => ({
    note: 'Reserve intrinsic space for media to stop layout shift (CLS).',
    // Browsers map the width/height HTML attributes to aspect-ratio when height
    // is auto (Chrome 79+, Firefox 71+, Safari 14+) — cross-browser, no attr()
    // needed. (aspect-ratio: attr(width)/attr(height) is a no-op outside very
    // recent Chromium.) Scope height:auto to elements that carry BOTH attributes
    // so fixed-size video/iframe embeds aren't collapsed.
    css: `/* CLS: keep media from reflowing once loaded */
img, video, iframe { max-width: 100%; }
img[width][height], video[width][height], iframe[width][height] { height: auto; }`,
  }),
  'non-composited-animations': () => ({
    note: 'Promote animations to compositor-friendly properties.',
    css: `/* Prefer transform/opacity animations (GPU-composited, no layout/paint) */
[class*="animate"], [data-animation] { will-change: transform, opacity; }`,
  }),
  // Font loading: avoid invisible text (FOIT) → improves FCP/LCP + CLS.
  'font-display': () => ({
    note: 'Swap-in fallback text while web fonts load (add to your @font-face blocks).',
    css: `/* Add font-display: swap to every @font-face. Example: */
@font-face { font-family: "YourFont"; font-display: swap; /* src: …unchanged… */ }`,
    manual: true,
  }),
  // A11y: minimum target size (WCAG 2.5.8) — scoped to interactive controls.
  'target-size': () => ({
    note: 'Ensure interactive controls meet the 24×24px minimum (WCAG 2.5.8).',
    css: `/* WCAG 2.5.8 target size — applied to small interactive controls */
a, button, [role="button"], input[type="checkbox"], input[type="radio"] {
  min-height: 24px; min-width: 24px;
}
nav a, .menu a { display: inline-flex; align-items: center; min-height: 24px; }`,
  }),
  // A11y: visible focus for keyboard users (WCAG 2.4.7 / 2.4.11).
  'focus-visible': () => ({
    note: 'Visible keyboard-focus indicator (WCAG 2.4.7 / 2.4.11).',
    css: `/* Visible focus for keyboard users — does not affect mouse users */
:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }`,
  }),
  // Perf: reduce layout work from huge DOM is structural — emit a hint only.
  'dom-size': () => ({
    note: 'Large DOM — contain offscreen sections to cut layout/paint cost.',
    css: `/* Let the browser skip rendering offscreen sections (use carefully) */
.below-the-fold, [data-defer-render] { content-visibility: auto; contain-intrinsic-size: 1px 1000px; }`,
    manual: true,
  }),
  // Perf: respect reduced-motion (best practice + a11y).
  'prefers-reduced-motion': () => ({
    note: 'Honour reduced-motion preference.',
    css: `@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}`,
  }),
};

// Contrast needs the actual target color, which we cannot infer from a score.
// We emit a clearly-marked template the reviewer completes (or pairs with a
// Claude-suggested value). This is honest: we don't guess brand colors.
function contrastTemplate(selector = '.low-contrast', fg = '#1a1a1a') {
  return { note: 'Raise text contrast to ≥4.5:1 (WCAG 1.4.3). Fill in the real selector/colour.', css: `/* WCAG 1.4.3 contrast — replace selector + colour with the flagged element's */
${selector} { color: ${fg}; }`, manual: true };
}

// Generate a CSS block from a list of findings. Each finding may carry an
// `_auditId` (PSI) or `id`/`auditId`. Returns { css, rules, manualCount }.
function generateCssFixes(findings) {
  const seen = new Set();
  const rules = [];
  for (const f of findings || []) {
    const id = f._auditId || f.auditId || f.id;
    const isContrast = /contrast/i.test(id || '') || /contrast/i.test(f.title || '');
    const key = id || (isContrast ? 'color-contrast' : null);
    if (!key || seen.has(key)) continue;
    let r = (id && RULES[id]) ? RULES[id]() : null;
    if (!r && isContrast) r = contrastTemplate();
    if (!r) continue;
    seen.add(key);
    rules.push({ auditId: key, note: r.note, css: r.css, manual: !!r.manual });
  }
  // Always include the universally-safe baseline if any perf/a11y fix is present.
  if (rules.length && !seen.has('prefers-reduced-motion')) rules.push({ auditId: 'prefers-reduced-motion', ...RULES['prefers-reduced-motion']() });
  const header = `/* ===========================================================\n   seo-agent generated CSS fixes — review before deploying.\n   Append to your CHILD THEME stylesheet, not the parent.\n   Generated ${'{{DATE}}'} · ${rules.length} rule group(s)\n   =========================================================== */\n`;
  const css = header + rules.map((r) => `\n/* [${r.auditId}] ${r.note}${r.manual ? ' (NEEDS REVIEW: fill in real values)' : ''} */\n${r.css}`).join('\n');
  return { css, rules, manualCount: rules.filter((r) => r.manual).length, fixableCount: rules.filter((r) => !r.manual).length };
}

export { generateCssFixes, RULES };
export default { generateCssFixes };
