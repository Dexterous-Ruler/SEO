// ===========================================================================
// GEO / AEO — Generative Engine Optimization measurement + enablement.
//
// MEASUREMENT: run buyer-intent prompts through Claude (with web search) and
//   detect whether the target domain is CITED, compute Share-of-AI-Voice vs
//   competitors. This is the "is AI actually showing this company?" answer.
//
// ENABLEMENT: generate the artifacts that make a site fetchable/citable by AI —
//   llms.txt, AI-bot robots.txt allowlist, Organization (sameAs/knowsAbout) schema.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

function key() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  return k;
}

// Ask Claude one buyer-intent question WITH web search enabled, then inspect
// whether the answer cites the target domain. Returns structured result.
async function askWithSearch(promptText) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': key(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [{ role: 'user', content: promptText }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude GEO ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);

  // Collect the answer text + every cited URL from web_search results / citations.
  let answer = '';
  const citedUrls = new Set();
  for (const block of data.content || []) {
    if (block.type === 'text') {
      answer += block.text;
      for (const c of block.citations || []) {
        if (c.url) citedUrls.add(c.url);
      }
    }
    if (block.type === 'web_search_tool_result') {
      for (const r of block.content || []) {
        if (r.url) citedUrls.add(r.url);
      }
    }
  }
  return { answer, citedUrls: [...citedUrls] };
}

function domainOf(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
  catch { return (url || '').replace(/^www\./, '').toLowerCase(); }
}

// Run a full citation-tracking pass for a site across a prompt set.
// targetDomain: the site we're measuring. competitors: optional [domain,...].
export async function runCitationTracking({ targetDomain, prompts, competitors = [], onResult }) {
  const target = domainOf(targetDomain);
  const compDomains = competitors.map(domainOf);
  const results = [];
  let cited = 0;
  const compCites = {};

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const promptText = typeof p === 'string' ? p : p.prompt;
    try {
      const { answer, citedUrls } = await askWithSearch(promptText);
      const citedDomains = [...new Set(citedUrls.map(domainOf))];
      const targetCited = citedDomains.includes(target);
      // brand mention in prose even if not formally cited
      const brandMentioned = new RegExp(target.split('.')[0].replace(/[^a-z0-9]/gi, ''), 'i').test(answer.replace(/[^a-z0-9]/gi, ''));
      if (targetCited) cited++;
      for (const cd of citedDomains) {
        if (compDomains.includes(cd)) compCites[cd] = (compCites[cd] || 0) + 1;
      }
      const row = {
        prompt: promptText,
        intent: typeof p === 'object' ? p.intent : 'informational',
        targetCited,
        brandMentioned,
        citedDomains,
        snippet: answer.slice(0, 280),
      };
      results.push(row);
      if (onResult) onResult(row, i, prompts.length);
    } catch (e) {
      results.push({ prompt: promptText, error: e.message });
      if (onResult) onResult({ prompt: promptText, error: e.message }, i, prompts.length);
    }
  }

  const total = prompts.length;
  const shareOfVoice = total ? Math.round((cited / total) * 100) : 0;
  const competitorScores = compDomains.map((d) => ({ domain: d, cited: compCites[d] || 0, share: total ? Math.round(((compCites[d] || 0) / total) * 100) : 0 }));
  return { targetDomain: target, shareOfVoice, promptsTotal: total, promptsCited: cited, competitors: competitorScores, results };
}

// Generate a default buyer-intent prompt set for a site/niche using Claude.
export async function suggestPrompts({ siteName, niche, sampleTitles = [] }) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Generate 18 realistic buyer-intent search/AI-assistant questions a potential customer of "${siteName}"${niche ? ' (' + niche + ')' : ''} would ask ChatGPT/Perplexity. Mix informational, commercial, and comparison intent. Base them on these page topics:\n${sampleTitles.slice(0, 30).join('\n')}\n\nReturn ONLY a JSON array of objects: [{"prompt":"...","intent":"informational|commercial|comparison"}]. No markdown.`,
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude prompts ${res.status}: ${data.error?.message || ''}`);
  let txt = (data.content || []).map((b) => b.text || '').join('').trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) txt = fence[1];
  const s = txt.indexOf('['); const e = txt.lastIndexOf(']');
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  try { return JSON.parse(txt); } catch { return []; }
}

// ── GEO ENABLEMENT artifacts ───────────────────────────────────────────────
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'Google-Extended', 'Bingbot', 'Applebot-Extended'];

export function buildAiRobots({ allow = true, sitemapUrl } = {}) {
  const lines = ['# AI crawler directives (managed by Sentinel)'];
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push(allow ? 'Allow: /' : 'Disallow: /');
    lines.push('');
  }
  if (sitemapUrl) lines.push(`Sitemap: ${sitemapUrl}`);
  return lines.join('\n');
}

export function buildLlmsTxt({ siteName, baseUrl, summary, pages = [] }) {
  const lines = [`# ${siteName || baseUrl}`, ''];
  if (summary) { lines.push(`> ${summary}`); lines.push(''); }
  lines.push('## Key pages', '');
  for (const p of pages) lines.push(`- [${p.title || p.path}](${baseUrl}${p.path})${p.note ? ': ' + p.note : ''}`);
  lines.push('', '## About', '', 'This file helps AI assistants understand and cite this site accurately.');
  return lines.join('\n');
}

export default { runCitationTracking, suggestPrompts, buildAiRobots, buildLlmsTxt };
