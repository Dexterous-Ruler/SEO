// ===========================================================================
// content-quality.js — Zero-dependency, OFFLINE, deterministic content
// intelligence. Pure JS (ESM), no npm, no network, no LLM calls. Same input
// always yields the same output. Three capabilities:
//   1) scoreContent  — quality score (filler / AI-pattern / density / repetition)
//   2) verifyClaims  — extract factual claims and flag the uncited ones
//   3) humanize      — 1:1 AI-phrase -> plain-prose substitution (case-preserving)
//
// Phrase tables authored for Sentinel; not derived from any CC BY-SA source.
// ===========================================================================

// ---------------------------------------------------------------------------
// Phrase tables (hand-authored). Lower-cased keys; matching is case-insensitive
// with case preservation applied at replacement time. Order longest-first at
// use sites so multi-word phrases win over their substrings.
// ---------------------------------------------------------------------------

// AI-phrase -> plain-prose replacements used by humanize(). An empty-string
// replacement means "delete the phrase" (with surrounding whitespace tidied).
const HUMANIZE_MAP = [
  ['in today\'s fast-paced world', ''],
  ['in today\'s digital age', ''],
  ['in the ever-evolving world of', 'in'],
  ['navigate the complexities of', 'handle'],
  ['navigate the complex', 'handle the'],
  ['harness the power of', 'use'],
  ['unlock the power of', 'use'],
  ['it is important to note that', ''],
  ['it is worth noting that', ''],
  ['it should be noted that', ''],
  ['plays a crucial role', 'matters'],
  ['plays a vital role', 'matters'],
  ['plays a pivotal role', 'matters'],
  ['a testament to', 'shows'],
  ['when it comes to', 'for'],
  ['in the realm of', 'in'],
  ['in the world of', 'in'],
  ['the world of', ''],
  ['at the end of the day', 'ultimately'],
  ['delve into', 'explore'],
  ['delve deeper into', 'explore'],
  ['dive into', 'explore'],
  ['a wide range of', 'many'],
  ['a myriad of', 'many'],
  ['a plethora of', 'many'],
  ['first and foremost', 'first'],
  ['needless to say', ''],
  ['leverage', 'use'],
  ['leveraging', 'using'],
  ['utilize', 'use'],
  ['utilise', 'use'],
  ['boasts', 'has'],
  ['robust', 'strong'],
  ['seamless', 'smooth'],
  ['seamlessly', 'smoothly'],
  ['unlock', 'enable'],
  ['cutting-edge', 'advanced'],
  ['state-of-the-art', 'advanced'],
  ['game-changer', 'major shift'],
  ['game changer', 'major shift'],
  ['paradigm shift', 'major change'],
  ['holistic approach', 'complete approach'],
];

// Filler / low-value phrases counted by scoreContent(). These add words without
// adding meaning; a high ratio of them lowers the quality score.
const FILLER_PHRASES = [
  'in order to', 'due to the fact that', 'for the purpose of', 'in the event that',
  'it is important to note', 'it is worth noting', 'needless to say',
  'as a matter of fact', 'at the end of the day', 'when all is said and done',
  'in conclusion', 'last but not least', 'first and foremost', 'in today\'s',
  'a wide range of', 'a variety of', 'a number of', 'each and every',
  'basically', 'essentially', 'actually', 'really', 'very', 'quite',
  'simply put', 'in other words', 'that being said', 'with that said',
  'all in all', 'to be honest', 'as we all know',
];

// LLM "tell-tale" phrasing counted by scoreContent(). Presence pushes the
// AI-pattern sub-score up (worse). Hand-authored, not copied from any list.
const AI_PATTERNS = [
  'delve into', 'delve deeper', 'dive into', 'navigate the complexities',
  'harness the power', 'unlock the power', 'a testament to', 'in the realm of',
  'when it comes to', 'plays a crucial role', 'plays a vital role',
  'plays a pivotal role', 'cutting-edge', 'state-of-the-art', 'game-changer',
  'paradigm shift', 'holistic approach', 'in today\'s fast-paced world',
  'in today\'s digital age', 'ever-evolving', 'a myriad of', 'a plethora of',
  'seamless', 'seamlessly', 'robust', 'leverage', 'foster', 'underscore',
  'underscores', 'tapestry', 'realm', 'embark', 'elevate', 'unleash',
  'it is important to note', 'on the other hand', 'in summary', 'overall',
];

