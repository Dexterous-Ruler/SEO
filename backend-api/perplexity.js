// ===========================================================================
// Perplexity (Sonar) client — real-time, web-GROUNDED answers WITH citations.
// Its job in the system: bring the live web that Claude can't see (current
// facts, what's ranking/trending now, sourced YMYL facts). Claude then writes;
// Perplexity grounds. Geo-locked to the UK. Zero-dep (fetch + Bearer).
// Docs: https://docs.perplexity.ai/  · OpenAI-compatible chat/completions.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import { UK, UK_PROMPT } from './uk.js';
import { P } from './prompts.js';
// Editable UK scope clause (admin panel) with the static fallback.
const ukScope = () => P('research.ukScope') || UK_PROMPT;

const API = 'https://api.perplexity.ai/chat/completions';

function key() {
  const k = process.env.PERPLEXITY_API_KEY;
  if (!k) throw new Error('PERPLEXITY_API_KEY not set (add to .env — get it at perplexity.ai/settings/api)');
  return k;
}
export function hasKey() { return Boolean(process.env.PERPLEXITY_API_KEY); }

// Pick a model by task weight. sonar = cheap/fast facts & trending; sonar-pro =
// briefs / deeper synthesis with more sources; sonar-reasoning = multi-step.
const MODELS = { fast: 'sonar', pro: 'sonar-pro', reason: 'sonar-reasoning' };

// Low-level grounded ask. Always UK-scoped. Returns { answer, sources, cost }.
export async function ask({ system = '', user, model = 'fast', recency, domains, maxTokens = 900, temperature = 0.2 } = {}) {
  const body = {
    model: MODELS[model] || model,
    messages: [
      { role: 'system', content: `${system}\n\n${ukScope()}`.trim() },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
    // Geo-lock results to the United Kingdom.
    web_search_options: { user_location: { country: UK.country } },
  };
  if (recency) body.search_recency_filter = recency;             // 'day'|'week'|'month'
  if (domains && domains.length) body.search_domain_filter = domains.slice(0, 10);

  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Perplexity auth failed — check PERPLEXITY_API_KEY.');
    throw new Error('Perplexity: ' + msg);
  }
  const choice = (data.choices || [])[0] || {};
  const answer = (choice.message && choice.message.content) || '';
  // Newer responses expose search_results [{title,url}]; older expose citations [url].
  const sources = (data.search_results && data.search_results.map((s) => ({ title: s.title || '', url: s.url })))
    || ((data.citations || []).map((u) => ({ title: '', url: u })));
  const cost = (data.usage && data.usage.cost && data.usage.cost.total_cost) || null;
  return { answer: answer.trim(), sources, cost, raw: data.usage || null };
}

export default { ask, hasKey };
