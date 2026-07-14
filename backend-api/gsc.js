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
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
// Scopes requested in the one-click OAuth consent. We request both up front so
// every feature (analytics + Indexing API) works without re-consenting.
export const OAUTH_SCOPES = [SCOPE, INDEXING_SCOPE, 'openid', 'email'];

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Interactive OAuth (3-legged) — "Connect with Google" one-click flow ─────
// The user signs in with their own Google account and grants access; we store
// the resulting refresh_token (per site) and mint short-lived access tokens from
// it. App-level client id/secret come from env. This is the recommended path for
// non-technical users (no service-account key file to create).
export function oauthConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

// Build the Google consent URL. `state` is an opaque signed token (carries the
// siteId); `redirectUri` MUST exactly match one registered on the OAuth client.
export function oauthAuthUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    access_type: 'offline',     // → returns a refresh_token
    prompt: 'consent',          // → forces a refresh_token even on re-auth
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Exchange the authorization code for tokens. Returns { refresh_token, access_token, scope, email }.
export async function oauthExchangeCode({ code, redirectUri }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google token exchange failed: ' + (data.error_description || data.error || res.status));
  if (!data.refresh_token) throw new Error('Google did not return a refresh token — revoke prior access at myaccount.google.com/permissions and reconnect.');
  let email = null;
  try { if (data.id_token) email = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64').toString()).email || null; } catch (e) {}
  return { type: 'oauth', refresh_token: data.refresh_token, scope: data.scope, email };
}

// Mint an access token from a stored refresh_token (OAuth path).
async function oauthAccessToken(creds) {
  if (!oauthConfigured()) throw new Error('Google OAuth is not configured on the server (GOOGLE_OAUTH_CLIENT_ID/SECRET).');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) { const e = new Error('Google connection expired — reconnect once on any site (it covers all your sites). Tip: if it keeps expiring weekly, your Google OAuth consent screen is in "Testing" mode (tokens die after 7 days) — set it to "In production" in Google Cloud to make it permanent.'); e.code = 'GSC_REVOKED'; throw e; }
  return data.access_token;
}

// Mint an OAuth access token. Accepts EITHER an interactive-OAuth credential
// ({ refresh_token, ... }) OR a service-account key ({ client_email, private_key }).
// All higher-level functions forward whatever credential was stored, so both auth
// methods work everywhere with no other code changes. `scope` only applies to the
// service-account path (interactive OAuth fixes scopes at consent time).
export async function getAccessToken(creds, scope = SCOPE) {
  if (creds && creds.refresh_token) return oauthAccessToken(creds);
  const sa = creds;
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('Invalid Google credential (need an OAuth refresh token or a service-account key).');
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
export function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Pull a standard snapshot: top queries + top pages + a daily time-series, for
// a trailing window. Returns normalized rows ready to upsert into gsc_daily.
export async function snapshot(sa, property, { days = 28, startDate, endDate } = {}) {
  // Explicit startDate/endDate override the default trailing window (used by
  // rankingDrops to request a non-overlapping PRIOR window). Callers that omit
  // them get the original ~2-day-lagged trailing window, unchanged.
  startDate = startDate || daysAgo(days + 2); // GSC data lags ~2 days
  endDate = endDate || daysAgo(2);
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

// ── Quick wins (snippet-steal candidates) ──────────────────────────────────
// Queries already ranking in the meaty zone (positions posMin–posMax, default
// 2–10) with real demand. These are the cheapest CTR/feature-snippet upgrades:
// the page is already there, you just need to win the snippet / sharpen intent.
// Anchored on impressions desc = biggest opportunity first.
export async function quickWins(sa, property, { days = 28, minImpressions = 30, posMin = 2, posMax = 10 } = {}) {
  const startDate = daysAgo(days + 2); // GSC data lags ~2 days
  const endDate = daysAgo(2);
  const data = await query(sa, property, { startDate, endDate, dimensions: ['query', 'page'], rowLimit: 1000 });
  const rows = data
    .filter((r) => r.position >= posMin && r.position <= posMax && r.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({
      query: r.keys[0], page: r.keys[1],
      position: Math.round(r.position * 10) / 10,
      impressions: r.impressions, clicks: r.clicks,
      ctr: Math.round(r.ctr * 10000) / 10000,
    }));
  return { rows, count: rows.length };
}

// ── Question queries (PAA / featured-snippet intent) ────────────────────────
// Queries phrased as questions are prime People-Also-Ask / featured-snippet
// targets — they signal informational intent you can answer directly on-page.
export async function questionQueries(sa, property, { days = 28, minImpressions = 10 } = {}) {
  const startDate = daysAgo(days + 2); // GSC data lags ~2 days
  const endDate = daysAgo(2);
  const data = await query(sa, property, { startDate, endDate, dimensions: ['query'], rowLimit: 1000 });
  // Question word as a whole word anywhere in the query (covers "how to ...",
  // "what is ...", "... where to apply", etc.). Word boundaries avoid matching
  // "iso" for "is" or "showld" for "should".
  const QW = /\b(who|what|why|how|when|where|which|can|do|does|is|are|should)\b/i;
  const rows = data
    .filter((r) => r.impressions >= minImpressions && QW.test(r.keys[0]))
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({
      query: r.keys[0], impressions: r.impressions, clicks: r.clicks,
      ctr: Math.round(r.ctr * 10000) / 10000,
      position: Math.round(r.position * 10) / 10,
    }));
  return { rows, count: rows.length };
}

// ── Snippet visibility (rising impressions, flat clicks) ────────────────────
// Compares a RECENT window vs the immediately PRIOR window PER QUERY. Queries
// whose impressions are climbing (>= +20%) while clicks stay flat or fall
// (<= +5%) are likely surfacing in PAA / AI-overview / featured-snippet slots
// that Google reads aloud without sending the click — growing zero-click
// visibility you should defend (claim the snippet, sharpen the title).
export async function snippetVisibility(sa, property, { windowDays = 28 } = {}) {
  const end = daysAgo(2);
  const recentStart = daysAgo(2 + windowDays);
  const priorEnd = daysAgo(2 + windowDays + 1);
  const priorStart = daysAgo(2 + windowDays * 2 + 1);

  const [recent, prior] = await Promise.all([
    query(sa, property, { startDate: recentStart, endDate: end, dimensions: ['query'], rowLimit: 1000 }),
    query(sa, property, { startDate: priorStart, endDate: priorEnd, dimensions: ['query'], rowLimit: 1000 }),
  ]);

  const priorMap = new Map(prior.map((r) => [r.keys[0], r]));
  const rows = [];
  for (const r of recent) {
    const q = r.keys[0];
    const p = priorMap.get(q);
    if (!p || p.impressions <= 0) continue;            // need a prior baseline
    const imprPct = (r.impressions - p.impressions) / p.impressions;
    const clickPct = p.clicks > 0 ? (r.clicks - p.clicks) / p.clicks
      : (r.clicks > 0 ? Infinity : 0);                 // 0→N clicks = real growth, not a snippet
    if (imprPct >= 0.20 && clickPct <= 0.05) {
      rows.push({
        query: q,
        impressionsNow: r.impressions, impressionsPrev: p.impressions,
        clicksNow: r.clicks, clicksPrev: p.clicks,
        impressionDelta: Math.round((r.impressions - p.impressions)),
      });
    }
  }
  rows.sort((a, b) => b.impressionDelta - a.impressionDelta);
  return { rows, count: rows.length };
}

export default { listSites, query, snapshot, contentDecay, quickWins, questionQueries, snippetVisibility };