// ---------------------------------------------------------------------------
// Small text utilities
// ---------------------------------------------------------------------------

/**
 * Strip HTML to plain text. Removes script/style blocks, decodes a handful of
 * common entities, drops all tags, and collapses whitespace. Deterministic.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  let t = String(html == null ? '' : html);
  // Quick "is this HTML?" check — if no angle brackets, treat as plain text.
  if (t.indexOf('<') === -1 && t.indexOf('&') === -1) return collapseWs(t);
  t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  // Preserve link hrefs as visible tokens so verifyClaims can see citations.
  t = t.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, ' $1 ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  return collapseWs(t);
}

/** Collapse all runs of whitespace to single spaces and trim. */
function collapseWs(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/** Tokenise into word tokens (letters/digits/apostrophes/hyphens). */
function tokenize(s) {
  const m = String(s).toLowerCase().match(/[a-z0-9][a-z0-9'\-]*/g);
  return m || [];
}

/** Split into sentences on terminal punctuation, keeping it simple/offline. */
function splitSentences(s) {
  const parts = String(s)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
  return parts.map((x) => x.trim()).filter(Boolean);
}

/** Count non-overlapping occurrences of a lower-cased needle in lower text. */
function countOccurrences(haystackLower, needleLower) {
  if (!needleLower) return 0;
  let count = 0;
  let i = 0;
  while ((i = haystackLower.indexOf(needleLower, i)) !== -1) {
    count++;
    i += needleLower.length;
  }
  return count;
}

/** Clamp a number into [lo, hi]. */
function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// ---------------------------------------------------------------------------
// 1) scoreContent
// ---------------------------------------------------------------------------

/**
 * Score content quality offline and deterministically.
 *
 * @param {string} input HTML or plain text.
 * @returns {{
 *   score: number,                // 0-100 composite (higher = better)
 *   thin: boolean,                // true when too short / too low density
 *   breakdown: {
 *     filler: number,             // 0-100 (higher = better, less filler)
 *     aiPattern: number,          // 0-100 (higher = better, fewer LLM tells)
 *     density: number,            // 0-100 (higher = better, more entities/numbers)
 *     repetition: number          // 0-100 (higher = better, less bigram repetition)
 *   },
 *   flags: string[],              // human-readable issues found
 *   words: number                 // word-token count
 * }}
 */
export function scoreContent(input) {
  const text = stripHtml(input);
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const words = tokens.length;
  const flags = [];

  if (words === 0) {
    return {
      score: 0,
      thin: true,
      breakdown: { filler: 0, aiPattern: 0, density: 0, repetition: 0 },
      flags: ['empty'],
      words: 0,
    };
  }

  // --- FILLER: words spent on filler phrases / total words -----------------
  let fillerWordHits = 0;
  let fillerPhraseHits = 0;
  for (const phrase of FILLER_PHRASES) {
    const occ = countOccurrences(lower, phrase);
    if (occ > 0) {
      fillerPhraseHits += occ;
      fillerWordHits += occ * (phrase.split(' ').length);
    }
  }
  const fillerRatio = fillerWordHits / words; // fraction of words that are filler
  // 0% filler -> 100; ~15%+ filler -> 0.
  const fillerScore = clamp(Math.round(100 - (fillerRatio / 0.15) * 100), 0, 100);
  if (fillerRatio > 0.05) flags.push('high-filler');

  // --- AI-PATTERN: count of LLM tell-tale phrases, normalised per 1k words --
  let aiHits = 0;
  for (const phrase of AI_PATTERNS) aiHits += countOccurrences(lower, phrase);
  const aiPer1k = (aiHits / words) * 1000;
  // 0 per 1k -> 100; ~6+ per 1k -> 0.
  const aiScore = clamp(Math.round(100 - (aiPer1k / 6) * 100), 0, 100);
  if (aiPer1k >= 2) flags.push('ai-phrasing');

  // --- DENSITY: named-entity + numeric heuristic per 100 tokens ------------
  // Capitalized tokens that are NOT sentence-initial approximate proper nouns.
  // Numeric tokens (years, %, quantities) approximate hard facts.
  const sentences = splitSentences(text);
  let entityHits = 0;
  let numericHits = 0;
  for (const sent of sentences) {
    const raw = sent.match(/\S+/g) || [];
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i];
      const cleaned = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9%]+$/g, '');
      if (!cleaned) continue;
      if (/\d/.test(cleaned)) {
        numericHits++;
        continue;
      }
      // Capitalized, not first word of sentence, not all-caps acronym noise.
      if (i > 0 && /^[A-Z][a-z'’-]+$/.test(cleaned)) entityHits++;
    }
  }
  const factHits = entityHits + numericHits;
  const densityPer100 = (factHits / words) * 100;
  // 0 per 100 -> 0; ~8+ per 100 -> 100.
  const densityScore = clamp(Math.round((densityPer100 / 8) * 100), 0, 100);
  if (densityPer100 < 2) flags.push('low-density');

  // --- REPETITION: share of repeated bigrams -------------------------------
  let repetitionScore = 100;
  if (tokens.length >= 2) {
    const bigrams = new Map();
    let totalBigrams = 0;
    for (let i = 0; i < tokens.length - 1; i++) {
      const bg = tokens[i] + ' ' + tokens[i + 1];
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
      totalBigrams++;
    }
    let repeated = 0;
    for (const c of bigrams.values()) if (c > 1) repeated += c - 1;
    const repRatio = totalBigrams ? repeated / totalBigrams : 0;
    // 0% repeated -> 100; ~25%+ repeated -> 0.
    repetitionScore = clamp(Math.round(100 - (repRatio / 0.25) * 100), 0, 100);
    if (repRatio > 0.12) flags.push('repetitive');
  }

  // --- Composite (weighted) ------------------------------------------------
  const score = clamp(
    Math.round(
      fillerScore * 0.25 +
        aiScore * 0.3 +
        densityScore * 0.3 +
        repetitionScore * 0.15
    ),
    0,
    100
  );

  const thin = words < 300 || densityPer100 < 1.5;
  if (words < 300) flags.push('thin-wordcount');

  return {
    score,
    thin,
    breakdown: {
      filler: fillerScore,
      aiPattern: aiScore,
      density: densityScore,
      repetition: repetitionScore,
    },
    flags,
    words,
  };
}

// ---------------------------------------------------------------------------
// 2) verifyClaims
// ---------------------------------------------------------------------------

// Claim-detection heuristics. Each returns true if the sentence makes that kind
// of factual claim. Ordered most-specific first; the first match wins for type.
const CLAIM_DETECTORS = [
  ['STATISTIC', /(\d+(?:\.\d+)?\s?%|\bpercent\b|\bpercentage\b)/i],
  [
    'AUTHORITY',
    /\b(studies show|research shows|according to|experts say|survey(?:s|ed)?|data (?:shows|suggests)|report(?:s|ed)? (?:that|by)|scientists|researchers)\b/i,
  ],
  [
    'TEMPORAL',
    /\b((?:19|20)\d{2}|in \d{4}|last (?:year|month|decade)|recently|currently|as of \d{4}|since \d{4})\b/i,
  ],
  [
    'COMPARATIVE',
    /\b(more than|less than|fewer than|greater than|larger than|smaller than|the (?:most|least|best|worst|largest|smallest|highest|lowest|fastest|leading)|over \d|under \d|up to \d)\b/i,
  ],
  // QUANTITY last: a bare number not already caught by the above.
  ['QUANTITY', /\b\d[\d,]*(?:\.\d+)?\b/],
];

// Citation heuristics — a claim is "cited" if any of these appear near it.
const CITATION_TESTS = [
  /https?:\/\/\S+/i, // a URL/link
  /\bwww\.\S+/i,
  /\b(?:source|sources|cited|citation|reference|ref)\b\s*[:\-]?/i,
  /\baccording to\s+(?:the\s+)?[A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+)*/, // "according to <Proper Noun>"
  /\[[^\]]+\]/, // [bracketed ref]
  /\(\s*(?:see|source|ref|cf\.?|https?:)[^)]*\)/i, // (see ...) / (source ...) / (https...)
  /\b(?:per|via)\s+[A-Z][A-Za-z.&'-]+/, // "per ONS", "via gov.uk"
];

