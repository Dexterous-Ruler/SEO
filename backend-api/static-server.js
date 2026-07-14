// Minimal static file server for the web/ console (no deps).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dirname, '..', 'web');
const PORT = Number(process.env.WEB_PORT || 5173);
// Dev server: bind to loopback by default so it isn't reachable from the LAN.
// Opt into all-interfaces only with WEB_BIND_ALL=true (or an explicit WEB_HOST).
const HOST = process.env.WEB_HOST || (process.env.WEB_BIND_ALL === 'true' ? '0.0.0.0' : '127.0.0.1');

const MIME = {
  '.html': 'text/html', '.jsx': 'text/babel', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';
  try {
    // Containment: normalize resolves any ../ segments, then confirm the result
    // stays inside WEB (anchored with sep so a sibling like web-x can't pass the
    // prefix check). Blocks path-traversal reads outside the web root.
    const file = normalize(join(WEB, path));
    if (file !== WEB && !file.startsWith(WEB + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, HOST, () => console.log(`Console on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
