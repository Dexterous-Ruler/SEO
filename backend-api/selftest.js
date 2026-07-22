// ===========================================================================
// FULL-SYSTEM SELF-TEST — exercises every subsystem for every connected site,
// entirely server-side, so the whole platform can be verified without opening
// the dashboard. Read-only by design: nothing is written to WordPress, Airtable
// or n8n; the only writes are the test's own activity-log entry (best-effort).
//
// Shape: { ranAt, ms, global: {check: {ok, detail}}, sites: [{id, name, checks}] ,
//          summary: {pass, warn, fail} }.  Every check is individually
// timeout-bounded (12s default) so one dead vendor can never hang the suite.
// ===========================================================================
import { db, credsForSite } from './supabase.js';
import { WordPressClient } from '../src/wp/client.js';
import * as dfs from './dataforseo.js';
import * as airtable from './airtable.js';
import n8n from './n8n.js';
import { worklist as engineWorklist } from './content-engine.js';

const CHECK_TIMEOUT_MS = 12000;

// Run one named check with a hard timeout. NEVER throws — returns {ok, detail, ms}.
async function check(fn, timeoutMs = CHECK_TIMEOUT_MS) {
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs)),
    ]);
    const out = (result && typeof result === 'object') ? result : { ok: !!result };
    return { ok: out.ok !== false, detail: out.detail || '', warn: !!out.warn, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, detail: String(e && e.message || e).slice(0, 200), ms: Date.now() - t0 };
  }
}

// ---- global (site-independent) checks --------------------------------------
async function globalChecks() {
  const g = {};

  g.supabase = await check(async () => {
    const sites = await db.listSites();
    return { ok: Array.isArray(sites) && sites.length > 0, detail: `${(sites || []).length} site(s)` };
  });

  g.anthropic = await check(async () => {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, detail: 'ANTHROPIC_API_KEY not set' };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
    });
    return { ok: r.ok, detail: r.ok ? 'key valid' : `HTTP ${r.status}` };
  });

  g.dataforseo = await check(async () => {
    if (!dfs.hasKey()) return { ok: false, detail: 'DATAFORSEO_LOGIN/PASSWORD not set' };
    const units = await dfs.apiUnits();
    // apiUnits returns remaining credit; treat null as "reachable, balance unknown".
    return { ok: units == null || units > 0, warn: units != null && units < 100, detail: units == null ? 'reachable' : `$${units} credit left` };
  });

  g.firecrawl = await check(async () => {
    const k = await db.getAppSecret('firecrawl_api_key').catch(() => null) || process.env.FIRECRAWL_API_KEY;
    if (!k) return { ok: true, warn: true, detail: 'not configured (reader falls back to r.jina.ai)' };
    const r = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', { headers: { Authorization: `Bearer ${k}` } });
    return { ok: r.ok, detail: r.ok ? 'key valid' : `HTTP ${r.status}` };
  });

  g.n8n = await check(async () => {
    const cfg = await db.getN8nConfig().catch(() => null);
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) return { ok: false, detail: 'n8n not connected' };
    const r = await n8n.listWorkflows(cfg.baseUrl, cfg.apiKey);
    if (r && r.error) return { ok: false, detail: r.error };
    return { ok: true, detail: `${r.total} workflows, ${r.writerCount} writers` };
  }, 20000);

  return g;
}

