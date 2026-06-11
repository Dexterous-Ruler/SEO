// ===========================================================================
// Durable job queue — Supabase-backed background work (Tier-2 robustness).
// Long tasks (outreach prep, backlink pulls, audits, image-opt) move OFF the
// request path: the API enqueues a row and returns a job id immediately; an
// in-process worker pool claims due jobs, runs the registered handler, retries
// with backoff, and records the result. Jobs survive crashes/redeploys (the row
// persists; a boot-time reclaim re-queues anything stuck) and are multi-instance
// safe (claims use a conditional UPDATE, so two workers never run the same job).
//
// Graceful degradation: if the `jobs` table doesn't exist yet (migration not run),
// enqueue() runs the handler INLINE so nothing breaks — just without durability.
// Migration: migrations/001_jobs.sql
// ===========================================================================
import { config } from 'dotenv';
config({ override: true });
import { Limiter } from './infra.js';

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const INSTANCE = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const HANDLERS = new Map();
const workers = new Limiter(Number(process.env.JOB_CONCURRENCY) || 4, 'jobs');
let TABLE_OK = null;   // null=unknown, true/false after first probe
let RUNNING = false;
const nowIso = () => new Date().toISOString();

async function rest(path, opts = {}) {
  if (!SB || !KEY) { const e = new Error('no supabase'); e.status = 0; throw e; }
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...opts, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) { const t = await res.text().catch(() => ''); const e = new Error(`jobs db ${res.status} ${t.slice(0, 140)}`); e.status = res.status; throw e; }
  const txt = await res.text(); return txt ? JSON.parse(txt) : null;
}

// Register a handler: type -> async (payload, job) => result.
export function register(type, fn) { HANDLERS.set(type, fn); }
export function registered() { return [...HANDLERS.keys()]; }

async function tableExists() {
  if (TABLE_OK !== null) return TABLE_OK;
  try { await rest('jobs?select=id&limit=1'); TABLE_OK = true; }
  catch (e) { TABLE_OK = false; if (e.status && e.status !== 404 && e.status !== 400) console.error('[jobs] table probe:', e.message); }
  return TABLE_OK;
}

// Enqueue a job. Returns the job row ({id,status,...}). If the table is missing,
// runs inline and returns a synthetic finished job so callers still work.
export async function enqueue(type, payload = {}, { siteId = null, idempotencyKey = null, maxAttempts = 3, priority = 0 } = {}) {
  if (!HANDLERS.has(type)) throw new Error('Unknown job type: ' + type);
  if (!(await tableExists())) {
    const job = { id: 'inline-' + Date.now(), type, payload, status: 'running', inline: true };
    try { const result = await HANDLERS.get(type)(payload, job); return { ...job, status: 'done', result }; }
    catch (e) { return { ...job, status: 'failed', error: String(e.message).slice(0, 300) }; }
  }
  if (idempotencyKey) {
    const ex = await rest(`jobs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*`).catch(() => null);
    if (ex && ex[0] && ['queued', 'running', 'done'].includes(ex[0].status)) return ex[0];
  }
  const row = { site_id: siteId, type, payload, status: 'queued', max_attempts: maxAttempts, priority, idempotency_key: idempotencyKey };
  const out = await rest('jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const job = Array.isArray(out) ? out[0] : out;
  kick();
  return job;
}

export async function getJob(id) {
  if (String(id).startsWith('inline-')) return null;
  if (!(await tableExists())) return null;
  const out = await rest(`jobs?id=eq.${id}&select=*`).catch(() => null);
  return (out && out[0]) || null;
}
export async function listJobs(siteId, limit = 20) {
  if (!(await tableExists())) return [];
  const base = siteId ? `jobs?site_id=eq.${siteId}` : 'jobs?';
  const q = `${base}${siteId ? '&' : ''}order=created_at.desc&limit=${Math.min(limit, 100)}&select=id,type,status,attempts,error,created_at,updated_at`;
  return (await rest(q).catch(() => [])) || [];
}

// Atomically claim one due job: conditional UPDATE guarded by status=queued, so
// concurrent workers (even across instances) never grab the same row.
async function claimOne() {
  const due = await rest(`jobs?status=eq.queued&run_after=lte.${nowIso()}&order=priority.desc,created_at.asc&limit=5&select=id`).catch(() => []);
  for (const c of (due || [])) {
    const patched = await rest(`jobs?id=eq.${c.id}&status=eq.queued`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'running', locked_by: INSTANCE, locked_at: nowIso(), updated_at: nowIso() }) }).catch(() => null);
    if (patched && patched[0]) return patched[0];
  }
  return null;
}

async function finish(job, patch) { await rest(`jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: nowIso() }) }).catch(() => {}); }

async function runJob(job) {
  const fn = HANDLERS.get(job.type);
  if (!fn) { await finish(job, { status: 'failed', error: 'no handler for ' + job.type }); return; }
  try {
    const result = await fn(job.payload || {}, job);
    await finish(job, { status: 'done', result: result ?? null, error: null, attempts: (job.attempts || 0) + 1 });
  } catch (e) {
    const attempts = (job.attempts || 0) + 1;
    if (attempts < (job.max_attempts || 3)) {
      const backoff = Math.min(60000, 2000 * Math.pow(2, attempts));
      await finish(job, { status: 'queued', attempts, error: String(e.message).slice(0, 300), run_after: new Date(Date.now() + backoff).toISOString(), locked_by: null });
    } else {
      await finish(job, { status: 'failed', attempts, error: String(e.message).slice(0, 300) });
    }
  }
}

let kickPending = false;
function kick() { if (kickPending) return; kickPending = true; setTimeout(() => { kickPending = false; pump().catch(() => {}); }, 50); }

async function pump() {
  if (!(await tableExists())) return;
  let slots = workers.max - workers.active;
  while (slots-- > 0) {
    const job = await claimOne();
    if (!job) break;
    workers.run(() => runJob(job)).catch(() => {});
  }
}

export function startWorker() {
  if (RUNNING) return; RUNNING = true;
  // Crash recovery: re-queue jobs stuck 'running' >5 min (a prior instance died),
  // then start polling.
  setTimeout(async () => {
    try {
      if (await tableExists()) {
        await rest(`jobs?status=eq.running&locked_at=lt.${new Date(Date.now() - 5 * 60000).toISOString()}`, { method: 'PATCH', body: JSON.stringify({ status: 'queued', locked_by: null, updated_at: nowIso() }) }).catch(() => {});
        console.log('[jobs] durable queue active (concurrency ' + workers.max + ')');
      } else {
        console.log('[jobs] no jobs table — running inline (run migrations/001_jobs.sql to enable durability)');
      }
    } catch (e) {}
    pump().catch(() => {});
  }, 8000);
  setInterval(() => { pump().catch(() => {}); }, 5000);
}

export function stats() { return { instance: INSTANCE, tableOk: TABLE_OK, handlers: registered(), workers: workers.stats() }; }

export default { register, enqueue, getJob, listJobs, startWorker, stats, registered };
