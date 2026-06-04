import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { slugForUrl } from '../lib/report.js';
import * as lh from './lighthouse-runner.js';

// Before/after re-verification. Snapshots current scores as the "before"
// baseline, then (after apply) re-runs Lighthouse and diffs the two.

function baselinePath(url) {
  return join(config.paths.cache, `baseline-${slugForUrl(url)}.json`);
}

// Save the current audit JSON as the locked baseline for later comparison.
export function snapshotBaseline(url) {
  mkdirSync(config.paths.cache, { recursive: true });
  const slug = slugForUrl(url);
  const src = join(config.paths.reports, `${slug}.json`);
  if (!existsSync(src)) return false;
  copyFileSync(src, baselinePath(url));
  return true;
}

function firstScores(pageJson) {
  return pageJson?.lighthouse?.[0]?.scores || {};
}

function arrow(before, after) {
  if (before == null || after == null) return '';
  if (after > before) return `▲ +${after - before}`;
  if (after < before) return `▼ ${after - before}`;
  return '= 0';
}

// Re-run Lighthouse and produce a before/after comparison for each URL.
export async function reverify(urls) {
  log.step(`Re-verify — ${urls.length} page(s)`);
  const rows = [];
  for (const url of urls) {
    const before = existsSync(baselinePath(url))
      ? firstScores(JSON.parse(readFileSync(baselinePath(url), 'utf8')))
      : null;

    let after = {};
    try {
      const results = await lh.run(url);
      after = results[0].scores;
    } catch (e) {
      log.warn(`${url}: ${e.message}`);
      continue;
    }

    rows.push({ url, before, after });
    const cats = ['performance', 'accessibility', 'bestPractices', 'seo'];
    const summary = cats.map((c) => `${c[0].toUpperCase()}:${after[c]}${before ? ` (${arrow(before[c], after[c])})` : ''}`).join('  ');
    log.ok(`${url}  ${summary}`);
  }

  // Write the comparison report.
  mkdirSync(config.paths.reports, { recursive: true });
  const lines = ['# Re-verify — Before / After', '', `_Generated: ${new Date().toISOString()}_`, ''];
  lines.push('| Page | Metric | Before | After | Δ |');
  lines.push('|---|---|---|---|---|');
  for (const r of rows) {
    for (const c of ['performance', 'accessibility', 'bestPractices', 'seo']) {
      const b = r.before?.[c] ?? '—';
      const a = r.after?.[c] ?? '—';
      lines.push(`| ${r.url} | ${c} | ${b} | ${a} | ${r.before ? arrow(r.before[c], r.after[c]) : 'n/a'} |`);
    }
  }
  const outPath = join(config.paths.reports, 'REVERIFY.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  log.ok(`Comparison written: ${outPath}`);
  return rows;
}

export default { snapshotBaseline, reverify };
