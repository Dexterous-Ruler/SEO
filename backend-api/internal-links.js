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
    wp.list('pages', { perPage: 100, fields: 'id,title,link' }).catch(() => []),
    wp.list('posts', { perPage: 100, fields: 'id,title,link' }).catch(() => []),
  ]);
  const corpus = [
    ...(Array.isArray(pages) ? pages : []).map((r) => ({ id: r.id, type: 'pages', title: cleanTitle(r.title?.rendered), url: r.link })),
    ...(Array.isArray(posts) ? posts : []).map((r) => ({ id: r.id, type: 'posts', title: cleanTitle(r.title?.rendered), url: r.link })),
  ].filter((r) => r.title && r.url);
  if (corpus.length < 3) return { error: 'Not enough published pages to build an internal-link map.', suggestions: [] };

  // 2) Pick source pages to analyze. Default: a spread across the corpus.
  let sources = targetUrl ? corpus.filter((c) => c.url === targetUrl) : corpus;
  if (!targetUrl) {
    const stride = Math.max(1, Math.floor(sources.length / maxSources));
    sources = sources.filter((_, i) => i % stride === 0).slice(0, maxSources);
  }

  // 3) For each source, get its EDITABLE text (post body + Elementor widgets via
  // the plugin), so anchors are validated against what we can actually edit — not
  // the rendered page (which includes global nav/footer/CTA blocks we can't touch).
  // Falls back to the rendered page when the optimize plugin isn't installed.
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Get the page's editable content as { text (for Claude grounding), units (the
  // individual linkable segments) }. An anchor is only insertable if it fits inside
  // ONE unit — matching the inserter's per-field/per-segment granularity exactly.
  async function editable(src) {
    if (src.id) {
      try { const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/page-text?post_id=${src.id}`); if (r && r.ok && (Array.isArray(r.units) || typeof r.text === 'string')) { const units = Array.isArray(r.units) ? r.units : (r.text ? [r.text] : []); if (units.length) return { text: r.text || units.join(' '), units }; } } catch (e) {}
    }
    try { const res = await fetch(src.url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } }); const t = stripHtml(await res.text()); return { text: t, units: [t] }; } catch (e) { return { text: '', units: [] }; }
  }
  const out = [];
  let dropped = 0;
  for (const src of sources) {
    const { text: fullText, units } = await editable(src);
    if (!fullText || fullText.length < 20 || !units.length) continue;
    const normUnits = units.map(norm);
    // Candidates = everything except the source itself.
    const candidates = corpus.filter((c) => c.url !== src.url);
    const links = await claude.internalLinkSuggestions({
      sourceUrl: src.url, sourceTitle: src.title, sourceText: fullText.slice(0, 4000), candidates, siteId,
    }).catch(() => []);
    for (const l of links) {
      // CRITICAL: keep an anchor only if it fits inside a SINGLE editable unit, so
      // Approve always inserts cleanly (no "anchor not found" errors). Validating
      // against the joined text would pass anchors that span fields/tags the
      // inserter can't cross.
      if (!l.anchor || !normUnits.some((u) => u.includes(norm(l.anchor)))) { dropped++; continue; }
      const target = corpus.find((c) => c.url === l.targetUrl);
      out.push({ sourcePage: src.url, sourceId: src.id, sourceType: src.type, sourceTitle: src.title, anchor: l.anchor, targetUrl: l.targetUrl, targetTitle: target ? target.title : '', reason: l.reason });
    }
  }
  return { corpusSize: corpus.length, analyzed: sources.length, count: out.length, droppedNotOnPage: dropped, suggestions: out };
}

export default { suggestForSite };
