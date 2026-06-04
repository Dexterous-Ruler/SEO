# Server Setup — step by step (go-legal.ai)

Three things to enable writes + full-scale auditing. None are urgent — read-only
auditing already works. Do them when ready, in any order.

---

## ① Install the mu-plugin (enables writes + the wp-admin approval queue)

**What it does:** lets the agent write Rank Math's SEO fields safely, and gives
*you* (admin) a "SEO Agent" approval screen in wp-admin.

**Steps (Hostinger File Manager — easiest):**
1. Log in to **hPanel** (Hostinger) → your go-legal.ai site → **File Manager**.
2. Navigate to: `public_html/wp-content/`.
3. Is there a folder named **`mu-plugins`**?
   - **No** → click **New Folder**, name it exactly `mu-plugins`, open it.
   - **Yes** → open it.
4. Click **Upload** and upload the file from this project:
   `D:\Karim\wp-plugin\seo-agent-meta.php`
5. Go to **wp-admin → Settings → Permalinks** → click **Save Changes** (no edits
   needed — this flushes routing so the new endpoints work).
6. Tell me, and I'll run `node src/cli.js selftest` to confirm it's live.

**Alternative (if you use FTP):** same file → `wp-content/mu-plugins/` via FileZilla.

> mu-plugins (“must-use”) auto-activate — there's no “Activate” button to click,
> and it can't be disabled by accident. That's intentional for safety.

---

## ② Enable Rank Math "Headless CMS Support" (optional — I have a fallback)

**What it does:** exposes Rank Math's `getHead` endpoint so I can read SEO state
via a clean API instead of scraping HTML. Optional — my HTML fallback already works.

**Steps:**
1. wp-admin → **Rank Math → Dashboard** (or **Rank Math → Settings**).
2. Find **"Headless CMS Support"** in the modules/options list.
3. Toggle it **ON** / Activate.
4. Save.

That's it. If you can't find it, skip it — it changes nothing for you, I just use
the fallback.

---

## ③ Create a free PageSpeed Insights API key (enables full-scale scoring)

**What it does:** lets me run real Lighthouse scores (Performance/Accessibility/
Best-Practices/SEO + Google's real-user CrUX field data) across all 2,688 URLs
without rate-limiting. 25,000 requests/day, free.

**Steps:**
1. Go to **https://console.cloud.google.com/**  (sign in with any Google account).
2. Top bar → **Select a project** → **New Project** → name it `go-legal-seo` → Create.
3. Search bar → type **"PageSpeed Insights API"** → open it → click **Enable**.
4. Left menu → **APIs & Services → Credentials** → **+ Create Credentials → API key**.
5. Copy the key. Then click **"Edit API key"** → under **API restrictions**, choose
   **"Restrict key"** → tick **PageSpeed Insights API** only → **Save**. (This stops
   anyone misusing a leaked key — important.)
6. Send me the key. I'll put it in `.env` as `PSI_KEY` (gitignored, never committed).

---

## ④ (When you decide) Hostinger plan tier — for image bulk + WP-CLI

To know whether we can use **ShortPixel WP-CLI bulk** (fast for the image backlog)
or stick to the **REST + local `sharp`** path (works on any tier):

1. hPanel → your site → look for **"SSH Access"** under **Advanced**.
   - If **SSH Access** exists and can be enabled → you're on Premium/Business/Cloud →
     we can use WP-CLI + ShortPixel bulk.
   - If there's **no SSH option** → Single/WordPress-Single tier → we stay REST-only
     (totally fine; just slower for the one-time image backlog).
2. Tell me what you see and I'll choose the image pipeline accordingly.

---

## Security reminder
🔑 **Rotate the application password** you shared in chat once testing is done:
wp-admin → **Users → Profile → Application Passwords** → revoke the current one →
create a new one → send it to me. (It's currently only in `.env`, which is gitignored.)
