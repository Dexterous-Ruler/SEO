// ===========================================================================
// Stack auto-detection — reads a WordPress site (REST + rendered HTML) to
// identify WP version, theme, page builder, and the SEO/cache/image/security
// plugins, plus content scale. Degrades gracefully when something can't be read.
// Mirrors the data shape the frontend's stack panel expects.
// ===========================================================================

const UA = { 'User-Agent': 'wp-seo-agent/2.0 (stack-detect)' };
// A real browser UA for the rendered-HTML + sitemap fetches: a bot-like UA gets 403'd by
// CDN/security firewalls (Hostinger hcdn, Wordfence, Cloudflare), which blanks the page
// so EVERY plugin reads as "none" (that's why a Yoast site was detected as none). The
// signature scan needs the genuine <head>.
const BROWSER_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

// Signatures we look for in the rendered HTML / headers.
const PLUGIN_SIGNATURES = {
  seo: [
    [/rank[-_ ]?math/i, 'Rank Math'],
    [/yoast|wpseo/i, 'Yoast SEO'],
    [/all in one seo|aioseo/i, 'AIOSEO'],
    [/seopress/i, 'SEOPress'],
  ],
  cache: [
    [/wp-rocket|rocket-loader|data-rocket/i, 'WP Rocket'],
    [/litespeed/i, 'LiteSpeed Cache'],
    [/w3-total-cache|w3tc/i, 'W3 Total Cache'],
    [/wp-super-cache/i, 'WP Super Cache'],
    [/wp-fastest-cache/i, 'WP Fastest Cache'],
  ],
  image: [
    [/shortpixel/i, 'ShortPixel'],
    [/imagify/i, 'Imagify'],
    [/ewww/i, 'EWWW'],
    [/smush/i, 'Smush'],
  ],
  security: [
    [/wordfence/i, 'Wordfence'],
    [/malcare/i, 'MalCare'],
    [/sucuri/i, 'Sucuri'],
    [/ithemes-security|solid-security/i, 'Solid Security'],
  ],
  builder: [
    [/elementor/i, 'Elementor'],
    [/wp-block-|gutenberg/i, 'Gutenberg'],
    [/fl-builder|beaver/i, 'Beaver Builder'],
    [/divi|et-/i, 'Divi'],
    [/brizy/i, 'Brizy'],
  ],
};

function firstMatch(table, html, headers) {
  const hay = html + ' ' + headers;
  for (const [re, name] of table) if (re.test(hay)) return name;
  return null;
}

// Pull a plugin version where it's cheaply visible (e.g. ?ver= on asset URLs).
// Only accept plausible semver-ish versions (x.y / x.y.z), not cache-buster
// timestamps (10-digit epochs) which also appear after ?ver=.
function versionNear(html, name) {
  const slug = name.toLowerCase().split(' ')[0];
  const re = new RegExp(slug + '[^"\']*?ver=([\\d.]+)', 'i');
  const m = html.match(re);
  if (!m) return null;
  const v = m[1];
  // Reject epoch timestamps / bare long integers; want dotted versions <= 4 digits each.
  if (/^\d{7,}$/.test(v)) return null;
  if (!/^\d{1,4}(\.\d{1,4}){1,3}$/.test(v)) return null;
  return v;
}

async function restCount(wp, api, type) {
  // Prefer the AUTHENTICATED client: REST-gated sites (security plugin or CDN
  // bot-wall) return 401/403 to anonymous callers, so a bare fetch reports 0
  // even when the content exists. `raw:true` hands back the response so we can
  // read x-wp-total (same pattern WordPressClient.list uses).
  try {
    const res = await wp.request(`/${type}?per_page=1`, { raw: true });
    return Number(res.headers.get('x-wp-total') || 0);
  } catch { /* no creds / blocked / offline — fall back to anonymous below */ }
  try {
    const res = await fetch(`${api}/wp/v2/${type}?per_page=1`, { headers: UA });
    return Number(res.headers.get('x-wp-total') || 0);
  } catch { return 0; }
}

