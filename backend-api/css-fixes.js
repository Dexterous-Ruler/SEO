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

// ── WCAG contrast math ──────────────────────────────────────────────────────
function hexToRgb(h) {
  let s = String(h || '').trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
function _lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function _lum(rgb) { return 0.2126 * _lin(rgb[0]) + 0.7152 * _lin(rgb[1]) + 0.0722 * _lin(rgb[2]); }
function contrastRatio(a, b) { const la = _lum(a), lb = _lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); }

// Compute a WCAG-compliant foreground for `fgHex` text over `bgHex` background that meets
// `target` (default 4.5:1). We blend the original foreground toward black AND toward white
// (whichever direction can actually reach the target for this background), binary-search
// the SMALLEST shift that meets it, and keep the candidate closest to the original colour.
// Returns a hex string, or null if already compliant / inputs unusable. This is safe
// precisely because Lighthouse hands us the REAL foreground+background — no guessing.
function compliantColor(fgHex, bgHex, target = 4.5) {
  const fg = hexToRgb(fgHex), bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  if (contrastRatio(fg, bg) >= target) return null;
  const search = (toward) => {
    if (contrastRatio(toward, bg) < target) return null;   // this extreme can't reach target
    let lo = 0, hi = 1, best = null;
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2;
      const c = fg.map((v, k) => v + (toward[k] - v) * t);
      if (contrastRatio(c, bg) >= target) { best = c; hi = t; } else { lo = t; }
    }
    return best;
  };
  const cands = [search([0, 0, 0]), search([255, 255, 255])].filter(Boolean);
  if (!cands.length) return null;
  const dist = (c) => Math.abs(c[0] - fg[0]) + Math.abs(c[1] - fg[1]) + Math.abs(c[2] - fg[2]);
  cands.sort((a, b) => dist(a) - dist(b));
  return rgbToHex(cands[0][0], cands[0][1], cands[0][2]);
}

// Parse Lighthouse color-contrast nodes (selector + fg/bg/target from the explanation)
// into real per-selector CSS that forces a compliant text colour. This is the AUTOMATIC
// contrast fix — no human colour-picking, because the audit gave us the actual colours.
function contrastRules(nodes) {
  const bySelector = new Map();
  for (const n of (nodes || [])) {
    const sel = (n.selector || '').trim();
    if (!sel || sel.length > 300) continue;
    const target = n.target || 4.5;
    const nw = compliantColor(n.fg, n.bg, target);
    if (!nw) continue;
    if (!bySelector.has(sel)) bySelector.set(sel, nw);   // first (worst) wins; dedupe by selector
  }
  if (!bySelector.size) return null;
  const lines = [...bySelector.entries()].map(([sel, col]) => `${sel} { color: ${col} !important; }`);
  return {
    note: `Raised ${bySelector.size} element(s) to a WCAG-compliant text colour (≥4.5:1), computed from each element's real foreground/background.`,
    css: `/* WCAG 1.4.3 contrast — auto-computed compliant text colours */\n${lines.join('\n')}`,
    manual: false,
  };
}

// Generate a CSS block from a list of findings. Each finding may carry an
// `_auditId` (PSI) or `id`/`auditId`, and color-contrast findings carry
// `contrastNodes:[{selector,fg,bg,target}]` for the real auto-fix.
function generateCssFixes(findings) {
  const seen = new Set();
  const rules = [];
  for (const f of findings || []) {
    const id = f._auditId || f.auditId || f.id;
    const isContrast = /contrast/i.test(id || '') || /contrast/i.test(f.title || '');
    const key = id || (isContrast ? 'color-contrast' : null);
    if (!key || seen.has(key)) continue;
    let r = (id && RULES[id]) ? RULES[id]() : null;
    if (!r && isContrast) {
      const nodes = f.contrastNodes || f._contrastNodes || [];
      r = contrastRules(nodes);   // real per-selector fix when we have the colours…
      if (!r) continue;           // …and no manual stub when we don't (honest: nothing to write)
    }
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
