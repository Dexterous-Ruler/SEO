// Pure-logic units for the scoring / dedupe / metric functions the dashboard relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, dedupeKey, dedupeMerge } from '../backend-api/content-engine.js';
import { snapshotUnusable } from '../backend-api/drift.js';
import { calibrateCurve } from '../backend-api/traffic-value.js';

test('tokens: drops stopwords, punctuation and short tokens', () => {
  const t = tokens('The Wonderful Elephant Journey!!');
  assert.ok(t.includes('wonderful') && t.includes('elephant') && t.includes('journey'));
  assert.ok(!t.includes('the'), 'stopword dropped');
  assert.ok(!t.includes(''), 'no empty tokens');
});

test('dedupeKey: order-independent (same tokens → same key)', () => {
  assert.equal(dedupeKey('SEO Audit Checklist'), dedupeKey('checklist  audit  seo'));
  assert.notEqual(dedupeKey('seo audit'), dedupeKey('ppc audit'));
});

test('dedupeMerge: merges duplicates, keeps zero-token titles, always sets dedupeKey', () => {
  const out = dedupeMerge([
    { title: 'What is it?', source: 'a' },        // tokenizes to ~nothing → fallback key
    { title: 'SEO audit checklist', source: 'b' },
    { title: 'SEO audit checklist', source: 'c' }, // dup → merges into one
  ]);
  for (const o of out) assert.ok(o.dedupeKey && String(o.dedupeKey).length, 'each survivor has a dedupeKey (so persist keeps it)');
  assert.equal(out.filter((o) => o.title === 'SEO audit checklist').length, 1, 'duplicates merged');
  assert.ok(out.some((o) => /what is it/i.test(o.title || '')), 'zero-token opp was NOT dropped');
});

test('snapshotUnusable: flags failed / non-2xx captures, passes real ones', () => {
  assert.equal(snapshotUnusable(null), true);
  assert.equal(snapshotUnusable({ error: 'boom' }), true);
  assert.equal(snapshotUnusable({}), true);            // no status
  assert.equal(snapshotUnusable({ status: 403 }), true); // bot-wall
  assert.equal(snapshotUnusable({ status: 500 }), true);
  assert.equal(snapshotUnusable({ status: 200, title: 'x' }), false);
});

test('calibrateCurve: source reflects the curve actually returned', () => {
  assert.equal(calibrateCurve([]).source, 'default');
  const rows4 = [1, 2, 3, 4].map((pos) => ({ position: pos, impressions: 500, ctr: 0.3 / pos }));
  assert.equal(calibrateCurve(rows4).source, 'site-calibrated');
  const rows2 = [1, 2].map((pos) => ({ position: pos, impressions: 500, ctr: 0.3 / pos }));
  assert.equal(calibrateCurve(rows2).source, 'partial');
});
