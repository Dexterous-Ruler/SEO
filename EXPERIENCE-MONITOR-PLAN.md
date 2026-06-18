# Experience Monitor — UX & Conversion-Defect Monitoring (Implementation Plan)

> Status: PROPOSAL — awaiting operator go/no-go and per-site compliance sign-off.
> Owner: solo operator/engineer. Stack: zero-dep Node (`backend-api/server.js`) + Supabase + single Koyeb nano + mu-plugin (`wp-plugin/seo-agent-optimize.php` v1.8.0).
> This doc matches the repo's existing `*-PLAN.md` style: concrete, honest, phased, file-level. Verified against the live code (route table at `server.js:290`, `HEAVY_ROUTES` at `:2168`, `MAX_BODY` 6 MB at `:163`, hourly scheduler tick at `scheduler.js:229`, HMAC `signState/verifyState` at `server.js:136-147`, CORS `*` at `:116`, next migration number `004`).

---

## 1. Executive summary + recommendation

**The idea.** Inject a tiny first-party JavaScript beacon via the existing mu-plugin that captures conversion-hurting client-side defects (JS errors, broken resources, AJAX 4xx, destination-404 loads, broken/empty CTAs, native form-validation failures, and later dead/rage clicks, INP jank, form abandonment). Surface each defect on the dashboard, **join it to GSC organic landing-page traffic** so it carries an *organic-clicks-exposed* figure no competitor can produce, rank it in the existing RICE worklist, and one-click-fix the genuinely deterministic subset through the existing approval → mu-plugin → verify-after-write loop.

**Honest market truth.** Defect *detection* is a solved, commoditised, free-tier problem. Microsoft Clarity does dead clicks, rage clicks, quickbacks, JS errors, heatmaps **and** session replay, free, forever, at 1 PB/month. "We detect rage clicks" is not a product. The only thing Sentinel can do that no incumbent structurally can: **tie a client-side UX defect to ORGANIC landing-page traffic via the GSC join you already own, rank it alongside SEO findings, and close the loop by pushing the fix live through the mu-plugin.** Clarity's revenue tie is to paid-ads CPA/ROAS; it cannot price an organic defect. That join + that loop is the entire wedge.

**Recommendation: GO-WITH-MVP — re-scoped hard, and gated behind two preconditions.**

Build it, but **not** the 11-signal / `conv_at_risk` / broad-auto-fix subsystem the maximal design describes. Both critics independently land on the same verdict: the design as written (a) over-models how "free" raw ingest is on a 0.1 vCPU / 512 MB nano sharing one event loop and a 500 MB shared Supabase, (b) over-claims the no-consent posture, and (c) buries the one honest moat under a fabricated revenue funnel (`baseline_conv_rate` priors and a `page_value_per_conversion` that **does not exist** anywhere in `traffic-value.js`).

So the recommendation is **conditional GO** on the following non-negotiables, each of which is baked into the MVP scope below:

1. **Reframe the hero metric** from "organic conversions/revenue at risk" to **"organic clicks exposed to this defect"** = `gsc_clicks_on_page × defect_rate × confidence_weight`. Zero new analytics, defensible (a measured co-occurrence, not an invented funnel). Show £ traffic-value (`clicks × CTR × CPC`, which *does* exist) only as page context — never as "you lost £X". **Drop `conv_at_risk`, `baseline_conv_rate`, `page_value_per_conversion` entirely from v1.**
2. **MVP collects only deterministic, 100%-sampled, HIGH-confidence events**: `js_error`, `unhandled_rejection`, `broken_resource` (same-origin), `ajax_4xx`, `dest_404`, `broken_cta` (static `href="#"`/empty), `form_validation`. **No** dead/rage/console/abandon/INP, **no** MutationObserver, **no** longtask in MVP — that removes the false-positive risk, the heaviest client cost, and the volume-starvation problem on small UK pages.
3. **Auto-fix is scoped to the ~2 genuinely deterministic classes** the remediation matrix verified (broken internal-link re-point via `/insert-link`; tap-target/contrast via `/css`; broken-image URL swap via `/webp-map`). Everything else is **detect + Claude root-cause + ticket**. The "push fixes" claim is always scoped to "the deterministic ones," never broad.
4. **Compliance is a hard precondition, not a footnote**: per-site `rum_armed` flag defaults **OFF**; a one-page DPIA-lite, a working visitor opt-out, and a privacy-notice line ship and are signed off **per site** *before* the beacon collects its first event.
5. **Ingest is protected from day one**, not via "break-glass": a cheap-path pre-`readBody` shed (Content-Length + in-memory token bucket *before* JSON.parse), aggregate-leaning storage with a hard-capped raw ring, and an **automatic per-site circuit-breaker** that flips `rum_armed` off on ingest spikes — because the events we mark "always 100%" (`js_error`, `console_error`) are exactly what a single broken deploy floods.

**Why not full GO:** the maximal design will self-DoS the nano on a beacon flood and risk the Supabase 500 MB read-only wall (which takes the *whole platform* down — jobs, proposals, audits), and its fabricated £ math poisons the only credible differentiator. **Why not NO-GO:** the wedge is real, the reuse of `gsc.js` + `prioritization.js` + the proposals/approval/mu-plugin loop is genuinely stack-aligned, and the deterministic-events MVP is small, honest, and fast-to-value. Ship the thin wedge; prove the loop closes on real sites; only then expand.

**Sequencing caveat (from the business critic):** the roadmap's flagged credibility risks (GEO share-of-voice rigor, single-run PSI noise) and the higher-ROI LINK-ENGINE Phase 1 compete for the same solo-engineer time. Experience Monitor is the more *novel/defensible* story but the *riskier ROI*; treat it as a small additive screen sequenced **after** the demo-killing credibility fixes, not ahead of them.

---

## 2. The idea, refined — what we WILL and WON'T detect

The wedge lives entirely in the **JOIN** (defect → GSC organic traffic → RICE) and the **LOOP** (push-to-fix via the mu-plugin), **not** the beacon. We concede defect breadth and replay to Clarity and explicitly link out to it.

