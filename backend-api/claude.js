// ===========================================================================
// Claude API client — generates the actual SEO/accessibility content the agent
// proposes (meta descriptions, title rewrites, alt text, etc.). Uses the key
// from env (locally) or the Supabase secret (in edge functions). Generic: the
// page context is passed in, nothing is site-specific.
//
// Model: Claude Sonnet — strong quality/latency balance for short structured
// content generation. Prompt caching applied to the shared system prompt.
// ===========================================================================
import { config } from 'dotenv';
// override:true because some hosted environments inject an EMPTY ANTHROPIC_API_KEY
// into process.env, which dotenv won't replace without override.
config({ override: true });
import { limiters, breakers } from './infra.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// Allow an explicit key (e.g. fetched from a Supabase secret in edge fns).
let RUNTIME_KEY = null;
export function setClaudeKey(k) { RUNTIME_KEY = k || null; }

function key() {
  const k = RUNTIME_KEY || process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  return k;
}

// Resilient Anthropic POST: bounded by a timeout (a stuck upstream otherwise
// hangs the request until a proxy kills it) and retried on the transient statuses
// Anthropic returns under load (429 rate-limit, 529 overloaded, 5xx). This is why
// the weekly briefing and other one-shot generations occasionally failed.
// Concurrency-capped (so a mass batch of generations queues instead of
// 429-storming Anthropic) and circuit-broken (fail fast when Anthropic is down).
function anthropicPost(payload, opts = {}) {
  return limiters.anthropic.run(() => breakers.anthropic.run(() => _anthropicPost(payload, opts)));
}
// timeoutMs bounds a single attempt; deadlineMs bounds ALL attempts+backoff
// together. Both sit under the platform's ~100s edge response cap: a single
// request can no longer stack retries into a ~270s run (old worst case: 3×90s +
// backoff) that kept burning an Anthropic slot + budget long after the edge had
// 504'd and the user retried. 60s/attempt covers virtually every structured-content
// generation while still leaving room for one shorter retry inside the 95s deadline.
async function _anthropicPost(payload, { timeoutMs = 60000, retries = 2, deadlineMs = 95000 } = {}) {
  const TRANSIENT = new Set([429, 500, 502, 503, 529]);
  const startedAt = Date.now();
  const budgetLeft = () => deadlineMs - (Date.now() - startedAt);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && budgetLeft() < 6000) break;   // not enough edge budget left for a real retry
    const attemptMs = Math.max(4000, Math.min(timeoutMs, budgetLeft()));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), attemptMs);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (TRANSIENT.has(res.status)) {
        if (attempt < retries && budgetLeft() > 6000) {
          await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt)));
          continue;
        }
        // Retries/budget exhausted on an overloaded/rate-limit status: THROW (don't
        // return the Response) so breakers.anthropic records the failure and can open
        // ("fail fast when Anthropic is down"). Returning a resolved value reset the breaker.
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error(`Claude ${res.status}: ${data.error?.message || 'overloaded / rate-limited'}`), { status: res.status, transient: true });
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e && TRANSIENT.has(e.status)) throw e;   // final transient error from above — propagate to the breaker
      if (attempt < retries && budgetLeft() > 6000) { await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt))); continue; }
      throw new Error(e.name === 'AbortError' ? `Claude request timed out after ${Math.round(attemptMs / 1000)}s — please retry` : e.message);
    }
  }
  throw lastErr || new Error('Claude request failed');
}

