// The frontend must compile. build.mjs exits non-zero on any JSX/syntax error, so this
// catches broken frontend edits before they can deploy.
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

test('web/build.mjs compiles the frontend', () => {
  execFileSync('node', ['web/build.mjs'], { stdio: 'pipe' }); // throws (fails the test) on non-zero exit
});
