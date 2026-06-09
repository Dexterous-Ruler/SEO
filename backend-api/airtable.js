// ===========================================================================
// Airtable integration — pushes SEMrush keyword gaps, Claude content suggestions,
// and GEO AI-citation results into a user's Airtable base.
//
// AUTH: Personal Access Token (PAT). Airtable deprecated API keys (Feb 2024) and
// recommends PATs for server-side automation. A PAT is scoped (data.records:write
// + schema.bases:read), works immediately server-side, and is revocable — far
// simpler than OAuth for a single-operator automation tool. The PAT is encrypted
// at rest (airtable_secrets table) and decrypted only server-side, like WP creds.
//
// Web API docs: https://airtable.com/developers/web/api/introduction
// ===========================================================================

const API = 'https://api.airtable.com/v0';
const META = 'https://api.airtable.com/v0/meta';

async function at(pat, url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + pat, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error.type)) || text.slice(0, 200);
    throw new Error(`Airtable ${res.status}: ${msg}`);
  }
  return data;
}

// Validate a PAT + list the bases it can access (whoami-ish).
export async function listBases(pat) {
  const data = await at(pat, `${META}/bases`);
  return (data.bases || []).map((b) => ({ id: b.id, name: b.name, permissionLevel: b.permissionLevel }));
}

// List tables in a base (so the UI can let the user pick which table to write to).
// Includes singleSelect/multiSelect choices so the embedded grid can render
// proper dropdowns (e.g. the Status field that triggers the n8n workflow).
export async function listTables(pat, baseId) {
  const data = await at(pat, `${META}/bases/${baseId}/tables`);
  return (data.tables || []).map((t) => ({
    id: t.id, name: t.name,
    fields: (t.fields || []).map((f) => ({
      name: f.name, type: f.type,
      options: (f.options && Array.isArray(f.options.choices)) ? f.options.choices.map((c) => ({ name: c.name, color: c.color })) : undefined,
    })),
  }));
}

// Ensure a field exists on a table; create it if missing (needs schema.bases:write).
// Returns the field name to use, or null if it can't be created.
export async function ensureField(pat, baseId, tableId, name, type = 'multilineText') {
  try {
    const data = await at(pat, `${META}/bases/${baseId}/tables/${tableId}/fields`, { method: 'POST', body: { name, type } });
    return data && data.name ? data.name : name;
  } catch (e) { return null; }
}

// ── Embedded grid: read/write individual records ───────────────────────────
export async function listRecords(pat, baseId, table, { pageSize = 50, offset, fields } = {}) {
  const enc = encodeURIComponent(table);
  const params = new URLSearchParams({ pageSize: String(Math.min(pageSize, 100)) });
  if (offset) params.set('offset', offset);
  (fields || []).forEach((f) => params.append('fields[]', f));
  const data = await at(pat, `${API}/${baseId}/${enc}?${params.toString()}`);
  return { records: (data.records || []).map((r) => ({ id: r.id, fields: r.fields || {} })), offset: data.offset || null };
}

export async function updateRecord(pat, baseId, table, recordId, fields) {
  const enc = encodeURIComponent(table);
  const data = await at(pat, `${API}/${baseId}/${enc}/${recordId}`, { method: 'PATCH', body: { fields, typecast: true } });
  return { id: data.id, fields: data.fields || {} };
}

export async function createRecord(pat, baseId, table, fields) {
  const enc = encodeURIComponent(table);
  const data = await at(pat, `${API}/${baseId}/${enc}`, { method: 'POST', body: { records: [{ fields }], typecast: true } });
  const r = (data.records || [])[0] || {};
  return { id: r.id, fields: r.fields || {} };
}

// Ensure a table exists with the given fields; create it if missing. Returns table.
// Requires the PAT to have schema.bases:write scope. If it lacks that scope, the
// caller should pre-create tables and pass their names.
export async function ensureTable(pat, baseId, tableName, fields) {
  const tables = await listTables(pat, baseId).catch(() => []);
  const found = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (found) return found;
  const data = await at(pat, `${META}/bases/${baseId}/tables`, {
    method: 'POST',
    body: { name: tableName, fields },
  });
  return { id: data.id, name: data.name };
}

