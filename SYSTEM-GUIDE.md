# Sentinel — WordPress SEO Agent Platform

> A "superhuman" SEO control room for WordPress sites. It audits your sites, finds the
> keywords and content to win (from your own rankings, competitors, gaps and trends),
> generates and applies on‑page fixes, optimises images, manages your Airtable content
> pipeline, and runs the safe parts automatically — all from one dashboard.

Live: **https://sentinel-goodfor-2e75db85.koyeb.app**

---

## 1. What it is, in one paragraph

Sentinel is a single web app that connects to your WordPress sites and the data sources
that matter for SEO (Google Search Console, DataForSEO, PageSpeed, Airtable, and the
Claude AI model). It turns SEO from a pile of manual chores into a **structured, mostly
automated workflow**: connect a site → audit it → generate site‑specific keywords and
content ideas → review and apply fixes to the live site → let the scheduler keep things
healthy. Every change to a live page is verified and reversible.

It is **multi‑site**: one dashboard, switch between sites from the top bar; each site has
its own data, connections, audits, and Airtable base.

---

## 2. How it's built (architecture)

| Layer | What it is |
|---|---|
| **Console (frontend)** | A no‑framework React UI (`web/`), precompiled to plain minified JS at deploy time for fast loads. |
| **Engine (backend API)** | A zero‑dependency Node HTTP server (`backend-api/server.js`) that serves *both* the console and the API on one port. |
| **Database** | Supabase (Postgres) — stores sites, audits, proposals, activity, chat history, Airtable config; **all secrets are encrypted at rest** (WordPress app‑passwords, GSC/Airtable tokens) and only decrypted server‑side. |
| **WordPress** | Each site is reached over the WordPress REST API using an **Application Password**. Two small WordPress plugins extend it (see §9). |
| **AI** | Anthropic **Claude** (Sonnet) for content generation, clustering, narratives, the chat assistant. |
| **Hosting** | One Docker container on **Koyeb** (always‑on). The Dockerfile builds the optimised frontend bundle, then runs the Node server. |

Everything runs as **one service** — no separate frontend host, no microservices.

### Performance
The console used to compile itself in the browser (3 MB of Babel + transforming ~400 KB
of code on every visit). It's now **precompiled with esbuild at deploy time**: React
production build, minified + gzipped JS, no in‑browser compilation. First load is
dramatically faster.

---

## 3. The core idea: safe by default, automated where it's safe

Sentinel writes to live client sites, so safety is built in:

- **Read‑only by default.** A site only accepts writes when you **arm** it ("Write‑armed").
- **DRY_RUN** global switch — writes are simulated unless explicitly applied.
- **Review Queue** — proposed page changes wait for your one‑click approval.
- **Verify‑after‑write** — every write is read back to confirm it actually stuck (WordPress/Rank Math can silently discard writes; Sentinel catches that).
- **Reversible** — applied changes are logged and can be rolled back.
- **Automation is split by risk:** safe analysis/sync jobs run automatically for all sites; live‑page writes either go through the Review Queue or only auto‑apply on sites you've explicitly armed.

---

## 4. The Playbook — the standard process for every site

The **Playbook** is the home screen: one numbered, top‑to‑bottom checklist so you never
have to hunt around. Each step shows a **live status** (computed from real data) and a
**tag** telling you whether it touches the live site.

```
1 · Connect (one-time)
   1. Connect the WordPress site            [Setup]
   2. Connect Google Search Console         [Read-only]
   3. Connect the site's Airtable base      [Off-site]

2 · Analyse (read-only — nothing goes live)
   4. Run a site audit                      [Read-only]
   5. Review content opportunities          [Read-only]

3 · Improve (this is where changes happen)
   6. Approve & apply on-page fixes         [Writes to LIVE site]
   7. Optimise images to WebP               [Writes to LIVE site]
   8. Push keywords to Airtable             [Off-site]

4 · Automate (hands-off)
   9. Automation is running                 [Automatic]
```

