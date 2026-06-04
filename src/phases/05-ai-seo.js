import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { makeClient } from '../wp/client.js';

// AI-SEO phase: improve LLM citation visibility.
// - Generate an llms.txt proposal (a curated, machine-readable site map of
//   key pages + summaries that LLMs can ingest).
// - Propose Organization JSON-LD for entity clarity / E-E-A-T.
// - Flag pages lacking clear, extractable factual structure.

function buildLlmsTxt({ siteName, baseUrl, summary, pages }) {
  const lines = [];
  lines.push(`# ${siteName || baseUrl}`);
  lines.push('');
  if (summary) {
    lines.push(`> ${summary}`);
    lines.push('');
  }
  lines.push('## Key pages');
  lines.push('');
  for (const p of pages) {
    const title = p.title || p.path;
    lines.push(`- [${title}](${baseUrl}${p.path})${p.note ? `: ${p.note}` : ''}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('This file helps LLMs and AI search tools understand and cite this site accurately.');
  return lines.join('\n');
}

function buildOrganizationSchema(org, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name || undefined,
    url: org.url || baseUrl,
    logo: org.logo || undefined,
    sameAs: org.sameAs && org.sameAs.length ? org.sameAs : undefined,
  };
}

export async function aiSeo() {
  log.step('AI-SEO — LLM citation visibility');
  const ai = config.site.ai || {};
  const baseUrl = config.wp.baseUrl;
  const keyPages = config.site.keyPages || [];

  const proposals = [];
  const outDir = config.paths.reports;
  mkdirSync(outDir, { recursive: true });

  // 1) llms.txt
  if (ai.emitLlmsTxt !== false) {
    const pages = keyPages.map((p) => ({ path: p.path, title: p.name, note: '' }));
    const llms = buildLlmsTxt({
      siteName: ai.organization?.name,
      baseUrl,
      summary: ai.siteSummary,
      pages,
    });
    const p = join(outDir, 'llms.txt');
    writeFileSync(p, llms, 'utf8');
    proposals.push({ phase: 'ai-seo', title: 'Publish /llms.txt at site root', detail: `Generated draft at ${p}` });
    log.ok(`llms.txt draft → ${p}`);
  }

  // 2) Organization JSON-LD
  if (ai.organization?.name) {
    const schema = buildOrganizationSchema(ai.organization, baseUrl);
    const p = join(outDir, 'organization.schema.json');
    writeFileSync(p, JSON.stringify(schema, null, 2), 'utf8');
    proposals.push({ phase: 'ai-seo', title: 'Add Organization JSON-LD sitewide', detail: `Draft at ${p}` });
    log.ok(`Organization schema → ${p}`);
  } else {
    log.warn('Set ai.organization.name in config/sites.json to generate Organization schema.');
  }

  const outPath = join(outDir, 'ai-seo.proposals.json');
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), proposals }, null, 2));
  return proposals;
}

export default { aiSeo, buildLlmsTxt, buildOrganizationSchema };
