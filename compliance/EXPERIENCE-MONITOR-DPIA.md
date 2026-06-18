# Experience Monitor — DPIA-lite (per-site template)

> One-page Data Protection Impact Assessment, completed **once per site** before the
> beacon is armed. UK-focused: **PECR** (storing/reading the device) + **UK GDPR**
> (any personal data) + **ICO storage-and-access guidance** (final, 29 Apr 2026).
> Compliance posture: **cookie-consent gated** — the beacon fires **only after the
> visitor accepts the analytics/consent category**. The DUAA 2025 first-party
> statistical-analytics exception is treated as **upside only**; this assessment is
> designed to the strictest reading and does not rely on the exception.
>
> **Inert-by-default:** the beacon stays completely inert until **BOTH** the visitor
> has granted consent **AND** the site is armed (`RUM_ENABLED` set + `sites.rum_armed=true`
> + mu-plugin `seoagent_ux_beacon` ON + `sites.rum_signed_off=true`). With any one
> unset, **nothing loads and nothing is collected.**

---

**Site:** `____________________`  **Domain:** `____________________`
**Operator:** `____________________`  **Date:** `__________`  **DPIA version:** `v1`

---

## 1. Purpose & lawful basis

- **Purpose:** detect aggregate UX/conversion defects (broken CTAs/links, JS errors,
  form-validation friction, broken images, slow resources) on this site's own pages,
  to prioritise fixes. First-party only; **no cross-site tracking, no advertising,
  no profiling, no reuse.**
- **PECR basis (device access):** **consent.** The beacon stores/reads nothing on the
  device by default and only runs after the visitor accepts the analytics/consent
  category in the site's consent banner.
- **UK GDPR basis (any personal data):** **consent** (Art. 6(1)(a)), aligned to the
  same analytics consent category. By design no PII is collected (see §2); consent is
  the basis for any residual/edge-case personal data (e.g. a salted IP-derived hash).
- **DUAA 2025 exception:** noted as **upside only** — not relied upon. If the
  first-party-statistics exemption later applies, it reduces obligations; it never
  expands what is collected.

## 2. Data categories collected

Aggregate UX defect events only. Each event may contain:

- **Event type** (e.g. `broken_cta`, `js_error`, `ajax_4xx`, `form_invalid`).
- **Page PATH only** — query string and fragment stripped at source.
- **Scrubbed selector + coarse role** — never element text / `innerHTML`.
- **Scrubbed error message** — truncated ≤200 chars, PII regex sweep
  (email / phone / card / NI / UK-postcode → `[redacted]`).
- **Form field name/id + type + validity** — **NO field values**; sensitive types
  (`password`/`email`/`tel`/`number`/`[data-sensitive]`) have the name redacted to `[sensitive]`.
- **Salted, /24-truncated `ip_hash`** — daily salt; never stored raw, never a join key.
- **Ephemeral per-page-view id** — random, in-memory, for click sessionising only;
  never persisted, never cross-visit, never cross-site.

**Explicitly NOT collected (hard, code-reviewed invariants):** no PII; no replay/session
recording; no DOM snapshots; no keystrokes or mouse paths; no field values; no persistent
or cross-visit identity; no raw IP; no cookies beyond the consent signal itself.

## 3. Retention

- **Raw `ux_events`:** auto-purged at **≤72h** (default 72h), with a **hard
  writer-enforced ring cap** as the primary guard; the scheduled prune is a backstop.
- **Aggregates (`ux_defects`):** carry **no per-event PII** and are retained for
  trend/anomaly analysis.
- **On opt-out / disarm:** all raw rows for the site are **purged**.

## 4. Data subjects

Visitors to this site who have **accepted the analytics consent category**. Expected
to be UK-based; no special-category data and no children's data are targeted or collected.

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **PII leakage** (token in URL, "name" field, email in an error) | Med | Scrub **at source in the browser** (path-only, value-free, redaction sweep) **AND** ingest-side reject-on-suspicious-key guard (defence-in-depth). |
| **Cross-tenant contamination** | Low | Every INSERT/read appends `site_id=eq.<id>`; RLS policies added as defence-in-depth (service role bypasses RLS, so the filter is the primary control). |
| **CWV regression** (beacon slows INP/LCP we sell) | Low | Passive `PerformanceObserver` preferred; beacon self-measures its long-task budget and self-disables over budget; **canary A/B (ON vs OFF)** required before fleet rollout. |
| **Consent not honoured / fires before consent** | Low | Beacon inert until consent granted AND site armed; opt-out honoured incl. GPC/DNT; purge on opt-out. |
| **Over-retention** | Low | ≤72h purge + hard ring cap; aggregates are PII-free. |

## 6. Opt-out mechanism

- Visitor **withdraws the analytics consent category** → beacon stops; GPC and DNT
  are also honoured as opt-out signals.
- A **working visitor opt-out** is shipped (not GPC/DNT honouring alone).
- Per-site kill switch (`sites.rum_armed=false` / mu-plugin flag OFF) stops collection site-wide.
- On any opt-out or disarm, **raw rows for the site are purged**.

## 7. Sign-off

By signing, the operator confirms this DPIA-lite is complete and accurate for this site,
the privacy notice is published, and the consent category is correctly wired.

**Site:** `____________________`  **Date:** `__________`
**Operator (sign):** `____________________`

> Sign-off is a **precondition** to arming. The ingest endpoint treats
> `sites.rum_signed_off=true` as a checked gate, not a UI nicety. `rum_armed` defaults **OFF**.
