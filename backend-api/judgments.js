// Find + read the court JUDGMENT for a case-law topic (England & Wales) without the operator
// having to paste it (Karim: "can it not find the judgment itself?").
//
// Source priority, from what each site actually allows:
//   1. The National Archives "Find Case Law" (caselaw.nationalarchives.gov.uk) — the official
//      home of judgments since 2022 (UKSC, JCPC, Court of Appeal, High Court, Upper Tribunal,
//      EAT, some FTT). Free, Open Justice Licence, bot-friendly, has a party-name search feed
//      and clean full-text XML per judgment. PRIMARY.
//   2. CaseMine — readable, has a search, but judgment pages stop at a sign-up wall (partial
//      text). Discovery + last-resort partial read only.
//   3. BAILII — blocks automated access (serves a "robot" challenge page). We do NOT try to get
//      around that: a BAILII link is used only to read the case's neutral citation, and the same
//      judgment is then fetched from the National Archives.
//
// Discovery order: operator-supplied URL → judgment links inside the competitor article (they
// often hyperlink the judgment) → neutral citations in the title / competitor / research →
// National Archives search by party names → judgment-site URLs among the research sources.

const NA = 'https://caselaw.nationalarchives.gov.uk';
const UA = 'Mozilla/5.0 (compatible; SentinelBot/1.0)';

// England & Wales judgment sources (also shown to Karim as the list he asked for).
export const JUDGMENT_SITES = [
  { domain: 'caselaw.nationalarchives.gov.uk', name: 'The National Archives — Find Case Law', notes: 'Official, free; all senior courts + tribunals since 2022 (older ones back-filled). Primary source.' },
  { domain: 'supremecourt.uk', name: 'UK Supreme Court', notes: 'Judgments + press summaries (also on Find Case Law).' },
  { domain: 'jcpc.uk', name: 'Judicial Committee of the Privy Council', notes: 'Privy Council judgments.' },
  { domain: 'judiciary.uk', name: 'Courts and Tribunals Judiciary', notes: 'Selected judgments, sentencing remarks.' },
  { domain: 'tribunalsdecisions.service.gov.uk', name: 'Upper Tribunal (Immigration & Asylum) decisions', notes: 'Official tribunal decisions.' },
  { domain: 'gov.uk', name: 'GOV.UK tribunal decisions', notes: 'Employment Tribunal, tax and other tribunal decision finders.' },
  { domain: 'casemine.com', name: 'CaseMine', notes: 'Freemium; searchable, but full text sits behind a sign-up wall.' },
  { domain: 'bailii.org', name: 'BAILII', notes: 'Free and broad (incl. older cases) but blocks automated reading.' },
  { domain: 'vlex.co.uk', name: 'vLex / Justis', notes: 'Subscription.' },
  { domain: 'iclr.co.uk', name: 'ICLR (Law Reports)', notes: 'Official law reports; subscription.' },
];
const JUDGMENT_HOST_RE = /(^|\.)(caselaw\.nationalarchives\.gov\.uk|supremecourt\.uk|jcpc\.uk|judiciary\.uk|tribunalsdecisions\.service\.gov\.uk|casemine\.com|bailii\.org)$/i;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const isJudgmentUrl = (u) => {
  const h = hostOf(u); if (!JUDGMENT_HOST_RE.test(h)) return false;
  // judiciary.uk / supremecourt.uk carry lots of non-judgment pages — require a judgment-ish path.
  if (/judiciary\.uk|supremecourt\.uk/.test(h)) return /judgment|cases?\//i.test(u);
  if (/casemine\.com/.test(h)) return /\/judgement\//i.test(u);
  return true;
};

