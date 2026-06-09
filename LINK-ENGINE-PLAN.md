# Sentinel "Link Engine" — Backlink Automation Implementation Plan

> **Status: PLAN ONLY — not yet built.** This document turns the
> *Backlink Automation & Domain Authority* analysis into a concrete, file-by-file
> build plan grounded in Sentinel's actual codebase. It honours the safe-by-default
> model (read-only → write-armed → Review Queue) and reuses existing patterns
> (DataForSEO client, scheduler JOBS, Airtable+n8n loop, per-site prompts, RICE scoring).

---

## 0. Guiding principle (from the analysis)

Automate the **~80% that is safe** — discovery, qualification, scoring, outreach
**drafting**, monitoring, reporting. **Never automate stage 4 (acquisition / placement)** —
that is what triggers Google link-scheme penalties. The Link Engine is a *white-hat
assistant that makes a human faster*, not a link generator.

Map of the 6-stage value chain → Sentinel mechanism we already have:

| Stage | Feature | Reuses (existing Sentinel code) | Live risk |
|---|---|---|---|
| Discover | Backlink profile, Competitor Link Gap, broken-link/mention finder | `dataforseo.js` + `scheduler.js` JOBS | 🟢 read-only |
| Qualify | Link Value Score, spam/anchor checks | deterministic scoring + `claude.js` labels (like `prioritization.js`/Content Intel) | 🟢 read-only |
| Prepare | contact enrichment, AI outreach drafts | `claude.js` + research (`research.js`) | 🟢 read-only |
| Act | send/queue outreach | Airtable grid + n8n + **Review Queue** (like the article loop) | 🟣/🔴 live |
| Monitor | new/lost/toxic alerts | `scheduler.js` + Activity (like `gsc-health`) | 🟢 read-only |
| Report | authority dashboard, ROI | Executive Scorecard + Claude narration | 🟢 read-only |

---

## 1. Data sources — already paid for

- **DataForSEO Backlinks API** is a *separate product on the same account* we already
  use for Labs/keyword data (`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` in env). **No new
  credential.** Live methods, ~`$0.02/request + $0.00003/row`, $100/mo minimum,
  ≈660k rows per $100.
- **Email sending is the one genuinely new dependency** (Phase 2). Route via the existing
  **n8n** rail (Gmail/SMTP node) so we don't buy an outreach SaaS seat. Needs
  SPF/DKIM/DMARC on the sending domain.

---

## 2. Backend: `backend-api/dataforseo.js` — add a Backlinks section

The file currently exposes only Labs endpoints (`ranked_keywords`, `domain_rank_overview`,
`competitors_domain`, `keywordGap`, …) and a `call()` helper that POSTs to
`/dataforseo_labs/google/*`. Add a parallel set of functions hitting `/backlinks/*`.
The existing `call()`, `authHeader()`, `cleanDomain()`, and the `NO_UNITS` / balance
handling are **reused unchanged** (same auth, same error model the UI already renders).

New exported functions (thin wrappers over the live endpoints):

```
backlinksSummary(domain)            → /backlinks/summary/live
                                       { total_backlinks, referring_domains, rank,
                                         backlinks_spam_score, dofollow ratio }
referringDomains(domain, {limit})   → /backlinks/referring_domains/live
backlinksList(domain, {limit,filters}) → /backlinks/backlinks/live
anchors(domain)                     → /backlinks/anchors/live   (anchor over-optimisation)
domainIntersection(targets[])       → /backlinks/domain_intersection/live  ← Competitor Link Gap core
pageIntersection(targets[])         → /backlinks/page_intersection/live    ← resource-page prospecting
bulkNewLost(domains[], window)      → /backlinks/bulk_new_lost_referring_domains/live ← cheap monitoring
```

> ⚠️ Backlinks endpoints are **not** under `/dataforseo_labs/` — add a second tiny POST
> helper (or generalise `call()` to take a full path) since result shape is the same
> `tasks[].result[].items`.

**Cost control (reuse existing pattern):** the file already gates spend via `apiUnits()`
(cents balance). Apply the same: cheap `bulk_new_lost` for daily monitoring across all
sites; reserve full `backlinks` pulls for weekly/on-demand; cache everything in Supabase.

---

## 3. Database: `backend-api/supabase.js` + Supabase tables

All tables keyed by `site_id` (multi-site isolation, same as `audits`, `proposals`).
Add `db.*` helpers mirroring existing ones (`getSite`, `updateSite`, `logActivity`…).

