// Research → push queue. EVERY push to a site's Article Writer goes through the researched brief
// first (Karim: "whenever and whatever gets pushed to Airtable, it goes through that flow") —
// keywords, Keyword Gap, Content Plan, People Also Ask, AI Visibility, Radar news, the AI chat and
// the weekly auto-pilot. A brief takes ~1–2 min (research + judgment + citation check), so pushes
// are queued and a background worker researches then pushes each one.
//
// • Persistent per site in the app_secrets KV ('push_queue:<siteId>'); resumes after a restart.
// • One entry = one opportunity + its target jurisdictions. Every jurisdiction without a brief
//   researched FOR THAT COUNTRY gets one first (go-legal.ai is multilingual: France ≠ UK law),
//   then engine.autoDraft pushes it (per-market verification gate, dedupe, Jurisdiction+Language).
// • Respects the server kill switch: while engaged, nothing is researched or pushed.
import { db } from './supabase.js';
import * as engine from './content-engine.js';

const KV = (siteId) => 'push_queue:' + siteId;
const QUEUES = new Map();          // siteId → entries (mirror of the KV)
const CONCURRENCY = 2;
const MAX_KEEP = 200;
const DONE = new Set(['pushed', 'duplicate']);
let deps = { research: null, killSwitchOn: async () => false };
let running = false;

const nowIso = () => new Date().toISOString();

async function load(siteId) {
  if (QUEUES.has(siteId)) return QUEUES.get(siteId);
  let list = [];
  try { const raw = await db.getAppSecret(KV(siteId)); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) list = a; } } catch (e) { list = []; }
  QUEUES.set(siteId, list);
  return list;
}
async function save(siteId) {
  let list = QUEUES.get(siteId) || [];
  // Keep everything still in flight or needing attention; drop finished items after 7 days.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  list = list.filter((e) => !(DONE.has(e.status) && Date.parse(e.updatedAt || e.addedAt || 0) < cutoff));
  if (list.length > MAX_KEEP) list = list.slice(list.length - MAX_KEEP);
  QUEUES.set(siteId, list);
  try { await db.setAppSecret(KV(siteId), JSON.stringify(list)); } catch (e) { /* best-effort; in-memory copy still runs */ }
}

// Called once at server start: wire dependencies and resume anything interrupted by a restart.
export async function init({ research, killSwitchOn, siteIds = [] } = {}) {
  deps = { research, killSwitchOn: killSwitchOn || (async () => false) };
  for (const id of siteIds) {
    const list = await load(id);
    let touched = false;
    for (const e of list) if (e.status === 'researching') { e.status = 'pending'; e.stage = null; touched = true; }
    if (touched) await save(id);
  }
  kick();
}

// entries: [{ oppId, title, source, category, jurisdictions, force, upsertBy, extraFields, startWriting }]
export async function enqueue(siteId, entries) {
  const list = await load(siteId);
  let queued = 0, merged = 0;
  for (const e of entries || []) {
    if (!e || !e.oppId) continue;
    const live = list.find((x) => x.oppId === e.oppId && (x.status === 'pending' || x.status === 'researching'));
    if (live) {                                   // same topic already waiting → just add jurisdictions
      if (Array.isArray(e.jurisdictions)) live.jurisdictions = [...new Set([...(live.jurisdictions || []), ...e.jurisdictions])];
      if (e.force) live.force = true;
      merged++; continue;
    }
    list.push({
      key: e.oppId + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      siteId, oppId: e.oppId, title: String(e.title || '').slice(0, 200), source: e.source || 'push',
      category: e.category || null, jurisdictions: Array.isArray(e.jurisdictions) && e.jurisdictions.length ? e.jurisdictions : null,
      force: !!e.force, upsertBy: e.upsertBy || null, extraFields: e.extraFields || null, startWriting: !!e.startWriting,
      status: 'pending', stage: null, addedAt: nowIso(), updatedAt: nowIso(),
    });
    queued++;
  }
  await save(siteId);
  kick();
  return { queued, merged };
}

export async function status(siteId) {
  const list = await load(siteId);
  const counts = {};
  for (const e of list) counts[e.status] = (counts[e.status] || 0) + 1;
  return { entries: [...list].reverse().slice(0, 100), counts };
}

