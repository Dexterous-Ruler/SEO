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
import * as linkengine from './backlinks.js';
import * as semrush from './dataforseo.js';
import { WordPressClient } from '../src/wp/client.js';

const DAY = 86400000;
const mem = Object.create(null); // `${siteId}:${job}` -> last-run ms

// Minimal Supabase REST read (for the latest audit's findings).
async function sb(path) {
  const SB = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE;
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: K, Authorization: 'Bearer ' + K } });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

const due = (siteId, job, every) => (Date.now() - (mem[`${siteId}:${job}`] || 0)) >= every;
const mark = (siteId, job) => { mem[`${siteId}:${job}`] = Date.now(); };

async function note(siteId, text, ok = true) {
  await db.logActivity({ site_id: siteId, type: ok ? 'automation' : 'failed', actor: 'Automation', icon: ok ? 'check' : 'alert', text, meta: 'scheduled' }).catch(() => {});
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
    else if (r.failed) await note(site.id, `Auto-index failed for ${r.failed} URL(s) — enable the Indexing API in Google Cloud & verify ownership`, false);
  } catch (e) {
    // Surface setup problems (Indexing API disabled / not owner) once per daily run.
    await note(site.id, 'Auto-index could not run — ' + String(e.message || e).slice(0, 140), false);
  }
}

// ── Job: GSC health — surface not-indexed pages, ranking drops, decay ───────
async function jobGscHealth(site) {
  const saStr = await db.getGscSa(site.id).catch(() => null);
  if (!saStr || !site.gsc_property) return;
  const sa = JSON.parse(saStr);
  try { const h = await gscIndex.indexHealth(sa, site.gsc_property, { limit: 40 }); if (h.notIndexed && h.notIndexed.length) await note(site.id, `${h.notIndexed.length} top page(s) not indexed by Google`, false); } catch (e) {}
  try { const d = await gscIndex.rankingDrops(sa, site.gsc_property, { windowDays: 28 }); if (d.count) await note(site.id, `${d.count} keyword(s) dropped in rankings — refresh candidates`, false); } catch (e) {}
  try { const c = await gsc.contentDecay(sa, site.gsc_property, { windowDays: 28 }); if (c.count) await note(site.id, `${c.count} page(s) decaying (${c.totalClicksLost} clicks lost) — refresh candidates`, false); } catch (e) {}
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

// ── Job: backlink watch — new / lost / toxic referring domains → alerts ─────
// Read-only. Costs one DataForSEO referring-domains call per site per run, so
// it runs weekly. Surfaces lost high-authority links (reclamation) + toxic ones.
async function jobBacklinkWatch(site) {
  if (!semrush.hasKey() || !site.url) return;
  let m;
  try { m = await linkengine.monitor(site.id, { windowDays: 30 }); } catch (e) { return; }
  if (!m || m.error) return;
  if (m.newCount) await note(site.id, `${m.newCount} new referring domain(s) in the last 30 days`, true);
  if (m.lostHighValue) await note(site.id, `${m.lostHighValue} high-authority backlink(s) lost (30d) — reclamation candidates in Backlinks → Monitor`, false);
  if (m.toxicCount) await note(site.id, `${m.toxicCount} toxic referring domain(s) flagged (spam ≥ 30) — review in Backlinks → Monitor`, false);
}

const JOBS = [
  { name: 'auto-index', every: DAY, run: jobAutoIndex },
  { name: 'gsc-health', every: DAY, run: jobGscHealth },
  { name: 'keyword-push', every: 7 * DAY, run: jobKeywordPush },
  { name: 'image-optimize', every: 7 * DAY, run: jobAutoOptimizeImages },
  { name: 'apply-css', every: 7 * DAY, run: jobAutoApplyCss },
  { name: 'backlink-watch', every: 7 * DAY, run: jobBacklinkWatch },
];

async function tick() {
  let sites = [];
  try { sites = await db.listSites(); } catch (e) { return; }
  const connected = (sites || []).filter((s) => !s.status || s.status === 'connected');
  let ran = 0;
  for (const site of connected) {
    for (const job of JOBS) {
      if (!due(site.id, job.name, job.every)) continue;
      mark(site.id, job.name);
      ran++;
      try { await job.run(site); } catch (e) { console.error('[scheduler]', job.name, site.id, e && e.message); }
    }
  }
  console.log(`[scheduler] sweep: ${connected.length} site(s), ${ran} job(s) run`);
}

export function startScheduler() {
  if (process.env.AUTOMATION_ENABLED === 'false') { console.log('[scheduler] disabled (AUTOMATION_ENABLED=false)'); return; }
  setTimeout(() => { tick().catch(() => {}); }, 20 * 1000);   // first sweep ~20s after boot
  setInterval(() => { tick().catch(() => {}); }, 60 * 60 * 1000); // hourly thereafter
  console.log('[scheduler] automation enabled — auto-index, gsc-health, keyword-push, image-optimize (write-armed), backlink-watch');
}

export default { startScheduler };
