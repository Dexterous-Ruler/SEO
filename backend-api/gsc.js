// ===========================================================================
// Google Search Console integration — first-party ground truth (clicks,
// impressions, CTR, position by query/page/date).
//
// AUTH: Service Account (recommended for server-side multi-site tools). The user
// creates a Google Cloud service account, enables the Search Console API, and
// adds the service account's email as a USER on each GSC property. We store the
// service-account JSON encrypted (gsc_secrets), mint a short-lived access token
// via a signed JWT (RS256, Node built-in crypto — no deps), and call the API.
//
// Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
// ===========================================================================
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Mint an OAuth access token from a service-account key via a signed JWT.
// `scope` defaults to read-only Search Console; pass the Indexing scope for the
// Indexing API.
export async function getAccessToken(sa, scope = SCOPE) {
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('Invalid service-account JSON (need client_email + private_key).');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('GSC auth failed: ' + (data.error_description || data.error || res.status));
  return data.access_token;
}

// List the GSC properties the service account can access (validates the SA).
export async function listSites(sa) {
  const token = await getAccessToken(sa);
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('GSC sites: ' + (data.error?.message || res.status));
  return (data.siteEntry || []).map((s) => ({ url: s.siteUrl, permission: s.permissionLevel }));
}

// Query Search Analytics. dimensions e.g. ['query'] or ['page'] or ['date'].
export async function query(sa, property, { startDate, endDate, dimensions = ['query'], rowLimit = 1000 } = {}) {
  const token = await getAccessToken(sa);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || res.status;
    if (/does not have sufficient permission|not found/i.test(String(msg))) {
      const e = new Error(`No access to "${property}". Add the service-account email as a user on this Search Console property.`);
      e.code = 'NO_ACCESS'; throw e;
    }
    throw new Error('GSC query: ' + msg);
  }
  return (data.rows || []).map((r) => ({
    keys: r.keys, clicks: r.clicks, impressions: r.impressions,
    ctr: r.ctr, position: r.position,
  }));
}

// Date helper: YYYY-MM-DD N days ago (UTC).
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Pull a standard snapshot: top queries + top pages + a daily time-series, for
// a trailing window. Returns normalized rows ready to upsert into gsc_daily.
export async function snapshot(sa, property, { days = 28 } = {}) {
  const startDate = daysAgo(days + 2); // GSC data lags ~2 days
  const endDate = daysAgo(2);
  const [queries, pages, byDate] = await Promise.all([
    query(sa, property, { startDate, endDate, dimensions: ['query'], rowLimit: 250 }),
    query(sa, property, { startDate, endDate, dimensions: ['page'], rowLimit: 250 }),
    query(sa, property, { startDate, endDate, dimensions: ['date'], rowLimit: 1000 }),
  ]);
  const totals = byDate.reduce((a, r) => ({
    clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
  }), { clicks: 0, impressions: 0 });
  const avgPos = queries.length ? queries.reduce((a, r) => a + r.position, 0) / queries.length : 0;
  const avgCtr = totals.impressions ? totals.clicks / totals.impressions : 0;

  return {
    property, startDate, endDate,
    totals: { clicks: totals.clicks, impressions: totals.impressions, ctr: avgCtr, avgPosition: avgPos },
    topQueries: queries.slice(0, 50).map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    topPages: pages.slice(0, 50).map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    daily: byDate.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    // striking-distance from GSC (positions 11-20, sorted by impressions = opportunity)
    striking: queries.filter((r) => r.position >= 10.5 && r.position <= 20.5)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 30)
      .map((r) => ({ query: r.keys[0], position: Math.round(r.position * 10) / 10, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr })),
  };
}

// ── Content-decay detection ────────────────────────────────────────────────
// Compares a RECENT window vs a PRIOR window of clicks PER PAGE to find
// high-value pages that are declining. Decline ranked by ABSOLUTE clicks lost
// (so the highest-value losses surface first — a 500→300 drop matters more than
// 10→2). Anchored on CLICKS, not impressions (GSC impression bug 2025–2026).
export async function contentDecay(sa, property, { windowDays = 28 } = {}) {
  // Recent window: [now-2-windowDays, now-2]. Prior: the window before that.
  const end = daysAgo(2);
  const recentStart = daysAgo(2 + windowDays);
  const priorEnd = daysAgo(2 + windowDays + 1);
  const priorStart = daysAgo(2 + windowDays * 2 + 1);

  const [recent, prior] = await Promise.all([
    query(sa, property, { startDate: recentStart, endDate: end, dimensions: ['page'], rowLimit: 500 }),
    query(sa, property, { startDate: priorStart, endDate: priorEnd, dimensions: ['page'], rowLimit: 500 }),
  ]);

  const priorMap = new Map(prior.map((r) => [r.keys[0], r]));
  const rows = [];
  for (const r of recent) {
    const page = r.keys[0];
    const p = priorMap.get(page);
    if (!p) continue;                       // new page, not a decay candidate
    const lost = p.clicks - r.clicks;       // positive = declined
    if (lost <= 0) continue;                // only declining pages
    const pctDrop = p.clicks > 0 ? lost / p.clicks : 0;
    rows.push({
      page,
      recentClicks: r.clicks, priorClicks: p.clicks,
      clicksLost: Math.round(lost), pctDrop: Math.round(pctDrop * 100),
      recentImpr: r.impressions, position: Math.round(r.position * 10) / 10,
      prevPosition: Math.round(p.position * 10) / 10,
      positionDrift: Math.round((r.position - p.position) * 10) / 10, // + = worse
    });
  }
  // Significance filter: meaningful drop on a page that had real traffic.
  const decaying = rows
    .filter((d) => d.priorClicks >= 10 && (d.pctDrop >= 20 || d.clicksLost >= 25))
    .sort((a, b) => b.clicksLost - a.clicksLost)
    .slice(0, 40);

  const totalLost = decaying.reduce((a, d) => a + d.clicksLost, 0);
  return {
    property, windowDays,
    windows: { recent: `${recentStart}→${end}`, prior: `${priorStart}→${priorEnd}` },
    count: decaying.length, totalClicksLost: totalLost,
    pages: decaying,
  };
}

export default { listSites, query, snapshot, contentDecay };
