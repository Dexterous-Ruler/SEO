// ===========================================================================
// Link Engine — Phase 1 (read-only intelligence) + outreach drafting.
// Orchestrates the DataForSEO Backlinks API into:
//   • profile()   — the site's backlink-authority overview + anchor health
//   • linkGap()   — Competitor Link Gap (flagship): domains linking to rivals
//                   but not to you, scored by a deterministic Link Value Score
//   • draftOutreach() — a Claude-written, personalised pitch for one prospect
// Acquisition (the actual send) stays a human-approved action via Airtable+n8n.
// ===========================================================================
import { db } from './supabase.js';
import * as dfs from './dataforseo.js';
import * as claude from './claude.js';
import * as airtable from './airtable.js';
import * as email from './email.js';

const cleanDom = (d) => String(d || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JUNK_EMAIL = /(sentry|wixpress|example\.|\.png|\.jpg|\.gif|@2x|wordpress\.com|godaddy|cloudflare|yourdomain|domain\.com|@sentry|placeholder|@email\.com)/i;

// Link Value Score (deterministic; Claude only labels elsewhere). 0–100.
//   authority  = referring-domain rank / 1000
//   reach      = how many of your competitors it links to (normalised)
//   spamPen    = penalty for high spam score
// Prospects below a quality floor are auto-rejected (rejected:true).
export function linkValueScore({ rank = 0, competitorsLinked = 1, totalCompetitors = 1, spamScore = 0 }) {
  const authority = Math.max(0, Math.min(1, (rank || 0) / 1000));
  const reach = Math.max(0, Math.min(1, competitorsLinked / Math.max(1, totalCompetitors)));
  const spamPen = spamScore > 40 ? 0.2 : spamScore > 25 ? 0.5 : spamScore > 12 ? 0.8 : 1;
  const score = Math.round((authority * 0.62 + reach * 0.38) * 100 * spamPen);
  const rejected = (rank || 0) < 40 || (spamScore || 0) > 55;
  return { score, rejected, authority: Math.round(authority * 100), reach: Math.round(reach * 100), spamPen };
}

// The site's backlink profile + a simple anchor over-optimisation flag.
export async function profile(siteId) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  const summary = await dfs.backlinksSummary(site.url);
  if (!summary) return { error: 'No backlink data returned for ' + site.url + '.' };
  let anchors = [];
  try { anchors = await dfs.backlinkAnchors(site.url, { limit: 25 }); } catch (e) {}
  // exact-match / branded mix → over-optimisation signal
  const totalAnchorRD = anchors.reduce((s, a) => s + (a.referringDomains || 0), 0) || 1;
  const topAnchor = anchors[0];
  const overOptimised = topAnchor && (topAnchor.referringDomains / totalAnchorRD) > 0.4 && !/^https?:|^www\.|\.(com|co\.uk|org)/i.test(topAnchor.anchor || '');
  return {
    domain: summary.target, summary,
    anchors: anchors.slice(0, 12),
    anchorHealth: { overOptimised: !!overOptimised, topAnchor: topAnchor ? topAnchor.anchor : null, topShare: topAnchor ? Math.round((topAnchor.referringDomains / totalAnchorRD) * 100) : null },
  };
}

// Competitor Link Gap → scored, ranked prospects.
export async function linkGap(siteId, { limit = 80 } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  const competitors = (site.competitors || []).filter(Boolean);
  if (!competitors.length) return { error: 'Add competitors first (DataForSEO → Gap tab) — the link gap needs rivals to compare against.', prospects: [], needsCompetitors: true };
  const rows = await dfs.domainIntersection(site.url, competitors, { limit });
  const scored = rows.map((r) => {
    const lvs = linkValueScore({ rank: r.rank, competitorsLinked: r.competitorsLinked, totalCompetitors: competitors.length, spamScore: r.spamScore });
    return { ...r, lvs: lvs.score, rejected: lvs.rejected, authority: lvs.authority };
  }).sort((a, b) => b.lvs - a.lvs);
  const prospects = scored.filter((p) => !p.rejected);
  return {
    domain: dfs && site.url, competitors,
    total: rows.length, qualified: prospects.length,
    rejected: scored.length - prospects.length,
    prospects: prospects.slice(0, 60),
  };
}

