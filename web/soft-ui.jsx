/* ===========================================================
   Sentinel — Soft-UI primitives (cream + teal neumorphism)
   =========================================================== */
const { useState, useEffect, useRef, useCallback } = React;

const SI = {
  grid:"M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  globe:"M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18",
  radar:"M12 12l6-3M12 21a9 9 0 109-9M12 7a5 5 0 105 5",
  refresh:"M21 12a9 9 0 11-2.6-6.4M21 3v5h-5",
  list:"M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  clock:"M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  cog:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a8 8 0 00.1-6l-2-.5a6 6 0 00-1-1.7l.6-2a8 8 0 00-5.2-3l-1 1.8a6 6 0 00-2 0l-1-1.8a8 8 0 00-5.2 3l.6 2a6 6 0 00-1 1.7l-2 .5a8 8 0 00.1 6l2 .5a6 6 0 001 1.7l-.6 2a8 8 0 005.2 3l1-1.8a6 6 0 002 0l1 1.8a8 8 0 005.2-3l-.6-2a6 6 0 001-1.7z",
  shield:"M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  bolt:"M13 2L4 14h7l-1 8 9-12h-7z",
  search:"M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  flag:"M5 21V4M5 4l8 .5L11 8l2 3.5L5 11",
  check:"M20 6L9 17l-5-5",
  arrowUp:"M7 17L17 7M7 7h10v10",
  chevD:"M6 9l6 6 6-6",
  chevL:"M15 6l-6 6 6 6",
  chevR:"M9 6l6 6-6 6",
  power:"M12 4v8M6.3 7a8 8 0 1011.4 0",
  bell:"M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  mic:"M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8",
  play:"M7 4l13 8-13 8z",
  pause:"M7 4h4v16H7zM15 4h4v16h-4z",
  image:"M3 5h18v14H3zM8 11a2 2 0 100-4 2 2 0 000 4zM21 16l-5-5L5 21",
  sparkles:"M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z",
  a11y:"M12 6a2 2 0 100-4 2 2 0 000 4zM5 9l7 1 7-1M12 10v5M9 21l3-6 3 6",
  layers:"M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  trend:"M3 17l6-6 4 4 8-8M21 7h-5M21 7v5",
  doc:"M14 3H6v18h12V7zM14 3l4 4M14 3v4h4",
  panelL:"M4 4h16v16H4zM10 4v16",
  plus:"M12 5v14M5 12h14",
  lock:"M5 11h14v10H5zM8 11V8a4 4 0 018 0v3",
  eye:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  undo:"M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  upload:"M12 16V4M7 9l5-5 5 5M5 20h14",
  thumb:"M7 10v11M7 10l4-7a2 2 0 013 2l-1 5h5a2 2 0 012 2.3l-1.3 6A2 2 0 0118 21H7",
  alert:"M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 002 3h16a2 2 0 002-3L13.7 3.9a2 2 0 00-3.4 0z",
  dots:"M5 12h.01M12 12h.01M19 12h.01",
  x:"M18 6L6 18M6 6l12 12",
  edit:"M4 20h4L19 9l-4-4L4 16zM14 5l4 4",
  link:"M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1",
  filter:"M3 5h18l-7 8v6l-4 2v-8z",
  gauge:"M12 14l4-4M5 19a9 9 0 1114 0",
  help:"M12 22a10 10 0 100-20 10 10 0 000 20M9.2 9a2.8 2.8 0 015.4 1c0 1.8-2.6 2.2-2.6 3.6M12 17.5h.01",
};
function Icon({ name, size=20, sw=2, style, fill }) {
  const d = SI[name] || SI.grid;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill?"currentColor":"none"} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split("M").filter(Boolean).map((s,i)=><path key={i} d={"M"+s} />)}
    </svg>
  );
}

const TT = {
  teal:["var(--t-700)","var(--t-50)","var(--t-100)"],
  gold:["var(--gold)","var(--gold-bg)","var(--gold-line)"],
  clay:["var(--clay)","var(--clay-bg)","var(--clay-line)"],
  plum:["var(--plum)","var(--plum-bg)","#DCD2EA"],
  gray:["var(--ink-2)","var(--bg-2)","var(--line)"],
};

/* raised neumorphic card — hairline border + hover lift/accent */
function SoftCard({ children, pad=24, tone, hover=true, onClick, style, className="" }) {
  const isDark = tone==="dark", isTeal = tone==="teal";
  const bg = isDark?"var(--dark)": isTeal?"var(--t-700)":"var(--surface)";
  const cls = "scard " + (isDark?"scard--dark ":isTeal?"scard--teal ":"") + (hover?"hoverable ":"") + className;
  return (
    <div onClick={onClick} className={cls}
      style={{ background:bg, padding:pad,
        color: isDark||isTeal?"#F3EFE4":"var(--ink)",
        cursor:onClick?"pointer":(hover?"default":"default"), ...style }}>
      {children}
    </div>
  );
}

