// ===========================================================================
// Site-health / live-CMS detection.
// A connected "WordPress" site may NOT actually be served by that WordPress:
// the public domain can be on Drupal/Wix/Shopify (with a stale/parallel WP
// install still answering at /wp-json/), or the domain may be parked/for-sale.
// In those cases every WordPress write Sentinel makes (links, content refresh,
// WebP, schema, CSS) is INVISIBLE on the live site — so we must detect it and
// warn loudly instead of reporting false "applied to live" success.
//
// Detection is STRICTLY ADVISORY (labeling only): it must never delay or fail a
// write. It is therefore SSRF-guarded, hard-timeout-bounded, redirect-safe, and
// only ever asserts a non-WordPress verdict on strong positive evidence.
// Zero-dependency: one cached fetch of the page's URL + header/body fingerprint.
// ===========================================================================

// Known non-WordPress platforms we can positively identify. Only these trigger
// the "edits won't show on your live site" warning — Unknown / Blocked /
// Unreachable never do (we don't warn on uncertainty).
const NON_WP = ['Drupal', 'Wix', 'Squarespace', 'Shopify', 'Webflow', 'Joomla', 'Ghost', 'Parked'];

const _cache = new Map(); // urlKey -> { v?:result, p?:Promise, exp }

export function clearSiteHealthCache(url) {
  if (!url) { _cache.clear(); return; }
  try { const u = new URL(url); _cache.delete(u.origin + u.pathname.replace(/\/+$/, '')); } catch (e) {}
}

