// ===========================================================================
// Site-health / live-CMS detection.
// A connected "WordPress" site may NOT actually be served by that WordPress:
// the public domain can be on Drupal/Wix/Shopify (with a stale/parallel WP
// install still answering at /wp-json/), or the domain may be parked/for-sale.
// In those cases every WordPress write Sentinel makes (links, content refresh,
// WebP, schema, CSS) is INVISIBLE on the live site — so we must detect it and
// warn loudly instead of reporting false "applied to live" success.
// Zero-dependency: one cached fetch of the public origin + fingerprinting.
// ===========================================================================

const _cache = new Map(); // origin -> { v, exp }

export function clearSiteHealthCache(url) {
  if (!url) { _cache.clear(); return; }
  try { _cache.delete(new URL(url).origin); } catch (e) {}
}

// Detect what actually renders a public URL's origin.
// Returns { cms, isWordPress, parked, reachable, status, title, evidence }.
export async function detectLiveCms(rawUrl, { ttlMs = 30 * 60 * 1000 } = {}) {
  let origin;
  try { origin = new URL(rawUrl).origin; } catch (e) { return { cms: 'Unknown', isWordPress: false, parked: false, reachable: false }; }
  const hit = _cache.get(origin);
  if (hit && hit.exp > Date.now()) return hit.v;

  let html = '', status = 0, xgen = '', xpow = '';
  try {
    const res = await fetch(origin, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelSEO/1.0)' }, redirect: 'follow' });
    status = res.status;
    xgen = res.headers.get('x-generator') || '';
    xpow = res.headers.get('x-powered-by') || '';
    html = (await res.text()).slice(0, 200000);
  } catch (e) {
    const v = { cms: 'Unreachable', isWordPress: false, parked: false, reachable: false, status: 0, error: e.message };
    _cache.set(origin, { v, exp: Date.now() + 60000 });
    return v;
  }

  const low = html.toLowerCase();
  const genMeta = (low.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/) || [])[1] || '';
  const gen = (genMeta + ' ' + xgen + ' ' + xpow).toLowerCase();
  const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();

  const parked = /\bdomain (is )?(for sale|available for (sale|purchase))\b|\bbuy this domain\b|\bthis domain (is|may be) for sale\b|\bparked (free|by)\b|sedoparking|dan\.com|afternic|dovendi - domain for sale/i.test(low)
    || (html.length < 16000 && /\bfor sale\b|\bcoming soon\b|\bunder construction\b/i.test(low) && !low.includes('wp-content'));

  let cms = 'Unknown';
  if (parked) cms = 'Parked';
  else if (/drupal/.test(gen) || /\/sites\/default\/files|\/core\/misc\/drupal|data-drupal-|drupal-settings-json/.test(low)) cms = 'Drupal';
  else if (/wordpress/.test(gen) || low.includes('wp-content') || low.includes('wp-json') || low.includes('wp-includes')) cms = 'WordPress';
  else if (/wix\.com|x-wix-|static\.wixstatic\.com/.test(low) || /wix/.test(gen)) cms = 'Wix';
  else if (/squarespace/.test(gen) || /static1\.squarespace\.com|squarespace\.com/.test(low)) cms = 'Squarespace';
  else if (/shopify/.test(gen) || /cdn\.shopify\.com|x-shopify/.test(low)) cms = 'Shopify';
  else if (/webflow/.test(gen) || /assets\.website-files\.com|wf-/.test(low)) cms = 'Webflow';
  else if (/joomla/.test(gen)) cms = 'Joomla';
  else if (/ghost/.test(gen) || /content\/images\/.*ghost/.test(low)) cms = 'Ghost';

  const v = {
    cms, isWordPress: cms === 'WordPress', parked: cms === 'Parked',
    reachable: status > 0 && status < 500, status, title: title.slice(0, 90),
  };
  _cache.set(origin, { v, exp: Date.now() + ttlMs });
  return v;
}

export default { detectLiveCms, clearSiteHealthCache };
