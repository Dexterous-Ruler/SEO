# Experience Monitor — per-site go-live sign-off checklist

> Complete **every** item before arming a site. The beacon stays **INERT until BOTH
> consent is granted AND the site is armed.** Arming requires all three flags set
> (`RUM_ENABLED` env + `sites.rum_armed=true` + mu-plugin `seoagent_ux_beacon` ON) **and**
> `sites.rum_signed_off=true`. UK basis: PECR + UK GDPR + ICO storage-and-access guidance;
> DUAA exception is upside only.

---

**Site:** `____________________`  **Domain:** `____________________`
**Operator:** `____________________`  **Target go-live date:** `__________`

## Pre-arming gates

- [ ] **DPIA-lite completed** — `EXPERIENCE-MONITOR-DPIA.md` filled in and signed for this site.
- [ ] **Privacy notice published** — policy paragraph live on the site's privacy page;
      banner line added to the analytics consent category.
- [ ] **Consent category wired** — beacon fires **only** after the visitor accepts the
      analytics/consent category; confirmed no beacon network call before acceptance.
- [ ] **Opt-out verified honoured** — withdrawing consent stops collection; GPC and DNT
      honoured; raw rows for the site purged on opt-out/disarm.
- [ ] **Canary CWV A/B passed** — beacon A/B'd ON vs OFF on a canary page; **no INP or
      LCP regression** in real-user measurement.
- [ ] **Tenant isolation confirmed** — `site_id` filter present on every INSERT/read;
      RLS policy in place as defence-in-depth.
- [ ] **Retention confirmed** — ≤72h raw purge + hard ring cap active.

## Arming step (only after every box above is ticked)

- [ ] **Operator written sign-off** — sign below; this sets `sites.rum_signed_off=true`.
- [ ] Set `sites.rum_armed=true` and turn the mu-plugin `seoagent_ux_beacon` flag ON.
- [ ] Confirm `RUM_ENABLED` is set globally (otherwise the subsystem remains inert).

> The ingest endpoint treats `rum_signed_off=true` as a checked precondition.
> Arming before sign-off is blocked by design.

## Sign-off

**I confirm all pre-arming gates above are complete and accurate for this site.**

**Site:** `____________________`  **Date:** `__________`
**Operator (sign):** `____________________`

## Rollback / kill

- Per-site: set `sites.rum_armed=false` / mu-plugin flag OFF → collection stops, raw rows purged.
- Global: unset `RUM_ENABLED` → entire subsystem inert in one env change.
