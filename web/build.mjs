// ===========================================================================
// Production build for the web console. The app ships "no-build" for local dev
// (in-browser Babel + React dev), which is slow in production: ~3MB of Babel
// Standalone plus client-side JSX transform of ~400KB on every page load.
//
// This precompiles each script (JSX → plain JS), minifies whitespace/syntax
// (NOT identifiers — top-level names are shared globals across files), gzips
// them, and emits a production index.html that loads React's PRODUCTION build
// and the compiled .js directly — no Babel, no client-side transform.
//
// Output → web/dist/. The server serves web/dist when present, else web/ (dev).
//   node web/build.mjs
// ===========================================================================
import esbuild from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = dirname(fileURLToPath(import.meta.url));
const DIST = join(WEB, 'dist');

// Load order matters — these run as global-scope scripts that reference each other.
const FILES = ['config.jsx', 'api.jsx', 'helpers.jsx', 'data.jsx', 'soft-ui.jsx', 'soft-screens-a.jsx', 'soft-screens-b.jsx', 'soft-dashboard.jsx'];

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

let totalIn = 0, totalOut = 0;
for (const f of FILES) {
  const src = await readFile(join(WEB, f), 'utf8');
  const res = await esbuild.transform(src, {
    loader: 'jsx',
    jsx: 'transform',           // classic React.createElement (React is a global)
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,   // keep top-level names — they're shared across files
    target: 'es2019',
    charset: 'utf8',
    legalComments: 'none',
  });
  const name = f.replace(/\.jsx$/, '.js');
  const buf = Buffer.from(res.code, 'utf8');
  await writeFile(join(DIST, name), buf);
  await writeFile(join(DIST, name + '.gz'), gzipSync(buf, { level: 9 }));
  totalIn += src.length; totalOut += buf.length;
  console.log(`  ${f.padEnd(22)} ${(src.length / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB js, ${(gzipSync(buf).length / 1024).toFixed(0)}KB gz`);
}

// Production index.html: swap Babel + React-dev + text/babel scripts for React
// production + the precompiled .js. Keep the entire <head> (styles/fonts/katex).
let html = await readFile(join(WEB, 'index.html'), 'utf8');
const prodScripts = [
  '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>',
  '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>',
  ...FILES.map((f) => `<script src="${f.replace(/\.jsx$/, '.js')}"></script>`),
].join('\n');
html = html.replace(/<script src="https:\/\/unpkg\.com\/react@[\s\S]*?soft-dashboard\.jsx"><\/script>/, prodScripts);
if (html.includes('babel')) throw new Error('build: failed to strip Babel from index.html — script block did not match');
await writeFile(join(DIST, 'index.html'), html);
await writeFile(join(DIST, 'index.html.gz'), gzipSync(Buffer.from(html, 'utf8'), { level: 9 }));

// Copy runtime-referenced static assets (screenshots etc.) if present.
if (existsSync(join(WEB, 'screenshots'))) await cp(join(WEB, 'screenshots'), join(DIST, 'screenshots'), { recursive: true });

console.log(`build ✓  ${(totalIn / 1024).toFixed(0)}KB JSX → ${(totalOut / 1024).toFixed(0)}KB minified JS (gzipped on disk). Babel removed; React production.`);
