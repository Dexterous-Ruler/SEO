# Application Requirements — WP SEO Agent Console

**Document type:** Functional & product requirements (what the app must do).
**Out of scope for this doc:** visual layout, colors, spacing, exact components — those are decided in design. The only design constraint captured here is the **experience principle** in §1.

---

## 1. Experience Principle (the one design rule)
The app must feel **sleek, warm, interactive, and organized into clear, purposeful sections.** Every screen should make the user feel in control and safe — never overwhelmed, never afraid they'll break their live site. Warmth + clarity + responsiveness are the non-negotiable qualities; the specific look is a design decision.

---

## 2. Purpose
A web console that puts a human in command of the Claude-powered WordPress SEO/performance/accessibility/AI-visibility agent (the backend already built). The user connects one or more WordPress sites, lets the app auto-detect each site's stack, runs read-only audits, reviews findings, and approves agentic fixes that are applied safely — **never breaking the live site.**

---

## 3. Core Capabilities (the "what")

### 3.1 Multi-Account WordPress Management
- **Add a WordPress account** using: site **URL**, **username/user ID**, and **Application Password**.
- Validate the connection on add (the backend's `wp:check`) and show clear success/failure with the reason.
- **Store multiple accounts** and let the user **switch (toggle) between connected sites** at any time; the active site scopes everything shown.
- Show per-account status: connected / auth-failed / unreachable, the authenticated user's role, and whether write-mode is armed.
- Edit, re-authenticate, or remove an account. Removing an account purges its stored secret.
- Optional per-account **staging URL** so writes can target staging first.

### 3.2 Automatic Stack Detection
- On connect (and on demand), **auto-detect the site's environment**: WordPress version, active theme (and child theme), page builder (e.g. Elementor), **SEO plugin** (Rank Math / Yoast / AIOSEO / none), caching/performance plugin (e.g. WP Rocket), image plugin (ShortPixel/Imagify/EWWW), security plugin (e.g. MalCare), and other relevant plugins.
- Detect whether the **companion mu-plugin** is installed and whether SEO meta keys are write-ready (the `selftest`).
- Detect site scale (counts of posts, pages, media; sitemap URL count).
- Present the detected stack so the user can confirm or correct it; detection should degrade gracefully when something can't be auto-read.

### 3.3 Capability / Tool Selection
- Let the user **choose which agent capabilities to enable** per site: Lighthouse/PSI audit, image optimization, performance/CSS, SEO audit, AI-SEO/GEO, accessibility.
- Where the app can infer the right choice from detection (e.g. "Rank Math present → use Rank Math write path"), **pre-select it automatically** and let the user override.
- Capture per-site preferences: image tool, whether to use staging, brand constraints (locked colors/fonts the agent must not change), target pages/scope.

### 3.4 Auditing & Reporting
- Trigger **read-only audits** (single page, key pages, or full-site sampled) from the UI.
- Show **live progress** while audits run (long jobs run in the background and notify on completion).
- Generate **reports inside the app**: per-page scorecards (Performance / Accessibility / Best Practices / SEO), Core Web Vitals incl. real-user field data, prioritized issue lists (impact = traffic × gap), site-wide patterns, duplicate-content, AI-visibility gaps.
- Keep **history** so the user can see trends and regressions over time.
- Let the user **export/share** a report.

### 3.5 Agentic Fixing (safe by construction)
- For each finding, the agent **proposes a concrete fix** with: what it changes, where, expected impact, risk level, and fix channel (REST write vs theme/CSS vs manual).
- Nothing is applied without an explicit **human approval gate** — granular (accept / reject / edit per item), plus bulk-approve for low-risk batches.
- Apply approved changes **agentically via API calls** (REST, etc.), with these hard guarantees:
  - **Verify-after-write:** every write is read back and confirmed; silent failures are surfaced, not hidden.
  - **Reversible:** every change is logged old→new and can be **rolled back with one action**.
  - **Staging-first** when available; clear warning when a target is production.
  - **Cache coordination:** trigger the caching plugin's purge after writes.
  - **Rate-limited & backed-off** so the site and its security plugin aren't tripped.
  - **Never touch legal/substantive content** without explicit human review (YMYL guardrail).
- After applying, **re-verify** and show before/after deltas.

### 3.6 Approval Workflows
- A clear **review queue** of pending proposals per site, grouped by discipline/page.
- Show diffs and predicted score impact for each item.
- Support both **in-app approval** and reflecting the WordPress-side approval queue (admin can approve in either place; state stays consistent).
- Audit log of who approved what and when.

---

## 4. Connection to the Backend
- The app is a **frontend over the existing agent backend** (the Node/CLI engine: WP REST client, PSI/Lighthouse runner, crawler, prioritization, Rank Math integration, verify-after-write, history store, phase modules, approval/apply, rollback).
- Backend functions are exposed to the UI through a thin API layer; the UI never re-implements agent logic — it **invokes** it.
- Long-running operations (full-site audits, bulk applies) run as **background jobs** with progress and completion events surfaced in the UI.
- The same safety switches the backend enforces (DRY_RUN default, write guards) are **reflected and controllable** in the UI.
- The design must accommodate **future backend capabilities** (new audit types, new fix handlers, new integrations) without UI rework — capabilities are discovered/declared, not hard-coded per screen.

---

## 5. Security & Trust (must-haves)
- **Application Passwords / API keys are secrets:** stored encrypted at rest, never shown back in full, never logged, never sent to the client beyond what's needed, revocable from the UI.
- Per-account least-privilege; one app password per site/integration.
- A visible, global **safety state** (read-only vs write-armed) and a **kill switch** that disables all writes instantly.
- Clear, explicit confirmation before any write to **production**.
- Full **audit trail** of connections, audits, approvals, writes, and rollbacks.
- Sensible handling when a site blocks the agent (security plugin / firewall) — detect, explain, and guide the allowlist fix.

---

## 6. Reliability & Safety Behaviors
- Treat the live site as **sacred**: default to read-only, require deliberate action to write, and make every write reversible.
- Degrade gracefully: if detection, an API, or a job partially fails, show what worked, what didn't, and why — never a dead end.
- Idempotent operations: re-running an audit or re-applying shouldn't duplicate or corrupt state.
- Clear distinction in the UI between **proposed**, **approved**, **applied**, **verified**, **rolled-back**, and **failed** states.

---

## 7. Primary User Journeys (acceptance-level)
1. **Connect a site:** enter URL + user + app password → connection validated → stack auto-detected → capabilities pre-selected → ready.
2. **Switch sites:** toggle the active account → all data/scopes update to that site.
3. **Run an audit:** pick scope → run → watch progress → read the in-app report with prioritized issues.
4. **Approve & fix:** review proposals → approve (granular or bulk) → agent applies safely (staging/verify/rollback-ready) → re-verify → see before/after.
5. **Recover:** open any applied change → roll it back in one action → confirm reverted.
6. **Stay safe:** flip the global kill switch → all writes disabled until re-armed.

---

## 8. Non-Goals (for now)
- No auto-publishing without human approval.
- No editing of legal/substantive content by the agent.
- No requirement to manage non-WordPress sites.
- This document does not specify visual design, layout, or color — only that the app honor the experience principle in §1.

---

## 9. Definition of Done
- A user can connect and toggle between multiple WordPress accounts via app password.
- The app auto-detects each site's stack and pre-selects the right capabilities.
- Read-only audits produce clear, prioritized, in-app reports with history.
- Fixes flow through a human approval gate and are applied agentically, verified, and reversible — with the live site never broken.
- Secrets are protected, writes are guarded, and every action is auditable.