| Table | Key columns | Purpose |
|---|---|---|
| `backlink_snapshots` | site_id, captured_at, total_backlinks, referring_domains, rank, spam_score, dofollow_ratio | time-series → trend chart + alerts |
| `backlinks` | site_id, source_url, source_domain, target_url, anchor, dofollow, first_seen, last_seen, lost_at, domain_rank, spam_score | per-link store; diffed each sync |
| `referring_domains` | site_id, domain, domain_rank, links_count, first_seen, lost_at, relevance, is_toxic | domain-level (the real DR/DA driver) |
| `link_prospects` | site_id, domain, url, source_tactic, contact_email, contact_name, link_value_score, status, reason | discovered opportunities + pipeline status |
| `outreach` | prospect_id, site_id, campaign, draft, sent_at, channel, opened, replied, outcome, won_link_url | outreach attempts/results → ROI + follow-ups |
| `citations` | site_id, directory, url, nap_name/address/phone, status, submitted_at | curated citation/NAP tracking |
| `link_campaigns` | site_id, name, goal, target_pages, tactic, status, links_won, cost | groups prospects into measurable campaigns |

SQL migration goes in the same place as existing schema (a new `migrations/` SQL file or
the `supabase.js` ensure-schema block). Phase 1 only needs the first 4 tables.

---

## 4. Scoring: Link Value Score (deterministic, like RICE in `prioritization.js`)

```
LVS = (Authority × Relevance × Contactability × WinProb) ÷ Effort,  then × (1 − SpamRisk)
  Authority    = domain_rank / 1000           (DataForSEO Rank, 0–1)
  Relevance    = topical match to target page (Claude label / category match, 0–1)
  Contactability = 1 if a valid contact email found else 0.3
  WinProb      = tactic base-rate (broken-link 0.4 > unlinked-mention 0.3 > cold gap 0.15) × personalisation
  Effort       = 1..3 by tactic
  SpamRisk     = f(anchor over-optimisation, link-farm signals, rank < floor)
```

Claude is used **only to label/explain** (relevance, a one-line "why"), never to invent
numbers — same discipline as Content Intel. Prospects below a spam/authority floor are
**auto-rejected**. This same scoring doubles as a **compliance guardrail**: a campaign that
would skew anchor distribution to exact-match or lean on low-authority domains is flagged
*before* any outreach.

---

## 5. Server routes: `backend-api/server.js`

Add a `/backlinks/*` family in the same `routes` object (each is `async (body) => {…}`,
resolving the site via the existing `resolveCreds`/`db.getSite`):

- `POST /backlinks/summary` — return latest snapshot (+ trigger a refresh if stale).
- `POST /backlinks/referring-domains` — list, with new/lost flags.
- `POST /backlinks/gap` — Competitor Link Gap: read `site.competitors` (already stored
  per-site for keyword work) → `domainIntersection([site, ...competitors])` → score → save
  `link_prospects`. **This is the flagship Phase-1 feature.**
- `POST /backlinks/prospects` — list scored prospects (filter by tactic/status).
- `POST /backlinks/monitor` — new/lost/toxic since last snapshot (powers alerts).
- *(Phase 2)* `POST /backlinks/draft-outreach`, `POST /backlinks/push-prospects-airtable`.

Outreach **sends** become live actions → go through the **existing Review Queue / proposals**
mechanism (`db.updateProposal`, the Activity log, DRY_RUN), exactly like `apply-meta`.

---

## 6. Scheduler: `backend-api/scheduler.js` — add to the `JOBS` array

The file already defines `JOBS` (auto-index daily, gsc-health daily, keyword-push weekly,
image-optimize weekly write-armed, apply-css weekly). Add, following the **same risk-split**:

| Job | Cadence | Scope | Cost |
|---|---|---|---|
| `backlink-sync` | weekly | DataForSEO enabled | full pull + snapshot + diff |
| `backlink-watch` | daily | DataForSEO enabled | cheap `bulk_new_lost` + toxic/lost alerts |
| `link-gap` | weekly | competitors saved | refresh domain-intersection, score new prospects |
| `outreach-followup` *(Ph2)* | daily | write-armed + outreach on | send scheduled follow-ups, stop on reply |
| `citation-check` *(Ph3)* | monthly | citation feature on | re-verify NAP, flag new directories |

Reuse the existing `_anyGsc` / `_anyAt`-style account caches and the hourly tick. Results
land in **Activity** (same as today). The whole thing respects `AUTOMATION_ENABLED`.

---

## 7. AI: `claude.js` + `prompts.js` (per-site, already site-aware)

- `claude.js`: add `outreachDraft({prospect, targetPage, siteId})`,
  `classifyProspect(...)`, `narrateLinkMovement(...)` — each takes `siteId` and uses the
  site-aware `SYSTEM(siteId)` / `sys(key, siteId)` plumbing already in place.
- `prompts.js`: register 3 new prompts in the `Backlinks` category so they're editable
  per-site in Admin → AI Prompts (the per-site-only editor we just shipped):
  `backlinks.outreach`, `backlinks.classify`, `backlinks.narrate`.

---

## 8. Frontend: `web/api.jsx` + `web/soft-dashboard.jsx`

