#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { config, assertWpConfigured } from './config.js';
import { makeClient } from './wp/client.js';
import * as lh from './lib/lighthouse-runner.js';
import { writeReport, writeSummary } from './lib/report.js';
import { log, scoreColor } from './lib/logger.js';
import { scanAndOptimize } from './phases/02-images.js';
import { performance as perfPhase } from './phases/03-performance.js';
import { auditSeo } from './phases/04-seo.js';
import { aiSeo } from './phases/05-ai-seo.js';
import { accessibility as a11yPhase } from './phases/06-accessibility.js';
import { writeApprovalWorksheet, approveAll } from './lib/approval.js';
import { apply as applyChanges } from './phases/apply.js';
import { runAll } from './phases/run-all.js';
import { plan as planPhase } from './phases/00-plan.js';
import { reverify } from './lib/verify.js';
import { buildSwapMap, swapReferences } from './lib/image-swap.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { discoverUrls, findOrphans } from './lib/crawler.js';
import { runPsiBatch, hasKey as hasPsiKey } from './lib/psi.js';
import { prioritize, trafficFromGscCsv } from './lib/prioritize.js';
import { getHead } from './wp/rankmath.js';
import * as store from './lib/store.js';
import { scaleAudit } from './phases/01-scale-audit.js';

const program = new Command();
program
  .name('wp-seo-agent')
  .description('Claude-powered SEO/performance/accessibility agent for WordPress')
  .version('0.1.0');

// Resolve the list of key page URLs from config (absolute URLs).
function keyPageUrls() {
  const base = config.wp.baseUrl;
  const pages = config.site.keyPages || [];
  if (!pages.length) {
    return base ? [base + '/'] : [];
  }
  return pages
    .slice()
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .map((p) => base.replace(/\/$/, '') + (p.path.startsWith('/') ? p.path : '/' + p.path));
}

