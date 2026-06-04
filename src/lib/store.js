import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

// Dependency-free append-only history store (JSON Lines).
// Chosen over SQLite deliberately: no native build step = nothing to break on
// Windows/CI. Each line is one immutable event. We derive current state by
// folding the log. Handles 1,498-page history comfortably.
//
// Two logs:
//   audits.jsonl  — every Lighthouse/PSI run  {url, date, source, scores, cwv}
//   writes.jsonl  — every meta write          {ts, postId, field, old, new, status, id}
// The write log is the rollback ledger.

function dir() {
  const d = join(config.paths.root, '.data');
  mkdirSync(d, { recursive: true });
  return d;
}

function append(file, obj) {
  appendFileSync(join(dir(), file), JSON.stringify(obj) + '\n', 'utf8');
}

function readAll(file) {
  const p = join(dir(), file);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ── Audit history ──────────────────────────────────────────────────────
export function recordAudit({ url, source = 'lighthouse', scores, cwv, ts }) {
  append('audits.jsonl', { url, source, scores, cwv, ts: ts || isoNow() });
}

export function auditHistory(url) {
  return readAll('audits.jsonl').filter((a) => !url || a.url === url);
}

// Latest scores per URL (fold the log, last write wins).
export function latestScores() {
  const map = new Map();
  for (const a of readAll('audits.jsonl')) map.set(a.url, a);
  return [...map.values()];
}

// Detect regressions: any category that dropped vs the previous run for a URL.
export function regressions(url) {
  const hist = auditHistory(url).filter((a) => a.scores);
  if (hist.length < 2) return [];
  const prev = hist[hist.length - 2].scores;
  const curr = hist[hist.length - 1].scores;
  const out = [];
  for (const k of ['performance', 'accessibility', 'bestPractices', 'seo']) {
    if (prev[k] != null && curr[k] != null && curr[k] < prev[k]) {
      out.push({ url, category: k, from: prev[k], to: curr[k] });
    }
  }
  return out;
}

// ── Write ledger (rollback) ────────────────────────────────────────────
export function recordWrite({ postId, objectType = 'post', field, oldValue, newValue, status, phase }) {
  const id = `w_${Date.now().toString(36)}_${Math.round(performance.now()).toString(36)}`;
  const entry = { id, ts: isoNow(), postId, objectType, field, oldValue, newValue, status, phase };
  append('writes.jsonl', entry);
  return id;
}

export function writeLedger({ status } = {}) {
  const all = readAll('writes.jsonl');
  return status ? all.filter((w) => w.status === status) : all;
}

export function findWrite(id) {
  return readAll('writes.jsonl').find((w) => w.id === id) || null;
}

// isoNow avoids Date.now()-style nondeterminism concerns at call sites by
// centralizing it; safe in normal runtime (only workflow scripts forbid Date).
function isoNow() {
  return new Date().toISOString();
}

export default {
  recordAudit, auditHistory, latestScores, regressions,
  recordWrite, writeLedger, findWrite,
};
