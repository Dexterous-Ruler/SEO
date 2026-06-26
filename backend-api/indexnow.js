// ===========================================================================
// IndexNow — instant URL submission to participating search engines (Bing,
// Yandex, Seznam, Naver, …). One ping notifies the whole IndexNow network that
// a set of URLs changed, so freshly published / refreshed / drift-corrected
// pages get re-crawled in hours instead of days.
//
// The protocol is dead simple and key-based:
//   1. Derive a stable key for the host (hex, 8–128 chars).
//   2. Publish that key as a text file at  https://<host>/<key>.txt  whose body
//      is exactly the key (proves you control the host).
//   3. POST { host, key, keyLocation, urlList } to the IndexNow endpoint.
//
// Zero deps, pure JS, global fetch. No persistence, no Supabase — the key is
// derived deterministically from a seed so it survives restarts without storage.
// Every network call degrades gracefully and never throws: a 403 from the
// endpoint (key file unreachable) comes back as { ok:false, keyMissing:true }
// with a clear, actionable message instead of an exception.
// ===========================================================================

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const FETCH_TIMEOUT_MS = 15000;
const DESKTOP_UA = 'Mozilla/5.0 (compatible; SentinelSEO/2.0; +https://indexnow.org/)';

// Normalise a user-supplied host/url down to a bare hostname (no scheme, no
// path, no port-less trailing slash). Tolerant: accepts 'https://x.com/p',
// 'x.com', 'X.COM/'  → 'x.com'.
export function normalizeHost(input) {
  let h = String(input || '').trim();
  if (!h) return '';
  h = h.replace(/^https?:\/\//i, '');   // strip scheme
  h = h.replace(/\/.*$/, '');           // strip path/query/fragment
  h = h.replace(/:\d+$/, '');           // strip explicit port
  return h.toLowerCase();
}

// FNV-1a 32-bit (same fingerprint primitive used in drift.js) — fast, stable,
// dependency-free. NOT crypto; we only need a deterministic seed → key mapping.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// Derive a deterministic IndexNow key from any seed (siteId, host, or an
// operator-chosen string). The protocol requires the key be 8–128 hex-ish chars
// ([a-z0-9-]); we mix the seed through FNV with a few salts to reach 32 hex
// chars so the same seed always yields the same publishable key (no storage
// needed). Returns lowercase hex.
export function keyFromSeed(seed) {
  const s = String(seed == null ? '' : seed).trim() || 'sentinel-indexnow';
  // Four salted passes → 32 hex chars (well inside the 8–128 window).
  return (
    fnv1a(s) +
    fnv1a('a:' + s) +
    fnv1a(s + ':b') +
    fnv1a('c:' + s + ':c')
  );
}

// The exact body that must be served at  https://<host>/<key>.txt . The
// IndexNow spec requires the file content to BE the key (and nothing else).
export function keyFileContent(key) {
  return String(key || '').trim();
}

// Submit a batch of URLs to the IndexNow network. Filters the list to URLs on
// `host`, posts the canonical JSON payload, and maps the well-known responses
// to a friendly shape. Never throws.
//
//   200/202 → { ok:true, submitted, status }
//   403     → { ok:false, keyMissing:true, ... }   (key file not published / wrong)
//   422     → { ok:false, status, reason }          (URLs don't match host / invalid)
//   429     → { ok:false, status, reason }          (rate limited)
export async function submit(host, key, urls) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) return { ok: false, error: 'A host is required.' };
  if (!key) return { ok: false, error: 'A key is required — derive one with /indexnow-key first.' };

  // Keep only well-formed URLs that live on this host (the endpoint 422s a
  // mixed-host list, so we filter rather than fail the whole batch).
  const list = (Array.isArray(urls) ? urls : (urls ? [urls] : []))
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .filter((u) => { try { return normalizeHost(new URL(u).host) === cleanHost; } catch { return false; } });

  if (!list.length) return { ok: false, error: `No valid URLs on https://${cleanHost}/ to submit.`, submitted: 0 };

  const keyLocation = `https://${cleanHost}/${key}.txt`;
  const payload = { host: cleanHost, key, keyLocation, urlList: list.slice(0, 10000) };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res, text = '';
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', 'User-Agent': DESKTOP_UA },
      body: JSON.stringify(payload),
    });
    text = await res.text().catch(() => '');
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: String(e && e.name === 'AbortError' ? `IndexNow timeout after ${FETCH_TIMEOUT_MS}ms` : (e.message || e)), host: cleanHost, submitted: 0 };
  }
  clearTimeout(timer);

  const status = res.status;
  // 200 OK / 202 Accepted → the network took the batch.
  if (status === 200 || status === 202) {
    return { ok: true, status, host: cleanHost, keyLocation, submitted: list.length };
  }
  // 403 → the key file at keyLocation is missing/unreadable or doesn't match.
  if (status === 403) {
    return {
      ok: false, keyMissing: true, status, host: cleanHost, keyLocation, submitted: 0,
      error: `IndexNow rejected the key (403). Publish the key file at ${keyLocation} (its body must be exactly the key) before submitting.`,
    };
  }
  // 422 → URLs don't belong to the host, or the key/host pair is invalid.
  if (status === 422) {
    return { ok: false, status, host: cleanHost, keyLocation, submitted: 0, reason: 'Unprocessable — URLs do not match the host or the key/host pair is invalid.', body: text.slice(0, 200) };
  }
  // 429 → rate limited.
  if (status === 429) {
    return { ok: false, status, host: cleanHost, keyLocation, submitted: 0, reason: 'Rate limited by IndexNow — retry later.' };
  }
  return { ok: false, status, host: cleanHost, keyLocation, submitted: 0, error: `IndexNow → ${status} ${text.slice(0, 200)}` };
}

export default { normalizeHost, keyFromSeed, keyFileContent, submit };
