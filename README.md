# WordPress SEO Agent

Claude-powered SEO, performance, accessibility & AI-visibility optimization agent for WordPress.
Drives key pages toward **100/100 Lighthouse** (Performance, Accessibility, Best Practices, SEO)
and improves **LLM citation visibility** — with **human approval before anything is published**.

See [PRD-WordPress-SEO-Agent.md](PRD-WordPress-SEO-Agent.md) for the full product spec.

---

## How it works

A chained, multi-phase pipeline (mirrors the reference workflow):

| Phase | Skill | What it does |
|---|---|---|
| 0 | grill-me | Confirm scope & plan before any change |
| 1 | lighthouse | Baseline scores + Core Web Vitals per page |
| 2 | image-optimization | Convert oversized images → WebP/AVIF |
| 3 | modern-css | Core Web Vitals + modern, performant CSS |
| 4 | seo-audit | Metadata, schema, internal links, sitemap |
| 5 | ai-seo | LLM citation visibility, `llms.txt`, structured facts |
| 6 | accessibility | WCAG 2.2 AA audit & fixes |
| 7 | approval | Human reviews diffs → approves/rejects |
| 8 | apply | Apply to staging, re-verify, then publish |

**Nothing is written to the live site without explicit approval.** `DRY_RUN=true` by default.

---

## Setup

```bash
npm install
cp .env.example .env      # then fill in WP_BASE_URL + Application Password
```

Create a WordPress **Application Password**: WP Admin → Users → Profile → Application Passwords.

Edit `config/sites.json` to list your **key pages** (the URLs we drive to 100/100).

---

## Usage

```bash
npm run wp:check                  # verify WordPress connectivity & auth
npm run audit                     # Lighthouse audit across key pages → reports/
node src/cli.js audit --page https://example.com/pricing   # single page
```

Reports are written to `reports/` as both Markdown (human) and JSON (machine).
A roll-up lands in `reports/SUMMARY.md`.

---

## Safety model

- `DRY_RUN=true` (default): the agent only **reads** and **proposes**. No writes.
- Writes are guarded in the WordPress client and require an explicit `apply` step.
- Prefer setting `WP_STAGING_URL` so changes land on staging first.
- All proposed changes are presented as reviewable items before apply.

---

## The companion mu-plugin (Rank Math meta bridge + approval queue)

The target site (go-legal.ai) runs **Rank Math**, which already owns `<head>`. So the
agent does **not** render its own meta — that would duplicate tags. Instead it ships
[wp-plugin/seo-agent-meta.php](wp-plugin/seo-agent-meta.php) (copy to
`wp-content/mu-plugins/`), which:
- **registers Rank Math's own meta keys for REST** (`rank_math_title`,
  `rank_math_description`, `rank_math_canonical_url`, `rank_math_focus_keyword`,
  `rank_math_robots`) on **both posts and pages** — so writes actually stick and
  Rank Math keeps rendering. No duplication.
- provides a **wp-admin approval-queue screen** (approve / reject / rollback) with
  **verify-after-write** and automatic WP Rocket cache clearing.
- exposes a `selftest` route so `node src/cli.js selftest` confirms wiring.

> The silent-failure trap: a REST write to an *unregistered* meta key returns 200 OK
> but discards the value. This plugin registers the keys; the agent also reads back
> every write to confirm it stuck (`updateMetaVerified`).

See [PLAN-v2-go-legal-ai.md](PLAN-v2-go-legal-ai.md) for the full hardening plan.

## Full pipeline

The simplest path is the orchestrator, which runs phases 1–6 and stops at the approval gate:

```bash
node src/cli.js run            # phases 1-6 → proposals + reports/APPROVAL.md
node src/cli.js approve --all  # 7. approve (or edit reports/approved.json per item)
node src/cli.js apply          # 8. apply approved changes  (guarded by DRY_RUN)
node src/cli.js swap           #    rewrite <img> refs → uploaded WebP (after real apply)
node src/cli.js reverify       #    re-run Lighthouse, diff vs. baseline → reports/REVERIFY.md
```

Or run any phase individually:

```bash
node src/cli.js audit          # 1. baseline Lighthouse (lab, key pages)
node src/cli.js images         # 2. WebP proposals
node src/cli.js perf           # 3. performance / modern-css proposals
node src/cli.js seo            # 4. SEO audit
node src/cli.js ai-seo         # 5. llms.txt + Organization schema
node src/cli.js a11y           # 6. WCAG 2.2 AA analysis + manual checks
```

### Scale tier (for 1,498-post sites like go-legal.ai)

```bash
node src/cli.js selftest       # confirm Rank Math + mu-plugin wiring
node src/cli.js crawl --orphans  # sitemap → all URLs + orphan detection → .data/
node src/cli.js psi --all --limit 100   # Google PSI audit at scale (CrUX field data)
node src/cli.js prioritize --gsc pages.csv   # rank by impact = traffic × gap-to-100
node src/cli.js rollback <writeId>   # reverse any verified meta write
```

See [SETUP.md](SETUP.md) for go-live and [PLAN-v2-go-legal-ai.md](PLAN-v2-go-legal-ai.md)
for the hardened go-legal.ai blueprint.

## Status — v1 complete (code)

- [x] Project scaffold, config, WordPress REST client
- [x] Lighthouse runner (mobile + desktop) + reporting
- [x] Image optimization phase (WebP) → proposals
- [x] Performance / modern-css phase → CWV-targeted proposals
- [x] SEO audit phase (metadata, schema, links)
- [x] AI-SEO phase (llms.txt, Organization schema)
- [x] Accessibility phase (WCAG 2.2 AA, incl. 2.2 manual checks)
- [x] Full orchestrator (`run`) chaining phases 1–6 → approval gate
- [x] Approval gate (worksheet + approved.json)
- [x] Apply handlers (media upload, meta/schema, llms.txt) — DRY_RUN-guarded
- [x] Image reference-swap (`swap`) — rewrite content to uploaded WebP
- [x] Before/after re-verify (`reverify`) vs. locked baseline
- [x] Companion mu-plugin for metadata/schema/llms.txt injection
- [x] Claude Code skills under `.claude/skills/` (orchestrator + 6 phases)
- [ ] **Live run against the real site** — needs your `.env` + mu-plugin install (see [SETUP.md](SETUP.md))

> The full pipeline is verified end-to-end in DRY_RUN/offline mode. The only remaining
> step to formally close v1's acceptance criteria is the live run, which requires your
> WordPress credentials.
