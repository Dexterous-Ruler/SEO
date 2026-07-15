// ===========================================================================
// Audit pipeline — turns a real PSI + SEO read of a page into the FINDINGS and
// PROPOSALS shapes the Sentinel UI consumes. Read-only; proposals are drafts
// the human approves before any write.
// ===========================================================================
import { runPsiDetailed } from '../src/lib/psi.js';
import { parseHead } from '../src/wp/rankmath.js';
import { auditHtml } from '../src/phases/04-seo.js';
import * as claude from './claude.js';

// Map a Lighthouse audit id → discipline + human channel.
const A11Y_IDS = new Set(['color-contrast', 'image-alt', 'link-name', 'label', 'target-size', 'landmark-one-main', 'skip-link', 'aria-prohibited-attr', 'heading-order', 'html-has-lang', 'button-name', 'document-title', 'aria-required-attr', 'aria-valid-attr-value', 'duplicate-id-aria', 'list', 'tabindex', 'focusable-controls', 'interactive-element-affordance']);
const IMG_IDS = new Set(['modern-image-formats', 'uses-optimized-images', 'uses-responsive-images', 'offscreen-images', 'image-aspect-ratio', 'image-size-responsive', 'efficient-animated-content']);
const SEO_IDS = new Set(['link-text', 'crawlable-anchors', 'meta-description', 'document-title', 'http-status-code', 'is-crawlable', 'robots-txt', 'hreflang', 'canonical', 'structured-data', 'image-alt']);
// Everything else Lighthouse flags under perf/best-practices that's about speed/bytes/main-thread → performance.
const PERF_HINTS = /(server-response|render-block|unused-|unminified|byte-weight|dom-size|cache-ttl|text-compression|legacy-javascript|reflow|speed-index|lcp|fcp|tbt|interactive|mainthread|bootup|network|critical-request|third-party|redirects|preload|font-display)/i;

function discFor(id) {
  if (IMG_IDS.has(id)) return 'image';
  if (A11Y_IDS.has(id)) return 'accessibility';
  if (SEO_IDS.has(id)) return 'seo';
  if (PERF_HINTS.test(id)) return 'performance';
  return 'performance'; // default unknown lab audits to performance, not seo
}

// Known fix recipes: a failing audit id → a concrete, carry-out-able proposal.
// REST metadata writes (Rank Math keys) or child-theme patches in deploy/child-theme/.
export const RECIPES = {
  'color-contrast': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Fix low-contrast text (WCAG 1.4.3)', impact: '+A11y', target: 'staging', field: 'child-theme · seo-agent-a11y.css', before: 'Brand greys at 2.2–2.6:1', after: 'Darkened to ≥4.5:1 (hue preserved)' },
  'target-size': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Enlarge small touch targets (WCAG 2.5.8)', impact: '+A11y', target: 'staging', field: 'child-theme · CSS', before: 'Footer links 22.4px tall', after: 'min-height 24px' },
  'skip-link': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Add focusable skip link', impact: '+A11y', target: 'staging', field: 'child-theme · functions.php', before: 'No skip link', after: 'Skip-to-content link (focus-visible)' },
  'landmark-one-main': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Add <main> landmark', impact: '+A11y', target: 'staging', field: 'child-theme · functions.php', before: 'No main landmark', after: 'role="main" on content container' },
  'label': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Label the search input', impact: '+A11y', target: 'staging', field: 'child-theme · functions.php', before: 'Unlabeled <input id="search">', after: 'aria-label="Search"' },
  'aria-prohibited-attr': { disc: 'accessibility', risk: 'low', channel: 'theme/css', title: 'Fix Elementor tab ARIA roles', impact: '+A11y', target: 'staging', field: 'child-theme · seo-agent-a11y.js', before: 'aria-label on role-less div', after: 'role="tablist" added' },
  'link-name': { disc: 'seo', risk: 'low', channel: 'theme/css', title: 'Name the popup links (a11y + SEO)', impact: '+A11y +SEO', target: 'staging', field: 'child-theme · seo-agent-a11y.js', before: 'Links with no accessible text', after: 'Descriptive aria-label injected' },
  'link-text': { disc: 'seo', risk: 'low', channel: 'theme/css', title: 'Add descriptive link text', impact: '+SEO', target: 'staging', field: 'theme · link text', before: 'Non-descriptive anchors', after: 'Descriptive, crawlable text' },
  'image-alt': { disc: 'accessibility', risk: 'low', channel: 'rest-write', title: 'Generate alt text for images', impact: '+A11y +SEO', target: 'staging', field: 'media alt', before: '(empty alt)', after: 'AI-drafted, human-reviewable alt text' },
};

