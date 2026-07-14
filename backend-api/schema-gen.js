// ===========================================================================
// Schema / structured-data generator — produces per-page JSON-LD (not just a
// global Organization blob). Deterministic, zero-dependency. Closes the brief's
// "schema" requirement: WebPage + BreadcrumbList for every page, Article for
// posts, and (for YMYL/legal sites) LegalService + Person/Author + FAQPage.
//
// Output is a schema.org @graph — the modern, Rank-Math-compatible way to ship
// multiple linked entities in one JSON-LD block.
// ===========================================================================

function clean(obj) {
  // Drop null/undefined/empty so the JSON-LD stays tight.
  if (Array.isArray(obj)) return obj.map(clean).filter((v) => v != null && !(Array.isArray(v) && !v.length));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const c = clean(v);
      if (c != null && !(Array.isArray(c) && !c.length) && c !== '') out[k] = c;
    }
    return out;
  }
  return obj;
}

const idFor = (url, frag) => `${(url || '').replace(/\/$/, '')}/#${frag}`;

// BreadcrumbList from the URL path segments (Home → … → page).
function buildBreadcrumb(url, siteName, baseUrl) {
  let path = '/';
  try { path = new URL(url).pathname; } catch (e) {}
  const segs = path.split('/').filter(Boolean);
  const items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl || '/' }];
  let acc = (baseUrl || '').replace(/\/$/, '');
  segs.forEach((s, i) => {
    acc += '/' + s;
    items.push({ '@type': 'ListItem', position: i + 2, name: titleCase(decodeURIComponent(s).replace(/[-_]/g, ' ')), item: acc + '/' });
  });
  return { '@type': 'BreadcrumbList', '@id': idFor(url, 'breadcrumb'), itemListElement: items };
}