export async function detectStack(wp, baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  const api = `${base}/wp-json`;

  // 1) Rendered homepage HTML (richest signal for plugins/theme/builder)
  let html = '', headerStr = '';
  try {
    const res = await fetch(base + '/', { headers: BROWSER_UA, redirect: 'follow' });
    html = await res.text();
    headerStr = [...res.headers.entries()].map(([k, v]) => `${k}:${v}`).join(' ');
  } catch { /* offline / blocked */ }

  // 2) WordPress core version + generator
  let wpVersion = null;
  const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s*([\d.]+)/i);
  if (gen) wpVersion = gen[1];

  // 3) Active theme (from stylesheet path /themes/<slug>/)
  let theme = null, childTheme = null;
  const themeMatches = [...html.matchAll(/\/wp-content\/themes\/([a-z0-9\-]+)\//gi)].map((m) => m[1]);
  if (themeMatches.length) {
    const uniq = [...new Set(themeMatches)];
    // child themes usually contain "child"; parent is the other
    childTheme = uniq.find((t) => /child/i.test(t)) || null;
    theme = childTheme || uniq[0];
  }

  // 4) Plugins by signature
  const seo = firstMatch(PLUGIN_SIGNATURES.seo, html, headerStr);
  const cache = firstMatch(PLUGIN_SIGNATURES.cache, html, headerStr);
  const image = firstMatch(PLUGIN_SIGNATURES.image, html, headerStr);
  const security = firstMatch(PLUGIN_SIGNATURES.security, html, headerStr);
  const builder = firstMatch(PLUGIN_SIGNATURES.builder, html, headerStr);

  // 5) Other notable plugins (cheap scan of /wp-content/plugins/<slug>/)
  const pluginSlugs = [...new Set([...html.matchAll(/\/wp-content\/plugins\/([a-z0-9\-]+)\//gi)].map((m) => m[1]))];
  const known = new Set(['elementor', 'elementor-pro', 'wordpress-seo', 'seo-by-rank-math', 'wp-rocket', 'shortpixel-image-optimiser', 'wordfence', 'malcare-security']);
  const prettyOther = pluginSlugs
    .filter((s) => !known.has(s))
    .map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 6);

  // 6) Scale via REST (authenticated client gives accurate counts)
  let posts = 0, pages = 0, media = 0, sitemap = 0;
  try { posts = await restCount(wp, api, 'posts'); } catch {}
  try { pages = await restCount(wp, api, 'pages'); } catch {}
  try { media = await restCount(wp, api, 'media'); } catch {}
  // Sitemap index lists child sitemaps; sum their URL counts for the real total.
  try {
    const sm = await fetch(base + '/sitemap_index.xml', { headers: BROWSER_UA });
    if (sm.ok) {
      const xml = await sm.text();
      const childSitemaps = [...xml.matchAll(/<loc>\s*([^<\s]+\.xml[^<\s]*)\s*<\/loc>/gi)].map((m) => m[1]);
      if (childSitemaps.length) {
        // Sum URLs across child sitemaps (cap to stay polite).
        for (const cs of childSitemaps.slice(0, 30)) {
          try {
            const r = await fetch(cs, { headers: BROWSER_UA });
            if (r.ok) sitemap += ((await r.text()).match(/<loc>/g) || []).length;
          } catch {}
        }
      } else {
        sitemap = (xml.match(/<loc>/g) || []).length;
      }
    }
  } catch {}

  // 7) Companion mu-plugin presence (selftest route)
  let muPlugin = false, selftest = 'missing', rankMathHeadless = false;
  try {
    const st = await wp.selftest();
    muPlugin = !!(st && st.ok);
    selftest = (st && st.ok) ? 'ready' : 'partial';
  } catch { /* not installed */ }
  try {
    const rm = await fetch(`${api}/rankmath/v1/getHead?url=${encodeURIComponent(base + '/')}`, { headers: UA });
    rankMathHeadless = rm.ok;
  } catch {}

  return {
    stack: {
      wp: wpVersion || 'unknown',
      theme: theme || 'unknown',
      childTheme,
      builder: builder ? `${builder}${versionNear(html, builder) ? ' ' + versionNear(html, builder) : ''}` : 'Classic',
      seo: seo || 'none',
      cache: cache || 'none',
      image: image || 'none',
      security: security || 'none',
      other: prettyOther,
    },
    scale: { posts, pages, media, sitemap },
    muPlugin,
    selftest,
    rankMathHeadless,
    // Capability pre-selection based on detection
    caps: {
      lighthouse: true,
      seo: true,
      perf: true,
      image: image !== null,
      geo: true,
      a11y: true,
    },
  };
}

export default { detectStack };
