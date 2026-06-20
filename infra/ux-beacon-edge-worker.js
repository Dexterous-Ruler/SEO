/*
 * ux-beacon-edge-worker.js — Sentinel Phase-3 Cloudflare Worker (edge front for UX-beacon ingest)
 * ------------------------------------------------------------------------------------------------
 * PURPOSE
 *   The Sentinel ingest runs on a Koyeb "nano" instance (0.1 vCPU). JSON.parse on raw,
 *   attacker-controllable browser beacons — plus per-request rate-limiting and shape/PII
 *   validation — is exactly the kind of CPU-bound, unbounded-input work that starves a
 *   0.1 vCPU event loop and shows up as event-loop lag on /status.
 *
 *   This Worker sits in FRONT of the nano at Cloudflare's edge and absorbs that work:
 *     - terminates CORS / preflight at the edge (no preflight round-trip to Koyeb),
 *     - drops oversized bodies WITHOUT reading them,
 *     - rate-limits per source IP,
 *     - JSON.parses + validates shape + enforces a PII guard,
 *     - forwards only well-formed, bounded payloads to the nano (fire-and-forget),
 *     - ALWAYS returns 204 to the browser immediately and never throws.
 *
 *   Cloudflare Workers free tier = 100,000 requests/day, which comfortably fronts the
 *   beacon volume. The nano then only ever sees pre-validated, size-capped, rate-limited
 *   POSTs — it never JSON.parses a raw browser beacon again.
 *
 *   This is the Phase-3 "promote only if /status shows event-loop lag" escalation: it is
 *   optional infra you stand up only when the nano is actually CPU-starved by ingest.
 *
 * CONTRACT (must match web/ux-beacon.js + the nano ingest)
 *   Body is text/plain JSON: { k:<string siteKey>, p:<string path>, e:[ {type:<string>, ...}, ... ] }
 *   (the live beacon also sends pv/ts/sampled/sr — those pass through untouched; we only
 *   VALIDATE the load-bearing fields k/p/e and the per-event `type` string).
 *
 *   The mu-plugin builds BOTH the <script src> and the POST target from the same `endpoint`,
 *   so this Worker also proxies GET /ux-beacon.js from the origin — otherwise pointing the
 *   beacon `endpoint` at the Worker would 404 the loader script and the beacon would never run.
 */

// ---- In-memory per-IP token bucket -------------------------------------------------------------
// NOTE: this Map lives in a SINGLE Worker isolate. Cloudflare runs many isolates across many
// PoPs, so this is a per-isolate best-effort limiter, NOT a global one. It cheaply sheds the
// obvious floods (a single hot client hammering one isolate) at near-zero cost. For TRUE
// distributed rate-limiting use a Durable Object (one object per IP/bucket) or the KV/Rate
// Limiting API — see UX-BEACON-EDGE-README.md.
const BUCKETS = new Map(); // ip -> { tokens:number, ts:number }
const RL_CAPACITY = 20;    // burst: up to 20 beacons
const RL_REFILL_PER_SEC = 5; // steady state: 5 beacons/sec/ip/isolate
const RL_MAX_KEYS = 10000; // crude memory cap so the Map can't grow unbounded

function allow(ip) {
  if (!ip) return true; // no IP header → don't penalise; the size cap still applies
  const now = Date.now();
  let b = BUCKETS.get(ip);
  if (!b) {
    if (BUCKETS.size >= RL_MAX_KEYS) BUCKETS.clear(); // bound memory; cheap reset under flood
    b = { tokens: RL_CAPACITY, ts: now };
    BUCKETS.set(ip, b);
  }
  // Refill proportional to elapsed time, capped at capacity.
  const elapsedSec = (now - b.ts) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(RL_CAPACITY, b.tokens + elapsedSec * RL_REFILL_PER_SEC);
    b.ts = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

// ---- PII guard ----------------------------------------------------------------------------------
// The beacon is supposed to scrub at source, but defence-in-depth: if an event object carries
// any of these keys, treat the whole payload as tainted and drop it at the edge. These are the
// fields that could smuggle raw page content / DOM / user input.
const FORBIDDEN_EVENT_KEYS = ['value', 'innerHTML', 'outerHTML', 'html', 'text', 'screenshot'];

function isValidPayload(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false;
  if (typeof data.k !== 'string') return false;
  if (typeof data.p !== 'string') return false;
  if (!Array.isArray(data.e)) return false;
  for (let i = 0; i < data.e.length; i++) {
    const ev = data.e[i];
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) return false;
    if (typeof ev.type !== 'string') return false;   // live beacon emits {type,count,...} (NOT t)
    for (let j = 0; j < FORBIDDEN_EVENT_KEYS.length; j++) {
      if (Object.prototype.hasOwnProperty.call(ev, FORBIDDEN_EVENT_KEYS[j])) return false;
    }
  }
  return true;
}

const MAX_BODY_BYTES = 65536;

// 204 No Content, with permissive CORS so the browser is happy and the beacon never blocks.
function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Preflight: answer at the edge so there is zero preflight cost to the nano.
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Loader script: the mu-plugin loads the beacon from `endpoint + '/ux-beacon.js'`, and
      // `endpoint` is the same value used for the POST. Proxy the script from the origin so
      // routing the beacon through the Worker doesn't break script loading.
      if (request.method === 'GET' && url.pathname === '/ux-beacon.js') {
        const base = String(env.SENTINEL_INGEST || '').replace(/\/ux-beacon$/, '');
        try {
          const r = await fetch(base + '/ux-beacon.js', { cf: { cacheTtl: 300, cacheEverything: true } });
          return new Response(r.body, {
            status: r.status,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) { return new Response('', { status: 502 }); }
      }

      // Only POST /ux-beacon is processed; everything else is a flat 404.
      if (request.method !== 'POST' || url.pathname !== '/ux-beacon') {
        return new Response('Not found', { status: 404 });
      }

      // Oversized → drop WITHOUT reading the body (never buffer a huge beacon).
      const len = parseInt(request.headers.get('content-length') || '0', 10);
      if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
        return noContent();
      }

      // Per-IP rate limit (per-isolate, best-effort — see note above).
      const ip = request.headers.get('cf-connecting-ip') || '';
      if (!allow(ip)) {
        return noContent();
      }

      // Read body as text and parse defensively. Any failure → silent drop.
      const body = await request.text();
      if (body.length > MAX_BODY_BYTES) {
        // Belt-and-braces: content-length can lie / be absent.
        return noContent();
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        return noContent(); // malformed JSON: the nano never sees it
      }

      if (!isValidPayload(data)) {
        return noContent(); // bad shape or PII-tainted: drop at the edge
      }

      // Valid → fire-and-forget forward to the nano. ctx.waitUntil lets the Worker return 204
      // to the browser IMMEDIATELY while the forward completes in the background.
      ctx.waitUntil(
        fetch(env.SENTINEL_INGEST, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'X-Forwarded-For': ip,
          },
          body,
        }).catch(() => {}) // never let a forward error bubble
      );

      return noContent();
    } catch (e) {
      // Absolute backstop: the beacon must never see an error from the edge.
      return noContent();
    }
  },
};