### WILL detect (MVP — deterministic, HIGH-confidence, 100%-sampled)
| Class | Why it's in MVP |
|---|---|
| `js_error` (uncaught) | `window.onerror`/capture-phase `error` — API-grade, real on one occurrence, cheap. |
| `unhandled_rejection` | `unhandledrejection` — same. |
| `broken_resource` (same-origin img/script/link) | capture-phase `error` + `PerformanceObserver('resource')` `responseStatus>=400`; transferSize/decodedBodySize fallback. |
| `ajax_4xx` (first-party fetch/XHR 4xx) | passive `PerformanceObserver('resource')` first; patch fetch/XHR only if needed (see §5 CWV note). |
| `dest_404` | mu-plugin stamps `<meta name="sentinel-404">` on its 404 template; beacon reports "I loaded ON a 404, referred from path X". Exact and free. |
| `broken_cta` (static) | idle DOM scan for `a[href="#"]`/`javascript:void(0)`/empty on CTA-class elements. Deterministic markup defect. |
| `form_validation` | Constraint Validation API `invalid` events — **field name/id/type + validity flag only, NEVER the value**. |

### WON'T detect in MVP — DEFERRED to v2 (heuristic, high-FP, replay-adjacent — where Clarity wins)
`dead_click`, `rage_click`, `console_error`, `form_abandon`, `inp_slow`. These are the highest false-positive, lowest-fixability signals; they need MutationObserver/longtask machinery that loads the nano and risks regressing the very INP we sell; and on 6 small UK sites at low sampling they take *weeks* to cross a meaningful threshold — so the worklist looks empty exactly when first demoed. Defer until the wedge is proven.

### NEVER detect (hard architectural non-goals — void the DUAA exception / lose to Clarity)
Session replay, DOM snapshots, mouse-path recording, keystroke capture, **any** form field value, cross-page funnels, persistent per-visitor identity, full-navigation-404 *prediction* (only destination-side detection), raw IP.

### The organic-revenue framing (the wedge), stated honestly
Each defect row shows: the **landing page**, its **GSC clicks/position**, the **organic clicks exposed** to the defect, and a **RICE rank**. The one-line pitch:

> *"We find the broken CTA / 404 / JS error on the page that ranks #3 for your money keyword, tell you how much organic traffic it's exposing, and one-click-fix the deterministic ones — for the rest we hand you the exact change."*

The join is **correlational, not causal** — the beacon proves a defect *co-occurred* on sessions to a high-traffic page, not that a conversion was lost. The UI labels everything "exposed / directional," never "lost / measured" — the same honesty band the codebase already applies to PSI median/IQR noise.

---

## 3. Signal taxonomy

`H` = HIGH confidence (deterministic, auto-remediation *eligible* on the fixable subset). `M` = MODERATE (heuristic/inferred, advisory-only, never auto-fixed). `L` = LOW (cross-origin opaque, down-weighted).