// Create records in batches of 10 (Airtable's per-request limit).
export async function createRecords(pat, baseId, table, records) {
  const enc = encodeURIComponent(table);
  let pushed = 0;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10).map((fields) => ({ fields }));
    await at(pat, `${API}/${baseId}/${enc}`, { method: 'POST', body: { records: batch, typecast: true } });
    pushed += batch.length;
  }
  return pushed;
}

// Read every existing value of ONE field (for de-duplication). Paginates.
export async function listFieldValues(pat, baseId, table, fieldName, { max = 8000 } = {}) {
  const enc = encodeURIComponent(table);
  const vals = new Set();
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    params.append('fields[]', fieldName);
    if (offset) params.set('offset', offset);
    const data = await at(pat, `${API}/${baseId}/${enc}?${params.toString()}`);
    for (const r of (data.records || [])) {
      const v = r.fields && r.fields[fieldName];
      if (v != null && String(v).trim()) vals.add(String(v).trim().toLowerCase());
    }
    offset = data.offset;
  } while (offset && vals.size < max);
  return vals;
}

// Push keywords into ONE column of a table — one row per keyword, that field only.
// De-dupes (case-insensitive) against keywords already in the column so we never
// create duplicate rows. Returns { pushed, skipped }.
// `extras` (optional) = { keyword: { fieldName: value } } extra cells per row —
// e.g. an "Internal Links" column so new articles ship with relevant links.
export async function pushKeywords(pat, baseId, table, fieldName, keywords, { extras = null } = {}) {
  const field = fieldName || 'Keyword';
  const clean = [...new Set((keywords || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!clean.length) return { pushed: 0, skipped: 0 };
  let existing = new Set();
  try { existing = await listFieldValues(pat, baseId, table, field); } catch (e) { /* if read fails, push anyway */ }
  const fresh = clean.filter((k) => !existing.has(k.toLowerCase()));
  if (!fresh.length) return { pushed: 0, skipped: clean.length };
  const rows = fresh.map((k) => Object.assign({ [field]: k }, (extras && extras[k]) || {}));
  const pushed = await createRecords(pat, baseId, table, rows);
  const withExtras = extras ? fresh.filter((k) => extras[k]).length : 0;
  return { pushed, skipped: clean.length - fresh.length, withExtras };
}

// ── field schemas for auto-created tables ──────────────────────────────────
export const SCHEMAS = {
  gaps: [
    { name: 'Keyword', type: 'singleLineText' },
    { name: 'Volume', type: 'number', options: { precision: 0 } },
    { name: 'Competitor Position', type: 'number', options: { precision: 0 } },
    { name: 'CPC', type: 'number', options: { precision: 2 } },
    { name: 'Competitor URL', type: 'singleLineText' },
    { name: 'Source', type: 'singleLineText' },
    { name: 'Synced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
  ],
  content: [
    { name: 'Title', type: 'singleLineText' },
    { name: 'Target Keyword', type: 'singleLineText' },
    { name: 'Format', type: 'singleLineText' },
    { name: 'Cluster', type: 'singleLineText' },
    { name: 'Rationale', type: 'multilineText' },
    { name: 'Synced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
  ],
  geo: [
    { name: 'Prompt', type: 'multilineText' },
    { name: 'Intent', type: 'singleLineText' },
    { name: 'Cited', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Mentioned', type: 'checkbox', options: { icon: 'check', color: 'yellowBright' } },
    { name: 'AI Cited Domains', type: 'multilineText' },
    { name: 'Synced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
  ],
  // Content opportunities = the content backlog a writer works from.
  opportunities: [
    { name: 'Title', type: 'singleLineText' },
    { name: 'Primary Keyword', type: 'singleLineText' },
    { name: 'Cluster', type: 'singleLineText' },
    { name: 'Intent', type: 'singleLineText' },
    { name: 'Format', type: 'singleLineText' },
    { name: 'Total Volume', type: 'number', options: { precision: 0 } },
    { name: 'Keywords', type: 'number', options: { precision: 0 } },
    { name: 'Trend %', type: 'number', options: { precision: 0 } },
    { name: 'Gap', type: 'checkbox', options: { icon: 'check', color: 'redBright' } },
    { name: 'Trending', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'From Competitor', type: 'checkbox', options: { icon: 'check', color: 'yellowBright' } },
    { name: 'Priority', type: 'number', options: { precision: 1 } },
    { name: 'Covering URL', type: 'singleLineText' },
    { name: 'Keyword List', type: 'multilineText' },
    { name: 'Brief', type: 'multilineText' },
    { name: 'Sources', type: 'multilineText' },
    { name: 'Status', type: 'singleLineText' },
    { name: 'Synced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
  ],
};

// ── row mappers: source data → Airtable field objects ──────────────────────
export function mapGaps(gaps, source, now) {
  return (gaps || []).map((g) => ({
    Keyword: g.keyword, Volume: g.volume || 0, 'Competitor Position': g.competitorPos || 0,
    CPC: g.cpc || 0, 'Competitor URL': g.url || '', Source: source || 'SEMrush', 'Synced At': now,
  }));
}
export function mapContent(suggestions, now) {
  return (suggestions || []).map((s) => ({
    Title: s.title, 'Target Keyword': s.targetKeyword || '', Format: s.format || '',
    Cluster: s.cluster || '', Rationale: s.rationale || '', 'Synced At': now,
  }));
}
export function mapGeo(results, now) {
  return (results || []).filter((r) => !r.error).map((r) => ({
    Prompt: r.prompt, Intent: r.intent || '', Cited: !!r.targetCited, Mentioned: !!r.brandMentioned,
    'AI Cited Domains': (r.citedDomains || []).join(', '), 'Synced At': now,
  }));
}
export function mapOpportunities(clusters, now) {
  return (clusters || []).map((c) => ({
    Title: c.suggestedTitle || c.label, 'Primary Keyword': c.primaryKeyword || '', Cluster: c.label || '',
    Intent: c.intent || '', Format: c.format || '', 'Total Volume': c.totalVolume || 0,
    Keywords: c.keywordCount || 0, 'Trend %': c.avgTrend || 0, Gap: !!c.isGap, Trending: !!c.trending,
    'From Competitor': !!c.fromCompetitor, Priority: c.score || 0, 'Covering URL': c.coveringUrl || '',
    'Keyword List': (c.keywords || []).map((k) => `${k.keyword} (${k.volume})`).join('\n'),
    Brief: briefToText(c.brief), Sources: (c.briefSources || []).map((s) => s.url).join('\n'),
    Status: 'To Do', 'Synced At': now,
  }));
}
// Flatten a structured brief object into readable text for Airtable.
function briefToText(b) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  const lines = [];
  if (b.angle) lines.push('ANGLE: ' + b.angle);
  if (b.metaDescription) lines.push('META: ' + b.metaDescription);
  if (Array.isArray(b.outline)) { lines.push('\nOUTLINE:'); b.outline.forEach((o) => { lines.push('• ' + (o.h2 || '')); (o.points || []).forEach((p) => lines.push('   - ' + p)); }); }
  if (Array.isArray(b.keyFacts) && b.keyFacts.length) { lines.push('\nKEY FACTS:'); b.keyFacts.forEach((f) => lines.push(`• ${f.fact} [${f.source}]`)); }
  if (Array.isArray(b.faqs) && b.faqs.length) { lines.push('\nFAQ:'); b.faqs.forEach((f) => lines.push(`Q: ${f.q}\nA: ${f.a}`)); }
  if (b.wordCount) lines.push('\nTarget length: ~' + b.wordCount + ' words');
  return lines.join('\n');
}

export default { listBases, listTables, ensureTable, ensureField, createRecords, listRecords, updateRecord, createRecord, listFieldValues, pushKeywords, SCHEMAS, mapGaps, mapContent, mapGeo, mapOpportunities };
