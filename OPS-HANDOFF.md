# Sentinel — Ops handoff (things only Karim can do)

_Generated 2026-07-23 after the whole-system fix pass. Everything below needs your access/credentials/decision — no agent can do them._

## 🔴 Security (do these first)

1. **Set `SENTINEL_DASHBOARD_KEY` in Koyeb** (env var) and redeploy.
   Until it's set, the auth gate is inert and every POST route answers anonymous
   callers on the public URL. The code + dashboard already implement the header and a
   one-time prompt — this is purely an env var.

2. **The GitHub repo is public and ships the Supabase anon key**, which can read the
   world-readable `sites` table (WP admin usernames, `rum_key`s, GSC property, full
   `geo_context`). Fix:
   - Enable RLS deny-all / revoke anon `SELECT` on `sites`, `audits`,
     `content_opportunities`.
   - Rotate the Supabase anon key and every site's `rum_key`.
   - Consider making the repo private, or rotating the exposed WP admin usernames.
   (`app_secrets` / `private_secrets` correctly refuse anon — the secret stores are safe.)

3. **Rotate the keys pasted in chat** — the n8n API key and the Firecrawl key
   (`fc-…`). Do this *after* #1, or the replacements are exposed the same way. The
   Supabase management token pasted earlier is already dead.

## 🟡 Pipeline automations (per-site, in Airtable/n8n)

4. **Add the Airtable Status-flip automation** for the writers that have never fired:
   Go Visa, all Go Legal AI writers, and all GoodFor writers. The n8n writer only runs
   when a script calls its webhook with `?recordID=…`; today only Fast ILA, Go Legal and
   SAL have that automation. Without it, records are created but nothing picks them up —
   which is why those writers look like they've "never run".

5. **Decide on the n8n post-node publish status.** The "Wordpress make post" node has no
   `status` param, so it creates **drafts**. Sentinel no longer *reports* those drafts as
   "published" (fixed), but if you want articles to go live automatically, set
   `status: publish` on that node in each writer. Left as-is on purpose — it may be
   intentional "draft for review".

6. **Trash the leftover live junk** the read-only pass found:
   - WP draft **post 40917** on settlement (created with a raw `{{ }}` token as its H1 —
     from the n8n bug now fixed).
   - GoodFor's six **"Test Heading 1–6"** placeholder recipes (indexed + in sitemap).
   - Go Legal AI's placeholder posts `/legal-pathway-post-1/`, `/how-to-guide/`.
   - Any `/test/` pages sitting in sitemaps.
   - Restore real content to settlement's blank SRA-required pages
     (`/privacy-cookies/`, `/terms-of-business/`, `/legal-regulatory/`).

## 🟠 robots.txt (per-site — each is owned by a physical file or another plugin, so the mu-plugin can't override it safely)

Verified live 2026-07-23:
- **fast-ila.co.uk** — after the Yoast block there's a second block (physical file or a
  robots plugin) with `Disallow: /wp-content/themes/` and `/wp-content/plugins/`. Those
  **block render-critical CSS/JS from Googlebot** — remove both lines (Google needs them
  to render the page). `Disallow: /*?` and `/*.html` are also over-broad.
- **go-legal.ai** — same render-critical block **plus** `Disallow: /wp-includes/`. Remove
  the `/wp-content/themes/`, `/wp-content/plugins/`, `/wp-includes/` lines.
- **go-visa.co.uk** — served by the **Virtual Robots.txt (pc-robotstxt) plugin** and still
  lists **stale Drupal paths** (`/lib/`, `/core/views/`, `/core/modules/`, `/storage/`)
  that don't exist on a WordPress site. Edit the plugin's option (Settings → Virtual
  Robots.txt) to a clean WordPress ruleset + your sitemap URL. Also note `Disallow:
  /writer/` there.
- None of the three carry a managed AI-crawler block or (except fast-ila) a Sitemap line.

Because these are physical/plugin-owned, they must be edited at the source — I deliberately
did not force a mu-plugin override that would conflict with the pc-robotstxt plugin.

## 🟢 SEO decisions

7. **go-visa.co.uk `noindex`es 10 of its 13 substantive pages** (Rank Math's CPT default
   on `/client-story/` + `/expertise/`). Almost certainly unintended on a small site —
   flip them to `index` and add to the sitemap, or confirm it's deliberate.

8. **go-visa content is ~910 days stale** and **goodfor's `geo_context` is only 356
   chars** (too thin to steer AI generation well). Worth refreshing when you can.

---

### Done on the code side since this file was written
- **A6** empty-content detector — audits now flag indexable blank/placeholder pages
  ("Test Heading 1", thin bodies) for noindex/fill. ✅ shipped
- **C1** staging label — proposals + the apply modal now honestly show "Production" and
  the production warning (no site has a `staging_url`). ✅ shipped
- **B4 (partial)** — the n8n Run button no longer claims "triggered ✓" for a writer flow
  run without a record; the coverage legend now says "active" (≠ has produced an article)
  rather than "covered". ✅ shipped

### Still needs YOU / a decision
- **robots.txt** — see the 🟠 section above (per-site file/plugin edits).
- **B2 auto-content-pilot** — `auto_content_pilot` is off on all 6 sites, and nothing
  flips the Airtable Status to "Write Article", so the content loop needs two manual
  steps. Turning on true auto-drafting means articles get generated (and, if you also do
  #5, published) with no human gate — that's your call, so I left it off. Tell me if you
  want a one-click "approve & write" button instead.
- **n8n "Add internal links" node** — constrain it to the site's sitemap so article
  bodies stop inventing links (the Sentinel-side suggester is already fixed).
- **n8n coverage = execution history** — the panel could show "last run 3d ago / never
  run" per writer instead of just active/inactive; needs an executions fetch per
  workflow. Say the word and I'll add it.
