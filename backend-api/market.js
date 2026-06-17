// ===========================================================================
// Per-site target market. A site's `semrush_db` (the country selector already in
// the UI) is the single source of truth for which country its content, research
// and keyword data target — so go-legal.ai can be UK while goodfor.app (or any
// other project) targets the US/AU/etc. Turns a db code into everything the
// research + LLM layers need: a scope clause, a geo code, spelling/currency, and
// preferred authority domains. Defaults to the UK when unset (back-compat).
// ===========================================================================
import { countryFor } from './dataforseo.js';
import { UK } from './uk.js';

// db code → Perplexity/Tavily user_location ISO-3166 country code.
const GEO = {
  uk: 'GB', us: 'US', ca: 'CA', au: 'AU', ie: 'IE', nz: 'NZ', in: 'IN',
  ae: 'AE', za: 'ZA', sg: 'SG', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL',
  se: 'SE', no: 'NO', dk: 'DK', fi: 'FI', pl: 'PL', pt: 'PT', ch: 'CH', at: 'AT',
  tr: 'TR', br: 'BR', mx: 'MX', co: 'CO', ar: 'AR', jp: 'JP', hk: 'HK', my: 'MY',
  ph: 'PH', pk: 'PK', sa: 'SA', ng: 'NG',
};

export function marketFor(db) {
  const code = String(db || 'uk').toLowerCase();
  const c = countryFor(code);                       // {db,label,location_name,language_name,currency}
  const isEnglish = /English/i.test(c.language_name || '');
  const spelling = isEnglish ? `${c.label} English spelling` : `${c.language_name} (the market's language)`;
  return {
    db: code,
    country: c.label,
    language: c.language_name,
    currency: c.currency,
    geo: GEO[code] || 'GB',
    // Only the UK has a curated authority-domain list; other markets search broadly
    // (the scope clause + geo lock still target the right country).
    preferDomains: code === 'uk' ? UK.preferDomains : [],
    scope: `STRICT ${String(c.label).toUpperCase()} SCOPE: Target a ${c.label} audience exclusively. Write in ${spelling}. Reference ${c.label} law, regulations, institutions, agencies, prices (in ${c.currency}) and official ${c.label} sources. Exclude other-country information unless explicitly comparing to ${c.label}.`,
  };
}

export default { marketFor };