// Draft a personalised outreach email for one prospect (Claude). Returns {subject, body}.
export async function draftOutreach(siteId, { prospectDomain, tactic = 'competitor_gap', targetPage = '' } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'No site.' };
  if (!prospectDomain) return { error: 'A prospect domain is required.' };
  return claude.outreachEmail({
    siteName: site.name, siteUrl: site.url, niche: site.niche || '',
    prospectDomain, tactic, targetPage, siteId,
  });
}

// ── Phase 2: assisted outreach ─────────────────────────────────────────────

// Contact enrichment: scrape a prospect's homepage + contact/about pages for a
// real contact email + contact page. Free (no API), best-effort.
export async function enrichContact(domain) {
  const dom = cleanDom(domain);
  if (!dom) return { error: 'No domain.' };
  const base = 'https://' + dom;
  const paths = ['', '/contact', '/contact-us', '/about', '/about-us'];
  const emails = new Set();
  let contactPage = null;
  for (const p of paths) {
    try {
      const r = await fetch(base + p, { headers: { 'User-Agent': 'SentinelSEO/1.0 (+outreach research)' }, redirect: 'follow' });
      if (!r.ok) continue;
      const html = await r.text();
      let any = false;
      for (const m of (html.match(EMAIL_RE) || [])) {
        const e = m.toLowerCase();
        if (!JUNK_EMAIL.test(e) && e.length < 60) { emails.add(e); any = true; }
      }
      if (p.includes('contact') && (any || /contact/i.test(html))) contactPage = base + p;
    } catch (e) {}
  }
  // Prefer an on-domain email (e.g. editor@dom) over generic webmail.
  const list = [...emails].sort((a, b) => (a.endsWith('@' + dom) ? -1 : 0) - (b.endsWith('@' + dom) ? -1 : 0));
  return { domain: dom, email: list[0] || null, emails: list.slice(0, 5), contactPage: contactPage || (base + '/contact') };
}

// Prepare a campaign for a batch of prospects: enrich contact + draft email for
// each (Claude). Returns enriched rows ready to review then push to Airtable.
export async function prepareOutreach(siteId, { prospects = [], tactic = 'competitor_gap', targetPage = '' } = {}) {
  const out = [];
  for (const p of prospects.slice(0, 12)) {
    const contact = await enrichContact(p.domain).catch(() => ({}));
    let draft = {};
    try { draft = await draftOutreach(siteId, { prospectDomain: p.domain, tactic, targetPage }); } catch (e) {}
    out.push({ ...p, tactic, contactEmail: contact.email || null, contactPage: contact.contactPage || null, subject: draft.subject || '', body: draft.body || '' });
  }
  return { prepared: out.length, prospects: out };
}

// Outreach tracker: read the Airtable "Outreach" table back and compute the
// campaign pipeline + ROI (reply rate, links won, cost-per-link).
export async function outreachStatus(siteId, { costPerHour = 0 } = {}) {
  const pat = await db.getAirtablePat(siteId).catch(() => null);
  if (!pat) return { error: 'Connect Airtable first.' };
  const cfg = await db.getAirtableConfig(siteId).catch(() => null);
  if (!cfg || !cfg.base_id) return { error: 'Set the Airtable base first.' };
  let records = [];
  let offset = null;
  try {
    for (let i = 0; i < 5; i++) {
      const r = await airtable.listRecords(pat, cfg.base_id, 'Outreach', { pageSize: 100, offset });
      records = records.concat(r.records || []);
      offset = r.offset; if (!offset) break;
    }
  } catch (e) { return { error: 'Could not read the Outreach table — create it (push some prospects first), or check the base. ' + e.message, prospects: [] }; }
  const norm = (s) => String(s || '').toLowerCase();
  const rows = records.map((r) => ({ id: r.id, fields: r.fields || {} }));
  const total = rows.length;
  const isSent = (f) => f['Sent At'] || /sent|replied|won|follow/i.test(norm(f.Status));
  const isReplied = (f) => f.Replied === true || /replied|won/i.test(norm(f.Status));
  const isWon = (f) => f.Won === true || /won/i.test(norm(f.Status)) || !!f['Won URL'];
  const sent = rows.filter((r) => isSent(r.fields)).length;
  const replied = rows.filter((r) => isReplied(r.fields)).length;
  const won = rows.filter((r) => isWon(r.fields)).length;
  return {
    total, sent, replied, won,
    replyRate: sent ? Math.round((replied / sent) * 100) : 0,
    winRate: sent ? Math.round((won / sent) * 100) : 0,
    prospects: rows.map((r) => ({
      domain: r.fields.Domain, status: r.fields.Status || 'To review',
      lvs: r.fields['Link Value Score'] ?? null, contact: r.fields['Contact Email'] || null,
      replied: isReplied(r.fields), won: isWon(r.fields), wonUrl: r.fields['Won URL'] || null,
    })).filter((p) => p.domain),
  };
}