/* inset well (for chart areas / chips containers) */
function Well({ children, pad=16, style }) {
  return <div style={{ background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", padding:pad, ...style }}>{children}</div>;
}

/* ---- in-app page help ----
   PAGE_GUIDES (keyed by normalized page title) holds the "How to use this page"
   content. PageHead renders the toggle + this panel automatically when a guide
   exists for its title — so adding help to a page = adding an entry here. */
function pageGuideKey(title){ return String(title||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function PageGuidePanel({ guide, onClose }){
  if(!guide) return null;
  const Lbl = ({ children })=>(<div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", color:"var(--faint)", margin:"14px 0 6px" }}>{children}</div>);
  return (
    <SoftCard hover={false} className="rise" style={{ marginBottom:22, borderLeft:"3px solid var(--t-500)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
        <div style={{ fontSize:14.5, fontWeight:800, display:"flex", alignItems:"center", gap:8 }}><Icon name="help" size={17} style={{ color:"var(--t-700)" }} />How to use this page</div>
        <button onClick={onClose} title="Close" style={{ border:"none", background:"transparent", cursor:"pointer", color:"var(--faint)", padding:2, lineHeight:0 }}><Icon name="x" size={16} /></button>
      </div>
      {guide.what && <p style={{ fontSize:13.5, color:"var(--ink-2)", lineHeight:1.6, margin:"9px 0 0" }}>{guide.what}</p>}
      {guide.setup && <div style={{ fontSize:12.5, color:"#7E5A14", background:"var(--gold-bg)", padding:"9px 12px", borderRadius:"var(--r-md)", marginTop:11, display:"flex", gap:7, alignItems:"flex-start" }}><Icon name="lock" size={13} sw={2.4} style={{ marginTop:2, flexShrink:0 }} /><span><b>Setup needed:</b> {guide.setup}</span></div>}
      {Array.isArray(guide.how) && guide.how.length>0 && (<><Lbl>Steps</Lbl>
        <ol style={{ margin:0, paddingLeft:18, display:"flex", flexDirection:"column", gap:5 }}>{guide.how.map((h,i)=>(<li key={i} style={{ fontSize:13, color:"var(--ink-2)", lineHeight:1.5 }}>{h}</li>))}</ol></>)}
      {Array.isArray(guide.options) && guide.options.length>0 && (<><Lbl>Options &amp; controls</Lbl>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>{guide.options.map((o,i)=>(
          <div key={i} style={{ fontSize:12.5, lineHeight:1.5 }}><span style={{ fontWeight:700, color:"var(--t-700)" }}>{o.label}</span><span style={{ color:"var(--muted)" }}> — {o.desc}</span></div>
        ))}</div></>)}
    </SoftCard>
  );
}

/* Per-page help content, keyed by pageGuideKey(title). PageHead shows the
   "How to use" toggle automatically for any page whose title matches a key. */
const PAGE_GUIDES = {
  "sites": {
    what: "Connect, detect and switch between WordPress accounts. Each card shows the detected stack, scale, mu-plugin status and write-armed state.",
    how: ["Click “Connect a site” and complete the 3-step wizard (credentials → detection → capabilities).", "Click “Set active” to scope the whole app to that site.", "Use “Re-detect” after installing/updating the mu-plugin, or “Re-authenticate” if a credential fails."],
    options: [
      { label: "Connect a site", desc: "Opens the add-site wizard." },
      { label: "Set active", desc: "Makes this the active site for every other screen." },
      { label: "Re-detect", desc: "Re-runs stack + mu-plugin detection without reconnecting." },
      { label: "Run audit", desc: "Starts a read-only audit of the active site." },
    ],
    setup: "Needs a WordPress application password (least-privilege). Staging URL optional.",
  },
  "executive-scorecard": {
    what: "A one-screen weekly health view — organic value, value at risk, AI share-of-voice, a composite score, anomalies, trends and a RICE “do next” worklist.",
    how: ["Open the page — it loads automatically for a connected site.", "Click “Weekly briefing” to have the AI narrate the numbers.", "Click “Refresh” to recompute, or “Open worklist” for the ranked fixes."],
    options: [
      { label: "Weekly briefing", desc: "AI narrative that describes (never recomputes) the figures." },
      { label: "Refresh", desc: "Recomputes the scorecard from your live data." },
      { label: "Open worklist", desc: "Jumps to the RICE-ranked fix list in Audits." },
    ],
    setup: "Needs a connected live site. Figures degrade gracefully when GSC / DataForSEO / GEO aren't connected.",
  },
  "content-opportunities": {
    what: "Builds keyword clusters from your rankings, competitors and live trends in your target market, gap-checked against your sitemap — plus trending topics and Google “People Also Ask”. Everything is pushable to your Article Writer table.",
    how: ["Pick your target country, then click “Find opportunities”.", "Add ideas with “What's trending?” and the People-Also-Ask seed + “Find questions”.", "Filter clusters and click a “Send → Airtable” button to queue articles (set Status to “Write Article” in Airtable to generate)."],
    options: [
      { label: "Target country", desc: "Sets the market for opportunities, trends and briefs." },
      { label: "Find opportunities / Re-analyze", desc: "Gathers + clusters keywords." },
      { label: "Generate brief (per cluster)", desc: "Researches a full outline — send THIS (not the bare cluster) for the best article." },
      { label: "Send gaps / Send N → Airtable", desc: "Pushes gap or shown clusters into the Article Writer table." },
      { label: "Send brief → Article Writer", desc: "Sends the generated brief (real outline) into the row's Content Brief." },
      { label: "All / Gaps / Trending / From competitors", desc: "Filters the cluster list." },
    ],
    setup: "Needs a connected live site; pushing needs Airtable connected (Push to Airtable screen).",
  },
  "content-intelligence": {
    what: "The AI reads your published titles to map existing topic clusters, find gaps competitors fill, and propose new articles with target keywords.",
    how: ["Choose your target country, then click “Analyze content” (~30–60s).", "Review the clusters, gaps and article suggestions.", "Click “Push to Airtable” to send the keyword set to your article writer."],
    options: [
      { label: "Target country", desc: "Sets the market for the analysis." },
      { label: "Analyze content / Re-analyze", desc: "Runs the AI content-library analysis (read-only)." },
      { label: "Push to Airtable", desc: "Pushes primary + related, gap and suggestion keywords (de-duped) to Airtable." },
    ],
    setup: "Needs a connected live site; pushing needs Airtable connected.",
  },
  "search-console": {
    what: "First-party Google data — real clicks, impressions, CTR and position — across Top Queries, Top Pages, Quick Wins (11–20), Content Decay, Anomalies and Indexing. One Google connect re-links all your sites.",
    how: ["Click “Connect with Google” and approve read-only access.", "Pick the matching property in the property switcher.", "Open a tab (e.g. Content Decay) and click “Refresh” to load the data."],
    options: [
      { label: "Connect with Google", desc: "One-click read-only Search Console OAuth." },
      { label: "Property switcher", desc: "Maps the active site to one of your GSC properties." },
      { label: "Tabs", desc: "Top Queries · Top Pages · Quick Wins · Content Decay · Anomalies · Indexing." },
      { label: "Content Decay tab", desc: "Finds pages losing clicks (last 28d vs prior 28d); can auto-refresh + re-optimise them." },
    ],
    setup: "Connect Google Search Console first (live site required).",
  },
  "ai-visibility-geo": {
    what: "Measures how often AI assistants cite your site vs competitors for real buyer-intent prompts — the GEO equivalent of rank tracking. Can also publish entity signals and an llms.txt file to improve citation.",
    how: ["Optionally add competitor domains and a per-site AI context, then “Save context”.", "Click “Measure AI visibility” to run the scan.", "Target the uncited “Opportunities” prompts; use “Publish entity signals” / “Publish to site” to boost citation."],
    options: [
      { label: "Competitors", desc: "Domains benchmarked in the same AI answers." },
      { label: "Site context / Save context", desc: "Steers prompt generation; saved per site." },
      { label: "Measure AI visibility / Re-scan", desc: "Generates prompts, asks them with live web search, scores share-of-voice." },
      { label: "Publish entity signals", desc: "Writes Organization/entity schema to the homepage." },
      { label: "Preview llms.txt / Publish to site", desc: "Previews then publishes the llms.txt + AI-robots file." },
    ],
    setup: "Needs a connected live site; publishing needs write mode armed.",
  },
  "dataforseo": {
    what: "Live search-performance data for your domain — top keywords, traffic value (clicks × CPC), striking-distance keywords, competitors, and a keyword-gap tool that pushes straight to Airtable.",
    how: ["Pick the keyword-data market, then click “Load DataForSEO data”.", "Switch tabs (Traffic Value, Striking Distance, Keyword Gap…).", "In Keyword Gap, click “Push gaps → Airtable”."],
    options: [
      { label: "Market (country)", desc: "Country DataForSEO pulls rankings/volumes/competitors from." },
      { label: "Balance chip", desc: "Remaining DataForSEO credit." },
      { label: "Load / Refresh", desc: "Loads or reloads the dataset." },
      { label: "Model traffic value", desc: "Estimates click/value uplift (no extra credits)." },
      { label: "Push gaps → Airtable", desc: "Sends keyword-gap keywords to Airtable." },
    ],
    setup: "Needs the DataForSEO key configured; pushing needs Airtable connected.",
  },
  "airtable-sync": {
    what: "Connects this site to its Airtable base and pushes content-gap keywords (one row each) into your Article Writer table, where your Airtable + n8n automation writes the articles. Includes an editable grid.",
    how: ["Paste your Airtable Personal Access Token and click “Connect”.", "Pick the Base, Table and Keyword column.", "Click “Push content-gap keywords”; in the grid, set a row's Status to “Write Article” to trigger writing."],
    options: [
      { label: "Personal Access Token + Connect", desc: "Stores an encrypted token (records read/write + schema read)." },
      { label: "Base / Table / Keyword column", desc: "Per-site destination mapping." },
      { label: "Push keywords", desc: "Adds new gap keywords (skips ones already there)." },
      { label: "Records grid · Status", desc: "Edit rows in-place; set Status = “Write Article” to fire the n8n flow." },
    ],
    setup: "Needs a connected live site and an Airtable Personal Access Token granted to the base.",
  },
  "on-page-fixes": {
    what: "Generates and applies on-page improvements — internal/external links, schema, AI-citation facts, CSS, image WebP and a speed test. Every change is human-reviewed before it touches the live page.",
    how: ["Pick a tool tab (Internal Links, Schema, etc.).", "Enter a page URL where required and click the generate button.", "Review each suggestion and click “Approve” (or “Approve & push all”)."],
    options: [
      { label: "Tabs", desc: "Internal Links · External Links · Schema · AI-SEO Facts · CSS · Images · Speed Test." },
      { label: "Page URL", desc: "Target page for the active tool." },
      { label: "Approve / Approve & push all", desc: "Writes the change live (page-builder pages are flagged “add in editor”)." },
    ],
    setup: "Needs a connected live site; live writes need the seo-agent-optimize mu-plugin + write mode armed.",
  },
  "audits-reports": {
    what: "Read-only audits with prioritized in-app findings: per-category “Road to 100” gaps, a RICE impact × effort worklist, and a filterable findings list you can turn into fix proposals.",
    how: ["Click “Run audit” (choose the scope).", "Click “Prioritize findings” to build the RICE worklist.", "Expand a finding and click “Propose fix”; “Export” saves the report."],
    options: [
      { label: "Run audit", desc: "Read-only audit (single / key / full-site)." },
      { label: "Prioritize findings", desc: "Scores findings by RICE and plots impact × effort." },
      { label: "Filters", desc: "All · SEO · Perf · A11y · Images." },
      { label: "Propose fix / Mark done", desc: "Queue a fix to Review, or dismiss the finding." },
    ],
    setup: "Needs a connected live site; connecting GSC weights the worklist by real per-page clicks.",
  },
  "audit-history": {
    what: "Every saved audit as a score-trend chart, plus a correlation matrix showing whether your Core Web Vitals / Lighthouse scores track with this site's rankings and clicks.",
    how: ["Click “Run audit” to add a data point.", "Switch the chart range (Day / Week / Month / Year).", "Click “Analyze correlations” once you have ≥3 audits."],
    options: [
      { label: "Run audit", desc: "Runs a fresh audit and appends it to history." },
      { label: "Day / Week / Month / Year", desc: "Buckets the score-trend chart." },
      { label: "Analyze correlations", desc: "Computes rank correlations across audit + GSC history." },
    ],
    setup: "History is per-account; correlation needs ≥3 audits. Connecting GSC adds real ranking/click columns.",
  },
  "review-queue": {
    what: "The human-in-the-loop gate: review every proposed change with before/after diffs, risk and target, then approve, edit, reject, and apply in a verified batch (snapshot + verify + rollback).",
    how: ["Expand a proposal to see its diff and risk.", "Approve, Edit or Reject it (or “Bulk-approve low-risk”).", "Click “Apply” to push approved changes safely."],
    options: [
      { label: "Bulk-approve low-risk", desc: "Approves all low-risk proposals at once." },
      { label: "Apply (N)", desc: "Applies approved changes in a safe batch (disabled when writes are blocked)." },
      { label: "Approve / Edit / Reject", desc: "Per proposal." },
      { label: "Roll back", desc: "Reverts a verified change." },
    ],
    setup: "Applying needs write mode armed and the global kill switch released.",
  },
  "activity": {
    what: "A complete, exportable audit trail of every write, approval, rollback, audit, connection and failure across sites — with one-click rollback on reversible entries.",
    how: ["Filter by type (Writes / Approvals / Rollbacks / Failures).", "Click “Roll back” on a reversible entry to open it in Review.", "Click “Export trail” to download the log."],
    options: [
      { label: "Filters", desc: "All · Writes · Approvals · Rollbacks · Failures." },
      { label: "Roll back", desc: "Sends a write back to Review to reverse it." },
      { label: "Export trail", desc: "Exports the full audit trail." },
    ],
    setup: null,
  },
  "experience-monitor": {
    what: "A privacy-first beacon that detects UX/conversion defects (broken CTAs, dead links, mis-sized tap targets, friction) on your ranking pages, joined to GSC organic traffic so you fix what costs the most exposure first.",
    how: ["Pick a sampling rate and click “Install beacon” (after compliance sign-off).", "Let consented sessions accumulate, then “Refresh” to load defects.", "Per defect: Apply the fix, Propose it to Review, or Ignore."],
    options: [
      { label: "Beacon ON/OFF", desc: "Header kill switch to arm or disable collection." },
      { label: "Sampling rate (2/5/10%)", desc: "Share of consented sessions observed; lower = lighter footprint." },
      { label: "Install beacon", desc: "Arms the beacon (gated on compliance sign-off)." },
      { label: "Apply / Propose / Ignore", desc: "Per defect: push the fix, send to Review, or suppress it." },
    ],
    setup: "Hidden until RUM is enabled server-side; needs per-site compliance sign-off before arming. Events accrue slowly — gated on consent × sample × real traffic.",
  },
  "ux-activation": {
    what: "Cross-site control room for the Experience beacon: detect each site's consent stack, wire/verify the beacon, update the mu-plugin, and arm/disarm collection per site.",
    how: ["Click “Re-probe” to detect each site's consent + plugin state.", "Run the self-test (and “Enable banner” / “Update mu-plugin” if prompted).", "“Arm” a site (defaults 5%, gated on consent + sign-off), or “Disarm” it."],
    options: [
      { label: "Re-probe", desc: "Re-detects consent stack, RUM switch and mu-plugin versions across sites." },
      { label: "Self-test", desc: "Verifies the beacon end-to-end for a site." },
      { label: "Arm / Disarm", desc: "Turns collection on (gated on consent + sign-off) or off." },
      { label: "Enable banner / Update mu-plugin", desc: "Turn on a first-party consent banner, or push the latest beacon plugin." },
    ],
    setup: "Needs RUM enabled server-side; arming needs sign-off + a detected consent cookie/CMP.",
  },
  "settings": {
    what: "Per-site capabilities, safety switches and credentials — toggle agent capabilities, set brand constraints, DRY_RUN / staging / write mode, manage the app password, and use the global kill switch.",
    how: ["Toggle the agent capabilities you want enabled.", "Set the safety switches (DRY_RUN, Staging-first, Write mode).", "Manage the credential; use the kill switch to halt all writes instantly."],
    options: [
      { label: "Capability toggles", desc: "Enable/disable per-site agent capabilities." },
      { label: "Brand constraints", desc: "Things the agent must never change (colors, fonts, phrases)." },
      { label: "DRY_RUN / Staging-first / Write mode", desc: "Simulate writes · route to staging first · arm/disarm live writes." },
      { label: "Global kill switch", desc: "Instantly disables every write across all sites." },
    ],
    setup: "Staging-first needs a configured staging URL; capabilities/credentials are per-site.",
  },
  "admin-panel": {
    what: "System health + integration status (API keys, runtime, market, write mode) plus an editable per-site library of every AI system prompt. Prompt edits go live on the next AI call.",
    how: ["Use “System & Integrations” to see which services are connected (green/red dots).", "Switch to “AI Prompts” to edit a prompt for the active site.", "Use “Test” to preview, then “Save” (or “Reset” to clear the override)."],
    options: [
      { label: "System & Integrations / AI Prompts", desc: "Toggle health dashboard vs prompt editor." },
      { label: "Diff / History / Test / Reset / Save", desc: "Per-prompt: compare vs default, versions, dry-run, restore, persist." },
      { label: "Model / Temperature", desc: "Per-prompt model + temperature overrides." },
    ],
    setup: "Engine must be online; prompt persistence needs the Supabase prompts table.",
  },
  "playbook": {
    what: "A guided, top-to-bottom checklist of the standard workflow for this site. Each step shows its status and whether it writes to the live site, off-site, or is read-only.",
    how: ["Work the steps top to bottom.", "Click “Open” on the next incomplete step to jump to that tool.", "Watch the done counter climb as steps complete."],
    options: [
      { label: "Open / View", desc: "Jumps to the screen (and sub-tab) for that step." },
      { label: "x/y done chip", desc: "Progress counter of completed steps." },
    ],
    setup: "Connect a live WordPress site to begin (step 1).",
  },
  "ai-strategist": {
    what: "A live chat assistant that reads the active site's audits, keywords, competitor gaps and AI-visibility, then answers strategic questions and drafts briefs grounded in your real data.",
    how: ["Pick the site in the “Working on” selector.", "Type a question (or click a suggested prompt) and send — attach an image or use voice if needed.", "Use “New chat” to start over, the History list to reopen past chats, or “Export” to save as Markdown."],
    options: [
      { label: "Working on", desc: "Chooses which connected site's data the assistant can see." },
      { label: "Suggested prompts", desc: "One-click starter questions (gaps, opportunities, briefs)." },
      { label: "New chat / History", desc: "Start fresh, or reopen and delete saved conversations." },
      { label: "Attach / Voice / Send / Stop", desc: "Composer controls — image input, dictation, send, stop generating." },
      { label: "Export", desc: "Downloads the conversation as Markdown." },
    ],
    setup: "Requires at least one connected WordPress site.",
  },
};
if (typeof window !== "undefined") window.PAGE_GUIDES = PAGE_GUIDES;

function NeoButton({ children, icon, iconR, kind="primary", size="md", onClick, disabled, full, title, style, className="" }) {
  const sz = size==="sm"?{py:9,px:14,fs:13,ic:16}: size==="lg"?{py:14,px:22,fs:15,ic:19}:{py:11,px:18,fs:14,ic:17};
  const styles = {
    primary:{ bg:"var(--t-700)", fg:"#F3EFE4", sh:"4px 4px 11px rgba(20,80,72,.34), -3px -3px 9px rgba(255,255,255,.65)" },
    dark:{ bg:"var(--dark)", fg:"#F3EFE4", sh:"4px 4px 11px rgba(40,36,28,.4), -3px -3px 9px rgba(255,255,255,.5)" },
    soft:{ bg:"var(--surface)", fg:"var(--t-700)", sh:"var(--neo-sm)" },
    ghost:{ bg:"transparent", fg:"var(--ink-2)", sh:"none" },
  };
  const p = styles[kind]||styles.primary;
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={"neo-btn "+className}
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        background:p.bg, color:p.fg, boxShadow:p.sh, borderRadius:"var(--r-pill)",
        padding:`${sz.py}px ${sz.px}px`, fontSize:sz.fs, fontWeight:700, width:full?"100%":"auto", whiteSpace:"nowrap",
        opacity:disabled?.45:1, cursor:disabled?"not-allowed":"pointer", ...style }}>
      {icon && <Icon name={icon} size={sz.ic} />}{children}{iconR && <Icon name={iconR} size={sz.ic} />}
    </button>
  );
}

function Chip({ children, tone="gray", icon, dot, solid, size="md", style }) {
  const [fg,bg,ln] = TT[tone]||TT.gray;
  const s = size==="sm"?{fs:11.5,py:4,px:9,g:5}:{fs:12.5,py:5,px:11,g:6};
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:s.g, fontSize:s.fs, fontWeight:700, lineHeight:1,
      padding:`${s.py}px ${s.px}px`, borderRadius:"var(--r-pill)", whiteSpace:"nowrap",
      background:solid?fg:bg, color:solid?"#F3EFE4":fg, boxShadow: solid?"none":"var(--neo-xs)", ...style }}>
      {dot && <span style={{ width:6,height:6,borderRadius:99,background:solid?"#F3EFE4":fg }} />}
      {icon && <Icon name={icon} size={s.fs} />}{children}
    </span>
  );
}

function Toggle({ on, onChange, disabled, size=44 }) {
  const h = Math.round(size*0.55);
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={()=>!disabled&&onChange&&onChange(!on)}
      style={{ width:size, height:h, borderRadius:99, padding:3, flexShrink:0, position:"relative",
        background: on?"var(--t-600)":"var(--bg)", boxShadow: on?"inset 2px 2px 5px rgba(10,60,54,.5)":"var(--neo-in)",
        opacity:disabled?.5:1, transition:"background .2s", cursor:disabled?"not-allowed":"pointer" }}>
      <span style={{ display:"block", width:h-6, height:h-6, borderRadius:99, background:"var(--surface-hi)",
        boxShadow:"2px 2px 5px rgba(120,108,84,.45)", transform:`translateX(${on?size-h:0}px)`, transition:"transform .22s cubic-bezier(.3,.8,.4,1.2)" }} />
    </button>
  );
}

