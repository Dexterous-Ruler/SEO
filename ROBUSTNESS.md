# Sentinel — Robustness & Scale

An honest analysis of how far the platform scales, what was hardened, and the
roadmap to true industrial / multi-tenant scale.

## TL;DR
The platform was a well-built **single-instance** app. It is now hardened to hold
up under **heavy concurrent load on one box** (resilient providers, backpressure,
graceful deploys, caching, observability). Going beyond one box — true horizontal
scale and multi-tenant isolation — needs the **Tier 2** items below (shared state +
auth + a durable job queue), which are scoped here.

---

## What was limiting it (grounded in the code)

| # | Limit | Impact at scale |
|---|---|---|
| 1 | DataForSEO calls had **no timeout / retry / concurrency cap** | one hung call blocked; a mass sweep 429-stormed or blew the budget |
| 2 | Anthropic had retry+timeout but **no concurrency cap** | batch generations 429-storm |
| 3 | **No backpressure** — every request on one event loop | heavy endpoints starve the loop under load |
| 4 | **No graceful shutdown** | Koyeb SIGTERM on redeploy severs in-flight writes |
| 5 | Scheduler due-state **in-memory**; caches per-process | can't run >1 instance (double charges/emails); redeploy resets the schedule |
| 6 | **No durable job queue** | long tasks aren't checkpointed/retried; a crash loses progress |
| 7 | **No API auth** (CORS `*`) | fine for a single trusted operator; blocks true multi-tenant |
| 8 | **Thin observability** (`console.log`) | no load/health/error visibility |

---

## Tier 1 — shipped (in-process, additive, zero new deps)

New module **`backend-api/infra.js`** — a resilience toolkit, wired in:

- **Concurrency limiters** (`limiters.*`, tunable by env): Anthropic (6), DataForSEO
  (5), and a global **heavy-endpoint** pool (24). Bursts queue instead of stampeding
  the loop or the provider. → fixes #2, #3.
- **DataForSEO transport hardened**: every call now has a **30s timeout**, **transient
  retry with backoff**, and the concurrency cap — logical errors (NO_UNITS/auth) are
  *not* retried, so the UI keeps its specific handling. → fixes #1.
- **Circuit breakers** (Anthropic, DataForSEO): after repeated failures, fail fast for
  a cooldown instead of piling work on a dead provider (returns `503 Retry-After`).
- **TTL+LRU cache** on the costly idempotent DataForSEO reads (backlink summary,
  referring domains, anchors, competitor intersection) — 30-min reuse, so profile /
  monitor / gap don't re-charge for identical pulls. → cuts cost & latency.
- **Backpressure**: heavy routes run through the heavy limiter; when the queue exceeds
  `HEAVY_MAX_QUEUE` (80) the server sheds load with `503 Retry-After` instead of
  tipping over. → fixes #3.
- **Per-request timeout** (280s safety net → `504`) and a **6 MB body cap** (→ `413`).
- **Graceful shutdown**: `SIGTERM`/`SIGINT` stop new work, drain in-flight (25s cap),
  then exit — deploys no longer sever mid-write requests. → fixes #4.
- **Observability**: `GET /status` exposes uptime, in-flight count, limiter/breaker
  state, and cache hit-rates. → fixes #8.

Tunables (env): `ANTHROPIC_CONCURRENCY`, `DATAFORSEO_CONCURRENCY`, `HEAVY_CONCURRENCY`,
`HEAVY_MAX_QUEUE`, `REQ_TIMEOUT_MS`, `MAX_BODY_BYTES`.

**Net effect:** a single Koyeb instance now degrades gracefully (queues, sheds, retries,
fails fast) instead of falling over, and survives redeploys cleanly.

---

## Tier 2 — to reach true industrial / multi-tenant scale (roadmap)

1. **Durable job queue + workers — ✅ SHIPPED** (`backend-api/jobs.js`, `migrations/001_jobs.sql`).
   Long tasks move off the request path into a Supabase `jobs` table with a bounded
   worker pool, retry-with-backoff, idempotency keys, crash recovery (boot-time reclaim
   of stuck jobs), and **multi-instance-safe claims** (conditional UPDATE → no double
   runs). Enqueue via `POST /jobs/run`, poll `POST /jobs/get`. The slow 12-call outreach
   prep now runs here. **Graceful degradation:** until the migration is run, jobs execute
   inline (no durability) so nothing breaks. `GET /status` reports queue state.
   Remaining Tier-2 (need shared state / new infra):
2. **Horizontal scaling (Koyeb min ≥ 2) — ✅ MOSTLY SHIPPED.**
   - **Scheduler leader lock** — ✅ `scheduler_lock` row + 90s TTL lease + 30s heartbeat
     (`migrations/002_scheduler.sql`). Only the leader ticks → no double charges/emails;
     fails over automatically if the leader dies. Degrades to single-instance if the
     table is absent.
   - **Persisted scheduler state** — ✅ `scheduler_runs` table so due-ness survives
     redeploys and is shared across instances.
   - The durable job queue is already multi-instance safe (conditional claims).
   - Remaining: **shared cache** — the in-process `TTLCache` / credential caches are
     still per-instance (just means a few duplicate provider reads across instances, not
     incorrectness). Move to a Supabase table / Redis only if cache coherence matters.
   - **To activate:** run `migrations/002_scheduler.sql`, then set Koyeb instances ≥ 2.
3. **API authentication + multi-tenant isolation.** A login layer (Supabase Auth or a
   signed session) + per-tenant ownership checks on every `siteId`, replacing the open
   CORS `*` API. Required before exposing the console to multiple customers.
4. **Rate limiting per tenant/IP** (token bucket) to stop one tenant exhausting shared
   provider budgets.
5. **Structured logging + metrics export** (JSON logs + a Prometheus/OpenTelemetry
   `/metrics`), error tracking (Sentry), and per-provider spend dashboards.
6. **DB efficiency**: replace the O(sites) credential-fallback scans (`getAirtablePat`/
   `getGscSa`) with an indexed lookup; add DB indexes on hot query paths.
7. **Provider spend caps** — hard per-day budget gates on DataForSEO/Anthropic with
   alerting, beyond the current coarse balance check.

### Suggested migrations (Tier 2, when ready)
`jobs`, `job_runs`, `scheduler_lock`, `app_kv` (shared cache), plus the backlink
snapshot tables from `LINK-ENGINE-PLAN.md` for historical trends. Each is keyed by
`site_id` to preserve the existing multi-site isolation model.