// Stable, content-derived key for a finding (and the proposal that fixes it), so
// a resolution SURVIVES re-audits. The sequential `f${i}` id changes every run;
// this — Lighthouse audit-id / metadata-field / title-slug + page — does not.
// Used to cross off already-actioned findings instead of re-suggesting them (#3).
export function findingKey({ auditId, field, title, page } = {}) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const what = auditId || field || slug(title) || 'misc';
  return what + '::' + (page || '/');
}
function keyForFinding(finding) {
  return finding.key || findingKey({ auditId: finding._auditId, field: finding._field || finding.field, title: finding.title, page: finding.page });
}

// Build a single proposal from one finding (used by the "Propose fix" button).
// Falls back to a generic manual proposal when there's no specific recipe.
export function proposeFromFinding(finding) {
  const id = finding._auditId || finding.id;
  const recipe = RECIPES[id] || RECIPES[finding.field];
  const fk = keyForFinding(finding);
  if (recipe) {
    return { findingId: fk, status: 'proposed', page: finding.page || '/', ...recipe };
  }
  // Generic fallback — surfaces as a manual proposal for human handling.
  return {
    findingId: fk, status: 'proposed', page: finding.page || '/',
    disc: finding.disc || 'performance', risk: 'medium',
    channel: finding.channel || 'manual',
    title: 'Fix: ' + finding.title, impact: '+' + (finding.gapPts || 3) + ' pts',
    target: 'staging', field: finding.channel === 'rest-write' ? 'metadata' : 'manual review',
    before: finding.detail || finding.title, after: 'Agent-drafted fix (review before apply)',
  };
}
function channelFor(disc) {
  if (disc === 'seo') return 'rest-write';
  if (disc === 'image') return 'rest-write';
  if (disc === 'accessibility') return 'theme/css';
  return 'theme/css';
}
function impactFor(score, savingsMs) {
  if (savingsMs > 1000 || score === 0) return 'high';
  if (savingsMs > 300 || score < 0.5) return 'medium';
  return 'low';
}

// Map a logical SEO field → the post-meta key that the site's DETECTED SEO plugin
// actually reads & renders. Writing the wrong key "verifies" (the meta sticks) but
// never appears in <head> — the silent #5 trap on no-SEO-plugin sites.
//  • Rank Math → its own keys (registered + rendered by the meta bridge plugin).
//  • Everything else (Yoast/SEOPress/AIOSEO/none/unknown) → Sentinel-owned keys,
//    which the seo-agent-optimize mu-plugin renders: injected directly on no-SEO-plugin
//    sites, or (v1.17.0+) bridged INTO Yoast/SEOPress/AIOSEO's own <head> output via
//    their filters — so the applied value actually appears without duplicating a tag.
export function metaFieldMap(seoPlugin) {
  const p = String(seoPlugin || '').toLowerCase();
  if (/rank.?math/.test(p)) {
    return { title: 'rank_math_title', meta_description: 'rank_math_description', canonical: 'rank_math_canonical_url' };
  }
  return { title: '_seoagent_meta_title', meta_description: '_seoagent_meta_description', canonical: '_seoagent_canonical' };
}