Tags: **🔴 Writes to LIVE site** · **🟣 Off‑site (Airtable/Google)** · **🟢 Read‑only**.
A progress chip (e.g. "4/9 done") and a per‑site **"Ready / Setup n/4"** badge in the site
switcher tell you at a glance which sites are fully set up.

The left sidebar groups everything into clean, collapsible sections (Overview · Audit &
Fix · Content & Growth · Data Sources · Assistant · Manage), and the **search bar is a
universal command palette** — type "speed", "schema", "keyword gap", etc. and jump
straight to that tool.

---

## 5. Features, screen by screen

### Dashboard & Executive Scorecard
- **Dashboard** — site health, category scores (Performance / Accessibility / Best
  Practices / SEO), scale (posts/pages/media/sitemap), audit‑score trend, fix queue,
  recent activity.
- **Executive Scorecard** — a data‑driven board view: organic traffic **value (£)**,
  composite score and trend, AI share‑of‑voice, and a **RICE‑ranked "Do next"** list.
  A **Weekly Briefing** button has Claude narrate the numbers (it never invents figures).

### Audits & On‑Page Fixes
- **Audits** — runs Lighthouse/PageSpeed, lists findings with a **"Road to 100"** progress
  bar per category, and ranks fixes by **RICE** (Reach × Impact × Confidence ÷ Effort,
  weighted by real per‑page clicks when GSC is connected).
- **On‑Page Fixes** (6 tools):
  - **Internal Links** — proposes contextual links between your *real* published pages.
  - **Schema** — generates JSON‑LD (Article, FAQ, LegalService, etc.) and can **apply it to the live page** (see §8).
  - **AI‑SEO Facts** — extracts citable facts + an FAQ/FAQPage schema to improve LLM/AI‑search citation.
  - **CSS Fixes** — generates conservative CSS for fixable audit findings (contrast, target‑size, CLS, focus‑visible, font‑display) and can **apply it to the live site**.
  - **Images** — scan heavy JPEG/PNG, convert to WebP, and **Enable auto‑WebP** (see §7).
  - **Speed Test** — PageSpeed (median‑of‑N) for mobile + desktop with Core Web Vitals.

### Search Console (GSC)
- **One‑click "Connect with Google" (OAuth)** — sign in with your Google account; no
  service‑account key file needed. The connection is **global** across the dashboard
  (one Google account serves every site), and each site **auto‑maps to its matching
  property** (go‑legal.ai → go‑legal.ai, etc.). You can switch properties from a dropdown.
- Real clicks/impressions/CTR/position; **Top Queries / Top Pages / Quick Wins
  (positions 11–20) / Content Decay / Anomalies / Indexing & Drops**.
- **Auto‑index** new URLs via Google's Indexing API (bypasses the manual 10/day limit),
  **de‑index detection** (URL Inspection), and **ranking‑drop** tracking.

### DataForSEO (keyword data)
- **Top Keywords, Traffic Value (£), Striking Distance, Competitors, Keyword Gap** — UK
  database, pay‑as‑you‑go.

