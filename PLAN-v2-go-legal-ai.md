# Implementation Plan v2 — go-legal.ai Autonomous SEO Agent
### "Unbreakable" hardening plan, reconciling v1 code with the go-legal.ai competitive-intelligence brief

| | |
|---|---|
| **Target site** | https://go-legal.ai — UK legal info/SaaS, **YMYL** |
| **Stack** | WordPress 7.0 · Hello Elementor child theme · Elementor Pro · **Rank Math** · **WP Rocket** · JetEngine+ACF · **MalCare** · Hostinger (SSH+WP-CLI+staging) |
| **Scale** | ~1,498 posts · ~29 pages · thousands of images |
| **Status of v1** | Code-complete generic agent (13 CLI cmds). ~70% reusable. This plan hardens it for the real stack. |
| **Prime directive** | Never break a live 1,498-post legal site. Human approval is non-negotiable. |

---

## 1. What changes and why (the reconciliation)

The v1 agent was built for a generic "no SEO plugin" WordPress site. The brief proves go-legal.ai is **not** that. Five assumptions must change before a single write touches production:

### 1.1 🔴 Rank Math collision — STOP rendering our own head tags
- **v1 did:** a companion mu-plugin (`seo-agent-injector.php`) that writes `_seoagent_*` meta and renders `<meta description>`, canonical, OG, JSON-LD into `<head>`.
- **Reality:** Rank Math already renders all of that. Our injector would **duplicate** every tag → SEO damage.
- **Fix:** Retire the head-rendering plugin. Replace with a **meta-registration-only** mu-plugin that exposes Rank Math's real keys to REST:
  `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`, `rank_math_canonical_url`, `rank_math_robots`.
  We **write Rank Math's own fields**; Rank Math keeps rendering. No duplication.
- **Read** existing SEO state via Rank Math's `GET /wp-json/rankmath/v1/getHead?url=<FULL_URL>` (enable "Headless CMS Support" first). Parse the rendered `<head>` blob (no per-field read exists).

### 1.2 🔴 Silent-failure write guard — verify every write
- POST to `/wp/v2/posts/{id}` with an **unregistered** meta key returns **200 OK but silently discards** the SEO field.
- **Fix:** (a) register keys via the mu-plugin so writes stick; (b) **every write is followed by a read-back** that asserts the value matches. No verify = treated as failed. This becomes a hard rule in the client.

### 1.3 🔴 Elementor content model — DB-aware, not post_content
- Page/post body lives in `_elementor_data` (serialized JSON in post meta), **not** `post_content`. v1's image-swap rewrites `content.rendered` → captures nothing on Elementor pages.
- **Fix:** Image-swap and any content edit must operate through one of:
  - **Media-level**: convert/replace at the Media Library (ShortPixel/Imagify or our `sharp`) so Elementor's image references resolve to optimized versions automatically (preferred — no DB surgery).
  - **Staging + visual diff**: any structural change is previewed on Hostinger staging with Playwright before/after screenshots, never blind-written to prod.
- **Pages (29):** can only use registered-key method (companion plugins exclude pages).