// SSRF guard: only public http(s). Returns the URL object, or null if unsafe.
function ssrfSafeUrl(rawUrl) {
  let u; try { u = new URL(rawUrl); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (host.includes(':')) {                                   // IPv6 literal
    if (host === '::1' || host === '::') return null;
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return null;        // fc00::/7 ULA
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return null;        // fe80::/10 link-local
    const mapped = host.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (mapped) return v4Private(mapped[1]) ? null : u;
    return u;
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return v4Private(host) ? null : u;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return null; // integer/hex IP forms
  return u;                                                   // ordinary domain name
}
function v4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Detect what actually renders a public URL (the SPECIFIC page, not just the
// origin — a Drupal marketing homepage can sit in front of WordPress on a path).
// Returns { cms, isWordPress, nonWordPress, parked, blocked, reachable, status, title }.
export async function detectLiveCms(rawUrl, { ttlMs = 30 * 60 * 1000 } = {}) {
  const u = ssrfSafeUrl(rawUrl);
  if (!u) return { cms: 'Unknown', isWordPress: false, nonWordPress: false, parked: false, reachable: false };
  const key = u.origin + u.pathname.replace(/\/+$/, '');
  const hit = _cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v !== undefined ? hit.v : hit.p; // coalesce in-flight

  const promise = (async () => {
    let res;
    try {
      res = await fetch(u.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelSEO/1.0; +health-check)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });
    } catch (e) {
      return { cms: 'Unreachable', isWordPress: false, nonWordPress: false, parked: false, reachable: false, status: 0, error: String(e && e.message || e) };
    }
    const status = res.status;
    const H = (k) => (res.headers.get(k) || '');
    // Redirects: do NOT follow (SSRF) — classify only the obvious parking case.
    if (status >= 300 && status < 400) {
      const loc = H('location').toLowerCase();
      if (/dan\.com|afternic|sedoparking|sedo\.com|bodis|parkingcrew|hugedomains|undeveloped/.test(loc)) {
        return pack('Parked', { parked: true, status });
      }
      return { cms: 'Unknown', isWordPress: false, nonWordPress: false, parked: false, reachable: true, status };
    }
    let body = '';
    try { body = (await res.text()).slice(0, 2_000_000); } catch (e) {}
    const low = body.toLowerCase();
    const server = H('server').toLowerCase();
    const metaGen = (low.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/) || [])[1] || '';
    const gen = (metaGen + ' ' + H('x-generator') + ' ' + H('x-powered-by')).toLowerCase();
    const title = ((body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();

    // Bot-wall / interstitial (e.g. Hostinger hcdn reCAPTCHA, Cloudflare challenge):
    // we got a challenge page, NOT the real site — do NOT classify or warn.
    const blocked = /just a moment\.\.\.|cf-chl|cf-mitigated|attention required|bot verification|grecaptcha|please enable (cookies|javascript) to continue/i.test(low) || server.includes('hcdn') && status === 403;
    if (blocked) return { cms: 'Blocked', isWordPress: false, nonWordPress: false, parked: false, reachable: true, status, title: title.slice(0, 90) };

    // Parked / for-sale — HIGH CONFIDENCE only (this verdict can short-circuit work).
    const parked = /\bthis domain (is|may be|name is)\b[^<]{0,40}\bfor sale\b|\bdomain (is )?(for sale|available for (sale|purchase))\b|\bbuy this domain\b|\bparked (free|by|domain)\b|sedoparking|domain for sale/i.test(low);
    if (parked) return pack('Parked', { parked: true, status, title: title.slice(0, 90) });

    // CLASSIFY by RUNTIME evidence, NOT the <meta generator> tag — that tag is
    // frequently a STALE LEFTOVER after a migration. Real example on this account:
    // go-visa.co.uk & settlement-…co.uk are WordPress+Elementor sites that STILL
    // emit `generator: Drupal 11` with ZERO Drupal runtime. So we fingerprint what
    // the page actually loads to render; the generator is only a last-resort hint.
    const wpHeader = /rel=["']https:\/\/api\.w\.org\/["']/i.test(H('link')) || !!H('x-pingback');
    const wpRuntime = wpHeader || /wp-content|wp-includes|\/wp-json|wpr-usedcss|elementor|jet-engine|jet-form|wp-block-|--wp--preset/i.test(low);
    const drupalRuntime = /drupalsettings\s*=|\/core\/misc\/drupal|data-drupal-|\/sites\/default\/files|drupal-settings-json/i.test(low);
    const wixRuntime = /static\.wixstatic\.com|x-wix-/i.test(low);
    const sqspRuntime = /static1\.squarespace\.com|squarespace-cdn/i.test(low);
    const shopifyRuntime = /cdn\.shopify\.com/i.test(low) || /shopify/i.test(server);
    const webflowRuntime = /assets\.website-files\.com/i.test(low);

    let cms = 'Unknown';
    if (wpRuntime && !drupalRuntime) cms = 'WordPress';        // WP markers, no real Drupal → WordPress (ignore a stale Drupal generator)
    else if (drupalRuntime && !wpRuntime) cms = 'Drupal';
    else if (wpRuntime && drupalRuntime) cms = /wordpress/.test(gen) ? 'WordPress' : (/drupal/.test(gen) ? 'Drupal' : 'WordPress');
    else if (wixRuntime) cms = 'Wix';
    else if (sqspRuntime) cms = 'Squarespace';
    else if (shopifyRuntime) cms = 'Shopify';
    else if (webflowRuntime) cms = 'Webflow';
    else {
      // No runtime fingerprint at all → fall back to the generator/header hint.
      if (/wordpress/.test(gen) || wpHeader) cms = 'WordPress';
      else if (/drupal/.test(gen)) cms = 'Drupal';
      else if (/wix/.test(gen)) cms = 'Wix';
      else if (/squarespace/.test(gen)) cms = 'Squarespace';
      else if (/shopify/.test(gen)) cms = 'Shopify';
      else if (/webflow/.test(gen)) cms = 'Webflow';
      else if (/joomla/.test(gen)) cms = 'Joomla';
      else if (/ghost/.test(gen)) cms = 'Ghost';
    }
    return pack(cms, { status, title: title.slice(0, 90) });

    function pack(name, extra) {
      return Object.assign({ cms: name, isWordPress: name === 'WordPress', nonWordPress: NON_WP.includes(name), parked: false, reachable: true }, extra);
    }
  })();

  _cache.set(key, { p: promise, exp: Date.now() + ttlMs });
  const v = await promise;
  // Cache failures briefly (so a blip doesn't pin a bad verdict for 30 min).
  _cache.set(key, { v, exp: Date.now() + ((v.reachable === false) ? 60000 : ttlMs) });
  return v;
}

export default { detectLiveCms, clearSiteHealthCache };
