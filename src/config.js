import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

function bool(v, dflt = false) {
  if (v === undefined || v === '') return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function loadSites() {
  const p = join(ROOT, 'config', 'sites.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse config/sites.json: ${e.message}`);
  }
}

const sites = loadSites();

export const config = {
  wp: {
    baseUrl: (process.env.WP_BASE_URL || '').replace(/\/$/, ''),
    username: process.env.WP_USERNAME || '',
    appPassword: process.env.WP_APP_PASSWORD || '',
    stagingUrl: (process.env.WP_STAGING_URL || '').replace(/\/$/, ''),
  },
  lighthouse: {
    formFactor: (process.env.LH_FORM_FACTOR || 'both').toLowerCase(),
    chromePath: process.env.CHROME_PATH || undefined,
  },
  images: {
    webpQuality: Number(process.env.IMG_WEBP_QUALITY || 80),
    emitAvif: bool(process.env.IMG_EMIT_AVIF, false),
  },
  dryRun: bool(process.env.DRY_RUN, true),
  psiKey: process.env.PSI_KEY || '',
  site: sites,
  paths: {
    root: ROOT,
    reports: join(ROOT, 'reports'),
    cache: join(ROOT, '.cache'),
    tmp: join(ROOT, 'tmp'),
    data: join(ROOT, '.data'),
  },
};

// The URL we actively target for WRITES (staging if set, else base)
export function writeTarget() {
  return config.wp.stagingUrl || config.wp.baseUrl;
}

// Validate the minimum required config for a given operation.
export function assertWpConfigured() {
  const missing = [];
  if (!config.wp.baseUrl) missing.push('WP_BASE_URL');
  if (!config.wp.username) missing.push('WP_USERNAME');
  if (!config.wp.appPassword) missing.push('WP_APP_PASSWORD');
  if (missing.length) {
    throw new Error(
      `Missing WordPress config: ${missing.join(', ')}. ` +
      `Copy .env.example to .env and fill these in.`
    );
  }
}

export default config;
