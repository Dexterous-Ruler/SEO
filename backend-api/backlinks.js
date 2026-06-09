// ===========================================================================
// Link Engine — Phase 1 (read-only intelligence) + outreach drafting.
// Orchestrates the DataForSEO Backlinks API into:
//   • profile()   — the site's backlink-authority overview + anchor health
//   • linkGap()   — Competitor Link Gap (flagship): domains linking to rivals
//                   but not to you, scored by a deterministic Link Value Score
//   • draftOutreach() — a Claude-written, personalised pitch for one prospect
// Acquisition (the actual send) stays a human-approved action via Airtable+n8n.
// ===========================================================================
import { db } from './supabase.js';
import * as dfs from './dataforseo.js';
import * as claude from './claude.js';

// Link Value Score (deterministic; Claude only labels elsewhere). 0–100.
//   authority  = referring-domain rank / 1000
//   reach      = how many of your competitors it links to (normalised)
//   spamPen    = penalty for high spam score
// Prospects below a quality floor are auto-rejected (rejected:true).
export function linkValueScore({ rank = 0, competitorsLinked = 1, totalCompetitors = 1, spamScore = 0 }) {
  const authority = Math.max(0, Math.min(1, (rank || 0) / 1000));
  const reach = Math.max(0, Math.min(1, competitorsLinked / Math.max(1, totalCompetitors)));
  const spamPen = spamScore > 40 ? 0.2 : spamScore > 25 ? 0.5 : spamScore > 12 ? 0.8 : 1;
  const score = Math.round((authority * 0.62 + reach * 0.38) * 100 * spamPen);
  const rejected = (rank || 0) < 40 || (spamScore || 0) > 55;
  return { score, rejected, authority: Math.round(authority * 100), reach: Math.round(reach * 100), spamPen };
}

// The site's backlink profile + a simple anchor over-optimisation flag.
export async function profile(siteId) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  const summary = await dfs.backlinksSummary(site.url);
  if (!summary) return { error: 'No backlink data returned for ' + site.url + '.' };
  let anchors = [];
  try { anchors = await dfs.backlinkAnchors(site.url, { limit: 25 }); } catch (e) {}
  // exact-match / branded mix → over-optimisation signal
  const totalAnchorRD = anchors.reduce((s, a) => s + (a.referringDomains || 0), 0) || 1;
  const topAnchor = anchors[0];
  const overOptimised = topAnchor && (topAnchor.referringDomains / totalAnchorRD) > 0.4 && !/^https?:|^www\.|\.(com|co\.uk|org)/i.test(topAnchor.anchor || '');
  return {
    domain: summary.target, summary,
    anchors: anchors.slice(0, 12),
    anchorHealth: { overOptimised: !!overOptimised, topAnchor: topAnchor ? topAnchor.anchor : null, topShare: topAnchor ? Math.round((topAnchor.referringDomains / totalAnchorRD) * 100) : null },
  };
}

// Competitor Link Gap → scored, ranked prospects.
export async function linkGap(siteId, { limit = 80 } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  const competitors = (site.competitors || []).filter(Boolean);
  if (!competitors.length) return { error: 'Add competitors first (DataForSEO → Gap tab) — the link gap needs rivals to compare against.', prospects: [], needsCompetitors: true };
  const rows = await dfs.domainIntersection(site.url, competitors, { limit });
  const scored = rows.map((r) => {
    const lvs = linkValueScore({ rank: r.rank, competitorsLinked: r.competitorsLinked, totalCompetitors: competitors.length, spamScore: r.spamScore });
    return { ...r, lvs: lvs.score, rejected: lvs.rejected, authority: lvs.authority };
  }).sort((a, b) => b.lvs - a.lvs);
  const prospects = scored.filter((p) => !p.rejected);
  return {
    domain: dfs && site.url, competitors,
    total: rows.length, qualified: prospects.length,
    rejected: scored.length - prospects.length,
    prospects: prospects.slice(0, 60),
  };
}

// Draft a personalised outreach email for one prospect (Claude). Returns {subject, body}.
export async function draftOutreach(siteId, { prospectDomain, tactic = 'competitor_gap', targetPage = '' } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'No site.' };
  if (!prospectDomain) return { error: 'A prospect domain is required.' };
  return claude.outreachEmail({
    siteName: site.name, siteUrl: site.url, niche: site.niche || '',
    prospectDomain, tactic, targetPage, siteId,
  });
}

export default { profile, linkGap, draftOutreach, linkValueScore };
