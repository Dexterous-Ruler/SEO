import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { slugForUrl } from '../lib/report.js';

// Performance / modern-CSS phase (analysis).
// Reads the Lighthouse JSON already written by `audit` and distills the
// performance findings into concrete, prioritized CSS/loading proposals.
// The actual edits are skill-driven (modern-css) + applied via theme/child-theme.

// Map a Lighthouse audit id to a concrete remediation suggestion.
const REMEDIES = {
  'render-blocking-resources': { fix: 'Inline critical CSS; defer/async non-critical CSS & JS.', cwv: 'LCP/FCP' },
  'unused-css-rules': { fix: 'Remove or split unused CSS (common in WP themes/plugins); load per-template.', cwv: 'LCP' },
  'unused-javascript': { fix: 'Code-split; dequeue unused plugin scripts; defer non-critical JS.', cwv: 'INP/TBT' },
  'unminified-css': { fix: 'Minify CSS (enable theme/plugin minification or a build step).', cwv: 'LCP' },
  'unminified-javascript': { fix: 'Minify JS.', cwv: 'TBT' },
  'modern-image-formats': { fix: 'Serve WebP/AVIF (see image-optimization phase).', cwv: 'LCP' },
  'uses-optimized-images': { fix: 'Compress images; see image-optimization phase.', cwv: 'LCP' },
  'uses-responsive-images': { fix: 'Add correct srcset/sizes so mobile gets smaller assets.', cwv: 'LCP' },
  'offscreen-images': { fix: 'Lazy-load offscreen images (never the LCP image).', cwv: 'LCP' },
  'uses-text-compression': { fix: 'Enable gzip/brotli compression on the server.', cwv: 'LCP/FCP' },
  'uses-long-cache-ttl': { fix: 'Set long cache TTLs for static assets.', cwv: 'repeat-view' },
  'server-response-time': { fix: 'Reduce TTFB: caching plugin/CDN, better host, opcache. (Infra — may be outside on-page control.)', cwv: 'LCP/FCP' },
  'largest-contentful-paint-element': { fix: 'Optimize & preload the LCP element; avoid lazy-loading it.', cwv: 'LCP' },
  'layout-shift-elements': { fix: 'Set explicit width/height/aspect-ratio; reserve space for fonts/embeds.', cwv: 'CLS' },
  'total-blocking-time': { fix: 'Break up long tasks; defer/split JS; reduce main-thread work.', cwv: 'INP/TBT' },
  'font-display': { fix: 'Use font-display: swap; preconnect/preload web fonts.', cwv: 'CLS/FCP' },
  'critical-request-chains': { fix: 'Preload key resources; flatten request chains.', cwv: 'LCP' },
  'dom-size': { fix: 'Reduce DOM size; simplify markup; paginate heavy lists.', cwv: 'INP' },
};

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
      if (f.category !== 'performance') continue;
      const remedy = REMEDIES[f.id];
      if (!remedy) continue;
      const key = f.id;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({
        phase: 'modern-css',
        field: f.id,
        title: f.title,
        detail: `${remedy.fix} (targets ${remedy.cwv})${f.savingsMs ? ` — est. ${Math.round(f.savingsMs)} ms` : ''}`,
        cwvTarget: remedy.cwv,
        savingsMs: f.savingsMs || null,
      });
    }
  }
  proposals.sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0));
  return { url, proposals };
}

export async function performance(urls) {
  log.step(`Performance / modern-CSS analysis — ${urls.length} page(s)`);
  const results = [];
  for (const url of urls) {
    const r = analyze(url);
    if (r.error) { log.warn(`${url}: ${r.error}`); continue; }
    results.push(r);
    log.ok(`${url} — ${r.proposals.length} performance proposal(s)`);
  }
  mkdirSync(config.paths.reports, { recursive: true });
  // Flatten into a proposals file the approval gate can pick up.
  const proposals = results.flatMap((r) => r.proposals.map((p) => ({ ...p, url: r.url })));
  const outPath = join(config.paths.reports, 'performance.proposals.json');
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), proposals }, null, 2));
  log.ok(`Performance proposals written: ${outPath}`);
  return proposals;
}

export default { performance, analyze };
