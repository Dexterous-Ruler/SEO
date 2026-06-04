import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { config } from '../config.js';

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

const desktopConfig = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
  },
};

// Run Lighthouse for one URL + one form factor. Returns parsed summary.
export async function runOne(url, formFactor = 'mobile') {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    chromePath: config.lighthouse.chromePath,
  });
  try {
    const opts = { port: chrome.port, onlyCategories: CATEGORIES, output: 'json' };
    const lhConfig = formFactor === 'desktop' ? desktopConfig : undefined;
    const result = await lighthouse(url, opts, lhConfig);
    return summarize(url, formFactor, result.lhr);
  } finally {
    await chrome.kill();
  }
}

// Run for the configured form factor(s): mobile, desktop, or both.
export async function run(url) {
  const ff = config.lighthouse.formFactor;
  const factors = ff === 'both' ? ['mobile', 'desktop'] : [ff];
  const runs = [];
  for (const f of factors) {
    runs.push(await runOne(url, f)); // sequential: one Chrome at a time
  }
  return runs;
}

function pct(v) {
  return v == null ? null : Math.round(v * 100);
}

// Distill the giant LHR into the numbers + opportunities we care about.
function summarize(url, formFactor, lhr) {
  const cat = lhr.categories;
  const scores = {
    performance: pct(cat.performance?.score),
    accessibility: pct(cat.accessibility?.score),
    bestPractices: pct(cat['best-practices']?.score),
    seo: pct(cat.seo?.score),
  };

  const a = lhr.audits;
  const cwv = {
    lcp: a['largest-contentful-paint']?.numericValue ?? null,
    inp: a['interaction-to-next-paint']?.numericValue ?? null,
    cls: a['cumulative-layout-shift']?.numericValue ?? null,
    fcp: a['first-contentful-paint']?.numericValue ?? null,
    tbt: a['total-blocking-time']?.numericValue ?? null,
    si: a['speed-index']?.numericValue ?? null,
  };

  // Collect failing/under-threshold audits per category as actionable items.
  const findings = [];
  for (const [catKey, c] of Object.entries(cat)) {
    for (const ref of c.auditRefs || []) {
      const audit = a[ref.id];
      if (!audit) continue;
      const failing = audit.score !== null && audit.score < 0.9;
      if (!failing) continue;
      findings.push({
        category: catKey,
        id: ref.id,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        displayValue: audit.displayValue || null,
        savingsMs: audit.details?.overallSavingsMs ?? null,
        savingsBytes: audit.details?.overallSavingsBytes ?? null,
      });
    }
  }
  findings.sort((x, y) => (y.savingsMs || 0) - (x.savingsMs || 0));

  return { url, formFactor, scores, cwv, findings, fetchTime: lhr.fetchTime };
}

export default { run, runOne };
