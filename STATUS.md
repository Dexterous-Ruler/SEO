# Project Status — What's Done vs. What's Left

_Generated 2026-06-02. Reconciles the PRD (v1/v2/v3) + PLAN-v2 against the actual codebase,
accounting for the pivot to a **generic multi-site platform** (any WordPress site, not just go-legal.ai)._

---

## ✅ DONE — Engine (the agent core)
- WordPress REST client + **verify-after-write** + rollback ledger
- Lighthouse runner (mobile/desktop) + **PSI API** (scale tier, CrUX field data)
- Sitemap crawler + orphan detection
- Prioritization engine (impact = traffic × gap-to-100)
- Rank Math integration (getHead reader + key writes) + HTML fallback
- All 6 audit phases (images, performance, SEO, AI-SEO, accessibility) + orchestrator
- Stack auto-detection (theme, builder, SEO/cache/image/security plugins, scale)
- JSONL history store (audits + write ledger)
- 19 CLI commands

## ✅ DONE — Web console (Sentinel UI) + backend integration
- Full warm-cream UI implemented, design untouched
- **Generic multi-site**: connect ANY site (URL + user + app password), auto-detect, switch
- **Encrypted secrets** in isolated `private_secrets` table (zero browser access)
- Supabase backend (sites, audits, proposals, activity, settings) + RLS
- Live audit → findings → proposals pipeline (real PSI + SEO read)
- Review Queue, approve/reject/bulk, apply (verify-after-write), rollback
- **Claude API** wired (meta descriptions, titles, alt text) — key in Supabase secret
- Write-armed guard (per-site, default off) + kill switch + DRY_RUN
- Functional: search, notifications, PDF/CSV export, settings toggles, per-finding "Propose fix"
- **Proven**: 2 sites connected (go-legal.ai + go-visa.co.uk), go-legal stays read-only

## ✅ DONE — Safety guarantees (PLAN-v2 §3.1)
- [x] DRY_RUN default · [x] verify-after-write · [x] idempotent + logged + 1-command rollback
- [x] write-armed gate · [x] kill switch · [x] encrypted credentials · [x] YMYL (no auto content edit)

---

## 🔲 LEFT — grouped by value for a GENERIC platform

### A. High-value, generic (work on ANY connected site) — DO THESE NEXT
1. **Auto-fill proposal content with Claude during audit** — right now audit proposals have
   recipe-based before/after; wire `/generate-content` so meta/title/alt proposals get REAL
   Claude-drafted values automatically, ready to approve. *(Engine + Claude already exist.)*
2. **Alt-text generation at scale** — find images missing alt across a site, Claude-draft each,
   queue for approval, write via Media REST. Works on any WP site. (PLAN-v2 Phase 2)
3. **Full-site audit (multi-page)** — queue PSI across many URLs (not just homepage), store
   history, show the prioritized list in the UI. Engine pieces exist (crawler + prioritize + PSI batch).
4. **Apply handlers for all channels** — currently REST-meta writes are live; add image-swap
   (media-level) + theme/CSS proposals as a "manual/export" path with the generated patch.

### B. Per-site / infra (need the specific site's setup — not generic)
5. mu-plugin install + Rank Math headless toggle (per site; go-legal works without it anyway)
6. Hostinger SSH/WP-CLI + ShortPixel bulk (go-legal-specific; unknown plan tier)
7. WP Rocket cache-clear hook + RUCSS (needs WP Rocket per site)
8. Staging environment + visual diffs (per site)

### C. GEO / AI-visibility (generic, cheap, high-ROI)
9. **llms.txt generator** + **AI-bot robots.txt allowlist** — per connected site, one click
10. Schema injection (Organization, Article, FAQ, BreadcrumbList) via the meta bridge
11. GEO content levers (lead-with-answer, citable stats) — Claude-assisted content suggestions

### D. Scheduling & monitoring (v2/v3 of PRD)
12. Scheduled audits (cron / Claude Agent SDK headless) + regression alerts
13. Multi-user auth (Supabase Auth + restore owner-scoped RLS) — currently single-operator anon
14. AI-citation tracking dashboard

### E. Polish
15. "Run audit" scope selector actually drives single/key/full (modal exists, runs homepage now)
16. Internal-linking engine (orphan fix, contextual links) — generic but heavier

---

## 🎯 Recommended next sprint (all generic, build on what exists)
**A1 → A2 → A3 → C9.** In order:
1. **A1** Claude auto-fills proposal content during audit (small, high-impact, ties Claude in fully)
2. **A2** Alt-text-at-scale (the clearest "agent does real work across a whole site" feature)
3. **A3** Full-site multi-page audit (turns the homepage demo into a real site sweep)
4. **C9** llms.txt + AI-bot allowlist generator (cheap GEO win, one click per site)

These need **no per-site infra** and work on any WordPress account connected through the UI.
