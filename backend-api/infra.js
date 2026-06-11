// ===========================================================================
// infra.js — zero-dependency resilience + observability toolkit.
// Makes the single-process server hold up under industrial load: bounded
// concurrency (no event-loop / provider stampedes), timeouts, retry-with-backoff,
// circuit breakers (fail fast when a provider is down), and a TTL+LRU cache.
// Everything is in-memory and per-process; horizontal scaling adds a shared
// store on top (see ROBUSTNESS.md), but these alone lift a single box a long way.
// ===========================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Concurrency limiter ─────────────────────────────────────────────────────
// Run at most `max` tasks concurrently; the rest queue. Prevents a burst of
// heavy work (mass Claude/DataForSEO calls, many sites at once) from starving
// the event loop or stampeding a provider into 429s.
export class Limiter {
  constructor(max = 8, name = 'limiter') { this.max = Math.max(1, max); this.name = name; this.active = 0; this.q = []; this.peak = 0; this.totalQueued = 0; this.totalRun = 0; }
  get pending() { return this.q.length; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        this.active++; this.peak = Math.max(this.peak, this.active); this.totalRun++;
        Promise.resolve().then(fn).then(
          (v) => { this.active--; this._next(); resolve(v); },
          (e) => { this.active--; this._next(); reject(e); },
        );
      };
      if (this.active < this.max) task(); else { this.totalQueued++; this.q.push(task); }
    });
  }
  _next() { if (this.q.length && this.active < this.max) { const t = this.q.shift(); t(); } }
  stats() { return { active: this.active, queued: this.q.length, max: this.max, peak: this.peak, totalRun: this.totalRun }; }
}

// ── Timeout ─────────────────────────────────────────────────────────────────
export function withTimeout(promise, ms, label = 'operation') {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(`${label} timed out after ${ms}ms`), { code: 'ETIMEOUT', transient: true })), ms); });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(t));
}

// ── Retry with exponential backoff + jitter ─────────────────────────────────
export async function withRetry(fn, { retries = 2, base = 400, factor = 2, jitter = true, retryOn = () => true } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(i); }
    catch (e) {
      last = e;
      if (i === retries || !retryOn(e)) break;
      let d = base * Math.pow(factor, i);
      if (jitter) d = d / 2 + Math.random() * (d / 2);
      await sleep(d);
    }
  }
  throw last;
}

// ── Circuit breaker ─────────────────────────────────────────────────────────
// After `threshold` consecutive failures, open for `cooldownMs` (fail fast so we
// don't pile work onto a dead provider), then half-open (one trial) → close on success.
export class CircuitBreaker {
  constructor(name, { threshold = 6, cooldownMs = 30000 } = {}) { this.name = name; this.threshold = threshold; this.cooldownMs = cooldownMs; this.fails = 0; this.state = 'closed'; this.openedAt = 0; this.trips = 0; }
  async run(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) throw Object.assign(new Error(`${this.name} is temporarily unavailable (circuit open) — retry shortly`), { code: 'ECIRCUIT', transient: true });
      this.state = 'half';
    }
    try { const v = await fn(); this.fails = 0; this.state = 'closed'; return v; }
    catch (e) { this.fails++; if (this.fails >= this.threshold) { this.state = 'open'; this.openedAt = Date.now(); this.trips++; } throw e; }
  }
  stats() { return { state: this.state, fails: this.fails, trips: this.trips }; }
}

// ── TTL + LRU cache ─────────────────────────────────────────────────────────
// For expensive idempotent reads (DataForSEO snapshots, backlink profiles) so we
// don't re-pay for identical queries. Bounded size (LRU evict) + per-entry TTL.
export class TTLCache {
  constructor({ max = 500, ttlMs = 300000 } = {}) { this.max = max; this.ttlMs = ttlMs; this.m = new Map(); this.hits = 0; this.misses = 0; }
  get(k) {
    const e = this.m.get(k);
    if (!e) { this.misses++; return undefined; }
    if (Date.now() > e.exp) { this.m.delete(k); this.misses++; return undefined; }
    this.m.delete(k); this.m.set(k, e); // bump LRU
    this.hits++; return e.v;
  }
  set(k, v, ttl) { if (this.m.size >= this.max) { const first = this.m.keys().next().value; if (first !== undefined) this.m.delete(first); } this.m.set(k, { v, exp: Date.now() + (ttl || this.ttlMs) }); }
  // Cache-or-compute. Only caches non-null/undefined results.
  async wrap(k, fn, ttl) { const c = this.get(k); if (c !== undefined) return c; const v = await fn(); if (v !== undefined && v !== null) this.set(k, v, ttl); return v; }
  stats() { const t = this.hits + this.misses; return { size: this.m.size, hits: this.hits, misses: this.misses, hitRate: t ? Math.round((this.hits / t) * 100) : 0 }; }
}

// ── Shared singletons (tune via env) ────────────────────────────────────────
const N = (v, d) => (Number(v) > 0 ? Number(v) : d);
export const limiters = {
  anthropic: new Limiter(N(process.env.ANTHROPIC_CONCURRENCY, 6), 'anthropic'),
  dataforseo: new Limiter(N(process.env.DATAFORSEO_CONCURRENCY, 5), 'dataforseo'),
  heavy: new Limiter(N(process.env.HEAVY_CONCURRENCY, 24), 'heavy-endpoints'),
};
export const breakers = {
  anthropic: new CircuitBreaker('Anthropic', { threshold: 8, cooldownMs: 20000 }),
  dataforseo: new CircuitBreaker('DataForSEO', { threshold: 6, cooldownMs: 30000 }),
};
export const caches = {
  dataforseo: new TTLCache({ max: 1000, ttlMs: 30 * 60 * 1000 }), // 30-min reuse of identical pulls
};

// Max queue depth for heavy endpoints before we shed load (backpressure → 503).
export const HEAVY_MAX_QUEUE = N(process.env.HEAVY_MAX_QUEUE, 80);

export function infraStats() {
  return {
    limiters: Object.fromEntries(Object.entries(limiters).map(([k, l]) => [k, l.stats()])),
    breakers: Object.fromEntries(Object.entries(breakers).map(([k, b]) => [k, b.stats()])),
    caches: Object.fromEntries(Object.entries(caches).map(([k, c]) => [k, c.stats()])),
  };
}

export default { Limiter, withTimeout, withRetry, CircuitBreaker, TTLCache, limiters, breakers, caches, infraStats, HEAVY_MAX_QUEUE };
