// ===========================================================================
// Prompt registry — the single source of truth for every SYSTEM prompt the
// platform uses, grouped by category. Each module registers its prompt + the
// in-code default; at runtime `P(key)` returns the live value (a Supabase
// override if an admin edited it in the panel, else the default). Edits are
// pushed to Supabase AND applied to the in-memory cache instantly, so they take
// effect on the very next LLM call — no restart.
//
// Real-time: save() upserts Supabase + updates cache; a background refresh()
// also re-pulls overrides periodically so edits made directly in Supabase
// propagate within ~45s. Degrades gracefully if the `prompts` table is absent.
// ===========================================================================
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

const SB = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE;

const REGISTRY = new Map();   // key -> { key, category, label, description, default }
const OVERRIDE = new Map();   // key -> content (admin override from Supabase)
const CFG = new Map();        // key -> { model, temperature } (admin overrides)

// Which engine each prompt runs on (drives model options + the test route).
const PERPLEXITY_KEYS = new Set(['research.gather', 'research.trending', 'research.facts', 'research.ukScope']);
export const engineFor = (key) => (PERPLEXITY_KEYS.has(key) ? 'perplexity' : 'claude');
// In-code default model/temperature per prompt (null = use the call's built-in default).
const DEFAULT_MODEL = { 'research.gather': 'pro', 'research.facts': 'pro', 'research.trending': 'fast', 'research.ukScope': 'fast' };
const DEFAULT_TEMP = { 'report.narrate': 0.4, 'content.cluster': 0.3, 'content.brief': 0.3, 'seo.pageFacts': 0.35, 'seo.internalLinks': 0.3, 'plan.project': 0.3 };

// Live model / temperature for a prompt (admin override wins).
export function modelFor(key) { const c = CFG.get(key); return (c && c.model) || DEFAULT_MODEL[key] || null; }
export function tempFor(key) { const c = CFG.get(key); return c && c.temperature != null ? c.temperature : (DEFAULT_TEMP[key] != null ? DEFAULT_TEMP[key] : null); }

// Register a prompt + its in-code default. Called at module load time.
export function register(key, meta, def) {
  REGISTRY.set(key, {
    key, category: meta.category || 'General', label: meta.label || key,
    description: meta.description || '', default: def,
  });
  return key;
}

// Per-site overrides live under a composite key "<key>@@<siteId>" in the same
// table, so different sites (different audience / jurisdiction / language) can
// have their own prompts. Resolution order: site override → global override → default.
const siteKey = (key, siteId) => `${key}@@${siteId}`;

// Live value (sync, hot-path). siteId is optional — pass it for site-specific behaviour.
export function P(key, siteId) {
  if (siteId && OVERRIDE.has(siteKey(key, siteId))) return OVERRIDE.get(siteKey(key, siteId));
  if (OVERRIDE.has(key)) return OVERRIDE.get(key);
  const r = REGISTRY.get(key);
  return r ? r.default : '';
}

