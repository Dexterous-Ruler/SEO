# Setup & Go-Live Guide

Everything below is the one-time setup to point the agent at your real WordPress site.
The code is complete and verified; these are the steps only you can do (they need your
credentials and server access).

---

## 1. Install the companion mu-plugin (one-time, on the server)

Copy [wp-plugin/seo-agent-injector.php](wp-plugin/seo-agent-injector.php) to your site's
`wp-content/mu-plugins/` folder (create the `mu-plugins` folder if it doesn't exist).

This is a **must-use plugin** — it auto-activates, can't be disabled by accident, and
survives theme switches. It's what lets the agent write metadata, schema, and `/llms.txt`
over the REST API without any third-party SEO plugin.

> After copying, visit **Settings → Permalinks** in wp-admin once and click Save — this
> flushes rewrite rules so `/llms.txt` resolves.

## 2. Create a WordPress Application Password

In wp-admin: **Users → Profile → Application Passwords** → name it `seo-agent` → Add.
Copy the generated password (looks like `xxxx xxxx xxxx xxxx xxxx xxxx`).

Use an account with at least Editor (ideally Administrator for media uploads + settings).

## 3. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:
```
WP_BASE_URL=https://your-site.com
WP_USERNAME=your-admin-username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
WP_STAGING_URL=          # optional but recommended
DRY_RUN=true             # keep ON until you've reviewed proposals
```

## 4. Configure key pages

Edit [config/sites.json](config/sites.json) — list the pages you want driven to 100/100,
fill in `ai.organization` (name, url, logo, social links) and `ai.siteSummary` so the
generated `llms.txt` and Organization schema are accurate. Add any locked brand
colors/fonts under `brandConstraints` so the agent flags rather than changes them.

---

## 5. Run it

```bash
node src/cli.js wp:check        # confirm connectivity & auth
node src/cli.js run             # full pipeline → proposals + approval worksheet
```

Open `reports/SUMMARY.md` (scores), `reports/APPROVAL.md` (proposed changes), and the
per-phase `reports/*.proposals.json`.

## 6. Approve & apply

```bash
# Review reports/APPROVAL.md, then either approve everything…
node src/cli.js approve --all
# …or edit reports/approved.json and set "approved": true per item.

# Apply. With DRY_RUN=true this only simulates. Flip to false in .env to write.
node src/cli.js apply
node src/cli.js swap            # rewrite <img> refs to the uploaded WebP (after a real apply)
```

## 7. Re-verify

```bash
node src/cli.js reverify        # re-runs Lighthouse, diffs vs. the locked baseline
```

Open `reports/REVERIFY.md` for the before/after table.

---

## Going to production safely

1. Keep `DRY_RUN=true` for the first full run; read every proposal.
2. If you have staging, set `WP_STAGING_URL` and apply there first.
3. Approve granularly (per item) rather than `--all` for the first real apply.
4. `apply` with `DRY_RUN=false`, then `reverify`, then promote staging → production.
5. Performance & accessibility fixes are reported as **manual** — apply those via your
   child theme / CSS using the `modern-css` and `accessibility` skills as the guide.

## Rollback

- Metadata/schema live in post meta + options — clear them to revert.
- Original images are untouched in the media library; `swap` only rewrites references,
  and the originals remain for rollback.