// ── wp:check ───────────────────────────────────────────────────────────
program
  .command('wp:check')
  .description('Verify WordPress REST API connectivity & auth')
  .action(async () => {
    try {
      assertWpConfigured();
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
      return;
    }
    const spinner = ora(`Connecting to ${config.wp.baseUrl} …`).start();
    try {
      const wp = makeClient();
      const me = await wp.whoAmI();
      spinner.succeed(`Authenticated as ${chalk.bold(me.name)} (id ${me.id})`);
      log.dim(`Roles: ${(me.roles || []).join(', ') || 'n/a'}`);
      log.dim(`DRY_RUN is ${config.dryRun ? chalk.green('ON (safe)') : chalk.red('OFF (writes enabled)')}`);
    } catch (e) {
      spinner.fail('Connection failed');
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── audit ──────────────────────────────────────────────────────────────
program
  .command('audit')
  .description('Run Lighthouse audit across key pages and write reports')
  .option('--page <url>', 'audit a single explicit URL instead of key pages')
  .action(async (opts) => {
    const urls = opts.page ? [opts.page] : keyPageUrls();
    if (!urls.length) {
      log.err('No URLs to audit. Set WP_BASE_URL in .env or add keyPages in config/sites.json.');
      process.exitCode = 1;
      return;
    }
    log.step(`Auditing ${urls.length} page(s) — form factor: ${config.lighthouse.formFactor}`);
    const pages = [];
    for (const url of urls) {
      const spinner = ora(`Lighthouse: ${url}`).start();
      try {
        const results = await lh.run(url);
        const page = { url, lighthouse: results, proposals: [] };
        const { mdPath } = writeReport(page);
        pages.push(page);
        const s = results[0].scores;
        spinner.succeed(
          `${url}  P:${scoreColor(s.performance)} A:${scoreColor(s.accessibility)} ` +
          `BP:${scoreColor(s.bestPractices)} SEO:${scoreColor(s.seo)}`
        );
        log.dim(`  → ${mdPath}`);
      } catch (e) {
        spinner.fail(`${url} — ${e.message}`);
      }
    }
    if (pages.length) {
      const sum = writeSummary(pages);
      log.ok(`Summary written: ${sum}`);
    }
  });

// ── images ─────────────────────────────────────────────────────────────
program
  .command('images')
  .description('Scan media library & generate WebP optimization proposals')
  .option('--apply', 'apply approved image changes (guarded by DRY_RUN)')
  .action(async (opts) => {
    try {
      assertWpConfigured();
      await scanAndOptimize({ apply: !!opts.apply });
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── seo ────────────────────────────────────────────────────────────────
program
  .command('seo')
  .description('Run on-page SEO audit across key pages')
  .action(async () => {
    const urls = keyPageUrls();
    if (!urls.length) return log.err('No URLs. Configure WP_BASE_URL / keyPages.');
    try {
      await auditSeo(urls);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── ai-seo ─────────────────────────────────────────────────────────────
program
  .command('ai-seo')
  .description('Generate llms.txt + Organization schema for LLM citation visibility')
  .action(async () => {
    try {
      await aiSeo();
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── perf ───────────────────────────────────────────────────────────────
program
  .command('perf')
  .description('Analyze Lighthouse performance findings → modern-css proposals')
  .action(async () => {
    const urls = keyPageUrls();
    if (!urls.length) return log.err('No URLs. Configure WP_BASE_URL / keyPages.');
    try {
      await perfPhase(urls);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── a11y ───────────────────────────────────────────────────────────────
program
  .command('a11y')
  .description('WCAG 2.2 AA analysis from Lighthouse + manual-check list')
  .action(async () => {
    const urls = keyPageUrls();
    if (!urls.length) return log.err('No URLs. Configure WP_BASE_URL / keyPages.');
    try {
      await a11yPhase(urls);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── plan (grill-me: plan before code) ──────────────────────────────────
program
  .command('plan')
  .description('Phase 0 — grill-me: generate a decision-ready plan (open questions + sequence) before running')
  .action(async () => {
    try {
      const r = await planPhase();
      log.dim('\n' + (r.plan || '').slice(0, 1200) + ((r.plan || '').length > 1200 ? '\n…(full plan in reports/plan.md)' : ''));
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── run (full orchestrator) ────────────────────────────────────────────
program
  .command('run')
  .description('Run the full audit pipeline (phases 1-6) and build the approval gate')
  .option('--page <url>', 'run against a single explicit URL')
  .action(async (opts) => {
    const urls = opts.page ? [opts.page] : keyPageUrls();
    if (!urls.length) return log.err('No URLs. Configure WP_BASE_URL / keyPages.');
    try {
      assertWpConfigured();
      await runAll(urls);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── reverify ───────────────────────────────────────────────────────────
program
  .command('reverify')
  .description('Re-run Lighthouse and diff against the locked baseline (before/after)')
  .option('--page <url>', 'reverify a single explicit URL')
  .action(async (opts) => {
    const urls = opts.page ? [opts.page] : keyPageUrls();
    if (!urls.length) return log.err('No URLs. Configure WP_BASE_URL / keyPages.');
    try {
      await reverify(urls);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── approve ────────────────────────────────────────────────────────────
program
  .command('approve')
  .description('Build the approval worksheet (or approve everything with --all)')
  .option('--all', 'approve every pending proposal')
  .action(async (opts) => {
    if (opts.all) {
      const p = approveAll();
      return log.ok(`All proposals approved → ${p}`);
    }
    const { wsPath, count } = writeApprovalWorksheet();
    log.ok(`Approval worksheet (${count} item(s)) → ${wsPath}`);
    log.dim('Edit reports/approved.json (set approved:true) or run: node src/cli.js approve --all');
  });

// ── apply ──────────────────────────────────────────────────────────────
program
  .command('apply')
  .description('Apply approved changes to the (staging) site — guarded by DRY_RUN')
  .action(async () => {
    try {
      assertWpConfigured();
      await applyChanges();
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── selftest (Rank Math + mu-plugin wiring) ────────────────────────────
program
  .command('selftest')
  .description('Verify the seo-agent-meta mu-plugin + Rank Math are wired correctly')
  .action(async () => {
    try {
      assertWpConfigured();
      const wp = makeClient();
      const st = await wp.selftest();
      log.ok(`mu-plugin reachable. Rank Math active: ${st.rank_math_active}`);
      log.dim(`Registered keys: ${(st.registered_keys || []).join(', ')}`);
      log.dim(`Covers pages: ${st.covers_pages}`);
    } catch (e) {
      log.err(`selftest failed: ${e.message}`);
      log.dim('Install wp-plugin/seo-agent-meta.php into wp-content/mu-plugins/ on the site.');
      process.exitCode = 1;
    }
  });

// ── scan (read-only HTML audit at scale, no PSI/plugin needed) ─────────
program
  .command('scan')
  .description('Read-only HTML audit across a stratified sample of all URLs (no PSI key/plugin needed)')
  .action(async () => {
    try {
      assertWpConfigured();
      const { agg } = await scaleAudit({});
      log.step('Site-wide signal (sampled)');
      log.info(`Audited ${agg.audited}/${agg.sampled} · avg ${agg.avgKB}KB/page`);
      log.info(`Missing meta description: ${agg.missingDesc}  ·  Title length off: ${agg.badTitleLen}`);
      log.info(`Missing canonical: ${agg.missingCanonical}  ·  No schema: ${agg.noSchema}`);
      log.info(`No H1: ${agg.noH1}  ·  Multiple H1: ${agg.multiH1}  ·  No lang attr: ${agg.noLang}`);
      log.info(`Images without alt (in sample): ${agg.imagesNoAlt}`);
      log.dim(`Heaviest: ${agg.heaviest.map((h) => h.url.replace(config.wp.baseUrl, '') + ' ' + h.kb + 'KB').join(' · ')}`);
      log.ok('→ .data/scale-audit.json');
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── crawl (sitemap → all URLs + orphans) ───────────────────────────────
program
  .command('crawl')
  .description('Discover all URLs from the sitemap and detect orphan pages')
  .option('--orphans', 'also run orphan detection (samples internal links)')
  .action(async (opts) => {
    try {
      assertWpConfigured();
      log.step('Crawling sitemap');
      const { indexUrl, urls } = await discoverUrls({});
      log.ok(`Discovered ${urls.length} URL(s) from ${indexUrl}`);
      mkdirSync(config.paths.data, { recursive: true });
      writeFileSync(join(config.paths.data, 'urls.json'), JSON.stringify({ generated: new Date().toISOString(), indexUrl, urls }, null, 2));
      if (opts.orphans) {
        log.step('Detecting orphans (sampled)');
        const o = await findOrphans(urls);
        log.ok(`${o.orphanCount} potential orphan(s) of ${urls.length} (sampled links from ${o.checkedLinksFrom} pages)`);
        writeFileSync(join(config.paths.data, 'orphans.json'), JSON.stringify(o, null, 2));
      }
      log.dim(`→ ${join(config.paths.data, 'urls.json')}`);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── psi (PageSpeed Insights at scale) ──────────────────────────────────
program
  .command('psi')
  .description('Audit URLs via Google PSI API at scale (uses .data/urls.json or key pages)')
  .option('--all', 'audit every URL from .data/urls.json (run `crawl` first)')
  .option('--strategy <s>', 'mobile | desktop', 'mobile')
  .option('--limit <n>', 'cap number of URLs', (v) => parseInt(v, 10))
  .action(async (opts) => {
    if (!hasPsiKey()) log.warn('No PSI_KEY set — PSI allows keyless use but heavily rate-limited. Add PSI_KEY to .env.');
    let urls;
    const urlsFile = join(config.paths.data, 'urls.json');
    if (opts.all && existsSync(urlsFile)) {
      urls = JSON.parse(readFileSync(urlsFile, 'utf8')).urls;
    } else {
      urls = keyPageUrls();
    }
    if (opts.limit) urls = urls.slice(0, opts.limit);
    if (!urls.length) return log.err('No URLs. Run `crawl` or configure key pages.');

    log.step(`PSI — ${urls.length} URL(s), strategy=${opts.strategy}`);
    const results = await runPsiBatch(urls, {
      strategy: opts.strategy,
      key: config.psiKey || undefined,
      onResult: (r, i, n) => {
        if (r.error) log.warn(`(${i + 1}/${n}) ${r.url} — ${r.error}`);
        else { log.ok(`(${i + 1}/${n}) ${r.url} P:${r.scores.performance} A:${r.scores.accessibility} BP:${r.scores.bestPractices} SEO:${r.scores.seo}`); store.recordAudit(r); }
      },
    });
    const ok = results.filter((r) => r && !r.error);
    mkdirSync(config.paths.data, { recursive: true });
    writeFileSync(join(config.paths.data, 'psi-results.json'), JSON.stringify({ generated: new Date().toISOString(), results }, null, 2));
    log.ok(`PSI complete: ${ok.length}/${urls.length} ok → .data/psi-results.json`);
  });

// ── prioritize (impact = traffic × gap) ────────────────────────────────
program
  .command('prioritize')
  .description('Rank audited pages by impact (traffic × gap-to-100)')
  .option('--gsc <csv>', 'path to a Search Console pages CSV export for traffic data')
  .action(async (opts) => {
    const psiFile = join(config.paths.data, 'psi-results.json');
    if (!existsSync(psiFile)) return log.err('No PSI results. Run `psi` first.');
    const results = JSON.parse(readFileSync(psiFile, 'utf8')).results || [];
    let traffic = {};
    if (opts.gsc && existsSync(opts.gsc)) {
      traffic = trafficFromGscCsv(readFileSync(opts.gsc, 'utf8'));
      log.info(`Loaded traffic for ${Object.keys(traffic).length} URL(s) from GSC export`);
    } else {
      log.dim('No --gsc export given; using uniform traffic weighting.');
    }
    const ranked = prioritize(results, { traffic });
    mkdirSync(config.paths.data, { recursive: true });
    writeFileSync(join(config.paths.data, 'priorities.json'), JSON.stringify({ generated: new Date().toISOString(), ranked }, null, 2));
    log.step(`Top priorities (of ${ranked.length})`);
    for (const r of ranked.slice(0, 15)) {
      log.info(`impact ${String(r.impact).padStart(5)} · gap ${r.gap} · ${r.weakest ? r.weakest.category + ':' + r.weakest.score : ''} · ${r.url}`);
    }
    log.ok(`→ ${join(config.paths.data, 'priorities.json')}`);
  });

// ── rollback (reverse a verified write) ────────────────────────────────
program
  .command('rollback <writeId>')
  .description('Reverse a recorded meta write by its ledger id (restores old value)')
  .action(async (writeId) => {
    try {
      assertWpConfigured();
      const entry = store.findWrite(writeId);
      if (!entry) return log.err(`No write ledger entry with id ${writeId}`);
      if (entry.status === 'dry-run') return log.warn('That entry was a dry-run; nothing to roll back.');
      const wp = makeClient();
      log.step(`Rollback ${writeId}: ${entry.objectType}/${entry.postId} ${entry.field}`);
      log.dim(`  ${JSON.stringify(entry.newValue)} → ${JSON.stringify(entry.oldValue)}`);
      const r = await wp.updateMetaVerified(entry.objectType, entry.postId, entry.field, entry.oldValue, { store });
      // Purge caches so the restored value is what visitors + re-verify see.
      if (r.status !== 'dry-run') {
        const pc = await wp.purgeCache();
        if (pc && pc.ok !== false) log.dim(`  cache purged (${(pc.cleared || []).join(', ') || 'requested'})`);
      }
      log.ok(`Rolled back (${r.status}).`);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

// ── swap (image reference rewrite) ─────────────────────────────────────
program
  .command('swap')
  .description('Rewrite <img> references in content to uploaded WebP URLs (post-apply)')
  .action(async () => {
    try {
      assertWpConfigured();
      const resultsPath = join(config.paths.reports, 'apply.results.json');
      const propsPath = join(config.paths.reports, 'images.proposals.json');
      if (!existsSync(resultsPath)) return log.warn('No apply.results.json — run `apply` (with DRY_RUN=false) first.');
      const applyResults = JSON.parse(readFileSync(resultsPath, 'utf8')).results || [];
      const imageProposals = existsSync(propsPath) ? JSON.parse(readFileSync(propsPath, 'utf8')).proposals : [];
      const map = buildSwapMap(applyResults, imageProposals);
      await swapReferences(map);
    } catch (e) {
      log.err(e.message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
