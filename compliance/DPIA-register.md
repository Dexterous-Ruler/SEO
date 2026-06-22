# Experience Monitor — DPIA register (all sites)

> Per-site DPIA-lite sign-off, recorded **at the operator's written instruction** (Karim, this
> session). The assessment below is **identical for every site** (same first-party, no-PII,
> ≤72h-retention design); only the consent source, trackers and audience differ — captured in
> the per-site table. The full long-form assessment is in `compliance/goodfor.app-DPIA.md` and
> `EXPERIENCE-MONITOR-DPIA.md`. UK basis: PECR + UK GDPR + ICO storage-and-access guidance.
>
> **The signature attests the operator has reviewed and accepts this assessment.** The
> *operational* pre-arming gates (publish the privacy notice · enable/verify consent · verify
> opt-out · then set `sites.rum_signed_off=true`) remain per the **Pre-arming status** column —
> the signature does not assert those are done where they aren't.

## Shared assessment (applies to every site)

- **Purpose:** detect aggregate UX/conversion defects (broken CTAs/links, JS errors, AJAX 4xx,
  broken images, form-validation friction, dead/rage clicks, slow interactions) on the site's own
  pages, to prioritise fixes. First-party only — **no cross-site tracking, advertising, profiling or reuse.**
- **Lawful basis:** consent (PECR for device access; UK GDPR Art. 6(1)(a) for any personal data),
  tied to the analytics/Statistics consent category. DUAA-2025 first-party-statistics exception = upside only.
- **Data collected:** event type · page **path only** · scrubbed selector · truncated+redacted message ·
  form field name/type/validity (**never values**; sensitive types redacted) · salted /24-truncated
  `ip_hash` · ephemeral in-memory page-view id. **No PII, no replay, no field values, no raw IP, no persistent/cross-site id.**
- **Retention:** raw `ux_events` ≤72h (hard ring cap + scheduled prune); aggregates PII-free; **purge on opt-out/disarm.**
- **Opt-out:** withdraw the consent category → collection (and gated trackers) stop; GPC/DNT honoured; per-site + global kill switches.
- **Residual risk:** **low** — first-party, aggregate, well-mitigated. No special-category or children's data targeted.
  YMYL sites (legal/immigration/visa) noted: a quick DPO/solicitor glance is sensible though the assessment itself is low-risk.

## Per-site sign-off

| Site | Domain | Consent source | Trackers (gated) | Data subjects | Operator (sign) | Date | Pre-arming status |
|---|---|---|---|---|---|---|---|
| GoodFor | goodfor.app | **Complianz** (`cmplz_statistics=allow`) | Hotjar — gated via Complianz | UK consumers (food/skincare scanner) | **Karim** | 21 Jun 2026 | Consent wired ✓ · publish notice + verify opt-out → `rum_signed_off` → Arm |
| go-visa.co.uk | go-visa.co.uk | First-party banner (`seoagent_consent`) | none | UK visa/immigration enquirers (YMYL) | **Karim** | 21 Jun 2026 | Enable banner + publish notice + verify opt-out → `rum_signed_off` → Arm |
| Settlement Agreement Lawyers | settlement-agreement-lawyers.co.uk | First-party banner | none | UK employment-law enquirers (YMYL) | **Karim** | 21 Jun 2026 | Enable banner + publish notice + verify opt-out → `rum_signed_off` → Arm |
| go-legal.co.uk | go-legal.co.uk | First-party banner | none | UK legal-services enquirers (YMYL) | **Karim** | 21 Jun 2026 | Enable banner + publish notice + verify opt-out → `rum_signed_off` → Arm |
| fast-ila.co.uk | fast-ila.co.uk | First-party banner | Hotjar — gated via mu v1.12.0 tracker-block | UK immigration-law enquirers (YMYL) | **Karim** | 21 Jun 2026 | Enable banner (also blocks Hotjar) + publish notice + verify opt-out → `rum_signed_off` → Arm |
| Go Legal AI | go-legal.ai | First-party banner | Hotjar — gated via mu v1.12.0 tracker-block | UK legal-services enquirers (YMYL) | **Karim** | 21 Jun 2026 | Enable banner (also blocks Hotjar) + publish notice + verify opt-out → `rum_signed_off` → Arm |

**Signatory:** Karim (operator / data controller) — recorded 21 Jun 2026 at the operator's instruction.
