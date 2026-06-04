import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

// Approval gate. Collects all *.proposals.json from reports/, presents them,
// and writes an approved.json once a human has signed off. The `apply` phase
// only ever acts on approved.json.

export function collectProposals() {
  const dir = config.paths.reports;
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.proposals.json'));
  const all = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const [i, p] of (data.proposals || []).entries()) {
        all.push({ id: `${f.replace('.proposals.json', '')}#${i}`, source: f, ...p });
      }
    } catch (e) {
      log.warn(`could not parse ${f}: ${e.message}`);
    }
  }
  return all;
}

// Build an approval worksheet (Markdown) the human edits: set `approve: true`
// in the companion JSON, or check boxes here, then run `apply`.
export function writeApprovalWorksheet() {
  const proposals = collectProposals();
  const dir = config.paths.reports;
  const lines = ['# Approval Worksheet', '', `_Generated: ${new Date().toISOString()}_`, ''];
  lines.push(`Total proposed changes: **${proposals.length}**`);
  lines.push('');
  lines.push('Review each item. To approve, set `"approved": true` for its id in `approved.json`,');
  lines.push('or run `node src/cli.js approve --all` to approve everything, then `node src/cli.js apply`.');
  lines.push('');
  const byPhase = {};
  for (const p of proposals) (byPhase[p.phase] ||= []).push(p);
  for (const [phase, items] of Object.entries(byPhase)) {
    lines.push(`## ${phase} (${items.length})`);
    lines.push('');
    for (const p of items) {
      lines.push(`- [ ] \`${p.id}\` — **${p.title}**${p.detail ? ` — ${p.detail}` : ''}`);
    }
    lines.push('');
  }
  const wsPath = join(dir, 'APPROVAL.md');
  writeFileSync(wsPath, lines.join('\n'), 'utf8');

  // Companion machine file: defaults all to not-approved.
  const approvals = proposals.map((p) => ({ id: p.id, phase: p.phase, title: p.title, approved: false }));
  const apPath = join(dir, 'approved.json');
  if (!existsSync(apPath)) {
    writeFileSync(apPath, JSON.stringify({ generated: new Date().toISOString(), approvals }, null, 2));
  }
  return { wsPath, apPath, count: proposals.length };
}

export function approveAll() {
  const dir = config.paths.reports;
  const proposals = collectProposals();
  const approvals = proposals.map((p) => ({ id: p.id, phase: p.phase, title: p.title, approved: true }));
  const apPath = join(dir, 'approved.json');
  writeFileSync(apPath, JSON.stringify({ generated: new Date().toISOString(), approvals }, null, 2));
  return apPath;
}

export function getApproved() {
  const apPath = join(config.paths.reports, 'approved.json');
  if (!existsSync(apPath)) return [];
  const data = JSON.parse(readFileSync(apPath, 'utf8'));
  return (data.approvals || []).filter((a) => a.approved);
}

export default { collectProposals, writeApprovalWorksheet, approveAll, getApproved };
