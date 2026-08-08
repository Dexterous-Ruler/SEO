// ===========================================================================
// feeds.js — Content Radar's ingestion layer. Zero-dep RSS/Atom fetch + parse.
//
// Purpose in the system: Karim wants a "Google Alerts" style signal — target
// specific keywords and news outlets, and turn fresh published articles into
// content briefs. Google Alerts has no API but every alert exposes an RSS feed;
// most outlets publish RSS too; and Google News offers a free RSS search. This
// module fetches any of those, parses RSS 2.0 OR Atom (Google Alerts is Atom),
// and normalizes each entry to { title, link, summary, published, guid }.
//
// It deliberately does NOT score/store — that's the Content Engine's job. The
// radar routes hand these normalized items to content-engine as a new producer
// (source 'feeds') so they are niche-scored (geo_context) + deduped alongside
// every other opportunity, then one click drafts a brief into the Article Writer.
//
// Zero-dep, global fetch, hard AbortController timeout on every network call.
// Feed XML is well-formed enough that a tolerant regex parser beats pulling in
// an XML dependency; CDATA + the common HTML entities are handled.
// ===========================================================================

const UA = 'Mozilla/5.0 (compatible; SentinelRadar/1.0; +https://sentinel)';

// --- tiny HTML/XML entity + tag helpers ------------------------------------
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
// decode entities FIRST (so &lt;b&gt; becomes a real tag) THEN strip tags, so no
// markup leaks into the reader-facing snippet.
function stripTags(s) { return decodeEntities(String(s || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
// pull the FIRST <tag>…</tag> inner content within a block
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}

// Google Alerts (and some aggregators) wrap the real URL in a redirect:
// https://www.google.com/url?...&url=https://real... OR ...?q=https://real...
function unwrapUrl(u) {
  const s = String(u || '').trim();
  const m = s.match(/[?&](?:url|q)=(https?[^&]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return s;
}

// --- parse one feed document (RSS 2.0 <item> OR Atom <entry>) ---------------
export function parseFeed(xml) {
  const doc = String(xml || '');
  const feedTitle = stripTags(tag(doc, 'title')) || '';
  const items = [];
  const isAtom = /<entry[\s>]/i.test(doc) && !/<item[\s>]/i.test(doc);
  const blocks = doc.match(isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let link = '';
    if (isAtom) {
      // <link href="..."/> — prefer rel="alternate" / no rel
      const links = [...b.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => ({ href: m[1], rel: (m[0].match(/rel=["']([^"']+)["']/i) || [])[1] || 'alternate' }));
      link = (links.find((l) => l.rel === 'alternate') || links[0] || {}).href || '';
    } else {
      link = stripTags(tag(b, 'link')) || (b.match(/<link[^>]*>([^<]+)/i) || [])[1] || '';
    }
    link = unwrapUrl(link);
    const title = stripTags(tag(b, 'title'));
    const rawSummary = tag(b, isAtom ? 'summary' : 'description') || tag(b, 'content') || tag(b, 'content:encoded');
    const summary = stripTags(rawSummary).slice(0, 600);
    const pub = stripTags(tag(b, isAtom ? 'updated' : 'pubDate') || tag(b, 'published') || tag(b, 'dc:date'));
    let published = null;
    if (pub) { const d = new Date(pub); if (!isNaN(d.getTime())) published = d.toISOString(); }
    const guid = stripTags(tag(b, isAtom ? 'id' : 'guid')) || link || title;
    if (!title && !link) continue;
    items.push({ title, link, summary, published, guid });
  }
  return { feedTitle, items };
}

// --- fetch + parse one feed URL --------------------------------------------
export async function fetchFeed(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status}`, items: [] };
    const xml = await res.text();
    if (!/<rss|<feed|<rdf:RDF/i.test(xml)) return { error: 'Not an RSS/Atom feed (no <rss>/<feed> root). For Google Alerts, choose "Deliver to: RSS feed" and copy that URL.', items: [] };
    const { feedTitle, items } = parseFeed(xml);
    return { feedTitle, items };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'feed fetch timed out' : String((e && e.message) || e).slice(0, 120), items: [] };
  } finally { clearTimeout(t); }
}

// --- build a Google News RSS search URL (free, no key) ----------------------
// A keyword watch, optionally scoped to a domain (site:) or recency (when:7d).
export function googleNewsRss(query, { region = 'GB', lang = 'en' } = {}) {
  const q = encodeURIComponent(String(query || '').trim());
  const hl = `${lang}-${region}`;
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${region}&ceid=${region}:${lang}`;
}

// Normalize any radar source definition to a fetchable URL.
// type: 'google_alert' | 'outlet_rss' → the url IS the feed; 'google_news' → build from query.
export function sourceToUrl(src) {
  if (!src) return '';
  if (src.type === 'google_news') return googleNewsRss(src.query || src.label || '');
  return String(src.url || '').trim();
}

export default { parseFeed, fetchFeed, googleNewsRss, sourceToUrl, stripTags, unwrapUrl };