// Operator actions from the dashboard: push a held item anyway, retry a failed one, or remove it.
export async function action(siteId, key, act) {
  const list = await load(siteId);
  const e = list.find((x) => x.key === key);
  if (!e) return { error: 'Not in the queue any more.' };
  if (act === 'remove') { QUEUES.set(siteId, list.filter((x) => x !== e)); await save(siteId); return { ok: true }; }
  if (act === 'force') e.force = true;
  if (act === 'force' || act === 'retry') { e.status = 'pending'; e.error = null; e.reason = null; e.stage = null; e.updatedAt = nowIso(); await save(siteId); kick(); return { ok: true }; }
  return { error: 'Unknown action.' };
}

// ---- worker --------------------------------------------------------------------------
function kick() { if (!running) { running = true; setImmediate(loop); } }
function nextPending() {
  let best = null;
  for (const list of QUEUES.values()) for (const e of list) if (e.status === 'pending' && (!best || e.addedAt < best.addedAt)) best = e;
  return best;
}
async function loop() {
  const active = new Set();
  try {
    for (;;) {
      if (await deps.killSwitchOn().catch(() => false)) { setTimeout(kick, 60000); break; }   // paused: re-check in a minute
      while (active.size < CONCURRENCY) {
        const e = nextPending(); if (!e) break;
        e.status = 'researching'; e.updatedAt = nowIso();
        await save(e.siteId);
        const p = processEntry(e)
          .catch((err) => { e.status = 'failed'; e.error = String((err && err.message) || err).slice(0, 300); })
          .finally(async () => { e.stage = null; e.updatedAt = nowIso(); await save(e.siteId); active.delete(p); });
        active.add(p);
      }
      if (!active.size) break;
      await Promise.race([...active]);
    }
  } finally {
    if (active.size) await Promise.allSettled([...active]);
    running = false;
    if (nextPending()) kick();
  }
}

async function processEntry(e) {
  const got = await engine.fetchByIds(e.siteId, [e.oppId]);
  const opp = (got && got.items || [])[0];
  if (!opp) { e.status = 'failed'; e.error = 'That topic no longer exists.'; return; }
  const site = await db.getSite(e.siteId).catch(() => null);
  // 1) A researched brief for EVERY target jurisdiction (per-country research).
  const need = engine.marketsNeedingBrief(opp, e.jurisdictions, site && site.semrush_db);
  for (const mk of need) {
    e.stage = `researching the brief for ${mk.country}`; e.updatedAt = nowIso(); await save(e.siteId);
    const r = await deps.research(e.siteId, e.oppId, { marketDb: mk.db, primary: false });
    if (!r || r.error) { e.status = 'failed'; e.error = `${mk.country}: ${(r && r.error) || 'research failed'}`; return; }
  }
  // 2) Push (per-market verification gate, de-dupe, Jurisdiction + Language on each row).
  e.stage = 'sending to the Article Writer'; e.updatedAt = nowIso(); await save(e.siteId);
  const res = await engine.autoDraft(e.siteId, { ids: [e.oppId], category: e.category, jurisdictions: e.jurisdictions, force: e.force, upsertBy: e.upsertBy, extraFields: e.extraFields, startWriting: e.startWriting });
  e.result = { drafted: res.drafted || 0, updated: res.updated || 0, triggered: res.triggered || 0, skippedDup: res.skippedDup || 0, perJurisdiction: res.perJurisdiction || null };
  if (res.error) { e.status = 'failed'; e.error = res.error; return; }
  const sent = (res.drafted || 0) + (res.updated || 0);
  if (res.blocked && res.blocked.length) e.blocked = res.blocked.map((b) => ({ jurisdiction: b.jurisdiction, summary: b.summary }));
  if (sent > 0) { e.status = (res.blocked && res.blocked.length) ? 'held' : 'pushed'; if (e.status === 'held') e.reason = 'sent for some jurisdictions; others held — citations not confirmed'; return; }
  if (res.reason === 'verification-blocked') { e.status = 'held'; e.reason = 'citations not confirmed — review the brief, then "Push anyway"'; return; }
  if (res.skippedDup) { e.status = 'duplicate'; e.reason = 'already in the Article Writer'; return; }
  e.status = 'failed'; e.error = res.reason || 'nothing was pushed';
}