function tealForScore(v){ return v>=85?"var(--t-500)": v>=65?"var(--t-700)": v>=45?"var(--gold)":"var(--clay)"; }

/* respects reduced-motion */
const prefersReduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* count-up animation hook — animates from previous value to target */
function useCountUp(target, { duration=850, decimals=0, run=true } = {}) {
  const [val, setVal] = useState(run ? 0 : target);
  const raf = useRef(0);
  const fromRef = useRef(0);
  useEffect(()=>{
    if(!run){ setVal(target); fromRef.current=target; return; }
    if(prefersReduced()){ setVal(target); fromRef.current=target; return; }
    const start = performance.now();
    const from = fromRef.current;
    const tick = (now)=>{
      const t = Math.min(1,(now-start)/duration);
      const e = 1-Math.pow(1-t,3);
      setVal(from + (target-from)*e);
      if(t<1) raf.current = requestAnimationFrame(tick);
      else { setVal(target); fromRef.current=target; }
    };
    raf.current = requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf.current);
  },[target, run, duration]);
  const factor = Math.pow(10, decimals);
  return Math.round(val*factor)/factor;
}

/* radial gauge */
function Gauge({ value, size=160, sw=16, label, sub, center }) {
  const r=(size-sw)/2, c=2*Math.PI*r, col=tealForScore(value);
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c-(c*value)/100}
          style={{ transition:"stroke-dashoffset 1.1s cubic-bezier(.3,.8,.3,1)" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        {center ? center : <>
          <span style={{ fontSize:size*0.26, fontWeight:800, color:col, lineHeight:1 }}>{value}</span>
          {label && <span style={{ fontSize:size*0.085, color:"var(--muted)", fontWeight:600, marginTop:4 }}>{label}</span>}
          {sub && <span style={{ fontSize:size*0.07, color:"var(--faint)", marginTop:2 }}>{sub}</span>}
        </>}
      </div>
    </div>
  );
}

