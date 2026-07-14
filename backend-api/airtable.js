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
export async function listRecords(pat, baseId, table, { pageSize = 50, offset, fields, filterByFormula } = {}) {
  const enc = encodeURIComponent(table);
  const params = new URLSearchParams({ pageSize: String(Math.min(pageSize, 100)) });
  if (offset) params.set('offset', offset);
  if (filterByFormula) params.set('filterByFormula', filterByFormula);
  (fields || []).forEach((f) => params.append('fields[]', f));
  const data = await at(pat, `${API}/${baseId}/${enc}?${params.toString()}`);
  return { records: (data.records || []).map((r) => ({ id: r.id, createdTime: r.createdTime || null, fields: r.fields || {} })), offset: data.offset || null };
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
  return { id: r.id, createdTime: r.createdTime || null, fields: r.fields || {} };
}

// Airtable table IDs look like `tbl` + 14 alphanumerics (e.g. tblVTpv8JG5lZRiF2).
// Config columns (e.g. table_gaps) store an ID, not a display name.
const TABLE_ID_RE = /^tbl[A-Za-z0-9]{14}$/;

// Ensure a table exists with the given fields; create it if missing. Returns table.
// Requires the PAT to have schema.bases:write scope. If it lacks that scope, the
// caller should pre-create tables and pass their names.
// `tableName` may be a display NAME or a table ID: the sync 'gaps' fallback passes
// cfg.table_gaps (an ID). Match on id OR name so a configured ID resolves to the
// intended table instead of missing and creating a junk table named after the ID.
export async function ensureTable(pat, baseId, tableName, fields) {
  const key = String(tableName == null ? '' : tableName).trim();
  const tables = await listTables(pat, baseId).catch(() => []);
  const found = tables.find((t) => t.id === key || t.name.toLowerCase() === key.toLowerCase());
  if (found) return found;
  // We were handed a table ID that no longer resolves to any table in the base
  // (stale/deleted config). Do NOT create a junk table literally named after the
  // ID — surface the stale config so rows don't silently land in the wrong place.
  if (TABLE_ID_RE.test(key)) {
    throw new Error(`Airtable: configured table "${key}" no longer exists in this base`);
  }
  const data = await at(pat, `${META}/bases/${baseId}/tables`, {
    method: 'POST',
    body: { name: key, fields },
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

// Push link-building PROSPECTS into an "Outreach" table so n8n can send +
// sequence (mirrors pushKeywords → the article loop). Auto-creates the table if
// the PAT has schema-write; de-dupes by Domain. Returns { pushed, skipped }.
export async function pushProspects(pat, baseId, table, prospects) {
  const tbl = table || 'Outreach';
  const clean = (prospects || []).filter((p) => p && p.domain);
  if (!clean.length) return { pushed: 0, skipped: 0 };
  await ensureTable(pat, baseId, tbl, [
    { name: 'Domain', type: 'singleLineText' },
    { name: 'Contact Email', type: 'email' },
    { name: 'Contact Page', type: 'url' },
    { name: 'Rank', type: 'number', options: { precision: 0 } },
    { name: 'Competitors Linked', type: 'number', options: { precision: 0 } },
    { name: 'Link Value Score', type: 'number', options: { precision: 0 } },
    { name: 'Tactic', type: 'singleLineText' },
    { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'To review' }, { name: 'Send Outreach' }, { name: 'Sent' }, { name: 'Follow-up 1' }, { name: 'Follow-up 2' }, { name: 'Replied' }, { name: 'Won' }, { name: 'Skip' }] } },
    { name: 'Subject', type: 'singleLineText' },
    { name: 'Email', type: 'multilineText' },
    { name: 'Sent At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
    { name: 'Replied', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Won', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Won URL', type: 'url' },
  ]).catch(() => {});
  let existing = new Set();
  try { existing = await listFieldValues(pat, baseId, tbl, 'Domain'); } catch (e) {}
  const fresh = clean.filter((p) => !existing.has(String(p.domain).trim().toLowerCase()));
  if (!fresh.length) return { pushed: 0, skipped: clean.length };
  const rows = fresh.map((p) => {
    const f = { Domain: p.domain, Tactic: p.tactic || 'competitor_gap', Status: 'To review' };
    if (p.rank != null) f.Rank = p.rank;
    if (p.competitorsLinked != null) f['Competitors Linked'] = p.competitorsLinked;
    if (p.lvs != null) f['Link Value Score'] = p.lvs;
    if (p.contactEmail) f['Contact Email'] = p.contactEmail;
    if (p.contactPage) f['Contact Page'] = p.contactPage;
    if (p.subject) f.Subject = p.subject;
    if (p.body || p.email) f.Email = p.body || p.email;
    return f;
  });
  const pushed = await createRecords(pat, baseId, tbl, rows);
  return { pushed, skipped: clean.length - fresh.length };
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
  // Competitor share-of-voice (the GEO scan's SECOND result set) — its own table.
  geo_competitors: [
    { name: 'Domain', type: 'singleLineText' },
    { name: 'Is You', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Citations', type: 'number', options: { precision: 0 } },
    { name: 'Share %', type: 'number', options: { precision: 0 } },
    { name: 'Scanned At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
  ],
  // GEO "show up for these" — uncited buyer-intent queries to target next.
  geo_opportunities: [
    { name: 'Query', type: 'multilineText' },
    { name: 'Intent', type: 'singleLineText' },
    { name: 'AI Currently Cites', type: 'multilineText' },
    { name: 'Surfaced At', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
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
// Competitor share-of-voice rows (your own domain first, then competitors). Each
// scan is a timestamped snapshot so the table becomes a share-of-voice trend.
export function mapCompetitors(competitors, target, now) {
  const rows = [];
  if (target && target.domain) rows.push({ Domain: target.domain, 'Is You': true, Citations: Number(target.cited) || 0, 'Share %': Number(target.share) || 0, 'Scanned At': now });
  for (const c of (competitors || [])) {
    if (c && c.domain) rows.push({ Domain: c.domain, 'Is You': false, Citations: Number(c.cited) || 0, 'Share %': Number(c.share) || 0, 'Scanned At': now });
  }
  return rows;
}
// GEO opportunities = uncited prompts from a scan (the "show up for these" list).
export function mapGeoOpportunities(opps, now) {
  return (opps || []).filter((r) => r && r.prompt && !r.error).map((r) => ({
    Query: r.prompt, Intent: r.intent || '',
    'AI Currently Cites': (r.citedDomains || []).join(', '), 'Surfaced At': now,
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
// Map a dashboard content brief (+ its source cluster) into ONE row for the
// EXISTING "Article Writer" table — the table the n8n article workflow watches.
// This is Karim's ask: push the full plan (not a bare keyword) into the one
// existing flow so generation has the dashboard's context. We populate the
// content fields only; the workflow-control Status is left for the user to flip
// to "Write Article" (the existing trigger) so a button click never auto-fires
// generation/publish. `briefField` = the long-text column for the full plan
// ('Content Brief' if it exists/was created, else folded into Description).
// `fieldSet` (optional) = Set of field names that exist on the target table;
// when given, the row is filtered to known fields so a differing per-site schema
// can never cause an UNKNOWN_FIELD_NAME error.
export function mapArticleBrief(cluster, brief, briefField, fieldSet) {
  const c = cluster || {};
  const b = (brief && typeof brief === 'object') ? brief : {};
  const title = b.title || c.suggestedTitle || c.label || c.primaryKeyword || c.keyword || '';
  const keyword = c.primaryKeyword || c.keyword || b.title || title;
  if (!title && !keyword) return null;
  // Prefer the full generated brief; otherwise fall back to the cluster's own
  // detail (keywords, cluster, intent, format, volume — the "content opportunity"
  // data) so Content Brief is never empty and the writer always gets context.
  let planText = briefToText(b);
  if (!planText) planText = clusterBriefText(c);
  const row = {
    Title: title,
    Keyword: keyword,
    'Primary Keyword': c.primaryKeyword || keyword,
    Category: 'Blog',  // drives the n8n Category switch (Blog branch); user can change
  };
  if (b.angle) row['Goal of Article'] = b.angle;
  if (b.metaDescription) row.Description = b.metaDescription;
  if (planText) {
    if (briefField && briefField !== 'Description') row[briefField] = planText;
    else row.Description = (row.Description ? row.Description + '\n\n' : '') + planText;
  }
  if (fieldSet && fieldSet.size) {
    for (const k of Object.keys(row)) if (!fieldSet.has(k)) delete row[k];
  }
  return Object.keys(row).length ? row : null;
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
// Build a Content Brief from a keyword cluster when no full brief was generated —
// captures the same detail the old "Content Opportunities" table held (cluster,
// format, intent, volume, the keyword list, gap/coverage) so the writer has real
// context to target, not just a title.
function clusterBriefText(c) {
  if (!c || typeof c !== 'object') return '';
  const lines = [];
  const meta = [];
  if (c.label) meta.push('Cluster: ' + c.label);
  if (c.primaryKeyword) meta.push('Primary keyword: ' + c.primaryKeyword);
  if (c.format) meta.push('Format: ' + c.format);
  if (c.intent) meta.push('Intent: ' + c.intent);
  if (c.totalVolume) meta.push('~' + Number(c.totalVolume).toLocaleString() + ' searches/mo');
  if (meta.length) lines.push(meta.join(' · '));
  const kws = Array.isArray(c.keywords) ? c.keywords : [];
  if (kws.length) {
    lines.push('\nTARGET KEYWORDS (cover these):');
    kws.forEach((k) => {
      if (k && typeof k === 'object') lines.push('• ' + (k.keyword || '') + (k.volume != null ? ' (' + Number(k.volume).toLocaleString() + ')' : '') + (k.position != null ? ' — currently #' + Math.round(k.position) : ''));
      else if (k) lines.push('• ' + k);
    });
  }
  if (c.isGap) lines.push('\n(Content gap — no page covers this yet.)');
  else if (c.coveringUrl) lines.push('\n(Currently covered by ' + c.coveringUrl + ' — expand/refresh rather than duplicate.)');
  return lines.join('\n').trim();
}

export default { listBases, listTables, ensureTable, ensureField, createRecords, listRecords, updateRecord, createRecord, listFieldValues, pushKeywords, SCHEMAS, mapGaps, mapContent, mapGeo, mapCompetitors, mapGeoOpportunities, mapOpportunities, mapArticleBrief };