// ── Phase 3: monitoring + disavow ──────────────────────────────────────────

// Toxic threshold (DataForSEO backlink_spam_score, 0–100). Above this a domain
// is a disavow candidate; Google auto-ignores most low-quality links, so this
// is FLAG-ONLY and human-approved (disavowing good links can harm rankings).
const TOXIC_SPAM = 30;
const DISAVOW_SPAM = 45;

// New / lost / toxic referring domains in the last `windowDays`. Derived from a
// single referring-domains pull (status 'all' carries first_seen + lost_date),
// so no snapshot table is needed.
export async function monitor(siteId, { windowDays = 30 } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  let items = [];
  try { items = await dfs.referringDomains(site.url, { limit: 400, status: 'all', orderBy: 'first_seen,desc' }); }
  catch (e) { return { error: e.code === 'NO_UNITS' ? 'DataForSEO balance exhausted.' : e.message, noUnits: e.code === 'NO_UNITS' }; }
  const cutoff = Date.now() - windowDays * 86400000;
  const ts = (d) => { const t = d ? Date.parse(d) : NaN; return isNaN(t) ? 0 : t; };
  const isNew = (d) => !d.isLost && ts(d.firstSeen) >= cutoff;
  const isRecentLost = (d) => d.isLost && ts(d.lostDate) >= cutoff;
  const fresh = items.filter(isNew).sort((a, b) => (b.rank || 0) - (a.rank || 0));
  const lost = items.filter(isRecentLost).sort((a, b) => (b.rank || 0) - (a.rank || 0));
  const toxic = items.filter((d) => !d.isLost && (d.spamScore || 0) >= TOXIC_SPAM).sort((a, b) => (b.spamScore || 0) - (a.spamScore || 0));
  return {
    windowDays, domain: site.url,
    newCount: fresh.length, lostCount: lost.length, toxicCount: toxic.length,
    // lost high-authority links are reclamation prospects
    lostHighValue: lost.filter((d) => (d.rank || 0) >= 100).length,
    new: fresh.slice(0, 40), lost: lost.slice(0, 40), toxic: toxic.slice(0, 40),
  };
}

// Assemble a Google disavow-file DRAFT from the most toxic referring domains.
// Flag-only: returns the file text + the flagged list; the human downloads it and
// submits in Search Console (rarely necessary — included for completeness).
export async function disavowDraft(siteId) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site || !site.url) return { error: 'No site / URL.' };
  let items = [];
  try { items = await dfs.referringDomains(site.url, { limit: 400, status: 'live', orderBy: 'backlink_spam_score,desc' }); }
  catch (e) { return { error: e.code === 'NO_UNITS' ? 'DataForSEO balance exhausted.' : e.message, noUnits: e.code === 'NO_UNITS' }; }
  const flagged = items.filter((d) => (d.spamScore || 0) >= DISAVOW_SPAM).sort((a, b) => (b.spamScore || 0) - (a.spamScore || 0));
  const lines = [
    '# Disavow draft — Sentinel Link Engine',
    '# Review every line before submitting. Google auto-ignores most spam links,',
    '# so disavowing is rarely needed and can HARM rankings if you remove good links.',
    `# Site: ${cleanDom(site.url)} · threshold: spam score >= ${DISAVOW_SPAM}`,
    '',
    ...flagged.map((d) => `domain:${cleanDom(d.domain)}`),
  ];
  return { count: flagged.length, threshold: DISAVOW_SPAM, file: lines.join('\n'), flagged: flagged.slice(0, 60) };
}

