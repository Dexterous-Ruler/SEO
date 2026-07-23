// ===========================================================================
// Image / large-file optimization for the live site — scans the WordPress media
// library, finds heavy raster images (JPEG/PNG), and converts them to WebP with
// sharp (typically 60-80% smaller) to lift LCP / Performance scores.
//
// SAFETY: "scan" + "preview" are read-only. Actual upload is DRY_RUN-gated and
// only happens on an explicit apply (user click = the approval). Re-uploads add
// WebP versions to the media library; reference-swapping in page content is a
// separate step (risky on Elementor) and left manual for now.
// Runs sequentially with size/count caps so it's safe on a small instance.
// ===========================================================================
import sharp from 'sharp';
import { WordPressClient } from '../src/wp/client.js';
import { credsForSite } from './supabase.js';

// MEMORY SAFETY (small/nano instances): libvips will otherwise cache buffers and
// run parallel workers, and a single 30+ megapixel JPEG can decode to hundreds of
// MB — enough to OOM-kill the container. Disable the cache, force one worker, and
// (below) shrink-on-load + cap dimensions so peak memory stays small.
sharp.cache(false);
sharp.concurrency(1);
const MAX_DIM = 2560;            // plenty for web; caps the decoded bitmap
const MAX_INPUT_PIXELS = 60_000_000; // refuse absurd images instead of crashing

async function download(url) {
  // Bounded like every other outbound fetch — a slow image on a CDN-fronted host must
  // not hang the whole optimize loop past the request cap.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('download ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(timer); }
}
const kb = (b) => Math.round(b / 1024);

// Fetch ALL raster images across the media library (paginated), not just the
// first 100 — a big library hid most heavy images behind page 1.
async function fetchImages(wp, maxPages = 15) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const items = await wp.request(`/media?per_page=100&page=${p}&media_type=image&_fields=id,source_url,mime_type,media_details,title`).catch(() => []);
    if (!Array.isArray(items) || !items.length) break;
    for (const m of items) {
      if (!/image\/(jpe?g|png)/i.test(m.mime_type || '')) continue;
      const md = m.media_details || {};
      const filesize = Number(md.filesize || 0);
      const w = md.width, h = md.height;
      // WordPress frequently omits media_details.filesize for the full-size original
      // (depends on WP version / whether image metadata was regenerated). Without a
      // fallback the item gets sizeKB=0 and is silently dropped by the minKB filter,
      // so genuinely heavy images are missed. Estimate size from dimensions instead
      // (~0.5 bytes/pixel is a conservative floor for typical web JPEG/PNG) and flag
      // it as estimated. Actual conversion later uses the real downloaded bytes, so
      // a rough estimate only affects whether the image is CONSIDERED, never savings.
      const estimated = !filesize && !!(w && h);
      const bytes = filesize || (estimated ? Math.round(w * h * 0.5) : 0);
      out.push({
        id: m.id, url: m.source_url, mime: m.mime_type,
        sizeKB: kb(bytes),
        sizeEstimated: estimated || undefined,
        w, h,
        title: (m.title?.rendered || '').replace(/<[^>]+>/g, ''),
      });
    }
    if (items.length < 100) break;
  }
  return out;
}

