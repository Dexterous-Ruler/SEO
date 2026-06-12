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
  const r = await fetch(url, { headers: { 'User-Agent': 'wp-seo-agent/2.0' } });
  if (!r.ok) throw new Error('download ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const kb = (b) => Math.round(b / 1024);

async function fetchImages(wp, perPage = 100) {
  // Media REST uses status "inherit"; media_type=image filters to images.
  const items = await wp.request(`/media?per_page=${perPage}&media_type=image&_fields=id,source_url,mime_type,media_details,title`).catch(() => []);
  return (Array.isArray(items) ? items : [])
    .filter((m) => /image\/(jpe?g|png)/i.test(m.mime_type || ''))
    .map((m) => ({
      id: m.id, url: m.source_url, mime: m.mime_type,
      sizeKB: kb(m.media_details?.filesize || 0),
      w: m.media_details?.width, h: m.media_details?.height,
      title: (m.title?.rendered || '').replace(/<[^>]+>/g, ''),
    }));
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
      const base = fn.replace(/(-\d+x\d+)?\.webp$/i, '').toLowerCase();  // strip WxH size variant
      if (base) byStem.add(base);
    }
    if (items.length < 100) break;
  }
  return { byStem, byExact };
}
const stemOf = (url) => (url.split('/').pop() || '').replace(/\.(jpe?g|png)$/i, '').toLowerCase();

// Scan: list heavy raster images + the savings opportunity (read-only).
export async function scanMedia(siteId, { minKB = 80, limit = 60 } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  const all = await fetchImages(wp);
  const heavy = all.filter((i) => i.sizeKB >= minKB).sort((a, b) => b.sizeKB - a.sizeKB);
  const totalKB = heavy.reduce((s, i) => s + i.sizeKB, 0);
  return {
    totalImages: all.length, heavyCount: heavy.length,
    totalHeavyKB: totalKB, estSavingKB: Math.round(totalKB * 0.65),
    images: heavy.slice(0, limit),
  };
}

// Optimize: compress to WebP. apply=false → preview savings (no write);
// apply=true → upload WebP to the media library (force-bypasses DRY_RUN since
// the click is the explicit approval). Capped + sequential for safety.
export async function optimizeImages(siteId, { ids = null, quality = 80, max = 8, apply = false, skipExisting = false } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  let targets = await fetchImages(wp);
  if (ids && ids.length) targets = targets.filter((i) => ids.includes(i.id));
  // Work on the heaviest first.
  const work = targets.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, Math.min(max, 20));
  // Split into "needs converting" vs "already has WebP". The already-converted ones
  // get RE-LINKED (original→existing WebP) so the live page actually serves them —
  // a re-run is no longer a no-op.
  const relinkMap = {};
  let toProcess = work;
  if (skipExisting) {
    const ex = await existingWebp(wp).catch(() => ({ byStem: new Set(), byExact: new Map() }));
    toProcess = [];
    for (const i of work) {
      const st = stemOf(i.url);
      const webpUrl = ex.byExact.get(st);
      if (webpUrl || ex.byStem.has(st)) { if (webpUrl) relinkMap[i.url] = webpUrl; }
      else toProcess.push(i);
    }
  }
  const relinked = Object.keys(relinkMap).length;
  if (!toProcess.length && !relinked) return apply ? { applied: true, processed: 0, uploaded: 0, relinked: 0, failed: 0, errors: [], savedKB: 0, results: [], note: 'nothing to optimize' } : { error: 'No matching images to optimize.' };

  const results = [];
  for (const img of toProcess) {
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
  return { applied: !!apply, processed: results.length, uploaded, relinked, mapped, failed, errors, savedKB, results, note };
}

export default { scanMedia, optimizeImages };
