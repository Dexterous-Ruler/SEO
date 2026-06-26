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

// ---- Supabase (PostgREST, graceful) ---------------------------------------
// GEO citation snapshots are a time-series of each tracking pass. They live in
// Supabase (citation_snapshots) via PostgREST — there is NO direct Postgres
// connection, so the table is created by a manual migration
// (supabase/citation-snapshots.sql). Every DB call degrades gracefully: if the
// table is absent (404 / PGRST205 / any non-2xx) we return { notProvisioned }
// and never throw. Mirrors the backend-api/drift.js pattern exactly.
const SB = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE;
function sbHeaders(extra) {
  return Object.assign({ apikey: SRV, Authorization: 'Bearer ' + SRV, 'Content-Type': 'application/json' }, extra || {});
}
const CITATION_NOT_PROVISIONED = { error: 'citation_snapshots table not provisioned — run supabase/citation-snapshots.sql', notProvisioned: true };
function isMissingTable(status, body) {
  if (status === 404) return true;
  const b = (typeof body === 'string' ? body : JSON.stringify(body || '')) || '';
  return /PGRST205|PGRST202|could not find the table|relation .*citation_snapshots.* does not exist/i.test(b);
}

// Ask Claude one buyer-intent question WITH web search enabled, then inspect
// whether the answer cites the target domain. Returns structured result.
// Bounded by a per-call timeout so a single slow/hung web search can't stall the
// whole tracking pass (which must complete inside the gateway request timeout).
async function askWithSearch(promptText, timeoutMs = 26000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API, {
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
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('web search timed out');
    throw e;
  } finally {
    clearTimeout(t);
  }
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

// Bounded-concurrency map: run `fn` over `items`, at most `limit` at a time.
// Preserves input order in the returned array. Used so the citation pass runs
// the (slow, web-searching) prompts in parallel waves instead of serially.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
  return out;
}

// Run a full citation-tracking pass for a site across a prompt set.
// targetDomain: the site we're measuring. competitors: optional [domain,...].
// Each prompt is a Claude web-search call (~10-25s); we run them in parallel
// waves with a hard cap so the whole pass completes inside the gateway request
// timeout (a serial loop over ~18 prompts blew past it → 504 "gateway time-out").
const GEO_MAX_PROMPTS = 16;   // bound total work — keeps the pass under the gateway timeout
const GEO_CONCURRENCY = 8;    // parallel web-search calls (gentle on Anthropic rate limits)
export async function runCitationTracking({ siteId, targetDomain, prompts, competitors = [], onResult }) {
  const target = domainOf(targetDomain);
  const compDomains = competitors.map(domainOf);

  const list = (prompts || []).slice(0, GEO_MAX_PROMPTS);
  if ((prompts || []).length > GEO_MAX_PROMPTS) {
    console.log(`[geo] capping citation pass to ${GEO_MAX_PROMPTS} of ${prompts.length} prompts (gateway-timeout budget)`);
  }

  const results = await mapLimit(list, GEO_CONCURRENCY, async (p, i) => {
    const promptText = typeof p === 'string' ? p : p.prompt;
    try {
      const { answer, citedUrls } = await askWithSearch(promptText);
      const citedDomains = [...new Set(citedUrls.map(domainOf))];
      const targetCited = citedDomains.includes(target);
      // brand mention in prose even if not formally cited
      const brandMentioned = new RegExp(target.split('.')[0].replace(/[^a-z0-9]/gi, ''), 'i').test(answer.replace(/[^a-z0-9]/gi, ''));
      const row = {
        prompt: promptText,
        intent: typeof p === 'object' ? p.intent : 'informational',
        targetCited,
        brandMentioned,
        citedDomains,
        snippet: answer.slice(0, 280),
      };
      if (onResult) onResult(row, i, list.length);
      return row;
    } catch (e) {
      const row = { prompt: promptText, error: e.message };
      if (onResult) onResult(row, i, list.length);
      return row;
    }
  });

  // Aggregate after the parallel pass (order preserved by mapLimit).
  let cited = 0;
  const compCites = {};
  for (const row of results) {
    if (!row || row.error) continue;
    if (row.targetCited) cited++;
    for (const cd of row.citedDomains || []) {
      if (compDomains.includes(cd)) compCites[cd] = (compCites[cd] || 0) + 1;
    }
  }

  const total = list.length;
  const shareOfVoice = total ? Math.round((cited / total) * 100) : 0;
  const competitorScores = compDomains.map((d) => ({ domain: d, cited: compCites[d] || 0, share: total ? Math.round(((compCites[d] || 0) / total) * 100) : 0 }));
  const result = { targetDomain: target, shareOfVoice, promptsTotal: total, promptsCited: cited, competitors: competitorScores, results };

  // Best-effort time-series snapshot. A snapshot failure (missing table, network)
  // must NEVER break the live tracking result the caller is awaiting.
  if (siteId) {
    try { await saveCitationSnapshot(siteId, result); } catch (e) { /* best-effort persist */ }
  }

  return result;
}

