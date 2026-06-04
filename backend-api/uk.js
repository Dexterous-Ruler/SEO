// ===========================================================================
// UK-only configuration — the platform targets the United Kingdom exclusively.
// Every data source (DataForSEO), research call (Perplexity/Tavily) and LLM
// prompt is geo-locked to the UK so we never surface or generate content for
// non-UK audiences. One source of truth, imported everywhere.
// ===========================================================================

export const UK = {
  // DataForSEO
  location_name: 'United Kingdom',
  language_name: 'English',
  language_code: 'en',
  db: 'uk',
  // Perplexity / Tavily
  country: 'GB',
  countryName: 'United Kingdom',
  locale: 'en-GB',
  // Authoritative UK domains we prefer in research (gov + established UK media).
  preferDomains: ['gov.uk', 'parliament.uk', 'ons.gov.uk', 'nhs.uk', 'bbc.co.uk', 'ico.org.uk'],
};

// The audience clause appended to every LLM/research prompt so outputs stay UK.
export const UK_PROMPT = `STRICT UK SCOPE: Target a United Kingdom audience exclusively. Use UK English spelling (e.g. "organise", "centre", "£"). Reference only UK law, regulations, institutions, agencies, prices (in GBP) and sources. Ignore and exclude any US/EU/other-country information unless explicitly comparing to the UK. Prefer official UK sources (gov.uk and similar).`;

// Force any region argument to UK — used to hard-lock data sources.
export function ukDb() { return 'uk'; }

export default { UK, UK_PROMPT, ukDb };
