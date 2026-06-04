# System Analysis — Coverage, Gaps & Out-of-the-Box Opportunities

_Generated 2026-06-03. A thorough review of: what was asked for (all requirement docs), what's
actually built (full code inventory), what's missing, and genuinely novel features worth adding —
grounded in 2026 GEO/AEO research._

---

## Part 1 — Requirements coverage (APP-REQUIREMENTS.md → reality)

| Requirement | Status | Evidence |
|---|---|---|
| **3.1 Multi-account** — add via URL+user+app pwd, validate, switch, status, remove, staging | ✅ Done | `/site-connect`, SiteSwitcher, Sites screen, `removeSite`, staging field |
| **3.2 Auto stack detection** — WP, theme, builder, SEO/cache/image/security plugins, mu-plugin, scale | ✅ Done | `detect.js` (regex signatures + REST counts), tested live |
| **3.3 Capability selection** — per-site toggles, pre-selected from detection | ✅ Done | Settings caps toggles → Supabase; detect returns `caps` |
| **3.4 Auditing & reporting** — read-only audits, progress, in-app reports, CWV+field, prioritized, **history**, export | ✅ Done | `runAudit`, Audits screen, **Audit History screen**, PDF/CSV export |
| **3.5 Agentic fixing** — propose, approval gate, apply via API, verify-after-write, reversible, cache, rate-limit, YMYL | 🟡 Mostly | Apply+verify+rollback live; **cache-purge & staging-first not wired to the UI apply path** |
| **3.6 Approval workflows** — review queue, diffs, in-app + WP-side queue, audit log | 🟡 Mostly | In-app queue ✅; **WP-side mu-plugin queue exists in code but not wired** |
| **4 Backend connection** — thin API, background jobs, safety reflected, future-proof | 🟡 Mostly | Thin API ✅; **no real background jobs** (audits are foreground; modal progress is simulated) |
| **5 Security** — encrypted secrets, never echoed, revocable, kill switch, prod confirm, audit trail, firewall guidance | ✅ Done | `private_secrets` table (zero anon access), kill switch, activity log |
| **6 Reliability** — read-only default, graceful degrade, idempotent, clear states | ✅ Done | DRY_RUN, retry/backoff, status enum (proposed→verified→rolled-back) |
| **7 User journeys** (6) | ✅ All work | connect, switch, audit, approve+fix, recover/rollback, kill switch |
| **9 Definition of Done** | ✅ Met | every DoD bullet satisfied |

**Verdict: ~90% of the spec is built and working.** The gaps are refinements, not missing pillars.

---

## Part 2 — Real gaps (things that should exist but don't, or are half-built)

### 🔴 Functional gaps (worth closing)
1. **No real background jobs.** Audits run in the foreground (one PSI call). The RunAudit modal's
   phase animation + the AddSite detection steps are **simulated timers**, not real progress.
   For full-site sweeps this matters. *(Req 4: "long jobs run in the background and notify.")*
2. **Apply path doesn't do staging-first or cache-purge.** The engine *can* (`writeTarget()`,
   WP Rocket hooks designed) but the UI apply calls `apply-meta` straight at production meta.
   *(Req 3.5: "staging-first when available; cache coordination.")*
3. **Multi-page / full-site audit not exposed.** Engine has `crawl` + `psiBatch` + `prioritize`,
   but the UI only audits the homepage. The "scope" selector in the modal is cosmetic.
4. **Re-verify / before-after deltas** exist in `verify.js` (CLI) but aren't called after a UI apply.
   *(Req 3.5: "after applying, re-verify and show before/after deltas." Partially: history shows deltas.)*

### 🟡 Smaller stubs
5. **"Add brand constraint"** button (Settings) is a no-op toast. *(Req 3.3 captures brand constraints.)*
6. **"Allowlist guide"** button just toasts — should open real MalCare/Wordfence guidance. *(Req 5.)*
7. **Search results** filter correctly but clicking a result navigates to the screen, not the exact item.
8. **WP-side approval queue** (`enqueueChanges` + mu-plugin route) coded but not wired to the UI.
9. **Image-swap** + **llms.txt/schema apply** handlers exist in the engine but aren't exposed as endpoints.
10. **Inline proposal edit** uses `window.prompt()` — works, but not polished.

### ⚪ Multi-user (architectural, deferred by design)
11. RLS was relaxed to anon for single-operator use. True multi-user needs Supabase Auth +
    restoring owner-scoped policies. Backend-only change; doesn't touch the design.

---

## Part 3 — Out-of-the-box opportunities (novel, high-ROI, grounded in 2026 research)

These are **genuinely differentiated** features the research validates as real (not hype), each
implementable with the stack already in place (**WP REST + Claude API + PSI + Supabase**).

### ⭐ Tier 1 — build these (best ROI-to-effort, unique observability)

**A. AI-Citation Share Tracker** — *replicates the entire $29–$500/mo paid category (Profound, Otterly, Peec).*
- A prompt library (~20–50 buyer-intent queries per site) run weekly through Claude (+ optionally
  Perplexity/OpenAI APIs). Parse each answer for: brand mention, cited URL, sentiment, competitor mentions.
