# Sentinel Console — Frontend ↔ Backend Integration

The warm-cream "Sentinel" UI (from the design handoff) wired to the live
wp-seo-agent engine + Supabase. **The frontend design is untouched** — integration
happens entirely through the data layer and action handlers.

## Run it

```bash
# 1. set PSI_KEY + .env (already configured)
# 2. one command starts engine (8787) + console (5173)
node start-console.js
# open http://localhost:5173
```

Or run the two servers separately:
```bash
node backend-api/server.js          # engine API on :8787
node backend-api/static-server.js   # web console on :5173
```

## Architecture (how it connects without changing the design)

```
  web/ (the design — UNCHANGED visuals)
   │  index.html → loads:
   │    config.jsx   ← Supabase URL + anon key + engine URL
   │    api.jsx      ← window.SentinelAPI (Supabase REST + engine calls)
   │    data.jsx     ← mock arrays (fallback) + LIVE hydration → window.SITES…
   │    soft-*.jsx   ← the design components (read window globals + ctx actions)
   │
   ├──→ Supabase  (kzzhshxwusamqgqxervb)
   │      tables: sites, audits, proposals, activity, user_settings
   │      RLS + pgcrypto-encrypted app passwords
   │
   └──→ Engine API (backend-api/server.js, :8787)
          wraps the existing Node engine:
          /connect /detect /crawl /psi /psi-detail /seo-read
          /rankmath-head /prioritize /apply-meta /rollback-meta
```

### The integration seams (no visual edits)
1. **`data.jsx`** — keeps the mock arrays as instant-render fallback, then
   asynchronously loads live Supabase data, maps it into the **exact same shapes**
   the components expect, and re-mounts via `window.__sentinelRerender()`.
2. **`App()` actions in `soft-dashboard.jsx`** — each action (`runAudit`,
   `finishAddSite`, `commitApplied`, `rollback`, `approveProposal`…) now calls
   `window.SentinelAPI` when live, and falls back to the original mock behavior
   when the backend is unreachable. **All JSX/styles are byte-for-byte the design.**
3. **`config.jsx` / `api.jsx`** — new non-visual files loaded before the design.

If the engine or Supabase is down, the UI renders the original mock design — it
never breaks.

## What's wired live
| UI action | Backend |
|---|---|
| Connect a site (modal) | `/connect` + `/detect` → real stack detection → Supabase `sites` |
| Site switcher / Sites screen | Supabase `sites` (live rows) |
| Run audit | `/audit-full` → real PSI (4 categories) + SEO read → **findings + proposals** → persisted to `audits`, `proposals`, `activity` |
| Audits / findings | `window.FINDINGS` populated from the live audit |
| Review Queue | Supabase `proposals` (live rows, badge count) |
| Approve / reject / bulk | Supabase `proposals` status (persisted) |
| Propose fix (per finding) | `/propose-fix` → known recipe or generic → Supabase `proposals` |
| Apply (commit) | `/apply-meta` verify-after-write (DRY_RUN via kill switch) |
| Rollback | `/rollback-meta` restores old value |
| Activity feed | Supabase `activity` (audit trail) |
| Kill switch | forces dry-run on all writes |

### The audit → proposals pipeline (`backend-api/audit-pipeline.js`)
A real audit of a page produces:
- **Scores** — all four Lighthouse categories (live PSI).
- **Findings** — failing PSI audits + SEO-read issues, categorized by discipline
  (performance / accessibility / image / seo), with impact + gap points.
- **Proposals** — only for issues with a *known fix recipe*: REST metadata writes
  (Rank Math keys) or the child-theme CSS/JS/PHP patches shipped in
  `deploy/child-theme/`. Each is a draft the human approves before any write.

Verified end-to-end on go-legal.ai: one "Run audit" click → 25 findings → 8
proposals in Supabase → Review Queue renders them → bulk-approve persists.

### Apply safety — proven live
The write path was verified against a real post on go-legal.ai (then cleaned up):
- **dry-run** (kill switch on) → returns `dry-run`, no write.
- **real write** → `verified` (value read back and confirmed).
- **rollback** → `verified`, original value restored.

Notable: go-legal.ai accepts Rank Math meta writes via REST **even without** the
mu-plugin (Rank Math registers its own keys). The mu-plugin remains the guarantee
for sites where keys aren't registered — and verify-after-write catches any
silent failure either way, so a write is never falsely reported as succeeded.

## Multi-site & security model (generic — not tied to any one site)
- **Add any WordPress site** via URL + username + application password. `/site-connect`
  validates auth, auto-detects the stack, and stores the site. Switch between sites
  freely; everything is scoped to the active site id.
- **Secrets never touch the browser after connect.** The app password is encrypted
  (`pgp_sym_encrypt`) into a **separate `private_secrets` table** that has *zero*
  anon/authenticated access (verified: anon `select *` excludes it; direct read →
  permission denied). Only the server (service role) decrypts it, server-side, when
  an operation needs it. The browser references a site only by `id`.
- **Writes are doubly guarded:** a write requires the site to be **write-armed**
  (off by default) AND not in dry-run/kill-switch. A read-only site returns
  `status: blocked`. Verified live: go-legal.ai stays read-only, untouched.
- **verify-after-write**: every meta write is read back; silent failures surface.
- **Claude API** (key stored as a Supabase secret + local `.env`) generates the real
  fix content — meta descriptions, title rewrites, alt text — via `/generate-content`.

## Safety
- **DRY_RUN / kill switch**: when engaged, `apply-meta` only simulates — no writes.
- **Write-armed flag** per site: default off; nothing writes until explicitly armed.
- **verify-after-write**: every meta write is read back; failures surface, not hidden.
- **Encrypted secrets** in an isolated table; decrypted only server-side.

## Config / secrets to rotate
`web/config.jsx` holds the Supabase anon key (public by design). The Supabase
**access token**, the **WordPress app password**, and the **PSI key** shared in chat
should be rotated. Supabase project: `kzzhshxwusamqgqxervb`.

## Current state
A live **Go Legal AI** site is seeded in Supabase (real scores/scale/stack), so the
console opens straight onto real data. Verified in-browser: live hydration, Sites
screen stack detection, zero console errors.
