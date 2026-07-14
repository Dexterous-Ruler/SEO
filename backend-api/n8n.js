// ===========================================================================
// n8n public-API proxy — thin, STATELESS bridge to a user's n8n instance.
// Its job in the system: let the dashboard list a user's workflows, surface &
// edit the PROMPTS buried in their nodes (agent system/user prompts, OpenAI
// message arrays, HTTP JSON bodies), run webhook-triggered workflows, and read
// recent execution errors — all WITHOUT ever storing the instance URL or key.
//
// BYO credentials: every exported fn takes (baseUrl, apiKey, ...). The browser
// holds base+key in localStorage and passes them per request. We never persist
// them, never log the key, and scrub the key out of any surfaced error string.
//
// Zero-dep. Global fetch. 20s AbortController timeout on EVERY network call.
// API shape: base = instance url; REST = <base>/api/v1 (header X-N8N-API-KEY);
// webhooks = <base>/webhook/<path>.  Docs: https://docs.n8n.io/api/
// ===========================================================================

const TIMEOUT_MS = 20000;

// --- baseUrl normalization -------------------------------------------------
// Accept whatever the user pasted: trailing slash(es) and/or a trailing
// /api/v1 are both stripped so we can rebuild the REST/webhook roots cleanly.
function normBase(baseUrl) {
  let b = String(baseUrl || '').trim();
  b = b.replace(/\/+$/, '');          // drop trailing slash(es)
  b = b.replace(/\/api\/v1$/i, '');   // drop a pasted REST suffix
  b = b.replace(/\/+$/, '');          // and any slash that suffix left behind
  return b;
}
const apiRoot = (baseUrl) => normBase(baseUrl) + '/api/v1';

// Never let the key leak into a message we hand back to the client.
function scrub(msg, apiKey) {
  const s = String(msg == null ? '' : msg);
  return apiKey ? s.split(apiKey).join('***') : s;
}

// Short node type: the segment after the last dot.
// '@n8n/n8n-nodes-langchain.agent' -> 'agent', 'n8n-nodes-base.httpRequest' -> 'httpRequest'.
function shortType(type) {
  const t = String(type || '');
  const i = t.lastIndexOf('.');
  return i >= 0 ? t.slice(i + 1) : t;
}

