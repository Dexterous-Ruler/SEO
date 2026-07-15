// The critical fix: /apply-meta resolves the target post from the page URL (proposals
// don't carry a post_id). Lock resolvePostByUrl's URL→post resolution + the
// verify-after-write status logic against a mocked WordPress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WordPressClient } from '../src/wp/client.js';

function client(handlers) {
  const c = new WordPressClient({ baseUrl: 'https://ex.com', username: 'u', appPassword: 'p' });
  Object.assign(c, handlers);
  return c;
}

test('resolvePostByUrl: slug → {id,type}', async () => {
  const c = client({
    async request(path) {
      if (/\/pages\?slug=my-page/.test(path)) return [{ id: 12 }];
      if (/\/posts\?slug=/.test(path)) return [];
      return [];
    },
  });
  assert.deepEqual(await c.resolvePostByUrl('https://ex.com/my-page/'), { id: 12, type: 'pages' });
});

test('resolvePostByUrl: falls through pages → posts', async () => {
  const c = client({
    async request(path) {
      if (/\/pages\?slug=/.test(path)) return [];
      if (/\/posts\?slug=hello/.test(path)) return [{ id: 77 }];
      return [];
    },
  });
  assert.deepEqual(await c.resolvePostByUrl('https://ex.com/blog/hello/'), { id: 77, type: 'posts' });
});

test('resolvePostByUrl: homepage → page_on_front', async () => {
  const c = client({
    async request(path) { return /settings/.test(path) ? { page_on_front: 5 } : []; },
  });
  assert.deepEqual(await c.resolvePostByUrl('https://ex.com/'), { id: 5, type: 'pages' });
});

test('updateMetaVerified: "verified" only when the write actually sticks', async () => {
  const meta = {};
  const ok = client({
    async update(type, id, body) { Object.assign(meta, body.meta); return { ok: true }; }, // write really lands
    async getMeta() { return { ...meta }; },
  });
  const r = await ok.updateMetaVerified('posts', 1, 'rank_math_title', 'New', { force: true });
  assert.equal(r.status, 'verified');
});

test('updateMetaVerified: THROWS on a silent write failure (read-back mismatch)', async () => {
  const bad = client({
    async update() { return { ok: true }; },                 // returns OK but doesn't persist
    async getMeta() { return { rank_math_title: 'OLD' }; },
  });
  await assert.rejects(
    () => bad.updateMetaVerified('posts', 1, 'rank_math_title', 'New', { force: true }),
    /silent-failure/,
  );
});
