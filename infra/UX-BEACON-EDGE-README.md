# Sentinel UX-Beacon Edge Worker (Phase 3)

A Cloudflare Worker that fronts the Sentinel UX-beacon ingest so the Koyeb **nano**
(0.1 vCPU) never `JSON.parse`s a raw browser beacon. The Worker terminates CORS,
drops oversized bodies, rate-limits per IP, validates payload shape, enforces a
PII guard, and forwards only clean beacons to the nano — always returning `204`
to the browser immediately (fire-and-forget).

This is the Phase-3 **"promote only if `/status` shows event-loop lag"** escalation.
Stand it up only when the nano is actually CPU-starved by ingest; until then the
browser beacon talks to Koyeb directly and these files sit dormant.

## Files

- `ux-beacon-edge-worker.js` — the Worker (module syntax `export default { fetch }`).
- `wrangler.toml` — minimal deploy config + the `SENTINEL_INGEST` var.

## Prerequisites

- A Cloudflare account (free tier is fine).
- Wrangler CLI: `npm i -g wrangler`
- `wrangler login` (one-time browser OAuth).

## Deploy

```sh
cd infra
wrangler deploy
```

Wrangler prints the deployed URL, of the form:

```
https://sentinel-ux-beacon-edge.<your-account>.workers.dev
```

### Set the ingest target

`SENTINEL_INGEST` is the real nano ingest base+path the Worker forwards to. It is
committed in `wrangler.toml` under `[vars]`. To override (or keep it out of git),
set it as a secret instead:

```sh
wrangler secret put SENTINEL_INGEST
# paste: https://sentinel-goodfor-2e75db85.koyeb.app/ux-beacon
```

A secret takes precedence over the `[vars]` value at runtime.

## Wire it up (the one change that routes beacons through the Worker)

The mu-plugin's `/set-ux-beacon` config has an `endpoint` field. When you arm a
site, set that `endpoint` to the Worker URL **without** the `/ux-beacon` suffix —
the beacon appends `/ux-beacon` itself. The browser beacon then POSTs to the
Worker, which validates and forwards to Koyeb.

```
"endpoint": "https://sentinel-ux-beacon-edge.<your-account>.workers.dev"
```

> Caveat — script loading: the mu-plugin uses the SAME `endpoint` value to load
> `ux-beacon.js` (`endpoint + '/ux-beacon.js'`). This Worker only handles the
> `POST /ux-beacon` data path and returns `404` for `/ux-beacon.js`. So either
> (a) serve `ux-beacon.js` from the Worker host too / via a CDN at that origin,
> or (b) host the loader script elsewhere. If in doubt, keep the loader on Koyeb
> and add a route on the Worker only for the beacon POST. The simplest production
> wiring is to put the Worker on a route like `beacon.<yourdomain>/ux-beacon` and
> point `endpoint` there, ensuring the `.js` is reachable at the same base.

## Notes / limits

- **Free tier: 100,000 requests/day.** Enough to front the beacon volume.
- **Rate limit is per-isolate, not global.** The in-memory token bucket lives in
  one Worker isolate; Cloudflare runs many isolates across many PoPs. It sheds
  obvious floods cheaply but is **not** a true global limiter. For global limits
  use a **Durable Object** (one object per IP/bucket) or the **KV / Rate Limiting
  API**.
- **PII guard:** beacons whose events carry `value`/`innerHTML`/`outerHTML`/`html`/
  `text`/`screenshot` keys are dropped at the edge (defence-in-depth on top of the
  beacon's scrub-at-source).
- **Bodies > 64 KiB** are dropped without being read.
- The Worker **always returns 204** and never throws; the browser never blocks on it.

## Out of scope for these files

Standing up the **separate Supabase project** (the dedicated Sentinel datastore /
project isolation) is operator infra and is handled outside this Worker. These
three files cover only the edge front.