// Low-level call. Returns the assistant text. `promptKey` lets per-prompt admin
// model/temperature overrides apply; explicit model/temperature still win.
// timeoutMs/deadlineMs: callers running OUTSIDE a request (background jobs) can raise the
// per-attempt and total budgets — the defaults are sized for the ~100s edge cap, which does
// not apply there. A big clustering generation was failing at a 34s retry sliver otherwise.
export async function complete({ system, messages, maxTokens = 1024, temperature, model, promptKey, timeoutMs, deadlineMs }) {
  const m = model || (promptKey ? modelFor(promptKey) : null) || MODEL;
  const t = temperature != null ? temperature : (promptKey && tempFor(promptKey) != null ? tempFor(promptKey) : 0.3);
  const budget = {};
  if (timeoutMs) budget.timeoutMs = timeoutMs;
  if (deadlineMs) budget.deadlineMs = deadlineMs;
  const res = await anthropicPost({ model: m, max_tokens: maxTokens, temperature: t, system, messages }, budget);
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// System prompts are sourced from the editable registry (admin panel → Supabase).
// SYSTEM() is the shared content-rules block, cached.
import { P, modelFor, tempFor, geoFor } from './prompts.js';
// siteId (optional) → use that site's per-site prompt override when one is set.
// geoBlock = the site's niche/context (geo_context), prepended as a CACHED system
// block so every site-scoped call is niche-aware. Cached → cheap on repeat within a
// site's batch. Empty array when the site has no geo_context (no-op).
const geoBlock = (siteId) => {
  const g = geoFor(siteId);
  return g ? [{ type: 'text', text: `=== THIS SITE'S NICHE & CONTEXT (author strictly for this site; do NOT drift to generic/national topics) ===\n${g}`, cache_control: { type: 'ephemeral' } }] : [];
};
const SYSTEM = (siteId) => [...geoBlock(siteId), { type: 'text', text: P('content.rules', siteId), cache_control: { type: 'ephemeral' } }];
const sys = (key, siteId) => [...geoBlock(siteId), { type: 'text', text: P(key, siteId) }];

// ---- task helpers ---------------------------------------------------------

// Meta description: 140–160 chars, compelling, keyword-aware.
export async function metaDescription({ url, title, headings, excerpt, siteId }) {
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 200,
    messages: [{
      role: 'user',
      content: `Write a meta description (140–160 characters, single line) for this page.
URL: ${url}
Title: ${title || '(none)'}
Key headings: ${(headings || []).slice(0, 6).join(' | ') || '(none)'}
Excerpt: ${(excerpt || '').slice(0, 500)}

Output only the meta description text.`,
    }],
  });
  return txt.replace(/^["']|["']$/g, '').slice(0, 165);
}

// Title rewrite: <= 60 chars, keyword front-loaded, keeps brand.
export async function titleRewrite({ url, currentTitle, brand, siteId }) {
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 120,
    messages: [{
      role: 'user',
      content: `Rewrite this page title to be <= 60 characters, keyword front-loaded, compelling for search.
${brand ? 'Keep the brand "' + brand + '" if it fits.' : ''}
URL: ${url}
Current title: ${currentTitle}

Output only the new title.`,
    }],
  });
  return txt.replace(/^["']|["']$/g, '').slice(0, 65);
}

// Alt text for an image, from its filename + surrounding context.
export async function altText({ filename, context, pageTitle, siteId }) {
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 120,
    messages: [{
      role: 'user',
      content: `Write concise, descriptive alt text (<= 125 chars) for an image.
Filename: ${filename}
Page: ${pageTitle || ''}
Nearby text: ${(context || '').slice(0, 300)}

Describe what the image likely shows. Output only the alt text.`,
    }],
  });
  return txt.replace(/^["']|["']$/g, '').slice(0, 125);
}

// Content intelligence: analyze a site's existing content (titles/URLs/topics)
// and return content gaps, new-content suggestions, and keyword clusters.
// Returns structured JSON the UI renders. Generic across niches.
export async function contentIntelligence({ siteName, niche, titles, sampleHeadings, siteId, market }) {
  const list = (titles || []).slice(0, 90).map((t, i) => `${i + 1}. ${t}`).join('\n');
  const country = (market && market.country) || 'United Kingdom';
  const scope = (market && market.scope) ? market.scope + '\n\n' : '';
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 6000,
    messages: [{
      role: 'user',
      content: `${scope}You are an SEO content strategist. TARGET MARKET: ${country}. Analyze the site's existing content and return a JSON object.
Site: ${siteName || ''}${niche ? ' — niche: ' + niche : ''}

Existing page titles (what's ALREADY covered):
${list || '(none provided)'}

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "clusters": [
    { "name": "topic cluster name", "theme": "what unifies it", "pageCount": <int est. from titles>, "keywords": ["kw1","kw2","kw3","kw4"], "strength": "strong|moderate|thin" }
  ],
  "keywordClusters": [
    { "primaryKeyword": "head keyword for a NEW content cluster to create", "intent": "informational|commercial|transactional", "keywords": ["8-10 related search queries — each a UNIQUE angle/sub-topic of the primary, not a synonym"], "angles": ["2-3 distinct article titles attacking this cluster from different viewpoints"] }
  ],
  "gaps": [
    { "topic": "missing topic", "keyword": "the primary search query a ${country} user types for this gap", "why": "why it matters for the ${country} market", "intent": "informational|commercial|transactional", "priority": "high|medium|low" }
  ],
  "suggestions": [
    { "title": "proposed new article title (<=60 chars)", "cluster": "which cluster it strengthens", "targetKeyword": "primary kw", "rationale": "1 sentence", "format": "guide|comparison|faq|listicle|how-to" }
  ],
  "internalLinks": [
    { "from": "topic/keyword", "to": "topic/keyword", "reason": "why link these" }
  ]
}
Rules:
- clusters: group the EXISTING titles (reflect what's there).
- keywordClusters: 5-8 NEW content clusters to create. Each = ONE primaryKeyword + 8-10 related keywords that share the primary's search intent but each target a UNIQUE angle/sub-topic (genuinely different facets a searcher wants — NOT synonyms) + 2-3 "angles" (distinct article titles attacking the cluster from different viewpoints). EVERY keyword must be how a ${country} user actually searches. THESE keywordClusters (primary + related keywords) are exactly what gets pushed to Airtable for the article writer — every keyword must be a real, writable content target.
- gaps: each gap MUST include a "keyword" — the primary ${country} search query for it (not just a topic name).
- gaps + suggestions: you are planning content to win ${country} searchers. EVERY gap "topic" and suggestion "title" MUST carry an explicit ${country} angle, and EVERY targetKeyword MUST be how a ${country} user actually searches. A generic title/topic with NO ${country} relevance is INVALID — rewrite it. The site's service can be foreign (e.g. UK visas); then plan for ${country} users of that service.
  Example for India: topic "UK Skilled Worker Visa — guide for Indian applicants"; title "UK Skilled Worker Visa from India: Eligibility & Documents"; targetKeyword "uk skilled worker visa for indians". Mirror this ${country} framing every time.
- 4-7 clusters, 5-8 gaps, 6-10 suggestions, 3-5 internalLinks. Specific to the niche AND ${country}. YMYL: factual.`,
    }],
  });
  // Robust JSON extraction
  let json = txt.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) json = fence[1].trim();
  const start = json.indexOf('{'); const end = json.lastIndexOf('}');
  if (start >= 0 && end > start) json = json.slice(start, end + 1);
  try { const o = JSON.parse(json); o._targetMarket = country; return o; }
  catch (e) { return { clusters: [], keywordClusters: [], gaps: [], suggestions: [], internalLinks: [], _targetMarket: country, _parseError: true, _raw: txt.slice(0, 500) }; }
}

