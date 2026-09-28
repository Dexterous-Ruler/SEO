// Research → push queue. EVERY push to a site's Article Writer goes through the researched brief
// first (Karim: "whenever and whatever gets pushed to Airtable, it goes through that flow") —
// keywords, Keyword Gap, Content Plan, People Also Ask, AI Visibility, Radar news, the AI chat and
// the weekly auto-pilot. A brief takes ~1–5 min (research + judgment + citation check), so pushes
// are queued and a background worker researches then pushes each one.
//
// • Persistent per site in the app_secrets KV ('push_queue:<siteId>'); resumes after a restart.
// • One entry = one opportunity + its target jurisdictions. Every jurisdiction without a brief
//   researched FOR THAT COUNTRY gets one first (go-legal.ai is multilingual: France ≠ UK law),
//   then engine.autoDraft pushes it (per-market verification gate, dedupe, Jurisdiction+Language).
// • Respects the server kill switch: while engaged, nothing is researched or pushed.
// • Safe with TWO server instances at once (Koyeb starts the new instance before stopping the old
//   one on every deploy). The old code reset every 'researching' entry to 'pending' at boot, so the
//   new instance re-ran work the old one was still finishing → the same row pushed twice in the
//   same second. Now: an entry is claimed with an owner + heartbeat; only an entry whose owner has
//   gone silent for LEASE_MS is taken over; claims re-read the store first; saves MERGE with the
//   store instead of overwriting it; an instance that is shutting down stops claiming.
import { db } from './supabase.js';
import * as engine from './content-engine.js';

const KV = (siteId) => 'push_queue:' + siteId;
const QUEUES = new Map();          // siteId → entries (this instance's view of the KV)
const ACTIVE = new Set();          // entries THIS instance is processing right now
const REMOVED = new Set();         // keys removed here — never merged back in from the store
const CONCURRENCY = 2;
const MAX_KEEP = 200;
let LEASE_MS = 4 * 60 * 1000;      // a 'researching' entry whose owner is silent this long is orphaned
let BEAT_MS = 60 * 1000;           // the owner refreshes updatedAt this often while working
const INSTANCE = Math.random().toString(36).slice(2, 10);
const DONE = new Set(['pushed', 'duplicate']);
let deps = { research: null, killSwitchOn: async () => false };
let running = false;
let stopping = false;
let paused = false;                // kill switch engaged — one re-check timer, no re-kick loop
let wakeLoop = null;               // resolves to make a waiting worker look for new work
let wakeRequested = false;         // a kick that arrived while the worker was busy claiming
let leaseTimer = null;             // single timer to re-check another owner's stale lease

const nowIso = () => new Date().toISOString();
const ms = (iso) => Date.parse(iso || 0) || 0;
// Injectable for tests (two instances sharing one store); production uses the KV + engine.
const kvGet = (k) => (deps.kv ? deps.kv.get(k) : db.getAppSecret(k));
const kvSet = (k, v) => (deps.kv ? deps.kv.set(k, v) : db.setAppSecret(k, v));
const E = () => deps.engine || engine;
const getSite = (id) => (deps.getSite ? deps.getSite(id) : db.getSite(id));

// Merge the stored list into ours: an entry we're processing stays ours; otherwise the copy with
// the newer updatedAt wins (updating OUR object in place, so live references stay valid); entries
// only in the store (enqueued/claimed by another instance) are added. Read failure → keep ours.
async function sync(siteId) {
  const mine = QUEUES.get(siteId) || [];
  let stored = null;
  try { const raw = await kvGet(KV(siteId)); stored = raw ? JSON.parse(raw) : []; } catch (e) { stored = null; }
  if (Array.isArray(stored)) {
    const byKey = new Map(mine.map((e) => [e.key, e]));
    for (const s of stored) {
      if (!s || !s.key || REMOVED.has(s.key)) continue;
      const m = byKey.get(s.key);
      if (!m) { mine.push(s); byKey.set(s.key, s); continue; }
      if (ACTIVE.has(m)) continue;
      if (ms(s.updatedAt) > ms(m.updatedAt)) Object.assign(m, s);
    }
    mine.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
  }
  QUEUES.set(siteId, mine);
  return mine;
}
async function save(siteId) {
  let list = await sync(siteId);
  // Keep everything still in flight or needing attention; drop finished items after 7 days.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  list = list.filter((e) => !(DONE.has(e.status) && ms(e.updatedAt || e.addedAt) < cutoff));
  if (list.length > MAX_KEEP) list = list.slice(list.length - MAX_KEEP);
  QUEUES.set(siteId, list);
  try { await kvSet(KV(siteId), JSON.stringify(list)); } catch (e) { /* best-effort; in-memory copy still runs */ }
}

