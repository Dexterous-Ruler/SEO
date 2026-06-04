import { config } from '../config.js';

// Rank Math integration.
// READ: Rank Math exposes the rendered <head> as JSON via its Headless CMS
//   Support endpoint: GET /wp-json/rankmath/v1/getHead?url=<FULL_URL>
//   (enable "Headless CMS Support" in Rank Math → Dashboard). There is NO
//   per-field read — we parse the blob.
// WRITE: Rank Math has NO write API. We write its real meta keys via /wp/v2,
//   which only stick because the seo-agent-meta mu-plugin registers them.
//   Keys: rank_math_title, rank_math_description, rank_math_focus_keyword,
//         rank_math_canonical_url, rank_math_robots.

export const RANK_MATH_KEYS = [
  'rank_math_title',
  'rank_math_description',
  'rank_math_focus_keyword',
  'rank_math_canonical_url',
  'rank_math_robots',
];

// Fetch + parse the Rank Math <head> blob for a URL.
export async function getHead(url, { baseUrl } = {}) {
  const base = (baseUrl || config.wp.baseUrl).replace(/\/$/, '');
  const endpoint = `${base}/wp-json/rankmath/v1/getHead?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, { headers: { 'User-Agent': agentUA() } });
  if (!res.ok) {
    throw new Error(`Rank Math getHead ${res.status} — is "Headless CMS Support" enabled? (${endpoint})`);
  }
  const data = await res.json().catch(() => ({}));
  const html = data.head || data.html || (typeof data === 'string' ? data : '');
  return { raw: html, parsed: parseHead(html) };
}

// Pull the SEO-relevant fields out of the rendered <head> blob.
export function parseHead(html = '') {
  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
  const all = (re) => { const out = []; let m; while ((m = re.exec(html))) out.push(m[1]); return out; };
  return {
    title: pick(/<title[^>]*>([^<]*)<\/title>/i),
    description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    canonical: pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    robots: pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    ogTitle: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogImage: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
    schemaTypes: all(/"@type"\s*:\s*"([^"]+)"/g),
    hasSchema: /application\/ld\+json/i.test(html),
  };
}

// A stable, identifiable user-agent so MalCare can allowlist the agent.
export function agentUA() {
  return 'wp-seo-agent/2.0 (+go-legal.ai SEO bot; contact: admin)';
}

export default { getHead, parseHead, RANK_MATH_KEYS, agentUA };
