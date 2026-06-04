// ===========================================================================
// Sentinel Console — one-command launcher.
// Starts the engine API (8787) + the static web console (5173) together.
//   node start-console.js   →  open http://localhost:5173
// ===========================================================================
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(name, file, color) {
  const p = spawn(process.execPath, [join(__dirname, file)], { stdio: 'pipe', env: process.env });
  p.stdout.on('data', (d) => process.stdout.write(`\x1b[${color}m[${name}]\x1b[0m ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`\x1b[${color}m[${name}]\x1b[0m ${d}`));
  p.on('exit', (c) => console.log(`[${name}] exited (${c})`));
  return p;
}

console.log('Starting Sentinel Console…\n');
const engine = run('engine', 'backend-api/server.js', '36');
const web = run('web', 'backend-api/static-server.js', '35');

console.log('\n  Console:  http://localhost:5173');
console.log('  Engine:   http://localhost:8787/health\n');
console.log('  Press Ctrl+C to stop.\n');

const stop = () => { engine.kill(); web.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