// ---- per-site checks --------------------------------------------------------
async function siteChecks(site) {
  const s = { id: site.id, name: site.name, checks: {} };
  const c = s.checks;

  // 1) WordPress REST reachable + authenticated (read-only: GET users/me).
  let wp = null;
  c.wordpress = await check(async () => {
    const creds = await credsForSite(site.id);
    wp = new WordPressClient(creds);
    const me = await wp.request('/users/me?context=edit&_fields=id,name');
    return { ok: !!(me && me.id), detail: me && me.name ? `auth ok (${me.name})` : 'auth ok' };
  }, 20000);

  // 2) mu-plugin present + selftest (read-only GET; skipped if WP failed).
  c.muPlugin = !c.wordpress.ok ? { ok: false, detail: 'skipped — WordPress unreachable' } : await check(async () => {
    const r = await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/optimize-selftest`, { method: 'GET' }).catch((e) => ({ error: String(e.message || e) }));
    if (r && r.error) return { ok: false, detail: String(r.error).slice(0, 120) };
    return { ok: true, detail: r && r.version ? `v${r.version}` : 'responding' };
  }, 20000);

  // 3) Content published recently (posts endpoint answers + newest post age).
  c.content = !c.wordpress.ok ? { ok: false, detail: 'skipped' } : await check(async () => {
    const posts = await wp.request('/posts?per_page=1&orderby=date&order=desc&_fields=date');
    if (!Array.isArray(posts) || !posts.length) return { ok: true, warn: true, detail: 'no posts' };
    const days = Math.round((Date.now() - new Date(posts[0].date).getTime()) / 86400000);
    return { ok: true, warn: days > 14, detail: `newest post ${days}d old` };
  });

  // 4) Airtable: PAT + base + the n8n-watched Article Writer table exist.
  c.airtable = await check(async () => {
    const pat = await db.getAirtablePat(site.id).catch(() => null);
    if (!pat) return { ok: false, detail: 'not connected' };
    const cfg = await db.getAirtableConfig(site.id).catch(() => null);
    if (!cfg || !cfg.base_id) return { ok: false, detail: 'no base configured' };
    const tables = await airtable.listTables(pat, cfg.base_id);
    const tbl = tables.find((t) => t.id === cfg.table_gaps || t.name === cfg.table_gaps);
    if (!tbl) return { ok: false, detail: 'writer table missing from base ' + cfg.base_id };
    return { ok: true, detail: `${tbl.name} in ${cfg.base_id}` };
  });

  // 5) GSC credential + property set.
  c.gsc = await check(async () => {
    const sa = await db.getGscSa(site.id).catch(() => null);
    if (!sa) return { ok: true, warn: true, detail: 'no credential (analytics-only gap)' };
    if (!site.gsc_property) return { ok: true, warn: true, detail: 'credential ok, no property picked' };
    return { ok: true, detail: site.gsc_property };
  });

  // 6) Site context present (drives every relevance filter).
  c.siteContext = await check(async () => {
    const len = (site.geo_context || '').length;
    return { ok: len > 100, warn: len > 100 && len < 500, detail: len ? `${len} chars` : 'EMPTY — relevance filters run blind' };
  });

  // 7) Engine worklist (the "to-do list") provisioned + has actionable items.
  c.worklist = await check(async () => {
    const r = await engineWorklist(site.id, { limit: 500 });
    if (r && r.notProvisioned) return { ok: false, detail: 'content_opportunities table not provisioned' };
    if (r && r.error) return { ok: false, detail: String(r.error).slice(0, 120) };
    const items = (r && r.items) || [];
    const open = items.filter((x) => x.status === 'scored' || x.status === 'queued').length;
    return { ok: true, warn: items.length === 0, detail: `${items.length} item(s), ${open} open` };
  });

  return s;
}

// ---- entry ------------------------------------------------------------------
export async function runSelftest({ siteId } = {}) {
  const t0 = Date.now();
  const all = await db.listSites();
  const sites = siteId ? all.filter((x) => x.id === siteId) : all;

  const [globals, ...perSite] = await Promise.all([
    globalChecks(),
    ...sites.map((s) => siteChecks(s)),
  ]);

  let pass = 0, warn = 0, fail = 0;
  const tally = (chk) => { if (!chk.ok) fail++; else if (chk.warn) warn++; else pass++; };
  Object.values(globals).forEach(tally);
  perSite.forEach((s) => Object.values(s.checks).forEach(tally));

  const out = { ranAt: new Date().toISOString(), ms: Date.now() - t0, summary: { pass, warn, fail }, global: globals, sites: perSite };
  // Best-effort audit trail — never fail the selftest over logging.
  try {
    await db.logActivity({ site_id: sites[0] && sites[0].id, type: fail ? 'warning' : 'verified', actor: 'Agent', icon: 'radar', text: `System self-test: ${pass} pass · ${warn} warn · ${fail} fail`, meta: `${Math.round((Date.now() - t0) / 1000)}s, ${sites.length} site(s)` });
  } catch (e) {}
  return out;
}

export default { runSelftest };
