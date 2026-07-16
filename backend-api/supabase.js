// ===========================================================================
// Server-side Supabase client (service role). Stores connected sites, ENCRYPTS
// each WordPress application password at rest, and decrypts it ONLY here on the
// server when an operation needs it. The browser never holds a site's secret
// after the initial connect call — it only ever references a site by id.
//
// Generic + multi-site: nothing is hardcoded to any particular WordPress site.
// ===========================================================================
import { config } from 'dotenv';
config({ override: true });

const SB = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE;

// Encryption passphrase for EVERY credential stored at rest (WordPress app
// passwords, Airtable PAT, n8n API key, GSC creds — all passed as p_key to the
// pgcrypto RPCs). SITE_SECRET_KEY MUST be set in any real deployment. If it is
// unset we fall back to a well-known, repo-committed dev key so local dev still
// boots — but that key is PUBLIC, so the fallback is (a) shouted about loudly at
// startup and (b) refused for real encrypt/decrypt in production (see encKey()).
const DEV_ENC_KEY = 'sentinel-dev-key';
const SITE_SECRET = process.env.SITE_SECRET_KEY;
const IS_PROD = process.env.NODE_ENV === 'production';
const ENC_KEY = SITE_SECRET || DEV_ENC_KEY;
if (!SITE_SECRET) {
  const msg = '[supabase] SECURITY: SITE_SECRET_KEY is not set — stored credentials '
    + '(WordPress app passwords, Airtable PAT, n8n API key, GSC creds) would be encrypted '
    + 'with a PUBLIC, repo-committed dev key. Set SITE_SECRET_KEY to a strong random secret.';
  if (IS_PROD) console.error(msg + ' Refusing to encrypt/decrypt in production until it is set.');
  else console.warn(msg + ' (insecure dev fallback in use — do NOT ship this)');
}

// Return the encryption key, or throw in production when only the insecure dev key
// is available — so a missing SITE_SECRET_KEY fails LOUD (per credential op) instead
// of silently storing secrets under a publicly-known passphrase. Dev keeps working.
function encKey() {
  if (!SITE_SECRET && IS_PROD) {
    throw new Error('SITE_SECRET_KEY is not set — refusing to use the insecure default '
      + 'encryption key in production. Set SITE_SECRET_KEY and restart.');
  }
  return ENC_KEY;
}

// Warn once per RPC name when a credential RPC is missing/errors, so a fresh DB
// lacking the GSC/Airtable functions degrades to null with a single visible line
// instead of throwing an unhandled error.
const _rpcWarned = new Set();
function warnRpcMissing(fn, e) {
  if (_rpcWarned.has(fn)) return;
  _rpcWarned.add(fn);
  console.warn(`[supabase] RPC ${fn} unavailable — degrading to null `
    + `(${(e && e.message) || e}). Ensure the migration defining ${fn} has been applied.`);
}

// Short-lived cache of the "any site" GSC credential (global-connection fallback),
// so the many per-request getGscSa calls don't re-scan every site each time.
let _anyGsc = { v: null, exp: 0 };
// Same idea for the Airtable PAT — one token accesses all the user's bases, so
// the connection is global; each site only differs by which base it writes to.
let _anyAt = { v: null, exp: 0 };
// n8n instance config (base URL + public API key). ONE instance serves every site,
// so this is a single global credential (encrypted at rest in app_secrets).
let _n8n = { v: null, exp: 0 };
// Generic per-name cache for other global app_secrets (e.g. the Firecrawl API key),
// so a hot path like readPage() doesn't decrypt on every call.
const _secrets = new Map(); // name -> { v, exp }

