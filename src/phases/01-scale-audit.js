import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { parseHead, agentUA } from '../wp/rankmath.js';
import { auditHtml } from './04-seo.js';
import * as store from '../lib/store.js';

// Scale audit (read-only). Uses the direct-HTML fallback reader (no PSI key, no
// plugin, no Chrome) to audit a representative SAMPLE across all content types,
// so we get site-wide signal cheaply before committing to full PSI runs.

// Pick a stratified sample: N from each top-level path segment + all key pages.
export function stratifiedSample(urls, { perSegment = 8, hardCap = 120 } = {}) {
  const base = config.wp.baseUrl.replace(/\/$/, '');
  const bySeg = new Map();
  for (const u of urls) {
    let seg = '(root)';
    try { seg = new URL(u).pathname.split('/').filter(Boolean)[0] || '(root)'; } catch {}
    if (!bySeg.has(seg)) bySeg.set(seg, []);
    bySeg.get(seg).push(u);
  }
  const sample = [];
  for (const [, list] of bySeg) {
    // Evenly stride through each segment's list for spread.
    const step = Math.max(1, Math.floor(list.length / perSegment));
    for (let i = 0; i < list.length && sample.length < hardCap; i += step) {
      sample.push(list[i]);
    }
  }
  return [...new Set(sample)].slice(0, hardCap);
}

// Lightweight per-URL audit via HTML fetch: SEO fundamentals + quick a11y heuristics.
async function auditUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': agentUA() }, redirect: 'follow' });
  const html = await res.text();
  const head = parseHead(html);
  const seo = auditHtml(url, html);

  // Cheap accessibility heuristics (full WCAG needs axe; this is a smell test).
  const imgs = (html.match(/<img\b[^>]*>/gi) || []);
  const imgsNoAlt = imgs.filter((t) => !/\balt\s*=/.test(t)).length;
  const inputs = (html.match(/<input\b[^>]*>/gi) || []).filter((t) => !/type=["'](hidden|submit|button)["']/i.test(t));
  const hasLang = /<html[^>]+lang=/i.test(html);
  const buttonsNoName = (html.match(/<button\b[^>]*>\s*<\/button>/gi) || []).length;

  return {
    url,
    status: res.status,
    bytesKB: Math.round(html.length / 1024),
    seo: {
      title: head.title, titleLen: (head.title || '').length,
      desc: head.description, descLen: (head.description || '').length,
      canonical: head.canonical, robots: head.robots,
      hasSchema: head.hasSchema, schemaTypes: [...new Set(head.schemaTypes)],
      h1Count: seo.meta.h1Count, imgCount: imgs.length, imgsNoAlt,
      findings: seo.findings,
    },
    a11yHeuristics: { imgsNoAlt, formInputs: inputs.length, hasLang, buttonsNoName },
  };
}

export async function scaleAudit({ sample } = {}) {
  const urlsFile = join(config.paths.data, 'urls.json');
  if (!existsSync(urlsFile)) throw new Error('No .data/urls.json — run `crawl` first.');
  const all = JSON.parse(readFileSync(urlsFile, 'utf8')).urls;
  const targets = sample || stratifiedSample(all);

  log.step(`Scale audit (read-only HTML) — ${targets.length} of ${all.length} URL(s)`);
  const results = [];
  let done = 0;
  // Modest concurrency to be polite to the live site + MalCare.
  const concurrency = 5;
  let idx = 0;
  async function worker() {
    while (idx < targets.length) {
      const i = idx++;
      const url = targets[i];
      try {
        const r = await auditUrl(url);
        results.push(r);
        const hi = r.seo.findings.filter((f) => f.severity === 'high').length;
        if (++done % 10 === 0 || hi) log.ok(`(${done}/${targets.length}) ${url.replace(config.wp.baseUrl, '')} — ${r.seo.findings.length} issue(s), ${hi} high, ${r.bytesKB}KB`);
      } catch (e) {
        results.push({ url, error: e.message });
        log.warn(`${url}: ${e.message.slice(0, 80)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Aggregate site-wide signal.
  const ok = results.filter((r) => !r.error);
  const agg = {
    sampled: targets.length,
    audited: ok.length,
    missingDesc: ok.filter((r) => !r.seo.desc).length,
    badTitleLen: ok.filter((r) => r.seo.titleLen < 15 || r.seo.titleLen > 60).length,
    missingCanonical: ok.filter((r) => !r.seo.canonical).length,
    noSchema: ok.filter((r) => !r.seo.hasSchema).length,
    multiH1: ok.filter((r) => r.seo.h1Count > 1).length,
    noH1: ok.filter((r) => r.seo.h1Count === 0).length,
    imagesNoAlt: ok.reduce((a, r) => a + (r.seo.imgsNoAlt || 0), 0),
    noLang: ok.filter((r) => !r.a11yHeuristics.hasLang).length,
    avgKB: Math.round(ok.reduce((a, r) => a + r.bytesKB, 0) / Math.max(ok.length, 1)),
    heaviest: ok.slice().sort((a, b) => b.bytesKB - a.bytesKB).slice(0, 5).map((r) => ({ url: r.url, kb: r.bytesKB })),
  };

  mkdirSync(config.paths.data, { recursive: true });
  writeFileSync(join(config.paths.data, 'scale-audit.json'), JSON.stringify({ generated: new Date().toISOString(), agg, results }, null, 2));
  for (const r of ok) {
    store.recordAudit({ url: r.url, source: 'html-scan', scores: null, cwv: null });
  }
  return { agg, results };
}

export default { scaleAudit, stratifiedSample };
