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
import { WordPressClient } from '../src/wp/client.js';

const DAY = 86400000;
const mem = Object.create(null); // `${siteId}:${job}` -> last-run ms

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

const JOBS = [
  { name: 'auto-index', every: DAY, run: jobAutoIndex },
  { name: 'gsc-health', every: DAY, run: jobGscHealth },
  { name: 'keyword-push', every: 7 * DAY, run: jobKeywordPush },
  { name: 'image-optimize', every: 7 * DAY, run: jobAutoOptimizeImages },
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
  console.log('[scheduler] automation enabled — auto-index, gsc-health, keyword-push, image-optimize (write-armed)');
}

export default { startScheduler };