function Ring({ value, size=64, sw=7, label }) {
  const r=(size-sw)/2, c=2*Math.PI*r, col=tealForScore(value);
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c-(c*value)/100} style={{ transition:"stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center" }}>
        <span style={{ fontSize:size*0.30, fontWeight:800, color:col }}>{value}</span>
      </div>
    </div>
  );
}

function SectionHead({ children, sub, right, light }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, gap:12 }}>
      <div>
        <h3 style={{ margin:0, fontSize:17, fontWeight:700, letterSpacing:"-.01em", color: light?"#F3EFE4":"var(--ink)" }}>{children}</h3>
        {sub && <div style={{ fontSize:12.5, color: light?"rgba(243,239,228,.6)":"var(--muted)", marginTop:3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Glyph({ color, char, size=40, r=13, light }) {
  return <div style={{ width:size, height:size, borderRadius:r, flexShrink:0, background:color, color:"#F7F3EA",
    display:"grid", placeItems:"center", fontWeight:800, fontSize:size*0.42,
    boxShadow: light?"none":"3px 3px 8px rgba(120,108,84,.4), inset 0 -2px 5px rgba(0,0,0,.12)" }}>{char}</div>;
}

/* ---- modal ---- */
function SoftModal({ open, onClose, children, w=580 }) {
  useEffect(()=>{ if(!open) return; const h=e=>e.key==="Escape"&&onClose&&onClose(); window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[open,onClose]);
  if(!open) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:90, background:"rgba(42,38,32,.40)", backdropFilter:"blur(5px)", display:"grid", placeItems:"center", padding:24, animation:"pop .2s both" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:w, maxWidth:"100%", maxHeight:"90vh", background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"0 30px 80px rgba(40,36,28,.4)", border:"1px solid var(--line-soft)", overflow:"hidden", display:"flex", flexDirection:"column", animation:"rise .3s both" }}>
        {children}
      </div>
    </div>
  );
}
function SoftModalHead({ title, sub, onClose, icon, tone="teal" }) {
  const [fg,bg] = TT[tone]||TT.teal;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:13, padding:"20px 22px", borderBottom:"1px solid var(--line-soft)" }}>
      {icon && <div style={{ width:42, height:42, borderRadius:13, background:bg, color:fg, display:"grid", placeItems:"center", boxShadow:"var(--neo-xs)" }}><Icon name={icon} size={20} /></div>}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{title}</div>
        {sub && <div style={{ fontSize:13, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
      </div>
      {onClose && <button onClick={onClose} className="neo-btn" style={{ width:34, height:34, borderRadius:11, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="x" size={18} /></button>}
    </div>
  );
}

/* ---- diff block ---- */
function SoftDiff({ field, before, after }) {
  return (
    <div style={{ fontFamily:"var(--mono)", fontSize:12.5, borderRadius:"var(--r-md)", overflow:"hidden", boxShadow:"var(--neo-in)", background:"var(--bg)" }}>
      {field && <div style={{ padding:"7px 13px", color:"var(--muted)", fontWeight:600, borderBottom:"1px solid var(--line)", fontSize:11.5 }}>{field}</div>}
      <div style={{ display:"flex", gap:9, padding:"10px 13px", alignItems:"flex-start", color:"#9A4A37" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>−</span><span style={{ lineHeight:1.5 }}>{before}</span>
      </div>
      <div style={{ display:"flex", gap:9, padding:"10px 13px", alignItems:"flex-start", color:"var(--t-700)", background:"var(--t-50)" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>+</span><span style={{ lineHeight:1.5 }}>{after}</span>
      </div>
    </div>
  );
}

/* discipline + status maps */
const softDisc = {
  performance:{ icon:"bolt", tone:"gold", label:"Performance" },
  seo:{ icon:"search", tone:"teal", label:"SEO" },
  image:{ icon:"image", tone:"plum", label:"Images" },
  accessibility:{ icon:"a11y", tone:"plum", label:"Accessibility" },
  geo:{ icon:"sparkles", tone:"teal", label:"AI-SEO" },
};
const softStatus = {
  connected:{ tone:"teal", label:"Connected", icon:"check" },
  "auth-failed":{ tone:"clay", label:"Auth failed", icon:"lock" },
  unreachable:{ tone:"gold", label:"Unreachable", icon:"alert" },
};
const impactTone = { high:["clay","High"], medium:["gold","Medium"], low:["teal","Low"] };
function SoftRisk({ risk }) {
  const m = { low:["teal","Low risk"], medium:["gold","Medium risk"], high:["clay","High risk"] };
  const [tone,label]=m[risk]||m.low;
  return <Chip tone={tone} size="sm" dot>{label}</Chip>;
}

/* form field */
function SoftInput(props){
  return <input {...props} className={"sin "+(props.className||"")} />;
}
function Field({ label, hint, children }) {
  return (
    <label style={{ display:"block" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:13, fontWeight:700 }}>{label}</span>
        {hint && <span style={{ fontSize:11.5, color:"var(--faint)" }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

// Searchable country/market picker — soft-UI dropdown with a filter box. Replaces the native
// <select> used for the per-site market. value = db code, options = [{db,label}], onChange(db).
function CountrySelect({ value, options, onChange, title }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const opts = (options && options.length) ? options : [{ db: value, label: String(value || "").toUpperCase() }];
  const cur = opts.find((o) => o.db === value);
  const label = cur ? cur.label : String(value || "").toUpperCase();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); } };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? opts.filter((o) => String(o.label || "").toLowerCase().includes(ql) || String(o.db || "").toLowerCase().includes(ql)) : opts;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" title={title || "Target country / market"} onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px 6px 11px", borderRadius: 99, border: "none", background: "var(--surface)", boxShadow: open ? "var(--neo-in)" : "var(--neo-xs)", fontSize: 12, fontWeight: 700, color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>
        <Icon name="globe" size={13} style={{ color: "var(--t-700)" }} />
        <span>{label}</span>
        <span style={{ color: "var(--muted)", fontSize: 10, marginLeft: -1 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200, width: 250, background: "var(--surface)", borderRadius: "var(--r-md)", boxShadow: "0 14px 38px rgba(0,0,0,.18)", padding: 8 }}>
          <div style={{ position: "relative", marginBottom: 6 }}>
            <Icon name="search" size={13} style={{ color: "var(--faint)", position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search countries…"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px 8px 31px", borderRadius: "var(--r-pill)", border: "none", background: "var(--bg)", boxShadow: "var(--neo-in)", fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
          </div>
          <div className="scroll" style={{ maxHeight: 256, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((o) => (
              <button key={o.db} type="button" onClick={() => { onChange(o.db); setOpen(false); setQ(""); }}
                style={{ textAlign: "left", padding: "8px 11px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: o.db === value ? 700 : 500, background: o.db === value ? "var(--t-50)" : "transparent", color: o.db === value ? "var(--t-700)" : "var(--ink)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                onMouseEnter={(e) => { if (o.db !== value) e.currentTarget.style.background = "var(--bg)"; }}
                onMouseLeave={(e) => { if (o.db !== value) e.currentTarget.style.background = "transparent"; }}>
                <span>{o.label}</span>{o.db === value && <Icon name="check" size={13} sw={2.6} style={{ color: "var(--t-700)" }} />}
              </button>
            ))}
            {!filtered.length && <div style={{ padding: "9px 11px", fontSize: 12.5, color: "var(--muted)" }}>No country matches “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  Icon, SoftCard, Well, NeoButton, Chip, Toggle, Gauge, Ring, SectionHead, Glyph, CountrySelect,
  PageGuidePanel, pageGuideKey, PAGE_GUIDES,
  SoftModal, SoftModalHead, SoftDiff, SoftRisk, SoftInput, Field,
  softDisc, softStatus, impactTone,
  tealForScore, useCountUp, prefersReduced, TT, useState, useEffect, useRef, useCallback
});
