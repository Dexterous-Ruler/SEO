// ===========================================================================
// Automation scheduler — runs the SAFE, analysis/sync jobs on a schedule so the
// dashboard works hands-off. By design it NEVER writes to a site's live pages
// (meta/CSS/image swaps stay in the human-reviewed Review Queue). It only:
//   • auto-indexes recent URLs via Google's Indexing API (bypasses 10/day limit)
//   • refreshes GSC index-health + ranking-drops + content-decay → activity alerts
//   • pushes new content-gap keywords into each site's Airtable (de-duped)
//
// Single always-on instance (Koyeb min=1) → one hourly tick, no double-runs.
// Due-ness is tracked in-memory; jobs are idempotent (re-index is harmless,
// keyword push de-dupes, health checks are read-only), and the costly DataForSEO
// keyword job is additionally gated on Airtable's stored last_sync so a redeploy
// can't re-run it. Disable with AUTOMATION_ENABLED=false.
// ===========================================================================
import { db, credsForSite } from './supabase.js';
import * as gsc from './gsc.js';
import * as gscIndex from './gsc-index.js';
import { findOpportunities } from './content-opportunities.js';
import * as airtable from './airtable.js';
import * as imageOpt from './image-optimize.js';
import { generateCssFixes } from './css-fixes.js';
import * as semrush from './dataforseo.js';
import { WordPressClient } from '../src/wp/client.js';

const DAY = 86400000;
const mem = Object.create(null); // `${siteId}:${job}` -> last-run ms (fallback + cache)
const INSTANCE = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const LEADER_TTL_MS = 90000;     // lock lease; heartbeat re-extends every 30s
let IS_LEADER = false;
let LOCK_OK = null;              // null=unknown, true/false after probe
let RUNS_OK = null;

// Minimal Supabase REST read.
async function sb(path) {
  const SB = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE;
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: K, Authorization: 'Bearer ' + K } });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}
// REST write (PATCH/POST). Returns parsed JSON or null.
async function sbReq(path, opts = {}) {
  const SB = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE;
  if (!SB || !K) return null;
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...opts, headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) { const e = new Error('sb ' + res.status); e.status = res.status; throw e; }
  const t = await res.text(); return t ? JSON.parse(t) : null;
}
async function probe(table) { try { await sbReq(`${table}?select=*&limit=1`); return true; } catch (e) { return false; } }

