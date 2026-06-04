import { config } from '../config.js';
import { agentUA } from '../wp/rankmath.js';

// Site crawler — discovers every URL from XML sitemaps (Rank Math generates
// them) and detects orphan pages. Sitemap-based, not a full link crawl, so it
// scales to 1,498 posts cheaply and politely.

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': agentUA() } });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.text();
}

function extractLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

// Walk a sitemap index → child sitemaps → page URLs. Caps total for safety.
export async function discoverUrls({ baseUrl, max = 5000 } = {}) {
  const base = (baseUrl || config.wp.baseUrl).replace(/\/$/, '');
  const candidates = [`${base}/sitemap_index.xml`, `${base}/sitemap.xml`];

  let indexXml = null, indexUrl = null;
  for (const c of candidates) {
    try { indexXml = await fetchText(c); indexUrl = c; break; } catch { /* try next */ }
  }
  if (!indexXml) throw new Error(`No sitemap found at ${candidates.join(' or ')}`);

  const locs = extractLocs(indexXml);
  const isIndex = /<sitemapindex/i.test(indexXml) || locs.every((l) => /\.xml($|\?)/i.test(l));

  const urls = new Set();
  if (isIndex && locs.length) {
    for (const sm of locs) {
      if (urls.size >= max) break;
      try {
        const xml = await fetchText(sm);
        for (const u of extractLocs(xml)) {
          if (!/\.xml($|\?)/i.test(u)) urls.add(u);
          if (urls.size >= max) break;
        }
      } catch { /* skip bad child sitemap */ }
    }
  } else {
    for (const u of locs) if (!/\.xml($|\?)/i.test(u)) urls.add(u);
  }

  return { indexUrl, urls: [...urls] };
}

// Orphan detection: URLs in the sitemap that no other page links to.
// Lightweight sample-based pass (fetch a subset, collect internal links).
export async function findOrphans(urls, { sampleLimit = 200 } = {}) {
  const base = config.wp.baseUrl.replace(/\/$/, '');
  const linked = new Set();
  const sample = urls.slice(0, sampleLimit);

  for (const url of sample) {
    try {
      const html = await fetchText(url);
      const re = /href=["'](https?:\/\/[^"']+|\/[^"']+)["']/gi;
      let m;
      while ((m = re.exec(html))) {
        let href = m[1];
        if (href.startsWith('/')) href = base + href;
        href = href.split('#')[0].replace(/\/$/, '');
        if (href.startsWith(base)) linked.add(href);
      }
    } catch { /* skip */ }
  }

  const orphans = urls.filter((u) => !linked.has(u.replace(/\/$/, '')));
  return { checkedLinksFrom: sample.length, orphanCount: orphans.length, orphans };
}

export default { discoverUrls, findOrphans };