// ---- neutral citations ------------------------------------------------------
const CIT_RE = /\[(\d{4})\]\s+(UKSC|UKPC|UKHL|EWCA\s+(?:Civ|Crim)|EWHC|UKUT|UKFTT|UKEAT|EAT|EWFC(?:\s+B)?|EWCOP|UKIPTrib|EWCC|EWCR)\s+(\d+)(?:\s*\(([A-Za-z]+)\))?/g;
export function citationsIn(text) {
  const out = [], seen = new Set();
  for (const m of String(text || '').matchAll(CIT_RE)) {
    const c = { year: m[1], court: m[2].replace(/\s+/g, ' '), num: m[3], div: m[4] || '', raw: m[0] };
    const k = [c.year, c.court, c.num, c.div].join('|').toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
}
// Neutral citation → Find Case Law URL (verified patterns: /uksc/2021/5, /ewhc/ch/2026/1468,
// /ewca/civ/2023/1142, /eat/2023/1, /ukpc/2023/1). House of Lords (pre-2009) isn't on it → null.
export function naUrlFor(c) {
  if (!c) return null;
  const y = c.year, n = c.num, d = String(c.div || '').toLowerCase();
  switch (c.court.toUpperCase()) {
    case 'UKSC': return `${NA}/uksc/${y}/${n}`;
    case 'UKPC': return `${NA}/ukpc/${y}/${n}`;
    case 'EWCA CIV': return `${NA}/ewca/civ/${y}/${n}`;
    case 'EWCA CRIM': return `${NA}/ewca/crim/${y}/${n}`;
    case 'EWHC': return d ? `${NA}/ewhc/${d}/${y}/${n}` : null;
    case 'UKUT': return d ? `${NA}/ukut/${d}/${y}/${n}` : null;
    case 'UKFTT': return d ? `${NA}/ukftt/${d}/${y}/${n}` : null;
    case 'EAT': case 'UKEAT': return `${NA}/eat/${y}/${n}`;
    case 'EWFC': return `${NA}/ewfc/${y}/${n}`;
    case 'EWFC B': return `${NA}/ewfc/b/${y}/${n}`;
    case 'EWCOP': return `${NA}/ewcop/${y}/${n}`;
    case 'UKIPTRIB': return `${NA}/ukiptrib/${y}/${n}`;
    case 'EWCC': return `${NA}/ewcc/${y}/${n}`;
    case 'EWCR': return `${NA}/ewcr/${y}/${n}`;
    default: return null;
  }
}
// BAILII path → citation, e.g. /ew/cases/EWHC/Ch/2026/1468.html, /uk/cases/UKSC/2021/5.html,
// /ew/cases/EWCA/Civ/2023/123.html, /uk/cases/UKUT/IAC/2023/10.html.
export function citationFromBailii(url) {
  const m = String(url || '').match(/bailii\.org\/(?:ew|uk)\/cases\/([A-Za-z]+)\/(?:([A-Za-z]+)\/)?(\d{4})\/(\d+)/i);
  if (!m) return null;
  const court = m[1].toUpperCase(), sub = m[2] || '', year = m[3], num = m[4];
  if (court === 'EWCA') return { year, court: 'EWCA ' + (sub[0].toUpperCase() + sub.slice(1).toLowerCase()), num, div: '' };
  if (court === 'EWFC' && /^b$/i.test(sub)) return { year, court: 'EWFC B', num, div: '' };
  return { year, court, num, div: sub };
}
// Canonical Find Case Law judgment URL (strip /data.xml, query, trailing slash).
const naCanonical = (u) => String(u).replace(/[?#].*$/, '').replace(/\/(data\.(xml|html)|press-summary.*)$/i, '').replace(/\/$/, '');

// ---- fetching ----------------------------------------------------------------
async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) return { status: r.status, body: '' };
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 0, body: '' }; } finally { clearTimeout(t); }
}
const stripMarkup = (s) => String(s || '')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<header[\s\S]*?<\/header>/gi, ' ')
  .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br|paragraph|level|num)\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
// A real judgment, not a challenge page / index page / snippet.
const looksLikeJudgment = (t) => t.length >= 6000 && /judgment|judge|lord|lady|justice|tribunal|court/i.test(t) && !/verify you are (a )?human|are you a robot|access denied|captcha/i.test(t.slice(0, 2000));

// Read one judgment URL → { text, url, via, partial } | null.
export async function readJudgment(url) {
  const h = hostOf(url);
  if (/bailii\.org/i.test(h)) {                       // blocked to bots → read the NA copy instead
    const na = naUrlFor(citationFromBailii(url));
    return na ? readJudgment(na) : null;
  }
  if (/caselaw\.nationalarchives\.gov\.uk/i.test(h)) {
    const base = naCanonical(url);
    const x = await fetchText(base + '/data.xml');      // clean LegalDocML full text, no site chrome
    let text = stripMarkup(x.body);
    if (!looksLikeJudgment(text)) { const p = await fetchText(base); text = stripMarkup(p.body); }
    return looksLikeJudgment(text) ? { text, url: base, via: 'national-archives' } : null;
  }
  const r = await fetchText(url);
  const text = stripMarkup(r.body);
  if (/casemine\.com/i.test(h)) return text.length >= 3000 ? { text, url, via: 'casemine', partial: true } : null;
  return looksLikeJudgment(text) ? { text, url, via: h } : null;
}

