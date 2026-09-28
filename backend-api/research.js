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
import { marketFor } from './market.js';
import { P, modelFor, tempFor, geoFor } from './prompts.js';
import { resolveJudgment, citationsIn } from './judgments.js';
// Prepend the site's niche/context to a Perplexity system prompt so grounded
// research stays on-niche (the same off-niche fix applied to trending).
const withNiche = (base, ctx) => (ctx ? `=== THIS SITE'S NICHE & CONTEXT (keep findings strictly relevant to this) ===\n${ctx}\n\n${base}` : base);
const mt = (key, fallbackModel) => ({ model: modelFor(key) || fallbackModel, temperature: tempFor(key) != null ? tempFor(key) : undefined });

// ---- source hygiene --------------------------------------------------------
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
// Rank a source's authority for the ACTIVE market. UK still gets its curated
// gov/authority list; other markets up-rank the market's own ccTLD + government
// (e.g. .in / gov.in for India, .gov for the US) so non-UK research isn't biased
// back toward UK sources. `market` optional → UK behaviour (back-compat).
function authorityScore(url, market) {
  const d = domainOf(url);
  const mk = market || null;
  if (!mk || mk.db === 'uk') {
    if (/\.gov\.uk$/.test(d) || d === 'gov.uk') return 100;
    if (UK.preferDomains.some((p) => d === p || d.endsWith('.' + p))) return 80;
    if (/\.uk$/.test(d)) return 60;                 // UK domain
    if (/\.(ac\.uk|nhs\.uk|org\.uk)$/.test(d)) return 70;
    return 30;
  }
  const cc = String(mk.geo || '').toLowerCase();    // ISO-3166 (GB, IN, US…)
  const tld = cc === 'gb' ? 'uk' : cc;              // ccTLD (GB→.uk)
  if (mk.preferDomains && mk.preferDomains.some((p) => d === p || d.endsWith('.' + p))) return 90;
  if (new RegExp(`(^|\\.)gov\\.${tld}$`).test(d) || new RegExp(`(^|\\.)gov$`).test(d)) return 100;  // gov.in, .gov (US)
  if (new RegExp(`\\.${tld}$`).test(d)) return 60;  // the market's ccTLD
  if (/\.(gov|edu)$/.test(d)) return 70;            // generic authority TLDs
  return 30;
}
// De-dup by domain, keep the highest-authority/first per domain, rank for `market`.
function rankSources(sources, market) {
  const byDomain = new Map();
  for (const s of sources) {
    if (!s || !s.url) continue;
    const d = domainOf(s.url);
    const cur = byDomain.get(d);
    if (!cur) byDomain.set(d, s);
  }
  return [...byDomain.values()]
    .map((s) => ({ ...s, domain: domainOf(s.url), authority: authorityScore(s.url, market) }))
    .sort((a, b) => b.authority - a.authority);
}

// ---- tiny in-memory cache (per-process, short TTL via injected timestamp) ---
const CACHE = new Map();
function cacheGet(k, now, ttlMs) { const e = CACHE.get(k); return (e && now - e.t < ttlMs) ? e.v : null; }
function cacheSet(k, v, now) { CACHE.set(k, { v, t: now }); if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value); }