function titleCase(s) { return (s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }

// Organization (the publisher entity), referenced by other nodes via @id.
function buildOrganization(org, baseUrl) {
  if (!org || !org.name) return null;
  return clean({
    '@type': org.type || 'Organization',
    '@id': idFor(baseUrl, 'organization'),
    name: org.name,
    url: org.url || baseUrl,
    logo: org.logo ? { '@type': 'ImageObject', url: org.logo } : undefined,
    sameAs: org.sameAs && org.sameAs.length ? org.sameAs : undefined,
    telephone: org.telephone,
    address: org.address ? { '@type': 'PostalAddress', ...org.address } : undefined,
  });
}

// LegalService (or other LocalBusiness subtype) for YMYL/legal sites.
function buildLegalService(org, baseUrl, { serviceType = 'LegalService', areaServed } = {}) {
  if (!org || !org.name) return null;
  return clean({
    '@type': serviceType,
    '@id': idFor(baseUrl, 'legalservice'),
    name: org.name,
    url: org.url || baseUrl,
    image: org.logo,
    telephone: org.telephone,
    areaServed: areaServed || org.areaServed,
    address: org.address ? { '@type': 'PostalAddress', ...org.address } : undefined,
    priceRange: org.priceRange,
  });
}

// Person (author / expert) — E-E-A-T signal, esp. for YMYL.
function buildPerson(author, baseUrl) {
  if (!author || !author.name) return null;
  return clean({
    '@type': 'Person',
    '@id': idFor(baseUrl, 'person-' + slug(author.name)),
    name: author.name,
    jobTitle: author.jobTitle,
    url: author.url,
    sameAs: author.sameAs,
    knowsAbout: author.knowsAbout,
  });
}
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// WebPage — the page entity itself, linking publisher + breadcrumb.
function buildWebPage(page, org, baseUrl) {
  return clean({
    '@type': page.webpageType || 'WebPage',
    '@id': idFor(page.url, 'webpage'),
    url: page.url,
    name: page.title,
    description: page.description,
    isPartOf: org && org.name ? { '@id': idFor(baseUrl, 'organization') } : undefined,
    breadcrumb: { '@id': idFor(page.url, 'breadcrumb') },
    inLanguage: page.lang || 'en-GB',
    datePublished: page.datePublished,
    dateModified: page.dateModified,
  });
}

// Article — for posts/blog content.
function buildArticle(page, org, baseUrl, author) {
  return clean({
    '@type': page.articleType || 'Article',
    '@id': idFor(page.url, 'article'),
    headline: page.title,
    description: page.description,
    image: page.image,
    datePublished: page.datePublished,
    dateModified: page.dateModified || page.datePublished,
    author: author && author.name ? { '@id': idFor(baseUrl, 'person-' + slug(author.name)) } : (org && org.name ? { '@id': idFor(baseUrl, 'organization') } : undefined),
    publisher: org && org.name ? { '@id': idFor(baseUrl, 'organization') } : undefined,
    mainEntityOfPage: { '@id': idFor(page.url, 'webpage') },
  });
}

// FAQPage — from extracted Q&A (great for AI citation + rich results).
function buildFaqPage(url, faqs) {
  const items = (faqs || []).filter((f) => f && f.q && f.a).slice(0, 12).map((f) => ({
    '@type': 'Question', name: String(f.q).slice(0, 300),
    acceptedAnswer: { '@type': 'Answer', text: String(f.a).slice(0, 1200) },
  }));
  if (!items.length) return null;
  return { '@type': 'FAQPage', '@id': idFor(url, 'faq'), mainEntity: items };
}

// HowTo — step-by-step instructions. NOTE: deprecated by Google for rich results
// (validateSchema flags it as a warning); still emitted on request as an AI/entity
// signal. data: { name, description, steps:[{name,text,image}], totalTime }
function buildHowTo(url, data) {
  if (!data || !data.name || !Array.isArray(data.steps) || !data.steps.length) return null;
  const steps = data.steps.filter((s) => s && (s.text || s.name)).map((s, i) => clean({
    '@type': 'HowToStep', position: i + 1,
    name: s.name ? String(s.name).slice(0, 300) : undefined,
    text: s.text ? String(s.text).slice(0, 1200) : undefined,
    image: s.image,
  }));
  if (!steps.length) return null;
  return clean({
    '@type': 'HowTo',
    '@id': idFor(url, 'howto'),
    name: String(data.name).slice(0, 300),
    description: data.description,
    totalTime: data.totalTime,
    step: steps,
  });
}

// ItemList — a non-procedural set of items (e.g. "documents you need", "visa
// types"). Emitted for bulleted lists that are NOT step-by-step instructions,
// so the content still gets correct structured data without a HowTo falsely
// asserting a procedure. data: { name, items:[string] }
function buildItemList(url, data) {
  const items = (data && Array.isArray(data.items) ? data.items : []).filter(Boolean).slice(0, 30);
  if (!items.length) return null;
  return clean({
    '@type': 'ItemList',
    '@id': idFor(url, 'itemlist'),
    name: data.name ? String(data.name).slice(0, 300) : undefined,
    itemListElement: items.map((text, i) => ({ '@type': 'ListItem', position: i + 1, name: String(text).slice(0, 300) })),
  });
}

// Speakable — marks selectors/xpaths a voice assistant can read aloud.
// data: { cssSelectors:[], xpaths:[] }. Attaches to the page WebPage @id.
function buildSpeakable(url, data) {
  if (!data) return null;
  const css = (data.cssSelectors || []).filter(Boolean);
  const xp = (data.xpaths || []).filter(Boolean);
  if (!css.length && !xp.length) return null;
  return clean({
    '@type': 'WebPage',
    '@id': idFor(url, 'webpage'),
    speakable: clean({
      '@type': 'SpeakableSpecification',
      cssSelector: css.length ? css : undefined,
      xpath: xp.length ? xp : undefined,
    }),
  });
}

// VideoObject — for embedded/hosted video (rich result + AI signal).
// data: { name, description, thumbnailUrl, uploadDate, contentUrl, embedUrl, duration, clips:[{name,startOffset,url}] }
function buildVideoObject(url, data) {
  if (!data || !data.name) return null;
  const clips = (data.clips || []).filter((c) => c && c.name).map((c) => clean({
    '@type': 'Clip',
    name: String(c.name).slice(0, 300),
    startOffset: c.startOffset,
    url: c.url,
  }));
  return clean({
    '@type': 'VideoObject',
    '@id': idFor(url, 'video-' + slug(data.name)),
    name: String(data.name).slice(0, 300),
    description: data.description,
    thumbnailUrl: data.thumbnailUrl,
    uploadDate: data.uploadDate,
    contentUrl: data.contentUrl,
    embedUrl: data.embedUrl,
    duration: data.duration,
    hasPart: clips.length ? clips : undefined,
  });
}

// Assemble the full @graph for a page based on its type + site config.
//   page: { url, title, description, type:'post'|'page', datePublished, dateModified, image, lang }
//   opts: { org, baseUrl, siteName, isLegal, author, areaServed, faqs, howTo, speakable, video }
//     howTo:    { name, description, steps:[{name,text,image}], totalTime }   (optional)
//     speakable:{ cssSelectors:[], xpaths:[] }                               (optional)
//     video:    { name, description, thumbnailUrl, uploadDate, ... }         (optional)
function generatePageSchema(page, opts = {}) {
  const { org = {}, baseUrl = '', siteName, isLegal = false, author, areaServed, faqs, howTo, speakable, video } = opts;
  const graph = [];
  const orgNode = buildOrganization(org, baseUrl);
  if (orgNode) graph.push(orgNode);
  if (isLegal) { const ls = buildLegalService(org, baseUrl, { areaServed }); if (ls) graph.push(ls); }
  const person = buildPerson(author, baseUrl);
  if (person) graph.push(person);
  graph.push(buildBreadcrumb(page.url, siteName, baseUrl));
  graph.push(buildWebPage(page, org, baseUrl));
  if (page.type === 'post') graph.push(buildArticle(page, org, baseUrl, author));
  const faq = buildFaqPage(page.url, faqs);
  if (faq) graph.push(faq);
  const howto = buildHowTo(page.url, howTo);
  if (howto) graph.push(howto);
  const speak = buildSpeakable(page.url, speakable);
  if (speak) graph.push(speak);
  const vid = buildVideoObject(page.url, video);
  if (vid) graph.push(vid);
  return { '@context': 'https://schema.org', '@graph': graph.map(clean) };
}

// ---------------------------------------------------------------------------
// schemaForAnswerBlock — turn a claude.answerBlock result into the best @graph
// for answer surfaces (AI Overviews, voice, featured snippets). Mirrors the
// generatePageSchema output shape: { '@context', '@graph' }.
//   url:   the page the answer block lives on.
//   block: { heading, format:'paragraph'|'list'|'table'|'video', answer, html, faq:[{q,a}] }
//   opts:  { org, baseUrl, siteName }
// Always emits a WebPage. When block.answer exists, attaches a Speakable that
// targets ['h1','h2','.aeo-answer'] — best-effort: the publisher should wrap the
// rendered answer in an element with class "aeo-answer" so voice assistants read
// the right text. Adds a FAQPage when block.faq has >=2 items, and a HowTo when
// the block is a list (format==='list' or the html contains <ol>/<li> steps),
// with steps parsed from the html <li> items (text only). Skips VideoObject
// (the block carries no video metadata fields).
// Returns { graph, validation } where validation is validateSchema(graph).
// ---------------------------------------------------------------------------

// Market → BCP-47 language map (en-GB fallback). Lets a non-UK site emit the
// right inLanguage instead of inheriting the platform's en-GB default.
const MARKET_LANG = {
  'United Kingdom': 'en-GB',
  'Australia': 'en-AU',
  'United States': 'en-US',
  'India': 'en-IN',
  'Ireland': 'en-IE',
};
function langForMarket(lang, market) {
  if (lang) return lang;
  if (market && MARKET_LANG[market]) return MARKET_LANG[market];
  return 'en-GB';
}

// Normalize a faq item to { q, a } accepting {q,a} | {question,answer} |
// {name,acceptedAnswer:{text}} (schema.org Question shape). Returns null if no
// usable Q&A pair.
function normalizeFaq(f) {
  if (!f || typeof f !== 'object') return null;
  const q = f.q || f.question || f.name;
  let a = f.a || f.answer;
  if (a == null && f.acceptedAnswer) {
    a = typeof f.acceptedAnswer === 'string' ? f.acceptedAnswer : f.acceptedAnswer.text;
  }
  if (q && a) return { q, a };
  return null;
}

// Extract <li> inner text (tags stripped, entities/whitespace tidied) from html.
function parseListItems(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(text);
  }
  return out;
}