// WebP files already in the media library. Returns:
//   byStem  — base stems (no size variant) → true, for the "already converted?" check
//   byExact — exact filename-without-.webp → url, so we can RE-LINK the original to
//             its existing WebP (the converted file lives in a different folder, so
//             the page only serves it if the original→webp map points at it).
async function existingWebp(wp, pages = 8) {
  const byStem = new Set();
  const byExact = new Map();
  for (let p = 1; p <= pages; p++) {
    const items = await wp.request(`/media?per_page=100&page=${p}&media_type=image&_fields=source_url,mime_type`).catch(() => []);
    if (!Array.isArray(items) || !items.length) break;
    for (const m of items) {
      if (!/image\/webp/i.test(m.mime_type || '')) continue;
      const fn = (m.source_url || '').split('/').pop() || '';
      const exact = fn.replace(/\.webp$/i, '').toLowerCase();
      if (exact && !byExact.has(exact)) byExact.set(exact, m.source_url);
      // Strip WxH size variant AND WordPress's collision suffix (X.webp → X-18.webp
      // when the name already exists). Without the -N strip, a re-scan never matches
      // a Sentinel-uploaded WebP back to its original → it re-converts forever and
      // piles up duplicates. -\d{1,3} avoids eating long numeric IDs / years.
      const base = fn.replace(/(-\d+x\d+)?(-\d{1,3})?\.webp$/i, '').toLowerCase();
      if (base) { byStem.add(base); if (!byExact.has(base)) byExact.set(base, m.source_url); }
    }
    if (items.length < 100) break;
  }
  return { byStem, byExact };
}
const stemOf = (url) => (url.split('/').pop() || '').replace(/\.(jpe?g|png)$/i, '').toLowerCase();

// Scan: list heavy raster images + the savings opportunity (read-only).
// Each heavy image is tagged `alreadyWebp` (a WebP sibling exists) so converted
// ones visibly drop off on re-scan instead of re-appearing. `heavyCount` is the
// ACTIONABLE count (still needing conversion); `alreadyCount` are done.
export async function scanMedia(siteId, { minKB = 80, limit = 200 } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  const all = await fetchImages(wp);
  const ex = await existingWebp(wp).catch(() => ({ byStem: new Set(), byExact: new Map() }));
  const heavy = all.filter((i) => i.sizeKB >= minKB).sort((a, b) => b.sizeKB - a.sizeKB)
    .map((i) => { const st = stemOf(i.url); return { ...i, alreadyWebp: ex.byExact.has(st) || ex.byStem.has(st) }; });
  const needing = heavy.filter((i) => !i.alreadyWebp);
  // Exclude dimension-ESTIMATED sizes from the headline total/savings figure so it isn't
  // inflated by rough guesses; estimated images still appear in the actionable list.
  const totalKB = needing.reduce((s, i) => s + (i.sizeEstimated ? 0 : i.sizeKB), 0);
  return {
    totalImages: all.length,
    heavyCount: needing.length,                 // still needing conversion (actionable)
    alreadyCount: heavy.length - needing.length, // already have WebP
    totalHeavyKB: totalKB, estSavingKB: Math.round(totalKB * 0.65),
    images: heavy.slice(0, limit),              // includes done ones (flagged) so UI shows progress
  };
}

