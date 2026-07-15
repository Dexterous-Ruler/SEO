// Structured-data builders must produce valid JSON-LD with no dangling @id references
// (the schema-gen finding) and a breadcrumb rooted at the ORIGIN, not the page URL
// (the final-audit regression).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localSchemaForSite, schemaForAnswerBlock } from '../backend-api/schema-gen.js';

// A node used only as { "@id": "..." } is a reference; it must resolve to a node that
// defines that @id somewhere in the graph.
function danglingRefs(graph) {
  const defined = new Set(graph.map((n) => n && n['@id']).filter(Boolean));
  const refs = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (v['@id'] && Object.keys(v).length === 1) refs.add(v['@id']);
      else Object.entries(v).forEach(([k, val]) => { if (k !== '@id') walk(val); });
    }
  };
  graph.forEach((n) => Object.entries(n || {}).forEach(([k, val]) => { if (k !== '@id') walk(val); }));
  return [...refs].filter((r) => !defined.has(r));
}

test('localSchemaForSite: valid, no dangling @id, breadcrumb rooted at origin', () => {
  const r = localSchemaForSite({ url: 'https://ex.com/services/deep/page', siteName: 'Ex', geoContext: 'About Ex. We help.' });
  const graph = r.graph['@graph'];
  assert.deepEqual(danglingRefs(graph), [], 'no dangling @id refs');
  const json = JSON.stringify(graph);
  assert.ok(json.includes('https://ex.com'), 'references the origin');
  assert.ok(!json.includes('ex.com/services/deep/page/services'), 'no doubled path from using page URL as base');
});

test('schemaForAnswerBlock: valid, no dangling @id', () => {
  const r = schemaForAnswerBlock(
    'https://ex.com/faq/q',
    { heading: 'How to X?', answer: 'Do Y.', points: ['a', 'b'] },
    { org: { name: 'Ex' }, baseUrl: 'https://ex.com', siteName: 'Ex' },
  );
  const graph = (r && r.graph && r.graph['@graph']) || (r && r['@graph']) || [];
  assert.ok(graph.length > 0, 'produced a graph');
  assert.deepEqual(danglingRefs(graph), [], 'no dangling @id refs');
});