function schemaForAnswerBlock(url, block, { org, baseUrl, siteName, lang, market } = {}) {
  const b = block || {};
  const graph = [];
  const base = baseUrl || '';

  // buildWebPage always emits `breadcrumb` (and `isPartOf` when org.name is set) as
  // @id references. Emit the referenced nodes here so those refs resolve within this
  // graph — otherwise the JSON-LD points at undefined nodes (dangling @id) and Google
  // reports the breadcrumb/entity linkage as incomplete. Mirrors generatePageSchema.
  const orgNode = buildOrganization(org, base);
  if (orgNode) graph.push(orgNode);
  graph.push(buildBreadcrumb(url, siteName, base));

  // Page node — reuse buildWebPage style (title/description from the block heading).
  // inLanguage derives from explicit lang or the site's market (not the en-GB default).
  graph.push(buildWebPage(
    { url, title: b.heading, description: b.answer, lang: langForMarket(lang, market) },
    org || {},
    base
  ));

  // Speakable — attach to the WebPage @id when there's an answer to read aloud.
  if (b.answer) {
    const speak = buildSpeakable(url, { cssSelectors: ['h1', 'h2', '.aeo-answer'] });
    if (speak) graph.push(speak);
  }

  // FAQPage — robust: accept {q,a} | {question,answer} | {name,acceptedAnswer}
  // and emit when there's >=1 valid Q&A pair (buildFaqPage gets normalized {q,a}).
  if (Array.isArray(b.faq)) {
    const pairs = b.faq.map(normalizeFaq).filter(Boolean);
    if (pairs.length >= 1) {
      const faq = buildFaqPage(url, pairs);
      if (faq) graph.push(faq);
    }
  }

  // List-format block → structured data, but HowTo ONLY for genuine procedures.
  // Many 'list' answers are non-procedural (e.g. "documents you need", "types of
  // visas") — a set of items, not sequential steps. HowTo asserts a step-by-step
  // procedure, so gate it: emit HowTo only when the block is actually procedural
  // (an ordered <ol>, or a how-to/steps signal in the heading); otherwise emit a
  // plain ItemList so the bullets still get correct (non-procedural) markup.
  const html = typeof b.html === 'string' ? b.html : '';
  const hasOrdered = /<ol\b/i.test(html);
  const hasList = hasOrdered || /<ul\b|<li\b/i.test(html) || b.format === 'list';
  if (hasList) {
    const items = parseListItems(html);
    if (items.length) {
      const proceduralHeading = /\bhow[\s-]?to\b|\bstep[\s-]?by[\s-]?step\b|\bsteps?\b|\bprocess\b|\binstructions?\b/i.test(String(b.heading || ''));
      if (hasOrdered || proceduralHeading) {
        const howto = buildHowTo(url, { name: b.heading, description: b.answer, steps: items.map((text) => ({ text })) });
        if (howto) graph.push(howto);
      } else {
        const list = buildItemList(url, { name: b.heading, items });
        if (list) graph.push(list);
      }
    }
  }

  const graphDoc = { '@context': 'https://schema.org', '@graph': graph.map(clean) };
  return { graph: graphDoc, validation: validateSchema(graphDoc) };
}