// ---- search ------------------------------------------------------------------
// Find Case Law party-name search (Atom feed, relevance order) → [{ title, url, citation }].
export async function searchNationalArchives(query, { max = 5 } = {}) {
  const q = String(query || '').trim(); if (!q) return [];
  const r = await fetchText(`${NA}/atom.xml?query=${encodeURIComponent(q)}&order=relevance&per_page=${max}`, { timeoutMs: 15000 });
  const out = [];
  for (const e of String(r.body || '').split('<entry>').slice(1)) {
    const title = ((e.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/&amp;/g, '&').trim();
    const link = (e.match(/<link href="(https:\/\/caselaw\.nationalarchives\.gov\.uk\/[^"]+)"/) || [])[1];
    const cit = (e.match(/type="ukncn">([^<]*)</) || [])[1] || '';
    if (link && !/data\.xml$/.test(link)) out.push({ title, url: naCanonical(link), citation: cit.trim() });
  }
  return out;
}
// CaseMine search → judgment page URLs (discovery fallback; pages are partial).
async function searchCaseMine(query, { max = 2 } = {}) {
  const r = await fetchText(`https://www.casemine.com/search/uk?q=${encodeURIComponent(query)}`, { timeoutMs: 15000 });
  const ids = [...new Set([...String(r.body || '').matchAll(/href="(\/judgement\/uk\/[a-f0-9]{16,32})"/g)].map((m) => m[1]))];
  return ids.slice(0, max).map((p) => 'https://www.casemine.com' + p);
}

// "Emirates NBD Bank v Al Kuwari: When can…" → { a: 'Emirates NBD Bank', b: 'Al Kuwari' }.
const STOP = new Set(['when', 'what', 'how', 'why', 'where', 'who', 'the', 'ruling', 'rulings', 'judgment', 'judgement', 'case', 'decision', 'appeal', 'court', 'supreme', 'high', 'explained', 'analysis', 'update', 'lessons', 'guide', 'trademark', 'trade', 'mark', 'dispute', 'claim', 'uk', 'and', 'for', 'in', 'on', 'of', 'a', 'an', 'to', 'its', 'their', 'can', 'is', 'are']);
export function partiesFrom(title) {
  const t = String(title || '').split(/[:|–—?]/)[0];
  const m = t.match(/(.+?)\s+[vV](?:s\.?)?\s+(.+)/);
  if (!m) return null;
  const clean = (s, fromEnd) => {
    let w = s.replace(/[“”"()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (fromEnd) { while (w.length && STOP.has(w[w.length - 1].toLowerCase())) w.pop(); w = w.slice(-4); }
    else { const out = []; for (const x of w) { if (STOP.has(x.toLowerCase())) break; out.push(x); } w = out.slice(0, 4); }
    return w.join(' ');
  };
  const a = clean(m[1], true), b = clean(m[2], false);
  return a && b ? { a, b } : null;
}
// Court hint from the topic ("Supreme Court ruling" → UKSC), to pick the right stage of a case.
function courtHint(text) {
  const t = String(text || '').toLowerCase();
  if (/supreme court|uksc/.test(t)) return 'UKSC';
  if (/court of appeal|ewca/.test(t)) return 'EWCA';
  if (/high court|ewhc|chancery|king'?s bench|queen'?s bench|commercial court/.test(t)) return 'EWHC';
  if (/upper tribunal|ukut/.test(t)) return 'UKUT';
  if (/employment appeal|\beat\b/.test(t)) return 'EAT';
  if (/privy council/.test(t)) return 'UKPC';
  return '';
}
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
function partyMatch(result, parties) {
  if (!parties) return 0;
  const tt = new Set(tokens(result.title));
  const hit = (s) => tokens(s).some((w) => tt.has(w));
  return (hit(parties.a) ? 1 : 0) + (hit(parties.b) ? 1 : 0);
}

// ---- the resolver --------------------------------------------------------------
// → { text, url, via, citation, partial, tried[] } | { text:'', tried[] }.
export async function resolveJudgment({ title = '', keyword = '', competitor = null, researchSources = [], researchText = '', userUrl = '' } = {}) {
  const tried = [];
  const attempt = async (url, via) => {
    if (!url || tried.some((t) => t.url === url)) return null;
    const r = await readJudgment(url).catch(() => null);
    tried.push({ url, via, ok: !!(r && r.text) });
    return r ? Object.assign(r, { found: via }) : null;
  };
  let partialHit = null;
  const accept = (r) => { if (!r) return null; if (r.partial) { if (!partialHit) partialHit = r; return null; } return r; };

  // 1) Exact URL the operator pasted.
  if (userUrl) { const r = accept(await attempt(userUrl, 'pasted link')); if (r) return finish(r); }

  // 2) Judgment links inside the competitor article (markdown/bare links in the reader text +
  //    raw hrefs from its HTML) — competitors often hyperlink the judgment itself.
  const links = new Set();
  const addLinks = (s) => { for (const m of String(s || '').matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) { const u = m[0].replace(/[.,;]+$/, ''); if (isJudgmentUrl(u)) links.add(u); } };
  if (competitor) {
    addLinks(competitor.text);
    if (competitor.url) { const h = await fetchText(competitor.url, { timeoutMs: 15000 }); for (const m of String(h.body || '').matchAll(/href="([^"]+)"/g)) { try { const u = new URL(m[1], competitor.url).href; if (isJudgmentUrl(u)) links.add(u); } catch {} } }
  }
  // Official/full-text sources first, CaseMine last.
  const rank = (u) => (/nationalarchives/.test(u) ? 0 : /supremecourt|jcpc|judiciary|tribunalsdecisions/.test(u) ? 1 : /bailii/.test(u) ? 2 : 3);
  for (const u of [...links].sort((x, y) => rank(x) - rank(y)).slice(0, 4)) { const r = accept(await attempt(u, 'linked in competitor article')); if (r) return finish(r); }

  // 3) Neutral citations in the title / competitor text / research → Find Case Law URL.
  const parties = partiesFrom(title) || partiesFrom(keyword);
  const hint = courtHint(title + ' ' + keyword);
  const cites = [...citationsIn(title + ' ' + keyword), ...citationsIn(competitor && competitor.text), ...citationsIn(researchText)];
  // Prefer a citation from the hinted court; the title's own citation first.
  cites.sort((x, y) => (hint && y.court.startsWith(hint) ? 1 : 0) - (hint && x.court.startsWith(hint) ? 1 : 0));
  for (const c of cites.slice(0, 4)) { const r = accept(await attempt(naUrlFor(c), 'neutral citation ' + c.raw)); if (r) return finish(r); }

  // 4) Find Case Law search by party names (the "find it itself" path).
  if (parties) {
    const results = await searchNationalArchives(`${parties.a} ${parties.b}`).catch(() => []);
    const good = results.filter((x) => partyMatch(x, parties) === 2);
    good.sort((x, y) => (hint && y.citation.includes(hint) ? 1 : 0) - (hint && x.citation.includes(hint) ? 1 : 0));
    for (const g of good.slice(0, 2)) { const r = accept(await attempt(g.url, 'National Archives search')); if (r) return finish(r); }
  }

  // 5) Judgment-site URLs the research surfaced.
  for (const s of (researchSources || []).map((x) => x && x.url).filter(isJudgmentUrl).sort((x, y) => rank(x) - rank(y)).slice(0, 3)) {
    const r = accept(await attempt(s, 'research source')); if (r) return finish(r);
  }

  // 6) CaseMine search (partial text) as the last resort.
  if (parties && !partialHit) {
    for (const u of await searchCaseMine(`${parties.a} ${parties.b}`).catch(() => [])) { accept(await attempt(u, 'CaseMine search')); if (partialHit) break; }
  }
  if (partialHit) return finish(partialHit);
  return { text: '', tried };

  function finish(r) {
    const citation = (citationsIn(r.text.slice(0, 4000))[0] || {}).raw || '';
    return { text: r.text, url: r.url, via: r.via, found: r.found, partial: !!r.partial, citation, tried };
  }
}