// Build findings + draft proposals for one URL.
export async function auditPage(url, { creds, withContent = false, siteId = null, seoPlugin = null } = {}) {
  // 1) Detailed PSI across all four categories
  const psi = await runPsiDetailed(url, {
    strategy: 'mobile',
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
    key: process.env.PSI_KEY,
  });

  // 2) On-page SEO read (HTML) for metadata-level findings + writable proposals
  let seoFindings = [], seoProposals = [], head = {}, html = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
    html = await res.text();
    head = parseHead(html);
    const a = auditHtml(url, html);
    seoFindings = a.findings;
    seoProposals = a.proposals;
  } catch (e) { /* page fetch failed; PSI still gives findings */ }

  const path = new URL(url).pathname || '/';
  const findings = [];
  let fi = 0;

  // From PSI failing audits → findings
  for (const f of psi.failing || []) {
    const disc = discFor(f.id);
    const savingsMs = 0;
    findings.push({
      id: `f${++fi}`,
      key: findingKey({ auditId: f.id, page: path }),
      disc,
      title: f.title,
      page: path,
      impact: impactFor(f.score, savingsMs),
      traffic: '—',
      gapPts: Math.max(1, Math.round((1 - (f.score ?? 0)) * 10)),
      channel: channelFor(disc),
      detail: f.displayValue ? `${f.title} — ${f.displayValue}` : f.title,
      _auditId: f.id,
    });
  }

  // From SEO read → findings (metadata level, with writable proposals)
  for (const p of seoProposals) {
    findings.push({
      id: `f${++fi}`,
      key: findingKey({ field: p.field, page: path }),
      disc: 'seo',
      title: p.title,
      page: path,
      impact: 'medium',
      traffic: '—',
      gapPts: 4,
      channel: 'rest-write',
      detail: p.detail || p.title,
      _field: p.field,
      _value: p.value || null,
    });
  }

  // From SEO read → proposal-LESS findings. auditHtml computes several metadata
  // issues that carry NO auto-fix proposal (noindex, over-/under-length meta
  // description, multiple <h1>, incomplete Open Graph, missing Twitter card).
  // Without this loop they were silently discarded — the audit under-reported
  // real SEO problems. A finding is already surfaced iff auditHtml emitted a
  // proposal for the SAME field (proposal + finding fire in the same branch), so
  // we skip those and add only the finding-only issues, de-duped by findingKey.
  const SEV_IMPACT = { high: 'high', med: 'medium', low: 'low' };
  const proposalFields = new Set(seoProposals.map((p) => p.field));
  const fieldForIssue = (issue) => {
    const s = String(issue || '').toLowerCase();
    if (s.includes('<title>') || s.startsWith('title length')) return 'title';
    if (s.includes('meta description') || s.startsWith('description length')) return 'meta_description';
    if (s.includes('canonical')) return 'canonical';
    if (s.includes('h1')) return 'h1';
    if (s.includes('alt text')) return 'img_alt';
    if (s.includes('json-ld') || s.includes('structured data') || s.includes('schema')) return 'schema';
    return null;   // noindex / Open Graph / Twitter card → never carry a proposal
  };
  const seenSeoKeys = new Set(findings.map((f) => f.key));
  for (const sf of seoFindings) {
    const field = fieldForIssue(sf.issue);
    if (field && proposalFields.has(field)) continue;   // already surfaced via its proposal
    const key = findingKey({ title: sf.issue, page: path });
    if (seenSeoKeys.has(key)) continue;
    seenSeoKeys.add(key);
    findings.push({
      id: `f${++fi}`,
      key,
      disc: 'seo',
      title: sf.issue,
      page: path,
      impact: SEV_IMPACT[sf.severity] || 'low',
      traffic: '—',
      gapPts: sf.severity === 'high' ? 8 : (sf.severity === 'low' ? 2 : 4),
      channel: 'manual',
      detail: sf.value ? `${sf.issue} — ${sf.value}` : sf.issue,
    });
  }

  // Known fix recipes live at module scope (RECIPES) so /propose-fix can reuse them.
  const FIX_RECIPES = RECIPES;

  const proposals = [];
  let pi = 0;
  const proposedIds = new Set();

  // 1) From PSI failing audits that have a known fix recipe
  for (const f of psi.failing || []) {
    const recipe = FIX_RECIPES[f.id];
    if (!recipe || proposedIds.has(f.id)) continue;
    proposedIds.add(f.id);
    proposals.push({ id: `p${++pi}`, findingId: findingKey({ auditId: f.id, page: path }), status: 'proposed', page: path, ...recipe });
  }

  // 2) From SEO metadata reads with a concrete writable value.
  //    When opts.withContent, ask Claude to draft the real "after" value now
  //    (meta description / tightened title) so the proposal is approve-ready.
  const headings = [...(html6(html) || [])];
  const fieldMap = metaFieldMap(seoPlugin);
  for (const p of seoProposals) {
    const rmField = fieldMap[p.field];
    if (!rmField) continue;
    let after = p.value || '(generated on approval)';
    if (withContent) {
      try {
        if (p.field === 'meta_description') {
          after = await claude.metaDescription({ url, title: head.title, headings, excerpt: textExcerpt(html), siteId });
        } else if (p.field === 'title' && head.title) {
          after = await claude.titleRewrite({ url, currentTitle: head.title, siteId });
        }
      } catch (e) { /* keep placeholder on Claude error */ }
    }
    proposals.push({
      id: `p${++pi}`, findingId: findingKey({ field: p.field, page: path }), disc: 'seo', risk: 'low', channel: 'rest-write',
      title: p.title, page: path, impact: '+SEO', target: 'staging', field: rmField,
      before: head[p.field === 'meta_description' ? 'description' : p.field] || '(empty)',
      after, status: 'proposed',
    });
  }

  return {
    url,
    scores: psi.allScores || null,
    cwv: psi.metrics,
    findings,
    proposals,
    aiGenerated: !!withContent,
  };
}

// Pull H1-H3 text from raw HTML (context for Claude).
function html6(html) {
  const out = [];
  const re = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  let m; while ((m = re.exec(html)) && out.length < 8) out.push(m[1].replace(/<[^>]+>/g, '').trim());
  return out.filter(Boolean);
}
// First chunk of visible text for excerpt context.
function textExcerpt(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 600);
}

export default { auditPage };