// ---------------------------------------------------------------------------
// validateSchema — lint a JSON-LD object / @graph array / JSON string before it
// ships. Returns { ok, errors, warnings }. Catches placeholder leftovers and
// missing required fields (hard errors), and flags deprecated/retired types as
// warnings (they may still carry AI-Overview / entity value).
// ---------------------------------------------------------------------------

// Types Google deprecated/retired but that we still allow as AI/entity signals.
const DEPRECATED_TYPES = {
  HowTo: 'HowTo rich result deprecated by Google — kept as AI/entity signal only.',
  FAQPage: 'FAQPage rich result retired (May 2026) —',
  Vehicle: 'Vehicle structured-data support retired by Google (June 2025).',
  ClaimReview: 'ClaimReview rich result retired for most sites (June 2025) — limited to approved fact-checkers.',
  EstimatedSalary: 'EstimatedSalary rich result retired by Google (June 2025).',
};

// Placeholder fingerprints that must never reach production JSON-LD.
const PLACEHOLDER_RE = /(example\.com|\bLorem\b|YOUR_|\bTODO\b|x{4,})/i;

// Minimum required fields by @type (presence sanity, not full schema.org spec).
const REQUIRED_FIELDS = {
  Article: ['headline'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  HowTo: ['name', 'step'],
};

function isEmptyVal(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function hasPlaceholder(v) {
  if (typeof v === 'string') return PLACEHOLDER_RE.test(v);
  if (Array.isArray(v)) return v.some(hasPlaceholder);
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder);
  return false;
}

function typeList(t) {
  if (!t) return [];
  return Array.isArray(t) ? t.map(String) : [String(t)];
}

// Validate a single node (object with @type) and push into errors/warnings.
function validateNode(node, errors, warnings) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push('Graph node is not an object.');
    return;
  }
  const types = typeList(node['@type']);
  if (!types.length) {
    errors.push('Node missing @type.');
  }

  // Deprecated / retired types → warnings (still shipped).
  for (const t of types) {
    if (DEPRECATED_TYPES[t]) {
      const note = (t === 'FAQPage') ? DEPRECATED_TYPES[t] + ' kept as AI signal only' : DEPRECATED_TYPES[t];
      warnings.push(note);
    }
  }

  // Required-field sanity per known type.
  for (const t of types) {
    const reqs = REQUIRED_FIELDS[t];
    if (reqs) {
      for (const f of reqs) {
        if (isEmptyVal(node[f])) errors.push(`${t} missing required field "${f}".`);
      }
    }
    // Speakable needs cssSelector or xpath (on the node carrying speakable).
    if (t === 'WebPage' && node.speakable) {
      const sp = node.speakable;
      if (isEmptyVal(sp.cssSelector) && isEmptyVal(sp.xpath)) {
        errors.push('Speakable specification missing cssSelector or xpath.');
      }
    }
  }
  if (types.includes('SpeakableSpecification')) {
    if (isEmptyVal(node.cssSelector) && isEmptyVal(node.xpath)) {
      errors.push('Speakable specification missing cssSelector or xpath.');
    }
  }

  // Placeholder text anywhere in the node.
  if (hasPlaceholder(node)) {
    errors.push(`Placeholder text found in ${types[0] || 'node'} (example.com / Lorem / YOUR_ / TODO / xxxx).`);
  }
}

