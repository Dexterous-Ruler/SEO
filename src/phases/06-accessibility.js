import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { slugForUrl } from '../lib/report.js';

// Accessibility phase (WCAG 2.2 AA). Lighthouse runs axe-core, which catches
// ~30-40% of issues automatically. This phase distills those into proposals and
// flags the criteria that still need manual review (focus order, meaning, context).

// axe/Lighthouse audit id → WCAG criterion + concrete fix.
const A11Y = {
  'color-contrast': { wcag: '1.4.3 Contrast (AA)', fix: 'Raise text contrast to ≥4.5:1 (3:1 large). If brand color is locked, flag for design review.' },
  'image-alt': { wcag: '1.1.1 Non-text Content', fix: 'Add descriptive alt; empty alt="" for decorative images.' },
  'link-name': { wcag: '2.4.4 Link Purpose', fix: 'Give links discernible text (aria-label or visible text).' },
  'button-name': { wcag: '4.1.2 Name, Role, Value', fix: 'Give buttons accessible names.' },
  'label': { wcag: '3.3.2 Labels or Instructions', fix: 'Associate a programmatic <label> with every form control.' },
  'aria-required-attr': { wcag: '4.1.2 Name, Role, Value', fix: 'Add required ARIA attributes for the role.' },
  'aria-valid-attr-value': { wcag: '4.1.2 Name, Role, Value', fix: 'Fix invalid ARIA attribute values.' },
  'document-title': { wcag: '2.4.2 Page Titled', fix: 'Add a descriptive <title>.' },
  'html-has-lang': { wcag: '3.1.1 Language of Page', fix: 'Add lang attribute to <html>.' },
  'heading-order': { wcag: '1.3.1 Info and Relationships', fix: 'Use a logical heading order (no skipped levels).' },
  'duplicate-id-aria': { wcag: '4.1.1 Parsing', fix: 'Make ARIA ids unique.' },
  'list': { wcag: '1.3.1 Info and Relationships', fix: 'Use proper list markup (<ul>/<ol>/<li>).' },
  'tabindex': { wcag: '2.4.3 Focus Order', fix: 'Avoid positive tabindex; keep a natural focus order.' },
  'target-size': { wcag: '2.5.8 Target Size (Minimum, AA, new in 2.2)', fix: 'Make touch targets ≥24×24px.' },
};

// WCAG 2.2 AA criteria that automation can't fully verify — always surface as manual checks.
const MANUAL_CHECKS = [
  { wcag: '2.4.7 Focus Visible', note: 'Verify a clearly visible focus indicator on every interactive element.' },
  { wcag: '2.4.11 Focus Not Obscured (Minimum, 2.2)', note: 'Ensure focused elements are not hidden by sticky headers/footers.' },
  { wcag: '2.5.7 Dragging Movements (2.2)', note: 'Provide a single-pointer alternative to any drag interaction.' },
  { wcag: '3.2.6 Consistent Help (2.2)', note: 'Keep help mechanisms in a consistent location across pages.' },
  { wcag: '3.3.7 Redundant Entry (2.2)', note: "Don't ask users to re-enter info already provided in the same process." },
  { wcag: '3.3.8 Accessible Authentication (2.2)', note: 'No cognitive-function test (e.g. puzzle) required to log in.' },
  { wcag: '2.1.1 Keyboard', note: 'Manually tab through the whole page; everything operable, no traps.' },
];

export function analyze(url) {
  const slug = slugForUrl(url);
  const jsonPath = join(config.paths.reports, `${slug}.json`);
  if (!existsSync(jsonPath)) {
    return { url, error: `No audit JSON at ${jsonPath}. Run \`audit\` first.`, proposals: [] };
  }
  const page = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const runs = page.lighthouse || [];
  const proposals = [];
  const seen = new Set();

  for (const r of runs) {
    for (const f of r.findings || []) {
      if (f.category !== 'accessibility') continue;
      const info = A11Y[f.id];
      const key = f.id;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({
        phase: 'accessibility',
        field: f.id,
        title: f.title,
        detail: info ? `${info.fix} [${info.wcag}]` : f.description?.slice(0, 160) || f.title,
        wcag: info?.wcag || 'WCAG 2.2 AA',
      });
    }
  }
  return { url, proposals, manualChecks: MANUAL_CHECKS };
}

export async function accessibility(urls) {
  log.step(`Accessibility / WCAG 2.2 AA — ${urls.length} page(s)`);
  const results = [];
  for (const url of urls) {
    const r = analyze(url);
    if (r.error) { log.warn(`${url}: ${r.error}`); continue; }
    results.push(r);
    log.ok(`${url} — ${r.proposals.length} automated finding(s) + ${MANUAL_CHECKS.length} manual checks`);
  }
  mkdirSync(config.paths.reports, { recursive: true });
  const proposals = results.flatMap((r) => r.proposals.map((p) => ({ ...p, url: r.url })));
  const outPath = join(config.paths.reports, 'accessibility.proposals.json');
  writeFileSync(outPath, JSON.stringify({
    generated: new Date().toISOString(),
    proposals,
    manualChecks: MANUAL_CHECKS,
  }, null, 2));
  log.ok(`Accessibility proposals written: ${outPath}`);
  log.dim(`  + ${MANUAL_CHECKS.length} WCAG 2.2 criteria flagged for manual review (see JSON).`);
  return proposals;
}

export default { accessibility, analyze, MANUAL_CHECKS };