const CITATION_WINDOW = 200; // chars on each side to look for a citation

/**
 * Extract factual claims and flag the ones lacking a nearby citation.
 *
 * @param {string} input HTML or plain text.
 * @returns {{
 *   total: number,
 *   uncitedCount: number,
 *   pass: boolean,                       // true when no uncited claims remain
 *   claims: Array<{ text: string, type: string, hasCitation: boolean }>,
 *   uncited: Array<{ text: string, type: string }>
 * }}
 */
export function verifyClaims(input) {
  const text = stripHtml(input);
  const sentences = splitSentences(text);
  const claims = [];
  const uncited = [];

  // Precompute sentence offsets in the joined text so we can scan a ±window.
  let cursor = 0;
  const offsets = sentences.map((s) => {
    const idx = text.indexOf(s, cursor);
    const start = idx === -1 ? cursor : idx;
    cursor = start + s.length;
    return { start, end: start + s.length };
  });

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    let type = null;
    for (const [label, re] of CLAIM_DETECTORS) {
      if (re.test(sentence)) {
        type = label;
        break;
      }
    }
    if (!type) continue;

    // Look for a citation inside the sentence OR within ±CITATION_WINDOW chars.
    const { start, end } = offsets[i];
    const windowText = text.slice(
      Math.max(0, start - CITATION_WINDOW),
      Math.min(text.length, end + CITATION_WINDOW)
    );
    let hasCitation = false;
    for (const re of CITATION_TESTS) {
      if (re.test(sentence) || re.test(windowText)) {
        hasCitation = true;
        break;
      }
    }

    const entry = { text: sentence, type, hasCitation };
    claims.push(entry);
    if (!hasCitation) uncited.push({ text: sentence, type });
  }

  return {
    total: claims.length,
    uncitedCount: uncited.length,
    pass: uncited.length === 0,
    claims,
    uncited,
  };
}

