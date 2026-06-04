import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { makeClient } from '../wp/client.js';
import { getApproved } from '../lib/approval.js';
import { log } from '../lib/logger.js';
import * as store from '../lib/store.js';
import * as claude from '../../backend-api/claude.js';

// Fetch a page and pull the context Claude needs to draft title/meta values.
async function pageContext(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').trim()).filter(Boolean).slice(0, 8);
    const excerpt = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
    return { title: title.trim(), headings, excerpt };
  } catch (e) { return { title: '', headings: [], excerpt: '' }; }
}

// Apply phase. Reads approved.json + the proposal source files, then runs the
// right handler per change type. Every write goes through the DRY_RUN-guarded
// WordPress client, so nothing hits the live site unless DRY_RUN=false.

const SOURCE_FILES = {
  images: 'images.proposals.json',
  seo: 'seo.proposals.json',
  'ai-seo': 'ai-seo.proposals.json',
  performance: 'performance.proposals.json',
  accessibility: 'accessibility.proposals.json',
};

function loadProposalsBySource() {
  const dir = config.paths.reports;
  const out = {};
  for (const [name, file] of Object.entries(SOURCE_FILES)) {
    const f = join(dir, file);
    if (existsSync(f)) {
      try {
        out[name] = JSON.parse(readFileSync(f, 'utf8'));
      } catch (e) {
        log.warn(`could not parse ${f}: ${e.message}`);
      }
    }
  }
  return out;
}

// Map an approved id like "images#3" back to its full proposal object.
// The id prefix is the proposal *file* stem (see approval.collectProposals).
function resolveProposal(id, sources) {
  const [src, idxStr] = id.split('#');
  const idx = Number(idxStr);
  if (src === 'images') return sources.images?.proposals?.[idx];
  if (src === 'ai-seo') return sources['ai-seo']?.proposals?.[idx];
  if (src === 'performance') return sources.performance?.proposals?.[idx];
  if (src === 'accessibility') return sources.accessibility?.proposals?.[idx];
  if (src === 'seo') return sources.seo?.proposals?.[idx];
  return null;
}

const handlers = {
  // Upload optimized WebP into the media library; report the new URL.
  async 'image-optimization'(wp, p) {
    if (!p.webp?.localPath || !existsSync(p.webp.localPath)) {
      return { status: 'skip', reason: 'webp asset missing' };
    }
    const buf = readFileSync(p.webp.localPath);
    const filename = p.webp.localPath.split(/[\\/]/).pop();
    const res = await wp.uploadMedia(buf, filename, 'image/webp');
    if (res?.dryRun) return { status: 'dry-run', action: `upload ${filename} (${Math.round(buf.length / 1024)} KB)` };
    return { status: 'done', newUrl: res?.source_url, id: res?.id, note: 'update references to swap in.' };
  },

  // SEO meta → Rank Math's own keys, with verify-after-write.
  // (Requires the seo-agent-meta mu-plugin to register the keys; Rank Math
  //  keeps rendering <head> — we only feed it data, no duplicate tags.)
  async 'seo-audit'(wp, p) {
    if (!p.url) return { status: 'skip', reason: 'no target url' };
    // Auto-generate title/meta values when missing (parity with the web console).
    if (!p.value && (p.field === 'title' || p.field === 'meta_description')) {
      try {
        const ctx = await pageContext(p.url);
        if (p.field === 'meta_description') p.value = await claude.metaDescription({ url: p.url, title: ctx.title, headings: ctx.headings, excerpt: ctx.excerpt });
        else p.value = await claude.titleRewrite({ url: p.url, currentTitle: ctx.title });
        p._generated = true;
      } catch (e) { return { status: 'flag', reason: `could not generate ${p.field}: ${e.message}` }; }
    }
    if (!p.value) return { status: 'flag', reason: `field "${p.field}" has no value yet — needs content (use the seo-audit skill)` };
    const post = await wp.resolvePostByUrl(p.url).catch(() => null);
    if (!post) return { status: 'skip', reason: `could not resolve post for ${p.url}` };

    // Map our proposal fields → real Rank Math meta keys.
    const keyMap = {
      title: 'rank_math_title',
      meta_description: 'rank_math_description',
      canonical: 'rank_math_canonical_url',
      focus_keyword: 'rank_math_focus_keyword',
      robots: 'rank_math_robots',
    };
    const key = keyMap[p.field];
    if (!key) return { status: 'flag', reason: `field "${p.field}" is content/schema — apply via skill, not REST` };

    try {
      const r = await wp.updateMetaVerified(post.type === 'pages' ? 'pages' : 'posts', post.id, key, p.value, { store });
      if (r.status === 'dry-run') return { status: 'dry-run', action: `set ${key} on ${p.url}${p._generated ? ` → "${String(p.value).slice(0, 80)}"` : ''}` };
      return { status: 'done', note: `${key} verified on ${post.type}/${post.id}${p._generated ? ' (AI-generated)' : ''}`, value: p._generated ? p.value : undefined };
    } catch (e) {
      return { status: 'error', reason: e.message };
    }
  },

  // AI-SEO → site-wide settings (llms.txt + Organization schema).
  async 'ai-seo'(wp, p) {
    if (/llms\.txt/i.test(p.title)) {
      const f = join(config.paths.reports, 'llms.txt');
      const content = existsSync(f) ? readFileSync(f, 'utf8') : '';
      const res = await wp.setSetting('seoagent_llms_txt', content);
      return res?.dryRun ? { status: 'dry-run', action: 'publish /llms.txt' } : { status: 'done' };
    }
    if (/organization/i.test(p.title)) {
      const f = join(config.paths.reports, 'organization.schema.json');
      const content = existsSync(f) ? readFileSync(f, 'utf8') : '';
      const res = await wp.setSetting('seoagent_org_schema', content);
      return res?.dryRun ? { status: 'dry-run', action: 'inject Organization schema' } : { status: 'done' };
    }
    return { status: 'flag', reason: 'no handler matched' };
  },

  // Performance/CSS fixes are skill-driven (theme/child-theme edits), not REST writes.
  // Surface them as manual so apply doesn't look broken.
  async 'modern-css'(_wp, p) {
    return { status: 'manual', reason: `apply via child-theme/CSS: ${p.detail || p.title}` };
  },

  // WCAG fixes are applied in markup/CSS/ARIA via the theme — manual/skill-driven.
  async accessibility(_wp, p) {
    return { status: 'manual', reason: `apply via theme/template: ${p.detail || p.title}` };
  },
};

