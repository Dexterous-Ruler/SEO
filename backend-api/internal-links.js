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
import { detectLiveCms } from './site-health.js';

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
  // Is `anchor` insertable into one of these (normalized) units? FAITHFUL to the
  // plugin inserter's seoagent_anchor_regex: a whole-word/boundary match
  // (non-letter/digit on both sides), spaces flexible — NOT a loose substring.
  // (A loose .includes() passed anchors the inserter then can't place.)
  function insertableIn(anchor, normUnits) {
    const a = norm(anchor);
    if (!a || a.length < 2) return false;
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    let re;
    try { re = new RegExp('(^|[^\\p{L}\\p{N}])(' + esc + ')(?![\\p{L}\\p{N}])', 'iu'); }
    catch (e) { re = new RegExp('(^|[^A-Za-z0-9])(' + esc + ')(?![A-Za-z0-9])', 'i'); }
    return normUnits.some((u) => re.test(u));
  }
  // Get the page's editable content as { text (for Claude grounding), units (the
  // individual linkable segments) }. An anchor is only insertable if it fits inside
  // ONE unit — matching the inserter's per-field/per-segment granularity exactly.
  async function editable(src) {
    if (src.id) {
      try {
        const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/page-text?post_id=${src.id}`);
        if (r && r.ok) {
          // Plugin installed → its units are AUTHORITATIVE: exactly the text the
          // inserter can edit. Trust them even when empty; do NOT fall back to the
          // rendered page (which would offer nav/button/menu text we can't link,
          // producing "Add in editor" anchors). Empty units → nothing linkable here.
          const units = (Array.isArray(r.units) ? r.units : (r.text ? [r.text] : [])).filter(Boolean);
          return { text: r.text || units.join(' '), units, authoritative: true };
        }
      } catch (e) {}
    }
    // Plugin absent/unreachable → best-effort from the rendered page (loose).
    try { const res = await fetch(src.url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } }); const t = stripHtml(await res.text()); return { text: t, units: t ? [t] : [], authoritative: false }; } catch (e) { return { text: '', units: [], authoritative: false }; }
  }

  // What actually renders the live site? If it's a KNOWN non-WordPress platform
  // (Drupal/Wix/…) or parked, WordPress edits won't appear live — warn. We only
  // warn on positive evidence: Unknown / Blocked / Unreachable never trigger it.
  let cms = { cms: 'Unknown', nonWordPress: false };
  try { cms = await detectLiveCms(corpus[0].url); } catch (e) {}
  const cmsMismatch = (cms && cms.nonWordPress) ? {
    cms: cms.cms, parked: !!cms.parked,
    message: cms.parked
      ? `This domain appears to be parked / for sale (“${cms.title || ''}”). There’s nothing live to optimize.`
      : `Your live site is served by ${cms.cms}, not WordPress. Sentinel edits the WordPress install, so internal links (and other on-page fixes) will NOT appear on the live ${cms.cms} pages. Point Sentinel at the CMS that actually renders the site, or apply changes there.`,
  } : null;
  // Parked domain → there's no point generating suggestions.
  if (cmsMismatch && cmsMismatch.parked) {
    return { corpusSize: corpus.length, analyzed: 0, count: 0, droppedNotOnPage: 0, skippedNoUnits: 0, liveCms: cms.cms, cmsMismatch, suggestions: [] };
  }

  const out = [];
  let dropped = 0;
  let skippedNoUnits = 0;     // pages the plugin reports as having no editable text
  for (const src of sources) {
    const { text: fullText, units, authoritative } = await editable(src);
    if (authoritative && !units.length) { skippedNoUnits++; continue; }
    if (!fullText || fullText.length < 20 || !units.length) continue;
    const normUnits = units.map(norm);
    // Candidates = everything except the source itself.
    const candidates = corpus.filter((c) => c.url !== src.url);
    const links = await claude.internalLinkSuggestions({
      sourceUrl: src.url, sourceTitle: src.title, sourceText: fullText.slice(0, 4000), candidates, siteId,
    }).catch(() => []);
    for (const l of links) {
      // CRITICAL: keep an anchor only if the inserter would actually place it —
      // a boundary match inside a SINGLE editable unit. This is what eliminates
      // "Add in editor": we never surface an anchor we can't insert.
      if (!l.anchor || !insertableIn(l.anchor, normUnits)) { dropped++; continue; }
      const target = corpus.find((c) => c.url === l.targetUrl);
      out.push({ sourcePage: src.url, sourceId: src.id, sourceType: src.type, sourceTitle: src.title, anchor: l.anchor, targetUrl: l.targetUrl, targetTitle: target ? target.title : '', reason: l.reason });
    }
  }
  return { corpusSize: corpus.length, analyzed: sources.length, count: out.length, droppedNotOnPage: dropped, skippedNoUnits, liveCms: cms.cms, cmsMismatch, suggestions: out };
}

export default { suggestForSite };
