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
import * as engine from './content-engine.js';
import * as uxcrawl from './ux-crawl.js';
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

// ── Job: refresh the Content Engine worklist (weekly, DataForSEO-gated cost) ─
// Nothing populated the unified worklist on a schedule before, so a site's list
// went empty/stale until someone clicked "Run engine". This runs the SAME ingest
// as the UI's /engine-run, per site, weekly. engine.run is best-effort per source
// and only writes to content_opportunities (+ the Airtable mirror) — never a live
// page. Weekly cadence + persisted scheduler_runs keep the DataForSEO spend bounded.
async function jobEngineRefresh(site) {
  try {
    const r = await engine.run(site.id, { includeTrending: true, includePaa: true, includeGeo: false });
    if (r && r.count) await note(site.id, `Content Engine refreshed — ${r.count} opportunity(ies) in the worklist`);
    // A refresh that produced NOTHING is a signal, not a success — a producer (DataForSEO
    // units, GSC access, Claude) can otherwise fail silently for weeks.
    else await alertWeekly(site.id, 'engine-refresh-empty', 'Weekly Content Engine refresh produced 0 opportunities — check DataForSEO credit, GSC access and the site\'s competitors/context.' + (r && r.error ? ` (${String(r.error).slice(0, 120)})` : ''));
  } catch (e) {
    await alertWeekly(site.id, 'engine-refresh-failed', 'Weekly Content Engine refresh FAILED: ' + String(e && e.message || e).slice(0, 140)).catch(() => {});
  }
}

// ── Job: AUTO-PILOT — auto-draft the top scored worklist items (weekly, opt-in) ──
// The worklist scored items but nothing ACTIONED them without a human clicking
// "Auto-draft top 5". With site.auto_content_pilot=true (off by default, toggled on
// the Content Engine screen), the top 5 are pushed into the Article Writer weekly.
// autoDraft de-dupes by keyword and does NOT set Status="Write Article" — generation
// still starts only when the operator flips it (or their Airtable automation does).
async function jobAutoDraft(site) {
  if (!site.auto_content_pilot) return;   // strictly opt-in per site
  try {
    const r = await engine.autoDraft(site.id, { topN: 5 });
    if (r && r.drafted) await note(site.id, `Auto-pilot: drafted ${r.drafted} top opportunity(ies) → Article Writer` + (r.skippedDup ? ` (${r.skippedDup} already there)` : ''));
  } catch (e) { /* next week retries */ }
}

// ── Job: close the published loop (daily) ───────────────────────────────────
// autoDraft flips opportunities → 'queued', n8n publishes and back-writes the row,
// but NOTHING advanced queued → published without a manual "Sync published" click —
// so items stranded as queued indefinitely. syncPublished matches completed writer
// rows back to open opportunities and advances them (+ drift baseline capture).
async function jobSyncPublished(site) {
  try {
    const r = await engine.syncPublished(site.id);
    if (r && r.published) await note(site.id, `Published-loop sync: ${r.published} article(s) advanced to published`);
  } catch (e) { /* next day retries */ }
}

