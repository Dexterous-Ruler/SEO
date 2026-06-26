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

export { generatePageSchema, validateSchema, buildOrganization, buildLegalService, buildPerson, buildWebPage, buildArticle, buildBreadcrumb, buildFaqPage, buildHowTo, buildSpeakable, buildVideoObject };
export default { generatePageSchema, validateSchema, buildHowTo, buildSpeakable, buildVideoObject };
