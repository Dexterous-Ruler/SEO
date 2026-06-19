# Experience Monitor — Phase 1 Implementation Plan (MVP: detect + GSC join + narrow auto-fix)

> Status: PLAN ONLY — no code changes. Builds on the **inert scaffold** shipped in commit `b2a5c54`
> (see EXPERIENCE-MONITOR-PLAN.md, esp. §8 integration + §12 charter). Phase 1 turns the dark plumbing
> into a working MVP on **one canary site first**, preserving the additive/flag-gated contract.
> Effort is solo-engineer working days. Compliance posture: **cookie-consent gated** (chosen).

---

## 0. Where we are (the scaffold already in place — do NOT rebuild)

Provisioned 2026‑06‑18, all INERT until `RUM_ENABLED` + per-site arm:
- **DB:** `ux_events`, `ux_defects`, `sites.rum_key/rum_armed/rum_signed_off` (migration 004, applied).
- **Backend (`server.js`):** `POST /ux-beacon` ingest (shed → token bucket → `rum_key`→site → PII-key reject → insert, 204) + `/beacon-status`, `/ux-defects`, `/ux-defect-action` (ignore only), `/arm-beacon`.
- **Scheduler:** `ux-rollup` (windowed group→upsert, **no GSC/RICE yet**) + `ux-prune` (72h), both guarded by `RUM_ENABLED`.
- **Beacon (`web/ux-beacon.js`):** 7 deterministic events, consent-gated, batched, sendBeacon. **No pageview denominator yet.**
- **UI (`web/soft-experience.jsx`):** onboarding + worklist + drill-down; Apply gated to HIGH+fixable. **Fix-loop + clicks-exposed not yet computed.**
- **mu-plugin v1.9.0 on all 6 sites:** `seoagent_ux_beacon` + `/set-ux-beacon` + consent-gated loader + 404 marker.

**Phase 1 = fill the 5 deferred gaps:** (1) defect-rate denominator, (2) GSC join + `clicks_exposed` + RICE in the rollup, (3) the fix-loop (propose/apply → existing proposals/approval/mu-plugin), (4) rollup hardening (watermark + atomic incremental merge + time budget), (5) ingest hardening + `/status` gauges + per-site circuit-breaker. Plus the **canary CWV A/B gate** and the **pilot**.

---

## 1. Phase-1 deliverables (work items, file-level)