- `api.jsx`: add `backlinksSummary`, `backlinksGap`, `backlinksProspects`,
  `backlinksMonitor`, `(Ph2) backlinksDraftOutreach`, `backlinksPushAirtable`.
- `soft-dashboard.jsx`:
  - New **`BacklinksScreen`** with tabs: **Profile** (DR/rank trend from snapshots,
    referring-domain count, do-follow ratio), **Link Gap** (flagship — competitor
    intersection table, LVS-ranked, "add to prospects"), **Prospects** (pipeline list),
    **Monitor** (new/lost/toxic feed). Reuse `SoftCard`, `NeoButton`, `Chip`, `ErrBanner`,
    the table styling from the DataForSEO screen, and `posTone`-style colour helpers.
  - Register in **`SNAV_GROUPS`** under a new "Authority" sub-section, and add entries to
    **`NAV_INDEX` + `searchCommands`** so the command palette finds "backlinks", "link gap",
    "domain authority".
  - Add a **Playbook** authority stage (extend the numbered checklist in `PlaybookScreen`):
    1 Connect backlink data 🟢 · 2 Review profile & gap 🟢 · 3 Approve outreach 🟣 ·
    4 Run authority automation 🔴.
  - Add an **Authority panel** to the Executive Scorecard: DR/rank trend, **net new referring
    domains** (the metric that matters), links won / cost per link, anchor-text health.

---

## 9. Outreach loop (Phase 2) — clone the article pipeline verbatim

The existing loop is: *Sentinel finds gap keywords → `airtable.pushKeywords` (de-duped) →
operator sets Status="Write Article" → n8n watches Status → writes article.* The outreach
loop is the **same shape**, reusing `airtable.js` (`pushKeywords`/`createRecord`/
`updateRecord`/`listRecords`) against an **outreach base**:

*Sentinel finds & scores prospects → push to Airtable outreach base (de-duped) → Claude
draft sits in the grid → operator sets Status="Send Outreach" → n8n sends + schedules 2
follow-ups (stop on reply) → replies/opens/won-links tracked back.* Sending is gated on
write-armed + Review Queue + DRY_RUN, and honours CAN-SPAM/GDPR/PECR (identify sender,
opt-out, business contacts, logged lawful basis).

---

## 10. Phased roadmap (each phase independently shippable)

**Phase 1 — Intelligence (MVP, zero live-write risk) — ~3–5 weeks**
`dataforseo.js` backlinks fns · `backlink_snapshots`/`backlinks`/`referring_domains`/
`link_prospects` tables · `BacklinksScreen` (Profile + Link Gap + Monitor) · Scorecard
Authority panel · `backlink-sync` + `backlink-watch` + `link-gap` jobs · Link Value Score ·
new/lost/toxic alerts.
→ *Immediately replaces the manual prospecting/"directory guy" research with a measured pipeline.*

**Phase 2 — Assisted outreach — ~4–6 weeks**
Airtable outreach base · Claude drafts + contact enrichment · Review-Queue send flow ·
n8n send + `outreach-followup` · reply/open/won tracking · campaign ROI.

**Phase 3 — Authority operations — ~4–6 weeks**
Curated citation/directory finder + NAP checks (the safe replacement for manual directory
hunting) · digital-PR (HARO/Featured/Qwoted) monitoring & drafting · disavow assistant
(flag-only, human-approved) · full scheduler cadence on armed sites · anchor/velocity guardrails.

---

## 11. Guardrails (non-negotiable, enforced in product)

- Human approval for every send/placement on un-armed sites (Review Queue); auto-send only
  on explicitly armed sites within strict daily rate limits.
- Anchor-text & link-velocity monitors warn before a campaign looks unnatural.
- Hard spam-score / authority floors auto-reject low-quality prospects; **directories curated,
  never bulk-blasted**.
- Never facilitate paid do-follow links; flag any sponsored relationship for nofollow/sponsored.
- Full audit trail + reversibility (Activity log), DRY_RUN parity, disavow stays manual.

---

## 12. KPIs

Net **new relevant referring domains / site / month** (true DR/DA driver) · DR/rank trend ·
links won & cost per link per campaign · outreach reply/win rates · organic £ value on
linked target pages. Operational: prospects qualified/week, operator time per won link
(should fall sharply), email deliverability health.

---

## 13. Why this is low-risk to build

Every layer already exists and is proven in Sentinel — DataForSEO client + cost-gating,
Supabase encrypted multi-site store, the scheduler with no-double-run guarantee, the
Airtable+n8n pipeline, Claude with per-site prompts, the Review Queue, and the Executive
Scorecard. The Link Engine is **additive** (new files/tables/routes/screen), introduces **no
new deployable**, and the only net-new operational concern is **email deliverability**, which
is isolated to Phase 2.
