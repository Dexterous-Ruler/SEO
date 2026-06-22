# Experience Monitor + UX Activation — operator runbook

How to take a site from connected → collecting UX-defect data, safely and lawfully. The
**UX Activation** screen (Find & Fix Issues → UX Activation) drives most of this; the only
non-UI steps are a compliance sign-off (a DB flag) and publishing your privacy text.

## The model in one line
**Detect** each site's consent stack → **wire consent** (its CMP, or our first-party banner) →
**self-test** → **sign off** → **arm at 5%** → **CWV A/B** → widen. Everything stays **inert**
until a site is both consented *and* armed, and arming is hard-gated on `rum_signed_off`.

## Per-site go-live

**0. mu-plugin ≥ v1.11.0.** UX Activation shows each site's version. If it shows "· update",
click **Update mu-plugin → vX** (self-update; auto-rolls-back if unhealthy). *First* jump to
1.11.0 must be a manual file copy into `wp-content/mu-plugins/` (the self-update route ships in
1.11.0); after that, updates push from the panel.

**1. Consent source.**
- **CMP detected** (e.g. Complianz) → the beacon is auto-wired to its cookie (e.g.
  `cmplz_statistics=allow`). Nothing to do.
- **No CMP** → click **Enable consent banner** (our first-party banner; sets `seoagent_consent`).
  ⚠️ The first-party banner gates **our beacon only** — it does **not** block other trackers. If
  the site runs **Hotjar/GA/Pixel**, install a full CMP (like Complianz) or remove the tracker;
  otherwise that tracker stays unconsented.

**2. Compliance (once per site).**
- Fill + sign the **DPIA-lite** (`compliance/<domain>-DPIA.md` — goodfor's is pre-filled).
- Publish the **privacy paragraph** (`compliance/<domain>-privacy-notice.md`) on the privacy page,
  and the Statistics-category line in the CMP.
- **Verify opt-out**: in a fresh browser, no beacon call before accepting; withdrawing consent
  stops it; GPC/DNT → silent. (Run **Self-test** in the panel for the server-side checks.)

**3. Sign off** (the gate). Once 1–2 are genuinely done, in the Supabase SQL editor:
```sql
update sites set rum_signed_off = true where id = '<site-id>';
```

**4. Arm.** UX Activation → **Arm at 5%** (auto-passes the detected consent cookie). The panel's
**Arm** button is disabled until `rum_signed_off=true` + a consent source exists.

**5. CWV A/B (2 weeks).** Watch INP/LCP on the canary; the Phase-2 observers must not regress
them. Clean → raise sampling / roll to the next site. Regression → disarm (one toggle) + tune.

## Gates (what blocks what)
- `RUM_ENABLED` (server env) — master switch. Currently **ON**.
- `sites.rum_signed_off=true` — per-site compliance gate. `/arm-beacon` refuses without it.
- `sites.rum_armed=true` + mu-plugin flag — set by Arm; the actual on/off.
- Visitor consent cookie — the beacon self-gates per page-view.

## Kill switch / rollback
- Per site: **Disarm** (panel) or `sites.rum_armed=false` → collection stops, raw rows purged.
- Global: unset `RUM_ENABLED` → entire subsystem inert in one env change.
- Bad mu-plugin update: `/self-update` auto-rolls-back on a failed health-check.

## Fleet snapshot (2026-06-21)

| Site | mu | Consent | Trackers | Next step |
|---|---|---|---|---|
| **goodfor.app** | 1.11.0 | Complianz (`cmplz_statistics`) ✓, Hotjar gated | — | DPIA sign → `rum_signed_off` → Arm |
| go-visa.co.uk | 1.11.0 | none | — | Enable banner → sign → Arm |
| settlement-agreement-lawyers.co.uk | 1.11.0 | none | — | Enable banner → sign → Arm |
| go-legal.co.uk | 1.11.0 | none | — | Enable banner → sign → Arm |
| fast-ila.co.uk | 1.11.0 | none | **Hotjar** | Install CMP (for Hotjar) **or** banner + accept Hotjar gap → sign → Arm |
| **Go Legal AI** (go-legal.ai) | **1.9.0 ⚠** | none | **Hotjar** | **Update mu-plugin first** → then as fast-ila |

## Still operator-only (cannot be automated)
- First manual copy of mu-plugin v1.11.0 to a site (done on 5/6; Go Legal AI pending).
- Migration `007_geo_context.sql` (one line) — enables saving per-site AI context.
- DPIA signature + `rum_signed_off` (a deliberate compliance decision).
- Rotating the Supabase + Koyeb tokens (flagged).
- Cloudflare edge Worker deploy (Phase 3 — only if `/status` shows event-loop lag; your CF account).