### WI-1 — Pageview denominator (so `defect_rate` is real, not raw counts)
**Why:** `clicks_exposed = gsc_clicks × defect_rate × confidence`. Without a pageviews denominator, `defect_rate` is undefined and the hero metric is just occurrence counts.
- **Beacon (`web/ux-beacon.js`):** on each *armed + consented + sampled-in* page-view, emit ONE lightweight event `{t:'pageview'}` (no selector/detail). Respects the same sample rate as the idle scans. Adds ≤1 event/view.
- **Ingest (`server.js`):** add `'pageview'` to `UX_EVENT_TYPES`. (No schema change — it's a row in `ux_events`.)
- **Rollup:** count `pageview` rows per `page` over the window → `pageviews_seen`; `defect_rate = occurrences / max(pageviews_seen,1)` per defect (capped at 1.0). For the always-100% high-value events that bypass sampling, divide by an estimated full-traffic denominator: `pageviews_seen / sample_rate` (store `sample_rate` on the run or read from `sites`), so error rates aren't inflated by the 100% capture. Label as directional.
- **Effort:** 0.5 d.

### WI-2 — GSC join + `clicks_exposed` + RICE (THE WEDGE)
**Why:** the only thing no competitor can do. Reuse existing analytics — **no new analytics modules**.
- **Rollup (`scheduler.js` `jobUxRollup`):** after aggregating defects per `page`:
  - Pull the site's GSC landing-page map **from cache, not a fresh API call** — reuse the snapshot the existing `gsc-health` job already fetches (persist top-pages into a small cache or read `gsc_daily`/a cached `gsc.snapshot`). Normalise paths with the SAME function `prioritize-findings` uses (strip origin/trailing slash). Map `page → {gsc_clicks, gsc_position, ctr}`.
  - `confidence_weight`: high=1.0, moderate=0.5, low=0.25.
  - `clicks_exposed = round(gsc_clicks × defect_rate × confidence_weight)`. **No `conv_at_risk`, no `page_value_per_conversion`** (don't exist; banned by the master plan §1).
  - `rice_score = prioritization.js` with Reach=`gsc_clicks`, Impact=severity map, Confidence=tier, Effort=fix-channel cost. Reuse `prioritizeFindings(trafficByPage, valueByPage)`.
  - Optional `traffic-value.js` £ *page context only* (clicks×CTR×CPC) — shown as context, never "lost".
- **GSC cost guard:** at most one GSC read per site per rollup, cached ≥1h; if no GSC connected, `clicks_exposed=null` and the row shows "no GSC data — connect Search Console".
- **Effort:** 1.5 d.

### WI-3 — Atomic incremental rollup (replace the scaffold's windowed-replace)
**Why:** the scaffold rollup REPLACES occurrences each run (PostgREST merge-duplicates overwrites). A defect tracker must ACCUMULATE, and must not double-count across hourly ticks.
- **New migration `005_experience_rollup.sql`:** a Postgres function `ux_defect_merge(rows jsonb)` doing `INSERT ... ON CONFLICT (site_id,signature) DO UPDATE SET occurrences = ux_defects.occurrences + excluded.occurrences, sessions = …, last_seen = greatest(…), pageviews_seen = …`. Atomic increment, callable via PostgREST RPC. (Also add a `scheduler_runs`-style watermark usage — reuse the existing `scheduler_runs` table; no new table.)
- **Rollup cursor (`scheduler.js`):** read the `ux-rollup` watermark (last processed `received_at`) from `scheduler_runs`; drain `ux_events` `received_at > watermark` ordered asc, in batches, until caught up **or** a ~2–3 s wall-clock budget; advance the watermark **only after** a successful batch (so a crash re-processes, never skips). Never blocks `auto-index`/`gsc-health`/`apply-css` on the shared hourly tick.
- **Effort:** 1.5 d.

### WI-4 — The fix-loop (propose/apply → existing proposals → approval → mu-plugin)
**Why:** the loop is half the wedge. Reuse the EXISTING approval/apply pipeline — **no new fix-side routes for v1.**
- **`server.js` `/ux-defect-action`:** implement `propose`:
  - Map defect → a `proposals` row via the remediation matrix (master plan §6), reusing `db.createProposal`:
    - `broken_resource` (same-origin img, known-good replacement) → channel `/webp-map` swap.
    - `broken internal link` / `dest_404` re-pointable (target resolvable from GSC map) → channel `/insert-link` re-point.
    - `tap-target`/`contrast` → channel `/css` scoped rule (blast-radius-checked).
    - `broken_cta` static-href add-link sub-case → `/insert-link`.
    - everything else (`js_error`, `unhandled_rejection`, `ajax_4xx`, off-WP `dest_404`, form copy) → **GUIDED**: a proposal with `channel:'manual'` + a Claude root-cause hypothesis (reuse `claude.draftFix`), NOT auto-appliable.
  - Write `confidence` into the proposal; set `ux_defects.status='proposed'`, `proposal_id`.
  - `apply` simply routes the existing proposal through the **existing** `/apply-link` / `/apply-css` path (or instructs the UI to open the Review Queue). **Reuse** the verified safety chain: `write_armed===false → blocked`, DRY_RUN, read→write→read-back → `verified|silent-failure`, `detectLiveCms` guard, reversible `activity` ledger.
  - On verified apply: `ux_defects.status='fixed'`.
- **New gate (independent of `write_armed`):** keep the existing `rum_armed` (telemetry) separate from `write_armed` (fixes). Detecting ≠ permission to fix.
- **UI (`soft-experience.jsx`):** the drill-down's `SoftDiff` fix preview + the safety-chain chips; `[Apply]` → `uxDefectAction('apply')` → lands in the existing Review Queue for human approval (no new approval UI).
- **Effort:** 2 d.

### WI-5 — Ingest hardening + `/status` gauges + per-site circuit-breaker
**Why:** the events we sample at 100% (`js_error`) are exactly what a broken deploy floods → self-DoS.
- **`server.js` ingest:** add a per-site **`CircuitBreaker`** (reuse `infra.js`): if a site's ingest rate crosses a threshold, auto-flip `sites.rum_armed=false` + write an `activity` alert. Edge-cap the always-100% bucket per `(site, stackHash)` — count-only after N identical in a window. Counters: `dropped_by_cap`, `dropped_by_ratelimit`, `sampled_out_estimate`.
- **`/status`:** surface ux ingest rate, the dropped counters, and the rollup **backlog gauge** = `max(received_at) − watermark` (the early warning the silent row-cap lacks). Reuse `infraStats()`.
- **Row-cap guard:** refuse inserts when `ux_events` is near a configured ring cap (cached count); `ux-prune` + the cap are the primary guards, the 72h TTL a backstop.
- **Effort:** 1 d.

### WI-6 — Canary CWV A/B gate (Phase-0 precondition, executed in the pilot)
**Why:** the beacon must not regress the INP/LCP we sell.
- Arm ONE canary site at low sample. Beacon self-measures its long-task contribution (already designed) and self-disables over a tiny budget. Measure **real-user INP/LCP ON vs OFF** for ~2 weeks (PSI/CrUX + the beacon's own timing). **Gate fleet rollout on no regression.**
- **Effort:** setup 0.5 d + 2 weeks elapsed (passive).

### WI-7 — Pilot + success criteria (decision gate before expanding)
- Arm **one** signed-off canary; after data accrues, confirm: worklist surfaces ≥1 real deterministic defect on a GSC-ranked page the operator agrees is worth fixing, AND ≥1 defect is **closed** through the approval→mu-plugin loop. Watch `/status inFlight`, Postgres growth, beacon CWV.
- **Expand to a 2nd site only if** the loop closes. If it stays detect-only with no closed fix, STOP — it shouldn't outrank GEO-rigor / LINK-ENGINE for solo-engineer time.

---

## 2. Data-model delta (Phase 1)
- **No change to `ux_events`/`ux_defects` columns** (004 already has `pageviews_seen`, `defect_rate`, `gsc_clicks`, `gsc_position`, `clicks_exposed`, `rice_score`, `anomaly_z`, `proposal_id`).
- **New `migrations/005_experience_rollup.sql`:** the `ux_defect_merge(jsonb)` atomic-upsert RPC (WI-3). Additive, idempotent.
- **`UX_EVENT_TYPES`** gains `'pageview'` (code, not schema).

## 3. Sequence + dependencies
```
WI-1 pageview ──┐
WI-3 rollup cursor + 005 RPC ──┐
WI-2 GSC join + RICE ───────────┴─► (rollup produces real clicks_exposed)
WI-5 ingest hardening (parallel, independent)
WI-4 fix-loop (needs WI-2 so proposals carry clicks_exposed for ranking)
WI-6 canary A/B  ─► WI-7 pilot ─► go/no-go to expand
```
Buildable largely in parallel (WI-1/3/5 independent of WI-2/4). Suggested order: WI-1 → WI-3 → WI-2 → WI-5 → WI-4, then arm canary (WI-6) → pilot (WI-7). **~6.5 d build + 2 wk canary.**

## 4. Preserves the additive/inert contract (no regression)
- Still gated by `RUM_ENABLED` + `rum_armed` + consent; nav still hidden unless `window.SENTINEL_RUM`.
- All Phase-1 code lives in the SAME files the scaffold already touched (server.js ux-* routes, scheduler ux-* jobs, soft-experience.jsx, ux-beacon.js) + one new migration. **No existing route/screen/job behaviour changes.**
- Reuses `gsc.js`, `prioritization.js`, `traffic-value.js`, `anomaly.js`, `db.createProposal`, the Review Queue, `/apply-link`/`/apply-css`, `infra.js` — zero new analytics or approval UI.

## 5. Phase-1-specific risks
| Risk | Mitigation |
|---|---|
| GSC read cost per rollup (per-site API) | Read from cache/`gsc_daily`, ≤1/site/hour; degrade to `clicks_exposed=null` if absent. |
| Incremental rollup double-counts or skips | Atomic `ux_defect_merge` RPC + watermark advanced only after a successful batch. |
| Pageview pings inflate ingest volume | Sampled like the idle scans; pageview is the lightest event; counted, not stored long (72h prune). |
| 100%-event denominator skews defect_rate | Divide always-100% counts by `sample_rate` to estimate full-traffic rate; label directional. |
| Auto-fix mis-targets a drifted selector | Fix re-verifies selector (read→write→read-back); only HIGH+stable selectors are Apply-eligible. |
| Canary shows INP regression | Beacon self-disables over budget; fleet rollout gated on the A/B. |

## 6. Open questions (carry from master plan §11, now Phase-1-specific)
1. **Canary site choice** — which of the 6 to arm first? (goodfor.app is the most-tested + no SEO-plugin; settlement has a CDN/bot layer.)
2. **Auto-fix appetite** — arm the narrow auto-fix subset (`/insert-link`/`/webp-map`/`/css`) on the canary, or run **detect + GUIDED only** until you've watched the verify-after-write loop a few times?
3. **Sampling default** for the canary — 5% (faster signal) vs 2% (lighter)?
4. **GSC dependency** — fine to show `clicks_exposed` only for GSC-connected sites (all 6 are), or need a non-GSC fallback ranking?

— End of Phase-1 plan. No code changed; this doc is the deliverable. Implement on your go-ahead (and after the canary compliance sign-off).
