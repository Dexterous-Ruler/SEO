# Deploying Sentinel to Koyeb

The whole app is **one service**: the Node server (`backend-api/server.js`) serves
both the web console (`web/`) and the API. It binds to `process.env.PORT` (Koyeb
injects this) and needs only `dotenv` at runtime — so the Docker image is tiny.

A `Dockerfile` is included; Koyeb auto-detects and builds it.

---

## 1. Put the code on GitHub (one-time)

```bash
git init && git add -A && git commit -m "Sentinel — deployable"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.env` is git-ignored — secrets are set in Koyeb (step 3), never committed.

## 2. Create the Koyeb service

Koyeb dashboard → **Create Service** → **GitHub** → pick the repo →
- **Builder:** Dockerfile (auto-detected)
- **Instance:** the smallest is plenty (the server is light)
- **Port:** `8000` (the Dockerfile/`ENV PORT` default; Koyeb maps it to 443/HTTPS)
- **Health check:** HTTP `GET /health`

*(CLI alternative: `npm i -g @koyeb/cli`, `koyeb login`, then
`koyeb deploy . sentinel --ports 8000:http --routes /:8000 --env ...` — or just
connect the GitHub repo, which is simpler.)*

## 3. Set environment variables (Koyeb → Service → Environment)

**Required:**
| Var | What |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (content + chat + synthesis) |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Supabase service-role key |
| `SITE_SECRET_KEY` | pgcrypto key that encrypts stored site/app secrets |
| `PSI_KEY` | Google PageSpeed Insights API key |
| `DATAFORSEO_LOGIN` | DataForSEO account email |
| `DATAFORSEO_PASSWORD` | DataForSEO **API** password |
| `PERPLEXITY_API_KEY` | Perplexity (research grounding) |
| `TAVILY_API_KEY` | Tavily (research retrieval) |

**Optional:**
| Var | Default | Notes |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-4-5-20250929` | override the Claude model |
| `DRY_RUN` | `true` | keep **true** until you intend live WordPress writes |

> `PORT` is provided by Koyeb automatically — do **not** set it.
> Mark the keys as **Secret** in Koyeb, not plain env.

## 4. Verify after deploy

- `https://<app>.koyeb.app/health` → `{"ok":true,...}`
- `https://<app>.koyeb.app/` → the console loads (it calls the API same-origin)
- Open **Admin Panel → System & Integrations** → all keys should show **connected**.

## Notes
- **UK-only** scope and all features are unchanged in production.
- The console calls the API **same-origin** in production (see `web/config.jsx`),
  so there's no CORS or separate-host config to manage.
- Supabase tables (`prompts`, `prompt_history`, audits, etc.) already exist in
  your project — nothing to migrate. The prompt catalogue self-seeds on boot.
- Keep `DRY_RUN=true` unless you explicitly want approved fixes to write to live
  WordPress sites.