// Generate a default buyer-intent prompt set for a site/niche using Claude.
export async function suggestPrompts({ siteName, niche, sampleTitles = [], exclude = [], context = '' }) {
  // Anchor STRICTLY on the real page titles so the prompts match what the site
  // actually is — not what its brand name sounds like (e.g. "GoodFor" must not be
  // assumed to be an employee-recognition tool when it's a food/skincare scanner).
  const topicBlock = (sampleTitles && sampleTitles.length)
    ? `These are real page titles from the site. Infer what this product/service ACTUALLY does from them, and base every question on that:\n${sampleTitles.slice(0, 30).join('\n')}`
    : `(No page titles were available — infer cautiously from the site name/niche and keep questions generic to that.)`;
  const excludeBlock = (exclude && exclude.length)
    ? `\n\nAlready asked in PRIOR scans — generate DIFFERENT questions, do NOT repeat these or close paraphrases:\n${exclude.slice(0, 40).map((p) => '- ' + p).join('\n')}`
    : '';
  // Operator-provided per-site context — authoritative steer on what the site is about,
  // who it serves, and what to focus on. Weighted heavily over brand-name inference.
  const contextBlock = (context && String(context).trim())
    ? `\n\nOPERATOR CONTEXT (authoritative — what this site is about, who it serves, what to focus on). Weight this HEAVILY when choosing topics + intent:\n${String(context).trim().slice(0, 1200)}`
    : '';
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are generating buyer-intent questions to measure how often AI assistants cite a specific website.\n\nSite: "${siteName}"${niche ? ` — stated niche: ${niche}` : ''}\n${topicBlock}${contextBlock}\n\nGenerate 18 realistic buyer-intent questions a potential CUSTOMER of THIS site would ask ChatGPT or Perplexity. Mix informational, commercial, and comparison intent.\n\nCRITICAL RULES:\n- Base every question ONLY on what this specific site/product actually does (per the page titles above). Do NOT infer the product category from the brand name alone, and never invent an unrelated industry.\n- Write them the way a real person would search — natural questions, NOT stuffed with the brand/domain name (most should not mention the brand at all).${excludeBlock}\n\nReturn ONLY a JSON array of objects: [{"prompt":"...","intent":"informational|commercial|comparison"}]. No markdown.`,
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
  // No "managed by Sentinel" header here — the mu-plugin's robots_txt filter adds
  // that header itself when it merges this block, so including it here double-prints.
  const lines = [];
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push(allow ? 'Allow: /' : 'Disallow: /');
    lines.push('');
  }
  if (sitemapUrl) lines.push(`Sitemap: ${sitemapUrl}`);
  return lines.join('\n');
}

export function buildLlmsTxt({ siteName, baseUrl, summary, pages = [] }) {
  const name = siteName || baseUrl;
  const lines = [`# ${name}`, ''];
  if (summary) { lines.push(`> ${summary}`, ''); }
  if (baseUrl) { lines.push(`Website: ${baseUrl}`, ''); }
  const keyPages = (pages || []).filter((p) => p && (p.title || p.path || p.url));
  if (keyPages.length) {
    lines.push('## Key pages', '');
    for (const p of keyPages) {
      const href = p.url || (baseUrl ? baseUrl + (p.path || '') : (p.path || ''));
      lines.push(`- [${p.title || p.path || href}](${href})${p.note ? ' — ' + p.note : ''}`);
    }
    lines.push('');
  }
  lines.push('## About', '');
  if (summary) lines.push(summary, '');
  lines.push(`This file (llms.txt) helps AI assistants understand and accurately cite ${name}.`);
  return lines.join('\n');
}