// ── Outreach SENDING (replaces n8n) — Resend, per-site mode, daily cap ───────
const FOLLOWUP_DAYS = 3;
// Send due outreach for a site. mode='manual' sends only rows the user set to
// "Send Outreach"; mode='auto' also auto-approves "To review" rows. Always sends
// follow-ups for un-replied "Sent" rows older than FOLLOWUP_DAYS. Respects a
// daily cap (counted from Airtable's "Sent At" so it's correct across restarts).
export async function sendOutreach(siteId, { trigger = 'scheduler' } = {}) {
  const site = await db.getSite(siteId).catch(() => null);
  if (!site) return { error: 'No site.' };
  if (!email.emailConfigured()) return { error: 'Email isn’t configured — set RESEND_API_KEY and OUTREACH_FROM (a verified sender).', needsEmail: true };
  const mode = site.outreach_mode || 'manual';
  const cap = site.outreach_daily_cap || 10;
  const pat = await db.getAirtablePat(siteId).catch(() => null);
  if (!pat) return { error: 'Connect Airtable first.' };
  const cfg = await db.getAirtableConfig(siteId).catch(() => null);
  if (!cfg || !cfg.base_id) return { error: 'Set the Airtable base first.' };
  let records = [], offset = null;
  try { for (let i = 0; i < 6; i++) { const r = await airtable.listRecords(pat, cfg.base_id, 'Outreach', { pageSize: 100, offset }); records = records.concat(r.records || []); offset = r.offset; if (!offset) break; } }
  catch (e) { return { error: 'Could not read the Outreach table — push a campaign first. ' + e.message }; }
  const now = Date.now();
  const sameDay = (d) => { const t = Date.parse(d); return t && new Date(t).toDateString() === new Date(now).toDateString(); };
  const norm = (s) => String(s || '').toLowerCase();
  const sentToday = records.filter((r) => r.fields['Sent At'] && sameDay(r.fields['Sent At'])).length;
  let budget = Math.max(0, cap - sentToday);

  const wantSend = (f) => { const st = norm(f.Status); if (st === 'send outreach') return true; if (mode === 'auto' && (st === 'to review' || st === '')) return true; return false; };
  const dueFollowup = (f) => { if (f.Replied === true || /replied|won/.test(norm(f.Status))) return false; if (norm(f.Status) !== 'sent') return false; const t = Date.parse(f['Sent At'] || ''); return t && (now - t) >= FOLLOWUP_DAYS * 86400000; };

  let sent = 0, followups = 0, skipped = 0, failed = 0;
  for (const r of records) {
    if (budget <= 0) break;
    const f = r.fields || {};
    if (!wantSend(f)) continue;
    const to = f['Contact Email'], text = f.Email || '';
    if (!to || !text) { skipped++; continue; }
    try {
      await email.sendEmail({ to, subject: f.Subject || ('Quick note about ' + (f.Domain || 'your site')), text });
      await airtable.updateRecord(pat, cfg.base_id, 'Outreach', r.id, { Status: 'Sent', 'Sent At': new Date().toISOString() });
      sent++; budget--;
    } catch (e) { if (e.code === 'NO_EMAIL') return { error: e.message, needsEmail: true }; failed++; }
  }
  for (const r of records) {
    if (budget <= 0) break;
    const f = r.fields || {};
    if (!dueFollowup(f)) continue;
    if (!f['Contact Email']) continue;
    try {
      await email.sendEmail({ to: f['Contact Email'], subject: 'Re: ' + (f.Subject || ('about ' + (f.Domain || ''))), text: 'Just following up on my note below — would this be a useful addition for your readers?\n\n' + (f.Email || '') });
      await airtable.updateRecord(pat, cfg.base_id, 'Outreach', r.id, { Status: 'Follow-up 1' });
      followups++; budget--;
    } catch (e) { failed++; }
  }
  if (sent || followups || trigger === 'manual') await db.logActivity({ site_id: siteId, type: (sent || followups) ? 'off-site' : 'automation', actor: trigger === 'manual' ? 'You' : 'Automation', icon: 'link', text: `Outreach (${mode}): ${sent} sent, ${followups} follow-up(s)` + (failed ? `, ${failed} failed` : '') + (skipped ? `, ${skipped} skipped (no email/draft)` : ''), meta: 'Resend' }).catch(() => {});
  return { done: true, mode, sent, followups, skipped, failed, dailyCap: cap, sentToday: sentToday + sent };
}

export default { profile, linkGap, draftOutreach, linkValueScore, enrichContact, prepareOutreach, outreachStatus, monitor, disavowDraft, sendOutreach };