// Core: gather UK web material on a topic from both engines. Returns
// { summary, material, sources[], cost }.
export async function gather(topic, { recency = 'month', excludeDomains, includeDomains, extraDomains, now = 0, ttlMs = 0, market, context } = {}) {
  const mk = market || marketFor('uk');
  const ctx = (context || '').toString().slice(0, 4500);   // site niche → keep research on-topic
  const extra = Array.isArray(extraDomains) ? extraDomains : [];
  const cacheKey = `g:${mk.db}:${ctx.slice(0, 40)}:${topic}:${recency}:${extra.join(',')}`;   // cache per market+niche+source-bias
  if (ttlMs && now) { const c = cacheGet(cacheKey, now, ttlMs); if (c) return c; }

  const out = { summary: '', material: '', sources: [], cost: 0, engines: {} };
  // 1) Tavily — gather source documents for the market (parallel-safe).
  let tav = null;
  if (tavily.hasKey()) {
    try { tav = await tavily.search(topic, { depth: 'advanced', maxResults: 8, excludeDomains, includeDomains, country: mk.country }); out.engines.tavily = (tav.results || []).length; }
    catch (e) { out.engines.tavilyError = String(e.message || e); }
  }
  // 2) Perplexity — grounded, cited current-state summary for the market.
  let pp = null;
  if (perplexity.hasKey()) {
    try {
      pp = await perplexity.ask({
        system: withNiche(P('research.gather'), ctx),
        user: `Topic: ${topic}\n\nGive the key current facts, recent changes, and the main questions ${mk.country} readers ask — for content planning.`,
        ...mt('research.gather', 'pro'), recency, domains: [...extra, ...(mk.preferDomains || [])].slice(0, 10), scope: mk.scope, geo: mk.geo,
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
  out.sources = rankSources([...(pp ? pp.sources : []), ...(tav ? tav.results : [])], mk);

  if (ttlMs && now) cacheSet(cacheKey, out, now);
  return out;
}

// ---- public products -------------------------------------------------------

// Authoritative UK legal sources — judgments, legislation, official guidance. Used to bias
// research (and to check verification sources) for case-law / legal briefs.
// England & Wales judgment + legislation sources (research bias + verifier filter; both cap at 10).
// gov.uk also covers caselaw.nationalarchives.gov.uk, legislation.gov.uk and the tribunal-decision
// finders. BAILII stays for DISCOVERY only — judgments.js reads BAILII links via the National Archives.
const LEGAL_DOMAINS = ['caselaw.nationalarchives.gov.uk', 'bailii.org', 'legislation.gov.uk', 'judiciary.uk', 'supremecourt.uk', 'casemine.com', 'jcpc.uk', 'gov.uk', 'parliament.uk'];
const isLegalSource = (url) => { const d = domainOf(url); return LEGAL_DOMAINS.some((x) => d === x || d.endsWith('.' + x) || d.endsWith(x)); };

// Research-backed content brief for a keyword/cluster. Tavily+Perplexity gather,
// Claude structures into a writer-ready UK brief with cited facts + internal links.
// `competitor` (optional) = { url, title, text } — the competitor's own article, so the
// brief is structured to out-do it (Competitors screen).
// `caseLaw` → Background/Issues/Decision/Impact structure + read the judgment (extract the
// full text of a judgment URL) + bias research to legal sources.
// `verify` → after the brief, run legal citation verification (verifyLegal) and attach it.
export async function contentBrief({ keyword, title = '', intent, siteName, niche, excludeDomain, internalLinkCandidates, siteId, db, now = 0, competitor, caseLaw = false, verify = false, judgmentUrl = '', judgmentText = '' }) {
  if (!perplexity.hasKey() && !tavily.hasKey()) return { error: 'No research engine configured — add PERPLEXITY_API_KEY and/or TAVILY_API_KEY.' };
  const market = marketFor(db);
  // A user-supplied judgment (URL or pasted text) is the reliable primary source Karim's
  // manual path used — force case-law structure + verification when one is given.
  const hasUserJudgment = !!(String(judgmentText || '').trim() || String(judgmentUrl || '').trim());
  if (hasUserJudgment) caseLaw = true;
  const gatherQuery = caseLaw ? `${keyword} judgment ruling court case` : keyword;
  const research = await gather(gatherQuery, {
    recency: caseLaw ? 'year' : 'month',
    excludeDomains: excludeDomain ? [excludeDomain] : undefined,
    extraDomains: caseLaw ? LEGAL_DOMAINS : undefined,
    now, ttlMs: 6 * 60 * 60 * 1000, market, context: geoFor(siteId),
  });
  if (!research.summary && !research.material) return { error: 'Research returned nothing for this keyword.', engines: research.engines };

  // Case law: read the FULL judgment so Background/Issues/Decision come from the PRIMARY source,
  // not commentary snippets. Pasted text wins; otherwise judgments.resolveJudgment FINDS it
  // (Karim: "can it not find the judgment itself?"): pasted link → judgment hyperlinked in the
  // competitor article → neutral citation → National Archives party-name search → research
  // sources → CaseMine (partial). BAILII blocks bots, so BAILII links are read via their
  // National Archives copy instead.
  let judgment = String(judgmentText || '').trim();
  let judgmentFull = !!judgment;
  let judgmentInfo = null;
  if (judgment) {
    research.judgmentUrl = String(judgmentUrl || '').trim() || null;
    judgmentInfo = { found: 'pasted text' };
  } else if (caseLaw) {
    try {
      const j = await resolveJudgment({
        title: title || keyword, keyword, competitor, userUrl: String(judgmentUrl || '').trim(),
        researchSources: research.sources, researchText: `${research.summary || ''}\n${research.material || ''}`,
      });
      if (j && j.text) {
        judgment = j.text; judgmentFull = !j.partial; research.judgmentUrl = j.url;
        judgmentInfo = { found: j.found, via: j.via, citation: j.citation, partial: !!j.partial };
      } else judgmentInfo = { found: null, tried: (j && j.tried || []).map((t) => t.via) };
    } catch (e) { /* best-effort; the brief still uses the gathered material */ }
  }

  // A full primary-source judgment gets the bigger budget (worked examples + the decision survive).
  const brief = await claude.synthesizeContentBrief({ keyword, intent, siteName, niche, research, internalLinkCandidates, siteId, market, competitor, caseLaw, judgmentText: judgment, judgmentBudget: judgmentFull ? 12000 : 7000 });
  const out = { keyword, intent, brief, country: market.country, sources: research.sources, engines: research.engines, researchCost: research.cost, caseLaw, judgmentRead: !!judgment, judgmentUrl: research.judgmentUrl || null, judgment: judgmentInfo };

  // Verify every cited case / statute / rule BEFORE the brief is allowed to push.
  if (verify && brief && !brief.error) {
    try { out.verification = await verifyLegal({ brief, market, judgment: judgment ? { text: judgment, url: research.judgmentUrl || '' } : null }); }
    catch (e) { out.verification = { status: 'unchecked', error: String((e && e.message) || e), checks: [] }; }
    if (out.verification) {
      brief.verification = out.verification;
      // Backfill the AUTHORITATIVE source the checker actually relied on onto each verified
      // citation (the synthesiser sometimes attaches the wrong URL), so the writer links to
      // the real BAILII / legislation.gov.uk page.
      if (Array.isArray(out.verification.checks) && Array.isArray(brief.citations)) {
        const chk = new Map(out.verification.checks.map((c) => [String(c.item || '').toLowerCase().trim(), c]));
        for (const c of brief.citations) {
          const label = [c.name, c.citation || c.section].filter(Boolean).join(' ').toLowerCase().trim();
          const m = chk.get(label);
          if (m && m.verdict === 'verified' && m.source && isLegalSource(m.source)) c.sourceUrl = m.source;
        }
      }
    }
  }
  return out;
}

// Verify the legal citations in a brief against authoritative sources (grounded Perplexity).
// Returns { status:'verified'|'issues'|'unchecked', checks:[{item,type,verdict,note,source}],
// summary, checkedAt }. status is 'verified' ONLY when every case/legislation check verifies.
// Is this citation GROUNDED in the judgment text we actually read? Deterministic and strict:
//  • a neutral citation ([2026] EWHC 2386 (Ch)) must appear in the text (leading zeros ignored);
//  • a case without one must appear as "<party> … v … <party>";
//  • a statute/rule must appear by name (or its usual abbreviation, e.g. "IA 1986", "CA 2006",
//    "CPR") AND, if a section/rule/schedule number is given, THAT number must appear as one —
//    so a wrong section number is never waved through.
// Brand-new judgments aren't indexed by web search yet, so the grounded web checker failed
// EVERY citation of a 6-day-old judgment (6/6 "unverified") — including the judgment itself.
const normCit = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\b0+(\d)/g, '$1').toLowerCase();
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function groundedInJudgment(item, jText, jNorm) {
  const it = String(item || '');
  const cits = citationsIn(it);
  if (cits.length) return cits.every((c) => jNorm.includes(normCit(c.raw)));
  const vm = it.match(/(.+?)\s+v\.?\s+(.+)/i);
  if (vm && !/\b(Act|Rules|Regulations|Order|Code|Directive)\b/.test(it)) {
    const key = (s) => (s.replace(/\(.*?\)/g, ' ').match(/[A-Za-z][A-Za-z'&-]{3,}/g) || []).filter((w) => !/^(Limited|Ltd|plc|LLP|Inc|The|and|Anor|Ors|Others|Commissioners|Company|Holdings|Group)$/i.test(w)).sort((a, b) => b.length - a.length)[0];
    const a = key(vm[1]), b = key(vm[2]);
    if (!a || !b) return false;
    return new RegExp(`${escRe(a)}[^\\n]{0,80}\\bv\\.?\\s[^\\n]{0,80}${escRe(b)}`, 'i').test(jText);
  }
  const act = (it.match(/((?:[A-Z][A-Za-z]*|\((?:[^)]+)\)|and|of|the|for)(?:\s+(?:[A-Z][A-Za-z]*|\([^)]+\)|and|of|the|for))*\s+(?:Act|Rules|Regulations|Order)\s+\d{4})/) || [])[1];
  const cpr = /\b(Civil Procedure Rules|CPR)\b/i.test(it);
  if (!act && !cpr) return false;
  let actHit = false;
  if (act) {
    const words = act.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
    const year = words[words.length - 1];
    const abbr = words.slice(0, -1).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('') + ' ' + year;   // Insolvency Act 1986 → IA 1986
    actHit = new RegExp(escRe(act).replace(/\\ /g, '\\s+'), 'i').test(jText) || new RegExp(`\\b${escRe(abbr)}\\b`).test(jText);
  } else actHit = /\b(Civil Procedure Rules|CPR)\b/.test(jText);
  if (!actHit) return false;
  const sec = it.match(/\b(?:section|sections|s\.|ss\.|s)\s*(\d+[A-Z]*)/i);
  const rule = it.match(/\b(?:rule|rules|r\.|rr\.|r)\s*(\d+(?:\.\d+)+|\d+)/i);
  const sch = it.match(/\bSchedule\s*(\d+)/i);
  const part = it.match(/\bPart\s*(\d+[A-Z]?)/i);
  if (sec && !new RegExp(`\\b(?:section|sections|s\\.?|ss\\.?)\\s*${escRe(sec[1])}\\b`, 'i').test(jText)) return false;
  if (rule && !sec && !new RegExp(`\\b(?:rule|rules|r\\.?|rr\\.?)\\s*${escRe(rule[1])}\\b`, 'i').test(jText)) return false;
  if (sch && !new RegExp(`\\bSchedule\\s*${escRe(sch[1])}\\b`, 'i').test(jText)) return false;
  if (part && !new RegExp(`\\bPart\\s*${escRe(part[1])}\\b`, 'i').test(jText)) return false;
  return true;
}

export async function verifyLegal({ brief, market, judgment }) {
  const b = brief || {};
  const cites = Array.isArray(b.citations) ? b.citations : [];
  // Build the checklist: explicit citations + the case itself + any unsourced claims flagged.
  const items = [];
  if (b.caseLaw && (b.caseLaw.caseName || b.caseLaw.neutralCitation)) items.push({ item: [b.caseLaw.caseName, b.caseLaw.neutralCitation].filter(Boolean).join(' '), type: 'case', proposition: (b.caseLaw.decision || '').slice(0, 200) });
  for (const c of cites) { const label = [c.name, c.citation || c.section].filter(Boolean).join(' '); if (label) items.push({ item: label, type: c.type || 'case', proposition: c.proposition || '' }); }
  // de-dup by item
  const seen = new Set(); const all = items.filter((x) => { const k = x.item.toLowerCase().trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  if (!all.length) return { status: 'verified', checks: [], summary: 'No specific case, statute or rule was cited to verify.', checkedAt: new Date().toISOString(), noneToCheck: true };

  // 1) Ground against the judgment text we actually read (primary source) — no web needed.
  const jText = judgment && judgment.text ? String(judgment.text) : '';
  const jNorm = normCit(jText);
  const grounded = new Map();
  if (jText) for (const x of all) if (groundedInJudgment(x.item, jText, jNorm)) grounded.set(x.item, { item: x.item, type: x.type, verdict: 'verified', note: 'Checked against the judgment text itself', source: judgment.url || '' });
  const list = all.filter((x) => !grounded.has(x.item));
  const finish = (webChecks) => {
    const byI = new Map(webChecks.map((c) => [c.item, c]));
    const checks = all.map((x) => grounded.get(x.item) || byI.get(x.item));
    const bad = checks.filter((c) => c.verdict !== 'verified');
    return { status: bad.length ? 'issues' : 'verified', checks, summary: bad.length ? `${bad.length} of ${checks.length} citation(s) could not be verified or were misstated.` : `All ${checks.length} citation(s) verified${grounded.size ? ` (${grounded.size} against the judgment text)` : ''}.`, checkedAt: new Date().toISOString(), grounded: grounded.size };
  };
  if (!list.length) return finish([]);
  if (!perplexity.hasKey()) {
    return Object.assign(finish(list.map((x) => ({ item: x.item, type: x.type, verdict: 'unverified', note: 'not in the judgment text; web check not configured', source: '' }))), { status: 'issues' });
  }

  const numbered = list.map((x, i) => `${i + 1}. [${x.type}] ${x.item}${x.proposition ? ` — claimed to establish: ${x.proposition}` : ''}`).join('\n');
  const pp = await perplexity.ask({
    system: P('research.legalVerify'),
    user: `Verify each of these ${market ? market.country + ' ' : ''}legal citations against authoritative sources and return the JSON verdicts:\n\n${numbered}`,
    model: 'pro', recency: 'year', domains: LEGAL_DOMAINS, temperature: 0.1, maxTokens: 1500,
  });
  let parsed = null;
  try { const t = pp.answer || ''; const a = t.indexOf('{'); const z = t.lastIndexOf('}'); if (a >= 0 && z > a) parsed = JSON.parse(t.slice(a, z + 1)); } catch (e) { parsed = null; }
  let checks = (parsed && Array.isArray(parsed.checks)) ? parsed.checks : [];
  // Normalise + fall back to "unverified" for anything the checker didn't return.
  const byItem = new Map(checks.map((c) => [String(c.item || '').toLowerCase().trim(), c]));
  checks = list.map((x) => {
    const m = byItem.get(x.item.toLowerCase().trim()) || checks.find((c) => String(c.item || '').toLowerCase().includes(x.item.toLowerCase().slice(0, 18)));
    const verdict = m && /verified|misstated|unverified/.test(String(m.verdict || '')) ? m.verdict : 'unverified';
    return { item: x.item, type: x.type, verdict, note: (m && m.note) || (m ? '' : 'not confirmed by the checker'), source: (m && m.source) || '' };
  });
  return finish(checks);   // web verdicts + the ones already grounded in the judgment text
}

// Current UK trending topics in a niche (news-weighted), with sources.
export async function trendingIntel({ niche, context, db, now = 0 }) {
  if (!perplexity.hasKey() && !tavily.hasKey()) return { error: 'No research engine configured.' };
  const mk = marketFor(db);
  const ttl = 6 * 60 * 60 * 1000;
  const ctx = (context || '').toString().slice(0, 9000);   // the site's geo_context (identity + the SPECIFIC services it covers, which sit past the preamble)
  const cacheKey = `trend:${mk.db}:${(ctx || niche).slice(0, 80)}`;
  if (now) { const c = cacheGet(cacheKey, now, ttl); if (c) return c; }
  const out = { niche, country: mk.country, ideas: [], topics: [], summary: '', sources: [], engines: {}, cost: 0 };
  if (perplexity.hasKey()) {
    try {
      const pp = await perplexity.ask({
        system: (ctx ? `=== SITE CONTEXT (propose ideas strictly for THIS site's niche & audience) ===\n${ctx}\n\n` : '') + P('research.trending'),
        user: `${ctx ? '' : `Niche: ${niche}. `}Propose 6-8 timely, niche-specific article ideas for this site's ${mk.country} audience for THIS week. Return ONLY the JSON array described above.`,
        ...mt('research.trending', 'fast'), recency: 'week', domains: mk.preferDomains, scope: mk.scope, geo: mk.geo, maxTokens: 2000,
      });
      out.summary = pp.answer; out.sources = rankSources(pp.sources, mk); out.engines.perplexity = (pp.sources || []).length; if (pp.cost) out.cost += pp.cost;
      try {
        const a = String(pp.answer || '');
        let arr = [];
        const s = a.indexOf('['); const e = a.lastIndexOf(']');
        if (s >= 0 && e > s) { try { arr = JSON.parse(a.slice(s, e + 1)); } catch (_) { arr = []; } }
        if (!Array.isArray(arr) || !arr.length) {
          // Salvage: parse each COMPLETE top-level {...} object on its own. Survives a
          // truncated array (token cap) and nested "keywords":[...] arrays the full parse chokes on.
          arr = [];
          const re = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g; let m;
          while ((m = re.exec(a))) { try { const o = JSON.parse(m[0]); if (o && o.title) arr.push(o); } catch (_) {} }
        }
        out.ideas = (Array.isArray(arr) ? arr : []).map((x) => {
          if (typeof x === 'string') { const t = x.trim(); return t ? { title: t.slice(0, 160), keyword: t.slice(0, 120), whyNow: '', angle: '' } : null; }
          if (x && x.title) {
            const kw = Array.isArray(x.keywords) ? x.keywords[0] : (x.keyword || x.keywords);
            return {
              title: String(x.title).slice(0, 160), keyword: String(kw || x.title).slice(0, 120),
              whyNow: String(x.whyNow || x.why || '').slice(0, 400), angle: String(x.angle || x.plan || x.content_plan || x.description || '').slice(0, 900),
            };
          }
          return null;
        }).filter(Boolean).slice(0, 10);
      } catch (e) { /* fall back to the prose summary */ }
    } catch (e) { out.engines.perplexityError = String(e.message || e); }
  }
  if (tavily.hasKey()) {
    try { const t = await tavily.search(`${(niche || '').slice(0, 60)} ${mk.country}`, { topic: 'news', days: 7, maxResults: 8, country: mk.country }); out.topics = (t.results || []).map((r) => ({ title: r.title, url: r.url })); out.engines.tavily = out.topics.length; if (!out.sources.length) out.sources = rankSources(t.results, mk); }
    catch (e) { out.engines.tavilyError = String(e.message || e); }
  }
  if (now) cacheSet(cacheKey, out, now);
  return out;
}

// Grounded, cited current facts on a topic for the market (YMYL accuracy / citable facts).
export async function citableFactsGrounded({ topic, niche, db, siteId, now = 0 }) {
  if (!perplexity.hasKey()) return { error: 'Perplexity not configured — needed for grounded facts.' };
  const mk = marketFor(db);
  const pp = await perplexity.ask({
    system: withNiche(P('research.facts'), geoFor(siteId)),
    user: `Topic: ${topic}${niche ? ` (niche: ${niche})` : ''}. List the current ${mk.country} facts most useful to cite in an article.`,
    ...mt('research.facts', 'pro'), recency: 'month', domains: mk.preferDomains, scope: mk.scope, geo: mk.geo, maxTokens: 900,
  });
  return { topic, summary: pp.answer, sources: rankSources(pp.sources, mk), cost: pp.cost };
}

export function status() { return { perplexity: perplexity.hasKey(), tavily: tavily.hasKey() }; }

export default { gather, contentBrief, trendingIntel, citableFactsGrounded, verifyLegal, status };
