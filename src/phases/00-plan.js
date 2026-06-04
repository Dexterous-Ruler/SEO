import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import * as store from '../lib/store.js';
import * as claude from '../../backend-api/claude.js';

// Phase 0 — grill-me. BEFORE any audit/change, produce a decision-ready plan:
// open questions, a prioritized sequence, and risk/guardrail notes. This makes
// the documented grill-me skill an actual executable step (not doc-only).
export async function plan() {
  log.step('Phase 0 — grill-me (plan before code)');
  const site = config.site || {};
  const baseUrl = config.wp.baseUrl;
  let scores = null;
  try { scores = store.latestScores ? store.latestScores() : null; } catch (e) {}

  let markdown;
  try {
    markdown = await claude.projectPlan({
      siteName: site.ai?.organization?.name || site.name,
      niche: site.niche || site.ai?.niche,
      baseUrl,
      keyPages: site.keyPages || [],
      scores,
      goals: site.goals,
    });
  } catch (e) {
    log.warn(`Could not generate plan via Claude (${e.message}). Writing a checklist fallback.`);
    markdown = fallbackPlan(site, baseUrl);
  }

  mkdirSync(config.paths.reports, { recursive: true });
  const out = join(config.paths.reports, 'plan.md');
  writeFileSync(out, `# Plan — ${site.ai?.organization?.name || site.name || baseUrl}\n_Generated ${new Date().toISOString()}_\n\n${markdown}\n`, 'utf8');
  log.ok(`Plan → ${out}`);
  log.dim('Review the plan (open questions + sequence) before running the full pipeline.');
  return { plan: markdown, path: out };
}

function fallbackPlan(site, baseUrl) {
  return [
    '## Open questions',
    '- Is write access to staging or production? (must stay DRY_RUN until confirmed)',
    '- Any brand/legal constraints on title/meta wording (YMYL)?',
    '- Which pages are the priority key pages?',
    '',
    '## Plan',
    '1. Baseline Lighthouse/PSI across key pages (read-only).',
    '2. Image optimization (WebP) — safest, highest-impact, closed-loop.',
    '3. Metadata (title/meta/canonical) via Rank Math, verify-after-write.',
    '4. Schema + AI-SEO (per-page JSON-LD, llms.txt, citable facts).',
    '5. Performance/CSS + accessibility fixes (child-theme, human-applied).',
    '6. Internal links + re-verify before/after.',
    '',
    '## Risks & guardrails',
    '- Never write to production without explicit approval (DRY_RUN guard).',
    '- Do not edit Elementor `_elementor_data`; media-library + Rank Math only.',
    '- Verify every write stuck; everything is rollback-able via the ledger.',
  ].join('\n');
}

export default { plan };