// Write llms.txt CONTENT grounded ONLY on the site's real titles: a concise,
// factual summary of what the site does + a short note per key page. Best-effort —
// returns { summary: tagline||'', notes: {} } on any failure so publishing never blocks.
export async function summarizeForLlms({ siteName, tagline, pages = [] }) {
  const titles = (pages || []).map((p) => p.title).filter(Boolean).slice(0, 30);
  if (!titles.length) return { summary: tagline || '', notes: {} };
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 900,
        messages: [{
          role: 'user',
          content: `Write content for an llms.txt file (a file that helps AI assistants understand and cite a website).\nSite name: "${siteName}"${tagline ? `\nTagline: "${tagline}"` : ''}\nReal page titles from the site:\n${titles.map((t) => '- ' + t).join('\n')}\n\nBased STRICTLY on the above (do not invent facts or features), return ONLY JSON:\n{"summary":"1-2 plain factual sentences: what this site/product actually does and who it's for — no marketing fluff","pages":[{"title":"<exact title from the list>","note":"<a concise description of that page, max 10 words>"}]}\nInclude one entry for each page title listed. No markdown, JSON only.`,
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return { summary: tagline || '', notes: {} };
    let txt = (data.content || []).map((b) => b.text || '').join('').trim();
    const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) txt = fence[1];
    const s = txt.indexOf('{'); const e = txt.lastIndexOf('}');
    if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
    const parsed = JSON.parse(txt);
    const notes = {};
    for (const p of (parsed.pages || [])) if (p && p.title) notes[String(p.title).trim()] = p.note || '';
    return { summary: parsed.summary || tagline || '', notes };
  } catch (e) { return { summary: tagline || '', notes: {} }; }
}

// ---- GEO citation time-series (PostgREST, graceful) ------------------------
// Persist one snapshot per tracking pass so we can chart AI share-of-voice over
// time. Extracts an overall SoV (0-100), a per-platform breakdown, and whether
// the site was cited at all, from a runCitationTracking() result.
export async function saveCitationSnapshot(siteId, result) {
  if (!SB || !SRV) return { ...CITATION_NOT_PROVISIONED, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE missing).' };
  const r = result || {};

  // Overall share-of-voice (0-100). runCitationTracking returns shareOfVoice.
  const sov = Number.isFinite(Number(r.shareOfVoice)) ? Number(r.shareOfVoice) : 0;

  // Was the target cited in ANY prompt this pass?
  const cited = (Number(r.promptsCited) || 0) > 0;

  // Per-platform breakdown. The current pass runs through Claude+web-search, so
  // we attribute this run's SoV to the engine that produced it (defaults to
  // 'claude'); the column is jsonb so future multi-engine passes can populate
  // ChatGPT/Gemini/Perplexity without a schema change.
  const engine = r.engine || 'claude';
  const perPlatform = (r.perPlatform && typeof r.perPlatform === 'object')
    ? r.perPlatform
    : { [engine]: { sov, cited, promptsCited: Number(r.promptsCited) || 0, promptsTotal: Number(r.promptsTotal) || 0 } };

  const row = {
    site_id: siteId || null,
    captured_at: new Date().toISOString(),
    sov,
    cited,
    per_platform: perPlatform,
    result: r,
  };
  try {
    const res = await fetch(`${SB}/rest/v1/citation_snapshots`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify([row]),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return CITATION_NOT_PROVISIONED;
      return { error: `citation_snapshots insert → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { saved: true, snapshot: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// Read back the last `limit` snapshots for a site (newest first internally),
// returned oldest→newest as points for charting, plus the latest/previous pair
// and the SoV delta + direction. Degrades gracefully when the table is absent.
export async function citationTrend(siteId, { limit = 30 } = {}) {
  if (!SB || !SRV) return { ...CITATION_NOT_PROVISIONED, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE missing).' };
  const sidFilter = siteId ? `site_id=eq.${encodeURIComponent(siteId)}` : 'site_id=is.null';
  const lim = Math.max(1, Math.min(Number(limit) || 30, 365));
  try {
    const res = await fetch(`${SB}/rest/v1/citation_snapshots?${sidFilter}&select=captured_at,sov,cited,per_platform&order=captured_at.desc&limit=${lim}`, { headers: sbHeaders() });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingTable(res.status, text)) return CITATION_NOT_PROVISIONED;
      return { error: `citation_snapshots read → ${res.status} ${text.slice(0, 200)}` };
    }
    let data; try { data = text ? JSON.parse(text) : []; } catch { data = []; }
    const rows = Array.isArray(data) ? data : [];
    // Oldest → newest for a left-to-right chart.
    const points = rows.slice().reverse().map((x) => ({
      at: x.captured_at,
      sov: Number(x.sov) || 0,
      cited: !!x.cited,
      per_platform: x.per_platform || null,
    }));
    const latest = points.length ? points[points.length - 1] : null;
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const deltaSov = latest && previous ? (latest.sov - previous.sov) : 0;
    const THRESH = 1; // SoV is an integer percentage — sub-1pt moves read as flat.
    const direction = deltaSov > THRESH ? 'improving' : (deltaSov < -THRESH ? 'declining' : 'flat');
    return { points, latest, previous, deltaSov, direction, count: points.length };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export default { runCitationTracking, suggestPrompts, buildAiRobots, buildLlmsTxt, saveCitationSnapshot, citationTrend };