- Compute **Share of AI Voice** = % of prompts citing the site, vs competitors, as a time series.
- **Why it's the headline feature:** this is exactly what clients pay for, it's fully inside our stack
  (Claude does both the querying *and* the extraction pass), and nothing else we have touches it.
- **Honest caveat:** API answers ≠ consumer-UI answers; noisy run-to-run → use trends, multiple samples.

**B. AI-Bot Crawl Analytics + robots.txt advisor** — *observability the client can't get anywhere else.*
- AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't run JS → invisible to GA. The only truth is
  **server-side request logging.** Ship a tiny **mu-plugin logger** (we already ship a mu-plugin) that
  records requests by user-agent into a table, exposed via a REST endpoint the agent reads.
- Output: which AI bots visit, how often, which URLs — and **coverage gaps** ("GPTBot has never
  crawled your top 5 money pages → fix internal links/sitemap"). Plus a robots.txt strategy advisor.
- **Why:** concrete, unique, ties directly to GEO outcomes. Research shows real per-bot patterns.

**C. Content-Decay Detector** — *Frase's "Content Watchdog," replicable; one of the few truly differentiated 2026 features.*
- Pull **Google Search Console** data (Search Analytics API) over 12–14 months → flag pages with
  ≥20% click decline over 8 weeks, sorted by absolute click loss. Cross-ref WP `modified` date → "old + declining."
- Claude generates a **substantive refresh brief** (new stats, sections, examples) — NOT a date bump
  (Google detects cosmetic refreshes; research is explicit). Human approves.
- **Why:** highest-value pages surface first; targets exactly what 2026 core updates reward.
- **Needs:** GSC OAuth (one new integration) — the only Tier-1 item requiring a new API.

### ⭐ Tier 2 — strong, build on what exists

**D. Information-Gain Scorer** — *novel; no clean standalone implementation seen in market.*
- Claude rates a page 0–100 on **novelty** (data not on competitors), **specificity** (named cases,
  numbers, primary sources), **extractability** (facts stated quote-ably). Feed page + top competitor
  pages (WebFetch). Output: score + "add this unique data" recs.
- Extends the Content-Intel screen we already built. Targets what AI engines actually cite.

**E. Entity / JSON-LD automation with validation** — *highest-leverage schema type per research.*
- Claude generates `Organization` schema with `sameAs`/`knowsAbout` → Wikidata/LinkedIn/Crunchbase IDs,
  plus Article/Product where they mirror visible content. **Validate** (Rich Results / Schema.org) before
  write-back via REST. Skip dead FAQ/HowTo rich-result chasing (deprecated 2026).
- We have the meta-bridge + apply path; this is a new proposal type + a validation step.

**F. Information-Gain / SERP-gap "content brief" generator**
- Diff the live AI answer (from feature A) + top competitor pages against the client's page → Claude
  produces a concrete content-delta brief. More defensible than keyword-gap (no paid keyword API needed).

### ⚪ Tier 3 — ship cheap, don't hype

**G. llms.txt generator** — *we already generate it.* Research verdict: ~10% adoption, ~0 SEO traffic
impact (408 hits across 500M AI-bot visits), but it IS used by IDE agents for docs sites. **Ship as a
low-priority checkbox, position honestly, don't oversell.**

**H. Programmatic-SEO *defense*** — detect templated thin-content patterns on the client's site and flag
deindex risk (2026 core updates punish scaled content). Defensive, not generative.

---

## Part 4 — Recommended roadmap

**Close the gaps that matter (1 sprint):**
1. Full-site multi-page audit wired to the UI (engine pieces all exist) — turns homepage demo into a real sweep.
2. Real background-job model for long audits (status in Supabase, poll/notify) — satisfies Req 4 honestly.
3. Staging-first + cache-purge in the apply path — satisfies Req 3.5 fully.

**Then the headline differentiators (in order):**
4. **AI-Citation Share Tracker** (Feature A) — the single biggest product differentiator, all in-stack.
5. **AI-Bot Crawl Analytics** (Feature B) — unique observability via the mu-plugin we already ship.
6. **Content-Decay Detector** (Feature C) — needs GSC OAuth; highest content ROI.
7. **Information-Gain Scorer** (Feature D) + **Entity schema automation** (Feature E).

**Polish anytime:** brand-constraint modal, allowlist guide, search deep-links, inline editor.

---

## Part 5 — One-paragraph honest summary
The system **delivers ~90% of what was specified** and the core promise — connect any WordPress site,
auto-detect, audit, propose Claude-drafted fixes, approve, apply with verify-after-write + one-click
rollback, all multi-site with encrypted secrets — **works end-to-end and is verified live.** The real
remaining work is (a) a few honest-engineering gaps (background jobs, staging-first apply, full-site
sweep) and (b) the chance to leapfrog competitors with **AI-citation tracking, AI-bot crawl analytics,
and content-decay detection** — three features the 2026 research validates as genuinely high-ROI and
that our exact stack (WP REST + Claude + PSI + Supabase) can implement without buying a keyword API.