### Content Plan & Content Intel — the "smart machine"
- **Content opportunities** are built from **four real signals** and gap‑checked against
  your sitemap:
  1. **Ranking** — your GSC queries + DataForSEO ranked keywords (esp. page‑2 strikers).
  2. **Competitors** — keyword gaps vs. your saved competitors (what they rank for, you don't).
  3. **Trending** — rising‑demand keyword ideas seeded from your niche.
  4. **Sitemap** — your real pages, to flag clusters with **no page yet = a content gap**.
- Claude clusters/labels; all volumes, gaps, trends and scores are computed deterministically.
  Output = **scored topic clusters** ready to push to Airtable.

### Airtable — see §6.

### Review Queue, AI Chat, Activity, AI Visibility, Admin, Settings
- **Review Queue** — proposed page changes with an Approve / Edit / Reject diff view.
- **AI Chat (Strategist)** — a site‑aware assistant with live tools (it can read the
  site's audits, keywords, GSC data, pages, etc.). Streams responses; also a floating
  assistant on every screen.
- **Activity** — full audit trail (writes, approvals, rollbacks, failures, automation runs); exportable.
- **AI Visibility (GEO)** — measures how often AI assistants cite your site vs competitors; generates `llms.txt` + AI‑bot robots rules.
- **Admin** — integration status (6 services), and 12 editable AI prompts with diff/history/test.
- **Settings** — capability toggles, safety switches (DRY_RUN, staging‑first, write mode), masked credentials.

---

## 6. Airtable — the content pipeline (and how it connects to n8n)

Airtable is where your **articles get written** (by your own n8n automation). Sentinel's
job is to feed it the right keywords and let you manage it without leaving the dashboard.

- **One token, per‑site base.** Connect your Airtable token once (it's global, like GSC);
  then **each site picks its own Base → Table → Keyword column** from dropdowns. Each site
  has a different Airtable base.
- **Keyword push.** "Push keywords" finds **content‑gap keywords** (clusters with no
  existing page, from ranking + sitemap + competitors + trends) and writes them — and
  **only** them — into the chosen **Keyword column**, **de‑duplicated** against the rows
  already there (so it never creates duplicates).
- **Embedded editable grid.** The Airtable table is rendered **inside the dashboard** as a
  live spreadsheet — all columns, 50 rows per page, **inline cell editing**, add rows, and
  **dropdowns for select fields**. Edits save straight back to Airtable.
- **Trigger n8n from here.** The **Status** column is an editable dropdown. Set a row to
  **"Write Article"** in the grid and it updates Airtable — which is exactly what your n8n
  workflow watches — so you **kick off article generation without ever opening Airtable**.
- **"Open in Airtable"** shortcut deep‑links to the site's base/table if you want the full
  Airtable UI.

So the loop is: **Sentinel finds gap keywords → drops them in Airtable → you (or the
scheduler) set Status → n8n writes the article.**

---

## 7. Images → WebP (two approaches)

1. **Auto‑WebP (recommended)** — the **"Enable auto‑WebP"** button installs and activates
   the **Converter for Media** plugin via the WordPress REST API. It converts and serves
   WebP/AVIF for **all** images server‑side — including legacy upload paths and Elementor
   CSS backgrounds — which is the robust solution for real/migrated sites.
2. **Built‑in optimiser (fallback)** — scans the media library for heavy JPEG/PNG, converts
   them to WebP (memory‑safe: shrink‑on‑load + 2560px cap so big photos can't crash the
   server), and uploads them, **skipping anything already converted**. Runs **automatically
   weekly** on write‑armed sites.

---

## 8. Applying schema & CSS to live pages (the `seo-agent-optimize` plugin)

Schema and CSS can't be applied to a live Elementor/Rank Math site safely over the
standard REST API. Sentinel ships a tiny WordPress plugin, **`seo-agent-optimize`**, that
provides the safe apply layer **without editing your page content**:

- **Schema** — injects per‑page JSON‑LD into `<head>` (coexists with Rank Math).
- **CSS** — injects site‑wide custom CSS.
- **WebP map** (optional) — serves WebP for mapped images.
- **Auto cache‑purge** — clears WP Rocket / LiteSpeed / object cache so changes show instantly.
- Everything is **reversible** (clear the value or deactivate the plugin).

The dashboard's **"Apply to live"** buttons (Schema and CSS tabs) and the scheduled
**auto‑apply‑CSS** job use this plugin. *(Installed once per site from WP Admin → Plugins
→ Add New → Upload Plugin, using the zip in `wp-plugin/seo-agent-optimize.zip`.)*

---

## 9. WordPress plugins used

| Plugin | Purpose | Install |
|---|---|---|
| **seo-agent-meta** (mu‑plugin) | Registers Rank Math meta keys for REST so the agent can write title/description/canonical (and verifies they stick); provides an in‑WP approval queue. | `wp-content/mu-plugins/` |
| **seo-agent-optimize** | The live‑apply layer: schema + CSS injection, WebP map, cache‑purge. | Upload the zip via WP Admin, or drop in `mu-plugins/`. |
| **Converter for Media** (wp.org) | Server‑level WebP/AVIF conversion & serving for all images. | Auto‑installed by the **Enable auto‑WebP** button. |

---

## 10. Automations (the scheduler)

A built‑in scheduler runs hands‑off jobs on a cadence (it survives restarts; one always‑on
instance, so no double‑runs). Results appear in **Activity**.

| Job | Cadence | What it does | Scope |
|---|---|---|---|
| **auto‑index** | Daily | Submits recent URLs to Google's Indexing API | Sites with GSC connected |
| **gsc‑health** | Daily | Alerts on not‑indexed pages, ranking drops, content decay | GSC connected |
| **keyword‑push** | Weekly | Pushes new content‑gap keywords to Airtable (de‑duped, cost‑gated) | Airtable configured |
| **image‑optimize** | Weekly | Compresses heaviest images → WebP (deduped) | **Write‑armed** sites |
| **apply‑css** | Weekly | Applies audit CSS fixes via the optimize plugin | **Write‑armed** + plugin present |

Toggle the whole scheduler with the `AUTOMATION_ENABLED` env var. Live‑page writes only
auto‑apply on **write‑armed** sites; everything else (audits, keyword pushes, indexing,
alerts) is safe and runs for all connected sites.

---

## 11. Integrations & required credentials

| Integration | Used for | Credential |
|---|---|---|
| **Anthropic Claude** | Content, clustering, narratives, chat | `ANTHROPIC_API_KEY` |
| **Supabase** | Database + encrypted secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SITE_SECRET_KEY` |
| **Google (GSC + Indexing)** | Search Console data, auto‑index | One‑click OAuth (`GOOGLE_OAUTH_CLIENT_ID/SECRET`, `PUBLIC_BASE_URL`) |
| **DataForSEO** | Keyword volumes, gaps, CPC | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |
| **PageSpeed Insights** | Speed tests / Lighthouse | `PSI_KEY` |
| **Perplexity / Tavily** | Live web research for content briefs | `PERPLEXITY_API_KEY`, `TAVILY_API_KEY` |
| **Airtable** | Content pipeline | Personal Access Token (stored per dashboard, global) |
| **WordPress** | Read/write each site | Application Password (admin, per site) |
| **n8n** | Writes the articles | Watches the Airtable Status column |

> The Google **Indexing API** must be enabled in your Google Cloud project for
> auto‑indexing to fire (the scheduler logs a clear alert if it isn't).

---

## 12. Setting up a new site (the standard process)

1. **Connect WordPress** — add the site with an **admin Application Password**.
2. **Arm writes** if you want the agent to apply changes (otherwise it stays read‑only).
3. **Connect Google Search Console** — one click; pick the property (auto‑suggested).
4. **Connect Airtable** — pick the site's **base → table → keyword column**.
5. **Install `seo-agent-optimize`** (for schema/CSS apply) and click **Enable auto‑WebP**.
6. **Run an audit**, review opportunities, and either apply fixes via the Review Queue or
   let the scheduler handle the safe parts.

The Playbook walks you through exactly this, with live status at each step.

---

## 13. Deployment

- **Container:** one Docker image on Koyeb (`Dockerfile`, multi‑stage: build the optimised
  console with esbuild, then run the Node server).
- **Health:** `GET /health` → `{ "ok": true }`.
- **Redeploy:** push to `main` → trigger a Koyeb redeploy (the build pulls `main` HEAD).
- **Env vars:** set on the Koyeb service (see §11). `DRY_RUN`, `AUTOMATION_ENABLED` control
  safety/automation.

---

## 14. Glossary

- **RICE** — Reach × Impact × Confidence ÷ Effort; how fixes are prioritised.
- **Striking distance / Quick wins** — keywords ranking in positions 11–20 (page 2), the fastest to push onto page 1.
- **Content gap** — a topic cluster with real demand but **no existing page** on your site.
- **Write‑armed** — a site you've explicitly allowed the agent to write to.
- **GEO** — Generative Engine Optimisation: visibility/citation inside AI assistants.
- **Verify‑after‑write** — reading a change back to confirm it actually saved.

---

*Sentinel turns "a pile of SEO chores across many sites" into "one structured dashboard
that does the safe work for you and asks before touching anything live."*
