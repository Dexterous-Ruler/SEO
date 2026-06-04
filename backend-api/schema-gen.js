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

// Assemble the full @graph for a page based on its type + site config.
//   page: { url, title, description, type:'post'|'page', datePublished, dateModified, image, lang }
//   opts: { org, baseUrl, siteName, isLegal, author, areaServed, faqs }
function generatePageSchema(page, opts = {}) {
  const { org = {}, baseUrl = '', siteName, isLegal = false, author, areaServed, faqs } = opts;
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
  return { '@context': 'https://schema.org', '@graph': graph.map(clean) };
}

export { generatePageSchema, buildOrganization, buildLegalService, buildPerson, buildWebPage, buildArticle, buildBreadcrumb, buildFaqPage };
export default { generatePageSchema };
