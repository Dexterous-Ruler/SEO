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
export async function optimizeImages(siteId, { ids = null, quality = 80, max = 8, apply = false } = {}) {
  const { baseUrl, username, appPassword } = await credsForSite(siteId);
  const wp = new WordPressClient({ baseUrl, username, appPassword });
  let targets = await fetchImages(wp);
  if (ids && ids.length) targets = targets.filter((i) => ids.includes(i.id));
  targets = targets.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, Math.min(max, 20));
  if (!targets.length) return { error: 'No matching images to optimize.' };

  const results = [];
  for (const img of targets) {
    try {
      const buf = await download(img.url);
      if (buf.length > 8 * 1024 * 1024) { results.push({ id: img.id, url: img.url, skip: 'too large (>8MB)' }); continue; }
      const out = await sharp(buf).webp({ quality, effort: 4 }).toBuffer();
      const savedKB = kb(buf.length) - kb(out.length);
      const filename = (img.url.split('/').pop() || 'image').replace(/\.(jpe?g|png)$/i, '.webp');
      const row = { id: img.id, filename, fromKB: kb(buf.length), toKB: kb(out.length), savedKB, pct: Math.round((1 - out.length / buf.length) * 100) };
      if (apply) {
        const up = await wp.uploadMedia(out, filename, 'image/webp', { force: true });
        row.uploaded = !(up && up.dryRun); row.newId = up?.id; row.newUrl = up?.source_url;
      } else { row.preview = true; }
      results.push(row);
    } catch (e) { results.push({ id: img.id, url: img.url, error: String(e.message || e) }); }
  }
  const savedKB = results.reduce((s, r) => s + (r.savedKB || 0), 0);
  const uploaded = results.filter((r) => r.uploaded).length;
  const failed = results.filter((r) => r.error || r.skip).length;
  const errors = results.filter((r) => r.error).map((r) => r.error).slice(0, 3);
  return { applied: !!apply, processed: results.length, uploaded, failed, errors, savedKB, results };
}

export default { scanMedia, optimizeImages };
