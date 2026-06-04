# Product Requirements Document (PRD)
## WordPress SEO & Performance Optimization Agent

| Field | Value |
|-------|-------|
| **Document title** | WordPress SEO Agent — Automated Lighthouse, SEO, Accessibility & AI-Visibility Optimization |
| **Version** | 1.0 (Draft) |
| **Date** | 2026-06-01 |
| **Owner** | Karim |
| **Status** | Draft — for review |
| **Built with** | Claude AI / Claude Code agents & skills |

---

## 1. Overview

### 1.1 Summary
Build an **SEO & performance optimization agent** for a WordPress website, powered by Claude Code agents and skills. The agent runs a repeatable, automated audit-and-fix workflow across every key page of the site and drives each page toward a **100/100 Lighthouse score** in all four categories — **Performance, Accessibility, Best Practices, and SEO** — while also improving **LLM/AI citation visibility**.

The system mirrors the proven workflow described in the reference (used to get a perfect score for "Nomio"): a chained series of Claude skills — *grill-me, modern-css, image-optimization, ai-seo, seo-audit, accessibility* — orchestrated end-to-end. Crucially, **no change is published without explicit human approval.**

### 1.2 Background & Motivation
Traditionally, reaching a perfect Lighthouse score required manually reviewing reports line by line, was error-prone (over-optimizing often broke pages), and consumed days of effort. Claude Code makes this dramatically faster and safer by:
- Automating the discovery of issues across multiple dimensions.
- Generating concrete, page-specific fixes.
- Keeping a human in the loop for approval before anything goes live.

### 1.3 Reference Workflow (source of truth)
The agent implements these capability areas, each backed by a skill/agent:

| Skill / Agent | Purpose |
|---------------|---------|
| **grill-me** | Interrogate requirements and produce a plan *before* writing any code |
| **modern-css** | Write high-quality, modern, performant CSS |
| **image-optimization** | Convert large images (e.g. 4 MB screenshots) into ~40 KB WebP files |
| **ai-seo** | Data tweaks to improve citation/visibility across LLMs |
| **seo-audit** | Full SEO audit and fixes |
| **accessibility** | Full WCAG 2.2 AA audit |

---

## 2. Goals & Non-Goals

### 2.1 Goals
1. **Perfect scores:** Achieve 100/100 on Performance, Accessibility, Best Practices, and SEO for every *key page*.
2. **Automation:** Run audits automatically (on demand and/or scheduled) across the WordPress site.
3. **Actionable fixes:** Generate specific, reviewable fixes — not just reports.
4. **Safety:** Require human approval before any change is published to the live site.
5. **AI visibility:** Improve the site's likelihood of being cited by LLMs (ChatGPT, Claude, Gemini, Perplexity, etc.).
6. **Repeatability:** Re-runnable workflow that prevents regressions over time.

### 2.2 Non-Goals
- Building a general-purpose WordPress page builder or theme.
- Content writing/marketing copy generation (beyond metadata and structured-data fields).
- Managing hosting/server infrastructure migration (recommendations only).
- Paid SEM / ad campaign management.
- Replacing human editorial judgment — the human remains the approver.

---

## 3. Target Users & Personas

| Persona | Needs | How the agent helps |
|---------|-------|---------------------|
| **Site owner / marketer** | Higher rankings, faster site, AI citations | Plain-language reports + one-click approve/reject of fixes |
| **WordPress admin / developer** | Concrete patches, no broken pages | Diff-based, scoped changes with rollback |
| **Accessibility/compliance officer** | WCAG 2.2 AA conformance | Auditable accessibility report and remediations |
| **Agency / freelancer** | Repeatable process across client sites | Configurable, re-runnable workflow |

---

## 4. Scope

### 4.1 In Scope
- Automated Lighthouse runs (mobile + desktop) per key page.
- Image optimization to WebP/AVIF with responsive sizing.
- Core Web Vitals improvements (LCP, INP, CLS).
- Metadata generation/repair (titles, descriptions, canonicals, Open Graph, Twitter cards).
- Structured data / schema.org markup (Article, Organization, BreadcrumbList, FAQ, Product, etc.).
- Internal linking suggestions.
- WCAG 2.2 AA accessibility audit and fixes.
- Modern, performant CSS refactors.
- LLM citation-visibility optimizations (clear structure, semantic HTML, llms.txt, factual clarity).
- Human approval gate before publishing.

