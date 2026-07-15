// The meta-apply field mapping is the heart of the fixed "Apply" loop. If the audit
// side (metaFieldMap) and the chat side (metaKeyFor) ever diverge, an approved fix
// writes the wrong meta key → silent no-op. Lock the contract here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaFieldMap } from '../backend-api/audit-pipeline.js';
import { metaKeyFor } from '../backend-api/chat.js';

test('metaFieldMap: RankMath → native keys, everything else → Sentinel keys', () => {
  const rm = metaFieldMap('Rank Math');
  assert.equal(rm.title, 'rank_math_title');
  assert.equal(rm.meta_description, 'rank_math_description');
  assert.equal(rm.canonical, 'rank_math_canonical_url');
  for (const p of ['Yoast SEO', 'SEOPress', 'AIOSEO', 'none', '', null, undefined]) {
    const m = metaFieldMap(p);
    assert.equal(m.title, '_seoagent_meta_title', `title for ${p}`);
    assert.equal(m.meta_description, '_seoagent_meta_description', `desc for ${p}`);
    assert.equal(m.canonical, '_seoagent_canonical', `canonical for ${p}`);
  }
});

test('metaKeyFor agrees with metaFieldMap for every field × plugin', () => {
  for (const p of ['Rank Math', 'rankmath', 'Yoast SEO', 'SEOPress', 'none', '', null]) {
    const map = metaFieldMap(p);
    for (const field of ['title', 'meta_description', 'canonical']) {
      assert.equal(metaKeyFor(field, p), map[field], `${field} on "${p}"`);
    }
  }
});