function headers(extra) {
  return Object.assign({
    apikey: SERVICE,
    Authorization: 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function rest(path, opts = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`supabase ${path} → ${res.status} ${text.slice(0, 200)}`);
  return data;
}

async function rpc(fn, args) {
  const res = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} → ${res.status} ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

export const db = {
  // ---- sites ----
  async createSite(row) {
    const out = await rest('sites', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    return Array.isArray(out) ? out[0] : out;
  },
  async updateSite(id, patch) {
    const out = await rest(`sites?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return Array.isArray(out) ? out[0] : out;
  },
  async getSite(id) {
    const out = await rest(`sites?id=eq.${id}&select=*`);
    return out && out[0];
  },
  async listSites() { return rest('sites?select=*&order=created_at.asc'); },
  async listAudits(siteId, limit = 200) { return rest(`audits?site_id=eq.${siteId}&select=created_at,scores,cwv&order=created_at.asc&limit=${limit}`); },

  // ---- encrypted credentials (pgcrypto via SQL RPC) ----
  // Store the app password encrypted; only the server (service role) can decrypt.
  async setSecret(siteId, appPassword) {
    return rpc('set_site_secret_srv', { p_site: siteId, p_secret: appPassword, p_key: encKey() });
  },
  async getSecret(siteId) {
    return rpc('get_site_secret_srv', { p_site: siteId, p_key: encKey() });
  },

  // Airtable PAT (encrypted, isolated table — zero browser access).
  // GLOBAL model: one token accesses every base, so getAirtablePat falls back to
  // any stored token — connect once, then each site just picks its own base.
  async setAirtablePat(siteId, pat) {
    _anyAt = { v: null, exp: 0 };
    try { return await rpc('set_airtable_pat', { p_site: siteId, p_pat: pat, p_key: encKey() }); }
    catch (e) { warnRpcMissing('set_airtable_pat', e); return null; }
  },
  async getAirtablePat(siteId) {
    if (siteId) {
      let own = null;
      try { own = await rpc('get_airtable_pat', { p_site: siteId, p_key: encKey() }); }
      catch (e) { warnRpcMissing('get_airtable_pat', e); }
      if (own) return own;
    }
    const now = Date.now();
    if (_anyAt.v && _anyAt.exp > now) return _anyAt.v;
    try {
      const sites = await this.listSites();
      for (const s of (sites || [])) {
        const c = await rpc('get_airtable_pat', { p_site: s.id, p_key: encKey() }).catch((e) => { warnRpcMissing('get_airtable_pat', e); return null; });
        if (c) { _anyAt = { v: c, exp: now + 60000 }; return c; }
      }
    } catch (e) { warnRpcMissing('get_airtable_pat', e); }
    return null;
  },

  // n8n instance config — base URL + public API key, ENCRYPTED at rest via the
  // generic app_secrets store (pgcrypto). GLOBAL: one n8n instance serves every
  // site, so this is a single credential, not per-site. The browser stores nothing:
  // it connects once, the key is encrypted here, and every /n8n-* call resolves it
  // server-side. getN8nConfig().apiKey MUST NEVER be returned to a browser route.
  async setN8nConfig(baseUrl, apiKey) {
    _n8n = { v: null, exp: 0 };
    if (baseUrl != null) await rpc('set_app_secret', { p_name: 'n8n_base_url', p_val: String(baseUrl), p_key: encKey() });
    if (apiKey != null) await rpc('set_app_secret', { p_name: 'n8n_api_key', p_val: String(apiKey), p_key: encKey() });
    return { ok: true };
  },
  async getN8nConfig() {
    const now = Date.now();
    if (_n8n.v && _n8n.exp > now) return _n8n.v;
    const baseUrl = await rpc('get_app_secret', { p_name: 'n8n_base_url', p_key: encKey() }).catch(() => null);
    const apiKey = await rpc('get_app_secret', { p_name: 'n8n_api_key', p_key: encKey() }).catch(() => null);
    const v = { baseUrl: baseUrl || null, apiKey: apiKey || null };
    _n8n = { v, exp: now + 60000 };
    return v;
  },
  async clearN8nConfig() {
    _n8n = { v: null, exp: 0 };
    await rpc('set_app_secret', { p_name: 'n8n_api_key', p_val: '', p_key: encKey() }).catch(() => {});
    await rpc('set_app_secret', { p_name: 'n8n_base_url', p_val: '', p_key: encKey() }).catch(() => {});
    return { ok: true };
  },

  // Generic encrypted app-secret accessors (same pgcrypto store as the n8n key).
  // Used for global service keys like the Firecrawl API key. NEVER return the value
  // to a browser route — resolve it server-side and use it there only. Cached 5 min.
  async setAppSecret(name, val) {
    _secrets.delete(name);
    await rpc('set_app_secret', { p_name: String(name), p_val: String(val == null ? '' : val), p_key: encKey() });
    return { ok: true };
  },
  async getAppSecret(name) {
    const now = Date.now();
    const hit = _secrets.get(name);
    if (hit && hit.exp > now) return hit.v;
    const v = await rpc('get_app_secret', { p_name: String(name), p_key: encKey() }).catch(() => null);
    _secrets.set(name, { v: v || null, exp: now + 300000 });
    return v || null;
  },

  // GSC credential (OAuth refresh token OR service-account JSON), encrypted.
  // GLOBAL model: the dashboard connects ONE Google account that owns every
  // property, so a credential stored for any site authenticates all of them.
  // getGscSa returns the site's own credential if present, otherwise falls back
  // to any stored credential (briefly cached) — so connecting once connects the
  // whole dashboard. The per-site *property* (sites.gsc_property) is what differs.
  async setGscSa(siteId, saJson) {
    _anyGsc = { v: null, exp: 0 };
    try { return await rpc('set_gsc_sa', { p_site: siteId, p_sa: saJson, p_key: encKey() }); }
    catch (e) { warnRpcMissing('set_gsc_sa', e); return null; }
  },
  async getGscSa(siteId) {
    if (siteId) {
      let own = null;
      try { own = await rpc('get_gsc_sa', { p_site: siteId, p_key: encKey() }); }
      catch (e) { warnRpcMissing('get_gsc_sa', e); }
      if (own) return own;
    }
    const now = Date.now();
    if (_anyGsc.v && _anyGsc.exp > now) return _anyGsc.v;
    try {
      const sites = await this.listSites();
      for (const s of (sites || [])) {
        const c = await rpc('get_gsc_sa', { p_site: s.id, p_key: encKey() }).catch((e) => { warnRpcMissing('get_gsc_sa', e); return null; });
        if (c) { _anyGsc = { v: c, exp: now + 60000 }; return c; }
      }
    } catch (e) { warnRpcMissing('get_gsc_sa', e); }
    return null;
  },
  // Clear the GSC credential for EVERY site (global disconnect).
  async clearAllGscSa() {
    _anyGsc = { v: null, exp: 0 };
    const sites = await this.listSites().catch(() => []);
    for (const s of (sites || [])) {
      await rpc('set_gsc_sa', { p_site: s.id, p_sa: '', p_key: encKey() }).catch(() => {});
      await this.updateSite(s.id, { gsc_property: null }).catch(() => {});
    }
  },

  // Airtable config (base/table selection) — browser-readable (no secret).
  async getAirtableConfig(siteId) {
    const o = await rest(`airtable_config?site_id=eq.${siteId}&select=*`);
    return o && o[0];
  },
  async upsertAirtableConfig(siteId, patch) {
    const existing = await this.getAirtableConfig(siteId);
    if (existing) {
      const o = await rest(`airtable_config?site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return Array.isArray(o) ? o[0] : o;
    }
    const o = await rest('airtable_config', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, ...patch }) });
    return Array.isArray(o) ? o[0] : o;
  },
  async logAirtableSync(row) { return rest('airtable_sync_log', { method: 'POST', body: JSON.stringify(row) }); },

  // ---- chat conversations (resumable history, JSONB) ----
  async listConversations(siteId) {
    return rest(`chat_conversations?site_id=eq.${siteId}&select=id,title,message_count,updated_at&order=updated_at.desc&limit=50`);
  },
  async getConversation(id) {
    const o = await rest(`chat_conversations?id=eq.${id}&select=*`);
    return o && o[0];
  },
  async createConversation(siteId, title) {
    const o = await rest('chat_conversations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, title: title || 'New chat' }) });
    return Array.isArray(o) ? o[0] : o;
  },
  async saveConversation(id, { title, messages, apiHistory, messageCount, siteId }) {
    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = title;
    if (messages !== undefined) patch.messages = messages;
    if (apiHistory !== undefined) patch.api_history = apiHistory;
    if (messageCount !== undefined) patch.message_count = messageCount;
    // Scope the write to the owning site when known → a mismatched convoId (from a raced/buggy
    // client) updates 0 rows instead of cross-writing into another tenant's conversation.
    const scope = siteId ? `&site_id=eq.${siteId}` : '';
    const o = await rest(`chat_conversations?id=eq.${id}${scope}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return Array.isArray(o) ? o[0] : o;
  },
  async deleteConversation(id) {
    return rest(`chat_conversations?id=eq.${id}`, { method: 'DELETE' });
  },

  // ---- proposals / audits / activity ----
  async createProposal(row) {
    const out = await rest('proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    return Array.isArray(out) ? out[0] : out;
  },
  async updateProposal(id, patch) {
    const out = await rest(`proposals?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return Array.isArray(out) ? out[0] : out;
  },
  async getProposal(id) { const o = await rest(`proposals?id=eq.${id}&select=*`); return o && o[0]; },
  // Applied (verified) changes for a site — feeds the outcome/impact measurement.
  async listAppliedProposals(siteId) {
    return rest(`proposals?site_id=eq.${siteId}&status=eq.verified&applied_at=not.is.null&select=id,page,field,title,after_val,applied_at&order=applied_at.asc`).catch(() => []);
  },
  // Still-pending proposal for a finding signature — used to de-dupe re-filed defects.
  async findOpenProposal(siteId, findingId) {
    const o = await rest(`proposals?site_id=eq.${siteId}&finding_id=eq.${encodeURIComponent(findingId)}&status=eq.proposed&select=id&limit=1`).catch(() => []);
    return o && o[0];
  },
  async logActivity(row) {
    // activity.owner is NOT NULL. Backend callers pass only {site_id,type,...} with
    // no owner, so resolve it here so the insert never violates the constraint:
    // caller-supplied owner → the site's owner → a safe fallback.
    let owner = row && row.owner;
    if (!owner && row && row.site_id) {
      try { const s = await this.getSite(row.site_id); owner = s && s.owner; } catch (e) {}
    }
    if (!owner) owner = process.env.DEFAULT_ACTIVITY_OWNER || 'system';
    return rest('activity', { method: 'POST', body: JSON.stringify({ ...row, owner }) });
  },
};

// Resolve a site id → full WordPress credentials (decrypted server-side).
// This is the ONLY place app passwords are reassembled, and only on the server.
export async function credsForSite(siteId) {
  const site = await db.getSite(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);
  const appPassword = await db.getSecret(siteId);
  if (!appPassword) throw new Error(`no stored secret for site ${siteId}`);
  return { baseUrl: site.url, username: site.username, appPassword, site };
}

export default { db, credsForSite };
