// ===========================================================================
// Tavily client — agent-grade web SEARCH + content EXTRACT for the research
// layer. Where Perplexity gives a synthesised answer, Tavily returns ranked
// source documents (title/url/content) we feed to Claude for our own synthesis
// — cheaper, more control, and great for gathering competitor/SERP material.
// Geo-locked to the UK. Zero-dep (fetch + Bearer). Docs: https://docs.tavily.com/
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import { UK } from './uk.js';

const SEARCH = 'https://api.tavily.com/search';
const EXTRACT = 'https://api.tavily.com/extract';

function key() {
  const k = process.env.TAVILY_API_KEY;
  if (!k) throw new Error('TAVILY_API_KEY not set (add to .env — get it at app.tavily.com)');
  return k;
}
export function hasKey() { return Boolean(process.env.TAVILY_API_KEY); }

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Tavily auth failed — check TAVILY_API_KEY.');
  // Credit exhaustion is signalled by HTTP 429/432/433 or an explicit error
  // field — NOT by the word "credit" appearing in result CONTENT (that
  // false-positived on finance pages). Only inspect the error field.
  const errMsg = (data && (data.error || data.detail)) ? String(data.error || data.detail) : '';
  if (res.status === 429 || res.status === 432 || res.status === 433 || /usage limit|out of credits|insufficient credit/i.test(errMsg)) {
    const e = new Error('Tavily credits exhausted — top up at app.tavily.com'); e.code = 'NO_UNITS'; throw e;
  }
  if (!res.ok) throw new Error('Tavily: ' + (errMsg || `HTTP ${res.status}`));
  return data;
}

// UK-scoped search. topic 'news' + days for trending; 'general' otherwise.
// Returns { answer, results:[{title,url,content,score}] }.
export async function search(query, { depth = 'advanced', maxResults = 8, topic = 'general', days, includeDomains, excludeDomains, includeAnswer = true } = {}) {
  const body = {
    query, search_depth: depth, max_results: Math.min(maxResults, 20),
    topic, include_answer: includeAnswer, include_raw_content: false,
    country: UK.countryName,                       // bias results to the United Kingdom
  };
  if (topic === 'news' && days) body.days = days;
  if (includeDomains && includeDomains.length) body.include_domains = includeDomains;
  if (excludeDomains && excludeDomains.length) body.exclude_domains = excludeDomains;
  const data = await post(SEARCH, body);
  return {
    answer: data.answer || '',
    results: (data.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content, score: r.score })),
  };
}

// Pull clean full-text content from specific URLs (e.g. competitor pages).
export async function extract(urls, { depth = 'basic' } = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 20);
  if (!list.length) return [];
  const data = await post(EXTRACT, { urls: list, extract_depth: depth });
  return (data.results || []).map((r) => ({ url: r.url, content: r.raw_content || r.content || '' }));
}

export default { search, extract, hasKey };
