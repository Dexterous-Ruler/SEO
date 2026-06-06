// One-shot Koyeb deploy via API. Reads secrets from .env in-process (never logs
// them), creates/updates the "sentinel" app + service from the public GitHub
// repo using the Dockerfile, and polls until healthy. Run:
//   KOYEB_TOKEN=... node deploy-koyeb.mjs
import { config } from 'dotenv';
config({ override: true });

const TOKEN = process.env.KOYEB_TOKEN;
if (!TOKEN) { console.error('KOYEB_TOKEN missing'); process.exit(1); }
const API = 'https://app.koyeb.com/v1';
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

async function k(path, method = 'GET', body) {
  const res = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

// Env vars the running server needs (values pulled from local .env; only the
// KEY NAMES are printed, never values).
const WANT = ['ANTHROPIC_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE','SITE_SECRET_KEY','PSI_KEY','DATAFORSEO_LOGIN','DATAFORSEO_PASSWORD','PERPLEXITY_API_KEY','TAVILY_API_KEY','CLAUDE_MODEL'];
const REGION = process.env.KOYEB_REGION || 'was';
const env = [];
for (const key of WANT) { if (process.env[key]) env.push({ key, value: process.env[key] }); }
env.push({ key: 'DRY_RUN', value: process.env.DRY_RUN || 'true' });
console.log('env vars to set:', env.map((e) => e.key).join(', '), `(${env.length} total)`);

// 1) token check via /apps (which the token can read) + 2) app reuse
let appId;
const apps = await k('/apps?limit=100');
if (!apps.ok) { console.error('TOKEN/APPS FAILED', apps.status, JSON.stringify(apps.json).slice(0, 300)); process.exit(1); }
console.log('✓ token valid ·', (apps.json?.apps || []).length, 'existing app(s)');
const existing = (apps.json?.apps || []).find((a) => a.name === 'sentinel');
if (existing) { appId = existing.id; console.log('✓ reusing app sentinel', appId); }
else {
  const c = await k('/apps', 'POST', { name: 'sentinel' });
  if (!c.ok) { console.error('APP CREATE FAILED', c.status, JSON.stringify(c.json).slice(0, 400)); process.exit(1); }
  appId = c.json.app.id; console.log('✓ created app sentinel', appId);
}

// 3) service definition (git → Dockerfile build)
const definition = {
  name: 'sentinel',
  type: 'WEB',
  git: {
    repository: 'github.com/Dexterous-Ruler/SEO',
    branch: 'main',
    no_deploy_on_push: false,
    docker: { dockerfile: 'Dockerfile' },
  },
  regions: [REGION],
  instance_types: [{ type: 'nano' }],
  scalings: [{ min: 1, max: 1 }],   // always-on (no scale-to-zero cold starts)
  ports: [{ port: 8000, protocol: 'http' }],
  routes: [{ port: 8000, path: '/' }],
  env,
  health_checks: [{ grace_period: 30, interval: 30, restart_limit: 3, timeout: 8, http: { port: 8000, path: '/health' } }],
};

// reuse service if present (update), else create
const svcs = await k(`/services?app_id=${appId}&limit=100`);
const svc = (svcs.json?.services || []).find((s) => s.name === 'sentinel');
let serviceId, resp;
if (svc) {
  serviceId = svc.id;
  resp = await k(`/services/${serviceId}`, 'PUT', { definition });
  console.log(resp.ok ? '✓ updated service' : '✗ service update', resp.status);
} else {
  resp = await k('/services', 'POST', { app_id: appId, definition });
  console.log(resp.ok ? '✓ created service' : '✗ service create', resp.status);
  serviceId = resp.json?.service?.id;
}
if (!resp.ok) { console.error('SERVICE FAILED:', JSON.stringify(resp.json).slice(0, 800)); process.exit(1); }
console.log('service id:', serviceId);
console.log('\nDeployment triggered. Building the Docker image on Koyeb now (~2-4 min).');
console.log('Watch: https://app.koyeb.com/  → app "sentinel".');
console.log('Public URL will be: https://sentinel-<org>.koyeb.app  (and /health once live)');