// Generic: ask Claude to draft the "after" value for any proposal, given the finding.
export async function draftFix({ finding, pageContext, siteId }) {
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 400,
    messages: [{
      role: 'user',
      content: `An automated audit found this issue. Draft the concrete fix value a human will review.
Issue: ${finding.title}
Detail: ${finding.detail || ''}
Page: ${finding.page || ''}
Channel: ${finding.channel || ''}
Page context: ${JSON.stringify(pageContext || {}).slice(0, 600)}

Output only the proposed fix (the value to apply), nothing else.`,
    }],
  });
  return txt.trim();
}

// Content-decay REFRESH (not a redraft). Produces a conservative "freshness"
// Substantive content-refresh brief for a decaying page (editable prompt: content.decay).
// Returns markdown text — a real improvement plan a writer can execute, not a date bump.
export async function decayBrief({ page, pageContext, siteId }) {
  const p = page || {};
  const txt = await complete({
    system: sys('content.decay', siteId), promptKey: 'content.decay',
    maxTokens: 1200, temperature: 0.4,
    messages: [{
      role: 'user',
      content: `Write a content-refresh brief for this decaying page.
URL: ${p.url || p.page || ''}
Decline: lost ${p.clicksLost} clicks (${p.pctDrop}% drop); average position drifted ${p.positionDrift > 0 ? '+' + p.positionDrift + ' (worse)' : p.positionDrift}.

Current page content (excerpt — base the plan on THIS, do not invent facts):
${(pageContext && pageContext.excerpt) || '(could not fetch the live page)'}`,
    }],
  });
  return txt;
}

