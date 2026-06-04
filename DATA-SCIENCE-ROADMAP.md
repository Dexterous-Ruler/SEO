# Data-Science & Analytics Roadmap

_A senior data-scientist / data-analyst review of the Sentinel WP-SEO platform — what to add or
change to move from a strong **data-collection + action** tool to a credible **analytics product**._
_(2026-06-03. Grounded in the actual backend code + 2026 SEO-analytics best practice.)_

---

## The core finding
The platform **collects rich snapshots but treats them as point estimates and does almost no
inference.** It captures data well; it barely analyzes it. Every measurement is a single noisy
draw reported as truth — so today's trend charts and "improved/regressed" deltas can be plotting
**noise as signal.** The fix is an **inference layer** (variance control, significance, trends,
anomalies, correlation, traffic-value) on top of the snapshots we already store, plus **Google
Search Console** as first-party ground truth.

---

## Tier 1 — Build now (credibility + the one missing data source)

### 1. Median-of-N PSI + store variance
**What:** Run PageSpeed 3–5× per URL/strategy; store median + IQR + run count, not a single score.
**Why:** A single Lighthouse run has ±5–10 pts of CPU/JIT noise. We currently chart single runs as
trends and fire "dropped 7 pts" off pure variance. Google's own guidance is median-of-5.
**How:** Loop `runPsiDetailed`, take median per CWV metric + category. Add `scores_n`, `scores_iqr`
to the `audits` table. Only flag a regression when `|Δmedian| > 1.5 × IQR`. ~½ day.
**Lead with CrUX field data** (already fetched) for trends — it's a 28-day p75 aggregate, far less noisy than lab.

### 2. Google Search Console integration ⭐ (#1 missing data source)
**What:** OAuth + Search Analytics API → clicks, impressions, CTR, avg position by query AND page, daily.
**Why:** Right now we infer SEO outcomes from PSI scores + rented SEMrush estimates. GSC is **free,
first-party ground truth.** It unlocks real CTR, query-level position tracking, content-decay
detection, and click anomaly alerts. Nothing else matters as much.
**How:** New `gsc_daily(site_id,date,query,page,clicks,impressions,ctr,position)`. Pull 16 months on
connect, then daily. The only Tier-1 item needing a new OAuth flow — worth it.
**Caveat:** GSC had an impression-inflation bug May 2025–Apr 2026; anchor decay/anomaly logic on **clicks**, not impressions, for pre-Apr-2026 baselines.

### 3. Position-history table + week-over-week movement
**What:** Stop storing SEMrush as opaque JSONB blobs. Normalize into
`keyword_positions(site_id,keyword,position,volume,cpc,url,captured_at)`.
**Why:** Rank movement (gained/lost/new/dropped + deltas) is the core SEO deliverable — and we
**currently can't produce it** because each snapshot overwrites context.
**How:** On each `/semrush-snapshot`, explode `topKeywords` into rows. Movement = self-join on the
two most-recent `captured_at`.

### 4. Traffic-value & estimated-traffic modeling 💰
**What:** est. traffic = volume × CTR-curve(position); traffic value = est. clicks × CPC. Per keyword + per site.
**Why:** Executives don't care about "position 7" — they care about "£X/mo at risk" and "this fix is
worth £Y." We have all inputs (volume, position, cpc already parsed) and throw the synthesis away.
This is the metric that justifies the platform to a budget-holder.
**How:** Ship a positional CTR curve, then **calibrate it per-site from the site's own GSC
CTR-by-position** (a genuine differentiator). Pure Postgres/JS.

### 5. Statistical-significance gate on all before/after deltas
**What:** Every "we improved X" claim passes a noise/significance test before display.
**Why:** Our apply→verify→delta loop reports raw differences off single-run data — the textbook way
to ship false "wins" and erode trust.
**How:** Scores → the IQR band from #1. Traffic/clicks → pre/post with a control window or EWMA on the
daily series. Label changes **"significant" vs "within noise."**

---

## Tier 2 — The analytical layer (once Tier 1 makes data trustworthy)

### 6. Anomaly detection on rankings & traffic
EWMA control chart / seasonal-decomposition residual + z-score on `gsc_daily.clicks`; flag `|z|>3`.
Catches a Google-update hit within days, not at the next monthly review. Feeds the `activity` feed + chatbot.

### 7. Correlation analysis: CWV/scores ↔ rankings
Spearman correlation across the page×time panel (we hold both PSI history + GSC). Answers "does
fixing performance actually move *my* rankings" empirically. Show as a correlation matrix. Label it
correlational, not causal (CWV is a weak, threshold-style factor).