function validateSchema(input) {
  const errors = [];
  const warnings = [];
  let data = input;

  // Accept a JSON string.
  if (typeof input === 'string') {
    try { data = JSON.parse(input); }
    catch (e) { return { ok: false, errors: ['Invalid JSON: ' + (e && e.message ? e.message : String(e)) ], warnings: [] }; }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['Schema is not a JSON-LD object or @graph array.'], warnings: [] };
  }

  // Resolve the list of nodes to check + verify @context where expected.
  let nodes;
  if (Array.isArray(data)) {
    // Bare @graph array.
    nodes = data;
  } else if (Array.isArray(data['@graph'])) {
    if (!data['@context']) errors.push('Missing @context.');
    nodes = data['@graph'];
    if (!nodes.length) errors.push('Empty @graph.');
  } else {
    // Single JSON-LD object.
    if (!data['@context']) errors.push('Missing @context.');
    if (!data['@type']) errors.push('Missing @type.');
    nodes = [data];
  }

  for (const n of nodes) validateNode(n, errors, warnings);

  return { ok: errors.length === 0, errors, warnings };
}

// ===========================================================================
// Local Pack / LocalBusiness support — parse a site's NAP (Name/Address/Phone)
// out of its geo_context prose (the sites table has no dedicated NAP columns),
// emit a LocalBusiness-family node (LegalService for these law firms), and score
// a page's Local Pack readiness. Deterministic, zero-dependency, same style as
// the builders above.
// ===========================================================================

