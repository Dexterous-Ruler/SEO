# Sentinel × AEO Playbook × claude-seo — Integration & Optimization Plan

**Status:** Completion doc · 26 Jun 2026
**Inputs analyzed:** (1) the AEO (Answer Engine Optimization) playbook doc; (2) the open-source [`AgriciDaniel/claude-seo`](https://github.com/AgriciDaniel/claude-seo) Claude Code plugin (v2.2.0, **MIT**).
**Method:** 4-agent grounded analysis (claude-seo architecture, claude-seo tooling, Sentinel current-state inventory → synthesis), cross-checked against the live Sentinel codebase (`D:\Karim`).

---

## 0. TL;DR — the one thing to take away

Sentinel already owns **both ends** of the modern search ladder — **SEO** (GSC, DataForSEO, audits, content decay) and **GEO / AI-citation** (`runCitationTracking` across ChatGPT/Claude/Gemini/Perplexity, `buildLlmsTxt`, AI-bot allow-rules, entity signals, FAQPage). What's missing is the **AEO middle layer**: answer-first 40-60-word blocks, the 4 snippet formats with real HTML tables/lists, **HowTo + Speakable + VideoObject** schema, question-pattern research, **positions-2-10 snippet-steal** targeting, and the impression-vs-click measurement loop.

The good news: the expensive infrastructure (live GSC, a per-site niche-aware prompt registry, a deterministic schema `@graph` builder, a proposal→mu-plugin live-write loop, the n8n/Airtable writer) **already exists**. AEO is therefore mostly **~6 new prompt-registry keys, ~4 schema generators, ~3 GSC query filters, and porting claude-seo's offline content-intelligence trio** — not a new system. claude-seo provides the missing *muscle* (offline content verify/quality/humanize, GSC quick-win logic, drift detection, GEO measurement MCPs); we **build net-new** the answer-first/snippet/PAA layer on top of our own primitives, and **never** bolt on a parallel Python plugin.

---

## 1. The two assets, briefly

### 1a. The AEO playbook (strategy)
Answer Engine Optimization = structuring content to *be the answer*, not just to rank. Core tenets:

- **The ladder:** **SEO** (rank in blue links) → **AEO** (win featured snippets / PAA / voice) → **GEO** (be cited in ChatGPT/Perplexity/Gemini). Layers, not competitors. 50%+ of Google searches are zero-click.
- **6 answer surfaces:** Featured Snippet · People-Also-Ask · Voice · Knowledge Panel · Google AI Overview · Local Pack.
- **Answer-first content:** question-format H2/H3 → a **40-60-word** direct answer with *no preamble* → real HTML `<ol>`/`<ul>`/`<table>` (not styled divs) → FAQ of 6-10 real questions → schema matching the structure.
- **4 snippet formats:** paragraph (definition), list (how-to), table (X vs Y), video (timestamps + VideoObject).
- **Question research:** PAA boxes, Google autocomplete, AlsoAsked, AnswerThePublic, Reddit/Quora, support tickets, **GSC queries filtered to question words**. Patterns: definitional / procedural / comparative / evaluative.
- **Schema priority:** FAQPage > HowTo > Article > **Speakable** (voice) > Organization/Person > Product.
- **Targeting & measurement:** chase queries where you already rank **positions 2-10** (snippet-steal); measure via **rising impressions + flat clicks** in GSC, manual SERP checks, and voice tests.
- **North-star quote:** *"In the answer economy, clarity beats authority."*

### 1b. claude-seo (capability donor)
An **MIT-licensed Claude Code plugin** (analysis-only; it never publishes to a site). Ships **18 specialist agents**, **25 skills**, **~50 Python scripts**, **8 MCP extensions**, and one schema-validation hook. It runs parallel sub-agents to produce falsifiable 0-100 audits aligned to Google's AI Optimization Guide. Its genuinely differentiated assets:

- **Offline content-intelligence trio** — `content_verify.py` (claim → citation-gap detector), `content_quality.py` (QRG filler/AI-pattern/density scorer, 0-100 + thin flag), `content_humanize.py` (~47-pattern AI-phrase → plain-prose cleaner). Zero-dependency, deterministic.
- **`gsc_query.py`** — correct site totals + **quick-win detection (pos 4-10, >50 impressions)** = the snippet-steal engine.
- **`seo-geo` agent + GEO scoring** — citability (134-167-word passages), AI-crawler/`llms.txt` checks, brand-mention correlation (YouTube ~0.737, Reddit, Wikipedia).
- **Drift subsystem** — `drift_baseline`/`drift_compare` ("git for SEO"): SQLite snapshots + 17 weighted rules catching silent schema/canonical/noindex loss.
- **`lcp_subparts.py`** — decomposes LCP into 4 CrUX phases (TTFB/load-delay/load-duration/render-delay) → targeted fix.
- **Policy-level schema validation** (`schema_ecommerce_validate.py` + `validate-schema.py` hook) — encodes 2025/2026 Google deprecations as code.
- **`url_safety.py`** — DNS-pinned, rebinding-resistant SSRF guard (reference implementation).
- **GEO measurement MCPs** — DataForSEO `AI_OPTIMIZATION` (ChatGPT scraper + LLM-mention tracking), Profound (citation time-series), SE Ranking (AI share-of-voice).

> Note: claude-seo deliberately **lacks** FAQPage/HowTo/Speakable generators (it treats them as AI-Overview signals, not rich-result wins). So the AEO answer-surface schema is something we **build**, using its `schema_generate.py` as a clean pattern to extend.

---

## 2. Gap analysis

| Capability | Sentinel has it? | AEO needs it? | claude-seo provides? | Priority |
|---|---|---|---|---|
| Answer-first 40-60w block generator | **No** (writes full articles) | Yes (core) | Pattern only | **P1** |
| Snippet-format detector (para/list/table/video) | No | Yes | Pattern only | **P1** |
| FAQPage schema gen + publish | **Yes** (`schema-gen.js`, `/ai-seo-facts`) | Yes | No (kept as AI signal) | have it |
| **HowTo** schema | **No** | Yes (#2) | No (deprecated by choice) | **P1** |
| **Speakable** schema (voice) | **No** | Yes | No | **P2** |
| **VideoObject** + timestamps | **No** | Yes (1 of 4) | Yes (`templates.json`) | **P2** |
| Schema **validation gate** (placeholder/deprecated) | **No** | Yes | **Yes** (`validate-schema.py`) | **P1** |
| PAA / question research → brief | Weak (fire-and-forget to Airtable) | Yes | Pattern | **P1** |
| GSC snippet-steal (rank **2-10**) | **No** (only striking-distance 11-20) | Yes | **Yes** (`gsc_query.py`) | **P1** |
| Question-word GSC filter | **No** (free signal, already collected) | Yes | Yes (`seo-google`) | **P1** |
| Rising-impressions + flat-clicks detector | **No** | Yes (the measurement) | Implicit | **P1** |
| GEO / AI-citation tracking | **Yes** (`runCitationTracking`, `/geo-prompts`) | Yes (GEO rung) | Readiness + paid MCPs | augment |
| Content drift detection | Weak (click-based decay only) | Implied | **Yes (best-in-class)** | **P2** |
| Content quality / AEO-readiness score | **No** | Yes | **Yes** (`content_quality.py`) | **P1** |
| Humanization / AI-phrase cleaner | **No** | Yes | **Yes** (`content_humanize.py`) | **P2** |
| AI-content claim verification (YMYL) | **No** | Yes | **Yes** (`content_verify.py`) | **P1** |
| Programmatic / cluster content | Yes (`content.cluster`, `content-opportunities.js`) | Yes | Yes | have it |
| Local Pack / GBP / NAP | **No** (`LegalService` entity only) | Yes (1 of 6) | **Yes** (`seo-local`/`seo-maps`) | P3 |
| IndexNow / fast indexing | Partial (GSC submit) | Implied | **Yes** (`indexnow_submit.py`) | **P2** |
| CWV decomposition (LCP subparts) | Partial (PSI/Lighthouse) | Yes (speed/voice) | **Yes** (`lcp_subparts.py`) | P2 |
| Backlinks | **Dormant** (wrappers, no route/UI) | Optional | Yes | P3 |
| hreflang / international | **No** | Optional | Yes (deep) | P3 |

---

## 3. What to integrate — and exactly where it bolts on

### A) PORT THE CODE (offline, MIT, highest ROI — re-implement in JS, not Python)
Sentinel is a **zero-dep Node backend** — do **not** drag in a Python runtime. The load-bearing logic is regex tables + scoring math; re-implement in a new `backend-api/content-quality.js`:

- **`content_verify.py` → `verifyClaims(html)`** — extracts statistic/quantity/authority/temporal claims and flags any lacking a citation within ~200 chars. **Wire as a blocking gate in the Approve Changes queue** before `/content-refresh` and `mapArticleBrief` publish. *This is the YMYL trust net Sentinel currently has zero of — critical for the legal/visa/settlement niche.*
- **`content_quality.py` → `scoreContent(html)`** — QRG-aligned filler/AI-pattern/density score (0-100) + thin-content flag. **Surface as an "AEO Score" column on Content Analysis** and a reject-below-60 gate in the Airtable writer flow.
- **`content_humanize.py` → `humanize(text)`** — deterministic AI-phrase cleaner. **Wire as a post-generation pass** in `refreshArticle`/`mapArticleBrief` (`claude.js`) with an auditable diff in the proposal.

### B) PORT THE CODE (credentials Sentinel already holds)
- **`gsc_query.py` quick-win logic → add `quickWins()` + `questionQueries()` + `snippetVisibility()` to `gsc.js`** (reuses existing OAuth). New **Search Console → "Snippet Steal"** sub-tab (beside Quick Wins / Striking Distance). Implements the playbook's "target positions 2-10" + "rising impressions + flat clicks" directly, for free.
- **`validate-schema.py` + `schema_ecommerce_validate.py` pattern → add `validateSchema()` to `schema-gen.js`** that runs before `/apply-schema` writes via mu-plugin. Blocks placeholder JSON-LD and encodes the May-2026 FAQ-rich-result retirement / HowTo deprecation as guards.

### C) ADOPT THE PATTERN (re-skin storage onto Supabase)
- **`drift_baseline` + `drift_compare` → new `backend-api/drift.js`** storing baselines in **Supabase** (not SQLite). Capture title/meta/canonical/robots/H1-3/**schema**/OG + content hash; 17-rule diff. AEO-critical use: detect when a deployed **answer block, FAQPage, or schema silently disappears** — a failure mode click-based decay can't see. New **Audits → "Drift"** sub-tab.
- **`dataforseo_normalize.py` token-budget truncation → adopt in `dataforseo.js`** (mirrors the recent `content-rewrite` 4096-token discipline) to cut LLM context cost.
- **`seo-cluster` SERP-overlap clustering** — optionally upgrade `content.cluster`/`content-opportunities.js` to cluster on shared top-10 URLs (DataForSEO) rather than text similarity.

### D) WIRE THE MCP (BYO-credential — the GEO time-series Sentinel scores but can't trend)
- **DataForSEO `AI_OPTIMIZATION` (ai-scrape / ai-mentions)** first (you likely already hold a DataForSEO key) → historical ChatGPT-mention tracking into **AI Search Visibility**.
- Then **Profound** (citation time-series) + **SE Ranking** (AI share-of-voice) for trended dashboards.

### E) DO NOT integrate (duplicate / out of scope)
claude-seo's FAQPage handling (you generate it), and its commodity wrappers (`pagespeed_check`, `crux_history`, `nlp_analyze`, `keyword_planner` — you have PSI/Lighthouse/DataForSEO). `ucp_check`/`agent_ux_check`/`portability_check` are forward-looking/advisory. Don't run two schema generators or two cluster engines.

---

## 4. Net-new AEO capabilities to build

| Capability | Lives in | Mechanism |
|---|---|---|
| **Answer-first rewriter** (question H2/H3 → 40-60w no-preamble answer + real `<ol>/<ul>/<table>`) | New prompt key `aeo.answerBlock` (`prompts.js`) → `claude.js` → `POST /aeo-answer-block` (`server.js`) | Reuses the geo_context niche prepend + proposal queue. Output is a **snippet-targeted block**, not a full article. |
| **Snippet-format detector** | New `aeo.snippetFormat` key + classifier consuming DataForSEO SERP features | Maps query intent → para/list/table/video, then routes to `aeo.answerBlock` with the right template. New sub-tab on **Content Analysis**. |
| **FAQ/HowTo/Speakable/Video schema injector + validator** | Extend `schema-gen.js`: `buildHowTo()`, `buildSpeakable()`, `buildVideoObject()` into the `@graph` + `validateSchema()` gate | HowTo from procedural answer blocks; Speakable `cssSelector` over the 40-60w answer; published via existing `/apply-schema` mu-plugin path. |
| **PAA harvester → brief** | Upgrade `dataforseo.peopleAlsoAsk` + new `research.questionPatterns` prompt | Classify PAA + autocomplete + GSC question-words into definitional/procedural/comparative/evaluative; feed `content.brief` and the Airtable writer instead of fire-and-forget. |
| **GEO citation monitor (time-series)** | Augment `geo.js`/`runCitationTracking` with DataForSEO-AI | Persist citation snapshots to Supabase for trend lines on **AI Search Visibility**. |
| **AEO-readiness score + measurement loop** | `content-quality.js` (ported) + `gsc.js` `snippetVisibility()` | Per-page 0-100; rising-impressions/flat-clicks detector closes the measurement loop. |

---

## 5. Phased roadmap

### Phase 1 — Quick wins (days)
1. **Answer-first rewriter** — `aeo.answerBlock` + `aeo.snippetFormat` keys in `prompts.js`; `/aeo-answer-block` route; render in **Page Fixes → "Answer Blocks"**.
2. **GSC snippet-steal + question filter** — `quickWins()` (pos 2-10), `questionQueries()`, `snippetVisibility()` in `gsc.js`; **Search Console → "Snippet Steal"** sub-tab. *(free, already authed)*
3. **Content-intelligence trio** — new `content-quality.js` (`verifyClaims`/`scoreContent`/`humanize`); wire `verifyClaims` as an **Approve Changes** blocking gate, `scoreContent` as a **Content Analysis** column.
4. **Schema validation gate** — `validateSchema()` in `schema-gen.js` before `/apply-schema`.

### Phase 2 — Weeks
1. **HowTo + Speakable + VideoObject generators** in `schema-gen.js`, deprecation-aware via `validateSchema()`. *(closes the #1 structural gap)*
2. **PAA harvester → brief** — `research.questionPatterns`; upgrade `peopleAlsoAsk` to classify + push structured questions into `content.brief`/Airtable.
3. **Drift subsystem** — `drift.js` on Supabase, 17-rule diff incl. schema/answer-block loss; **Audits → "Drift"**.
4. **Humanization pass** wired into `refreshArticle`/`mapArticleBrief` with audited diff.
5. **IndexNow** — port `indexnow_submit.py` (key pre-flight) as `/indexnow-submit`; trigger on publish.
6. **DataForSEO-AI** wired into `runCitationTracking` for time-series GEO.

### Phase 3 — Strategic
1. **Local Pack / GBP** (LocalBusiness/NAP schema + geo-grid) — directly relevant to the legal-services niche; new **Local** screen.
2. **Profound / SE Ranking** MCPs for AI share-of-voice dashboards.
3. **SERP-overlap clustering** upgrade to `content-opportunities.js`.
4. **`lcp_subparts`** decomposition into the Speed Test screen; revive **backlinks** (with `commoncrawl_graph.py` confidence-weighting) only if it earns its place.

---

## 6. Risks & sharp edges

- **Licence/attribution:** claude-seo is **MIT** — reusable in closed commercial work **with attribution**. ⚠️ Its `content_humanize`/`content_quality` phrase lists derive from **Wikipedia AI-Cleanup (CC BY-SA 4.0)**; copying those tables verbatim attaches a **share-alike** obligation to the derived list. **Regenerate our own phrase table from scratch** (or isolate + attribute it). The `seo-flow` prompt library is **CC BY 4.0** — skip it; we don't need it.
- **Python-in-a-Node-stack:** Sentinel is deliberately zero-dep Node. **Re-implement** the offline trio + drift logic in JS — only the regex/math is load-bearing. Don't import Playwright/trafilatura/SQLite.
- **API costs/keys:** Profound/SE Ranking/Ahrefs are paid; DataForSEO-AI burns credits — gate behind cost discipline (mirror `dataforseo_costs.py` pre-call estimation; we already cap rewrite tokens). **GSC quick-wins/question-filter are free — do those first.**
- **YMYL accuracy:** legal/visa/settlement is YMYL. The answer-first rewriter **must** run `verifyClaims` as a hard gate — a confidently-wrong 40-60w block in a Featured Snippet or AI Overview is a liability, not a win. Keep human approval in the loop (proposal queue).
- **FAQ/HowTo schema reality:** Google **retired FAQ rich results (May 2026)** and **deprecated HowTo** — generate them as **AI-Overview / entity signals**, not for blue-link rich snippets, and have `validateSchema()` say so. Don't promise rich-result wins from them.
- **Duplicate-capability bloat:** extend existing primitives (FAQPage, clustering, citation tracking, PSI/CWV); don't run parallel versions.

---

## 7. North-star — the 5 highest-leverage moves

1. **Ship the answer-first rewriter as a prompt-registry key** (`aeo.answerBlock`) feeding the existing proposal→mu-plugin loop. This single move turns Sentinel from a *full-article* writer into an *answer-surface* engine — the entire AEO middle layer — with almost no new infrastructure.
2. **Turn on free GSC snippet-steal** (`quickWins()` pos 2-10 + question-word filter + rising-impressions/flat-clicks). Zero new credentials; implements the playbook's targeting **and** measurement, and points the rewriter at the exact queries worth winning.
3. **Port the offline content-intelligence trio** and make **`verifyClaims` a blocking proposal-queue gate** — the YMYL trust moat and the AEO-readiness score in one, all offline and free.
4. **Add HowTo + Speakable + VideoObject to `schema-gen.js` with a deprecation-aware `validateSchema()` gate** — closes the biggest structural gap (3 of 4 snippet formats + the voice surface) using the schema `@graph` builder we already ship live.
5. **Wire DataForSEO-AI (then Profound) into `runCitationTracking`** — upgrade our best existing asset from point-in-time to trended share-of-voice, so GEO becomes a monitored KPI, not a spot check.

**Files to change:** `backend-api/prompts.js` (`aeo.*` + `research.questionPatterns`), `backend-api/gsc.js` (quick-wins/question/snippet-visibility), `backend-api/schema-gen.js` (HowTo/Speakable/VideoObject + `validateSchema`), `backend-api/claude.js` (answer-block + humanize pass), `backend-api/server.js` (new routes), new `backend-api/content-quality.js` + `backend-api/drift.js`, `backend-api/dataforseo.js` (PAA classify + token budget), `web/soft-dashboard.jsx` (new sub-tabs: Answer Blocks, Snippet Steal, Drift, AEO Score).

---

## Appendix A — claude-seo capability map (reference)

**18 agents:** seo-technical, seo-content (E-E-A-T), seo-schema, seo-sitemap, seo-performance, seo-visual, **seo-geo** (AI-citation), seo-local, seo-maps, seo-backlinks (confidence-weighted), seo-dataforseo, seo-image-gen, seo-cluster (SERP-overlap), seo-sxo (page-type mismatch), seo-drift ("git for SEO"), seo-ecommerce, seo-google (GSC/PSI/CrUX/GA4), seo-flow.

**Highest-value scripts (ranked):** `content_verify` · `gsc_query` (quick-win) · `content_quality` · `lcp_subparts` · `drift_baseline`+`drift_compare` · `schema_ecommerce_validate` · `url_safety` · `indexnow_submit` · `content_humanize` · `dataforseo_normalize` · `parasite_risk` · `schema_generate`.

**MCP extensions:** DataForSEO (+ AI_OPTIMIZATION), Ahrefs, Profound (citation time-series), SE Ranking (AI SoV), Bing Webmaster, Firecrawl, Unlighthouse, Banana (image gen).

## Appendix B — Sentinel current state (reference)

**Strong:** SEO (GSC OAuth, DataForSEO, audits/PSI/Lighthouse, content decay) and **GEO** (`runCitationTracking` ChatGPT/Claude/Gemini/Perplexity, `buildLlmsTxt`, `buildAiRobots`, entity signals, FAQPage via `schema-gen.js`). 15 editable prompt keys; per-site `geo_context` niche prepend; proposal→mu-plugin live writes; n8n/Airtable Article Writer.

**Schema today (`schema-gen.js`):** WebPage, BreadcrumbList, Organization, LegalService, Person, Article, FAQPage. *(No HowTo/Speakable/VideoObject/Product.)*

**Gap:** the AEO middle layer (answer-first blocks, 4 snippet formats, HowTo/Speakable/Video schema, question research, positions-2-10 snippet-steal, measurement loop) + content quality/verify/humanize + drift.

---

*Source repo cloned for analysis: `AgriciDaniel/claude-seo` (MIT). AEO doc per user-provided Google Doc. This plan favors reusing Sentinel's existing primitives (prompt registry, research layer, proposal queue, schema `@graph`, n8n/Airtable) over parallel systems.*