### 8. GEO/AI-visibility with statistical rigor
Run each prompt N=3–5×; report share-of-voice **with a Wilson confidence interval**; track the SoV
**trend** over weeks. Fix the brand-detection (current regex over-matches — `"lawhive"` matches
`"outlawhiveminds"`); add a Claude "was the brand actually referenced?" pass to catch unlinked
mentions. Our headline feature is currently the *least* rigorous module — a "33% SoV" from 18
single-shot prompts is indistinguishable from 22% or 44%.

### 9. Content-decay detector (needs #2) — ✅ BUILT
Compares recent-28d vs prior-28d clicks per page from GSC; ranks by **absolute clicks lost**;
cross-refs WP `modified` date (flags stale >180d); generates a *substantive* Claude refresh brief
per page (fetches live page, proposes new sections/stats — not a date bump). In the Search Console
screen → "Content Decay" tab. Significance filter: priorClicks≥10 AND (pctDrop≥20% OR ≥25 clicks lost).

### 10. Striking-distance → page-1 *probability* (not just a list)
Today it lists pos-11–20 keywords by volume. Score each by **likelihood of reaching page 1** ×
**expected click gain.** Start with a transparent heuristic (volume × CTR-gain × inverse-difficulty),
upgrade to logistic regression on the site's own historical 11–20→1–10 transitions (from #3). This is
classic tabular ML — not a Claude job.

---

## Tier 3 — Reporting, segmentation, packaging

### 11. Visualization gaps a data analyst adds immediately
- **Executive scorecard** — one screen: traffic-value trend, SoV trend, top movers, anomalies, "£ at risk."
- **Distributions not averages** — histogram of positions; "avg position 14" hides a bimodal reality.
- **Position-bucket funnel** over time (1–3 / 4–10 / 11–20 / 21+) — cleanest single health picture.
- **Before/after waterfall** for applied fixes (significance-gated).
- **Correlation matrix** (#7) · **per-keyword position sparklines** in tables.

### 12. Cohort / segment analysis
Break every metric by page type / topic cluster / intent / device / **branded-vs-non-branded**.
"Traffic flat" but "non-branded commercial down 30%, branded up" is a totally different diagnosis.
We already derive clusters (Content Intel) + intent (GEO prompts) — wire them as segment dimensions.

### 13. Automated insight generation (a genuinely good Claude use)
Weekly Claude-written narrative over the **deterministically-computed** metrics: "SoV +6pts (CI ±4,
not yet significant); Page X lost 420 clicks/8wk; INP regressed on mobile and correlates with a
2-position drop on 4 commercial keywords." **Claude narrates the stats; it must never compute them.**

### 14. Impact × Effort prioritization model
Replace the current `impactFor()` heuristic (buckets on raw Lighthouse savings-ms — value-blind and
effort-blind) with **score = expected traffic-value gain ÷ effort/risk**, rendered as an ICE/RICE
impact×effort scatter. Turns "a list of findings" into a trustworthy ranked worklist.

---

## Currently statistically weak — be skeptical in demos
1. **Single-run PSI shown as a trend** (#1) — biggest credibility risk.
2. **GEO SoV from 1 sample × ~18 prompts** with a precise-looking % + over-matching brand regex (#8).
3. **`gapPts = round((1−score)×10)`** — an arbitrary unit users will misread as predicted score gain.
4. **SEMrush traffic = rented model, not ground truth** — label it; GSC wins conflicts.
5. **Title-only content analysis** — titles are a biased, sparse sample; cluster from body/H1–H3 instead.
6. **Mixed measurement context** — desktop/mobile, region (`db:'uk'` hardcoded) silently mix; segment them.

---

## Recommended build order
| Phase | Items | Why first |
|---|---|---|
| **P1 Credibility** | #1 median PSI · #5 significance gate | Makes every existing chart defensible; cheap |
| **P2 Ground truth** | #2 GSC · #3 position history · #4 traffic-value | Unlocks the analytical layer + exec value |
| **P3 Analysis** | #6 anomaly · #9 decay · #8 rigorous GEO | The "data team" features clients pay for |
| **P4 Intelligence** | #7 correlation · #10 striking-distance ML · #14 prioritization | Data → ranked action |
| **P5 Reporting** | #11 viz · #12 segments · #13 narratives | Packaging; high perceived value |

**Bottom line:** We've built an excellent *data pipeline + action engine*. To be a credible
*analytics* product we need (a) variance control so we stop charting noise, (b) **GSC** as ground
truth, and (c) the inference layer above. Items #1, #3, #4, #5, #14 are pure derivations from data
we already hold — days, not weeks. **GSC (#2) is the one new pipe and it 10×'s everything downstream.**
