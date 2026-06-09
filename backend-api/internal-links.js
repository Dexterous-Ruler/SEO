// ===========================================================================
// Internal-links engine — the brief's explicit "internal links" requirement.
// Builds a corpus of the site's real pages, fetches a source page's content,
// and asks Claude to propose contextual in-content links whose targets are
// CONSTRAINED to the real corpus (no invented URLs). Returns review-queue-ready
// suggestions: { sourcePage, anchor, targetUrl, targetTitle, reason }.
// Zero dependencies beyond the WP client + Claude helper.
// ===========================================================================
import { WordPressClient } from '../src/wp/client.js';
import { credsForSite, db } from './supabase.js';
import * as claude from './claude.js';

function stripHtml(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanTitle(t) { return (t || '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(); }

// Suggest internal links for a site. opts.maxSources caps how many source pages
// we analyze per run (cost control); opts.targetUrl analyses a single page.
export async function suggestForSite(siteId, { maxSources = 8, targetUrl = null } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });

  // 1) Build the candidate corpus from real published pages + posts.
  const [pages, posts] = await Promise.all([
    wp.list('pages', { perPage: 100, fields: 'title,link' }).catch(() => []),
    wp.list('posts', { perPage: 100, fields: 'title,link' }).catch(() => []),
  ]);
  const corpus = [...pages, ...posts]
    .map((r) => ({ title: cleanTitle(r.title?.rendered), url: r.link }))
    .filter((r) => r.title && r.url);
  if (corpus.length < 3) return { error: 'Not enough published pages to build an internal-link map.', suggestions: [] };

  // 2) Pick source pages to analyze. Default: a spread across the corpus.
  let sources = targetUrl ? corpus.filter((c) => c.url === targetUrl) : corpus;
  if (!targetUrl) {
    const stride = Math.max(1, Math.floor(sources.length / maxSources));
    sources = sources.filter((_, i) => i % stride === 0).slice(0, maxSources);
  }

  // 3) For each source, fetch content + ask Claude for constrained suggestions.
  const out = [];
  for (const src of sources) {
    let text = '';
    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
      text = stripHtml(await res.text()).slice(0, 4000);
    } catch (e) { continue; }
    // Candidates = everything except the source itself.
    const candidates = corpus.filter((c) => c.url !== src.url);
    const links = await claude.internalLinkSuggestions({
      sourceUrl: src.url, sourceTitle: src.title, sourceText: text, candidates, siteId,
    }).catch(() => []);
    for (const l of links) {
      const target = corpus.find((c) => c.url === l.targetUrl);
      out.push({ sourcePage: src.url, sourceTitle: src.title, anchor: l.anchor, targetUrl: l.targetUrl, targetTitle: target ? target.title : '', reason: l.reason });
    }
  }
  return { corpusSize: corpus.length, analyzed: sources.length, count: out.length, suggestions: out };
}

export default { suggestForSite };
