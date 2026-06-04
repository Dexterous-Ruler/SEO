import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { config } from '../config.js';
import { makeClient } from '../wp/client.js';
import { log } from '../lib/logger.js';

// Image optimization phase.
// Strategy: pull the media library via REST, find large raster images,
// download + re-encode to WebP (and optionally AVIF), and PROPOSE the swap.
// Nothing is uploaded/published unless `apply` runs after approval.

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tiff']);

function kb(bytes) {
  return Math.round(bytes / 1024);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Convert a buffer to WebP at configured quality; return {buffer, info}.
async function toWebp(buffer, quality) {
  const out = await sharp(buffer)
    .webp({ quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  return out;
}

async function toAvif(buffer, quality) {
  return sharp(buffer).avif({ quality: Math.max(1, quality - 15) }).toBuffer({ resolveWithObject: true });
}

// Scan media library and build optimization proposals.
export async function scanAndOptimize({ apply = false } = {}) {
  const wp = makeClient();
  const cacheDir = join(config.paths.cache, 'images');
  mkdirSync(cacheDir, { recursive: true });

  log.step('Image optimization — scanning media library');
  const media = await wp.listMedia({ perPage: 100 });
  const images = media.filter((m) => {
    const src = m.source_url || '';
    return RASTER.has(extname(src).toLowerCase());
  });
  log.info(`Found ${images.length} raster image(s) in the library`);

  const proposals = [];
  const q = config.images.webpQuality;

  for (const m of images) {
    const src = m.source_url;
    try {
      const original = await download(src);
      const webp = await toWebp(original, q);
      const savedBytes = original.length - webp.data.length;
      const savedPct = Math.round((savedBytes / original.length) * 100);

      // Persist the converted asset locally for review/apply.
      const name = basename(src, extname(src)) + '.webp';
      const localPath = join(cacheDir, name);
      writeFileSync(localPath, webp.data);

      let avifPath = null;
      if (config.images.emitAvif) {
        const avif = await toAvif(original, q);
        avifPath = join(cacheDir, basename(src, extname(src)) + '.avif');
        writeFileSync(avifPath, avif.data);
      }

      proposals.push({
        phase: 'image-optimization',
        mediaId: m.id,
        title: `Convert ${basename(src)} → WebP`,
        detail: `${kb(original.length)} KB → ${kb(webp.data.length)} KB (−${savedPct}%)`,
        original: { url: src, bytes: original.length },
        webp: { localPath, bytes: webp.data.length },
        avif: avifPath ? { localPath: avifPath } : null,
        savedBytes,
        savedPct,
      });
      log.ok(`${basename(src)}  ${kb(original.length)}→${kb(webp.data.length)} KB (−${savedPct}%)`);
    } catch (e) {
      log.warn(`skip ${basename(src)}: ${e.message}`);
    }
  }

  const totalSaved = proposals.reduce((a, p) => a + p.savedBytes, 0);
  log.info(`Total potential savings: ${kb(totalSaved)} KB across ${proposals.length} image(s)`);

  // Write proposals to disk for the approval step.
  mkdirSync(config.paths.reports, { recursive: true });
  const outPath = join(config.paths.reports, 'images.proposals.json');
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), proposals }, null, 2));
  log.ok(`Proposals written: ${outPath}`);

  if (apply && !config.dryRun) {
    log.warn('apply requested — upload/swap logic runs only after explicit approval (see apply phase).');
  }

  return proposals;
}

export default { scanAndOptimize };