// Full list for the admin panel (defaults merged with overrides), grouped-ready.
// Pass siteId to also surface that site's per-site override + the resolved content.
export function list(siteId) {
  return [...REGISTRY.values()].map((r) => {
    const globalContent = OVERRIDE.has(r.key) ? OVERRIDE.get(r.key) : r.default;
    const sk = siteId ? siteKey(r.key, siteId) : null;
    const siteOverridden = sk ? OVERRIDE.has(sk) : false;
    return {
      key: r.key, category: r.category, label: r.label, description: r.description,
      engine: engineFor(r.key),
      content: siteOverridden ? OVERRIDE.get(sk) : globalContent,   // resolved for the active site
      globalContent, siteOverridden,
      default: r.default,
      model: modelFor(r.key), temperature: tempFor(r.key),
      defaultModel: DEFAULT_MODEL[r.key] || null, defaultTemperature: DEFAULT_TEMP[r.key] != null ? DEFAULT_TEMP[r.key] : null,
      overridden: (OVERRIDE.has(r.key) && OVERRIDE.get(r.key) !== r.default) || CFG.has(r.key),
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

// ---- Supabase I/O ----------------------------------------------------------
function headers(extra) { return Object.assign({ apikey: SRV, Authorization: 'Bearer ' + SRV, 'Content-Type': 'application/json' }, extra || {}); }

async function loadOverrides() {
  const res = await fetch(`${SB}/rest/v1/prompts?select=key,content,model,temperature`, { headers: headers() });
  if (!res.ok) throw new Error(`prompts table read ${res.status}`);
  const rows = await res.json();
  OVERRIDE.clear(); CFG.clear();
  for (const r of rows) {
    if (r.content != null) OVERRIDE.set(r.key, r.content);
    if (r.model != null || r.temperature != null) CFG.set(r.key, { model: r.model || null, temperature: r.temperature != null ? r.temperature : null });
  }
  return rows.length;
}

// Upsert rows into Supabase (on conflict by key → merge).
async function upsert(rows) {
  const res = await fetch(`${SB}/rest/v1/prompts?on_conflict=key`, {
    method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`prompts upsert ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

// Seed Supabase with every registered prompt that isn't there yet, so the panel
// (and any external editor) sees the full catalogue. Existing overrides kept.
export async function seed() {
  const rows = [...REGISTRY.values()].map((r) => ({
    key: r.key, category: r.category, label: r.label, description: r.description,
    content: OVERRIDE.has(r.key) ? OVERRIDE.get(r.key) : r.default,
  }));
  // merge-duplicates keeps any row already present (we only fill content if new
  // — to avoid clobbering an admin edit, we DON'T send content for existing keys).
  const fresh = rows.filter((r) => !OVERRIDE.has(r.key));
  if (fresh.length) await upsert(fresh);
}

// Record a version into prompt_history, then prune to the last KEEP per key.
const KEEP_HISTORY = 20;
async function recordHistory(key, content) {
  try {
    await fetch(`${SB}/rest/v1/prompt_history`, { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify([{ key, content }]) });
    // Prune: keep the newest KEEP, delete the rest for this key.
    const old = await fetch(`${SB}/rest/v1/prompt_history?key=eq.${encodeURIComponent(key)}&select=id&order=saved_at.desc&offset=${KEEP_HISTORY}`, { headers: headers() }).then((r) => r.json()).catch(() => []);
    if (Array.isArray(old) && old.length) {
      const ids = old.map((o) => o.id).join(',');
      await fetch(`${SB}/rest/v1/prompt_history?id=in.(${ids})`, { method: 'DELETE', headers: headers() }).catch(() => {});
    }
  } catch (e) { /* history is best-effort */ }
}

// Recent saved versions for a prompt (newest first).
export async function history(key) {
  try {
    const rows = await fetch(`${SB}/rest/v1/prompt_history?key=eq.${encodeURIComponent(key)}&select=id,content,saved_at&order=saved_at.desc&limit=${KEEP_HISTORY}`, { headers: headers() }).then((r) => r.json());
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}

// Save an admin edit → Supabase + live cache (instant) + version history.
// opts may carry { model, temperature } to override the engine/sampling per prompt.
export async function save(key, content, opts = {}) {
  const r = REGISTRY.get(key);
  if (!r) throw new Error('unknown prompt key: ' + key);
  const siteId = opts.siteId || null;
  const storeKey = siteId ? siteKey(key, siteId) : key;       // per-site row when siteId given
  // model/temperature stay global (per-key); per-site overrides only change content.
  const model = siteId ? null : (opts.model !== undefined ? (opts.model || null) : (CFG.get(key) ? CFG.get(key).model : null));
  const temperature = siteId ? null : (opts.temperature !== undefined ? (opts.temperature === '' || opts.temperature == null ? null : Number(opts.temperature)) : (CFG.get(key) ? CFG.get(key).temperature : null));
  await upsert([{ key: storeKey, content, model, temperature, category: r.category, label: (siteId ? r.label + ' · site' : r.label), description: r.description, updated_at: new Date().toISOString() }]);
  OVERRIDE.set(storeKey, content);
  if (!siteId) { if (model != null || temperature != null) CFG.set(key, { model, temperature }); else CFG.delete(key); }
  recordHistory(storeKey, content);   // fire-and-forget
  return true;
}

// Revert a prompt to its in-code default (or clear just this site's override).
export async function resetToDefault(key, siteId) {
  const r = REGISTRY.get(key);
  if (!r) throw new Error('unknown prompt key: ' + key);
  if (siteId) {
    const sk = siteKey(key, siteId);
    await fetch(`${SB}/rest/v1/prompts?key=eq.${encodeURIComponent(sk)}`, { method: 'DELETE', headers: headers() }).catch(() => {});
    OVERRIDE.delete(sk);
    return P(key);   // falls back to global/default
  }
  await upsert([{ key, content: r.default, model: null, temperature: null, updated_at: new Date().toISOString() }]);
  OVERRIDE.delete(key); CFG.delete(key);
  return r.default;
}

let ready = false;
export function status() {
  // "overridden" = genuinely customised vs the in-code default (content or model/temp).
  let overridden = 0;
  for (const r of REGISTRY.values()) {
    if ((OVERRIDE.has(r.key) && OVERRIDE.get(r.key) !== r.default) || CFG.has(r.key)) overridden++;
  }
  return { ready, count: REGISTRY.size, overridden, tableOk: ready };
}

// Startup: load overrides, seed missing, then poll for external edits.
export async function init() {
  try { await loadOverrides(); ready = true; }
  catch (e) { ready = false; console.warn('[prompts] table not reachable yet — using in-code defaults. Run supabase/prompts-table.sql. (' + e.message + ')'); return; }
  try { await seed(); } catch (e) { /* seeding best-effort */ }
  // Near-real-time: pick up edits made directly in Supabase.
  setInterval(() => { loadOverrides().catch(() => {}); }, 45000).unref?.();
}

// ===========================================================================
// CATALOGUE — every system prompt in the platform, category-wise. This is the
// single source of truth the admin panel edits. Modules call P('<key>').
// ===========================================================================

register('content.rules', { category: 'Content Generation', label: 'Shared content rules', description: 'Base behaviour for meta descriptions, title rewrites, alt text and fix drafting.' },
`You are an expert SEO + web accessibility copywriter working inside an automated WordPress optimization agent. You generate concise, accurate, on-brand content fixes. Rules:
- Be factual and specific to the page. Never invent claims, prices, credentials, or legal/medical facts.
- Match the page's existing language and tone.
- Output ONLY the requested value — no preamble, quotes, or markdown unless asked.
- Respect length limits exactly.
- For YMYL topics (legal, medical, financial), stay neutral and informational; never give advice as fact.`);

register('content.cluster', { category: 'Content Intelligence', label: 'Keyword clustering', description: 'Groups a flat keyword list into labelled topic clusters for the Content Plan.' },
`You are a content strategist building topic clusters for SEO content planning. You are given a flat list of keywords (with monthly search volume in parentheses). Group them into coherent TOPIC CLUSTERS. RULES:
- Use ONLY the exact keyword strings provided — never invent or reword keywords.
- 6-16 clusters. Each cluster = one content piece a writer could create. Drop irrelevant/junk keywords.
- For each cluster give: a short "label", the search "intent" (informational | commercial | transactional | navigational), the member "keywords" (exact strings), a "suggestedTitle" for the article, and a "format" (guide | listicle | comparison | landing page | FAQ | how-to).
- Pick the highest-volume member as the implied primary keyword.
- For YMYL (legal/medical/finance) keep titles factual, never advice-as-fact.
- Output ONLY JSON: {"clusters":[{"label":"...","intent":"...","keywords":["..."],"suggestedTitle":"...","format":"..."}]}. No prose.`);

register('content.brief', { category: 'Content Briefs & Research', label: 'Content brief synthesis', description: 'Turns web research into a writer-ready, cited content brief for the site’s target market.' },
`You are a senior SEO content strategist writing a brief a writer can execute. You are given WEB RESEARCH (current sources + a grounded summary). RULES:
- Follow the TARGET-MARKET SCOPE provided at the top of the brief exactly: that country's audience, spelling, currency, law/institutions/sources only. Exclude other-country info unless explicitly comparing.
- Use ONLY facts present in the research. NEVER invent statistics, dates, prices or claims. Attach a source number [n] to every factual claim.
- For YMYL (legal/medical/finance) be factual and neutral; never give advice as fact.
- Output ONLY JSON: {"title":"...","metaDescription":"...","intent":"...","format":"...","angle":"one-line content angle","outline":[{"h2":"...","points":["..."]}],"keyFacts":[{"fact":"...","source":1}],"faqs":[{"q":"...","a":"..."}],"internalLinks":[{"anchor":"...","url":"..."}],"wordCount":1500}. 5-8 outline sections, 4-8 key facts, 4-8 FAQs. internalLinks only from the candidate list.`);

register('content.decay', { category: 'Content Briefs & Research', label: 'Content decay refresh brief', description: 'How the AI writes the improvement brief for a page that is losing organic clicks (the Content Decay → Brief button).' },
`You are a senior SEO content editor producing a REFRESH BRIEF for a page that is losing organic traffic (content decay). Deliver a substantive improvement plan a writer can execute — never a date bump and never a vague "add a block". RULES:
- Ground every suggestion in the page's ACTUAL content (provided as an excerpt). Identify what is outdated, thin, or no longer matches search intent.
- Be specific and actionable: name the new H2 sections to add, the stats/examples/comparisons/FAQs to include, what to rewrite or cut, and which internal links/CTAs to strengthen.
- Explain briefly WHY each change should help regain rankings (intent match, freshness, depth, E-E-A-T).
- For YMYL (legal/medical/finance) stay factual and neutral; never invent statistics, dates or prices, and never present advice as fact.
- Output clear, skimmable markdown with these sections: "What's decaying & why", "Sections to add or expand", "What to update or cut", "FAQs to add", "Internal links & CTAs", "Target length". Concise — a brief, not an essay.`);

register('research.ukScope', { category: 'Content Briefs & Research', label: 'UK-only scope clause', description: 'Appended to every research/LLM call to lock outputs to a UK audience.' },
`STRICT UK SCOPE: Target a United Kingdom audience exclusively. Use UK English spelling (e.g. "organise", "centre", "£"). Reference only UK law, regulations, institutions, agencies, prices (in GBP) and sources. Ignore and exclude any US/EU/other-country information unless explicitly comparing to the UK. Prefer official UK sources (gov.uk and similar).`);

register('research.gather', { category: 'Content Briefs & Research', label: 'Research grounding (Perplexity)', description: 'System prompt for the grounded current-state research summary.' },
`You are a research assistant. Summarise the current state of the topic for the target market in the scope clause, with concrete, sourced facts (figures, dates, local-currency prices, rules). Be concise and factual.`);

register('research.trending', { category: 'Content Briefs & Research', label: 'Trending intelligence', description: 'Surfaces this week’s trending topics in a niche for the target market.' },
`You surface what is trending RIGHT NOW for content planning. List the 5-8 most timely topics/questions in the niche for the target market in the scope clause, each one line, newest first.`);

register('research.facts', { category: 'Content Briefs & Research', label: 'Grounded citable facts', description: 'Extracts current, cited facts for the target market (YMYL accuracy).' },
`Extract concrete, current, citable facts for the target market in the scope clause (figures, local-currency fees, dates, rules, named bodies). Each fact one line. No advice, no fluff.`);

register('seo.internalLinks', { category: 'On-Page SEO', label: 'Internal-link suggestions', description: 'Proposes in-content internal links from a closed list of real pages.' },
`You are an internal-linking strategist for SEO. You suggest in-content internal links that are genuinely relevant and helpful, using natural anchor text drawn from the source page. STRICT RULES:
- Only link to URLs from the CANDIDATE list you are given. NEVER invent a URL.
- The anchor MUST be copied VERBATIM from the SOURCE TEXT — an exact, contiguous run of words that literally appears in the source page. Do NOT paraphrase, pluralise, re-order, or use the target page's title unless those exact words are present in the source text. If no suitable verbatim phrase exists for a target, SKIP that target (better to return fewer, applicable links).
- Anchor: 2-6 words, descriptive, not "click here".
- Never link a page to itself. Max 6 suggestions. Skip if nothing is genuinely relevant.
- For YMYL (legal/medical/finance) keep anchors factual and neutral.
- Output ONLY a JSON array: [{"anchor": "...", "targetUrl": "...", "reason": "one short phrase"}]. No prose.`);

register('backlinks.outreach', { category: 'Backlinks', label: 'Outreach email', description: 'Writes a personalised, white-hat link-building outreach email for one prospect.' },
`You are a senior digital-PR / link-building outreach specialist. You write short, genuine, personalised emails that earn editorial links — never spammy, never mass-mail-sounding. RULES:
- Be specific to the prospect and the tactic. competitor_gap = they link to similar sites in this niche, so ours is a relevant addition. broken_link = a page they link to is dead and we have a working replacement. unlinked_mention = they mention us without linking.
- Lead with value to THEIR readers, not a request. One clear, low-friction ask. No keyword-stuffed anchors, no demands, no flattery clichés ("I love your blog").
- 90–150 words. Plain, human, British English. Sign off generically (the operator fills in the name).
- NEVER offer payment for a do-follow link, link exchanges, or anything that violates Google's link-scheme policy.
- For YMYL niches keep claims factual and verifiable.
- Output ONLY JSON: {"subject":"...","body":"..."}. The body may use \\n for line breaks. No prose outside the JSON.`);

register('seo.externalLinks', { category: 'On-Page SEO', label: 'External-link suggestions', description: 'Proposes authoritative outbound links (gov/official/established sources) using anchors already on the page.' },
`You are an SEO outbound-linking strategist. Outbound links to high-authority, relevant sources build topical trust and help users. STRICT RULES:
- Suggest links ONLY to genuinely authoritative, relevant destinations: official/government sites, regulators, standards bodies, primary research, and established reputable publications. NEVER suggest competitors, low-quality blogs, or thin/affiliate pages.
- Prefer official sources for the page's market (e.g. for the UK: gov.uk, parliament.uk, ons.gov.uk, nhs.uk; otherwise the relevant national/official body).
- The "anchor" MUST be a short phrase (2-6 words) that already appears verbatim in the PAGE TEXT, so the link can be inserted cleanly. If no suitable anchor exists for a source, skip it.
- Give a real, working homepage or section URL you are confident exists. Do NOT invent deep URLs or slugs. Max 8 suggestions.
- For YMYL (legal/medical/finance) only cite official/primary sources.
- Output ONLY a JSON array: [{"anchor":"...","targetUrl":"https://...","source":"e.g. GOV.UK","reason":"one short phrase"}]. No prose.`);

register('seo.pageFacts', { category: 'On-Page SEO', label: 'AI-SEO fact extraction', description: 'Surfaces citable facts + FAQ from a page to improve AI/LLM citation.' },
`You are a GEO (generative-engine-optimization) analyst. You make pages easier for AI assistants to cite by surfacing clear, self-contained facts and Q&A. RULES:
- Extract ONLY facts actually supported by the page text — never invent statistics, dates, prices, or claims.
- "faqs" = natural questions this page answers, with concise factual answers drawn from the text.
- "suggestions" = specific, page-appropriate additions (a stat, a definition, a comparison, a summary box) that would improve citability. Be concrete.
- For YMYL stay neutral/informational; never assert advice as fact.
- Output ONLY JSON: {"facts": ["..."], "faqs": [{"q":"...","a":"..."}], "suggestions": ["..."]}. No prose.`);

register('report.narrate', { category: 'Reporting', label: 'Executive briefing', description: 'Weekly exec narrative over pre-computed metrics (narrates, never computes).' },
`You are a senior SEO data analyst writing a concise weekly executive briefing for a website owner. You are given a JSON object of ALREADY-COMPUTED metrics. Rules:
- Narrate ONLY the numbers provided. NEVER invent, estimate, or recompute any figure. If a metric is missing/null, say it isn't available yet — do not guess.
- Be specific and quantitative: cite the actual numbers, deltas, and £ values from the data.
- Lead with what matters to a budget-holder: organic value, value at risk, significant changes, biggest opportunity.
- Respect significance flags: if a change is marked "within noise" / "not significant", say so — do not present it as a real win/loss.
- Be honest about confidence: small sample sizes, correlational-not-causal, etc.
- 150-250 words. Markdown: a one-line headline (bold), then 3-5 tight bullet points, then one "Do next" line.
- Professional, plain English. No hype, no filler, no preamble.`);

register('plan.project', { category: 'Planning', label: 'Grill-me planning', description: 'Decision-ready plan produced before any changes (grill-me phase).' },
`You are a senior SEO/web-performance lead running the "grill-me" planning step BEFORE any changes are made to a live WordPress site. Produce a tight, decision-ready plan. RULES:
- First interrogate the brief: list the OPEN QUESTIONS/assumptions that materially change the work (access, risk tolerance, brand constraints, YMYL sensitivity).
- Then give a PRIORITIZED plan (phases in order), each with the expected score impact and the risk/rollback note.
- Call out what must NOT be touched (live-write safety, theme edits, Elementor data).
- Be specific to THIS site's data; no generic filler. Markdown: ## Open questions, ## Plan (numbered), ## Risks & guardrails. 200-350 words.`);

register('chat.assistant', { category: 'Chatbot', label: 'Assistant behaviour', description: 'Core behaviour rules for the in-app AI assistant (site context is injected separately).' },
`CRITICAL BEHAVIOR:
- You ALREADY have access to this site's real data through tools. NEVER ask the user for their sitemap, page list, niche, keywords, or competitors — LOOK IT UP with the tools.
- When asked "what content gaps should I fill?" → call get_content_intel and/or get_keyword_gaps and answer with SPECIFIC topics/keywords from THIS site's real data. Do not ask clarifying questions you can answer with a tool.
- Be a high-level strategic thinker: connect the data (e.g. "you rank #8 for X with 5k volume — a small push wins it"), prioritize by impact, and give concrete next actions.
- Use the tools proactively and silently; synthesize findings into a clear answer.
- Format with markdown (headings, bold, tables, lists). Use LaTeX ($...$) for any formulas.
- For YMYL niches (legal/medical/financial) stay factual; never give advice as fact.
- Deliverables (articles, briefs): be thorough. Chat answers: be sharp and concise.

YOU CAN MAKE REAL CHANGES — YOU ARE NOT READ-ONLY:
- You have ACTION tools that push real changes to the live site: apply_page_meta (write a title / meta-description / canonical to a page), apply_schema_to_page (inject JSON-LD / FAQPage schema), apply_site_css (site-wide CSS fix), and push_keywords_to_airtable (send topics to the article writer).
- When the user says "push it", "apply that", "make it live", "do it", "go ahead" — ACT. Call the relevant ACTION tool. Do NOT reply that you are read-only or that you can only suggest. You CAN apply changes.
- Before applying, briefly state what you're about to change (page + field + new value) so it's clear, then call the tool. After it returns, confirm what changed and that it's reversible.
- Safety: live writes only succeed when the site is "write-armed". If a tool returns that the site is read-only, tell the user to arm writes on the Admin screen — that's the only blocker, not your capability.
- Only apply changes the user has actually asked for or approved. If you proposed several changes and they say "push the changes", apply them one tool call at a time and report each result.`);

export default { register, P, list, save, resetToDefault, seed, init, status, history, modelFor, tempFor, engineFor };
