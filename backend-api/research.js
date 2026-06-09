// ===========================================================================
// Research layer — the web-grounded brain. Combines TWO complementary engines,
// UK-locked, behind one clean interface:
//   • Tavily     → ranked source documents (retrieval; cheap, controllable)
//   • Perplexity → a grounded, cited summary of the current state (synthesis)
//   • Claude     → writes the final artefact using ONLY what the web returned
//
// Senior-analyst hygiene baked in: sources are de-duplicated by domain, ranked
// by authority (UK-gov/established first), and lightly cached so we never re-pay
// for the same query within a short window. Every output carries its sources.
// ===========================================================================
import * as tavily from './tavily.js';
import * as perplexity from './perplexity.js';
import * as claude from './claude.js';
import { UK } from './uk.js';
import { P, modelFor, tempFor } from './prompts.js';
const mt = (key, fallbackModel) => ({ model: modelFor(key) || fallbackModel, temperature: tempFor(key) != null ? tempFor(key) : undefined });

// ---- source hygiene --------------------------------------------------------
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
function authorityScore(url) {
  const d = domainOf(url);
  if (/\.gov\.uk$/.test(d) || d === 'gov.uk') return 100;
  if (UK.preferDomains.some((p) => d === p || d.endsWith('.' + p))) return 80;
  if (/\.uk$/.test(d)) return 60;                 // UK domain
  if (/\.(ac\.uk|nhs\.uk|org\.uk)$/.test(d)) return 70;
  return 30;
}
// De-dup by domain, keep the highest-authority/first per domain, rank.
function rankSources(sources) {
  const byDomain = new Map();
  for (const s of sources) {
    if (!s || !s.url) continue;
    const d = domainOf(s.url);
    const cur = byDomain.get(d);
    if (!cur) byDomain.set(d, s);
  }
  return [...byDomain.values()]
    .map((s) => ({ ...s, domain: domainOf(s.url), authority: authorityScore(s.url) }))
    .sort((a, b) => b.authority - a.authority);
}

// ---- tiny in-memory cache (per-process, short TTL via injected timestamp) ---
const CACHE = new Map();
function cacheGet(k, now, ttlMs) { const e = CACHE.get(k); return (e && now - e.t < ttlMs) ? e.v : null; }
function cacheSet(k, v, now) { CACHE.set(k, { v, t: now }); if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value); }

// Core: gather UK web material on a topic from both engines. Returns
// { summary, material, sources[], cost }.
export async function gather(topic, { recency = 'month', excludeDomains, now = 0, ttlMs = 0 } = {}) {
  const cacheKey = `g:${topic}:${recency}`;
  if (ttlMs && now) { const c = cacheGet(cacheKey, now, ttlMs); if (c) return c; }

  const out = { summary: '', material: '', sources: [], cost: 0, engines: {} };
  // 1) Tavily — gather UK source documents (parallel-safe).
  let tav = null;
  if (tavily.hasKey()) {
    try { tav = await tavily.search(topic, { depth: 'advanced', maxResults: 8, excludeDomains }); out.engines.tavily = (tav.results || []).length; }
    catch (e) { out.engines.tavilyError = String(e.message || e); }
  }
  // 2) Perplexity — grounded, cited current-state summary (UK).
  let pp = null;
  if (perplexity.hasKey()) {
    try {
      pp = await perplexity.ask({
        system: P('research.gather'),
        user: `Topic: ${topic}\n\nGive the key current facts, recent changes, and the main questions UK readers ask — for content planning.`,
        ...mt('research.gather', 'pro'), recency, domains: UK.preferDomains,
      });
      out.engines.perplexity = (pp.sources || []).length;
      if (pp.cost) out.cost += pp.cost;
    } catch (e) { out.engines.perplexityError = String(e.message || e); }
  }

  out.summary = (pp && pp.answer) || (tav && tav.answer) || '';
  out.material = [
    pp && pp.answer ? `GROUNDED SUMMARY:\n${pp.answer}` : '',
    ...(tav && tav.results ? tav.results.map((r) => `SOURCE: ${r.title} (${r.url})\n${(r.content || '').slice(0, 700)}`) : []),
  ].filter(Boolean).join('\n\n');
  out.sources = rankSources([...(pp ? pp.sources : []), ...(tav ? tav.results : [])]);

  if (ttlMs && now) cacheSet(cacheKey, out, now);
  return out;
}

