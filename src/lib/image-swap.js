import { config } from '../config.js';
import { makeClient } from '../wp/client.js';
import { log } from '../lib/logger.js';

// Image reference-swap. After WebP assets are uploaded, rewrite <img> references
// inside post/page content from the old URL to the new WebP URL.
// Conservative: only swaps exact URL matches, keeps a record for rollback,
// and is fully DRY_RUN-guarded.

// Build old→new URL map from apply results (image-optimization handlers).
export function buildSwapMap(applyResults, imageProposals) {
  const map = [];
  for (const r of applyResults) {
    if (r.status !== 'done' || !r.newUrl) continue;
    const [, idxStr] = r.id.split('#');
    const p = imageProposals?.[Number(idxStr)];
    if (p?.original?.url) {
      map.push({ from: p.original.url, to: r.newUrl });
    }
  }
  return map;
}

// Swap references across all posts + pages. Returns a per-post change record.
export async function swapReferences(swapMap, { force = false } = {}) {
  if (!swapMap.length) {
    log.info('No uploaded WebP URLs to swap — run apply (with writes) first.');
    return [];
  }
  const wp = makeClient();
  const changes = [];

  for (const type of ['posts', 'pages']) {
    const items = await wp.list(type, { perPage: 100, fields: 'id,content' }).catch(() => []);
    for (const item of items) {
      const original = item.content?.rendered ?? item.content?.raw ?? '';
      if (!original) continue;
      let updated = original;
      const applied = [];
      for (const { from, to } of swapMap) {
        if (updated.includes(from)) {
          updated = updated.split(from).join(to);
          applied.push({ from, to });
        }
      }
      if (applied.length && updated !== original) {
        const res = await wp.update(type, item.id, { content: updated }, { force });
        changes.push({ type, id: item.id, swaps: applied.length, dryRun: !!res?.dryRun });
        log[res?.dryRun ? 'info' : 'ok'](
          `${res?.dryRun ? '[dry-run] would swap' : 'swapped'} ${applied.length} ref(s) in ${type}/${item.id}`
        );
      }
    }
  }
  if (!changes.length) log.info('No matching image references found in content.');
  return changes;
}

export default { buildSwapMap, swapReferences };
