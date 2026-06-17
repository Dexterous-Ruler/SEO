import { config } from '../config.js';

// Minimal WordPress REST API client using Application Password (Basic auth).
// Docs: https://developer.wordpress.org/rest-api/
export class WordPressClient {
  constructor({ baseUrl, username, appPassword } = {}) {
    this.baseUrl = (baseUrl || config.wp.baseUrl).replace(/\/$/, '');
    this.username = username || config.wp.username;
    this.appPassword = appPassword || config.wp.appPassword;
    this.api = `${this.baseUrl}/wp-json/wp/v2`;
  }

  get authHeader() {
    const token = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
    return `Basic ${token}`;
  }

  async request(path, { method = 'GET', body, headers = {}, raw = false, retries = 3 } = {}) {
    const url = path.startsWith('http') ? path : `${this.api}${path}`;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Retry transient server/rate errors; fail fast on 4xx (except 429).
          if ((res.status >= 500 || res.status === 429) && attempt < retries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`WP ${method} ${url} → ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
        }
        if (raw) return res;
        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? res.json() : res.text();
      } catch (e) {
        lastErr = e;
        // Network-level errors (ECONNRESET, fetch failed) — back off and retry.
        const transient = /ECONNRESET|fetch failed|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(e.message);
        if (transient && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  // Connectivity + auth smoke test. Returns the authenticated user.
  async whoAmI() {
    return this.request('/users/me?context=edit');
  }

  // Fetch a batch of posts or pages with pagination handled.
  async list(type = 'pages', { perPage = 100, status = 'publish', fields } = {}) {
    const out = [];
    let page = 1;
    for (;;) {
      const q = new URLSearchParams({ per_page: String(perPage), page: String(page), status });
      if (fields) q.set('_fields', fields);
      const res = await this.request(`/${type}?${q}`, { raw: true });
      const items = await res.json();
      out.push(...items);
      const total = Number(res.headers.get('x-wp-totalpages') || 1);
      if (page >= total || items.length === 0) break;
      page += 1;
    }
    return out;
  }

  async getByType(type, id, { context = 'edit' } = {}) {
    return this.request(`/${type}/${id}?context=${context}`);
  }

  // Update post/page meta (title, content, excerpt, meta fields, etc.)
  // GUARDED: refuses to write when DRY_RUN unless force=true.
  async update(type, id, data, { force = false } = {}) {
    if (config.dryRun && !force) {
      return { dryRun: true, wouldUpdate: { type, id, data } };
    }
    return this.request(`/${type}/${id}`, { method: 'POST', body: data });
  }

  // Media library helpers
  async listMedia({ perPage = 100, mimeType } = {}) {
    const q = new URLSearchParams({ per_page: String(perPage) });
    if (mimeType) q.set('media_type', 'image');
    return this.list('media', { perPage });
  }

  // Upload a binary asset to the media library. GUARDED by DRY_RUN.
  // Uses a direct fetch because request() JSON-stringifies the body.
  async uploadMedia(buffer, filename, mimeType, { force = false } = {}) {
    if (config.dryRun && !force) {
      return { dryRun: true, wouldUpload: { filename, mimeType, bytes: buffer.length } };
    }
    const res = await fetch(`${this.api}/media`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`WP upload ${filename} → ${res.status} ${t.slice(0, 200)}`);
    }
    return res.json();
  }

  // Update a post/page's meta fields (requires the seo-agent mu-plugin).
  async updateMeta(type, id, meta, opts = {}) {
    return this.update(type, id, { meta }, opts);
  }

  // Read a single post/page's meta map (context=edit needed for custom keys).
  async getMeta(type, id) {
    const obj = await this.getByType(type, id, { context: 'edit' });
    return obj?.meta || {};
  }

  // VERIFY-AFTER-WRITE — defeats the Rank Math silent-failure trap.
  // Writes one meta field, reads it back, throws if it didn't stick.
  // Returns { id, field, old, new, status } and records to the write ledger.
  async updateMetaVerified(type, id, field, value, { force = false, store } = {}) {
    const before = await this.getMeta(type, id).catch(() => ({}));
    const oldValue = before?.[field];

    const res = await this.update(type, id, { meta: { [field]: value } }, { force });
    if (res?.dryRun) {
      return { id, field, old: oldValue, new: value, status: 'dry-run' };
    }

    // Read back and assert.
    const after = await this.getMeta(type, id).catch(() => ({}));
    const got = after?.[field];
    const stuck = JSON.stringify(got) === JSON.stringify(value);
    const status = stuck ? 'verified' : 'silent-failure';

    if (store) {
      store.recordWrite({ postId: id, objectType: type, field, oldValue, newValue: value, status });
    }
    if (!stuck) {
      throw new Error(
        `Write to ${type}/${id} field "${field}" returned OK but did NOT stick ` +
        `(silent-failure). Is the seo-agent-meta mu-plugin installed & the key registered?`
      );
    }
    return { id, field, old: oldValue, new: value, status };
  }

  // Enqueue proposed changes into the wp-admin approval queue (mu-plugin route).
  async enqueueChanges(items, { force = false } = {}) {
    if (config.dryRun && !force) {
      return { dryRun: true, wouldEnqueue: items.length };
    }
    return this.request(`${this.baseUrl}/wp-json/seoagent/v1/queue`, {
      method: 'POST',
      body: { items },
    });
  }

  // Confirm the mu-plugin is present and wired. NOTE: the route is
  // /optimize-selftest (the only selftest the mu-plugin registers) — must-use
  // plugins never appear in the /wp/v2/plugins REST list, so this endpoint is the
  // ONLY reliable presence probe. (Calling the non-existent /selftest 404'd, which
  // made every site falsely report "mu-plugin missing".)
  async selftest() {
    return this.request(`${this.baseUrl}/wp-json/seoagent/v1/optimize-selftest`, { method: 'GET' });
  }

  // Purge page/minify/object caches (WP Rocket etc.) so re-verify reads fresh
  // HTML. Best-effort: never throws — a cache miss must not fail an apply.
  async purgeCache({ force = false } = {}) {
    if (config.dryRun && !force) return { dryRun: true, action: 'purge cache' };
    try {
      return await this.request(`${this.baseUrl}/wp-json/seoagent/v1/purge-cache`, { method: 'POST', body: {} });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Resolve a full page URL → { id, type } for posts or pages.
  // Handles the static front page ("/") via the site settings.
  async resolvePostByUrl(url) {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    if (path === '' || path === '/') {
      const settings = await this.request('/settings', { method: 'GET' }).catch(() => ({}));
      if (settings?.page_on_front) {
        return { id: settings.page_on_front, type: 'pages' };
      }
      // Posts-as-homepage: nothing single to target.
      return null;
    }
    const slug = path.split('/').filter(Boolean).pop();
    for (const type of ['pages', 'posts']) {
      const hits = await this.request(`/${type}?slug=${encodeURIComponent(slug)}&_fields=id`, { method: 'GET' }).catch(() => []);
      if (Array.isArray(hits) && hits.length) return { id: hits[0].id, type };
    }
    return null;
  }

  // Read/write a site-wide REST setting (e.g. seoagent_llms_txt, seoagent_org_schema).
  async getSetting(name) {
    const settings = await this.request('/settings', { headers: {}, method: 'GET' }).catch(() => ({}));
    return settings?.[name];
  }
  async setSetting(name, value, { force = false } = {}) {
    if (config.dryRun && !force) {
      return { dryRun: true, wouldSet: { name, value: String(value).slice(0, 80) + '…' } };
    }
    return this.request(`${this.baseUrl}/wp-json/wp/v2/settings`, {
      method: 'POST',
      body: { [name]: value },
    });
  }
}

export function makeClient(opts) {
  return new WordPressClient(opts);
}

export default WordPressClient;
