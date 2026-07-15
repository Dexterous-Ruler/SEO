// Contract: every endpoint the frontend calls must exist as a backend route.
// This is the exact check that would have caught a whole class of "button does
// nothing" bugs — a frontend engine("/x") with no 'METHOD /x' route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every frontend engine() endpoint has a backend route', () => {
  const api = readFileSync('web/api.jsx', 'utf8');
  const server = readFileSync('backend-api/server.js', 'utf8');
  const endpoints = [...new Set([...api.matchAll(/engine\("([^"]+)"/g)].map((m) => m[1]))];
  const routes = new Set([...server.matchAll(/'(?:GET|POST|PUT|DELETE|PATCH) ([^']+)'/g)].map((m) => m[1]));
  const missing = endpoints.filter((e) => !routes.has(e));
  assert.deepEqual(missing, [], `frontend calls with no backend route: ${missing.join(', ')}`);
});

test('the production frontend bundle list is complete (build.mjs FILES)', () => {
  const build = readFileSync('web/build.mjs', 'utf8');
  const m = build.match(/const FILES = \[([^\]]+)\]/);
  assert.ok(m, 'build.mjs declares FILES');
  const files = m[1].match(/'[^']+'/g).map((s) => s.replace(/'/g, ''));
  // the app entry + core modules must be bundled
  for (const req of ['soft-dashboard.jsx', 'api.jsx', 'data.jsx', 'helpers.jsx']) {
    assert.ok(files.includes(req), `${req} must be in the built bundle`);
  }
});