// ── Job: static UX crawl of top ranking pages (weekly, NO consent) ──────────
// The consent-free counterpart to the RUM beacon: fetches each site's top GSC
// pages and files HTTP-verified breakage (broken links / CTAs / images / scripts
// / styles) into the Review Queue, de-duped. Read-only crawl → safe hands-off.
async function jobUxCrawl(site) {
  const saStr = await db.getGscSa(site.id).catch(() => null);
  if (!saStr || !site.gsc_property) return;   // needs GSC top pages to prioritise
  let topPages = [];
  try { const snap = await gsc.snapshot(JSON.parse(saStr), site.gsc_property, { days: 28 }); topPages = snap.topPages || []; } catch (e) { return; }
  if (!topPages.length) return;
  const res = await uxcrawl.crawlSite(topPages, { limit: 25 }).catch(() => null);
  if (!res || !res.defects.length) return;
  const filed = await uxcrawl.fileCrawlDefects(db, site.id, site, res.defects, { limit: 30 }).catch(() => ({ filed: 0 }));
  if (filed.filed) await note(site.id, `UX scan: ${filed.filed} broken link/CTA/resource(s) on your ranking pages → added to Approve Changes`);
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

// ── Experience Monitor — rollup + prune (INERT until RUM_ENABLED + site armed) ──
// Both early-return when RUM_ENABLED!=='true', so the hourly sweep does one extra
// boolean check and nothing else by default. Scaffold-level rollup (windowed group
// → upsert); Phase 1 adds incremental accumulation + GSC-clicks join + RICE + a
// draining watermark cursor (see EXPERIENCE-MONITOR-PLAN.md §8/§9).
const HOUR = 60 * 60 * 1000;
// GSC landing-page map (clicks/position) per site, cached 1h so the hourly rollup
// doesn't re-hit the GSC API every tick. Powers the organic-clicks-exposed join.
const uxGscCache = Object.create(null);
async function uxGscMap(site) {
  const c = uxGscCache[site.id];
  if (c && Date.now() - c.at < HOUR) return c.map;
  const map = {};
  try {
    const saStr = await db.getGscSa(site.id).catch(() => null);
    const property = site.gsc_property;
    if (saStr && property) {
      const snap = await gsc.snapshot(JSON.parse(saStr), property, { days: 28 });
      for (const p of (snap.topPages || [])) {
        let path = p.page; try { path = new URL(p.page).pathname; } catch (e) {}
        map[path] = { clicks: p.clicks || 0, position: p.position != null ? p.position : null };
      }
    }
  } catch (e) { /* GSC optional → no clicks_exposed for this site */ }
  // Don't cache an EMPTY map for the full hour (a transient GSC failure would blank
  // clicks_exposed across all defects until the TTL); at:0 forces a retry next rollup.
  uxGscCache[site.id] = { at: Object.keys(map).length ? Date.now() : 0, map };
  return map;
}
// Watermark for the draining cursor (separate job key so the tick's cadence mark()
// on 'ux-rollup' doesn't clobber it). Advanced ONLY after a successful merge.
async function markWatermark(siteId, iso) {
  mem[`${siteId}:ux-rollup-wm`] = Date.parse(iso);
  if (!RUNS_OK) return;
  try { await sbReq('scheduler_runs?on_conflict=site_id,job', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ site_id: siteId, job: 'ux-rollup-wm', last_run: iso }) }); } catch (e) {}
}
async function jobUxRollup(site) {
  if (process.env.RUM_ENABLED !== 'true' || !site.rum_armed) return;
  const T = new Date().toISOString();                                  // snapshot upper bound
  const wmMs = await getLastRun(site.id, 'ux-rollup-wm');
  const since = new Date(wmMs || (Date.now() - 72 * HOUR)).toISOString();
  let events = [];
  try { events = await sb(`ux_events?site_id=eq.${site.id}&received_at=gt.${encodeURIComponent(since)}&received_at=lte.${encodeURIComponent(T)}&select=page,event_type,selector,count,pv_id,detail,received_at&order=received_at.asc&limit=3000`); } catch (e) { return; }
  if (!events || !events.length) return;
  // If we hit the page cap, advance the watermark only to the LAST row we actually read
  // (not to T) so events between it and T aren't skipped — the next tick resumes there.
  const drained = events.length >= 3000 ? events[events.length - 1].received_at : T;
  const pv = Object.create(null);     // page → pageview count (the defect_rate denominator)
  const groups = new Map();
  for (const ev of events) {
    if (ev.event_type === 'pageview') { pv[ev.page] = (pv[ev.page] || 0) + (Number(ev.count) || 1); continue; }
    const sig = `${ev.page}|${ev.event_type}|${ev.selector || ''}`.slice(0, 500);
    let g = groups.get(sig);
    if (!g) { g = { sig, page: ev.page, event_type: ev.event_type, selector: ev.selector || null, occ: 0, sess: new Set(), last: ev.received_at, sample: ev.detail || {} }; groups.set(sig, g); }
    g.occ += Number(ev.count) || 1;
    if (ev.pv_id) g.sess.add(ev.pv_id);
    if (ev.received_at > g.last) g.last = ev.received_at;
  }
  if (!groups.size) { await markWatermark(site.id, drained); return; }   // pageviews-only window (nothing to merge → safe non-transactional advance)
  const gmap = await uxGscMap(site);
  const MOD = new Set(['broken_cta', 'dead_click', 'rage_click', 'console_error', 'form_abandon', 'inp_slow']);  // heuristic/composite → MODERATE (advisory)
  const rows = [...groups.values()].map((g) => {
    const j = gmap[g.page] || null;
    return {
      site_id: site.id, page: g.page, event_type: g.event_type, selector: g.selector, signature: g.sig,
      confidence: MOD.has(g.event_type) ? 'moderate' : 'high',
      occurrences: g.occ, sessions: g.sess.size, pageviews_seen: pv[g.page] || 0,
      last_seen: g.last, sample_detail: g.sample,
      gsc_clicks: j ? j.clicks : null, gsc_position: j ? j.position : null,
    };
  });
  try {
    // Merge + watermark advance happen ATOMICALLY inside the RPC (migration 006): if the
    // merge commits, the watermark commits; if it throws, both roll back → re-drain is safe.
    await sbReq('rpc/ux_defect_merge', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ rows, p_site: site.id, p_watermark: drained }) });
    mem[`${site.id}:ux-rollup-wm`] = Date.parse(drained);   // mirror to mem cache (DB watermark written transactionally by the RPC)
  } catch (e) { /* leave watermark unchanged → retry this window next tick (merge rolled back, no double-count) */ }
}
async function jobUxPrune(site) {
  if (process.env.RUM_ENABLED !== 'true') return;
  const cutoff = new Date(Date.now() - 72 * HOUR).toISOString();
  try { await sbReq(`ux_events?site_id=eq.${site.id}&received_at=lt.${cutoff}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch (e) {}
}

const JOBS = [
  { name: 'auto-index', every: DAY, run: jobAutoIndex },
  { name: 'gsc-health', every: DAY, run: jobGscHealth },
  { name: 'keyword-push', every: 7 * DAY, run: jobKeywordPush },
  { name: 'engine-refresh', every: 7 * DAY, run: jobEngineRefresh },
  { name: 'auto-draft', every: 7 * DAY, run: jobAutoDraft },   // opt-in via site.auto_content_pilot
  { name: 'sync-published', every: DAY, run: jobSyncPublished }, // close the queued→published loop daily
  { name: 'ux-crawl', every: 7 * DAY, run: jobUxCrawl },
  { name: 'image-optimize', every: 7 * DAY, run: jobAutoOptimizeImages },
  { name: 'apply-css', every: 7 * DAY, run: jobAutoApplyCss },
  { name: 'ux-rollup', every: HOUR, run: jobUxRollup },   // inert until RUM_ENABLED + rum_armed
  { name: 'ux-prune',  every: DAY,  run: jobUxPrune },    // inert until RUM_ENABLED
];

let TICKING = false;   // in-flight guard: never let two sweeps overlap in one process

async function tick() {
  // Only the leader sweeps — prevents double-runs across instances.
  if (!IS_LEADER) return;
  // Re-entrancy guard: a sweep runs every connected site × every job SERIALLY and
  // can exceed the hourly interval when heavy weekly jobs (engine-refresh, ux-crawl,
  // image-optimize) coincide. Two overlapping sweeps could both pass isDue() for the
  // same (site,job) before either mark()s it (check-then-act TOCTOU) and double-run
  // an expensive job. Skip the new tick while the previous one is still running.
  if (TICKING) { console.log('[scheduler] previous sweep still running — skipping this tick'); return; }
  TICKING = true;
  try {
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
  } finally {
    TICKING = false;
  }
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