// Full REWRITE of a decaying page — expand/update the EXISTING article per the decay
// refresh brief (NOT a new article, NOT a bolt-on block). Returns the complete updated
// post body as HTML. Editable prompt: content.refresh.
export async function refreshArticle({ page, currentContent, brief, siteId }) {
  const p = page || {};
  const txt = await complete({
    system: sys('content.refresh', siteId), promptKey: 'content.refresh',
    maxTokens: 4096, temperature: 0.5,
    messages: [{
      role: 'user',
      content: `Rewrite and improve this EXISTING page so it recovers its lost rankings. Keep what already works; expand, update and restructure per the refresh brief. Do NOT start from scratch and do NOT add a visible "updated on" banner.

PAGE: ${p.title || ''} — ${p.url || p.page || ''}

=== REFRESH BRIEF (the plan to execute) ===
${brief || '(no brief supplied — improve depth, freshness, structure, FAQs and internal links)'}

=== CURRENT PAGE CONTENT (rewrite/expand THIS; do not invent facts beyond it and the brief) ===
${(currentContent || '').slice(0, 16000)}

Output ONLY the complete, updated article body as clean HTML. No preamble, no code fences, no commentary.`,
    }],
  });
  return txt;
}

// block to PREPEND to a decaying page: an updated lede + a few targeted points
// that re-establish relevance for the queries it's losing. Grounded strictly in
// the existing page content — no invented facts (critical for YMYL/legal).
// Returns { heading, intro, points[], note } as data; the server assembles HTML.
export async function refreshContent({ url, title, currentText, niche, decay, monthYear, siteId }) {
  const txt = await complete({
    system: SYSTEM(siteId), promptKey: 'content.rules',
    maxTokens: 700, temperature: 0.25,
    messages: [{
      role: 'user',
      content: `Write a SHORT "freshness refresh" block to add to the TOP of an existing page that has lost search rankings. This is a REFRESH, not a rewrite — reinforce and update what's already there; do NOT contradict or duplicate the body wholesale.

Page title: ${title || '(none)'}
URL: ${url || ''}
Niche: ${niche || '(general)'}
Decline: lost ${decay && decay.clicksLost != null ? decay.clicksLost : '?'} clicks (${decay && decay.pctDrop != null ? decay.pctDrop : '?'}% drop); avg position moved ${decay && decay.positionDrift != null ? (decay.positionDrift > 0 ? '+' + decay.positionDrift + ' (worse)' : decay.positionDrift + ' (better)') : '?'}.
Current page content (verbatim excerpt — use ONLY facts present here, invent nothing):
"""${(currentText || '').slice(0, 3500)}"""

Rules:
- Base the block ONLY on the article's SUBJECT MATTER from the excerpt. IGNORE site-wide navigation, footers, marketing blurbs, ratings/review counts ("trusted by N users", star ratings), app/product feature lists, badges and calls-to-action — that is page chrome, NOT the article.
- Strictly grounded: if a fact isn't in the excerpt, don't state it. NEVER invent statistics, dates, prices, legal claims, or guarantees. This may be a legal/financial (YMYL) page — accuracy over flourish.
- Every piece must add REAL, specific, decision-relevant value about the topic. NO generic filler ("we've updated this page", "explore our features", restating that a product exists).
- "heading": a short, TOPICAL H2 about the article's subject (a sharper angle or a "what to know now" framing). Avoid a bare "Updated for ${monthYear || 'this year'}".
- "intro": 1–2 sentences of genuinely useful, topic-specific context for someone searching now (${monthYear || 'this year'}).
- "points": 3–5 specific, decision-relevant takeaways ABOUT THE TOPIC, drawn from the excerpt (each ≤ 22 words). Never product/app features or marketing.
- "note": one short, relevant line (no fake urgency, no invented offers).
- If the excerpt contains NO substantive article content (only chrome/marketing/nav), return empty strings and an empty points array — do NOT fabricate a block.

Output ONLY a JSON object: {"heading":"...","intro":"...","points":["...","..."],"note":"..."}`,
    }],
  });
  let obj;
  try { obj = JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object') return { heading: '', intro: txt.slice(0, 400), points: [], note: '' };
  return {
    heading: String(obj.heading || '').slice(0, 120),
    intro: String(obj.intro || '').slice(0, 600),
    points: Array.isArray(obj.points) ? obj.points.map((p) => String(p).slice(0, 160)).slice(0, 6) : [],
    note: String(obj.note || '').slice(0, 300),
  };
}

// Executive narrative — Claude writes a weekly story OVER pre-computed metrics.
// CRITICAL: it narrates the numbers; it must never invent or recompute them.
export async function narrate({ siteName, metrics, siteId }) {
  const txt = await complete({
    system: sys('report.narrate', siteId),
    promptKey: 'report.narrate',
    maxTokens: 700,
    messages: [{ role: 'user', content: `Site: ${siteName}\n\nComputed metrics (do not alter these numbers):\n${JSON.stringify(metrics, null, 1).slice(0, 6000)}\n\nWrite the weekly executive briefing.` }],
  });
  return txt.trim();
}

// Internal-link suggestions. Given a source page's text + a CLOSED LIST of
// candidate target pages (so Claude cannot invent URLs), propose contextual
// internal links. Returns [{ anchor, targetUrl, reason }].
export async function internalLinkSuggestions({ sourceUrl, sourceTitle, sourceText, candidates, siteId }) {
  const list = (candidates || []).slice(0, 150).map((c, i) => `${i + 1}. ${c.title} → ${c.url}`).join('\n');
  const txt = await complete({
    system: sys('seo.internalLinks', siteId),
    promptKey: 'seo.internalLinks',
    maxTokens: 1200,
    messages: [{ role: 'user', content: `SOURCE PAGE: ${sourceTitle || ''} (${sourceUrl})\n\nSOURCE TEXT (excerpt):\n${(sourceText || '').slice(0, 4500)}\n\nCANDIDATE TARGET PAGES (link only to these):\n${list}\n\nBe generous but precise: propose EVERY genuinely-relevant, helpful in-content link (aim for the 4-8 most useful) — only skip a candidate if linking would be forced or off-topic. The anchor MUST be a phrase that appears verbatim in the SOURCE TEXT above (so it can be inserted), 2-6 words, descriptive. Return the JSON array of internal-link suggestions.` }],
  });
  try {
    const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
    const valid = new Set((candidates || []).map((c) => c.url));
    return arr.filter((s) => s && s.anchor && valid.has(s.targetUrl) && s.targetUrl !== sourceUrl)
      .map((s) => ({ anchor: String(s.anchor).slice(0, 80), targetUrl: s.targetUrl, reason: String(s.reason || '').slice(0, 120) }));
  } catch (e) { return []; }
}

// External-link suggestions: propose authoritative OUTBOUND links (to high-trust
// sources — official/gov, standards bodies, established publications) for a page,
// using anchor text that already appears in the page so it can be applied cleanly.
// Returns [{ anchor, targetUrl, source, reason }].
export async function externalLinkSuggestions({ url, title, text, niche, siteId }) {
  const txt = await complete({
    system: sys('seo.externalLinks', siteId),
    promptKey: 'seo.externalLinks',
    maxTokens: 900,
    messages: [{ role: 'user', content: `PAGE URL: ${url}\nTITLE: ${title || ''}\nNICHE: ${niche || ''}\n\nPAGE TEXT (excerpt):\n${(text || '').slice(0, 5000)}\n\nReturn the JSON array of authoritative external-link suggestions.` }],
  });
  try {
    const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
    return (Array.isArray(arr) ? arr : [])
      .filter((s) => s && s.anchor && s.targetUrl && /^https?:\/\//i.test(s.targetUrl))
      .map((s) => ({ anchor: String(s.anchor).slice(0, 80), targetUrl: String(s.targetUrl), source: String(s.source || '').slice(0, 60), reason: String(s.reason || '').slice(0, 140) }))
      .slice(0, 20);
  } catch (e) { return []; }
}

// AI-SEO fact extraction. Pull the citable, extractable facts from a page and
// propose a FAQPage JSON-LD + concrete factual additions that make the page
// easier for LLMs/answer engines to cite. Returns { facts, faqs, suggestions }.
export async function extractCitableFacts({ url, title, text, niche, siteId }) {
  const txt = await complete({
    system: sys('seo.pageFacts', siteId),
    promptKey: 'seo.pageFacts',
    maxTokens: 1100,
    messages: [{ role: 'user', content: `URL: ${url}\nTITLE: ${title || ''}\nNICHE: ${niche || ''}\n\nPAGE TEXT (excerpt):\n${(text || '').slice(0, 6000)}\n\nReturn the JSON.` }],
  });
  try {
    const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return { facts: o.facts || [], faqs: o.faqs || [], suggestions: o.suggestions || [] };
  } catch (e) { return { facts: [], faqs: [], suggestions: [], _parseError: true }; }
}

// grill-me: produce a plan BEFORE any code/changes. Grills the brief, surfaces
// open questions/risks, and sequences the work. Returns a markdown plan.
export async function projectPlan({ siteName, niche, baseUrl, keyPages, scores, goals, siteId }) {
  const txt = await complete({
    system: sys('plan.project', siteId),
    promptKey: 'plan.project',
    maxTokens: 1100,
    messages: [{ role: 'user', content: `Site: ${siteName || baseUrl} (${baseUrl})\nNiche: ${niche || 'unknown'}\nGoals: ${goals || 'reach 100/100 Lighthouse across Performance/Accessibility/Best-Practices/SEO + improve AI citation, with human approval before publishing.'}\nCurrent scores: ${scores ? JSON.stringify(scores) : 'not yet audited'}\nKey pages: ${(keyPages || []).map((p) => p.name || p.path || p).join(', ') || 'not specified'}\n\nWrite the plan.` }],
  });
  return txt.trim();
}

// Cluster a flat keyword list into labelled topic clusters with search intent
// and a suggested content title/format. Claude ONLY groups + labels — it must
// use the EXACT keyword strings provided (no inventing keywords); volumes/gaps
// are computed deterministically by the caller.
export async function clusterKeywords({ keywords, siteName, niche, siteId, timeoutMs, deadlineMs, model }) {
  const list = (keywords || []).slice(0, 140).map((k) => `${k.keyword}${k.volume ? ` (${k.volume})` : ''}`).join('\n');
  // Haiku by DEFAULT (measured 12.7s vs Sonnet 24.8s p50 and a >60s tail on this exact
  // payload — the tail was aborting the whole Content Plan). An explicit caller model or an
  // admin per-prompt override still wins. maxTokens 3000: real output measured ~1900 tokens,
  // and the salvage parser below already recovers a truncated tail.
  const m = model || modelFor('content.cluster') || 'claude-haiku-4-5-20251001';
  const txt = await complete({
    system: [{ type: 'text', text: P('content.cluster', siteId) }],   // per-site prompt when set
    promptKey: 'content.cluster',
    model: m,
    maxTokens: 3000,
    timeoutMs, deadlineMs,
    messages: [{ role: 'user', content: `Site: ${siteName || ''}\nNiche: ${niche || ''}\n\nKeywords (with volume):\n${list}\n\nReturn the clustered JSON.` }],
  });
  // Parse; if the JSON was truncated, salvage whatever complete cluster objects exist.
  try {
    const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return (o.clusters || []).filter((c) => c && c.label && Array.isArray(c.keywords));
  } catch (e) {
    const salvaged = [];
    const re = /\{\s*"label"[\s\S]*?"keywords"\s*:\s*\[[^\]]*\][\s\S]*?\}/g;
    let m; while ((m = re.exec(txt)) !== null) { try { const c = JSON.parse(m[0]); if (c.label && Array.isArray(c.keywords)) salvaged.push(c); } catch (_) {} }
    return salvaged;
  }
}

// Filter a keyword-gap list down to terms genuinely relevant to THIS site's niche /
// services, using its geo_context. Fixes off-niche gaps (e.g. a broad legal rival
// surfacing immigration/jobs keywords for an ILA-only site). Fail-open: on any error,
// or if it would nuke everything, returns the input unchanged.
export async function filterKeywordsByNiche({ keywords, niche, siteName, siteId }) {
  const all = keywords || [];
  const list = all.slice(0, 200);      // only these are ever shown to the model
  const remainder = all.slice(200);    // never evaluated — pass through unfiltered (don't drop)
  if (!list.length || !niche) return all;
  const txt = await complete({
    system: [{ type: 'text', text: `You filter a keyword list down to terms this specific business could actually SERVE.

STEP 1: From the CONTEXT, identify the site's SPECIFIC SERVICES — the exact things it is hired to do.
STEP 2: KEEP a keyword ONLY if the searcher wants one of THOSE SPECIFIC SERVICES (or is at a decision point that leads directly to one).

DROP — this is the part that matters most — anything in the same INDUSTRY or PROFESSION but a DIFFERENT SERVICE. "Same industry" is NOT relevance:
- a firm that does independent legal advice on guarantees/mortgages must DROP divorce, personal injury, legal aid, no-win-no-fee, conveyancing quotes, "find a solicitor", law-society/regulator lookups — it does not sell those;
- a dental clinic must DROP general "doctor"/hospital terms.
If this business would have to refer the searcher to someone else, DROP it.

Also DROP: other companies' brand names, jobs/careers/salary terms, directories and regulators, generic profession lookups, and definitions of unrelated concepts.

Be STRICT: a short, precise list is far more valuable than a broad one. High search volume is NOT a reason to keep something off-service. Return ONLY a JSON array of the kept keywords (exact strings copied from the input). No prose.` }],
    model: 'claude-haiku-4-5-20251001',   // fast — a filtering task; keeps the gap route under the edge timeout
    maxTokens: 6000,   // 200 echoed keywords can exceed 3000 output tokens — truncation broke the JSON and silently disabled the filter
    temperature: 0,
    messages: [{ role: 'user', content: `SITE: ${siteName || ''}\n\nNICHE / CONTEXT (what this site is about + offers):\n${String(niche).slice(0, 1800)}\n\nKEYWORDS:\n${list.join('\n')}\n\nReturn the JSON array of only the relevant keywords.` }],
  });
  try {
    const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
    const keep = new Set(arr.map((x) => String(x).toLowerCase().trim()));
    // Filter ONLY the slice the model actually saw; keywords past index 200 were
    // never shown, so append them unchanged rather than silently dropping them.
    const filtered = list.filter((k) => keep.has(String(k).toLowerCase().trim()));
    if (!filtered.length) return all;   // model nuked the shown slice → fail open
    return filtered.concat(remainder);
  } catch (e) { return all; }
}

// Synthesize a writer-ready content brief from web RESEARCH (Tavily sources +
// Perplexity grounded answer). Claude structures + writes the brief but must use
// ONLY the supplied research — every fact ties to a provided source, nothing
// invented. UK audience, UK English. Returns structured JSON.
export async function synthesizeContentBrief({ keyword, intent, siteName, niche, research, internalLinkCandidates, siteId, market }) {
  const sources = (research.sources || []).map((s, i) => `[${i + 1}] ${s.title || ''} — ${s.url}`).join('\n');
  const material = (research.material || '').slice(0, 9000);
  const links = (internalLinkCandidates || []).slice(0, 25).map((p) => `${p.title} → ${p.url}`).join('\n');
  const country = (market && market.country) || 'United Kingdom';
  const scope = (market && market.scope) ? market.scope + '\n\n' : '';
  const txt = await complete({
    system: sys('content.brief', siteId),
    promptKey: 'content.brief',
    maxTokens: 3000,
    messages: [{ role: 'user', content: `${scope}TARGET MARKET: ${country}\nKEYWORD: ${keyword}\nINTENT: ${intent || ''}\nSITE: ${siteName || ''}  NICHE: ${niche || ''}\n\n=== GROUNDED SUMMARY ===\n${research.summary || ''}\n\n=== SOURCE MATERIAL (excerpts) ===\n${material}\n\n=== SOURCES ===\n${sources}\n\n=== INTERNAL-LINK CANDIDATES (your real pages) ===\n${links || '(none)'}\n\nWrite the ${country} content brief as JSON.` }],
  });
  try {
    const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    o.sources = research.sources || [];
    return o;
  } catch (e) { return { title: keyword, error: 'brief synthesis parse failed', sources: research.sources || [], _raw: txt.slice(0, 400) }; }
}

// AEO answer-first block. For a TARGET QUERY + page, produce a question-format
// heading + a direct 40-60 word answer (no preamble) + the right real-HTML
// snippet structure (<ol>/<ul> for steps, <table> for comparisons) + an optional
// FAQ. Niche-aware via sys('aeo.answerBlock', siteId). Returns the parsed object
// { heading, format, answer, html, faq } or { error }.
// Parse the answer-block JSON: strip ```json fences, slice the first balanced
// object, JSON.parse. Returns the normalized block, or null so the caller can
// retry / salvage. (Strips fences explicitly so trailing prose after the closing
// ``` can't poison lastIndexOf('}').)
function parseAnswerBlockJson(txt) {
  const t = String(txt || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    const o = JSON.parse(t.slice(s, e + 1));
    if (!o || (!o.heading && !o.answer)) return null;
    return {
      heading: String(o.heading || ''), format: String(o.format || ''),
      answer: String(o.answer || ''), html: String(o.html || ''),
      faq: Array.isArray(o.faq) ? o.faq.filter((f) => f && f.q && f.a).map((f) => ({ q: String(f.q), a: String(f.a) })) : [],
    };
  } catch (_) { return null; }
}

export async function answerBlock({ url, title, query, currentContent, format, market, siteId }) {
  const content = `TARGET QUERY: ${query || ''}
PAGE TITLE: ${title || '(none)'}
URL: ${url || ''}${format ? '\nDESIRED FORMAT: ' + format : ''}${market ? `\nLOCALIZE strictly for ${market}: cite ${market} authorities/regulators, ${market} law, local currency and spelling — do NOT default to UK unless the market IS the UK.` : ''}

=== CURRENT PAGE CONTENT (ground the answer in THIS; do not invent facts beyond it) ===
${(currentContent || '').slice(0, 6000)}

Produce the answer-first block as STRICT JSON.`;
  const call = (maxTokens, extra) => complete({
    system: sys('aeo.answerBlock', siteId), promptKey: 'aeo.answerBlock',
    maxTokens, temperature: 0.4,
    messages: [{ role: 'user', content: content + (extra || '') }],
  });
  // Primary call. If the JSON is unparseable (almost always truncation), retry
  // ONCE with more token headroom + a compactness nudge before regex-salvage.
  let txt = await call(2800, '');
  let parsed = parseAnswerBlockJson(txt);
  if (!parsed) {
    txt = await call(4096, '\n\nReturn COMPACT, COMPLETE JSON only — no markdown fences; keep the html concise so the JSON closes.');
    parsed = parseAnswerBlockJson(txt);
  }
  if (parsed) return parsed;
  // Final salvage: regex-recover the fields from the raw text so a verbose/truncated
  // block still yields usable content instead of a hard error.
  const grab = (re) => { const m = txt.match(re); return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : ''; };
  const heading = grab(/"heading"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const answer = grab(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!heading && !answer) return { error: 'answerBlock parse failed', _raw: txt.slice(0, 400) };
  const fmt = grab(/"format"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const html = grab(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const faq = [];
  const faqBlock = txt.match(/"faq"\s*:\s*\[([\s\S]*?)\]/);
  if (faqBlock) {
    const re = /\{\s*"q"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"a"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
    let m; while ((m = re.exec(faqBlock[1])) !== null) {
      faq.push({ q: m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'), a: m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n') });
    }
  }
  return { heading, format: fmt, answer, html, faq, _salvaged: true };
}

// AEO snippet-format classifier. Given a QUERY (+ optional SERP features),
// classify the winning snippet format. Returns the parsed { format, reason }.
export async function classifySnippetFormat({ query, serpFeatures, siteId }) {
  const txt = await complete({
    system: sys('aeo.snippetFormat', siteId),
    promptKey: 'aeo.snippetFormat',
    maxTokens: 200, temperature: 0,
    messages: [{ role: 'user', content: `QUERY: ${query || ''}${serpFeatures ? `\nSERP FEATURES: ${typeof serpFeatures === 'string' ? serpFeatures : JSON.stringify(serpFeatures).slice(0, 600)}` : ''}\n\nReturn the classification JSON.` }],
  });
  try {
    const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return { format: String(o.format || ''), reason: String(o.reason || '') };
  } catch (e) { return { format: '', reason: '', _parseError: true }; }
}

export default { metaDescription, titleRewrite, altText, draftFix, narrate, internalLinkSuggestions, extractCitableFacts, projectPlan, clusterKeywords, synthesizeContentBrief, decayBrief, refreshArticle, answerBlock, classifySnippetFormat, complete };