### 4.2 Out of Scope (v1)
- Multi-site (network) batch management.
- Automatic rollouts without approval.
- Non-WordPress CMSs.
- Real-time monitoring/alerting (planned for v2).

---

## 5. Key Pages Definition
"Key pages" are the highest-value URLs prioritized for the 100/100 target. Default selection logic:
1. Homepage.
2. Top landing pages / money pages (services, products, pricing).
3. Top-traffic posts (from analytics, if available).
4. Cornerstone/pillar content.
5. Key conversion pages (contact, signup).

The list is **configurable** and reviewed/approved by the human before each run.

---

## 6. Functional Requirements

### 6.1 Workflow Phases
The agent executes a chained, multi-phase pipeline. Each phase produces a report and a set of *proposed* changes.

#### Phase 0 — Plan & Grill (`grill-me`)
- Clarify scope: which pages, environment (staging vs prod), constraints, brand rules.
- Produce a concrete plan and success criteria before any code is written.
- **Output:** Run plan + page list + acceptance criteria.

#### Phase 1 — Baseline Lighthouse Review
- Run Lighthouse for each key page (mobile + desktop).
- Capture baseline scores for all 4 categories and Core Web Vitals.
- Identify top opportunities and diagnostics per page.
- **Output:** Baseline report (per-page scorecard).

#### Phase 2 — Image Optimization (`image-optimization`)
- Detect oversized/unoptimized images.
- Convert to WebP (and optionally AVIF) with appropriate quality.
- Generate responsive `srcset`/`sizes`, add width/height, lazy-load offscreen images.
- Target: large screenshots (e.g. 4 MB) → ~40 KB WebP.
- **Output:** Optimized assets + proposed media/HTML changes.

#### Phase 3 — Performance / Core Web Vitals + Modern CSS (`modern-css`)
- Address LCP, INP, CLS.
- Eliminate render-blocking resources; defer/async non-critical JS; inline critical CSS.
- Refactor to modern, performant CSS; remove unused CSS.
- Preload key resources; set caching/compression recommendations.
- **Output:** Proposed CSS/template/config changes.

#### Phase 4 — SEO Audit (`seo-audit`)
- Validate titles, meta descriptions, canonicals, headings hierarchy.
- Check robots.txt, XML sitemap, indexability, hreflang (if applicable).
- Open Graph / Twitter card metadata.
- Structured data / schema.org validation and additions.
- Internal linking opportunities.
- Broken links / redirects.
- **Output:** SEO findings + proposed metadata/schema/link changes.

#### Phase 5 — AI SEO / LLM Citation Visibility (`ai-seo`)
- Optimize for LLM citation: semantic HTML, clear factual statements, well-structured headings, summaries, Q&A blocks.
- Add/maintain `llms.txt` and consider `llms-full.txt`.
- Ensure entity clarity (Organization schema, author/expertise signals — E-E-A-T).
- Make key facts machine-extractable.
- **Output:** Content-structure & data tweaks for AI visibility.

#### Phase 6 — Accessibility Audit (`accessibility`)
- Full **WCAG 2.2 AA** audit per page.
- Color contrast, alt text, ARIA, keyboard navigation, focus order/visibility, form labels, landmarks, target size (2.2 new criteria), etc.
- **Output:** Accessibility findings + proposed remediations.

#### Phase 7 — Human Approval Gate
- Present a consolidated, per-page change set with diffs and expected score impact.
- Human **approves, rejects, or edits** each change (granular control).
- **Only approved changes proceed.**

#### Phase 8 — Apply & Re-verify
- Apply approved changes (to staging first if available).
- Re-run Lighthouse to confirm improvements and detect regressions.
- Produce before/after comparison.
- **Output:** Final report; publish to production on confirmation.

### 6.2 Human-in-the-Loop Requirements
- **FR-HITL-1:** No change is published without explicit human approval.
- **FR-HITL-2:** Changes are presented as reviewable diffs grouped by page and category.
- **FR-HITL-3:** Approval is granular (accept/reject/edit individual fixes).
- **FR-HITL-4:** All changes are reversible (backup/rollback before apply).
- **FR-HITL-5:** Prefer staging environment for first application when available.