// ---------------------------------------------------------------------------
// 3) humanize
// ---------------------------------------------------------------------------

/** Apply the casing of `sample` (first char) to `replacement`. */
function matchCase(sample, replacement) {
  if (!replacement) return replacement;
  const firstAlpha = sample.match(/[A-Za-z]/);
  if (firstAlpha && firstAlpha[0] === firstAlpha[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Escape a string for safe use inside a RegExp.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministically swap AI-flavoured phrases for plain prose. Conservative:
 * only the curated 1:1 phrase map is applied — never whole-sentence rewrites.
 * Case of the original phrase's first letter is preserved on the replacement.
 *
 * @param {string} text Plain text (HTML is stripped first).
 * @returns {{
 *   text: string,
 *   changed: number,                                 // total replacements made
 *   changes: Array<{ from: string, to: string, count: number }>
 * }}
 */
export function humanize(text) {
  let out = stripHtml(text);
  const changes = [];
  let changed = 0;

  // Apply longest phrases first so multi-word phrases beat their substrings.
  const ordered = HUMANIZE_MAP.slice().sort((a, b) => b[0].length - a[0].length);

  for (const [from, to] of ordered) {
    // Word-boundary-aware, case-insensitive, global match of the exact phrase.
    const re = new RegExp('\\b' + escapeRe(from) + '\\b', 'gi');
    let count = 0;
    out = out.replace(re, (match) => {
      count++;
      if (to === '') return ' '; // sentinel for deletion; cleaned below
      return matchCase(match, to);
    });
    if (count > 0) {
      changed += count;
      changes.push({ from, to, count });
    }
  }

  // Clean up deletion sentinels + the whitespace/punctuation they leave behind.
  out = out
    .replace(/\s* \s*/g, ' ') // drop deleted phrase, keep one space
    .replace(/\s+([.,;:!?])/g, '$1') // no space before punctuation
    .replace(/([(])\s+/g, '$1') // no space after opening paren
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,;:]\s*/, '') // drop orphaned leading punctuation from a deleted opening phrase
    .replace(/(^|[.!?]\s+)([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase()) // recapitalise sentence starts
    .trim();

  return { text: out, changed, changes };
}

// ---------------------------------------------------------------------------
export default { scoreContent, verifyClaims, humanize };
