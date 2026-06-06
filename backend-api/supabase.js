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
const ENC_KEY = process.env.SITE_SECRET_KEY || 'sentinel-dev-key';

// Short-lived cache of the "any site" GSC credential (global-connection fallback),
// so the many per-request getGscSa calls don't re-scan every site each time.
let _anyGsc = { v: null, exp: 0 };

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
    return rpc('set_site_secret_srv', { p_site: siteId, p_secret: appPassword, p_key: ENC_KEY });
  },
  async getSecret(siteId) {
    return rpc('get_site_secret_srv', { p_site: siteId, p_key: ENC_KEY });
  },

  // Airtable PAT (encrypted, isolated table — zero browser access).
  async setAirtablePat(siteId, pat) {
    return rpc('set_airtable_pat', { p_site: siteId, p_pat: pat, p_key: ENC_KEY });
  },
  async getAirtablePat(siteId) {
    return rpc('get_airtable_pat', { p_site: siteId, p_key: ENC_KEY });
  },

  // GSC credential (OAuth refresh token OR service-account JSON), encrypted.
  // GLOBAL model: the dashboard connects ONE Google account that owns every
  // property, so a credential stored for any site authenticates all of them.
  // getGscSa returns the site's own credential if present, otherwise falls back
  // to any stored credential (briefly cached) — so connecting once connects the
  // whole dashboard. The per-site *property* (sites.gsc_property) is what differs.
  async setGscSa(siteId, saJson) { _anyGsc = { v: null, exp: 0 }; return rpc('set_gsc_sa', { p_site: siteId, p_sa: saJson, p_key: ENC_KEY }); },
  async getGscSa(siteId) {
    if (siteId) {
      const own = await rpc('get_gsc_sa', { p_site: siteId, p_key: ENC_KEY }).catch(() => null);
      if (own) return own;
    }
    const now = Date.now();
    if (_anyGsc.v && _anyGsc.exp > now) return _anyGsc.v;
    try {
      const sites = await this.listSites();
      for (const s of (sites || [])) {
        const c = await rpc('get_gsc_sa', { p_site: s.id, p_key: ENC_KEY }).catch(() => null);
        if (c) { _anyGsc = { v: c, exp: now + 60000 }; return c; }
      }
    } catch (e) {}
    return null;
  },
  // Clear the GSC credential for EVERY site (global disconnect).
  async clearAllGscSa() {
    _anyGsc = { v: null, exp: 0 };
    const sites = await this.listSites().catch(() => []);
    for (const s of (sites || [])) {
      await rpc('set_gsc_sa', { p_site: s.id, p_sa: '', p_key: ENC_KEY }).catch(() => {});
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
  async saveConversation(id, { title, messages, apiHistory, messageCount }) {
    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = title;
    if (messages !== undefined) patch.messages = messages;
    if (apiHistory !== undefined) patch.api_history = apiHistory;
    if (messageCount !== undefined) patch.message_count = messageCount;
    const o = await rest(`chat_conversations?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
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
  async createAudit(row) { return rest('audits', { method: 'POST', body: JSON.stringify(row) }); },
  async logActivity(row) { return rest('activity', { method: 'POST', body: JSON.stringify(row) }); },
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