// Called once at server start: wire dependencies and pick up the queues. An entry left
// 'researching' is NOT reset here — its owner may be the previous instance, still finishing it
// during the deploy overlap; it becomes claimable once that owner's heartbeat is LEASE_MS stale.
export async function init({ research, killSwitchOn, siteIds = [], kv, engine: eng, getSite: gs, leaseMs, beatMs } = {}) {
  deps = { research, killSwitchOn: killSwitchOn || (async () => false), kv, engine: eng, getSite: gs };
  if (leaseMs) LEASE_MS = leaseMs;
  if (beatMs) BEAT_MS = beatMs;
  for (const id of siteIds) await sync(id);
  try { process.once('SIGTERM', () => { stopping = true; }); } catch (e) { /* not a Node process */ }
  kick();
}

// entries: [{ oppId, title, source, category, jurisdictions, force, upsertBy, extraFields, startWriting }]
export async function enqueue(siteId, entries) {
  const list = await sync(siteId);
  let queued = 0, merged = 0;
  for (const e of entries || []) {
    if (!e || !e.oppId) continue;
    const live = list.find((x) => x.oppId === e.oppId && (x.status === 'pending' || x.status === 'researching'));
    if (live) {                                   // same topic already waiting → just add jurisdictions
      if (Array.isArray(e.jurisdictions)) live.jurisdictions = [...new Set([...(live.jurisdictions || []), ...e.jurisdictions])];
      if (e.force) live.force = true;
      live.updatedAt = nowIso();
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
  const list = await sync(siteId);
  const counts = {};
  for (const e of list) counts[e.status] = (counts[e.status] || 0) + 1;
  return { entries: [...list].reverse().slice(0, 100), counts };
}

// Operator actions from the dashboard: push a held item anyway, retry a failed one, or remove it.
export async function action(siteId, key, act) {
  const list = await sync(siteId);
  const e = list.find((x) => x.key === key);
  if (!e) return { error: 'Not in the queue any more.' };
  if (act === 'remove') { REMOVED.add(key); QUEUES.set(siteId, list.filter((x) => x !== e)); await save(siteId); return { ok: true }; }
  if (act === 'force') e.force = true;
  if (act === 'force' || act === 'retry') { e.status = 'pending'; e.owner = null; e.error = null; e.reason = null; e.stage = null; e.updatedAt = nowIso(); await save(siteId); kick(); return { ok: true }; }
  return { error: 'Unknown action.' };
}

// ---- worker --------------------------------------------------------------------------
function kick() {
  if (running) { if (wakeLoop) { wakeLoop(); wakeLoop = null; } else wakeRequested = true; return; }   // a busy worker picks new work up now
  running = true; setImmediate(loop);
}
const claimable = (e, now) => !ACTIVE.has(e) && (e.status === 'pending' || (e.status === 'researching' && now - ms(e.updatedAt) > LEASE_MS));
// Re-read the store (another instance may have claimed or finished it), then take the oldest
// claimable entry: mark it ours, save, and confirm our claim survived before working on it.
async function claimNext() {
  for (const siteId of [...QUEUES.keys()]) await sync(siteId);
  const now = Date.now();
  const all = [...QUEUES.values()].flat().filter((e) => claimable(e, now)).sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
  for (const e of all) {
    e.status = 'researching'; e.owner = INSTANCE; e.stage = null; e.updatedAt = nowIso();
    await save(e.siteId);
    await sync(e.siteId);
    if (e.owner === INSTANCE && e.status === 'researching') return e;   // another instance's later claim wins
  }
  return null;
}
async function loop() {
  const running_ = new Set();
  try {
    for (;;) {
      // Paused: ONE re-check a minute from now. (The old code re-kicked straight from `finally`
      // while entries were pending, spinning on the kill-switch lookup.)
      if (await deps.killSwitchOn().catch(() => false)) { if (!paused) { paused = true; setTimeout(() => { paused = false; kick(); }, 60000); } break; }
      wakeRequested = false;
      while (!stopping && running_.size < CONCURRENCY) {
        const e = await claimNext(); if (!e) break;
        ACTIVE.add(e);
        const beat = setInterval(() => { e.updatedAt = nowIso(); save(e.siteId).catch(() => {}); }, BEAT_MS);
        const p = processEntry(e)
          .catch((err) => { e.status = 'failed'; e.error = String((err && err.message) || err).slice(0, 300); })
          .finally(async () => { clearInterval(beat); e.stage = null; e.owner = null; e.updatedAt = nowIso(); ACTIVE.delete(e); await save(e.siteId).catch(() => {}); running_.delete(p); });
        running_.add(p);
      }
      if (!running_.size) break;
      if (wakeRequested) continue;                 // new work arrived while claiming — look again
      await Promise.race([...running_, new Promise((r) => { wakeLoop = r; })]);
      wakeLoop = null;
    }
  } finally {
    if (running_.size) await Promise.allSettled([...running_]);
    running = false;
    if (!stopping && !paused) {
      const now = Date.now();
      const entries = [...QUEUES.values()].flat();
      if (entries.some((e) => claimable(e, now))) kick();
      // Someone else's 'researching' entry: if its owner dies, take it over once the lease lapses.
      else if (!leaseTimer && entries.some((e) => e.status === 'researching' && !ACTIVE.has(e))) leaseTimer = setTimeout(() => { leaseTimer = null; kick(); }, LEASE_MS + 5000);
    }
  }
}

async function processEntry(e) {
  const got = await E().fetchByIds(e.siteId, [e.oppId]);
  const opp = (got && got.items || [])[0];
  if (!opp) { e.status = 'failed'; e.error = 'That topic no longer exists.'; return; }
  const site = await getSite(e.siteId).catch(() => null);
  // 1) A researched brief for EVERY target jurisdiction (per-country research).
  const need = E().marketsNeedingBrief(opp, e.jurisdictions, site && site.semrush_db);
  for (const mk of need) {
    e.stage = `researching the brief for ${mk.country}`; e.updatedAt = nowIso(); await save(e.siteId);
    const r = await deps.research(e.siteId, e.oppId, { marketDb: mk.db, primary: false });
    if (!r || r.error) { e.status = 'failed'; e.error = `${mk.country}: ${(r && r.error) || 'research failed'}`; return; }
  }
  // 2) Push (per-market verification gate, de-dupe, Jurisdiction + Language on each row).
  e.stage = 'sending to the Article Writer'; e.updatedAt = nowIso(); await save(e.siteId);
  const res = await E().autoDraft(e.siteId, { ids: [e.oppId], category: e.category, jurisdictions: e.jurisdictions, force: e.force, upsertBy: e.upsertBy, extraFields: e.extraFields, startWriting: e.startWriting });
  e.result = { drafted: res.drafted || 0, updated: res.updated || 0, triggered: res.triggered || 0, skippedDup: res.skippedDup || 0, perJurisdiction: res.perJurisdiction || null };
  if (res.error) { e.status = 'failed'; e.error = res.error; return; }
  const sent = (res.drafted || 0) + (res.updated || 0);
  if (res.blocked && res.blocked.length) e.blocked = res.blocked.map((b) => ({ jurisdiction: b.jurisdiction, summary: b.summary }));
  if (sent > 0) { e.status = (res.blocked && res.blocked.length) ? 'held' : 'pushed'; if (e.status === 'held') e.reason = 'sent for some jurisdictions; others held — citations not confirmed'; return; }
  if (res.reason === 'verification-blocked') { e.status = 'held'; e.reason = 'citations not confirmed — review the brief, then "Push anyway"'; return; }
  if (res.skippedDup) { e.status = 'duplicate'; e.reason = 'already in the Article Writer'; return; }
  e.status = 'failed'; e.error = res.reason || 'nothing was pushed';
}