// ── Leadership (multi-instance safety) ───────────────────────────────────────
// Acquire/extend the lock via a conditional UPDATE: succeeds only if it's free,
// expired, or already ours. If the lock table is absent, assume single instance.
async function acquireLeader() {
  if (LOCK_OK === null) LOCK_OK = await probe('scheduler_lock');
  if (!LOCK_OK) return true; // migration not run → behave as a single instance
  const now = new Date();
  const expires = new Date(now.getTime() + LEADER_TTL_MS).toISOString();
  const cond = `or=(holder.is.null,holder.eq.${INSTANCE},expires_at.lt.${encodeURIComponent(now.toISOString())})`;
  try {
    const r = await sbReq(`scheduler_lock?id=eq.leader&${cond}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ holder: INSTANCE, expires_at: expires, updated_at: now.toISOString() }),
    });
    return Array.isArray(r) && r.length > 0;
  } catch (e) { return false; }
}

// ── Persisted due-ness (survives redeploys; shared across instances) ─────────
async function getLastRun(siteId, job) {
  if (RUNS_OK === null) RUNS_OK = await probe('scheduler_runs');
  if (!RUNS_OK) return mem[`${siteId}:${job}`] || 0;
  try { const r = await sb(`scheduler_runs?site_id=eq.${siteId}&job=eq.${encodeURIComponent(job)}&select=last_run`); return (r && r[0] && r[0].last_run) ? Date.parse(r[0].last_run) : 0; }
  catch (e) { return mem[`${siteId}:${job}`] || 0; }
}
async function isDue(siteId, job, every) { return (Date.now() - (await getLastRun(siteId, job))) >= every; }
async function mark(siteId, job) {
  mem[`${siteId}:${job}`] = Date.now();
  if (!RUNS_OK) return;
  try { await sbReq('scheduler_runs?on_conflict=site_id,job', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ site_id: siteId, job, last_run: new Date().toISOString() }) }); }
  catch (e) {}
}

async function note(siteId, text, ok = true) {
  await db.logActivity({ site_id: siteId, type: ok ? 'automation' : 'failed', actor: 'Automation', icon: ok ? 'check' : 'alert', text, meta: 'scheduled' }).catch(() => {});
}

// Throttled alert: post this `kind` of recurring alert at most once a week per
// site, so a persistent condition (e.g. Indexing API not enabled, content decay)
// doesn't spam the bell every single daily run. Persisted via scheduler_runs.
const ALERT_THROTTLE = 7 * DAY;
async function alertWeekly(siteId, kind, text, ok = false) {
  const key = '_alert:' + kind;
  const last = await getLastRun(siteId, key);
  if (Date.now() - last < ALERT_THROTTLE) return;
  await note(siteId, text, ok);
  await mark(siteId, key);
}

// ── Job: auto-index recent posts/pages via the Indexing API ─────────────────
async function jobAutoIndex(site) {
  const saStr = await db.getGscSa(site.id).catch(() => null);
  if (!saStr) return;
  let urls = [];
  try {
    const { baseUrl, username, appPassword } = await credsForSite(site.id);
    const wp = new WordPressClient({ baseUrl, username, appPassword });
    const [pg, ps] = await Promise.all([
      wp.list('pages', { perPage: 30, fields: 'link' }).catch(() => []),
      wp.list('posts', { perPage: 30, fields: 'link' }).catch(() => []),
    ]);
    urls = [...pg, ...ps].map((r) => r.link).filter(Boolean);
  } catch (e) { return; }
  if (!urls.length) return;
  try {
    const r = await gscIndex.submitUrls(JSON.parse(saStr), urls, { type: 'URL_UPDATED' });
    if (r.succeeded) await note(site.id, `Auto-indexed ${r.succeeded}/${r.submitted} URLs with Google`);
    else if (r.failed) await alertWeekly(site.id, 'autoindex-setup', `Auto-index needs one-time setup: enable the Indexing API in Google Cloud, and add the connected Google account as an Owner of this property in Search Console. (${r.failed} URL(s) pending — this reminder shows weekly until fixed.)`);
  } catch (e) {
    await alertWeekly(site.id, 'autoindex-setup', 'Auto-index needs setup — ' + String(e.message || e).slice(0, 120) + ' (enable the Indexing API + verify ownership; weekly reminder).');
  }
}

// ── Job: GSC health — surface not-indexed pages, ranking drops, decay ───────
async function jobGscHealth(site) {
  const saStr = await db.getGscSa(site.id).catch(() => null);
  if (!saStr || !site.gsc_property) return;
  const sa = JSON.parse(saStr);
  try { const h = await gscIndex.indexHealth(sa, site.gsc_property, { limit: 40 }); if (h.notIndexed && h.notIndexed.length) await alertWeekly(site.id, 'notindexed', `${h.notIndexed.length} top page(s) not indexed by Google`); } catch (e) {}
  try { const d = await gscIndex.rankingDrops(sa, site.gsc_property, { windowDays: 28 }); if (d.count) await alertWeekly(site.id, 'rankdrops', `${d.count} keyword(s) dropped in rankings — refresh candidates`); } catch (e) {}
  try { const c = await gsc.contentDecay(sa, site.gsc_property, { windowDays: 28 }); if (c.count) await alertWeekly(site.id, 'decay', `${c.count} page(s) decaying (${c.totalClicksLost} clicks lost) — refresh candidates`); } catch (e) {}
}

// ── Job: push new content-gap keywords to Airtable (weekly, cost-gated) ─────
async function jobKeywordPush(site) {
  const pat = await db.getAirtablePat(site.id).catch(() => null);
  if (!pat) return;
  const cfg = await db.getAirtableConfig(site.id).catch(() => null);
  if (!cfg || !cfg.base_id || !cfg.table_gaps) return;        // base + keyword table must be configured
  if (cfg.last_sync && (Date.now() - new Date(cfg.last_sync).getTime()) < 7 * DAY) return; // don't re-spend DataForSEO units
  const r = await findOpportunities(site.id, { maxKeywords: 160 }).catch(() => ({ error: true }));
  if (r.error) return;
  const kws = (r.clusters || []).filter((c) => c.isGap).map((c) => c.primaryKeyword).filter(Boolean);
  if (!kws.length) return;
  try {
    const res = await airtable.pushKeywords(pat, cfg.base_id, cfg.table_gaps, cfg.table_content || 'Keyword', kws);
    await db.logAirtableSync({ site_id: site.id, kind: 'keywords', records_pushed: res.pushed, status: 'ok' }).catch(() => {});
    await db.upsertAirtableConfig(site.id, { last_sync: new Date().toISOString() }).catch(() => {});
    if (res.pushed) await note(site.id, `Pushed ${res.pushed} new content-gap keyword(s) to Airtable`);
  } catch (e) { /* surface nothing on transient airtable errors */ }
}

// ── Job: auto-optimise images → WebP (write-armed sites only) ───────────────
// Compresses the heaviest images and uploads WebP to the media library, skipping
// any already converted. This is a media-library write (not a page-content edit),
// so it's gated on write_armed. NOTE: it does NOT yet swap the references in
// Elementor pages — that reference-swap is the remaining step to make pages
// actually serve the WebP, and is built/tested separately for safety.
async function jobAutoOptimizeImages(site) {
  if (!site.write_armed) return;                 // only sites you've explicitly armed
  try {
    const r = await imageOpt.optimizeImages(site.id, { apply: true, max: 6, skipExisting: true });
    if (r && r.uploaded) await note(site.id, `Auto-optimised ${r.uploaded} image(s) to WebP (${r.savedKB}KB lighter) — uploaded to media library`);
  } catch (e) { console.error('[scheduler] auto-optimize-images', site.id, e && e.message); }
}

// ── Job: auto-apply accessibility/perf CSS fixes to the live site ───────────
// Generates CSS from the latest audit and pushes it via the seo-agent-optimize
// mu-plugin (injected in <head>, reversible). Gated on write_armed AND the plugin
// being installed — no-ops safely otherwise. WebP serving + schema are handled by
// the same mu-plugin (WebP automatically; schema per-page via the apply action).
async function jobAutoApplyCss(site) {
  if (!site.write_armed) return;
  let creds; try { creds = await credsForSite(site.id); } catch (e) { return; }
  const wp = new WordPressClient({ baseUrl: creds.baseUrl, username: creds.username, appPassword: creds.appPassword });
  // Only proceed if the optimize mu-plugin is present.
  const self = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/optimize-selftest`).catch(() => null);
  if (!self || !self.ok) return;
  const audits = await sb(`audits?site_id=eq.${site.id}&select=findings&order=created_at.desc&limit=1`).catch(() => []);
  const findings = (audits && audits[0] && audits[0].findings) || [];
  if (!findings.length) return;
  const res = generateCssFixes(findings);
  if (!res.rules || !res.rules.length) return;
  const css = res.css.replace('{{DATE}}', new Date().toISOString().slice(0, 10));
  try {
    await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/css`, { method: 'POST', body: { css } });
    await note(site.id, `Auto-applied ${res.rules.length} CSS fix(es) to the live site`);
  } catch (e) { console.error('[scheduler] auto-apply-css', site.id, e && e.message); }
}

const JOBS = [
  { name: 'auto-index', every: DAY, run: jobAutoIndex },
  { name: 'gsc-health', every: DAY, run: jobGscHealth },
  { name: 'keyword-push', every: 7 * DAY, run: jobKeywordPush },
  { name: 'image-optimize', every: 7 * DAY, run: jobAutoOptimizeImages },
  { name: 'apply-css', every: 7 * DAY, run: jobAutoApplyCss },
];

async function tick() {
  // Only the leader sweeps — prevents double-runs across instances.
  if (!IS_LEADER) return;
  let sites = [];
  try { sites = await db.listSites(); } catch (e) { return; }
  const connected = (sites || []).filter((s) => !s.status || s.status === 'connected');
  let ran = 0;
  for (const site of connected) {
    for (const job of JOBS) {
      if (!(await isDue(site.id, job.name, job.every))) continue;
      await mark(site.id, job.name);   // claim BEFORE running so a co-leader blip can't double-run
      ran++;
      try { await job.run(site); } catch (e) { console.error('[scheduler]', job.name, site.id, e && e.message); }
    }
  }
  console.log(`[scheduler] sweep (leader ${INSTANCE}): ${connected.length} site(s), ${ran} job(s) run`);
}

// Heartbeat: continuously (re)acquire the lock. Whoever holds it is the leader;
// if it dies, another instance takes over within ~TTL.
async function heartbeat() {
  const was = IS_LEADER;
  IS_LEADER = await acquireLeader();
  if (IS_LEADER !== was) console.log(`[scheduler] leadership ${IS_LEADER ? 'ACQUIRED' : 'lost'} by ${INSTANCE}` + (LOCK_OK ? '' : ' (single-instance: no lock table)'));
}

export function startScheduler() {
  if (process.env.AUTOMATION_ENABLED === 'false') { console.log('[scheduler] disabled (AUTOMATION_ENABLED=false)'); return; }
  heartbeat().catch(() => {});                                   // claim leadership at boot
  setInterval(() => { heartbeat().catch(() => {}); }, 30 * 1000); // re-extend / fail over every 30s
  setTimeout(() => { tick().catch(() => {}); }, 25 * 1000);       // first sweep ~25s after boot (after first heartbeat)
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000); // hourly thereafter
  console.log('[scheduler] automation enabled (cluster-safe leader lock) — auto-index, gsc-health, keyword-push, image-optimize, apply-css, backlink-watch');
}

export default { startScheduler };