// --- core fetch (REST, keyed, timed) ---------------------------------------
// Returns { ok, status, data } — data is parsed JSON (or { raw:text } on non-JSON).
// Throws only on network/abort; callers translate that into { error }.
async function api(method, baseUrl, apiKey, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiRoot(baseUrl) + path, {
      method,
      headers: {
        'X-N8N-API-KEY': apiKey || '',
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Build a clean { error } string from a failed REST call (key-scrubbed).
function apiError(status, data, apiKey, e) {
  if (e) {
    const m = e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS / 1000}s` : (e.message || String(e));
    return { error: scrub('n8n request failed: ' + m, apiKey) };
  }
  const msg = (data && (data.message || data.error || (data.raw && String(data.raw).slice(0, 200)))) || `HTTP ${status}`;
  const hint = status === 401 ? ' (check the API key)' : status === 404 ? ' (not found)' : '';
  return { error: scrub('n8n: ' + msg + hint, apiKey) };
}

// --- dot-path setter -------------------------------------------------------
// Walk/create a path into an object; a numeric segment means "array index", so
// 'messages.values.0.content' indexes messages.values[0]. Mutates & returns obj.
function setByPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    const key = /^\d+$/.test(seg) ? Number(seg) : seg;
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = nextIsIndex ? [] : {};
    }
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  const lastKey = /^\d+$/.test(last) ? Number(last) : last;
  cur[lastKey] = value;
  return obj;
}

// Which n8n settings keys the PUT endpoint tolerates (everything else 400s).
const ALLOWED_SETTINGS = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow',
  'timezone', 'executionOrder',
];
function filterSettings(settings) {
  const out = {};
  const s = settings || {};
  for (const k of ALLOWED_SETTINGS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

const isWebhookType = (type) => String(type || '').toLowerCase().includes('webhook');

// Extract the editable prompts out of one node per its type. Returns [] for
// nodes that carry no prompt (or sticky notes, filtered by the caller).
function nodePrompts(node) {
  const p = node.parameters || {};
  const type = String(node.type || '');
  const kind = shortType(type).toLowerCase();
  const out = [];

  // LangChain Agent: system prompt (options.systemMessage) + user prompt (text).
  if (kind === 'agent') {
    if (p.options && typeof p.options.systemMessage === 'string') {
      out.push({ path: 'options.systemMessage', label: 'System prompt', value: p.options.systemMessage });
    }
    if (typeof p.text === 'string') {
      out.push({ path: 'text', label: 'Prompt', value: p.text });
    }
    return out;
  }

  // OpenAI / lmChatOpenAi / openAi: an array of message objects at messages.values[N].
  if (kind.includes('openai')) {
    const values = (p.messages && Array.isArray(p.messages.values)) ? p.messages.values : [];
    values.forEach((m, i) => {
      if (m && typeof m.content === 'string') {
        out.push({ path: `messages.values.${i}.content`, label: `Message ${i + 1}`, value: m.content });
      }
    });
    return out;
  }

  // HTTP Request: the JSON body often carries a prompt (a JSON string).
  if (kind === 'httprequest') {
    if (typeof p.jsonBody === 'string' && p.jsonBody.trim() !== '') {
      out.push({ path: 'jsonBody', label: 'Request body', value: p.jsonBody });
    }
    return out;
  }

  return out;
}

// ===========================================================================
// 1) listWorkflows — { workflows:[{id,name,active,site,type,isWriter}], ... }
// ===========================================================================
// The instance mixes real per-site content WRITERS with templates, lead-gen
// bots, competitor/video experiments and scratch "My workflow" files. classify()
// derives the SITE + content TYPE from a name so the panel can group by site and
// show only the writers by default (nothing is deleted — a "show all" toggle
// still lists everything). Site order matters: go-visa/goodfor and "…legal AI"
// are matched before the bare "go legal".
function classify(name) {
  const n = String(name || '').toLowerCase().trim();
  let site = 'Other';
  if (/go[\s-]?visa/.test(n)) site = 'Go Visa';
  else if (/fast[\s-]?ila/.test(n)) site = 'Fast ILA';
  else if (/\bsal\b|settlement/.test(n)) site = 'Settlement Agreement Lawyers';
  else if (/good\s?for/.test(n)) site = 'GoodFor';
  else if (/go[\s-]?legal[\s-]?ai\b/.test(n)) site = 'Go Legal AI';
  else if (/go[\s-]?legal/.test(n)) site = 'Go Legal';
  let type = '';
  if (/recipe/.test(n)) type = 'Recipe';
  else if (/multilingual|jurisdiction/.test(n)) type = 'Multilingual';
  else if (/ingredient|legal definition|glossary|\bdefinition/.test(n)) type = 'Definition';
  else if (/how[\s-]?to/.test(n)) type = 'How-To Guide';
  else if (/smart\s?template/.test(n)) type = 'Smart Template';
  else if (/blog|content[\s-]?publish|ai[\s-]?writer/.test(n)) type = 'Blog';
  // Per Karim: the multi-language / jurisdiction knowledge content is a Go Legal AI
  // line, even though the flow is named "…go-legal-multilingual" (no "ai" in it).
  if (type === 'Multilingual' && site === 'Go Legal') site = 'Go Legal AI';
  // A REAL content writer (vs a competitor/video/lead flow that merely mentions a
  // site): AI-WRITER-*, "Go-LEGAL AI ( … )", GoodFor definition/recipe/… Workflow,
  // *content-publish, or the legacy "Blog-…-legal" flow.
  const isWriter = /^ai[\s-]?writer|go-?legal ai\s*\(|goodfor.*(definition|recipe|workflow)|content[\s-]?publish|^blog-.*legal/.test(n);
  return { site, type: type || (isWriter ? 'Blog' : ''), isWriter };
}

// Karim's intended per-site content structure — the "master set" each site should
// have. The panel reconciles the live workflows against this so the messy 50 reads
// as a clean grid: which planned type is covered, duplicated, inactive, or missing,
// plus any live writers that fall OUTSIDE the plan (extras — kept, never deleted).
const SITE_PLAN = {
  'Go Legal AI': ['Definition', 'Blog', 'Multilingual'],
  'Go Legal': ['Blog'],
  'Fast ILA': ['Blog'],
  'Settlement Agreement Lawyers': ['Blog'],
  'GoodFor': ['Definition', 'Blog', 'Recipe'],
  'Go Visa': ['Blog'],
};

// For each planned (site, type): status = ok | duplicate | inactive | missing, with
// the matching workflow ids. extras = writers whose type isn't in that site's plan.
function reconcilePlan(workflows) {
  const writers = (workflows || []).filter((w) => w.isWriter);
  const bySite = {};
  for (const w of writers) (bySite[w.site] = bySite[w.site] || []).push(w);
  return Object.keys(SITE_PLAN).map((site) => {
    const items = bySite[site] || [];
    const planned = SITE_PLAN[site].map((type) => {
      const matches = items.filter((w) => w.type === type);
      const active = matches.filter((m) => m.active);
      let status = 'missing';
      if (matches.length) status = active.length > 1 ? 'duplicate' : (active.length === 1 ? 'ok' : 'inactive');
      return {
        type, status, count: matches.length, activeCount: active.length,
        workflows: matches.map((m) => ({ id: m.id, name: m.name, active: m.active })),
      };
    });
    const plannedTypes = new Set(SITE_PLAN[site]);
    const extras = items
      .filter((w) => !plannedTypes.has(w.type))
      .map((m) => ({ id: m.id, name: m.name, type: m.type, active: m.active }));
    return { site, planned, extras };
  });
}

async function listWorkflows(baseUrl, apiKey) {
  try {
    const { ok, status, data } = await api('GET', baseUrl, apiKey, '/workflows?limit=200');
    if (!ok) return apiError(status, data, apiKey);
    const workflows = (Array.isArray(data.data) ? data.data : [])
      .map((w) => { const c = classify(w.name); return { id: w.id, name: w.name, active: !!w.active, site: c.site, type: c.type, isWriter: c.isWriter }; })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const writerCount = workflows.filter((w) => w.isWriter).length;
    return { workflows, writerCount, total: workflows.length, structure: reconcilePlan(workflows) };
  } catch (e) {
    return apiError(0, null, apiKey, e);
  }
}

// ===========================================================================
// 2) getWorkflowPrompts — walk nodes, surface editable prompts + hasWebhook.
// ===========================================================================
async function getWorkflowPrompts(baseUrl, apiKey, id) {
  try {
    const { ok, status, data } = await api('GET', baseUrl, apiKey, `/workflows/${encodeURIComponent(id)}`);
    if (!ok) return apiError(status, data, apiKey);
    const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
    const nodes = [];
    let hasWebhook = false;
    for (const node of rawNodes) {
      if (isWebhookType(node.type)) hasWebhook = true;
      if (String(node.type) === 'n8n-nodes-base.stickyNote') continue; // docs, not a prompt
      const prompts = nodePrompts(node);
      if (!prompts.length) continue;
      nodes.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: shortType(node.type),
        prompts,
      });
    }
    return { id: data.id, name: data.name, active: !!data.active, nodes, hasWebhook };
  } catch (e) {
    return apiError(0, null, apiKey, e);
  }
}

// ===========================================================================
// 3) updatePrompts — GET, set each edit at its dot-path, PUT back.
//    edits = [{ nodeId, path, value }] -> { ok:true, updated } | { error }
// ===========================================================================
async function updatePrompts(baseUrl, apiKey, id, edits) {
  try {
    const list = Array.isArray(edits) ? edits : [];
    const got = await api('GET', baseUrl, apiKey, `/workflows/${encodeURIComponent(id)}`);
    if (!got.ok) return apiError(got.status, got.data, apiKey);
    const wf = got.data;
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));

    for (const edit of list) {
      const node = byId.get(edit.nodeId);
      if (!node) return { error: `Node not found: ${edit.nodeId}` };
      if (!node.parameters || typeof node.parameters !== 'object') node.parameters = {};
      setByPath(node.parameters, edit.path, edit.value);
    }

    const putBody = {
      name: wf.name,
      nodes,
      connections: wf.connections || {},
      settings: filterSettings(wf.settings),
    };
    const put = await api('PUT', baseUrl, apiKey, `/workflows/${encodeURIComponent(id)}`, putBody);
    if (!put.ok) return apiError(put.status, put.data, apiKey);
    return { ok: true, updated: list.length };
  } catch (e) {
    return apiError(0, null, apiKey, e);
  }
}

// ===========================================================================
// 4) runWorkflow — POST the webhook trigger (production). Never throws.
//    -> { ranVia:'webhook', status, response } | no-webhook note | { ...error }
// ===========================================================================
async function runWorkflow(baseUrl, apiKey, id, payload) {
  let webhookPath = null;
  // n8n Webhook nodes carry their HTTP method in parameters.httpMethod (default
  // 'GET' in modern n8n; can be GET/POST/PUT/PATCH/DELETE, or an array). We MUST
  // call the webhook with its configured method — a GET-trigger 404s on a POST
  // ('is not registered for POST requests'). Fall back to POST when unset.
  let webhookMethod = 'POST';
  try {
    const got = await api('GET', baseUrl, apiKey, `/workflows/${encodeURIComponent(id)}`);
    if (!got.ok) return { ranVia: 'none', ...apiError(got.status, got.data, apiKey) };
    const nodes = Array.isArray(got.data.nodes) ? got.data.nodes : [];
    const trigger = nodes.find((n) => isWebhookType(n.type));
    if (trigger) {
      const pp = (trigger.parameters && trigger.parameters.path) || trigger.webhookId;
      if (pp) webhookPath = String(pp).replace(/^\/+/, '');
      const hm = trigger.parameters && trigger.parameters.httpMethod;
      const m = Array.isArray(hm) ? hm[0] : hm;
      if (m) webhookMethod = String(m).toUpperCase();
    }
  } catch (e) {
    return { ranVia: 'none', ...apiError(0, null, apiKey, e) };
  }

  if (!webhookPath) {
    return {
      ranVia: 'none',
      note: 'This workflow has no webhook trigger (manual/schedule) — run it from the n8n editor.',
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Only methods that permit a request body should carry the JSON payload.
    const sendBody = webhookMethod !== 'GET' && webhookMethod !== 'HEAD';
    const res = await fetch(`${normBase(baseUrl)}/webhook/${webhookPath}`, {
      method: webhookMethod,
      headers: sendBody ? { 'Content-Type': 'application/json' } : {},
      body: sendBody ? JSON.stringify(payload || {}) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let response;
    try { response = text ? JSON.parse(text) : null; } catch { response = text; }
    // A production webhook returns HTTP 404 when its workflow is inactive or the
    // method doesn't match, and can 500 on a workflow error. Without checking
    // res.ok the UI would report a green "triggered ✓" for a run that never
    // executed — surface a real failure with the status + a hint so the caller
    // (and its toast) shows the run actually failed.
    if (!res.ok) {
      let msg = `webhook returned HTTP ${res.status} (${webhookMethod})`;
      if (res.status === 404) msg += ' — workflow may be inactive, or the webhook is not registered for ' + webhookMethod;
      const detail = (response && typeof response === 'object' && (response.message || response.error)) ||
        (typeof response === 'string' ? response : '');
      if (detail) msg += ': ' + truncate(detail, 200);
      return { ranVia: 'webhook', status: res.status, method: webhookMethod, error: scrub(msg, apiKey), response };
    }
    return { ranVia: 'webhook', status: res.status, method: webhookMethod, response };
  } catch (e) {
    const m = e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS / 1000}s` : (e.message || String(e));
    return { ranVia: 'webhook', status: 0, method: webhookMethod, error: scrub('webhook call failed: ' + m, apiKey) };
  } finally {
    clearTimeout(timer);
  }
}

// ===========================================================================
// 5) getExecutions — recent runs (default: errors) + best-effort node/message.
// ===========================================================================
const truncate = (s, n = 300) => {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n) + '…' : str;
};

async function getExecutions(baseUrl, apiKey, id, { status = 'error', limit = 10 } = {}) {
  try {
    const q = `/executions?workflowId=${encodeURIComponent(id)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`;
    const { ok, status: httpStatus, data } = await api('GET', baseUrl, apiKey, q);
    if (!ok) return apiError(httpStatus, data, apiKey);
    const rows = Array.isArray(data.data) ? data.data : [];

    const executions = await Promise.all(rows.map(async (ex) => {
      const base = {
        id: ex.id,
        status: ex.status,
        startedAt: ex.startedAt || null,
        stoppedAt: ex.stoppedAt || null,
        node: null,
        message: null,
      };
      try {
        const det = await api('GET', baseUrl, apiKey, `/executions/${encodeURIComponent(ex.id)}?includeData=true`);
        if (det.ok) {
          let d = det.data && det.data.data;
          if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
          const rd = d && d.resultData;
          if (rd) {
            const err = rd.error || null;
            base.node = (err && err.node && err.node.name) || rd.lastNodeExecuted || null;
            if (err && err.message) base.message = truncate(err.message);
          }
        }
      } catch { /* best-effort: leave node/message null */ }
      return base;
    }));

    return { executions };
  } catch (e) {
    return apiError(0, null, apiKey, e);
  }
}

// Internal helper exported for offline unit testing of the path-setter.
export { setByPath as _setByPath };

export { listWorkflows, getWorkflowPrompts, updatePrompts, runWorkflow, getExecutions };
export default { listWorkflows, getWorkflowPrompts, updatePrompts, runWorkflow, getExecutions };