### 1.4 🔴 Scale — 1,498 posts needs a queue, not a loop
- v1 runs Lighthouse sequentially over a handful of key pages. That's ~hours→days at 1,498 pages.
- **Fix:** two-tier auditing:
  - **Field/bulk tier:** Google **PSI API** (25k req/day free, runs on Google's servers, includes CrUX field data) for breadth across all URLs, throttled + queued, results stored in **SQLite**.
  - **Lab tier:** local Lighthouse (median-of-3) only on the **prioritized** subset (traffic × gap-to-100).
  - **Prioritization engine:** rank pages by traffic (Search Console) × score gap; never try to 100/100 all 1,498 at once.

### 1.5 🟡 Staging spine + reversible queue — not Git for content
- Elementor DB content can't live in Git. Hostinger staging "Publish" **overwrites the live DB** (loses posts edited after snapshot — dangerous on a busy site).
- **Fix — two approval tracks:**
  - **Code** (child-theme CSS/PHP, schema templates, llms.txt, robots.txt) → **Git + PR**, deploy to staging then prod.
  - **Content/meta** (Rank Math meta, alt text, internal links) → **reversible REST write-queue** straight to production (logged old→new, idempotent, instantly revertible) — avoids the staging-publish overwrite trap for high-volume low-risk changes. Structural Elementor/CSS changes → short staging cycles with visual diffs.

---

## 2. What survives from v1 (the reusable spine)

✅ **Keep as-is or lightly adapt:**
- `src/lib/lighthouse-runner.js` — lab-tier runner (add median-of-3).
- `src/lib/report.js`, `approval.js` — reporting + approval gate (the worksheet model is exactly right).
- `src/lib/verify.js` — before/after re-verify (extend to read from SQLite).
- `src/config.js`, `src/cli.js` — config + CLI spine (extend, don't rewrite).
- DRY_RUN guard, phase structure (`02-images`, `03-performance`, `04-seo`, `05-ai-seo`, `06-accessibility`), orchestrator (`run-all.js`).
- All 7 `.claude/skills/` — adapt prompts to go-legal.ai specifics.

🔧 **Rework:**
- `wp-plugin/seo-agent-injector.php` → `seo-agent-meta.php` (register Rank Math keys, **no head rendering**, + getHead passthrough, + llms.txt/robots only if Rank Math isn't already doing it).
- `src/wp/client.js` → add Rank Math read (getHead), verify-after-write, PSI client, SQLite store, MalCare-allowlisted user-agent, WP Rocket cache-clear trigger.
- `src/phases/04-seo.js` → write Rank Math keys (not `_seoagent_*`); add legal schema, internal-linking, orphan detection.
- `src/lib/image-swap.js` → Media-Library-level optimization (Elementor-safe), not content rewrite.

---

## 3. Target architecture (hardened)

```
              ┌──────────────────────────────────────────────┐
              │  ORCHESTRATOR (Claude Code, Opus)            │
              │  reads CLAUDE.md · plans · dispatches ·       │
              │  aggregates · builds approval report         │
              └───────────────┬──────────────────────────────┘
   ┌──────────┬──────────┬────┴─────┬──────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼          ▼          ▼
Lighthouse  Perf/CWV  Modern-CSS  Image-Opt  SEO/Schema  GEO/LLM   A11y(axe)
 +PSI       (WPRocket) (child-    (Media-lib  (RankMath  (E-E-A-T  (WCAG2.2
 +SQLite     -aware)    theme)     -level)    +legal     +stats)    AA/EAA)
   │          │          │          │          schema)    │          │
   └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
                   TOOLS / SAFETY LAYER
   PSI API · WP REST (App Pwd, least-priv Editor) · Rank Math getHead +
   registered keys · verify-after-write · WP-CLI/SSH · WP Rocket cache hook ·
   MalCare allowlist · SQLite history
                          │
              ┌───────────▼────────────┐
              │   HUMAN APPROVAL GATE    │
              │  Code→Git PR             │
              │  Content→reversible queue│
              └───────────┬────────────┘
                          ▼
        Hostinger STAGING (visual diff) → Publish → PRODUCTION
```

### 3.1 Hard guardrails (deterministic, enforced — not vibes)
1. **PreToolUse hook** hard-blocks any write whose host == production unless `--i-have-approval` token present.
2. **DRY_RUN=true** default (already built).
3. **Verify-after-write** mandatory on every meta write.
4. **WP Rocket cache clear** auto-fires after any successful write (PostToolUse hook → `rocket_clean_domain()` + `rocket_clean_minify()` via WP-CLI).
5. **Rate-limit** REST writes; back off on 429/MalCare blocks.
6. **Backup before batch**: trigger All-in-One WP Migration / MalCare backup.
7. **Idempotent + logged** writes (post id, field, old→new, timestamp) in SQLite → one-command rollback.
8. **YMYL rule**: never alter legal substance; wording changes surface for human review only.

---

## 4. Phased roadmap (maps to brief's B5, adapted to our code)

### Phase 0 — Foundations & safety spine (Week 1)
- [ ] Confirm Hostinger plan tier (SSH+WP-CLI on Premium/Business/Cloud).
- [ ] Create least-privilege `seo-agent` Editor user + Application Password.
- [ ] Allowlist agent user-agent/IP in **MalCare**.
- [ ] Full backup (All-in-One WP Migration).
- [ ] Create Hostinger **staging**.
- [ ] Ship `seo-agent-meta.php` mu-plugin (register Rank Math keys; **delete the head-rendering injector**).
- [ ] Enable Rank Math "Headless CMS Support" (getHead).
- [ ] Write `CLAUDE.md` project memory (site facts, hard rules).
- [ ] **Code:** `wp:check` extended to also verify getHead + a test meta write→read-back round-trip.

### Phase 1 — Read-only audit at scale (Weeks 2–3) — ZERO writes
- [ ] PSI API client + SQLite history store + URL crawler (sitemap → all 1,498).
- [ ] Prioritization engine (traffic × gap-to-100).
- [ ] Baseline: Lighthouse/PSI scores, axe WCAG violations, Rank Math meta/schema gaps, orphan-page detection.
- [ ] First prioritized report → `reports/`.
- [ ] GEO baseline: 30 priority legal queries across ChatGPT/Perplexity/Gemini, log citation share.

### Phase 2 — Low-risk content fixes + approval (Weeks 4–6)
- [ ] Alt text (accessibility + SEO) via Media REST.
- [ ] Meta titles/descriptions via **registered Rank Math keys** + verify-after-write.
- [ ] Image WebP/AVIF (ShortPixel WP-CLI bulk for backlog; Imagify ongoing) — Media-level, Elementor-safe.
- [ ] Reversible REST write-queue; human bulk-approve; rollback tested.

### Phase 3 — Performance / CSS / CWV (Weeks 6–9) — staging-gated
- [ ] WP Rocket RUCSS verify/enable; font/LCP fixes.
- [ ] Modern CSS in child theme (`content-visibility`, `aspect-ratio` for CLS).
- [ ] Delay-JS exclusion lists tested on staging (Elementor/Crocoblock/ProveSource).
- [ ] Playwright visual diffs before approval; cache-clear hook live.

### Phase 4 — Schema, internal linking, GEO (Weeks 9–12)
- [ ] Legal schema: Article/FAQPage/Organization/BreadcrumbList + `LegalService`/`Service` + author `Person` w/ `knowsAbout` (E-E-A-T).
- [ ] Internal-linking engine across 1,498 posts (orphan fix, contextual links, varied anchors) — 15–25% ranking-lift lever.
- [ ] llms.txt (curated 20–50 links, cheap) + AI-bot robots.txt allowlist (OAI-SearchBot, PerplexityBot, Claude-User, etc.) + Bing Webmaster sitemap.
- [ ] GEO content levers: lead-with-answer, citable statistics (+41% visibility), named-source quotations (+28%).

### Ongoing — scheduled monitoring
- [ ] Weekly headless audit (Claude Agent SDK + cron/GitHub Actions), regression alerts.
- [ ] Monthly GEO citation tracking (DIY + optional Otterly Lite ~$29/mo).
- [ ] Quarterly content freshness refresh (dateModified → more AI citations).

---

## 5. Concrete build backlog (next code actions, in order)

1. **Replace the mu-plugin** → `wp-plugin/seo-agent-meta.php` (register Rank Math keys only; no head output).
2. **`src/wp/rankmath.js`** — `getHead(url)` reader + parser; key-write helpers.
3. **Verify-after-write** in `client.js` — `updateMetaVerified()` writes then reads back, throws on mismatch.
4. **`src/lib/psi.js`** — PSI API client (key from `$PSI_KEY`, restricted), median-of-3, CrUX field data.
5. **`src/lib/store.js`** — SQLite history (url, date, scores, violations, write-log for rollback).
6. **`src/lib/crawler.js`** — sitemap → full URL list; orphan detection.
7. **`src/lib/prioritize.js`** — traffic × gap ranking.
8. **Rework `04-seo.js`** — write Rank Math keys; legal schema; internal-link suggestions.
9. **Rework `image-swap.js`** → `media-optimize.js` (Media-Library level, Elementor-safe).
10. **Hooks** — PreToolUse prod-write block; PostToolUse WP Rocket cache clear.
11. **`CLAUDE.md`** + adapt 7 skills to go-legal.ai.
12. **Rollback command** — `node src/cli.js rollback <writeLogId>`.

---

## 6. Open questions (block specific phases)

1. **Hostinger plan tier?** (Determines SSH/WP-CLI availability — Phase 0/3.)
2. **Rank Math: free or Pro?** (Pro = custom schema templates by post type.)
3. **Which image plugin** — ShortPixel, Imagify, or our own `sharp` pipeline?
4. **Search Console / analytics access** for traffic-based prioritization?
5. **Is there budget** for Otterly Lite (GEO) / ShortPixel credits, or keep it all in-house?
6. **Who is the human approver**, and do they want PR review, a wp-admin queue screen, or CLI approval?
7. **Real WP credentials + staging** — when can I get a `wp:check` to pass?

---

## 7. What "unbreakable" means here (the definition of done)
- No write ever reaches production unverified, unlogged, or unapproved.
- Every change is reversible with one command.
- Rank Math keeps owning `<head>`; we only feed it data.
- Elementor content is never blind-edited; Media-level + staging + visual diff.
- Scale is queued and prioritized, never a brute-force loop.
- The legal-substance line is never crossed by automation.
- Cache, security (MalCare), and field-data noise are all explicitly coordinated, not ignored.