export async function apply() {
  const approved = getApproved();
  if (!approved.length) {
    log.warn('No approved changes. Run `approve` first.');
    return [];
  }
  const wp = makeClient();
  const sources = loadProposalsBySource();

  log.step(`Apply — ${approved.length} approved change(s)`);
  if (config.dryRun) {
    log.warn('DRY_RUN is ON — simulating. Set DRY_RUN=false in .env to write for real.');
  }
  const target = config.wp.stagingUrl || config.wp.baseUrl;
  log.dim(`Target: ${target}${config.wp.stagingUrl ? ' (staging)' : ' (production!)'}`);

  const results = [];
  for (const a of approved) {
    const p = resolveProposal(a.id, sources);
    if (!p) { log.warn(`${a.id}: proposal not found, skipping`); continue; }
    const handler = handlers[a.phase];
    if (!handler) { log.warn(`${a.id}: no handler for phase "${a.phase}"`); continue; }
    try {
      const r = await handler(wp, p);
      results.push({ id: a.id, ...r });
      const tag = r.status === 'done' ? '✓' : r.status === 'dry-run' ? '~' : '!';
      log[r.status === 'done' ? 'ok' : 'info'](`${tag} ${a.id} [${a.phase}] → ${r.status}${r.action ? `: ${r.action}` : ''}${r.reason ? `: ${r.reason}` : ''}`);
    } catch (e) {
      log.err(`${a.id}: ${e.message}`);
      results.push({ id: a.id, status: 'error', error: e.message });
    }
  }
  // Purge caches if any real write landed, so `reverify` reads fresh HTML
  // (not a stale cached page) — mirrors the wp-admin approval flow.
  const wroteSomething = results.some((r) => r.status === 'done');
  if (wroteSomething && !config.dryRun) {
    try {
      const pc = await wp.purgeCache();
      if (pc && pc.ok !== false) log.ok(`Cache purged (${(pc.cleared || []).join(', ') || 'requested'}).`);
      else log.warn(`Cache purge skipped: ${pc && pc.error ? pc.error : 'no cache plugin'}`);
    } catch (e) { log.warn(`Cache purge failed: ${e.message}`); }
  }

  // Persist results so `swap` (image reference rewrite) can read uploaded URLs.
  mkdirSync(config.paths.reports, { recursive: true });
  writeFileSync(
    join(config.paths.reports, 'apply.results.json'),
    JSON.stringify({ generated: new Date().toISOString(), dryRun: config.dryRun, results }, null, 2)
  );

  const n = (s) => results.filter((r) => r.status === s).length;
  log.ok(`Apply complete: ${n('done')} written, ${n('dry-run')} simulated, ${n('manual')} manual (theme/CSS), ${n('skip') + n('flag')} skipped.`);
  if (n('manual')) log.dim('Manual items are performance/accessibility fixes — apply via theme/child-theme (use the modern-css / accessibility skills).');
  if (n('done') && results.some((r) => r.newUrl)) log.dim('Uploaded WebP — run `node src/cli.js swap` to rewrite image references in content.');
  return results;
}

export default { apply };