// ---- public products -------------------------------------------------------

// Research-backed content brief for a keyword/cluster. Tavily+Perplexity gather,
// Claude structures into a writer-ready UK brief with cited facts + internal links.
export async function contentBrief({ keyword, intent, siteName, niche, excludeDomain, internalLinkCandidates, siteId, now = 0 }) {
  if (!perplexity.hasKey() && !tavily.hasKey()) return { error: 'No research engine configured — add PERPLEXITY_API_KEY and/or TAVILY_API_KEY.' };
  const research = await gather(keyword, { recency: 'month', excludeDomains: excludeDomain ? [excludeDomain] : undefined, now, ttlMs: 6 * 60 * 60 * 1000 });
  if (!research.summary && !research.material) return { error: 'Research returned nothing for this keyword.', engines: research.engines };
  const brief = await claude.synthesizeContentBrief({ keyword, intent, siteName, niche, research, internalLinkCandidates, siteId });
  return { keyword, intent, brief, sources: research.sources, engines: research.engines, researchCost: research.cost };
}

// Current UK trending topics in a niche (news-weighted), with sources.
export async function trendingIntel({ niche, now = 0 }) {
  if (!perplexity.hasKey() && !tavily.hasKey()) return { error: 'No research engine configured.' };
  const ttl = 6 * 60 * 60 * 1000;
  const cacheKey = `trend:${niche}`;
  if (now) { const c = cacheGet(cacheKey, now, ttl); if (c) return c; }
  const out = { niche, topics: [], summary: '', sources: [], engines: {}, cost: 0 };
  if (perplexity.hasKey()) {
    try {
      const pp = await perplexity.ask({
        system: P('research.trending'),
        user: `Niche: ${niche}. What is trending in the UK this week that we could write about? Give concrete topics with why each matters now.`,
        ...mt('research.trending', 'fast'), recency: 'week', domains: UK.preferDomains, maxTokens: 700,
      });
      out.summary = pp.answer; out.sources = rankSources(pp.sources); out.engines.perplexity = (pp.sources || []).length; if (pp.cost) out.cost += pp.cost;
    } catch (e) { out.engines.perplexityError = String(e.message || e); }
  }
  if (tavily.hasKey()) {
    try { const t = await tavily.search(`${niche} UK`, { topic: 'news', days: 7, maxResults: 8 }); out.topics = (t.results || []).map((r) => ({ title: r.title, url: r.url })); out.engines.tavily = out.topics.length; if (!out.sources.length) out.sources = rankSources(t.results); }
    catch (e) { out.engines.tavilyError = String(e.message || e); }
  }
  if (now) cacheSet(cacheKey, out, now);
  return out;
}

// Grounded, cited current UK facts on a topic (for YMYL accuracy / citable facts).
export async function citableFactsGrounded({ topic, niche, now = 0 }) {
  if (!perplexity.hasKey()) return { error: 'Perplexity not configured — needed for grounded facts.' };
  const pp = await perplexity.ask({
    system: P('research.facts'),
    user: `Topic: ${topic}${niche ? ` (niche: ${niche})` : ''}. List the current UK facts most useful to cite in an article.`,
    ...mt('research.facts', 'pro'), recency: 'month', domains: UK.preferDomains, maxTokens: 900,
  });
  return { topic, summary: pp.answer, sources: rankSources(pp.sources), cost: pp.cost };
}

export function status() { return { perplexity: perplexity.hasKey(), tavily: tavily.hasKey() }; }

export default { gather, contentBrief, trendingIntel, citableFactsGrounded, status };
