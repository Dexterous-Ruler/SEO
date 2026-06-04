import { config } from '../config.js';
import { log } from '../lib/logger.js';
import * as lh from '../lib/lighthouse-runner.js';
import { writeReport, writeSummary } from '../lib/report.js';
import { snapshotBaseline } from '../lib/verify.js';
import { plan } from './00-plan.js';
import { scanAndOptimize } from './02-images.js';
import { performance } from './03-performance.js';
import { auditSeo } from './04-seo.js';
import { aiSeo } from './05-ai-seo.js';
import { accessibility } from './06-accessibility.js';
import { writeApprovalWorksheet } from '../lib/approval.js';

// Full orchestrated audit run: phases 1-6 + approval worksheet.
// Read-only / proposal-only — stops at the human approval gate by design.
// Apply happens separately via `apply` after the human signs off.

export async function runAll(urls, { phases = config.site.phases || {} } = {}) {
  const enabled = (k) => phases[k] !== false;

  log.step(`SEO Agent — full run over ${urls.length} page(s)`);
  log.dim(`DRY_RUN=${config.dryRun} • target=${config.wp.stagingUrl || config.wp.baseUrl}`);

  // Phase 0 — grill-me (plan before code). Enabled via phases.plan in sites.json.
  if (enabled('plan')) {
    try { await plan(); } catch (e) { log.warn(`plan phase: ${e.message}`); }
  }

  // Phase 1 — baseline Lighthouse
  const pages = [];
  if (enabled('lighthouse')) {
    for (const url of urls) {
      try {
        const results = await lh.run(url);
        const page = { url, lighthouse: results, proposals: [] };
        writeReport(page);
        snapshotBaseline(url); // lock the "before" for later re-verify
        pages.push(page);
        const s = results[0].scores;
        log.ok(`audit ${url} — P:${s.performance} A:${s.accessibility} BP:${s.bestPractices} SEO:${s.seo}`);
      } catch (e) {
        log.warn(`audit ${url}: ${e.message}`);
      }
    }
    if (pages.length) writeSummary(pages);
  }

  // Phase 2 — images
  if (enabled('images')) {
    try { await scanAndOptimize({ apply: false }); }
    catch (e) { log.warn(`images: ${e.message}`); }
  }

  // Phase 3 — performance / modern-css (reads audit JSON)
  if (enabled('performance')) {
    try { await performance(urls); }
    catch (e) { log.warn(`performance: ${e.message}`); }
  }

  // Phase 4 — SEO
  if (enabled('seo')) {
    try { await auditSeo(urls); }
    catch (e) { log.warn(`seo: ${e.message}`); }
  }

  // Phase 5 — AI-SEO
  if (enabled('aiSeo')) {
    try { await aiSeo(); }
    catch (e) { log.warn(`ai-seo: ${e.message}`); }
  }

  // Phase 6 — accessibility (reads audit JSON)
  if (enabled('accessibility')) {
    try { await accessibility(urls); }
    catch (e) { log.warn(`accessibility: ${e.message}`); }
  }

  // Phase 7 — approval worksheet (the gate)
  const { wsPath, count } = writeApprovalWorksheet();
  log.step('Approval gate');
  log.ok(`${count} proposed change(s) → ${wsPath}`);
  log.dim('Review, then: `node src/cli.js approve --all` (or edit approved.json) → `node src/cli.js apply` → `node src/cli.js reverify`');

  return { pages, proposalCount: count };
}

export default { runAll };
