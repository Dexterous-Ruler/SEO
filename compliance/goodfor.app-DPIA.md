# Experience Monitor — DPIA-lite (goodfor.app)

> **DRAFT for operator review + signature.** Technical facts are pre-filled from the live
> implementation (verified). Complete the **Operator / Date / signature** fields and confirm
> §1 and §6 reflect your intent before arming. UK basis: **PECR** (device access) + **UK GDPR**
> (personal data) + **ICO storage-and-access guidance**. Posture: **cookie-consent gated** — the
> beacon fires **only after the visitor accepts the analytics/Statistics consent category**.
>
> **Inert-by-default:** stays inert until **BOTH** consent is granted **AND** the site is armed
> (`RUM_ENABLED` + `sites.rum_armed=true` + mu-plugin `seoagent_ux_beacon` ON + `sites.rum_signed_off=true`).

---

**Site:** GoodFor   **Domain:** goodfor.app
**Operator:** `____________________`   **Date:** `__________`   **DPIA version:** v1

**Implementation status (verified 2026-06-21):** CMP = **Complianz** (UK/PECR). The beacon's
consent gate keys on **`cmplz_statistics=allow`** (set when the visitor accepts the Statistics
category; `deny` otherwise — verified live). **Hotjar** is blocked before consent via a Complianz
Script-Center rule (category: Statistics — verified: script neutralised, no `_hj*` cookies pre-consent).
GPC/DNT respected at both the CMP and the beacon. Beacon **not yet armed** (`rum_armed=false`).

---

## 1. Purpose & lawful basis

- **Purpose:** detect aggregate UX/conversion defects (broken CTAs/links, JS errors, AJAX 4xx,
  broken images, form-validation friction, dead/rage clicks, slow interactions) on goodfor.app's
  own pages, to prioritise fixes. First-party only; **no cross-site tracking, advertising,
  profiling, or data reuse.**
- **PECR basis (device access):** **consent**, via Complianz. Nothing is stored/read on the
  device until the visitor accepts the Statistics category (`cmplz_statistics=allow`).
- **UK GDPR basis (personal data):** **consent** (Art. 6(1)(a)), aligned to the same Statistics
  category. By design no PII is collected (§2); consent covers any residual/edge-case personal
  data (e.g. a salted IP-derived hash).
- **DUAA 2025 first-party-statistics exception:** noted as **upside only** — not relied upon.

## 2. Data categories collected

Aggregate UX defect events only. Each event may contain:

- **Event type** (e.g. `broken_cta`, `js_error`, `ajax_4xx`, `form_validation`, `dead_click`, `inp_slow`).
- **Page PATH only** — query string + fragment stripped at source.
- **Scrubbed selector + coarse role** — never element text / `innerHTML`.
- **Scrubbed message** — ≤200 chars, PII regex sweep (email / phone / card / NI / UK-postcode → `[redacted]`).
- **Form field name/id + type + validity** — **NO field values**; sensitive types
  (`password`/`email`/`tel`/`number`/`[data-sensitive]`) redacted to `[sensitive]`.
- **Salted, /24-truncated `ip_hash`** — daily salt; never stored raw, never a join key.
- **Ephemeral per-page-view id** — random, in-memory, click-sessionising only; never persisted/cross-visit/cross-site.

**Explicitly NOT collected (code-reviewed invariants):** no PII; no replay/session recording;
no DOM snapshots; no keystrokes/mouse paths; no field values; no persistent or cross-visit
identity; no raw IP; no cookies beyond the consent signal itself.

## 3. Retention

- **Raw `ux_events`:** auto-purged at **≤72h**, with a hard writer-enforced ring cap (primary
  guard) + scheduled prune (backstop).
- **Aggregates (`ux_defects`):** carry **no per-event PII**; retained for trend/anomaly analysis.
- **On opt-out / disarm:** all raw rows for goodfor.app are **purged**.

## 4. Data subjects

Visitors to goodfor.app who have **accepted the Statistics consent category**. GoodFor is a UK
consumer app/site for scanning food & skincare products (ingredients, allergens, safety scores);
audience is the general adult public. **No special-category data and no children's data** are
targeted or collected.

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **PII leakage** (token in URL, "name" field, email in an error) | Med | Scrub **at source in the browser** (path-only, value-free, redaction sweep) **AND** ingest-side reject-on-suspicious-key guard. |
| **Cross-tenant contamination** | Low | Every INSERT/read appends `site_id=eq.<id>`; RLS as defence-in-depth. |
| **CWV regression** (beacon slows INP/LCP) | Low | Passive observers; beacon self-measures + self-disables over its long-task budget; **canary A/B (ON vs OFF)** required before fleet rollout. |
| **Consent not honoured / fires before consent** | Low | Inert until `cmplz_statistics=allow` AND armed; GPC/DNT honoured; **Hotjar also gated** via Complianz; purge on opt-out. |
| **Over-retention** | Low | ≤72h purge + hard ring cap; aggregates PII-free. |

## 6. Opt-out mechanism

- Visitor **withdraws the Statistics category** in the Complianz banner → `cmplz_statistics=deny`
  → beacon (and Hotjar) stop. GPC and DNT are also honoured as opt-out signals.
- Per-site kill switch (`sites.rum_armed=false` / mu-plugin flag OFF) stops collection site-wide;
  global `RUM_ENABLED` unset disables the whole subsystem.
- On any opt-out or disarm, **raw rows for goodfor.app are purged**.

## 7. Sign-off

By signing, the operator confirms this DPIA-lite is complete and accurate for goodfor.app, the
privacy notice is published, and the Statistics consent category is correctly wired.

**Site:** goodfor.app   **Date:** `__________`
**Operator (sign):** `____________________`

> Sign-off is a **precondition** to arming: set `sites.rum_signed_off=true` only after this is
> signed, the privacy paragraph is published, and opt-out is verified.