### 6.3 Reporting Requirements
- Per-page scorecards (baseline vs after) for all 4 categories + Core Web Vitals.
- Categorized list of issues with severity and estimated impact.
- Summary dashboard across all key pages.
- Exportable report (Markdown/HTML/PDF).

### 6.4 Configuration Requirements
- Configurable key-page list.
- Environment config (staging/prod URLs, credentials/secrets handling).
- Toggle which phases run.
- Brand/style constraints (e.g., don't alter brand colors that fail contrast — flag instead).
- Thresholds and quality settings (e.g., image quality, target scores).

---

## 7. Technical Approach

### 7.1 Architecture (high level)
```
┌──────────────────────────────────────────────────────────────┐
│                    Orchestrator (Claude Code)                  │
│   Runs phases sequentially, aggregates reports & proposals     │
└──────────────────────────────────────────────────────────────┘
        │            │            │            │           │
   ┌────▼───┐  ┌─────▼────┐  ┌────▼─────┐ ┌────▼────┐ ┌────▼─────┐
   │grill-me│  │lighthouse│  │image-opt │ │seo/ai-  │ │a11y      │
   │ plan   │  │ runner   │  │ webp     │ │ seo     │ │ WCAG2.2  │
   └────────┘  └──────────┘  └──────────┘ └─────────┘ └──────────┘
        │            │            │            │           │
        └────────────┴────► Proposed change set ◄──────────┘
                              │
                     ┌────────▼─────────┐
                     │  Human Approval   │
                     └────────┬─────────┘
                              │ approved
                     ┌────────▼─────────┐
                     │ Apply (staging)   │──► Re-verify ──► Publish
                     └───────────────────┘
```

### 7.2 Claude Code Skills/Agents
Each phase is implemented as a Claude Code skill or subagent. Reuse/adapt the referenced skills:
`grill-me`, `modern-css`, `image-optimization`, `ai-seo`, `seo-audit`, `accessibility`.

A top-level **orchestrator** (Claude Code agent or workflow) chains them, collects structured outputs, and manages the approval gate.

### 7.3 WordPress Integration Options
| Option | How it works | Pros | Cons |
|--------|--------------|------|------|
| **A. WP REST API** | Read/write posts, media, meta via REST | No file access needed; clean | Limited for theme/CSS files |
| **B. WP-CLI** | Run commands on server | Powerful; scriptable | Needs server/SSH access |
| **C. Direct file/theme access** | Edit theme, CSS, templates locally + deploy | Full control over assets/CSS | Requires repo/deploy pipeline |
| **D. Custom WP plugin** | Plugin exposes endpoints + applies approved changes | Safe, scoped, auditable | More to build |
| **E. SEO plugin bridge** | Read/write via Yoast/Rank Math/AIOSEO meta | Leverages existing SEO infra | Plugin-dependent |

**Recommended v1:** Combination of **A (REST API)** for metadata/schema/content + **C/B** for assets and CSS/theme, with a **staging-first** deploy. Consider **D (plugin)** for a polished long-term approval UX.

### 7.4 Tooling
- **Lighthouse:** Lighthouse CI / `lighthouse` Node CLI, or PageSpeed Insights API.
- **Image processing:** `sharp` / `cwebp` for WebP/AVIF conversion.
- **Accessibility:** axe-core / pa11y as automated assist, plus Claude analysis for WCAG 2.2 nuances.
- **Schema validation:** schema.org / Google Rich Results test.
- **Browser automation (optional):** for INP/real interaction checks.

### 7.5 Secrets & Security
- Store WordPress credentials / API keys / application passwords securely (env vars / secret manager).
- Use least-privilege application passwords.
- Never commit secrets to the repo.
- Audit log of all applied changes.

---

## 8. Success Metrics (KPIs)

| Metric | Target |
|--------|--------|
| Lighthouse Performance (key pages) | 100/100 (or ≥95 where infra-limited, with documented blockers) |
| Lighthouse Accessibility | 100/100 |
| Lighthouse Best Practices | 100/100 |
| Lighthouse SEO | 100/100 |
| Core Web Vitals (field/lab) | LCP < 2.5s, INP < 200ms, CLS < 0.1 |
| WCAG conformance | 2.2 AA, zero critical violations |
| Image weight reduction | ≥80% on optimized images (e.g., 4 MB → ~40 KB) |
| Time per full site run | Significantly faster than manual (target: hours, not days) |
| Regressions introduced | 0 unapproved/breaking changes |
| AI citation visibility | Measurable presence/citations in LLM answers (tracked qualitatively v1) |

---

## 9. User Flow (typical run)

1. User specifies the site + key pages (or accepts auto-selected list).
2. Agent runs **grill-me** to confirm scope and plan.
3. Agent runs baseline **Lighthouse** and presents current scores.
4. Agent runs phases 2–6 (images, CSS/CWV, SEO, AI-SEO, accessibility), collecting proposed fixes.
5. Agent presents a **consolidated change set** with diffs + expected impact.
6. User **reviews and approves/rejects/edits** per item.
7. Agent applies approved changes to **staging**, re-runs Lighthouse, shows before/after.
8. On confirmation, changes are **published to production**.
9. Final report archived for the record / future runs.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-optimization breaks layout/functionality | High | Staging-first, re-verify, granular approval, rollback |
| Plugin/theme conflicts | Medium | Detect active plugins; scope changes; test in staging |
| Credentials leakage | High | Secret manager, least-privilege app passwords, no secrets in repo |
| Score depends on hosting/server (TTFB) | Medium | Flag infra blockers; provide recommendations separately |
| Schema/metadata managed by SEO plugin overwrites changes | Medium | Integrate via plugin meta (Yoast/Rank Math) rather than raw HTML |
| Accessibility auto-fixes insufficient for full WCAG | Medium | Combine automated tools + Claude review; flag manual-only items |
| AI citation impact hard to measure | Low/Med | Treat as qualitative v1; iterate |
| Caching/CDN masks changes | Low | Cache-busting + purge step before re-verify |

---

## 11. Assumptions & Dependencies
- Access to the WordPress site (admin, REST API application password, and/or SSH/WP-CLI).
- A staging environment is strongly preferred (will be recommended if absent).
- Claude Code with the required skills installed/available.
- Node.js environment for Lighthouse and image tooling.
- An SEO plugin (Yoast/Rank Math/AIOSEO) may already manage metadata — to be confirmed.

---

## 12. Open Questions (to resolve before build)
1. What is the WordPress site URL, and is there a staging environment?
2. What access is available — REST API, WP-CLI/SSH, theme file access, or a deploy pipeline?
3. Which SEO plugin (if any) is installed (Yoast / Rank Math / AIOSEO / none)?
4. What is the definitive list of "key pages," and how many?
5. Are there brand constraints (colors/fonts) that must not change even if they fail contrast?
6. Should v1 apply changes automatically after approval, or always require staging confirmation?
7. What analytics source defines "top-traffic" pages (GA4 / Search Console)?
8. Hosting/CDN details (caching, server response time constraints)?
9. Are AVIF and `llms.txt` desired in v1, or WebP-only?
10. Preferred report format and where it should be stored?

---

## 13. Roadmap / Phasing

### v1 (MVP)
- Single-site run, key-page list.
- All 7 audit phases + approval gate + apply/re-verify.
- Reporting (Markdown/HTML).
- Staging-first apply, manual publish.

### v2
- Custom WordPress plugin for in-dashboard approval UX.
- Scheduled/recurring runs + regression alerts.
- Field Core Web Vitals (CrUX) integration.
- AI-citation tracking dashboard.

### v3
- Multi-site / agency mode.
- Auto-PR generation for theme repos.
- Continuous monitoring & auto-remediation suggestions.

---

## 14. Acceptance Criteria (v1)
- [ ] Agent runs all 7 phases on the configured key pages without manual hand-holding.
- [ ] Produces per-page baseline and after reports for all 4 Lighthouse categories.
- [ ] Image optimization demonstrably reduces image weight to WebP (≥80% reduction on test assets).
- [ ] SEO phase outputs valid metadata + schema and passes Rich Results test.
- [ ] Accessibility phase produces a WCAG 2.2 AA report with remediations.
- [ ] AI-SEO phase outputs structured-data/content tweaks + `llms.txt` (if in scope).
- [ ] No change is published without explicit human approval.
- [ ] Applied changes are reversible; re-verification confirms improvements with zero breaking regressions.
- [ ] At least the homepage reaches 100/100 across all four categories (or documented infra blockers).

---

*End of document.*