| Defect class | Tier | How detected (browser API) | Fixability tier | Example |
|---|---|---|---|---|
| `js_error` | H | `addEventListener('error')` (msg, src, line, stackHash) | **DETECT** (can't patch theme/vendor JS) | `TypeError: cannot read 'submit' of null` on `/contact` |
| `unhandled_rejection` | H | `addEventListener('unhandledrejection')` (reason→scrubbed) | **DETECT** | rejected `fetch` promise in checkout |
| `broken_resource` (same-origin) | H | capture `error` + `PerfObserver('resource')` `responseStatus>=400` | **AUTO** (narrow: URL swap via `/webp-map`) | `/img/hero.png` → 404 |
| `broken_resource` (cross-origin) | L | sizes/status masked unless `Timing-Allow-Origin` | **GUIDED** (human-confirm) | CDN image reads `status:0` |
| `ajax_4xx` | H | passive `PerfObserver('resource')`; patched fetch/XHR fallback | **DETECT** (backend's code) | `POST /wp-json/.../submit → 422` |
| `dest_404` | H | mu-plugin 404 marker meta + referrer path | **GUIDED** → AUTO if re-pointable | landed on 404 referred from `/blog/old-post` |
| `broken_cta` (static href) | M→H* | idle DOM scan `href ∈ {#, javascript:void(0), ''}` | **GUIDED** (markup repair) / AUTO sub-case | hero "Start application" `<a href="#">` |
| `broken internal link` | H | `ajax_4xx` / `dest_404` on first-party path | **AUTO** (re-point via `/insert-link`) | nav link → removed page with successor |
| `form_validation` | H (native)/M (JS) | Constraint Validation `invalid` (name/type/validity) | **GUIDED** (copy) / AUTO (CSS affordance) | `email` field `typeMismatch` repeatedly |
| `tap-target / contrast` | H | deterministic geometry/contrast at idle scan | **AUTO** (`/css`, scoped rule) | CTA `<44px` on mobile |
| **— v2 —** | | | | |
| `dead_click` | M | capture `pointerup` + transient MutationObserver window | **DETECT** (highest FP) | click on decorative div, no nav/mutation |
| `rage_click` | M | click ring-buffer, ≥3 same selector in ~700 ms | **DETECT** (symptom) | 5 clicks on dead CTA |
| `console_error` | M | restore-safe `console.error/warn` patch | **DETECT** (very noisy) | 3rd-party tag flood |
| `form_abandon` | M | last-focused field at page-hide, no submit | **DETECT** | drop-off at `phone` field |
| `inp_slow` | H | `PerfObserver('event'/'longtask'/LoAF)` p98 | **DETECT** (theme JS cost) | INP 612 ms on `/apply` |

\* `broken_cta` is stored MODERATE because it's a composite, upgraded to HIGH only for the deterministic static-href sub-case.

---

## 4. Architecture

Two-tier, aggregate-leaning, every query scoped by `site_id` (service role bypasses RLS — the filter is the *only* tenant boundary). The beacon path is the cheapest route in `server.js`: no Claude, no WP call, no external fetch, no synchronous heavy work, and a **cheap shed before `readBody`/JSON.parse**.

**Components**
- **Client snippet** (`web/ux-beacon.js`, hand-written vanilla, <5 KB gzip): inlined by the mu-plugin in `wp_footer`, behind per-site arm flag, session-sampled, scrubs PII at source, batches, flushes via `sendBeacon` on `visibilitychange→hidden`.
- **Ingest** (`POST /ux-beacon`, special-cased *before* the `routes` table at `server.js:290`, returns **204 empty**, **NOT** in `HEAVY_ROUTES`): Content-Length shed → token bucket → HMAC `rum_key`→`site_id` → Origin allowlist → schema allowlist → row-cap guard → dedicated tiny `Limiter` → single batched insert.
- **Storage** (`migrations/004_experience.sql`): `ux_events` (raw, **hard-capped ring**, short TTL) → `ux_defects` (aggregated, durable, GSC-joined).
- **Aggregation** (`scheduler.js` JOBS, **hourly** — see §8/§9): `ux-rollup` (raw→defects, time-budgeted draining cursor) + `ux-prune`.
- **Issues** (`ux_defects`): scored via `gsc.js` + `traffic-value.js` + `prioritization.js`; HIGH-confidence deterministic ones raise a `proposals` row into the existing approval gate.

### ASCII data-flow

```
┌──────────────── VISITOR BROWSER (one of 6 WP sites) ────────────────────────┐
│ seo-agent-optimize.php → inlines ux-beacon.js  [seoagent_ux_beacon=ON, GPC/  │
│ DNT honoured, sample 2–5%; js_error/404/4xx always 100% but EDGE-CAPPED]     │
│   sync:  error · unhandledrejection · 404-marker check                       │
│   idle:  PerfObserver(resource) · CTA href scan · form invalid · (fetch patch │
│          only if responseStatus unavailable)                                  │
│   SCRUB AT SOURCE: path-only URLs · NO field values · msg≤200ch + PII-regex   │
│   BUFFER (cap 20, dedupe by t+sel+stackHash, summarized counts)              │
│        │ flush on visibilitychange→hidden / size / 15s idle                  │
│        ▼ navigator.sendBeacon(text/plain blob) ── fallback ─► fetch(keepalive)│
└────────│─────────────────────────────────────────────────────────────────────┘
         │ POST /ux-beacon   (CORS:* already set; text/plain → no preflight)
         ▼
┌──────────── KOYEB NANO (single 0.1 vCPU/512MB process: server.js) ───────────┐
│ POST /ux-beacon  [special-cased BEFORE routes{}; NOT HEAVY_ROUTES; 204 empty] │
│  0 Content-Length shed + in-memory token bucket  ← BEFORE readBody/JSON.parse  │
│  1 64KB cap → 2 rum_key→site_id (TTLCache 5m, HMAC/SITE_SECRET_KEY)            │
│  3 Origin allowlist → 4 rate-limit TTLCache ${key}:${ipHash}(/24 salted)       │
│  5 schema allowlist (REJECT value/innerHTML/html keys) → 6 row-cap guard       │
│  7 limiters.rum.run() → single batched INSERT, site_id stamped on EVERY row    │
│  + CIRCUIT BREAKER: site ingest spike → auto-flip sites.rum_armed=OFF + alert  │
│        │                                                                       │
│        ▼  ux_events (raw, HARD-CAPPED RING, TTL ≤72h)                          │
│  scheduler.js (hourly, leader-locked, watermark, TIME-BUDGETED cursor)         │
│     ux-rollup: drain → group by signature → UPSERT(merge-dups) → ux_defects    │
│     ux-prune:  DELETE < TTL (+ writer-enforced ring cap as primary guard)      │
│        │ join page-path                                                        │
│  gsc.js/gsc-index.js → clicks/pos/CTR     traffic-value.js → £ page context     │
│  prioritization.js (RICE) → organic-clicks-exposed + rank                       │
│        ▼                                                                        │
│  HIGH-conf & deterministic ─► proposals(proposed) ─► HUMAN APPROVAL GATE        │
│        │  DRY_RUN → write-armed → read-back → ledger                            │
│        ▼  mu-plugin: /insert-link · /webp-map · /css   (verify-after-write)     │
│  /status gauge: ux_events rows + ingest rate + dropped_by_cap/ratelimit         │
│  Dashboard: 19th screen "experience" → worklist ordered by organic-exposed      │
└────────────────────────────────────────────────────────────────────────────────┘
BREAK-GLASS: 1 sample→1% (server-embedded, no redeploy) · 2 TTL→24h · 3 lower MAX_ISSUES
 · 4 move /ux-beacon to a Cloudflare Worker (your own edge, free 100k/day) — promote
 to MVP if the canary shows event-loop lag. Kills: RUM_ENABLED=false; sites.rum_armed=off.
```

---

## 5. Privacy & consent design (UK PECR / ICO-safe)

Two laws in sequence: **PECR** governs storing/reading the device; **UK GDPR** governs any personal data processed. The legal basis is the **DUAA 2025 first-party statistical-analytics exception** (amends PECR) — but treat it as **upside, not foundation**. The ICO finalised its storage-and-access guidance on 29 Apr 2026 and the exception is **narrow and conditional**: aggregate only, "how the service is used not who uses it," no cross-site tracking, no ad/profiling reuse, clear notice, and a **working opt-out that is honoured**. A solo operator self-certifying across 6 live UK sites with no DPO should design to the strictest reading.

**Hard, code-reviewed invariants (not config):**
- **No PII, ever.** No field values, no keystrokes, no DOM snapshots, no replay, no mouse paths, no persistent visitor ID, no raw IP. The single highest-probability failure is silent PII leakage (a query-string token, a "name" field, an error echoing an email), so scrubbing happens **at source in the browser** *and* an ingest-side reject-on-suspicious-key guard runs as defence-in-depth.
- **Scrub at source, before any send:** (1) strip query-string + fragment → **path only**; (2) form events carry field **name/id/type + validity** only — sensitive types (`password`/`email`/`tel`/`number`/`[data-sensitive]`) have the name redacted to `[sensitive]`; (3) truncate every `msg`/label ≤200ch and run a PII regex sweep (email/phone/card/NI/UK-postcode → `[redacted]`); (4) selector + coarse role only, never element text/`innerHTML`; (5) ephemeral per-page-view random id for click sessionising — never persisted, never cross-visit; (6) **no raw IP** — ingest hashes a /24-truncated IP with a daily salt, never stored or used as a join key.
- **No replay in v1, documented as an explicit non-goal.** Replay is the named legal landmine (EU DPAs treat it as personal data needing opt-in; ~1,500 US CIPA wiretap suits in the 18 months to Aug 2025 targeted replay). v1 captures only discrete typed defect events.
- **Storage choice itself is in PECR scope.** Reconsider `sessionStorage` for the sample flag — prefer a purely **in-memory per-page-view** sampling decision (accept that it re-rolls per page-view) so there is no device write to justify at all.
- **Opt-out is real and honoured.** Per-site `beacon_enabled` AND a visitor opt-out flag; honour Global Privacy Control and Do-Not-Track; ship a **working visitor opt-out**, not just GPC/DNT honouring. On opt-out/disable, **purge all raw rows for that site**.
- **Retention:** raw `ux_events` auto-purged at **≤72h** (default 72h free / 720h pro), AND a hard writer-enforced ring cap as the primary guard (the daily prune is a backstop, not the only line of defence). `ux_defects` carries no per-event PII and is retained for trend/anomaly.
- **Tenant isolation is manual.** `server.js` uses the Supabase service role, which **bypasses RLS**; every existing route enforces tenancy by appending `site_id=eq.<id>`. The beacon **must** follow the identical pattern on every INSERT and read — a single forgotten filter cross-contaminates tenants. Add RLS policies as defence-in-depth anyway.

**Compliance artefacts that ship *before* arming (precondition, per the critics):** a one-page DPIA-lite per site, a one-paragraph privacy-notice snippet each site pastes (what's collected, why, retention, opt-out), and explicit **written operator sign-off per site**. The ingest endpoint treats "operator has signed off this site" as a checked precondition, not a UI nicety. `rum_armed` defaults **OFF**.

**CWV protection (the beacon must not regress the INP/LCP we sell):** prefer passive `PerformanceObserver('resource')` for `ajax_4xx` and feature-gate fetch/XHR monkey-patching to only when `responseStatus` is unavailable; the beacon self-measures its own long-task contribution and self-disables over a tiny budget; and it is A/B'd ON vs OFF on a **canary page** measuring real-user INP/LCP before fleet rollout.

---

## 6. Remediation matrix

Every RUM-derived fix is an ordinary `proposals` row, identical in shape to an SEO finding, flowing through the **same gate as `/apply-link`** (verified: `write_armed===false → blocked`; DRY_RUN `{dryRun:true}`; read→write→read-back → `verified` vs `silent-failure`; `detectLiveCms` honesty guard; reversible `activity` ledger). **Two new fix-side rules:** (a) an independent `rum_armed` gate (telemetry-on) separate from `write_armed` (fixes-on) — detecting ≠ permission to fix; (b) the stored `confidence` tier is written into the proposal and the approval UI **physically cannot render "Apply automatically" for MODERATE/inferred rows**.

**Verified mu-plugin routes (ground truth):** `/insert-link` (anchor→href into post_content + Elementor `_elementor_data`), `/css` (ONE global `seoagent_custom_css` option, `wp_head` pri 100 — **every CSS fix is site-wide, scoped by selector, blast-radius-checked**), `/webp-map` (URL→URL swap), `/schema`, `/refresh-block`, `/meta_render`. **Gaps that constrain the claim:** ❌ no redirect route, ❌ no alt-text/`<img>`-attribute write, ❌ no per-element markup rewrite (`/insert-link` *adds* a link to text, it cannot *repair* a malformed `<a href="#">`).

| Defect | Confidence | Grade | Concrete existing route | Auto-act eligible? |
|---|---|---|---|---|
| Broken internal link → re-point | H | **AUTO** (subset) | `/insert-link` → `/apply-link` to the correct live URL (we know it from the GSC map) | ✅ only when target is deterministically resolvable to an existing page |
| Broken link needing a **redirect** | H | **GUIDED** | none (no redirect primitive) — generate exact 301 rule for operator | ❌ |
| Broken **CTA** (`href="#"`/empty) | M→H | **GUIDED** (mostly) | flagship demo is GUIDED: markup repair we can't do. AUTO **only** the "add link to unlinked CTA text" sub-case via `/insert-link` | ✅ narrow sub-case only |
| Broken **image** (same-origin) | H | **AUTO** (subset) | `/webp-map` URL swap when a known-good replacement exists | ✅ same-origin URL swap only |
| Broken image (cross-origin / alt / markup) | L/H | **GUIDED** | none (no alt/attr route) | ❌ |
| **Tap-target / contrast** | H | **AUTO** (subset) | `/css` → `/apply-css` tightly-scoped rule, blast-radius-checked, read-back-verified | ✅ stable specific selector + bounded rule |
| **Form-validation** copy / affordance | H/M | **GUIDED** (copy) / AUTO (CSS nudge) | `/css` for affordance only; Claude microcopy for the message | ✅ CSS-affordance sub-case only |
| `js_error` / `unhandled_rejection` / `console_error` | H/M | **DETECT** | none (can't patch theme/vendor JS) | ❌ never |
| `dest_404` (off-WP) / backend 5xx / INP | H | **DETECT** | none — diagnose + Claude hypothesis + revenue-at-risk via GSC | ❌ never |
| `dead_click` / `rage_click` (v2) | M | **DETECT** | symptom, never a write target | ❌ never |

**Honest auto-fix fraction of all detected *instances*: ~15–25%.** ~30–40% GUIDED (exact change + Claude root-cause, human applies). ~40–50% DETECT-only. The value is **not** the fix rate — Clarity detects the same defects free. The value is that **even a DETECT-only row carries an organic-clicks-exposed number nobody else can compute**, plus the ~20% that *are* fixable close a loop no behaviour tool has. Never let the auto-fix claim outrun the honest ~20%.

**Minimal new routes:** `POST /ux-beacon` (ingest — required, it's the collector). Defer `seoagent/v1/redirect` and `seoagent/v1/img-attr` until those defect classes prove common — GUIDED is safe and honest until then. No new *fix-side* attack surface for v1.

---

## 7. Dashboard screen spec

New screen key `experience` (the 19th), in the **"Find & Fix Issues"** `SNAV_GROUPS` block after Audits, reusing `SoftCard`/`Gauge`/`Ring`/`Spark`/`Chip`/`NeoButton`/`Well`/`SoftModal`/`SoftDiff` from `web/soft-ui.jsx` and the `PageHead`+`drow` grammar from `GeoScreen`/`GscScreen`. Icon: reuse the `gauge` glyph.

**Hard UI invariants:** (1) **Apply** appears *only* on HIGH-confidence, deterministically-fixable rows; inferred rows are **Review-only**. (2) Every number is labelled **"exposed / directional"** with a band — never "measured/lost". (3) No replay, no field values, no DOM, no per-visitor identity is ever shown (none is collected). (4) Beacon defaults OFF per-site, killable from this screen. (5) Positions as **complement Clarity** — an explicit "Open in Clarity ↗" out-link, not an apology.

**Hero KPIs** lead with **"Organic clicks exposed"** (not a £ funnel), then an Experience-health `Gauge`, then a `Ring` defect-rate with an `anomaly.js` spike chip; a methodology rail under the KPIs states sampling + correlational caveat in one line.

### ASCII wireframe — main screen (beacon armed, data present)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Experience — UX & conversion defects                       [ Beacon: ●ON ] [ Re-scan ]│
│  What's quietly costing go-visa.app organic conversions, joined to GSC traffic.        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌ ORGANIC CLICKS EXPOSED (dark) ┐ ┌──── EXPERIENCE HEALTH ───┐ ┌──── DEFECT RATE ────┐ │
│ │  ~1,840 clk/mo  (directional)  │ │      ╭───────╮  gauge    │ │  ◴ 9.4%   ▁▂▄▆█ ↑    │ │
│ │  across 11 defects on ranking  │ │      │  74   │           │ │  312 / 3,320 sampled │ │
│ │  pages   ▁▂▃▅▆▇ 30-day [GSC]    │ │      ╰───────╯           │ │  [clay ● ↑ spike]    │ │
│ │  page value context: ~£2.3k/mo │ │  defect-free sessions    │ │  HIGH · event-counted│ │
│ └────────────────────────────────┘ └──────────────────────────┘ └──────────────────────┘│
│ ┌ Well: 4-up strip ─────────────────────────────────────────────────────────────────┐ │
│ │ JS ERROR RATE ●hi 6.1/1k ▁▂▅█↑ │ TOP 404 DEST ●hi /old-pricing 61 │ BROKEN IMG ●hi 4 ││
│ │ BROKEN CTAs ●hi 3 (static href) │ FORM-VALIDATION ●hi email typeMismatch ×24         ││
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ ⓘ Sampled 2–5%/session · high-value events 100% · "exposed" = GSC clicks × defect-rate ×│
│   confidence — a correlational priority signal, not measured lost revenue.              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ISSUE WORKLIST                  Group:[ By class ][ By page ][ exposed ]  Filter:[▾]   │
│                                                        ☑ HIGH-confidence only           │
│  ▾ BROKEN CTAs / LINKS  (3) ─────────────────────────────────── ~620 clk/mo exposed ───│
│   ┌──────────────────────────────────────────────────────────────────────────────────┐│
│   │ ◆ Broken CTA  <a href="#">  "Start your application"   /spouse-visa  214 smp ▁▂▄▆█ ││
│   │   GSC 1,240 clk · pos 3.2                              ~410 clk exposed [HIGH][Apply]││
│   ├──────────────────────────────────────────────────────────────────────────────────┤│
│   │ ◆ Broken internal link → 404  nav "Pricing"  /  · 96 smp   ~90 [HIGH][Apply] ▸     ││
│   └──────────────────────────────────────────────────────────────────────────────────┘│
│  ▾ JS ERRORS  (2) ───────────────────────────────────────────── ~540 clk/mo exposed ───│
│   │ ◆ TypeError: cannot read 'submit' of null  /contact · 88 smp ▁▂▅█↑ ~300 [HIGH][Review]│
│   │ ◇ console.error flood (3rd-party)  site-wide  1.2k        —    [Inferred · v2]      │
│  ▸ FORM VALIDATION (1) · ▸ BROKEN / 404 + IMAGES (3) · ▸ RESOURCE 4xx (1)                │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  Tip: run Microsoft Clarity for replay — Sentinel adds the organic join + the fix.      │
│                                                                       [ Open Clarity ↗ ]│
└──────────────────────────────────────────────────────────────────────────────────────┘
  ● = HIGH (teal)   ◐ = mixed   ◇/○ = inferred (gold, Review-only, never auto-fixed)
```

**Drill-down (`SoftModal`):** revenue/exposed header with the transparent math (`GSC 1,240 clk × CTR 4.1% × defect-impact 0.9`, RICE chip); affected-pages table (the literal GSC join: path · clicks · position · samples · `Spark`); the **stable selector** in `--mono`, copyable, with a drift note; aggregate-only evidence (counts, validity-flag breakdown, scrubbed error-class, `from→to` path) with an explicit "no replay/values/PII" footnote; trend with the `anomaly.js` band; a `SoftDiff` suggested fix (`href="#"` → `href="/spouse-visa/apply"` via `/insert-link`) with the safety chain rendered as chips `DRY_RUN → write-armed → read-back → ledger`; footer `[Ignore] [Open in Clarity ↗] [Review] [Apply fix]`.

**Empty/onboarding (beacon not armed — the default):** a centered `SoftCard` pitch + a gold privacy `Well` (cookieless · no session/visitor ID · no replay · no form values · no full IP · aggregate-only · ≤72h raw retention), a copy-paste privacy-policy snippet, a GPC/DNT toggle (default ON), a "Compliance: review before enabling" chip, a sampling segmented control (2% · 5% · 10%, default 2–5% on the nano, "high-value events always 100%"), and a single `[Install beacon (1-click)]` that flips `seoagent_ux_beacon` on and verifies via `optimize-selftest`.

---

## 8. Exact codebase integration

**New backend route — `backend-api/server.js`.** Add `POST /ux-beacon` **special-cased before** the `routes` object lookup (`server.js:290`), exactly like `/chat-stream` and the OAuth callbacks, because the generic dispatcher forces `send(res,200,json)` and the beacon must return **204 empty** so `sendBeacon` stays fire-and-forget. **Not** added to `HEAVY_ROUTES` (`:2168`). Its handler, cheapest path in the file, in order:
- `0` **Pre-`readBody` shed:** check `Content-Length`; consult an in-memory token bucket; `204`-drop *before* buffering/`JSON.parse` if over a per-process ingest ceiling (the critics' key fix — this is the only thing that prevents a flood from costing JSON.parse on the shared loop).
- `1` 64 KB route cap (far under `MAX_BODY` 6 MB at `:163`). `2` resolve `body.k` (`rum_key`) → `site_id` via a 5-min `TTLCache` (from `infra.js`) over a `sites` lookup — `rum_key` minted/verified with `createHmac('sha256', SITE_SECRET_KEY)` exactly like `signState/verifyState` (`:136-147`). `3` Origin/Referer host ∈ that site's connected-domains allowlist. `4` rate-limit `TTLCache` counter `${rum_key}:${ipHash}`, 60 s window. `5` schema allowlist — require `k`,`p`(starts `/`),`Array.isArray(e)`, event `t` ∈ enum; **reject any payload with keys `value`/`innerHTML`/`html`/`screenshot`**. `6` row-cap guard (cached gauge; refuse if `ux_events` near the ring cap). `7` `limiters.rum = new Limiter(4)` → single batched INSERT with `site_id` on every row. `8` respond `204`.
- Plus a per-site **CircuitBreaker** (reuse `infra.js`): ingest rate over threshold → auto-flip `sites.rum_armed=false` + record an alert. New companion read routes: `GET /ux-defects` (worklist, `site_id`-scoped, ordered by organic-clicks-exposed) and `POST /ux-defect-action` (ignore/propose/apply → existing proposals pipeline).

**Next migration — `migrations/004_experience.sql`** (confirmed: `001_jobs`, `002_scheduler`, `003_outreach` exist; `004` is next). RLS service-role-only like `jobs`; `site_id` on every row; UPSERT via `Prefer: resolution=merge-duplicates` like `scheduler_runs`.

```sql
-- ux_events: raw, ephemeral, HARD-CAPPED ring (writer-enforced) + TTL backstop
create table if not exists ux_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  page text not null,                 -- normalized PATH (joins to GSC landing pages)
  event_type text not null,           -- enum (§3)
  selector text, role text,
  confidence text not null default 'high',
  count int not null default 1,
  detail jsonb not null default '{}'::jsonb,   -- PII-free, type-specific
  ip_hash text,                       -- salted /24-truncated; NEVER raw IP
  pv_id text,                         -- ephemeral page-view id (not a visitor id)
  beacon_ver text,
  received_at timestamptz not null default now()  -- server stamp (trust boundary)
);
create index if not exists ux_events_rollup_idx on ux_events (site_id, received_at);
create index if not exists ux_events_prune_idx  on ux_events (received_at);
alter table ux_events enable row level security;

-- ux_defects: aggregated, durable, GSC-joined (mirrors proposals/findings shape)
create table if not exists ux_defects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  page text not null, event_type text not null, selector text,
  signature text not null,            -- sha256(site_id|page|event_type|selector)
  confidence text not null default 'high',
  severity text,
  occurrences int not null default 0, sessions int not null default 0,
  pageviews_seen int not null default 0, defect_rate numeric,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  sample_detail jsonb,
  gsc_clicks int, gsc_position numeric,
  clicks_exposed numeric,             -- gsc_clicks × defect_rate × confidence_weight (NO conv funnel)
  rice_score numeric, anomaly_z numeric,
  status text not null default 'open',-- open|proposed|fixed|ignored
  proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_defects_sig_idx on ux_defects (site_id, signature);
create index if not exists ux_defects_worklist_idx on ux_defects (site_id, status, clicks_exposed desc);
alter table ux_defects enable row level security;

-- per-site beacon key + arm flag + sign-off (on existing sites row)
alter table sites add column if not exists rum_key text;
alter table sites add column if not exists rum_armed boolean not null default false;
alter table sites add column if not exists rum_signed_off boolean not null default false;
```

> Note: `clicks_exposed` replaces the maximal design's `est_lost_value`/`conv_at_risk` — no `baseline_conv_rate`, no `page_value_per_conversion` (neither exists in `traffic-value.js`).

**mu-plugin — `wp-plugin/seo-agent-optimize.php`.** Add a stored option `seoagent_ux_beacon` (per-site arm flag, default OFF). When on, inline-enqueue `ux-beacon.js` in `wp_footer`, **versioned off the plugin `Version` constant**, with the server-embedded sample rate and a CSP nonce. Stamp `<meta name="sentinel-404">` on the 404 template (`is_404()`) for `dest_404`. Report `beacon_ver` + `armed` in `optimize-selftest`. No new fix-side routes for v1 — reuse `/insert-link`, `/webp-map`, `/css`.

**Frontend — `web/`.** New `web/soft-experience.jsx` exporting `ExperienceScreen`; register in the `SCREENS` map in `soft-dashboard.jsx` (`experience: ExperienceScreen`), add the `SNAV_GROUPS` entry + `NAV_INDEX` rows. New `api.jsx` methods: `uxDefects(siteId, {group, tier})`, `uxDefectAction(id, action)`, `armBeacon(siteId, on)`, `beaconStatus(siteId)` — wrapping the new backend routes alongside the existing Supabase-REST helpers. New client `web/ux-beacon.js` built standalone by `web/build.mjs` (separate tiny entry, no React).

**Reuse (zero new analytics modules):** `gsc.js`/`gsc-index.js` for the landing-page join (same pathname normalization `/prioritize-findings` already uses); `traffic-value.js` for the £ page-value context only; `prioritization.js` (`prioritizeFindings(trafficByPage, valueByPage)`) for RICE with `Reach`=GSC clicks, `Confidence`=defect tier, `Effort`=fix channel; `anomaly.js` (modified z-score) on the per-page daily `defect_rate` series; `jobs.js`/`scheduler.js` for rollup/prune; `infra.js` `Limiter`/`TTLCache`/`CircuitBreaker` for the ingest hot path.

**Scheduler reality (verified `scheduler.js:229` — tick is HOURLY, serial, single-leader).** Do **not** claim a 30-min cadence; it's a no-op. Two `JOBS` entries, but the rollup is written as a **time-budgeted draining cursor** (drain until caught up *or* ~2–3 s wall-clock, advancing the `scheduler_runs` watermark **only after** a successful batch) so it never lengthens `auto-index`/`gsc-health`/`apply-css` on the 0.1 vCPU box; optionally moved off the serial sweep into a `jobs.js` durable handler for retry. Expose a **backlog gauge** (`max(received_at) − watermark`) on `/status` — that's the early warning the silent row-cap lacks.

```js
// scheduler.js JOBS additions
{ name: 'ux-rollup', every: 60*60*1000, run: jobUxRollup },  // hourly = the real tick
{ name: 'ux-prune',  every: 24*60*60*1000, run: jobUxPrune }, // ring cap is the primary guard
```

---

## 9. Phased build plan

Each phase is independently shippable, preserves the full safety model (DRY_RUN → write-armed → verify-after-write → reversible ledger → human approval → kill switch), and adds the new independent `rum_armed` gate. Effort is solo-engineer working days.

### Phase 0 — Compliance + canary gate (PRECONDITION, ~2–3 d)
DPIA-lite per site, working visitor opt-out + privacy-notice snippet, per-site written sign-off, `rum_armed` default OFF. Build the bare beacon (js_error + dest_404 only) and A/B it ON vs OFF on **one canary page**, measuring real-user INP/LCP for two weeks. **Ship nothing fleet-wide until the canary proves no CWV regression.** No data collection before this passes.

### Phase 1 — MVP: deterministic detect + GSC join + narrow auto-fix (~6–8 d)
Beacon (the 7 deterministic events only, <5 KB, passive-first, self-measuring). `POST /ux-beacon` with the full §8 hot-path including the pre-`readBody` shed and per-site circuit-breaker. `migrations/004_experience.sql`. `ux-rollup`/`ux-prune` (time-budgeted). `ExperienceScreen` with the **organic-clicks-exposed** hero (no £ funnel). Auto-fix wired for the deterministic ~2 classes (`/insert-link` re-point, `/webp-map` swap, `/css` affordance) through the existing approval loop. Default sampling 2–5%; high-value events 100% but **edge-capped per `(site, stackHash)`** so an error storm can't bypass sampling into a flood. **Pilot on ONE site for two weeks**; measure event-loop latency (`/status inFlight`), Postgres growth, and beacon CWV before fleet rollout.
**Success criteria to expand:** on ≥2 armed sites, the worklist surfaces ≥1 real deterministic defect on a GSC-ranked page the operator agrees was worth fixing, AND ≥1 defect is actually closed through the approval → mu-plugin loop. If the loop doesn't close on real sites, stop — it's detect-only and shouldn't absorb more than GEO-rigor / LINK-ENGINE Phase 1.

### Phase 2 — heuristic signals + richer fixes (~5–7 d, only if Phase 1 succeeds)
Add `dead_click`, `rage_click`, `form_abandon`, `inp_slow`, `console_error` (transient MutationObserver, longtask/LoAF, restore-safe console patch) — all **MODERATE, advisory-only, Review-only**, with per-type issue thresholds and the `anomaly.js` overlay to catch fresh breakages. Consider the deferred `seoagent/v1/redirect` and `seoagent/v1/img-attr` mu-plugin routes only if those GUIDED defects prove common.

### Phase 3 — scale hardening (~3–5 d, trigger-based not calendar-based)
If `/status` shows event-loop lag or Postgres approaching budget: promote the **Cloudflare Worker** edge buffer (your own edge, free 100k/day) to validate + rate-limit + pre-aggregate so the nano never JSON.parses raw browser beacons; move RUM to its own Supabase project to eliminate shared-fate with the core platform; make sampling server-authoritative + adaptive (dial to 1% with no redeploy).

---

## 10. Key risks & mitigations

| Risk (from critics) | Mitigation (baked into the plan) |
|---|---|
| **Event-loop starvation** — every POST increments INFLIGHT + `readBody` + JSON.parse on one 0.1 vCPU loop shared with Claude/GSC/SSE; a broken page floods `js_error` beacons (self-DoS). | Cheap **pre-`readBody` shed** (Content-Length + token bucket *before* parse); dedicated tiny `Limiter`; per-`(site,stackHash)` edge cap on the "always-100%" bucket; **automatic per-site circuit-breaker** flips `rum_armed` off on spikes; Cloudflare Worker promoted in Phase 3 if lag appears. |
| **Supabase 500 MB read-only wall = whole-platform outage** (shared fate with jobs/proposals/audits). | Aggregate-leaning storage; **writer-enforced hard-capped ring** on `ux_events` (not a daily prune as the only guard); short TTL; row-cap guard at ingest; `/status` volume gauge; Phase 3 moves RUM to its own Supabase project. |
| **Scheduler mismatch** — tick is hourly/serial/single-leader; a 30-min/5000-row rollup can't keep pace; raw piles up, silent cap trips. | Honest hourly cadence; **time-budgeted draining cursor** (drain-until-caught-up under a wall-clock budget, watermark advanced only after success); backlog gauge on `/status` as early warning; optional move to a `jobs.js` durable handler. |
| **Fabricated revenue math** poisons the only moat (`baseline_conv_rate`/`page_value_per_conversion` don't exist). | **Drop `conv_at_risk` entirely.** Hero = "organic clicks exposed" = `clicks × defect_rate × confidence` (measured co-occurrence). £ shown only as page-value context, never "lost". |
| **Disappointment gap on auto-fix** — flagship dead-CTA repair is GUIDED not AUTO; only ~15–25% of instances auto-fixable. | Scope the claim to "the deterministic ones"; UI offers **Apply only on HIGH-confidence fixable rows**, Review otherwise; lead the demo with broken internal-link re-point + broken-image swap, which *do* one-click-fix. |
| **PECR/DUAA posture overstated** for 2026; solo operator self-certifying across 6 UK sites. | Treat the exception as **upside, not foundation**; design to the strictest reading (aggregate, no-PII, in-memory sample flag); Phase 0 ships DPIA-lite + working opt-out + per-site sign-off **before** any collection; `rum_armed` default OFF. |
| **Beacon regresses the CWV we sell** (fetch/XHR patch, MutationObserver, observers inflate INP/LCP). | Passive `PerformanceObserver` first, fetch/XHR patch feature-gated to fallback only; beacon self-measures its long-task budget and self-disables; **canary A/B on real-user INP/LCP before fleet rollout** (Phase 0 gate). |
| **Silent drops bias the numbers** (sampling, dedupe, sendBeacon loss, rate-limit, row-cap = 5+ lossy stages before `defect_rate`). | Expose `dropped_by_cap`/`dropped_by_ratelimit`/`sampled_out_estimate` counters on `/status`; present "exposed" with a real coverage caveat; never show a silently-undercounted figure as precise. |
| **Selector instability** fragments grouping + breaks auto-fix targeting (Elementor re-render, A/B). | Prefer `id` > unique `data-*` > `role`+nearest-id > short `nth-of-type` path; tolerate drift (advisory-only where unstable); the fix re-verifies the selector before any write (read→write→read-back). |
| **Self-DoS feedback loop** — the events most worth catching are the highest-volume "always-100%" ones. | Edge cap the always-100% bucket per `(site,stackHash)` (count-only after N); automatic circuit-breaker; global `RUM_ENABLED=false` + per-site `rum_armed` kills. |
| **Cross-tenant bleed** — service role bypasses RLS; one missing `site_id` filter leaks visitor data between sites. | `site_id=eq.<id>` on every INSERT and read (matches all ~55 existing routes); RLS policies as defence-in-depth; `rum_key` HMAC-derived per site. |

---

## 11. Open questions for the operator

1. **Compliance sign-off:** are you willing to self-certify the DUAA first-party-statistics basis across all 6 UK sites, with DPIA-lite + working opt-out per site — or do you want the beacon gated behind a cookie-consent category (treating the exemption as upside only)? This is a legal decision, not an engineering default, and it blocks Phase 0.
2. **Sequencing / opportunity cost:** the roadmap flags GEO-SoV rigor and single-run-PSI noise as live demo-killers, and LINK-ENGINE Phase 1 as higher-ROI. Do you want Experience Monitor sequenced *after* those, or in parallel? It is the more novel/defensible story but the riskier ROI.
3. **Buyer fit:** organic-conversion-defect is a CRO concern; the platform's framing is SEO/rankings. Is "which of my ranking pages is leaking the traffic I worked to win" a question you actually want answered here, given a free 2-minute Clarity install satisfies "show me frustration"?
4. **Supabase tier:** stay on free (forces ≤72h raw TTL + hard ring cap, shared-fate risk) or pre-emptively go Pro ($25/mo, 8 GB) — or isolate RUM in its own Supabase project from the start to eliminate shared fate?
5. **Edge buffer now or later:** stand up the Cloudflare Worker in Phase 1 (removes the single hardest constraint up front) or keep it as the Phase 3 trigger-based escalation and rely on the in-process shed first?
6. **Sampling default:** 2% (cheapest, slowest to surface on small pages) vs 5% (faster signal, more nano load)? High-value events are always 100% but edge-capped regardless.
7. **Auto-fix appetite:** are you comfortable arming the narrow auto-fix subset (`/insert-link` re-point, `/webp-map` swap, `/css` affordance) on real sites, or should v1 be **detect + GUIDED only** until you've watched the verify-after-write loop run a few times?
8. **Deferred routes:** do you want `seoagent/v1/redirect` and `seoagent/v1/img-attr` built in Phase 2 to widen auto-fix, or keep the write surface minimal and leave those GUIDED indefinitely?

---

## 12. FINALIZED INTEGRATION CHARTER — additive-only, inert-by-default

> **Operator requirement (2026‑06‑18):** integrate *without changing existing UI or any past
> feature/function*. This section is the binding contract for that. It does not change the plan
> above — it constrains *how* it lands.

**The contract.** Every change is **append-only** and gated behind flags that **default OFF**. With
`RUM_ENABLED` unset (env) **and** per-site `rum_armed=false` **and** `seoagent_ux_beacon` OFF (all
the defaults), the platform is **behaviourally identical to today**: no existing route, screen, job,
query, limiter, or mu-plugin output changes; **no beacon loads on any site; no data is collected;**
the new screen is hidden from the nav. The subsystem only "exists" once the operator explicitly
enables it — globally, then per-site, *after* the Phase‑0 compliance sign-off.

### 12.1 Two master switches (both default OFF)
- **Global:** `RUM_ENABLED` env var (default unset → false). Gates the ingest path, the scheduler
  jobs, and the nav entry. One flag turns the entire subsystem inert (and is the instant kill).
- **Per-site:** `sites.rum_armed` (default false) + mu-plugin `seoagent_ux_beacon` (default OFF) +
  `sites.rum_signed_off` (compliance gate). A site collects **nothing** until all three are set.

### 12.2 Touch-point matrix — exactly what each existing file gets (all append-only)
| File | What's added | Behaviour when OFF (the default) |
|---|---|---|
| `backend-api/server.js` | ONE guard at the top of the request handler — `if (RUM_ENABLED && POST && path==='/ux-beacon') return uxBeacon()` — beside the existing `/chat-stream`/OAuth special-cases; plus 4 new keys appended to `routes{}` (`/ux-defects`, `/ux-defect-action`, `/arm-beacon`, `/beacon-status`). **Not** in `HEAVY_ROUTES`. | The guard is a single short-circuit boolean → existing dispatch runs **byte-for-byte unchanged**. New keys are unreachable/return empty until a site is armed. |
| `migrations/004_experience.sql` (NEW) | New tables `ux_events`/`ux_defects`; `ALTER TABLE sites ADD COLUMN IF NOT EXISTS rum_key, rum_armed(default false), rum_signed_off(default false)`. | Additive defaulted columns; existing tables + every `select`/`select=*` query are unaffected (they just ignore the extra columns). |
| `backend-api/scheduler.js` | Append 2 `JOBS` (`ux-rollup`, `ux-prune`) whose **first line is `if (!RUM_ENABLED) return;`**. | Hourly tick does one extra boolean check, then no-ops. Existing jobs untouched. |
| `web/soft-dashboard.jsx` | Add `experience: ExperienceScreen` to the `SCREENS` map; add ONE nav row **rendered only when `window.SENTINEL_RUM` (config flag) or `site.rum_armed`**. | Every existing screen + the nav are identical; the new row is hidden. |
| `web/api.jsx` | Append `uxDefects / uxDefectAction / armBeacon / beaconStatus`. | Existing methods untouched; the new ones are never called until the screen renders. |
| `web/soft-experience.jsx`, `web/ux-beacon.js` (NEW) | New isolated files; `ux-beacon.js` added as a standalone `web/build.mjs` entry. | Not referenced anywhere until a site is armed. |
| `wp-plugin/seo-agent-optimize.php` | Add option `seoagent_ux_beacon` (default OFF); when ON → `wp_footer` enqueue + `is_404()` `<meta>`; bump `Version` + add `ux_beacon` to `optimize-selftest` features. | OFF → no enqueue, no meta, no output change. Identical to the current v1.8.0 behaviour. |

### 12.3 Zero-regression guarantees (explicit)
1. **No existing route handler is edited** — only a top-of-handler guard + new route keys are added.
2. **No existing screen JSX is edited** — only a new `SCREENS` entry + a conditionally-rendered nav row.
3. `HEAVY_ROUTES`, the limiters, `MAX_BODY`, CORS, and the existing job cadence are **unchanged**.
4. The mu-plugin's v1.8.0 behaviour (webp · jsonld · css · links · meta_render · geo_publish) is **untouched** when the beacon flag is OFF; the beacon is a separate gated branch, version-bumped only.
5. **DB:** only additive tables + defaulted columns — no type/constraint change to any existing table.
6. **Build/deploy:** a new bundle entry; existing bundles unchanged; CI auto-deploy path unchanged.

### 12.4 Safe build order under this charter
The **inert scaffold** — migration `004` + the `/ux-beacon` ingest skeleton + the hidden `ExperienceScreen`
+ `ux-beacon.js` + the mu-plugin `seoagent_ux_beacon` flag, **all default OFF** — can be built and
deployed with **zero observable change** (it is dark until armed). That is the *only* thing safe to do
**before** the Phase‑0 compliance decision. **Arming a site (collecting the first event) stays blocked on
Q1 (compliance basis) and Q2 (sequencing).** The scaffold is not a commitment to collect — it's the
plumbing, switched off.

### 12.5 Rollback
Unset `RUM_ENABLED` → the whole subsystem is inert in **one env change** (no site redeploy needed; the
per-site mu-plugin flag is also OFF). The two tables are isolated and can be dropped without touching any
existing feature.