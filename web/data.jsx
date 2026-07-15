/* ===========================================================
   Sentinel — mock data store
   =========================================================== */

const SITES = [
  {
    id: "atlas",
    name: "Atlas Outdoors",
    url: "atlasoutdoors.com",
    favicon: "#1F875A",
    glyph: "A",
    status: "connected",          // connected | auth-failed | unreachable
    role: "Administrator",
    writeArmed: true,
    staging: "staging.atlasoutdoors.com",
    muPlugin: true,
    selftest: "ready",            // ready | partial | missing
    lastAudit: "2h ago",
    scale: { posts: 482, pages: 36, media: 2140, sitemap: 518 },
    scores: { performance: 64, accessibility: 81, bestPractices: 92, seo: 73 },
    prev:   { performance: 58, accessibility: 79, bestPractices: 92, seo: 70 },
    cwv: { lcp: { v: "3.1s", state: "poor" }, inp: { v: "180ms", state: "ni" }, cls: { v: "0.04", state: "good" } },
    stack: {
      wp: "6.5.3", theme: "Astra Child", builder: "Elementor 3.21",
      seo: "Rank Math", cache: "WP Rocket", image: "ShortPixel",
      security: "Wordfence", other: ["WooCommerce", "Contact Form 7"]
    },
    caps: { lighthouse:true, image:true, perf:true, seo:true, geo:true, a11y:true },
    openFindings: 18, pendingProposals: 7,
  },
  {
    id: "ledger",
    name: "Ledger & Co",
    url: "ledgerandco.io",
    favicon: "#35618E",
    glyph: "L",
    status: "connected",
    role: "Editor",
    writeArmed: false,
    staging: null,
    muPlugin: true,
    selftest: "partial",
    lastAudit: "1d ago",
    scale: { posts: 96, pages: 22, media: 410, sitemap: 121 },
    scores: { performance: 88, accessibility: 74, bestPractices: 96, seo: 81 },
    prev:   { performance: 85, accessibility: 74, bestPractices: 96, seo: 79 },
    cwv: { lcp: { v: "1.9s", state: "good" }, inp: { v: "120ms", state: "good" }, cls: { v: "0.11", state: "ni" } },
    stack: {
      wp: "6.4.4", theme: "GeneratePress", builder: "Gutenberg",
      seo: "Yoast SEO", cache: "LiteSpeed Cache", image: "Imagify",
      security: "MalCare", other: ["WP Forms"]
    },
    caps: { lighthouse:true, image:false, perf:true, seo:true, geo:false, a11y:true },
    openFindings: 9, pendingProposals: 3,
  },
  {
    id: "verde",
    name: "Verde Kitchen",
    url: "verdekitchen.co",
    favicon: "#B26A12",
    glyph: "V",
    status: "auth-failed",
    role: "—",
    writeArmed: false,
    staging: null,
    muPlugin: false,
    selftest: "missing",
    lastAudit: "never",
    scale: { posts: 0, pages: 0, media: 0, sitemap: 0 },
    scores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
    prev:   { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
    cwv: { lcp: { v: "—", state: "na" }, inp: { v: "—", state: "na" }, cls: { v: "—", state: "na" } },
    stack: null,
    caps: { lighthouse:false, image:false, perf:false, seo:false, geo:false, a11y:false },
    openFindings: 0, pendingProposals: 0,
  },
];

const CAP_DEFS = [
  { key:"lighthouse", label:"Lighthouse / PSI Audit", desc:"Lab + field scoring across all four categories.", icon:"gauge" },
  { key:"seo",        label:"SEO Audit",              desc:"Titles, meta, schema, internal links, duplicates.", icon:"search" },
  { key:"perf",       label:"Performance / CSS",      desc:"Render-blocking, critical CSS, unused assets.", icon:"bolt" },
  { key:"image",      label:"Image Optimization",     desc:"Compression, next-gen formats, dimensions.", icon:"image" },
  { key:"geo",        label:"AI-SEO / GEO",           desc:"Answer-engine visibility & structured data.", icon:"sparkles" },
  { key:"a11y",       label:"Accessibility",          desc:"WCAG contrast, alt text, landmarks, focus.", icon:"a11y" },
];

/* Audit report findings for the active site (Atlas) */
const FINDINGS = [
  { id:"f1", disc:"performance", title:"Render-blocking CSS on homepage", page:"/", impact:"high",
    traffic:"24.1k/mo", gapPts:9, channel:"theme/css",
    detail:"Three stylesheets block first paint. Inlining critical CSS and deferring the rest should cut LCP by ~0.8s.", },
  { id:"f2", disc:"seo", title:"Missing meta description", page:"/collections/trail-packs", impact:"high",
    traffic:"11.4k/mo", gapPts:6, channel:"rest-write",
    detail:"Category page has no meta description; Google is auto-generating a poor snippet.", },
  { id:"f3", disc:"seo", title:"Duplicate title tags (4 pages)", page:"multiple", impact:"medium",
    traffic:"8.0k/mo", gapPts:5, channel:"rest-write",
    detail:"Four product pages share the title “Trail Pack — Atlas”. Cannibalizes rankings.", },
  { id:"f4", disc:"image", title:"Unoptimized hero image", page:"/", impact:"high",
    traffic:"24.1k/mo", gapPts:7, channel:"rest-write",
    detail:"hero-summit.jpg is 1.8 MB PNG. Convert to WebP + resize to displayed dimensions.", },
  { id:"f5", disc:"accessibility", title:"Low-contrast nav links", page:"global", impact:"medium",
    traffic:"—", gapPts:4, channel:"theme/css",
    detail:"Header links measure 3.1:1 against the photo banner — below WCAG AA 4.5:1.", },
  { id:"f6", disc:"seo", title:"No structured data on products", page:"/products/*", impact:"medium",
    traffic:"15.2k/mo", gapPts:5, channel:"rest-write",
    detail:"Product schema missing — blocks rich results & answer-engine surfacing.", },
  { id:"f7", disc:"performance", title:"Unused JavaScript (312 KB)", page:"global", impact:"medium",
    traffic:"—", gapPts:4, channel:"manual",
    detail:"Two plugins load scripts site-wide but only used on checkout.", },
  { id:"f8", disc:"accessibility", title:"42 images missing alt text", page:"/blog/*", impact:"low",
    traffic:"6.3k/mo", gapPts:3, channel:"rest-write",
    detail:"Blog post images lack alt attributes — both a11y and SEO loss.", },
];

/* Review queue proposals (Atlas). status flows:
   proposed -> approved -> applied -> verified  (or failed / rolled-back) */
const PROPOSALS = [
  {
    id:"p1", findingId:"f2", disc:"seo", risk:"low", channel:"rest-write",
    title:"Add meta description", page:"/collections/trail-packs",
    impact:"+6 SEO · est. +9% CTR", target:"staging",
    field:"rank_math_description",
    before:"(empty)",
    after:"Shop Atlas trail packs built for multi-day routes — 28–55 L, weatherproof, lifetime warranty. Free shipping over $75.",
    status:"proposed",
  },
  {
    id:"p2", findingId:"f3", disc:"seo", risk:"low", channel:"rest-write",
    title:"Resolve duplicate title tags", page:"4 product pages",
    impact:"+5 SEO", target:"staging",
    field:"rank_math_title",
    before:"Trail Pack — Atlas",
    after:"Summit 45L Trail Pack — Atlas Outdoors",
    status:"proposed",
  },
  {
    id:"p3", findingId:"f4", disc:"image", risk:"low", channel:"rest-write",
    title:"Optimize hero image", page:"/",
    impact:"−1.4 MB · LCP −0.6s", target:"staging",
    field:"media #2841",
    before:"hero-summit.png · 1.8 MB · 3200×1800",
    after:"hero-summit.webp · 218 KB · 1600×900",
    status:"proposed",
  },
  {
    id:"p4", findingId:"f6", disc:"seo", risk:"medium", channel:"rest-write",
    title:"Inject Product structured data", page:"/products/*",
    impact:"+5 SEO · rich results", target:"production",
    field:"schema_markup",
    before:"(no Product schema)",
    after:'{ "@type":"Product", "name":"…", "offers":{…}, "aggregateRating":{…} }',
    status:"proposed",
  },
  {
    id:"p5", findingId:"f8", disc:"accessibility", risk:"low", channel:"rest-write",
    title:"Generate alt text — 42 images", page:"/blog/*",
    impact:"+3 A11y · +SEO", target:"staging",
    field:"media alt (×42)",
    before:"(empty alt attributes)",
    after:"AI-drafted, human-reviewable alt text per image",
    status:"proposed",
  },
  {
    id:"p6", findingId:"f1", disc:"performance", risk:"medium", channel:"theme/css",
    title:"Inline critical CSS + defer rest", page:"/",
    impact:"+9 Perf · LCP −0.8s", target:"staging",
    field:"theme · functions.php",
    before:"3 render-blocking <link> tags in <head>",
    after:"Critical CSS inlined; non-critical deferred with preload",
    status:"proposed",
  },
];

const ACTIVITY = [
  { id:"a1", t:"14 min ago", type:"verified", site:"atlas", who:"Agent", icon:"check",
    text:"Verified write — meta description on /about", meta:"read-back OK · cache purged" },
  { id:"a2", t:"32 min ago", type:"approved", site:"atlas", who:"You", icon:"thumb",
    text:"Approved 3 low-risk proposals (bulk)", meta:"SEO · staging" },
  { id:"a3", t:"1h ago", type:"applied", site:"atlas", who:"Agent", icon:"upload",
    text:"Applied title fix to 2 product pages", meta:"rest-write · staging" },
  { id:"a4", t:"3h ago", type:"rolled-back", site:"atlas", who:"You", icon:"undo",
    text:"Rolled back schema change on /products/summit-45", meta:"restored old→ previous value" },
  { id:"a5", t:"5h ago", type:"audit", site:"ledger", who:"Agent", icon:"radar",
    text:"Full-site audit completed — 96 pages sampled", meta:"9 findings · 3 prioritized" },
  { id:"a6", t:"Yesterday", type:"connection", site:"atlas", who:"You", icon:"link",
    text:"Re-authenticated application password", meta:"role: Administrator" },
  { id:"a7", t:"Yesterday", type:"failed", site:"verde", who:"Agent", icon:"alert",
    text:"Connection check failed — 401 Unauthorized", meta:"check credentials / Wordfence allowlist" },
];

/* weekly audit-score trend for the analytics card */
const TREND = [
  { d:"Mon", seo:68, perf:55 },
  { d:"Tue", seo:69, perf:57 },
  { d:"Wed", seo:70, perf:56 },
  { d:"Thu", seo:71, perf:60 },
  { d:"Fri", seo:71, perf:62 },
  { d:"Sat", seo:72, perf:63 },
  { d:"Sun", seo:73, perf:64 },
];

const DETECT_STEPS = [
  { label:"Reaching site & verifying SSL", k:"ssl" },
  { label:"Validating application password (wp:check)", k:"auth" },
  { label:"Reading WordPress core version", k:"core" },
  { label:"Detecting active theme & page builder", k:"theme" },
  { label:"Identifying SEO / cache / image plugins", k:"plugins" },
  { label:"Probing companion mu-plugin (selftest)", k:"mu" },
  { label:"Counting posts, pages, media & sitemap URLs", k:"scale" },
];

Object.assign(window, {
  SITES, CAP_DEFS, FINDINGS, PROPOSALS, ACTIVITY, TREND, DETECT_STEPS
});

/* ===========================================================================
   LIVE DATA HYDRATION (additive — design untouched)
   The components read window.SITES / PROPOSALS / ACTIVITY. We keep the mock
   arrays above as the instant-render fallback, then asynchronously replace
   them with live Supabase data mapped into the SAME shapes, and re-mount the
   app. If the backend is unreachable, the mock design renders unchanged.
   =========================================================================== */
(function () {
  const API = window.SentinelAPI;
  const CFG = window.SENTINEL_CONFIG || {};
  if (!API || CFG.offline) return; // pure-mock mode

  // Map a Supabase site row → the shape the UI expects (see SITES above).
  function mapSite(r) {
    return {
      id: r.id,
      name: r.name,
      url: (r.url || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      _rawUrl: r.url,
      _username: r.username,
      favicon: r.favicon || "#1A746B",
      glyph: r.glyph || (r.name || "?")[0].toUpperCase(),
      status: r.status || "connected",
      role: r.role || "—",
      writeArmed: !!r.write_armed,
      staging: r.staging_url || null,
      muPlugin: !!r.mu_plugin,
      selftest: r.selftest || "missing",
      lastAudit: r.last_audit ? timeAgo(r.last_audit) : "never",
      scale: r.scale || { posts: 0, pages: 0, media: 0, sitemap: 0 },
      scores: r.scores || { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
      prev: r.prev_scores || r.scores || { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
      cwv: r.cwv || { lcp: { v: "—", state: "na" }, inp: { v: "—", state: "na" }, cls: { v: "—", state: "na" } },
      stack: r.stack || null,
      caps: r.caps || { lighthouse: true, image: false, perf: true, seo: true, geo: true, a11y: true },
      competitors: r.competitors || [],
      negative_keywords: r.negative_keywords || [],
      brand_constraints: r.brand_constraints || [],
      semrush_db: r.semrush_db || "uk",
      openFindings: r.open_findings || 0,
      pendingProposals: 0,
    };
  }

  function mapProposal(r) {
    return {
      id: r.id, findingId: r.finding_id, disc: r.disc, risk: r.risk || "low",
      channel: r.channel, title: r.title, page: r.page, impact: r.impact,
      target: r.target || "staging", field: r.field,
      before: r.before_val, after: r.after_val, status: r.status || "proposed",
      _objectType: r.object_type, _postId: r.post_id, _oldValue: r.old_value, _siteId: r.site_id,
    };
  }
  window.mapProposalRow = mapProposal;

  function mapActivity(r) {
    return {
      id: r.id, t: timeAgo(r.created_at), type: r.type, site: r.site_id,
      who: r.actor || "Agent", icon: r.icon || "check", text: r.text, meta: r.meta || "",
    };
  }
  window.mapActivityRow = mapActivity;   // so the Activity screen can refresh window.ACTIVITY after a write

  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + " min ago";
    if (d < 86400) return Math.floor(d / 3600) + "h ago";
    if (d < 172800) return "Yesterday";
    return Math.floor(d / 86400) + "d ago";
  }
  window.timeAgo = timeAgo;

  async function hydrate() {
    const reachable = await API.ping().catch(() => false);
    // Only mark the app "live" when the engine actually answered — otherwise leave it
    // falsy so screens fall back to design-preview instead of firing live calls that fail.
    window.SENTINEL_LIVE = reachable ? { engine: true } : null;
    let sites = [];
    try { sites = await API.listSites(); } catch (e) { /* not signed in / empty */ }

    if (sites && sites.length) {
      window.SITES = sites.map(mapSite);
      // Load proposals + activity for the first connected site.
      const first = sites.find((s) => s.status === "connected") || sites[0];
      try {
        const props = await API.listProposals(first.id);
        window.PROPOSALS = (props || []).map(mapProposal);
      } catch (e) {}
      try {
        const acts = await API.listActivity(null);
        // Always set (even to []) in live mode so the Activity screen shows a real
        // empty state instead of falling back to the design-preview demo seed.
        window.ACTIVITY = (acts || []).map(mapActivity);
      } catch (e) {}
      try {
        const audits = await API.listAudits(first.id);
        if (audits && audits.length) {
          window.TREND = audits.slice(-7).map((a, i) => ({
            d: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || ("D" + i),
            seo: (a.scores && a.scores.seo) || 0,
            perf: (a.scores && a.scores.performance) || 0,
          }));
        }
      } catch (e) {}
    }
    // Signal the app to (re)render with live globals.
    if (window.__sentinelRerender) window.__sentinelRerender();
  }

  // Expose so the app can call it after actions (e.g. after connect/audit).
  window.SentinelHydrate = hydrate;

  // Kick off once the engine client is ready.
  hydrate();
})();
