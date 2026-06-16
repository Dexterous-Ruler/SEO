# Sentinel Stabilization Plan

Goal: stop the churn. Make the platform **stateful, per-site, and idempotent** — what's
done stays done and crossed off, what's shown matches the site you're on, and actions
push real changes live. Plus two missing capabilities (multi-country, decay content
push) and one removal (backlinks).

## The pattern behind the mess (read this first)

Issues **#1, #3, #6 are one root disease**: *audit findings and scan results live in
volatile in-memory globals, are regenerated from scratch every run, are never reconciled
against what you already applied, and are not isolated per site.*

Concretely, in `web/soft-dashboard.jsx`:
- `window.FINDINGS = res.findings` (line ~4450) is a **single global**, set only by
  `runAudit`, **never reset when you switch sites** and **never hydrated from the active
  site's saved audit**. → you see the last-audited site's data (#6).
- Findings have **no resolution state** and are **not linked to the proposals you
  approved**. Every audit re-derives them from the live page and re-lists them, even if
  you fixed it a week ago. → the same items keep coming back (#3).
- Image scan (`scanMedia`) lists every heavy JPEG/PNG and **does not exclude originals
  that already have a `.webp` sibling**, and `optimizeMedia` is **hard-capped at `max:8`**
  with the UI only rendering `images.slice(0,12)`. → "39 heavy, shows a few, never shows
  done" (#1).

Fix the state model once and #1/#3/#6 largely dissolve. #2 and #4 are new capabilities;
#5 is a removal.

---

## Phase 0 — Quick wins (low risk, do first)

### 0.1 Remove Backlinks (#5)
- **What:** hide the Backlinks screen + palette/search entries + dashboard references.
- **Files:** `web/soft-dashboard.jsx` — nav item (`{ k:"backlinks", … }` ~line 23),
  palette entries (~65–68), the `data.backlinks` cards on the Semrush/overview screens,
  and the `backlinks:BacklinksScreen` route in `SCREENS`. Leave `BacklinksScreen` +
  backend routes in the codebase (dormant) so re-enabling later is one line.
- **Risk:** none (pure UI removal). **Verify:** Backlinks no longer in nav/search.

### 0.2 Un-cap the image optimizer (#1, part A)
- **What:** process **all** heavy images, not 8. Replace the hard `max:8` with batched
  processing: optimize in chunks of ~8 server-side, loop until none remain, stream a
  progress count to the UI. Render the full heavy list, not `slice(0,12)`.
- **Files:** `web/soft-dashboard.jsx` `optimizeMedia` (~1589, `{apply,max:8}` → loop) and
  the media list render (~1832, drop the `slice(0,12)`); `backend-api/server.js`
  `/media-optimize` (`max: body.max || 8` → honor a higher cap / batch);
  `backend-api/image-optimize.js` `optimizeImages` (already supports `ids`/`max`).
- **Risk:** low. Keep a sane per-request batch (≈10) to stay under the request timeout;
  the UI loops batches so all 39 complete with a "12/39…" progress.
- **Verify:** scan says 39 → run → all 39 processed; count ticks to 39/39.

---

## Phase 1 — Per-site state isolation (fixes #6, foundation for #3)

### 1.1 Kill the `window.FINDINGS` global; make findings site-scoped
- **Root cause:** findings are a cross-site global; switching sites doesn't reset them.
- **Fix:**
  - Replace `window.FINDINGS` with React state on the App: `findings` keyed by `siteId`
    (e.g. `findingsBySite[siteId]`), or a `{ siteId, items }` object guarded like the
    internal-links `_siteId` pattern already used elsewhere.
  - On site change (`useEffect [siteId]`), **reset** findings and **hydrate** from the
    active site's latest saved audit (`history[0].findings`) so a site you haven't
    re-audited this session still shows ITS last findings, not another site's.
  - `runAudit` writes findings for `siteId` only; the Audits screen + Dashboard worklist
    read the site-scoped value and ignore anything tagged with a different `siteId`.
- **Files:** `web/soft-dashboard.jsx` App state (~4308–4360), `runAudit` (~4450),
  Audits/Dashboard readers (PDF export ~4416, worklist).
- **Verify:** audit site A → switch to B → B shows B's last audit (or "no audit yet"),
  never A's; rerun on B updates only B.

---

## Phase 2 — The "done" ledger / idempotency (fixes #3 and #1 part B)

This is the core framework fix: a persistent record of *what has been actioned*, so
audits and scans cross it off instead of re-suggesting it.

### 2.1 Reconcile findings against applied proposals
- **Root cause:** findings ↔ proposals are not linked at render time; a verified proposal
  doesn't cross off its finding.
- **Fix:** findings already carry `findingId`; proposals already carry `finding_id` +
  `status`. At render, mark a finding **Done** when it has a proposal with status
  `verified`/`approved`. Show done findings crossed-off (collapsible "Resolved" group),
  not in the active worklist.
- **Files:** Audits screen render; reconciliation helper over `ctx.proposals`.

### 2.2 Persistent finding-resolution state (survives re-audits)
- **Fix:** add a small `finding_state` table (or a `resolved_findings` JSON on the site):
  `{ site_id, finding_key, status: resolved|dismissed|reappeared, applied_at, evidence }`.
  `finding_key` = stable hash of (type + page + target) so it matches across audits.
  - On apply/verify → write `resolved`.
  - On re-audit → for each new finding, if `finding_key` is `resolved`, **verify it's
    still live** (re-fetch the page / re-check the specific signal). If still fixed →
    keep crossed off. If it genuinely regressed → flip to `reappeared` and surface it
    with a "regressed" badge (so recurring ≠ never-actioned).
  - Manual **"Mark done / dismiss"** control per finding for things the auto-check can't
    see.
- **Files:** new migration `migrations/00x_finding_state.sql`; `backend-api/server.js`
  audit/apply endpoints; Audits UI (cross-off + Mark done).
- **Why this is the real fix:** today nothing remembers an action; this gives every
  finding a lifecycle (open → actioned → verified-resolved → (maybe) reappeared).

### 2.3 Image scan marks already-converted as done (#1 part B)
- **Root cause:** `scanMedia` re-lists originals that already have a `.webp` sibling.
- **Fix:** in `scanMedia`, cross-reference the WebP index (already computed in
  `image-optimize.js` as `byStem`/`byExact`) and tag each heavy image
  `alreadyWebp: true/false`. Default the list/counters to **not-yet-converted**; show
  "X of 39 already optimized" so reruns visibly shrink.
- **Files:** `backend-api/image-optimize.js` `scanMedia`; media UI counters.
- **Verify:** convert → rescan → converted ones drop out / show "done", count goes down.

---

## Phase 3 — Push & optimize content for decaying pages (#2)

- **What you want:** for each decaying page, *update and optimise the content* and push
  live — per page, low-friction.
- **Status:** the one-click **Refresh & index** (content-refresh) already writes a
  grounded freshness block live + re-indexes (verified working on Elementor). This phase
  makes it *substantive + optimising*, not just a freshness stamp:
  1. **Deeper refresh option:** beyond the freshness block, optionally rewrite/extend the
     page's weak sections (grounded, conservative) targeting the decayed queries.
  2. **Optimise the page in the same action:** run image-optimize for that page's images
     + offer the CSS/meta/schema fixes for it, so "update + optimise" is one flow.
  3. **Per-page queue:** Content Decay lists each page with one button that does
     update→optimise→push→index, and (via Phase 2) crosses the page off once actioned.
- **Files:** extend `/content-refresh`; Content Decay UI; reuse media-optimize + apply-*.
- **Depends on:** Phase 2 (so actioned pages cross off).

---

## Phase 4 — Multi-country content (#4)

- **Root cause:** UK is hard-coded in `backend-api/prompts.js` — `content.brief`
  ("STRICT UK"), `research.ukScope` (appended to **every** research call),
  `research.gather/trending/facts` ("UK"), and `claude.js` brief ("UK content brief").
  The site has a keyword-market field (`semrush_db`, default `uk`) but it does **not**
  drive the content/research prompts.
- **Fix:**
  1. **Per-site target country** setting (reuse/extend `semrush_db`, or add `country` +
     `locale` + `currency`). Map e.g. `us → United States / en-US / USD`,
     `au → Australia / en-AU / AUD`, etc. (there's already a `COUNTRIES` registry in
     `dataforseo.js`).
  2. **Parameterise the prompts:** turn `research.ukScope` into a generic
     `research.scope` with `{country}/{spelling}/{currency}/{sources}` interpolation;
     remove the literal "UK" from `content.brief`, `research.*`, brief synthesis; pass the
     site's country into every `claude.*` research/brief/intel/plan call.
  3. **UI:** a "Target country" selector per site (Content / Plan / Intel + Settings),
     defaulting to the current market. Changing it re-runs intel/plan for that country.
- **Files:** `backend-api/prompts.js`, `backend-api/claude.js`, the content/intel/plan
  routes in `server.js`, `dataforseo.js` COUNTRIES, Content/Settings UI.
- **Verify:** set go-legal.ai → UK, goodfor.app → (chosen country); intel/brief output
  uses the right spelling, currency, and official sources.

---

## Suggested execution order

1. **Phase 0** (backlinks removal + image un-cap) — immediate, low risk.
2. **Phase 1** (per-site findings) — stops cross-site ghosts (#6).
3. **Phase 2** (done-ledger + image-done) — stops re-suggesting actioned work (#3, #1).
4. **Phase 4** (multi-country) — unblocks goodfor.app / other markets (#4).
5. **Phase 3** (decay push+optimise) — builds on the done-ledger (#2).

Each phase is independently shippable and verifiable. After each, I verify against the
live sites before moving on — no "deployed = done" hand-waving.
