// consent-adapters.js — map known Consent Management Platforms (CMPs) to the cookie
// the UX beacon gates on once a visitor accepts the statistics/analytics category.
//
// Detection is by WordPress plugin slug (the folder name from /wp/v2/plugins). The
// beacon's consentPresent() matches:
//   - exact  : cookie value === `value`            (e.g. Complianz cmplz_statistics=allow)
//   - contains: cookie value includes `contains`   (for CMPs that pack every category
//               into one compound cookie — value is URL-decoded before the check)
//   - any    : neither set → any non-empty value of that cookie counts as consent
//
// `review:true` marks adapters whose cookie/signal varies by config and should be
// verified on the actual site before relying on it.

export const CONSENT_ADAPTERS = [
  { slug: 'complianz-gdpr',         name: 'Complianz',          cookie: 'cmplz_statistics',      value: 'allow' },
  { slug: 'cookie-law-info',        name: 'CookieYes',          cookie: 'cookieyes-consent',     contains: 'analytics:yes' },
  { slug: 'cookiebot',              name: 'Cookiebot',          cookie: 'CookieConsent',         contains: 'statistics:true' },
  { slug: 'cookie-notice',          name: 'Cookie Notice',      cookie: 'cookie_notice_accepted', value: 'true' },
  { slug: 'borlabs-cookie',         name: 'Borlabs Cookie',     cookie: 'borlabs-cookie',        contains: 'statistics', review: true },
  { slug: 'gdpr-cookie-compliance', name: 'Moove GDPR',         cookie: 'moove_gdpr_popup',      contains: '"thirdparty":"1"', review: true },
  { slug: 'real-cookie-banner',     name: 'Real Cookie Banner', cookie: 'real_cookie_banner',    review: true },
];

// Behaviour/analytics trackers that MUST be consent-gated, keyed by plugin slug. Used to
// flag what each site needs blocked before consent (and to drive a Script-Center block rule).
export const KNOWN_TRACKERS = [
  { slug: 'hotjar',                          name: 'Hotjar',                match: 'hotjar' },
  { slug: 'microsoft-clarity',               name: 'Microsoft Clarity',     match: 'clarity.ms' },
  { slug: 'google-analytics-for-wordpress',  name: 'MonsterInsights (GA)',  match: 'googletagmanager' },
  { slug: 'ga-google-analytics',             name: 'GA Google Analytics',   match: 'googletagmanager' },
  { slug: 'google-site-kit',                 name: 'Site Kit (GA4)',        match: 'googletagmanager' },
  { slug: 'official-facebook-pixel',         name: 'Meta Pixel',            match: 'connect.facebook' },
  { slug: 'pixelyoursite',                   name: 'PixelYourSite',         match: 'connect.facebook' },
];

// Match a plugin slug loosely: exact, or folder-prefixed (slug/file.php → slug).
function hasSlug(slugs, needle) {
  return slugs.some((s) => s === needle || s === needle + '-pro' || s.startsWith(needle + '/') || s.startsWith(needle + '-'));
}

// Given the active plugin slugs of a site, return the consent adapter (or null) and the
// list of trackers present that need a consent gate.
export function detectConsent(activeSlugs) {
  const slugs = (activeSlugs || []).map((s) => String(s).toLowerCase());
  const cmp = CONSENT_ADAPTERS.find((a) => hasSlug(slugs, a.slug)) || null;
  const trackers = KNOWN_TRACKERS.filter((t) => hasSlug(slugs, t.slug));
  return { cmp, trackers };
}

// The consent config to hand /arm-beacon (and thus the beacon) for a detected CMP.
export function consentConfigFor(cmp) {
  if (!cmp) return null;
  const c = { mode: 'required', cookie: cmp.cookie };
  if (cmp.contains) c.contains = cmp.contains;
  else if (cmp.value) c.value = cmp.value;
  return c;
}

export default { CONSENT_ADAPTERS, KNOWN_TRACKERS, detectConsent, consentConfigFor };
