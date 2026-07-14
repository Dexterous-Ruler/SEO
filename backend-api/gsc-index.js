// ===========================================================================
// GSC Index Health — three jobs:
//   1. AUTO-INDEX   submit new/updated URLs via the Google Indexing API
//                   (programmatic, ~200/day quota — far beyond the manual
//                    "Request indexing" 10/day limit).
//   2. DE-INDEX     detect pages that are NOT indexed via the URL Inspection API
//                   (verdict / coverageState per URL).
//   3. RANK DROPS   compare query/page average position over two windows and
//                   surface what has slipped, so it can be refreshed.
//
// Uses the existing service-account auth (gsc.js). The Indexing API needs the
// SA added as an OWNER of the property + the "Indexing API" enabled in the GCP
// project; URL Inspection uses the standard Search Console API. Zero deps.
// ===========================================================================
import { getAccessToken, snapshot, daysAgo } from './gsc.js';

const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';

// ---- 1. Auto-index: notify Google of new/updated URLs ----------------------
export async function submitUrls(sa, urls, { type = 'URL_UPDATED' } = {}) {
  const token = await getAccessToken(sa, INDEXING_SCOPE);
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 200); // daily quota guard
  const results = [];
  for (const url of list) {
    try {
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) results.push({ url, ok: true, notified: data.urlNotificationMetadata?.latestUpdate?.notifyTime || true });
      else {
        const msg = data.error?.message || `HTTP ${res.status}`;
        results.push({ url, ok: false, error: msg, code: data.error?.status });
      }
    } catch (e) { results.push({ url, ok: false, error: String(e.message || e) }); }
  }
  const ok = results.filter((r) => r.ok).length;
  return { submitted: list.length, succeeded: ok, failed: list.length - ok, results };
}

// ---- 2. De-index detection: inspect index status of URLs --------------------
export async function inspectUrls(sa, property, urls) {
  const token = await getAccessToken(sa); // readonly scope is fine for inspection
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 60);
  const inspectOne = async (url) => {
    try {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { url, error: data.error?.message || `HTTP ${res.status}` };
      const r = data.inspectionResult?.indexStatusResult || {};
      const indexed = r.verdict === 'PASS' && /indexed|submitted and indexed/i.test(r.coverageState || '');
      return {
        url, verdict: r.verdict, coverageState: r.coverageState,
        indexed, lastCrawl: r.lastCrawlTime || null, robotsState: r.robotsTxtState,
        googleCanonical: r.googleCanonical, userCanonical: r.userCanonical,
      };
    } catch (e) { return { url, error: String(e.message || e) }; }
  };
  // Bounded-parallel. The URL Inspection API is slow (~1-3s/call); inspecting 40-60
  // URLs SERIALLY blew past the gateway timeout (observed: 504 at ~100s). POOL in
  // flight keeps us well under Google's per-minute quota while cutting wall-clock to
  // ~1/POOL. Order is preserved so callers can zip results back to inputs.
  const out = new Array(list.length);
  const POOL = 8;
  for (let i = 0; i < list.length; i += POOL) {
    const results = await Promise.all(list.slice(i, i + POOL).map(inspectOne));
    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
  }
  return out;
}

// Index-health sweep: inspect the site's top pages (from GSC) and flag any that
// aren't indexed. Returns { checked, indexed, notIndexed:[...], pages:[...] }.
export async function indexHealth(sa, property, { limit = 40 } = {}) {
  const snap = await snapshot(sa, property, { days: 28 });
  const pages = (snap.topPages || []).slice(0, limit).map((p) => p.page);
  if (!pages.length) return { checked: 0, indexed: 0, notIndexed: [], pages: [] };
  const inspected = await inspectUrls(sa, property, pages);
  const notIndexed = inspected.filter((r) => !r.error && !r.indexed);
  return {
    checked: inspected.length,
    indexed: inspected.filter((r) => r.indexed).length,
    notIndexed, pages: inspected,
  };
}

// ---- 3. Ranking drops: query/page position slip over two windows ------------
export async function rankingDrops(sa, property, { windowDays = 28, minImpr = 20, minDrop = 1.5 } = {}) {
  // Two trailing windows of query+page rows, compared on average position.
  const recent = await snapshot(sa, property, { days: windowDays });
  // PRIOR = the window immediately BEFORE `recent`, non-overlapping. `recent`
  // spans [daysAgo(windowDays+2) … daysAgo(2)]; prior ends the day before that
  // start (the +1 keeps them from sharing a day). Previously prior used
  // { days: windowDays*2 }, which fully CONTAINED recent and ~halved every slip.
  const prior = await snapshot(sa, property, {
    startDate: daysAgo(2 + windowDays * 2 + 1),
    endDate: daysAgo(2 + windowDays + 1),
  });
  // Build prior-window maps keyed by query and by page (prior = older half).
  const recentQ = new Map((recent.topQueries || []).map((q) => [q.query, q]));
  const priorQ = new Map((prior.topQueries || []).map((q) => [q.query, q]));
  const drops = [];
  for (const [kw, r] of recentQ) {
    const p = priorQ.get(kw);
    if (!p) continue;
    if ((r.impressions || 0) < minImpr) continue;
    const slip = (r.position || 0) - (p.position || 0); // +ve = worse (dropped down)
    if (slip >= minDrop) drops.push({ query: kw, from: Math.round(p.position * 10) / 10, to: Math.round(r.position * 10) / 10, slip: Math.round(slip * 10) / 10, clicks: r.clicks, impressions: r.impressions });
  }
  drops.sort((a, b) => b.slip - a.slip || b.impressions - a.impressions);
  return { windowDays, count: drops.length, drops: drops.slice(0, 40) };
}

export default { submitUrls, inspectUrls, indexHealth, rankingDrops };
