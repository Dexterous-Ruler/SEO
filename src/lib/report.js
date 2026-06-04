import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

// Slugify a URL path into a safe filename fragment.
export function slugForUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, '') || '/home';
    return p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  } catch {
    return 'page';
  }
}

function fmtMs(v) {
  return v == null ? '—' : `${(v / 1000).toFixed(2)} s`;
}

function badge(score) {
  if (score == null) return '—';
  const mark = score >= 90 ? '🟢' : score >= 50 ? '🟠' : '🔴';
  return `${mark} ${score}`;
}

// Build a Markdown report from one page's full phase results.
export function renderPageReport(page) {
  const { url, lighthouse = [], proposals = [] } = page;
  const lines = [];
  lines.push(`# SEO Agent Report — ${url}`);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');

  // Scores table
  lines.push('## Lighthouse Scores');
  lines.push('');
  lines.push('| Form factor | Performance | Accessibility | Best Practices | SEO |');
  lines.push('|---|---|---|---|---|');
  for (const r of lighthouse) {
    const s = r.scores;
    lines.push(`| ${r.formFactor} | ${badge(s.performance)} | ${badge(s.accessibility)} | ${badge(s.bestPractices)} | ${badge(s.seo)} |`);
  }
  lines.push('');

  // Core Web Vitals
  for (const r of lighthouse) {
    lines.push(`### Core Web Vitals (${r.formFactor})`);
    lines.push('');
    lines.push('| LCP | INP | CLS | FCP | TBT | Speed Index |');
    lines.push('|---|---|---|---|---|---|');
    const c = r.cwv;
    lines.push(`| ${fmtMs(c.lcp)} | ${c.inp == null ? '—' : Math.round(c.inp) + ' ms'} | ${c.cls == null ? '—' : c.cls.toFixed(3)} | ${fmtMs(c.fcp)} | ${c.tbt == null ? '—' : Math.round(c.tbt) + ' ms'} | ${fmtMs(c.si)} |`);
    lines.push('');
  }

  // Top findings
  const findings = lighthouse.flatMap((r) => r.findings.map((f) => ({ ...f, formFactor: r.formFactor })));
  if (findings.length) {
    lines.push('## Top Opportunities & Diagnostics');
    lines.push('');
    lines.push('| Category | Issue | Detail | Est. savings |');
    lines.push('|---|---|---|---|');
    for (const f of findings.slice(0, 25)) {
      const save = f.savingsMs ? `${Math.round(f.savingsMs)} ms` : f.savingsBytes ? `${Math.round(f.savingsBytes / 1024)} KB` : '—';
      lines.push(`| ${f.category} | ${f.title} | ${f.displayValue || ''} | ${save} |`);
    }
    lines.push('');
  }

  // Proposed changes (from later phases) awaiting approval
  if (proposals.length) {
    lines.push('## Proposed Changes (awaiting approval)');
    lines.push('');
    for (const p of proposals) {
      lines.push(`- **[${p.phase}]** ${p.title}`);
      if (p.detail) lines.push(`  - ${p.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Persist both the human-readable .md and machine-readable .json.
export function writeReport(page) {
  ensureDir(config.paths.reports);
  const slug = slugForUrl(page.url);
  const md = renderPageReport(page);
  const mdPath = join(config.paths.reports, `${slug}.md`);
  const jsonPath = join(config.paths.reports, `${slug}.json`);
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(jsonPath, JSON.stringify(page, null, 2), 'utf8');
  return { mdPath, jsonPath };
}

// A roll-up across all pages.
export function writeSummary(pages) {
  ensureDir(config.paths.reports);
  const lines = ['# SEO Agent — Site Summary', '', `_Generated: ${new Date().toISOString()}_`, ''];
  lines.push('| Page | Perf | A11y | Best Pr. | SEO | Proposals |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of pages) {
    const r = p.lighthouse?.[0];
    const s = r?.scores || {};
    lines.push(`| ${p.url} | ${badge(s.performance)} | ${badge(s.accessibility)} | ${badge(s.bestPractices)} | ${badge(s.seo)} | ${(p.proposals || []).length} |`);
  }
  const path = join(config.paths.reports, 'SUMMARY.md');
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

export default { writeReport, writeSummary, renderPageReport, slugForUrl };