// Optimize: compress to WebP. apply=false → preview savings (no write);
// apply=true → upload WebP to the media library (force-bypasses DRY_RUN since
// the click is the explicit approval). Capped + sequential for safety.
export async function optimizeImages(siteId, { ids = null, quality = 80, max = 10, apply = false, skipExisting = false, minKB = 80, onProgress = null } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  let targets = await fetchImages(wp);
  if (ids && ids.length) targets = targets.filter((i) => ids.includes(i.id));
  // Only HEAVY images (>= minKB) — same threshold scanMedia counts, so the UI's
  // "Optimize all (N)" processes exactly N (no overshoot past the heavy count).
  else targets = targets.filter((i) => i.sizeKB >= minKB);
  // Heaviest first across the WHOLE library.
  targets.sort((a, b) => b.sizeKB - a.sizeKB);
  // CRITICAL: filter out already-converted FIRST, then take the heaviest `max`
  // of what REMAINS — so successive runs march through the full backlog instead
  // of forever re-considering the same top-8 (the old slice-before-filter bug).
  const relinkMap = {};
  let needing = targets;
  if (skipExisting) {
    const ex = await existingWebp(wp).catch(() => ({ byStem: new Set(), byExact: new Map() }));
    needing = [];
    for (const i of targets) {
      const st = stemOf(i.url);
      const webpUrl = ex.byExact.get(st);
      if (webpUrl || ex.byStem.has(st)) { if (webpUrl) relinkMap[i.url] = webpUrl; }  // already converted → re-link
      else needing.push(i);
    }
  }
  const batchMax = Math.min(max, 20);                          // per-request safety cap (memory/timeout)
  const toProcess = needing.slice(0, batchMax);
  const remaining = Math.max(0, needing.length - toProcess.length); // still queued for the next batch
  const relinked = Object.keys(relinkMap).length;
  if (!toProcess.length && !relinked) return apply ? { applied: true, processed: 0, uploaded: 0, relinked: 0, remaining: 0, failed: 0, errors: [], savedKB: 0, results: [], note: 'nothing to optimize' } : { error: 'No images need converting — every heavy image already has a WebP.' };

  const results = [];
  let _done = 0;
  for (const img of toProcess) {
    if (typeof onProgress === 'function') { try { onProgress({ done: _done, total: toProcess.length }); } catch (e) {} }
    _done++;
    try {
      const buf = await download(img.url);
      if (buf.length > 12 * 1024 * 1024) { results.push({ id: img.id, url: img.url, skip: 'too large (>12MB)' }); continue; }
      // shrink-on-load + cap dimensions so even a 30MP image never blows up RAM.
      const out = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'none' })
        .rotate()
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer();
      const savedKB = kb(buf.length) - kb(out.length);
      const filename = (img.url.split('/').pop() || 'image').replace(/\.(jpe?g|png)$/i, '.webp');
      const row = { id: img.id, filename, fromKB: kb(buf.length), toKB: kb(out.length), savedKB, pct: Math.round((1 - out.length / buf.length) * 100) };
      if (apply) {
        const up = await wp.uploadMedia(out, filename, 'image/webp', { force: true });
        row.uploaded = !(up && up.dryRun); row.newId = up?.id; row.newUrl = up?.source_url;
        if (row.uploaded && row.newUrl) row.origUrl = img.url;   // for the WebP map
      } else { row.preview = true; }
      results.push(row);
    } catch (e) { results.push({ id: img.id, url: img.url, error: String(e.message || e) }); }
  }
  // Tell the seo-agent-optimize mu-plugin which original URL → which WebP, so it
  // can rewrite live pages (the WebP is a separate media item, not a sibling file).
  let mapped = 0;
  if (apply) {
    const map = { ...relinkMap };                         // re-link already-converted originals…
    for (const r of results) if (r.uploaded && r.origUrl && r.newUrl) map[r.origUrl] = r.newUrl;  // …plus the new ones
    mapped = Object.keys(map).length;
    if (mapped) {
      try { await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/webp-map`, { method: 'POST', body: { map } }); } catch (e) { /* plugin may be absent */ }
    }
  }
  const savedKB = results.reduce((s, r) => s + (r.savedKB || 0), 0);
  const uploaded = results.filter((r) => r.uploaded).length;
  const failed = results.filter((r) => r.error || r.skip).length;
  const errors = results.filter((r) => r.error).map((r) => r.error).slice(0, 3);
  const note = (!uploaded && relinked) ? `${relinked} image(s) already converted — re-linked their WebP so pages now serve them (needs the optimize plugin installed).` : undefined;
  return { applied: !!apply, processed: results.length, uploaded, relinked, mapped, remaining, failed, errors, savedKB, results, note };
}

// Optimize only the images USED ON a specific page (content-decay "refresh &
// optimise" flow). Fetches the page, extracts uploads images (incl. srcset +
// CSS backgrounds), matches them to media items (size-variant tolerant), and
// converts the heavy ones to WebP. Best-effort; never throws into the caller.
export async function optimizePageImages(siteId, pageUrl, { apply = false, max = 12 } = {}) {
  const baseStem = (u) => (String(u).split('/').pop() || '').replace(/(-\d+x\d+)?\.(jpe?g|png)(\?.*)?$/i, '').toLowerCase();
  let html = '';
  try { const r = await fetch(pageUrl, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } }); html = await r.text(); }
  catch (e) { return { error: 'Could not fetch the page to find its images.' }; }
  const wanted = new Set();
  let m;
  const reAttr = /(?:src|data-src|srcset|data-srcset)=["']([^"']+)["']/gi;
  while ((m = reAttr.exec(html))) { for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (/\.(jpe?g|png)(\?|$)/i.test(u)) wanted.add(baseStem(u)); } }
  const reBg = /url\((['"]?)([^'")]+\.(?:jpe?g|png)(?:\?[^'")]*)?)\1\)/gi;
  while ((m = reBg.exec(html))) { wanted.add(baseStem(m[2])); }
  if (!wanted.size) return apply ? { applied: true, processed: 0, uploaded: 0, savedKB: 0, results: [], note: 'no raster images on the page' } : { error: 'No raster images found on this page.' };

  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  const all = await fetchImages(wp);
  const ids = all.filter((i) => wanted.has(baseStem(i.url))).map((i) => i.id);
  if (!ids.length) return apply ? { applied: true, processed: 0, uploaded: 0, savedKB: 0, results: [], note: 'page images not found in the media library' } : { error: 'This page’s images aren’t in the WordPress media library.' };
  return optimizeImages(siteId, { ids, apply, max, skipExisting: apply });
}

// Clean up duplicate WebP media items (same image uploaded multiple times as
// X.webp, X-1.webp … X-18.webp on filename collisions). Keeps ONE per image
// (the shortest/cleanest name), deletes the rest, then rebuilds the original→WebP
// map so pages keep serving the surviving copy. apply=false is a DRY RUN.
export async function cleanupDuplicateWebp(siteId, { apply = false } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  const baseOf = (url) => (String(url).split('/').pop() || '').replace(/(-\d+x\d+)?(-\d{1,3})?\.webp$/i, '').toLowerCase();
  // Gather every WebP media item (paginated).
  const webps = [];
  for (let p = 1; p <= 40; p++) {
    const items = await wp.request(`/media?per_page=100&page=${p}&media_type=image&_fields=id,source_url,mime_type,date`).catch(() => []);
    if (!Array.isArray(items) || !items.length) break;
    for (const m of items) if (/image\/webp/i.test(m.mime_type || '')) webps.push({ id: m.id, url: m.source_url, date: m.date || '' });
    if (items.length < 100) break;
  }
  const groups = {};
  for (const w of webps) { const b = baseOf(w.url); (groups[b] = groups[b] || []).push(w); }
  const toDelete = []; const keepByBase = {};
  let groupsWithDupes = 0;
  for (const [b, arr] of Object.entries(groups)) {
    arr.sort((a, c) => (a.url.length - c.url.length) || (new Date(a.date) - new Date(c.date))); // cleanest/oldest first
    keepByBase[b] = arr[0];
    if (arr.length > 1) { groupsWithDupes++; for (const w of arr.slice(1)) toDelete.push(w); }
  }
  if (!apply) return { dryRun: true, totalWebp: webps.length, uniqueImages: Object.keys(groups).length, groupsWithDupes, wouldDelete: toDelete.length, sample: toDelete.slice(0, 6).map((w) => w.url.split('/').pop()) };

  let deleted = 0, failed = 0;
  for (const w of toDelete) {
    try { await wp.request(`/media/${w.id}?force=true`, { method: 'DELETE' }); deleted++; } catch (e) { failed++; }
  }
  // Rebuild the original→surviving-WebP map so live pages keep serving WebP.
  const originals = await fetchImages(wp);
  const map = {};
  for (const o of originals) { const keep = keepByBase[stemOf(o.url)]; if (keep) map[o.url] = keep.url; }
  if (Object.keys(map).length) {
    try { await wp.request(`${wp.baseUrl}/wp-json/seoagent/v1/webp-map`, { method: 'POST', body: { map, reset: true } }); } catch (e) {}
  }
  return { applied: true, totalWebp: webps.length, groupsWithDupes, deleted, failed, remapped: Object.keys(map).length };
}

export default { scanMedia, optimizeImages, optimizePageImages, cleanupDuplicateWebp };
