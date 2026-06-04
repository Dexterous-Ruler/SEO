import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

// SEO audit phase (read-only). Fetches the rendered HTML for each key page
// and checks the on-page SEO fundamentals, producing proposals.
// Schema/metadata fixes are PROPOSED here; they are applied via REST in `apply`.

function extract(re, html, group = 1) {
  const m = html.match(re);
  return m ? m[group].trim() : null;
}

function extractAll(re, html) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m);
  return out;
}

// Audit a single page's HTML for SEO fundamentals.
export function auditHtml(url, html) {
  const findings = [];
  const proposals = [];

  const title = extract(/<title[^>]*>([^<]*)<\/title>/i, html);
  const desc = extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html);
  const canonical = extract(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i, html);
  const robots = extract(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i, html);
  const ogTitle = extract(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i, html);
  const ogImage = extract(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i, html);
  const twitterCard = extract(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i, html);
  const h1s = extractAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, html);
  const imgs = extractAll(/<img\b[^>]*>/gi, html);
  const imgsNoAlt = imgs.filter((m) => !/\balt\s*=/.test(m[0]));
  const ldJson = extractAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, html);

  // Title
  if (!title) {
    findings.push({ severity: 'high', issue: 'Missing <title>' });
    proposals.push({ phase: 'seo-audit', field: 'title', title: 'Add a page <title>', detail: 'No title tag found.' });
  } else if (title.length < 15 || title.length > 60) {
    findings.push({ severity: 'med', issue: `Title length ${title.length} (ideal 15–60)`, value: title });
    proposals.push({ phase: 'seo-audit', field: 'title', title: 'Tune title length', detail: `Current: "${title}" (${title.length} chars)` });
  }

  // Meta description
  if (!desc) {
    findings.push({ severity: 'high', issue: 'Missing meta description' });
    proposals.push({ phase: 'seo-audit', field: 'meta_description', title: 'Add a meta description', detail: '~140–160 chars, compelling + keyword-relevant.' });
  } else if (desc.length < 70 || desc.length > 160) {
    findings.push({ severity: 'med', issue: `Description length ${desc.length} (ideal 70–160)`, value: desc });
  }

  // Canonical — value is the actual URL so apply can write it directly.
  if (!canonical) {
    findings.push({ severity: 'med', issue: 'Missing canonical link' });
    proposals.push({ phase: 'seo-audit', field: 'canonical', title: 'Add canonical URL', detail: `Set canonical to ${url}`, value: url });
  }

  // Indexability
  if (robots && /noindex/i.test(robots)) {
    findings.push({ severity: 'high', issue: `Page is noindex (robots: ${robots})` });
  }

  // Social
  if (!ogTitle || !ogImage) findings.push({ severity: 'low', issue: 'Incomplete Open Graph tags' });
  if (!twitterCard) findings.push({ severity: 'low', issue: 'Missing Twitter card' });

  // Headings
  if (h1s.length === 0) {
    findings.push({ severity: 'high', issue: 'No <h1> on page' });
    proposals.push({ phase: 'seo-audit', field: 'h1', title: 'Add a single descriptive H1' });
  } else if (h1s.length > 1) {
    findings.push({ severity: 'med', issue: `Multiple <h1> tags (${h1s.length})` });
  }

  // Images alt
  if (imgsNoAlt.length) {
    findings.push({ severity: 'med', issue: `${imgsNoAlt.length}/${imgs.length} images missing alt text` });
    proposals.push({ phase: 'seo-audit', field: 'img_alt', title: `Add alt text to ${imgsNoAlt.length} image(s)` });
  }

  // Structured data
  if (ldJson.length === 0) {
    findings.push({ severity: 'med', issue: 'No JSON-LD structured data found' });
    proposals.push({ phase: 'seo-audit', field: 'schema', title: 'Add schema.org JSON-LD', detail: 'Suggest Organization + WebPage/BreadcrumbList (+ Article/Product as relevant).' });
  }

  return {
    url,
    meta: { title, desc, canonical, robots, ogTitle, ogImage, twitterCard, h1Count: h1s.length, imgCount: imgs.length, imgsNoAlt: imgsNoAlt.length, ldJsonBlocks: ldJson.length },
    findings,
    proposals,
  };
}

export async function auditSeo(urls) {
  log.step(`SEO audit — ${urls.length} page(s)`);
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/0.1 (+lighthouse-bot)' } });
      const html = await res.text();
      const r = auditHtml(url, html);
      results.push(r);
      const hi = r.findings.filter((f) => f.severity === 'high').length;
      log.ok(`${url} — ${r.findings.length} finding(s), ${hi} high`);
    } catch (e) {
      log.warn(`${url}: ${e.message}`);
    }
  }
  mkdirSync(config.paths.reports, { recursive: true });
  // Detailed audit (per-page findings + meta) for the report.
  const auditPath = join(config.paths.reports, 'seo.audit.json');
  writeFileSync(auditPath, JSON.stringify({ generated: new Date().toISOString(), results }, null, 2));
  // Flat proposals file so the approval gate (which scans *.proposals.json) picks them up.
  const proposals = results.flatMap((r) => r.proposals.map((p) => ({ ...p, url: r.url })));
  const propPath = join(config.paths.reports, 'seo.proposals.json');
  writeFileSync(propPath, JSON.stringify({ generated: new Date().toISOString(), proposals }, null, 2));
  log.ok(`SEO audit → ${auditPath}  (${proposals.length} proposals → ${propPath})`);
  return results;
}

export default { auditSeo, auditHtml };