// UK postcode (e.g. EC1V 2NX, SW1A 1AA, M1 1AE). Captures the canonical form
// with the single space before the inward code; tolerant of a missing space.
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
// UK phone (e.g. 0207 459 4037, 020 7459 4037, +44 20 7459 4037, 07700 900123).
const UK_PHONE_RE = /(\+44\s?\d{1,4}|\(?0\d{2,4}\)?)[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
// Company-suffix fingerprints for the registered legal entity.
const LEGAL_ENTITY_RE = /\b([A-Z][\w&'.,-]*(?:\s+[A-Z][\w&'.,-]*)*\s+(?:Ltd|Limited|LLP|PLC|LLC|Solicitors|Law(?:\s+Firm)?|Services\s+Ltd|Partnership))\b/;

// extractNap — best-effort, deterministic parse of NAP from geo_context/page text.
// Returns a partial { businessName, legalEntity, streetAddress, locality, region,
// postalCode, country, telephone, email } (any field may be ''). Pure.
function extractNap(text) {
  const out = {
    businessName: '', legalEntity: '', streetAddress: '', locality: '',
    region: '', postalCode: '', country: '', telephone: '', email: '',
  };
  if (!text || typeof text !== 'string') return out;
  const s = text.replace(/\s+/g, ' ').trim();

  // Email + phone (first match wins).
  const em = s.match(EMAIL_RE);
  if (em) out.email = em[0];
  const ph = s.match(UK_PHONE_RE);
  if (ph) out.telephone = ph[0].replace(/[\s.-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Registered legal entity (…Ltd / Limited / LLP / Solicitors …).
  const le = s.match(LEGAL_ENTITY_RE);
  if (le) {
    out.legalEntity = le[1].trim().replace(/[.,]+$/, '');
    // Business name = entity minus a trailing company suffix (people search the
    // trading name, not "… Services Ltd").
    out.businessName = out.legalEntity
      .replace(/\s+(?:Ltd|Limited|LLP|PLC|LLC|Services\s+Ltd|Partnership)$/i, '')
      .trim();
  }

  // Postcode + UK country default once a postcode is present.
  const pc = s.match(UK_POSTCODE_RE);
  if (pc) {
    out.postalCode = (pc[1] + ' ' + pc[2]).toUpperCase();
    out.country = 'GB';
    // Address block: the comma-separated run immediately preceding the postcode.
    // e.g. "128 City Road, London EC1V 2NX" → street "128 City Road", locality
    // "London". Walk back from the postcode through the prior comma segments.
    const before = s.slice(0, pc.index).replace(/[,\s]+$/, '');
    const segs = before.split(',').map((x) => x.trim()).filter(Boolean);
    // Last segment usually holds the locality (sometimes "London EC1V" if the
    // postcode hugged the town); the one before it is the street line.
    if (segs.length) {
      let locality = segs[segs.length - 1];
      // Strip a dangling outward-code fragment the postcode regex left behind.
      locality = locality.replace(/\s+[A-Z]{1,2}\d[A-Z\d]?$/i, '').trim();
      out.locality = locality;
      if (segs.length >= 2) {
        const seg = segs[segs.length - 2];
        // Pull JUST the street line — a house number within ~30 chars of a street
        // keyword — out of the segment, dropping any leading prose like
        // "… SRA number 8006057. Registered & main office:" (the 7-digit SRA number
        // is too far from the keyword to match, so only "128 City Road" is kept).
        const KW = 'Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Way|Close|Court|Square|Sq|Place|Pl|Drive|Dr|Hill|Gardens|Terrace|Walk|Wharf|Row|Crescent';
        const sm = seg.match(new RegExp("\\b\\d{1,4}[\\w\\s'.&-]{0,30}?\\b(?:" + KW + ")\\b", 'ig'));
        if (sm) out.streetAddress = sm[sm.length - 1].replace(/\s+/g, ' ').trim();
      }
      // If the locality itself begins with a number (no comma between street and
      // town, e.g. "128 City Road London"), split it.
      if (!out.streetAddress && /^\d/.test(locality)) {
        const m = locality.match(/^(\d+[^,]*?(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Way|Close|Court|Square|Sq|Place|Pl|Drive|Dr|Hill|Gardens|Terrace|Walk|Wharf|Row|Crescent))\s+(.+)$/i);
        if (m) { out.streetAddress = m[1].trim(); out.locality = m[2].trim(); }
      }
    }
    // Region heuristic: a London postcode area implies the London region.
    if (/^(?:EC|WC|[NSEW]|NW|SW|SE)\d/i.test(out.postalCode)) out.region = out.region || 'London';
  }

  return out;
}

// buildLocalBusiness — a LocalBusiness-family node (default LegalService since
// these are law firms; override via opts.type). Mirrors buildLegalService:
// nested PostalAddress, telephone/email, areaServed, openingHoursSpecification,
// priceRange, GeoCoordinates, sameAs[]. Omits empty fields via clean().
//   nap:  output of extractNap (or any subset of the same shape)
//   opts: { type, baseUrl, areaServed, openingHours, priceRange, sameAs, geo }
//     openingHours: [{ dayOfWeek:['Monday',...], opens:'09:00', closes:'17:00' }]
//     geo:          { lat, lng } | { latitude, longitude }
function buildLocalBusiness(url, nap, { type = 'LegalService', baseUrl, areaServed, openingHours, priceRange, sameAs, geo } = {}) {
  const n = nap || {};
  const name = n.businessName || n.legalEntity;
  if (!name) return null;
  const base = baseUrl || url;

  const address = clean({
    '@type': 'PostalAddress',
    streetAddress: n.streetAddress,
    addressLocality: n.locality,
    addressRegion: n.region,
    postalCode: n.postalCode,
    addressCountry: n.country,
  });

  // openingHoursSpecification — one entry per passed { dayOfWeek, opens, closes }.
  let hours;
  if (Array.isArray(openingHours) && openingHours.length) {
    hours = openingHours.map((h) => clean({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h && h.dayOfWeek,
      opens: h && h.opens,
      closes: h && h.closes,
    })).filter((h) => h && (h.opens || h.dayOfWeek));
    if (!hours.length) hours = undefined;
  }

  // geo → GeoCoordinates when a lat/lng pair is supplied.
  let geoNode;
  if (geo) {
    const lat = geo.lat != null ? geo.lat : geo.latitude;
    const lng = geo.lng != null ? geo.lng : geo.longitude;
    if (lat != null && lng != null) {
      geoNode = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
    }
  }

  return clean({
    '@type': type,
    '@id': idFor(base, 'localbusiness'),
    name,
    legalName: n.legalEntity && n.legalEntity !== name ? n.legalEntity : undefined,
    url: url || base,
    address: address && Object.keys(address).length > 1 ? address : undefined,
    telephone: n.telephone,
    email: n.email,
    areaServed: areaServed || n.areaServed,
    openingHoursSpecification: hours,
    priceRange,
    geo: geoNode,
    sameAs: sameAs && sameAs.length ? sameAs : undefined,
  });
}

// localSchemaForSite — extractNap(geoContext) → buildLocalBusiness wrapped in a
// generatePageSchema-style @graph (WebPage + the LocalBusiness node), validated.
// Returns { graph, validation, nap }.
function localSchemaForSite({ url, geoContext, siteName, market, areaServed } = {}) {
  const nap = extractNap(geoContext);
  const graph = [];
  // buildWebPage always emits a `breadcrumb` @id ref — emit the BreadcrumbList it
  // points at so the reference resolves (no dangling @id). org is {} here, so no
  // Organization node / isPartOf ref is produced.
  graph.push(buildBreadcrumb(url, siteName || nap.businessName, url || ''));
  graph.push(buildWebPage(
    { url, title: siteName || nap.businessName, lang: langForMarket(null, market) },
    {},
    url || ''
  ));
  const lb = buildLocalBusiness(url, nap, { areaServed, baseUrl: url });
  if (lb) graph.push(lb);
  const graphDoc = { '@context': 'https://schema.org', '@graph': graph.map(clean) };
  return { graph: graphDoc, validation: validateSchema(graphDoc), nap };
}

// localReadiness — score 0-100 of a page's Local Pack readiness from its html /
// extracted JSON-LD @types / visible text. Returns { score, checks, nap }.
//   html:        raw page html (for tel: link detection)
//   jsonLdTypes: array of @type strings found in the page's JSON-LD
//   text:        visible text (run through extractNap for NAP presence)
function localReadiness({ html, jsonLdTypes, text } = {}) {
  const nap = extractNap(text || '');
  const types = (jsonLdTypes || []).map(String);
  const h = typeof html === 'string' ? html : '';

  const hasName = !!(nap.businessName || nap.legalEntity);
  const hasAddress = !!(nap.streetAddress || nap.locality || nap.postalCode);
  const hasPhone = !!nap.telephone;
  const hasLocalLd = types.some((t) => /^(LocalBusiness|LegalService|Attorney|Notary|ProfessionalService)$/i.test(t));
  // Clickable phone: a tel: href anywhere in the markup.
  const hasTelLink = /href\s*=\s*["']?tel:/i.test(h);
  const hasPostcode = !!nap.postalCode;

  const checks = [
    { id: 'nap_name', label: 'Business name present in page text', ok: hasName },
    { id: 'nap_address', label: 'Street/locality/postcode present (NAP address)', ok: hasAddress },
    { id: 'nap_phone', label: 'Telephone present in page text', ok: hasPhone },
    { id: 'local_jsonld', label: 'LocalBusiness/LegalService JSON-LD present', ok: hasLocalLd },
    { id: 'tel_link', label: 'Phone is a clickable tel: link', ok: hasTelLink },
    { id: 'postcode', label: 'UK postcode present', ok: hasPostcode },
  ];

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  return { score, checks, nap };
}

export { generatePageSchema, validateSchema, buildOrganization, buildLegalService, buildPerson, buildWebPage, buildArticle, buildBreadcrumb, buildFaqPage, buildHowTo, buildSpeakable, buildVideoObject, schemaForAnswerBlock, extractNap, buildLocalBusiness, localSchemaForSite, localReadiness };
export default { generatePageSchema, validateSchema, buildHowTo, buildSpeakable, buildVideoObject, schemaForAnswerBlock, extractNap, buildLocalBusiness, localSchemaForSite, localReadiness };
