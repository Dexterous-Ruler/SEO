/* ===========================================================
   Sentinel — Soft-UI dashboard, collapsible sidebar, app
   =========================================================== */
/* Sidebar grouped into clean, collapsible sections (sub-sections = the items). */
const SNAV_GROUPS = [
  { group:"Start", items:[
    { k:"playbook", label:"Playbook", icon:"check" },
  ]},
  { group:"Overview", items:[
    { k:"overview", label:"Dashboard", icon:"grid" },
    { k:"exec",     label:"Executive Scorecard", icon:"flag" },
    { k:"activity", label:"Activity",  icon:"clock" },
  ]},
  { group:"Find & Fix Issues", items:[
    { k:"audits",   label:"Audits",    icon:"radar" },
    { k:"optimize", label:"Page Fixes", icon:"bolt" },
    { k:"review",   label:"Approve Changes", icon:"list", badge:true },
    { k:"history",  label:"Audit History", icon:"trend" },
    // Experience Monitor — hidden until the operator turns the feature on
    // (window.SENTINEL_RUM); inert-by-default so the nav is unchanged otherwise.
    { k:"experience", label:"Experience Monitor", icon:"gauge", gated:"rum" },
    { k:"uxactivation", label:"UX Activation", icon:"shield" },
  ]},
  { group:"Plan & Create Content", items:[
    { k:"plan",     label:"Content Plan", icon:"sparkles" },
    { k:"engine",   label:"Content Engine", icon:"layers" },
    { k:"content",  label:"Content Analysis", icon:"sparkles" },
    { k:"gsc",      label:"Content Decay", icon:"trend", tab:"decay" },
    { k:"geo",      label:"AI Search Visibility", icon:"globe" },
  ]},
  { group:"Connect Data", items:[
    { k:"gsc",      label:"Search Console", icon:"search" },
    { k:"semrush",  label:"Keyword Research", icon:"bolt" },
    { k:"airtable", label:"Airtable", icon:"layers" },
  ]},
  { group:"Assistant", items:[
    { k:"chat",     label:"Ask AI", icon:"sparkles" },
  ]},
  { group:"Account & Settings", items:[
    { k:"sites",    label:"Sites",     icon:"globe" },
    { k:"admin",    label:"Admin Panel", icon:"gauge" },
    { k:"n8n",      label:"n8n Workflows", icon:"cog" },
    { k:"settings", label:"Settings",  icon:"cog" },
  ]},
];
// Flat list kept for any code that needs label/icon lookup by screen key.
const SNAV = SNAV_GROUPS.flatMap(g=>g.items);
const SNAV_BY_KEY = Object.fromEntries(SNAV.map(it=>[it.k, it]));

/* ---- Universal command index: every screen AND sub-tool, with synonyms, so
   the search bar can jump straight to any function (e.g. "speed" → Speed Test).
   `tab` deep-links into a screen's sub-tab via ctx.goto(screen, tab). ---- */
const NAV_INDEX = [
  { title:"Playbook", screen:"playbook", icon:"check", kw:"playbook start here steps guide workflow checklist process standard get started 1 2 3 what to do next status live" },
  { title:"Dashboard", screen:"overview", icon:"grid", kw:"home overview stats site health fix queue summary scores" },
  { title:"Executive Scorecard", screen:"exec", icon:"flag", kw:"executive scorecard composite score organic value weekly briefing do next rice quick wins board report narrative" },
  { title:"Activity Log", screen:"activity", icon:"clock", kw:"activity log audit trail history writes approvals rollbacks failures export changes" },
  { title:"Audits", screen:"audits", icon:"radar", kw:"audit findings road to 100 propose fix ranked rice worklist lighthouse issues scan" },
  { title:"On-Page Fixes", screen:"optimize", icon:"bolt", kw:"on page fixes optimize tools" },
  { title:"Internal Links", screen:"optimize", tab:"links", icon:"link", kw:"internal links link building anchor text structure orphan approve push apply" },
  { title:"External Links", screen:"optimize", tab:"ext", icon:"globe", kw:"external outbound links authoritative sources citations gov official approve push apply" },
  { title:"Schema Markup", screen:"optimize", tab:"schema", icon:"layers", kw:"schema structured data json-ld rich results markup generate" },
  { title:"AI-SEO Facts", screen:"optimize", tab:"facts", icon:"sparkles", kw:"ai seo facts citable faq faqpage extract llm citation" },
  { title:"CSS Fixes", screen:"optimize", tab:"css", icon:"bolt", kw:"css core web vitals render blocking unused styles generate" },
  { title:"Images / WebP", screen:"optimize", tab:"images", icon:"image", kw:"images webp avif scan media compress optimization lazy load" },
  { title:"Speed Test", screen:"optimize", tab:"speed", icon:"gauge", kw:"speed test pagespeed lighthouse performance lcp inp cls mobile desktop psi" },
  { title:"Review Queue", screen:"review", icon:"list", kw:"review queue proposals approve reject edit diff verify pending changes" },
  { title:"Audit History", screen:"history", icon:"trend", kw:"audit history past audits score trend regression timeline" },
  { title:"Content Plan", screen:"plan", icon:"sparkles", kw:"content plan trending topics find opportunities keyword clusters gaps calendar ideas" },
  { title:"Content Engine", screen:"engine", icon:"layers", kw:"content engine unified worklist deduped scored opportunities keywords trending people also ask paa ai visibility geo one queue run ingest sources" },
  { title:"n8n Workflows", screen:"n8n", icon:"cog", kw:"n8n workflow automation edit prompts system prompt run execute trigger webhook node error execution writer article agent openai debug" },
  { title:"Content Intel", screen:"content", icon:"sparkles", kw:"content intelligence analyze content topic clusters suggestions" },
  { title:"AI Visibility (GEO)", screen:"geo", icon:"globe", kw:"ai visibility geo generative share of voice llms.txt ai robots chatgpt claude gemini perplexity citation competitors" },
  { title:"Search Console", screen:"gsc", icon:"search", kw:"search console gsc google clicks impressions ctr position connect google properties first party" },
  { title:"Top Queries", screen:"gsc", tab:"queries", icon:"search", kw:"top queries search terms gsc keywords" },
  { title:"Top Pages", screen:"gsc", tab:"pages", icon:"search", kw:"top pages gsc landing" },
  { title:"Quick Wins (positions 11–20)", screen:"gsc", tab:"striking", icon:"arrowUp", kw:"quick wins striking distance page 2 page two gsc near page 1" },
  { title:"Content Decay", screen:"gsc", tab:"decay", icon:"trend", kw:"content decay declining pages clicks lost refresh stale traffic drop" },
  { title:"GSC Anomalies", screen:"gsc", tab:"anomalies", icon:"alert", kw:"anomalies traffic drop ranking slip google update detection" },
  { title:"Indexing & Drops", screen:"gsc", tab:"indexing", icon:"layers", kw:"indexing index health submit url deindex coverage ranking drops" },
  { title:"DataForSEO", screen:"semrush", icon:"bolt", kw:"dataforseo semrush keyword data research" },
  { title:"Top Keywords", screen:"semrush", tab:"keywords", icon:"bolt", kw:"top keywords organic ranking search volume" },
  { title:"Traffic Value", screen:"semrush", tab:"value", icon:"flag", kw:"traffic value money roi revenue cpc estimated clicks worth" },
  { title:"Striking Distance", screen:"semrush", tab:"striking", icon:"arrowUp", kw:"striking distance page 2 quick wins keywords almost ranking" },
  { title:"Competitors", screen:"semrush", tab:"competitors", icon:"globe", kw:"competitors rivals domains track" },
  { title:"Keyword Gap", screen:"semrush", tab:"gap", icon:"layers", kw:"keyword gap competitor gaps opportunities missing keywords" },
  { title:"Airtable Sync", screen:"airtable", icon:"layers", kw:"airtable sync export base table connect" },
  { title:"AI Chat", screen:"chat", icon:"sparkles", kw:"ai chat strategist assistant ask question advice" },
  { title:"Admin Panel", screen:"admin", icon:"gauge", kw:"admin integrations system api keys connected anthropic supabase status" },
  { title:"AI Prompts", screen:"admin", tab:"prompts", icon:"doc", kw:"ai prompts edit prompt diff history test save template" },
  { title:"Sites", screen:"sites", icon:"globe", kw:"sites connect site wordpress account plugins theme run audit add site" },
  { title:"Settings", screen:"settings", icon:"cog", kw:"settings capabilities toggles dry run staging write mode credentials app password safety kill switch" },
];
// Token-AND substring match over title+keywords, ranked by title relevance.
function searchCommands(q){
  const s=(q||"").trim().toLowerCase(); if(!s) return [];
  const toks=s.split(/\s+/).filter(Boolean);
  const out=[];
  for(const c of NAV_INDEX){
    const titleL=c.title.toLowerCase(); const hay=titleL+" "+(c.kw||"").toLowerCase();
    let score=0, ok=true;
    for(const t of toks){ if(!hay.includes(t)){ ok=false; break; } if(titleL.startsWith(t)) score+=3; else if(titleL.includes(t)) score+=2; else score+=1; }
    if(ok) out.push({ c, score });
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.c);
}

/* ---------------- Collapsible Sidebar ---------------- */
function Sidebar({ ctx, collapsed, setCollapsed }) {
  const W = collapsed ? 84 : 256;
  // Collapsible section state (default: all open), persisted.
  const [openGroups,setOpenGroups] = useState(()=>{ try{ return JSON.parse(localStorage.getItem("sentinel-navgroups")||"{}"); }catch(e){ return {}; } });
  const isOpen=(g)=> openGroups[g]!==false;
  const toggleGroup=(g)=>setOpenGroups(o=>{ const n=Object.assign({},o,{[g]: o[g]===false}); try{localStorage.setItem("sentinel-navgroups",JSON.stringify(n));}catch(e){} return n; });
  const NavItem=(it)=>{
    const active = ctx.screen===it.k && (!it.tab || ctx.navTab===it.tab);
    const badge = it.badge ? ctx.proposals.filter(p=>p.status==="proposed").length : 0;
    return (
      <button key={it.k+(it.tab||"")} onClick={()=>ctx.goto(it.k, it.tab)} className={"nav-item "+(collapsed?"tip":"")} data-tip={it.label}
        style={{ display:"flex", alignItems:"center", gap:13, justifyContent: collapsed?"center":"flex-start",
          padding: collapsed?"12px":"11px 13px", borderRadius:14, position:"relative",
          background: active?"var(--surface)":"transparent",
          boxShadow: active?"var(--neo-sm)":"none",
          color: active?"var(--t-700)":"var(--ink-2)", fontWeight: active?700:600, fontSize:14 }}>
        <Icon name={it.icon} size={21} sw={active?2.2:1.9} />
        {!collapsed && <span style={{ flex:1, textAlign:"left" }}>{it.label}</span>}
        {!collapsed && badge>0 && <span style={{ fontSize:11, fontWeight:800, color:"#F3EFE4", background:"var(--t-600)", borderRadius:99, padding:"1px 7px", minWidth:20, textAlign:"center" }}>{badge}</span>}
        {collapsed && badge>0 && <span style={{ position:"absolute", top:8, right:12, width:8, height:8, borderRadius:99, background:"var(--gold)" }} />}
      </button>
    );
  };
  return (
    <aside style={{ width:W, flexShrink:0, padding: collapsed?"22px 14px":"24px 18px",
      display:"flex", flexDirection:"column", transition:"width .28s cubic-bezier(.4,.1,.2,1), padding .28s",
      position:"relative", zIndex:20 }}>
      {/* logo + collapse */}
      <div style={{ display:"flex", alignItems:"center", gap:12, justifyContent: collapsed?"center":"space-between", marginBottom:30 }}>
        {!collapsed && (
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:42, height:42, borderRadius:13, background:"var(--t-700)", display:"grid", placeItems:"center",
              boxShadow:"4px 4px 11px rgba(20,80,72,.34), -3px -3px 9px rgba(255,255,255,.6)" }}>
              <Icon name="shield" size={22} style={{ color:"#F3EFE4" }} fill />
            </div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, letterSpacing:"-.02em" }}>Sentinel</div>
              <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600, marginTop:-2 }}>WP SEO Agent</div>
            </div>
          </div>
        )}
        <button className="neo-btn tip" data-tip={collapsed?"Expand":"Collapse"} onClick={()=>setCollapsed(!collapsed)}
          style={{ width:40, height:40, borderRadius:12, background:"var(--surface)", display:"grid", placeItems:"center",
            color:"var(--ink-2)", boxShadow:"var(--neo-sm)" }}>
          <Icon name={collapsed?"chevR":"chevL"} size={20} sw={2.2} />
        </button>
      </div>

      {/* nav — grouped into collapsible sections; scrollable on short screens */}
      <nav className="scroll" style={{ flex:1, minHeight:0, overflowY:"auto", overflowX:"hidden", display:"flex", flexDirection:"column", gap: collapsed?7:2, margin:"0 -6px", padding:"0 6px" }}>
        {SNAV_GROUPS.map((grp,gi)=>{
          const open = collapsed ? true : isOpen(grp.group);
          return (
            <div key={grp.group} style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {collapsed
                ? (gi>0 && <div style={{ height:1, background:"var(--line-soft)", margin:"6px 12px" }} />)
                : (
                  <button onClick={()=>toggleGroup(grp.group)} className="nav-item"
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"11px 6px 5px", background:"transparent", boxShadow:"none", width:"100%" }}>
                    <span style={{ flex:1, textAlign:"left", fontSize:10.5, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:"var(--faint)" }}>{grp.group}</span>
                    <Icon name={open?"chevD":"chevR"} size={13} style={{ color:"var(--faint)" }} />
                  </button>
                )}
              {open && grp.items.filter(it=>!it.gated || (it.gated==="rum" && window.SENTINEL_RUM)).map(it=>NavItem(it))}
            </div>
          );
        })}
      </nav>

      {/* safety card */}
      {collapsed ? (
        <button className="neo-btn tip" data-tip={ctx.killSwitch?"Release kill switch":"Kill switch"} onClick={ctx.toggleKill}
          style={{ width:56, height:56, borderRadius:18, margin:"0 auto", display:"grid", placeItems:"center",
            background: ctx.killSwitch?"var(--clay)":"var(--surface)", color: ctx.killSwitch?"#F3EFE4":"var(--clay)", boxShadow:"var(--neo-sm)" }}>
          <Icon name="power" size={22} sw={2.2} />
        </button>
      ) : (
        <div style={{ borderRadius:18, padding:16, background: ctx.killSwitch?"var(--clay-bg)":"var(--surface)", boxShadow:"var(--neo-sm)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:9, height:9, borderRadius:99, background: ctx.killSwitch?"var(--clay)":"var(--t-500)", animation:"pulse 2s infinite" }} />
            <span style={{ fontSize:12.5, fontWeight:700, color: ctx.killSwitch?"var(--clay)":"var(--t-700)" }}>{ctx.killSwitch?"Writes off":"Safe mode"}</span>
          </div>
          <div style={{ fontSize:11.5, color:"var(--ink-2)", marginTop:6, lineHeight:1.5 }}>
            {ctx.killSwitch?"Kill switch engaged across all sites.":"Read-only default · every write verified & reversible."}
          </div>
          <NeoButton kind={ctx.killSwitch?"soft":"dark"} size="sm" full icon="power" style={{ marginTop:12 }} onClick={ctx.toggleKill}>
            {ctx.killSwitch?"Release":"Kill switch"}
          </NeoButton>
        </div>
      )}
    </aside>
  );
}

/* ---------------- Top bar ---------------- */
function SiteSwitcher({ ctx }) {
  const [open,setOpen]=useState(false), s=ctx.site;
  const API=window.SentinelAPI;
  const [setup,setSetup]=useState({});   // id -> { connected, gsc, airtable, audit }
  useEffect(()=>{ if(API&&API.sitesSetup) API.sitesSetup().then(r=>{ const m={}; (r.sites||[]).forEach(x=>m[x.id]=x); setSetup(m); }).catch(()=>{}); },[ctx.sites.length, open]);
  const score=(id)=>{ const x=setup[id]; return x? ["connected","gsc","airtable","audit"].filter(k=>x[k]).length : null; };
  // Setup-completeness badge: Auth (broken) / Ready (4/4) / Setup n/4.
  const Badge=({id,fail})=>{ if(fail) return <Chip tone="clay" size="sm" dot>Auth</Chip>; const n=score(id); if(n==null) return <Chip tone="gray" size="sm" dot>…</Chip>; if(n>=4) return <Chip tone="teal" size="sm" icon="check">Ready</Chip>; return <Chip tone="gold" size="sm">Setup {n}/4</Chip>; };
  return (
    <div style={{ position:"relative" }}>
      <button className="neo-btn" onClick={()=>setOpen(!open)}
        style={{ display:"flex", alignItems:"center", gap:11, padding:"7px 14px 7px 8px", borderRadius:"var(--r-pill)", background:"var(--surface)", boxShadow:"var(--neo-sm)" }}>
        <Glyph color={s.favicon} char={s.glyph} size={32} r={10} />
        <div style={{ textAlign:"left" }}>
          <div style={{ fontSize:13.5, fontWeight:700, lineHeight:1.1 }}>{s.name}</div>
          <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{s.url}</div>
        </div>
        <Badge id={s.id} fail={s.status!=="connected"} />
        <Icon name="chevD" size={16} style={{ color:"var(--faint)", marginLeft:2, transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
          <div style={{ position:"absolute", top:"calc(100% + 10px)", left:0, width:312, zIndex:50, padding:8,
            background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo)", animation:"pop .18s both" }}>
            <div style={{ padding:"8px 12px 6px", fontSize:10.5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Switch site</div>
            {ctx.sites.map(site=>{
              const active=site.id===s.id, fail=site.status!=="connected";
              return (
                <button key={site.id} className="nav-item" onClick={()=>{ctx.switchSite(site.id);setOpen(false);}}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:13, background:active?"var(--bg)":"transparent", boxShadow:active?"var(--neo-in)":"none" }}>
                  <Glyph color={site.favicon} char={site.glyph} size={34} r={11} />
                  <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>{site.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{site.url}</div>
                  </div>
                  <Badge id={site.id} fail={fail} />
                </button>
              );
            })}
            <div style={{ height:1, background:"var(--line-soft)", margin:"6px 8px" }} />
            <button className="nav-item" onClick={()=>{setOpen(false);ctx.goto("airtable");}}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:13, background:"transparent" }}>
              <div style={{ width:34, height:34, borderRadius:11, background:"var(--t-50)", display:"grid", placeItems:"center", color:"var(--t-700)", flexShrink:0 }}>
                <Icon name="layers" size={17} />
              </div>
              <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:"var(--t-700)" }}>Airtable</div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>Create content — push &amp; manage briefs</div>
              </div>
              <Icon name="chevR" size={16} style={{ color:"var(--faint)" }} />
            </button>
            <button className="nav-item" onClick={()=>{setOpen(false);ctx.openAddSite(null);}}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:13, background:"transparent" }}>
              <div style={{ width:34, height:34, borderRadius:11, background:"var(--t-50)", display:"grid", placeItems:"center", color:"var(--t-700)", flexShrink:0 }}>
                <Icon name="plus" size={18} sw={2.2} />
              </div>
              <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:"var(--t-700)" }}>Connect a site</div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>Add a WordPress account</div>
              </div>
              <Icon name="chevR" size={16} style={{ color:"var(--faint)" }} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Functional search box with live results dropdown ---- */
function SearchBox({ ctx }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const res = q.trim() ? window.SentinelHelpers.searchAll(q) : { findings:[], proposals:[], sites:[] };
  const cmds = q.trim() ? searchCommands(q) : [];
  const total = cmds.length + res.findings.length + res.proposals.length + res.sites.length;
  const go = (screen)=>{ setOpen(false); setQ(""); ctx.goto(screen); };
  const goCmd = (c)=>{ setOpen(false); setQ(""); ctx.goto(c.screen, c.tab); };
  return (
    <div style={{ position:"relative", width:300 }}>
      <Icon name="search" size={17} style={{ position:"absolute", left:15, top:12, color:"var(--faint)", zIndex:1 }} />
      <input placeholder="Search anything — pages, tools, findings…" className="search-in" value={q}
        onChange={e=>{ setQ(e.target.value); setOpen(true); }} onFocus={()=>setOpen(true)}
        onKeyDown={e=>{ if(e.key==="Escape"){ setOpen(false); e.target.blur(); } else if(e.key==="Enter"){ if(cmds[0]){ goCmd(cmds[0]); e.target.blur(); } else if(res.sites[0]){ ctx.switchSite(res.sites[0].id); go("overview"); } } }}
        style={{ width:"100%", padding:"11px 14px 11px 42px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, color:"var(--ink)", outline:"none" }} />
      {open && q.trim() && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
          <div className="scroll" style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:360, maxHeight:440, zIndex:50, padding:8,
            background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo)", animation:"pop .16s both" }}>
            {total===0 && <div style={{ padding:"16px 12px", fontSize:13, color:"var(--muted)", textAlign:"center" }}>No matches for “{q}”.</div>}
            {cmds.length>0 && <div style={{ padding:"6px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Pages &amp; Tools · {cmds.length}</div>}
            {cmds.map((c,i)=>{
              const parent = c.tab ? (SNAV_BY_KEY[c.screen]||{}).label : null;
              return (
                <button key={c.title+i} className="nav-item" onClick={()=>goCmd(c)} style={{ width:"100%", textAlign:"left", display:"flex", gap:10, padding:"9px 10px", borderRadius:11, alignItems:"center" }}>
                  <div style={{ width:28, height:28, borderRadius:9, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={c.icon} size={15} /></div>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title}</div>
                    {parent && <div style={{ fontSize:11, color:"var(--muted)" }}>{parent}</div>}
                  </div>
                  <Icon name="chevR" size={14} style={{ color:"var(--faint)", flexShrink:0 }} />
                </button>
              );
            })}
            {res.findings.length>0 && <div style={{ padding:"8px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Findings · {res.findings.length}</div>}
            {res.findings.slice(0,5).map(f=>(
              <button key={f.id} className="nav-item" onClick={()=>go("audits")} style={{ width:"100%", textAlign:"left", display:"flex", gap:9, padding:"9px 10px", borderRadius:11 }}>
                <Icon name="flag" size={15} style={{ color:"var(--gold)", marginTop:2 }} />
                <div style={{ minWidth:0 }}><div style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{f.title}</div><div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{f.page}</div></div>
              </button>
            ))}
            {res.proposals.length>0 && <div style={{ padding:"8px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Proposals · {res.proposals.length}</div>}
            {res.proposals.slice(0,5).map(p=>(
              <button key={p.id} className="nav-item" onClick={()=>go("review")} style={{ width:"100%", textAlign:"left", display:"flex", gap:9, padding:"9px 10px", borderRadius:11 }}>
                <Icon name="list" size={15} style={{ color:"var(--t-600)", marginTop:2 }} />
                <div style={{ minWidth:0 }}><div style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.title}</div><div style={{ fontSize:11, color:"var(--muted)" }}>{p.disc} · {p.risk} risk</div></div>
              </button>
            ))}
            {res.sites.length>0 && <div style={{ padding:"8px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Sites · {res.sites.length}</div>}
            {res.sites.slice(0,4).map(st=>(
              <button key={st.id} className="nav-item" onClick={()=>{ ctx.switchSite(st.id); go("overview"); }} style={{ width:"100%", textAlign:"left", display:"flex", gap:9, padding:"9px 10px", borderRadius:11, alignItems:"center" }}>
                <Glyph color={st.favicon} char={st.glyph} size={26} r={8} />
                <div style={{ minWidth:0 }}><div style={{ fontSize:13, fontWeight:600 }}>{st.name}</div><div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{st.url}</div></div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Functional notification bell with activity panel ---- */
function NotifBell({ ctx }) {
  const [open, setOpen] = useState(false);
  const items = (window.ACTIVITY||[]).slice(0,8);
  const tone = { verified:"teal", approved:"teal", applied:"plum", "rolled-back":"gold", audit:"plum", connection:"gray", failed:"clay" };
  const unread = items.filter(a=>a.type==="failed"||a.type==="audit").length;
  return (
    <div style={{ position:"relative" }}>
      <button className="neo-btn" onClick={()=>setOpen(!open)} aria-label="Notifications"
        style={{ width:44, height:44, borderRadius:14, background:"var(--surface)", display:"grid", placeItems:"center", color:"var(--ink-2)", boxShadow:"var(--neo-sm)", position:"relative" }}>
        <Icon name="bell" size={19} />
        {unread>0 && <span style={{ position:"absolute", top:11, right:12, width:7, height:7, borderRadius:99, background:"var(--clay)" }} />}
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
          <div className="scroll" style={{ position:"absolute", top:"calc(100% + 10px)", right:0, width:340, maxHeight:440, zIndex:50, padding:8,
            background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo)", animation:"pop .16s both" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px 6px" }}>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Notifications</span>
              <button onClick={()=>{ setOpen(false); ctx.goto("activity"); }} style={{ fontSize:12, fontWeight:700, color:"var(--t-700)" }}>View all</button>
            </div>
            {items.length===0 && <div style={{ padding:"16px 12px", fontSize:13, color:"var(--muted)", textAlign:"center" }}>No activity yet — run an audit.</div>}
            {items.map(a=>{
              const [fg,bg]=TT[tone[a.type]||"gray"];
              return (
                <button key={a.id} className="nav-item" onClick={()=>{ setOpen(false); ctx.goto("activity"); }} style={{ width:"100%", textAlign:"left", display:"flex", gap:10, padding:"10px 10px", borderRadius:11 }}>
                  <div style={{ width:30, height:30, borderRadius:9, background:bg, color:fg, display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={a.icon} size={14} /></div>
                  <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:13, fontWeight:600, lineHeight:1.4 }}>{a.text}</div><div style={{ fontSize:11, color:"var(--muted)", marginTop:1 }}>{a.who} · {a.t}</div></div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({ ctx }) {
  const armed = ctx.site.writeArmed && !ctx.killSwitch;
  return (
    <div className="topbar" style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 30px 16px" }}>
      <SiteSwitcher ctx={ctx} />
      <div style={{ flex:1 }} />
      <SearchBox ctx={ctx} />
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:"var(--r-pill)",
        background: ctx.killSwitch?"var(--clay-bg)":armed?"var(--t-50)":"var(--surface)", boxShadow:"var(--neo-xs)" }}>
        <Icon name={ctx.killSwitch?"lock":armed?"power":"eye"} size={15} style={{ color: ctx.killSwitch?"var(--clay)":armed?"var(--t-700)":"var(--muted)" }} />
        <span style={{ fontSize:12.5, fontWeight:700, color: ctx.killSwitch?"var(--clay)":armed?"var(--t-700)":"var(--ink-2)" }}>{ctx.killSwitch?"Kill switch":armed?"Write-armed":"Read-only"}</span>
      </div>
      <NotifBell ctx={ctx} />
      <div style={{ display:"flex", alignItems:"center", gap:11 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:"linear-gradient(135deg,var(--plum),var(--t-600))", color:"#F3EFE4", display:"grid", placeItems:"center", fontWeight:700, fontSize:15, boxShadow:"var(--neo-sm)" }}>MR</div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard cards ---------------- */
function KStat({ icon, value, label, tone="teal", onClick, run }) {
  const [fg,bg] = TT[tone];
  const n = useCountUp(value, { run });
  return (
    <div onClick={onClick} role={onClick?"button":undefined} tabIndex={onClick?0:undefined}
      onKeyDown={onClick?(e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}):undefined}
      className={onClick?"kpi-tap":""}
      style={{ display:"flex", alignItems:"center", gap:11, padding:"6px 12px", border:"1px solid transparent" }}>
      <div style={{ width:42, height:42, borderRadius:13, background:bg, display:"grid", placeItems:"center", color:fg, flexShrink:0 }}><Icon name={icon} size={20} /></div>
      <div>
        <div style={{ fontSize:23, fontWeight:800, lineHeight:1, letterSpacing:"-.02em" }}>{n}</div>
        <div style={{ fontSize:11.5, color:"var(--muted)", fontWeight:600, marginTop:3, whiteSpace:"nowrap" }}>{label}</div>
      </div>
    </div>
  );
}

function ActiveSiteCard({ ctx }) {
  const s = ctx.site;
  const cats = [["Perf",s.scores.performance],["A11y",s.scores.accessibility],["Best Pr.",s.scores.bestPractices],["SEO",s.scores.seo]];
  const scale = [["Posts",s.scale.posts],["Pages",s.scale.pages],["Media",s.scale.media],["Sitemap",s.scale.sitemap]];
  return (
    <SoftCard>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <Glyph color={s.favicon} char={s.glyph} size={52} r={16} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:17, fontWeight:700 }}>{s.name}</div>
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>{s.url}</div>
        </div>
        <Chip tone={s.writeArmed&&!ctx.killSwitch?"teal":"gray"} dot>{s.writeArmed&&!ctx.killSwitch?"Armed":"Read-only"}</Chip>
      </div>
      <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", color:"var(--muted)", margin:"18px 2px 9px" }}>Category scores</div>
      <Well pad={16} style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
        {cats.map(([l,v])=>{
          const state = v>=85?"Good":v>=65?"OK":v>=45?"Needs work":"Poor";
          return (
            <div key={l} className="htip" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
              <div className="htip-body">{l}: <b>{v}</b> · {state}</div>
              <Ring value={v} size={54} sw={6} />
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>{l}</span>
            </div>
          );
        })}
      </Well>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:16 }}>
        {scale.map(([l,v])=>(
          <div key={l} style={{ textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:800, letterSpacing:"-.01em" }}>{v>=1000?(v/1000).toFixed(1)+"k":v}</div>
            <div style={{ fontSize:10.5, color:"var(--muted)", fontWeight:600, marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="card-foot" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:18, paddingTop:16, borderTop:"1px solid var(--line-soft)" }}>
        <span style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><Icon name="clock" size={14} />Last audit {s.lastAudit}</span>
        <NeoButton kind="soft" size="sm" iconR="chevR" onClick={()=>ctx.goto("sites")}>Manage</NeoButton>
      </div>
    </SoftCard>
  );
}

/* ======= Combined bar + scatter chart (SEO bars · Performance scatter-line) ======
   Interactive: hover any column → crosshair + tooltip. Animated bars rise, dots pop.
   Scales to its container so it works small (card) and large (maximized modal). */
function ComboChart({ data, height=178, big=false }){
  const [hi,setHi] = useState(-1);
  const pad = { l:28, r:14, t:14, b:24 };
  const [w,setW] = useState(0);
  const wrapRef = useRef(null);
  useEffect(()=>{
    const el=wrapRef.current; if(!el) return;
    const measure=()=>{ const cw=el.clientWidth; if(cw>0) setW(cw); };
    // ResizeObserver handles the modal layout settling (avoids the initial-0 glitch)
    let ro;
    if(window.ResizeObserver){ ro=new ResizeObserver(measure); ro.observe(el); }
    measure();
    requestAnimationFrame(measure);
    requestAnimationFrame(()=>requestAnimationFrame(measure));
    window.addEventListener("resize",measure);
    return ()=>{ window.removeEventListener("resize",measure); if(ro) ro.disconnect(); };
  },[big]);
  // don't render the SVG until we have a real width (prevents the layout jump)
  if(w<=0) return <div ref={wrapRef} style={{ width:"100%", height }} />;
  const H = height, innerW = Math.max(w-pad.l-pad.r,10), innerH = H-pad.t-pad.b;
  const n = data.length;
  const lo = Math.max(0, Math.min(...data.flatMap(d=>[d.seo,d.perf]))-8);
  const hiV = Math.min(100, Math.max(...data.flatMap(d=>[d.seo,d.perf]))+5);
  const span = (hiV-lo)||1;
  const y = (v)=> pad.t + innerH - ((v-lo)/span)*innerH;
  const colW = innerW/n;
  const cx = (i)=> pad.l + colW*i + colW/2;
  const barW = Math.min(big?42:26, colW*0.42);
  // grid lines
  const ticks = [lo, lo+span*0.25, lo+span*0.5, lo+span*0.75, hiV].map(v=>Math.round(v));
  // perf scatter polyline
  const linePts = data.map((d,i)=>`${cx(i).toFixed(1)},${y(d.perf).toFixed(1)}`).join(" ");

  return (
    <div ref={wrapRef} style={{ width:"100%", position:"relative" }}>
      <svg width={w} height={H} style={{ display:"block", overflow:"visible" }} onMouseLeave={()=>setHi(-1)}>
        <defs>
          <linearGradient id="cc-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-500)" /><stop offset="100%" stopColor="var(--t-700)" />
          </linearGradient>
          <linearGradient id="cc-bar-dim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-300)" /><stop offset="100%" stopColor="var(--t-400)" />
          </linearGradient>
          <linearGradient id="cc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.18" /><stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {ticks.map((t,i)=>(
          <g key={i}>
            <line x1={pad.l} y1={y(t)} x2={w-pad.r} y2={y(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray={i===0?"0":"3 5"} opacity={i===0?.6:.5} />
            <text x={pad.l-7} y={y(t)+3} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--faint)">{t}</text>
          </g>
        ))}
        {/* hover crosshair */}
        {hi>=0 && <line x1={cx(hi)} y1={pad.t} x2={cx(hi)} y2={pad.t+innerH} stroke="var(--t-400)" strokeWidth="1.5" strokeDasharray="4 4" opacity=".55" />}
        {/* SEO bars */}
        {data.map((d,i)=>{
          const bh = (pad.t+innerH) - y(d.seo);
          const active = hi===i || hi<0;
          return (
            <g key={"b"+i} onMouseEnter={()=>setHi(i)} style={{ cursor:"pointer" }}>
              <rect x={cx(i)-colW/2} y={pad.t} width={colW} height={innerH} fill="transparent" />
              <rect x={cx(i)-barW/2} y={y(d.seo)} width={barW} height={Math.max(bh,2)} rx={barW/2}
                fill={hi===i?"url(#cc-bar)":"url(#cc-bar-dim)"} opacity={active?1:.55}
                style={{ transition:"opacity .18s, fill .18s", transformOrigin:`${cx(i)}px ${pad.t+innerH}px`, animation:`grow .6s cubic-bezier(.22,.7,.3,1) ${i*0.05}s both` }} />
            </g>
          );
        })}
        {/* Performance area + scatter-line */}
        <polygon points={`${pad.l},${pad.t+innerH} ${linePts} ${w-pad.r},${pad.t+innerH}`} fill="url(#cc-fill)" opacity=".9" />
        <polyline points={linePts} fill="none" stroke="var(--gold)" strokeWidth={big?2.5:2} strokeLinecap="round" strokeLinejoin="round"
          style={{ filter:"drop-shadow(0 2px 4px rgba(180,137,43,.3))" }} />
        {data.map((d,i)=>(
          <g key={"d"+i} onMouseEnter={()=>setHi(i)} style={{ cursor:"pointer" }}>
            <circle cx={cx(i)} cy={y(d.perf)} r={hi===i?(big?7:6):(big?5:4)} fill="var(--surface-hi)" stroke="var(--gold)" strokeWidth={big?2.5:2}
              style={{ transition:"r .14s", animation:`pop .4s ease ${0.3+i*0.05}s both` }} />
          </g>
        ))}
        {/* x labels */}
        {data.map((d,i)=>(
          <text key={"x"+i} x={cx(i)} y={H-6} textAnchor="middle" fontSize={big?12:11} fontWeight={hi===i?800:600}
            fill={hi===i?"var(--ink)":"var(--muted)"}>{d.d}</text>
        ))}
      </svg>
      {/* floating tooltip */}
      {hi>=0 && (
        <div style={{ position:"absolute", left:Math.min(Math.max(cx(hi),60),w-70), top:Math.max(y(Math.max(data[hi].seo,data[hi].perf))-58,2), transform:"translateX(-50%)",
          background:"var(--dark)", color:"#F3EFE4", padding:"9px 12px", borderRadius:10, pointerEvents:"none", whiteSpace:"nowrap", boxShadow:"0 10px 26px rgba(40,36,28,.32)", zIndex:5 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:"rgba(243,239,228,.6)", marginBottom:3 }}>{data[hi].d}</div>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12.5, fontWeight:700 }}><span style={{ width:8,height:8,borderRadius:2,background:"var(--t-500)" }} />SEO <b style={{marginLeft:"auto"}}>{data[hi].seo}</b></div>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12.5, fontWeight:700, marginTop:3 }}><span style={{ width:8,height:8,borderRadius:99,background:"var(--gold)" }} />Perf <b style={{marginLeft:"auto"}}>{data[hi].perf}</b></div>
        </div>
      )}
    </div>
  );
}

/* legend chip row for the combo chart */
function ComboLegend(){
  return (
    <div style={{ display:"flex", gap:16, alignItems:"center" }}>
      <span style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:11.5, fontWeight:700, color:"var(--muted)" }}><span style={{ width:11, height:11, borderRadius:3, background:"linear-gradient(180deg,var(--t-500),var(--t-700))" }} />SEO score</span>
      <span style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:11.5, fontWeight:700, color:"var(--muted)" }}><span style={{ width:11, height:11, borderRadius:99, background:"var(--surface-hi)", border:"2px solid var(--gold)" }} />Performance</span>
    </div>
  );
}

/* inline error banner — shows WHY data is missing instead of rendering blank */
function ErrBanner({ msg, noUnits, onRetry }){
  if(!msg) return null;
  return (
    <div style={{ display:"flex", gap:12, padding:"14px 16px", background:noUnits?"var(--gold-bg)":"var(--clay-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)", alignItems:"flex-start" }}>
      <Icon name={noUnits?"bolt":"alert"} size={18} style={{ color:noUnits?"var(--gold)":"var(--clay)", flexShrink:0, marginTop:1 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:700, color:noUnits?"#7E5A14":"#8A4231" }}>{noUnits?"DataForSEO balance low":"Couldn't load data"}</div>
        <div style={{ fontSize:12.5, color:noUnits?"#7E5A14":"#8A4231", marginTop:2, lineHeight:1.5 }}>{msg}</div>
        {noUnits && <a href="https://app.dataforseo.com/" target="_blank" rel="noopener" style={{ fontSize:12.5, fontWeight:700, color:"var(--t-700)", textDecoration:"underline", display:"inline-block", marginTop:6 }}>Top up DataForSEO balance →</a>}
      </div>
      {onRetry && <NeoButton kind="soft" size="sm" icon="trend" onClick={onRetry}>Retry</NeoButton>}
    </div>
  );
}

/* maximize button (corner of any chart card) */
function MaxBtn({ onClick }){
  return (
    <button onClick={onClick} className="neo-btn tip" data-tip="Maximize" aria-label="Maximize chart"
      style={{ width:32, height:32, borderRadius:9, background:"var(--surface)", boxShadow:"var(--neo-sm)", display:"grid", placeItems:"center", color:"var(--ink-2)" }}>
      <Icon name="layers" size={15} />
    </button>
  );
}

/* full-screen chart modal */
function ChartModal({ open, onClose, title, sub, children }){
  // lock body scroll + close on Escape while open
  useEffect(()=>{
    if(!open) return;
    const onKey=(e)=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",onKey);
    const prev=document.body.style.overflow; document.body.style.overflow="hidden";
    return ()=>{ window.removeEventListener("keydown",onKey); document.body.style.overflow=prev; };
  },[open,onClose]);
  if(!open) return null;
  // Portal to body so position:fixed is relative to the VIEWPORT (not a
  // transformed ancestor like .rise) — fixes off-centre alignment.
  const node = (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(42,38,32,.45)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"4vh 4vw", animation:"pop .18s both" }}>
      <div onClick={e=>e.stopPropagation()} className="scard" style={{ background:"var(--surface)", width:"min(1080px,92vw)", maxHeight:"92vh", overflow:"auto", padding:28, borderRadius:"var(--r-lg)", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18, flexShrink:0 }}>
          <div><h2 style={{ margin:0, fontSize:22, fontWeight:800, letterSpacing:"-.02em" }}>{title}</h2><div style={{ fontSize:13.5, color:"var(--muted)", marginTop:4 }}>{sub}</div></div>
          <button onClick={onClose} className="neo-btn" style={{ width:40, height:40, borderRadius:12, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--ink-2)", flexShrink:0 }}><Icon name="x" size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
  return (window.ReactDOM && window.ReactDOM.createPortal) ? window.ReactDOM.createPortal(node, document.body) : node;
}

/* Bucket raw audit history into a time-series by day/week/month/year.
   Each audit = {ts, scores:{seo,performance}}. Averages scores within a bucket. */
function bucketAudits(history, range){
  const audits = (history||[]).filter(a=>a&&a.ts&&a.scores).slice().reverse(); // oldest→newest
  if(!audits.length) return [];
  const keyOf = (d)=>{
    const dt=new Date(d);
    if(range==="day") return dt.getFullYear()+"-"+(dt.getMonth()+1)+"-"+dt.getDate()+"-"+dt.getHours(); // hourly within day → "time"
    if(range==="week"){ const day=dt.getDay(); const monday=new Date(dt); monday.setDate(dt.getDate()-((day+6)%7)); return monday.getFullYear()+"-W"+monday.getMonth()+"-"+monday.getDate(); }
    if(range==="month") return dt.getFullYear()+"-"+dt.getMonth();
    if(range==="year") return ""+dt.getFullYear();
    return dt.getFullYear()+"-"+(dt.getMonth()+1)+"-"+dt.getDate(); // default = per-audit day
  };
  const labelOf = (d)=>{
    const dt=new Date(d);
    if(range==="day") return dt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    if(range==="week") return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    if(range==="month") return dt.toLocaleDateString("en-US",{month:"short",year:"2-digit"});
    if(range==="year") return ""+dt.getFullYear();
    return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  };
  const buckets=new Map();
  for(const a of audits){
    const k=keyOf(a.ts);
    if(!buckets.has(k)) buckets.set(k,{label:labelOf(a.ts),seo:[],perf:[],ts:a.ts});
    const b=buckets.get(k); b.seo.push(a.scores.seo||0); b.perf.push(a.scores.performance||0); b.ts=a.ts;
  }
  const avg=(arr)=>Math.round(arr.reduce((x,y)=>x+y,0)/arr.length);
  return [...buckets.values()].map(b=>({ d:b.label, seo:avg(b.seo), perf:avg(b.perf), n:b.seo.length }));
}

function TrendCard({ ctx }) {
  const [range, setRange] = useState("week");
  const [maxed, setMaxed] = useState(false);
  // Build from REAL audit history (timestamps) when available, bucketed by range.
  const hist = ctx.history || [];
  const bucketed = bucketAudits(hist, range);
  // fall back to legacy single-point window.TREND when no real history
  const data = bucketed.length>=1 ? bucketed : (window.TREND||TREND);
  const max=100, today=data.length-1;
  return (
    <SoftCard>
      <SectionHead sub={`SEO score (bars) vs Performance (scatter) · by ${range}`}
        right={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ display:"flex", gap:2, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)" }}>
              {[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([r,l])=>(
                <button key={r} onClick={()=>setRange(r)} style={{ padding:"6px 11px", fontSize:12, fontWeight:700, borderRadius:99,
                  background: range===r?"var(--surface)":"transparent", color: range===r?"var(--t-700)":"var(--muted)", boxShadow: range===r?"var(--neo-sm)":"none" }}>{l}</button>
              ))}
            </div>
            <MaxBtn onClick={()=>setMaxed(true)} />
          </div>
        }>Audit Score Trend</SectionHead>
      <Well pad="18px 16px 10px">
        <ComboChart data={data} height={178} />
        <div style={{ marginTop:8, display:"flex", justifyContent:"center" }}><ComboLegend /></div>
      </Well>
      <ChartModal open={maxed} onClose={()=>setMaxed(false)} title="Audit Score Trend" sub={`SEO score (bars) vs Performance (scatter) · grouped by ${range} · ${data.length} ${range==="day"?"points":range+"s"}`}>
        <div style={{ display:"flex", gap:2, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", width:"fit-content", marginBottom:14 }}>
          {[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([r,l])=>(
            <button key={r} onClick={()=>setRange(r)} style={{ padding:"7px 16px", fontSize:13, fontWeight:700, borderRadius:99, background:range===r?"var(--surface)":"transparent", color:range===r?"var(--t-700)":"var(--muted)", boxShadow:range===r?"var(--neo-sm)":"none" }}>{l}</button>
          ))}
        </div>
        <Well pad="26px 22px 14px"><ComboChart data={data} height={420} big /><div style={{ marginTop:14, display:"flex", justifyContent:"center" }}><ComboLegend /></div></Well>
        <div style={{ display:"flex", gap:24, marginTop:18, flexWrap:"wrap" }}>
          {[["Avg. SEO",Math.round(data.reduce((a,d)=>a+d.seo,0)/data.length),"trend"],["Avg. Perf",Math.round(data.reduce((a,d)=>a+d.perf,0)/data.length),"bolt"],["Best SEO",Math.max(...data.map(d=>d.seo)),"arrowUp"],["Range",`${data.length} audits`,"clock"]].map(([l,v,ic])=>(
            <div key={l} style={{ display:"flex", alignItems:"center", gap:11 }}><div style={{ width:40, height:40, borderRadius:12, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name={ic} size={18} /></div><div><div style={{ fontSize:19, fontWeight:800 }}>{v}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{l}</div></div></div>
          ))}
        </div>
      </ChartModal>
      <div className="card-foot" style={{ display:"flex", gap:20, marginTop:16 }}>
        {[["Avg. SEO",Math.round(data.reduce((a,d)=>a+d.seo,0)/data.length),"trend"],["Best day",Math.max(...data.map(d=>d.seo)),"arrowUp"],["Net gain",(()=>{const g=data[data.length-1].seo-data[0].seo;return g>=0?"+"+g:""+g;})(),"check"]].map(([l,v,ic])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:34, height:34, borderRadius:11, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name={ic} size={16} /></div>
            <div><div style={{ fontSize:16, fontWeight:800 }}>{v}</div><div style={{ fontSize:11, color:"var(--muted)" }}>{l}</div></div>
          </div>
        ))}
      </div>
    </SoftCard>
  );
}

function HealthGaugeCard({ ctx, run }) {
  const s = ctx.site;
  const avg = Math.round((s.scores.performance+s.scores.accessibility+s.scores.bestPractices+s.scores.seo)/4);
  const ready = ctx.proposals.filter(p=>p.status==="proposed").length;
  const auditing = ctx.auditing;
  const shownAvg = useCountUp(avg, { run });
  return (
    <SoftCard style={{ alignItems:"center", textAlign:"center" }}>
      <div style={{ marginBottom:4 }}>
        <h3 style={{ margin:0, fontSize:17, fontWeight:700 }}>Site Health</h3>
        <div style={{ fontSize:12.5, color:"var(--muted)", marginTop:3 }}>{auditing?"Auditing — recomputing scores…":"Composite Lighthouse score"}</div>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:"8px 0" }}>
        <div className={auditing?"shimmer":""} style={{ borderRadius:"50%", opacity:auditing?.8:1, transition:"opacity .3s" }}>
          <Gauge value={avg} size={168} sw={17}
            center={<>
              <span style={{ fontSize:46, fontWeight:800, color:tealForScore(avg), lineHeight:1 }}>{auditing?shownAvg:Math.round(shownAvg)}</span>
              <span style={{ fontSize:12, color:"var(--muted)", fontWeight:600, marginTop:4 }}>out of 100</span></>} />
        </div>
        {(()=>{ // real delta vs the previous audit — hidden when there's no genuine prior score
          const p=s.prev; const prevAvg=p?Math.round((p.performance+p.accessibility+p.bestPractices+p.seo)/4):0;
          if(!prevAvg) return null;
          const d=avg-prevAvg; const tone=d>0?"teal":d<0?"clay":"gray";
          return <Chip tone={tone} size="sm" icon="trend">{d>0?("+"+d):d<0?(""+d):"±0"} vs last audit</Chip>;
        })()}
      </div>
      <div className="card-foot" style={{ width:"100%" }}>
        <button onClick={()=>ctx.goto("review")} className="nav-item row-link" style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"10px 13px", borderRadius:13, background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:13 }}>
          <Icon name="sparkles" size={17} style={{ color:"var(--t-700)" }} />
          <span style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", flex:1, textAlign:"left" }}>{ready} fixes ready to apply</span>
          <Icon name="chevR" size={16} style={{ color:"var(--muted)" }} />
        </button>
        <div style={{ display:"flex", gap:10 }}>
          <NeoButton kind="primary" size="md" icon={auditing?undefined:"radar"} full disabled={auditing} onClick={ctx.runAudit}>
            {auditing && <Icon name="cog" size={17} className="audit-spin" />}{auditing?"Auditing…":"Run audit"}
          </NeoButton>
          <NeoButton kind="soft" size="md" icon="doc" onClick={()=>ctx.exportReport()} title="Export report" />
        </div>
      </div>
    </SoftCard>
  );
}

function FixQueueCard({ ctx }) {
  const items = ctx.proposals.slice(0,4);
  const pending = ctx.proposals.filter(p=>p.status==="proposed").length;
  const done = ctx.proposals.filter(p=>p.status==="verified"||p.status==="approved").length;
  const riskChip = {
    low:["Low","rgba(141,194,186,.18)","#A6D4CC"],
    medium:["Med","rgba(212,170,74,.20)","#E4C074"],
    high:["High","rgba(199,112,86,.24)","#E6A18D"],
  };
  return (
    <SoftCard tone="dark">
      <SectionHead light sub="Proposals awaiting your approval"
        right={<span style={{ fontSize:14, fontWeight:800, color:"#F3EFE4", background:"rgba(243,239,228,.14)", padding:"5px 12px", borderRadius:99 }}>{done}/{ctx.proposals.length}</span>}>Fix Queue</SectionHead>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {items.map(p=>{
          const isDone = p.status==="verified"||p.status==="approved";
          const [rl,rbg,rfg] = riskChip[p.risk]||riskChip.low;
          return (
            <div key={p.id} className="nav-item" style={{ display:"flex", alignItems:"center", gap:13, padding:"11px 12px", borderRadius:13, background:"rgba(243,239,228,.05)" }}>
              <button onClick={()=>ctx.toggleProposal(p.id)} className="qcheck" aria-label={isDone?"Mark as pending":"Approve fix"} style={{ width:26, height:26, borderRadius:8, flexShrink:0, display:"grid", placeItems:"center",
                background: isDone?"var(--t-500)":"transparent", border: isDone?"none":"1.5px solid rgba(243,239,228,.45)", color:"#F3EFE4" }}>
                {isDone && <Icon name="check" size={15} sw={2.6} />}
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:600, color:"#F3EFE4", textDecoration: isDone?"line-through":"none", opacity:isDone?.6:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.title}</div>
                <div style={{ fontSize:11, color:"rgba(243,239,228,.62)", fontFamily:"var(--mono)" }}>{p.page}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:rfg, background:rbg, padding:"3px 9px", borderRadius:99, flexShrink:0 }}>{rl} risk</span>
            </div>
          );
        })}
      </div>
      <NeoButton kind="soft" size="sm" full iconR="chevR" className="card-foot" style={{ marginTop:16 }} onClick={()=>ctx.goto("review")}>Open review queue · {pending} pending</NeoButton>
    </SoftCard>
  );
}

/* large area sparkline for the maximized CWV view */
function BigSpark({ points, color, fmt }){
  const [hi,setHi]=useState(-1);
  const [w,setW]=useState(760); const ref=useRef(null);
  useEffect(()=>{ const m=()=>ref.current&&setW(ref.current.clientWidth); m(); window.addEventListener("resize",m); return ()=>window.removeEventListener("resize",m); },[]);
  const h=120, pad=10;
  const max=Math.max(...points), min=Math.min(...points), span=(max-min)||1;
  const xy=points.map((p,i)=>[ pad+(i/(points.length-1))*(w-2*pad), h-pad-((p-min)/span)*(h-2*pad) ]);
  const line=xy.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const days=["6d ago","5d","4d","3d","2d","1d","now"];
  return (
    <div ref={ref} style={{ position:"relative", width:"100%" }}>
      <svg width={w} height={h} style={{ display:"block", overflow:"visible" }} onMouseLeave={()=>setHi(-1)}>
        <defs><linearGradient id={"bs"+color.replace(/\W/g,"")} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <polygon points={`${pad},${h-pad} ${line} ${w-pad},${h-pad}`} fill={`url(#bs${color.replace(/\W/g,"")})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(([x,y],i)=>(
          <g key={i} onMouseEnter={()=>setHi(i)} style={{cursor:"pointer"}}>
            <rect x={x-w/points.length/2} y={0} width={w/points.length} height={h} fill="transparent" />
            <circle cx={x} cy={y} r={hi===i?6:4} fill="var(--surface-hi)" stroke={color} strokeWidth="2.5" style={{transition:"r .12s"}} />
          </g>
        ))}
      </svg>
      {hi>=0 && <div style={{ position:"absolute", left:Math.min(Math.max(xy[hi][0],40),w-40), top:xy[hi][1]-44, transform:"translateX(-50%)", background:"var(--dark)", color:"#F3EFE4", padding:"6px 10px", borderRadius:8, fontSize:12, fontWeight:700, whiteSpace:"nowrap", pointerEvents:"none", boxShadow:"0 8px 20px rgba(40,36,28,.3)" }}>{fmt?fmt(points[hi]):points[hi]} <span style={{color:"rgba(243,239,228,.6)"}}>· {days[hi]}</span></div>}
    </div>
  );
}

function Spark({ points, color, w=58, h=26, fmt }) {
  const [hi, setHi] = useState(-1);
  const max=Math.max(...points), min=Math.min(...points), span=(max-min)||1;
  const xy = points.map((p,i)=>[ (i/(points.length-1))*w, h-((p-min)/span)*(h-4)-2 ]);
  const line = xy.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const days=["6d","5d","4d","3d","2d","1d","now"];
  return (
    <div style={{ position:"relative", lineHeight:0 }}>
      {hi>=0 && (
        <div style={{ position:"absolute", left:xy[hi][0], bottom:h-xy[hi][1]+8, transform:"translateX(-50%)",
          background:"var(--dark)", color:"#F3EFE4", fontSize:10.5, fontWeight:700, padding:"4px 8px", borderRadius:8, whiteSpace:"nowrap", zIndex:20, pointerEvents:"none", boxShadow:"0 8px 20px rgba(40,36,28,.3)" }}>
          {fmt?fmt(points[hi]):points[hi]} <span style={{ color:"rgba(243,239,228,.6)", fontWeight:600 }}>· {days[hi]}</span>
        </div>
      )}
      <svg width={w} height={h} style={{ overflow:"visible" }}>
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(([x,y],i)=>(
          <g key={i} onMouseEnter={()=>setHi(i)} onMouseLeave={()=>setHi(-1)} style={{ cursor:"pointer" }}>
            <circle cx={x} cy={y} r="7" fill="transparent" />
            <circle cx={x} cy={y} r={hi===i?3.4:(i===points.length-1?2.6:0)} fill={color} style={{ transition:"r .12s" }} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function CWVCard({ ctx }) {
  const s = ctx.site;
  const [maxed,setMaxed] = useState(false);
  // Real sparklines from saved audit history (each audit stores cwv), NOT a hardcoded
  // trend. Fewer than 2 real points → no sparkline rather than a fabricated one. And
  // these are Lighthouse LAB values (m.v), so they are labelled as such — never "field
  // data / p75", which would falsely imply CrUX real-user measurement.
  const hist = (ctx.history||[]).filter(h=>h && h.cwv);
  const num = (x)=>{ const n=parseFloat(String(x==null?"":x).replace(/[^0-9.]/g,"")); return isFinite(n)?n:null; };
  const series = (key)=>{ const arr=hist.map(h=>num(h.cwv&&h.cwv[key]&&h.cwv[key].v)).filter(v=>v!=null); return arr.length>=2?arr.slice(-7):null; };
  const rows = [
    ["LCP", s.cwv.lcp, series("lcp"), v=>v.toFixed(1)+"s"],
    ["INP", s.cwv.inp, series("inp"), v=>Math.round(v)+"ms"],
    ["CLS", s.cwv.cls, series("cls"), v=>v.toFixed(2)],
  ];
  const map = { good:["teal","Good"], ni:["gold","Fair"], poor:["clay","Poor"], na:["gray","—"] };
  return (
    <SoftCard>
      <SectionHead sub="Lighthouse lab" right={<MaxBtn onClick={()=>setMaxed(true)} />}>Core Web Vitals</SectionHead>
      <ChartModal open={maxed} onClose={()=>setMaxed(false)} title="Core Web Vitals" sub="Lighthouse lab · trend across saved audits">
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {rows.map(([l,m,sp,fmt])=>{ const [tone,lab]=map[m.state]||map.na, [fg]=TT[tone]; return (
            <Well key={l} pad={20}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:"var(--surface)", boxShadow:"var(--neo-sm)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800, color:fg }}>{l}</div>
                <div style={{ flex:1 }}><div style={{ fontSize:24, fontWeight:800, fontFamily:"var(--mono)", color:fg, lineHeight:1 }}>{m.v}</div><div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>lab · {l==="LCP"?"Largest Contentful Paint":l==="INP"?"Interaction to Next Paint":"Cumulative Layout Shift"}</div></div>
                <Chip tone={tone} dot>{lab}</Chip>
              </div>
              {sp ? <BigSpark points={sp} color={fg} fmt={fmt} /> : <div style={{ fontSize:11.5, color:"var(--muted)", padding:"6px 2px" }}>Trend appears after 2+ audits.</div>}
            </Well>
          ); })}
        </div>
      </ChartModal>
      <div style={{ display:"flex", flexDirection:"column", gap:14, flex:1, justifyContent:"center" }}>
        {rows.map(([l,m,sp,fmt])=>{
          const [tone,lab]=map[m.state]||map.na, [fg]=TT[tone];
          return (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:13 }}>
              <div style={{ width:42, height:42, borderRadius:13, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", fontSize:12, fontWeight:800, color:fg, flexShrink:0 }}>{l}</div>
              <div style={{ minWidth:62 }}>
                <div style={{ fontSize:17, fontWeight:800, fontFamily:"var(--mono)", color:fg, lineHeight:1 }}>{m.v}</div>
                <div style={{ fontSize:10, color:"var(--muted)", marginTop:3, fontWeight:600 }}>lab</div>
              </div>
              <div style={{ flex:1, display:"flex", justifyContent:"center" }}>{sp ? <Spark points={sp} color={fg} fmt={fmt} /> : <span style={{ fontSize:10.5, color:"var(--muted)" }}>—</span>}</div>
              <Chip tone={tone} size="sm" dot>{lab}</Chip>
            </div>
          );
        })}
      </div>
      <div className="card-foot" style={{ marginTop:16, paddingTop:13, borderTop:"1px solid var(--line-soft)", fontSize:11.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}>
        <Icon name="clock" size={13} />Lighthouse lab · latest audit
      </div>
    </SoftCard>
  );
}

function ActivityCard({ ctx }) {
  const tone = { verified:"teal", approved:"teal", applied:"plum", "rolled-back":"gold", audit:"plum", connection:"gray", failed:"clay" };
  // Live activity — the same source NotifBell + the Activity screen use. Reading the
  // module-level ACTIVITY mock here meant the dashboard showed a demo trail (Atlas /
  // Verde "401 Unauthorized") in live mode; window.ACTIVITY is set to [] in live mode.
  const items = ((typeof window!=="undefined" && window.ACTIVITY) || ACTIVITY).slice(0,4);
  return (
    <SoftCard>
      <SectionHead sub="Every action is logged" right={<NeoButton kind="ghost" size="sm" iconR="chevR" onClick={()=>ctx.goto("activity")}>All</NeoButton>}>Recent Activity</SectionHead>
      {items.length===0 && <div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:13 }}>No activity yet — run an audit or apply a fix.</div>}
      <div style={{ display:"flex", flexDirection:"column" }}>
        {items.map((a,i)=>{
          const [fg,bg]=TT[tone[a.type]||"gray"];
          return (
            <div key={a.id} className="row-link" onClick={()=>ctx.goto("activity")}
              role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"){ctx.goto("activity");}}}
              style={{ display:"flex", gap:12, padding:"6px 8px", margin:"0 -8px", borderRadius:12 }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ width:32, height:32, borderRadius:10, background:bg, color:fg, display:"grid", placeItems:"center", flexShrink:0, boxShadow:"var(--neo-xs)" }}><Icon name={a.icon} size={15} /></div>
                {i<items.length-1 && <div style={{ width:2, flex:1, background:"var(--line)", margin:"4px 0" }} />}
              </div>
              <div style={{ flex:1, paddingBottom:i<items.length-1?14:0, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, lineHeight:1.4 }}>{a.text}</div>
                  <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}><b style={{color:"var(--ink-2)"}}>{a.who}</b> · {a.t}</div>
                </div>
                <Icon name="chevR" size={15} style={{ color:"var(--faint)", flexShrink:0, alignSelf:"flex-start", marginTop:4 }} />
              </div>
            </div>
          );
        })}
      </div>
    </SoftCard>
  );
}

/* ---------------- Dashboard screen ---------------- */
function Dashboard({ ctx }) {
  const s = ctx.site;
  const [run, setRun] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setRun(true), 60); return ()=>clearTimeout(t); },[]);
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric" });
  return (
    <div className="rise" style={{ display:"flex", flexDirection:"column", gap:22 }}>
      {/* greeting */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:8 }}>
            <span style={{ fontSize:12.5, fontWeight:700, color:"var(--t-700)", background:"var(--t-50)", padding:"4px 11px", borderRadius:99, display:"inline-flex", alignItems:"center", gap:6 }}><Icon name="clock" size={13} />{dateStr}</span>
          </div>
          <h1 style={{ margin:0, fontSize:34, fontWeight:800, letterSpacing:"-.03em" }}>Welcome back</h1>
          <p style={{ margin:"7px 0 0", fontSize:15, color:"var(--muted)" }}>Here's the health of <b style={{color:"var(--ink-2)"}}>{s.name}</b> and what needs your attention today.</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 8px", background:"var(--surface)", borderRadius:20, boxShadow:"var(--neo-sm)", border:"1px solid var(--line-soft)", flexWrap:"wrap" }}>
          <KStat icon="flag" value={s.openFindings} label="Open findings" tone="gold" run={run} onClick={()=>ctx.goto("audits")} />
          <span style={{ width:1, height:34, background:"var(--line)" }} />
          <KStat icon="list" value={ctx.proposals.filter(p=>p.status==="proposed").length} label="Fixes pending" tone="teal" run={run} onClick={()=>ctx.goto("review")} />
          <span style={{ width:1, height:34, background:"var(--line)" }} />
          <KStat icon="globe" value={ctx.sites.filter(x=>x.status==="connected").length} label="Connected sites" tone="plum" run={run} onClick={()=>ctx.goto("sites")} />
        </div>
      </div>

      {/* row 1 */}
      <div className="drow drow--1">
        <ActiveSiteCard ctx={ctx} />
        <TrendCard ctx={ctx} />
        <HealthGaugeCard ctx={ctx} run={run} />
      </div>

      {/* row 2 */}
      <div className="drow drow--2">
        <FixQueueCard ctx={ctx} />
        <CWVCard ctx={ctx} />
        <ActivityCard ctx={ctx} />
      </div>
    </div>
  );
}

function Toasts({ list }) {
  return (
    <div style={{ position:"fixed", right:24, bottom:24, zIndex:120, display:"flex", flexDirection:"column", gap:10 }}>
      {list.map(t=>(
        <div key={t.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"13px 17px", background:"var(--dark)", color:"#F3EFE4", borderRadius:14, boxShadow:"0 14px 40px rgba(40,36,28,.35)", maxWidth:360, animation:"pop .2s both" }}>
          <span style={{ width:24, height:24, borderRadius:99, background: t.tone==="clay"?"var(--clay)":t.tone==="gold"?"var(--gold)":"var(--t-500)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={t.tone==="clay"?"alert":t.tone==="gold"?"undo":"check"} size={14} sw={2.4} /></span>
          <span style={{ fontSize:13.5, fontWeight:600 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Executive Scorecard screen ---------------- */
/* One-screen exec view: organic value, value-at-risk, SoV, composite-score
   trend (+significance), anomalies, top worklist — all computed server-side.
   Plus a Claude-written weekly narrative that NARRATES the numbers (never
   computes them). Degrades gracefully when a data source isn't connected. */
function ExecScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [card,setCard] = useState(null);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState(null);
  const [narr,setNarr] = useState(null);
  const [narrBusy,setNarrBusy] = useState(false);
  const load = ()=>{
    setBusy(true); setErr(null); setNarr(null);
    API.execScorecard(s.id).then(r=>{ if(r.error){ setErr(r.error); return; } setCard(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy(false));
  };
  const genNarr = ()=>{
    if(!card) return;
    setNarrBusy(true);
    API.execNarrative(card).then(r=>setNarr(r.error?("⚠️ "+r.error):r.narrative)).catch(e=>setNarr("⚠️ "+e.message)).finally(()=>setNarrBusy(false));
  };
  useEffect(()=>{ setCard(null); setNarr(null); setErr(null); if(live) load(); },[s.id]);

  const cur = (card&&card.trafficValue&&card.trafficValue.currency)||"GBP";
  const money = (v)=> v==null?"—":Number(v).toLocaleString()+" "+cur;
  const sig = (d,scores)=>{ if(d==null) return null; return Math.abs(d)>2; }; // composite band ~2pts

  return (
    <div className="rise">
      <PageHead title="Executive Scorecard" sub={`The one-screen weekly health view for ${s.name}.`}>
        <div style={{ display:"flex", gap:10 }}>
          {card && <NeoButton kind="soft" size="sm" icon={busy?undefined:"trend"} disabled={busy} onClick={load}>{busy&&<Icon name="cog" size={15} className="audit-spin" />}Refresh</NeoButton>}
          <NeoButton kind="primary" size="sm" icon={narrBusy?undefined:"sparkles"} disabled={narrBusy||!card} onClick={genNarr}>{narrBusy&&<Icon name="cog" size={15} className="audit-spin" />}{narrBusy?"Writing…":"Weekly briefing"}</NeoButton>
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to see its executive scorecard.</div></SoftCard>}
      {live && busy && !card && <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Composing scorecard…</div></SoftCard>}
      {live && err && <div style={{ marginBottom:16 }}><ErrBanner msg={err} onRetry={load} /></div>}

      {live && card && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* Claude weekly narrative */}
          {narr && (
            <SoftCard hover={false} tone="teal">
              <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:8 }}><Icon name="sparkles" size={16} style={{ color:"#fff" }} /><span style={{ fontSize:13, fontWeight:700, color:"#fff", opacity:.95 }}>Weekly briefing</span></div>
              <div className="md" style={{ fontSize:13.5, color:"#fff" }} dangerouslySetInnerHTML={{ __html:(window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(narr))||narr }} />
            </SoftCard>
          )}

          {/* headline KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            <PatternCard icon="trend" tone="teal" value={card.trafficValue?money(card.trafficValue.totalEstValue)+"/mo":"—"} title="Organic value" sub={card.trafficValue?(card.trafficValue.totalEstClicks||0).toLocaleString()+" est. clicks/mo":"Load DataForSEO to model"} />
            <PatternCard icon="flag" tone="gold" value={card.trafficValue?money(card.trafficValue.valueAtRisk):"—"} title="Value at risk" sub={card.trafficValue?(card.trafficValue.page2Count||0)+" page-2 keywords":"—"} />
            <PatternCard icon="globe" tone="plum" value={card.geo&&card.geo.shareOfVoice!=null?card.geo.shareOfVoice+"%":"—"} title="AI share-of-voice" sub={card.geo?(card.geo.prevShareOfVoice!=null?(card.geo.shareOfVoice-card.geo.prevShareOfVoice>=0?"▲ +":"▼ ")+(card.geo.shareOfVoice-card.geo.prevShareOfVoice)+"pts vs last":"latest scan"):"Run AI Visibility"} />
            <PatternCard icon="radar" tone="gray" value={card.audit?card.audit.latestComposite+"/100":"—"} title="Composite score" sub={card.audit&&card.audit.delta!=null?(sig(card.audit.delta)?(card.audit.delta>=0?"▲ +":"▼ ")+card.audit.delta+" significant":"≈ within noise"):"single audit"} />
          </div>

          {/* anomalies — GSC traffic/ranking moves + per-category audit regressions */}
          {(()=>{
            const search=(card.search&&card.search.anomalies)||[];
            const cats=(card.audit&&card.audit.categoryRegressions)||[];
            const total=search.length+cats.length;
            if(!total) return null;
            return (
            <SoftCard hover={false}>
              <SectionHead sub="Statistically significant moves — robust z ≥ 3.5, anchored on clicks (not impressions)">⚠️ {total} anomal{total===1?"y":"ies"} detected</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {search.map((e,i)=>(
                  <div key={"s"+i} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <Icon name={e.metric==="clicks"?"thumb":"flag"} size={16} style={{ color:e.severity==="high"?"var(--clay)":"var(--gold)" }} />
                    <span style={{ flex:1 }}>{e.note}</span>
                    <Chip tone={e.severity==="high"?"clay":"gold"} size="sm">{e.date}</Chip>
                  </div>
                ))}
                {cats.map((e,i)=>(
                  <div key={"c"+i} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <Icon name="radar" size={16} style={{ color:e.severity==="high"?"var(--clay)":"var(--gold)" }} />
                    <span style={{ flex:1 }}>{e.note}</span>
                    <Chip tone={e.severity==="high"?"clay":"gold"} size="sm">{(e.date||"").slice(0,10)}</Chip>
                  </div>
                ))}
              </div>
            </SoftCard>
            );
          })()}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
            {/* clicks trend */}
            {card.search && card.search.clicksTrend && card.search.clicksTrend.length>1 && (
              <SoftCard hover={false}>
                <SectionHead sub={`${(card.search.clicks28||0).toLocaleString()} clicks · trailing 28 days`}>Search clicks</SectionHead>
                <BigSpark points={card.search.clicksTrend.map(d=>d.clicks)} color="var(--t-600)" />
              </SoftCard>
            )}
            {/* composite trend */}
            {card.audit && card.audit.trend && card.audit.trend.length>1 && (
              <SoftCard hover={false}>
                <SectionHead sub={`${card.audit.regressionFlags||0} regression flag(s) in history`}>Composite score trend</SectionHead>
                <BigSpark points={card.audit.trend.map(p=>p.composite)} color="var(--plum)" />
              </SoftCard>
            )}
          </div>

          {/* worklist */}
          {card.worklist && card.worklist.top && card.worklist.top.length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub={`${card.worklist.quickWins||0} quick win(s) of ${card.worklist.total} findings · RICE-ranked`} right={<NeoButton kind="soft" size="sm" icon="arrowUp" onClick={()=>ctx.goto("audits")}>Open worklist</NeoButton>}>Do next</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {card.worklist.top.map((it,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5 }}>
                    <span style={{ width:30, height:24, display:"grid", placeItems:"center", borderRadius:7, background:"var(--surface)", boxShadow:"var(--neo-sm)", fontWeight:800, color:"var(--t-700)", fontSize:11.5 }}>{it.priority}</span>
                    <span style={{ flex:1, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{it.title}</span>
                    <Chip tone={it.quadrant==="Quick win"?"teal":it.quadrant==="Major project"?"gold":it.quadrant==="Fill-in"?"plum":"gray"} size="sm">{it.quadrant}</Chip>
                  </div>
                ))}
              </div>
            </SoftCard>
          )}

          {/* data-source coverage */}
          <div style={{ fontSize:11.5, color:"var(--faint)", display:"flex", gap:14, flexWrap:"wrap" }}>
            {[["Audit",card.sources.audit],["Traffic value",card.sources.trafficValue],["Search Console",card.sources.search],["AI Visibility",card.sources.geo],["Worklist",card.sources.worklist]].map(([l,on])=>(
              <span key={l} style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:8, height:8, borderRadius:99, background:on?"var(--t-500)":"var(--line)" }} />{l}{on?"":" — not connected"}</span>
            ))}
          </div>
          <div style={{ fontSize:11, color:"var(--faint)", lineHeight:1.5 }}>All figures are computed deterministically from your data. The weekly briefing uses Claude to <i>narrate</i> these numbers — it never invents or recomputes them.</div>
        </div>
      )}
    </div>
  );
}

/* Line-level diff (LCS) between the default prompt and the current text. */
function diffLines(oldStr, newStr){
  const A=(oldStr||"").split("\n"), B=(newStr||"").split("\n");
  const m=A.length,k=B.length;
  const dp=Array.from({length:m+1},()=>new Array(k+1).fill(0));
  for(let i=m-1;i>=0;i--)for(let j=k-1;j>=0;j--)dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<m&&j<k){ if(A[i]===B[j]){out.push({t:"same",v:A[i]});i++;j++;} else if(dp[i+1][j]>=dp[i][j+1]){out.push({t:"del",v:A[i]});i++;} else {out.push({t:"add",v:B[j]});j++;} }
  while(i<m)out.push({t:"del",v:A[i++]});
  while(j<k)out.push({t:"add",v:B[j++]});
  return out;
}

/* ---------------- Admin · Prompts screen ---------------- */
/* Every system prompt, category-wise, editable. Saves push to Supabase and take
   effect on the very next LLM call (live). Reset restores the in-code default. */
function AdminScreen({ ctx }) {
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const s = ctx.site;
  const scope = "site";   // prompts are per-site only (no universal/all-sites editing)
  const [data,setData] = useState(null);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState(null);
  const [edits,setEdits] = useState({});      // key → edited content
  const [saving,setSaving] = useState("");
  const [q,setQ] = useState("");
  const [hist,setHist] = useState({});        // key → versions[] (null=loading)
  const [histOpen,setHistOpen] = useState("");
  const [testing,setTesting] = useState("");
  const [tests,setTests] = useState({});      // key → {output, engine, sources}
  const [cfg,setCfg] = useState({});          // key → {model, temperature} edits
  const [diffOpen,setDiffOpen] = useState("");
  const [tab,setTab] = useState("system");
  useEffect(()=>{ if(ctx.navTab && ["system","prompts"].includes(ctx.navTab)) setTab(ctx.navTab); },[ctx.navTab]);
  const [stat,setStat] = useState(null);
  const [statBusy,setStatBusy] = useState(false);
  const [health,setHealth] = useState(null);
  const load = ()=>{ setBusy(true); setErr(null); API.promptsList(scope==="site"?s.id:undefined).then(r=>{ if(r.error){setErr(r.error);return;} setData(r); setEdits({}); }).catch(e=>setErr(e.message)).finally(()=>setBusy(false)); };
  useEffect(()=>{ if(live && tab==="prompts") load(); },[scope, s.id]);
  const loadStat = ()=>{ setStatBusy(true); API.adminStatus(s.id).then(setStat).catch(e=>setStat({error:e.message})).finally(()=>setStatBusy(false)); API.adminHealth().then(setHealth).catch(()=>setHealth(null)); };
  useEffect(()=>{ if(live){ loadStat(); if(!data) load(); } },[s.id]);

  const toggleHist = (p)=>{
    if(histOpen===p.key){ setHistOpen(""); return; }
    setHistOpen(p.key);
    if(hist[p.key]===undefined){ setHist(h=>({...h,[p.key]:null})); API.promptHistory(p.key).then(r=>setHist(h=>({...h,[p.key]:r.versions||[]}))).catch(()=>setHist(h=>({...h,[p.key]:[]}))); }
  };
  const runTest = (p)=>{
    const content=edits[p.key]!=null?edits[p.key]:p.content;
    setTesting(p.key);
    API.promptTest(p.key, content, mdl(p)||null, tmp(p)===""?null:tmp(p), s.id).then(r=>{ if(r.error){ ctx.toast("Test: "+r.error,"clay"); return; } setTests(t=>({...t,[p.key]:r})); }).catch(e=>ctx.toast("Test: "+e.message,"clay")).finally(()=>setTesting(""));
  };
  const fmtTime = (iso)=>{ try{ return new Date(iso).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };

  const mdl=(p)=> cfg[p.key]&&cfg[p.key].model!==undefined ? cfg[p.key].model : (p.model||"");
  const tmp=(p)=> cfg[p.key]&&cfg[p.key].temperature!==undefined ? cfg[p.key].temperature : (p.temperature!=null?p.temperature:"");
  const cfgDirty=(p)=> (cfg[p.key]&&cfg[p.key].model!==undefined && (cfg[p.key].model||"")!==(p.model||"")) || (cfg[p.key]&&cfg[p.key].temperature!==undefined && String(cfg[p.key].temperature)!==String(p.temperature!=null?p.temperature:""));
  const save = (p)=>{
    const content=edits[p.key]!=null?edits[p.key]:p.content;
    setSaving(p.key);
    API.promptSave(p.key, content, mdl(p)||null, tmp(p)===""?null:tmp(p), scope==="site"?s.id:undefined).then(r=>{
      if(r.error){ ctx.toast("Save failed: "+r.error,"clay"); return; }
      ctx.toast(scope==="site"?("Saved for "+s.name+" — live on next call"):"Saved — live on next call","teal"); setCfg(c=>{const n={...c};delete n[p.key];return n;}); load();
    }).catch(e=>ctx.toast("Save failed: "+e.message,"clay")).finally(()=>setSaving(""));
  };
  const reset = (p)=>{
    setSaving(p.key);
    API.promptReset(p.key, scope==="site"?s.id:undefined).then(r=>{ if(r.error){ctx.toast(r.error,"clay");return;} ctx.toast(scope==="site"?("Cleared "+s.name+"'s override"):"Reset to default","gold"); load(); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setSaving(""));
  };

  const prompts=(data&&data.prompts||[]).filter(p=> !q || (p.label+p.key+p.category+p.content).toLowerCase().includes(q.toLowerCase()));
  const cats=[...new Set(prompts.map(p=>p.category))];
  const tableOk = data && data.status && data.status.tableOk;

  return (
    <div className="rise">
      <PageHead title="Admin Panel" sub="System health, integrations & the editable AI prompt library.">
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {tab==="prompts" && <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search prompts…" className="search-in" style={{ padding:"8px 13px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none", width:180 }} />}
          <NeoButton kind="soft" size="sm" icon={(busy||statBusy)?undefined:"trend"} disabled={busy||statBusy} onClick={()=>{ loadStat(); load(); }}>{(busy||statBusy)&&<Icon name="cog" size={14} className="audit-spin" />}Refresh</NeoButton>
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Engine offline.</div></SoftCard>}

      {live && (
        <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", width:"fit-content", marginBottom:18 }}>
          {[["system","System & Integrations","grid"],["prompts","AI Prompts","doc"]].map(([v,l,ic])=>(
            <button key={v} onClick={()=>setTab(v)} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", fontSize:13, fontWeight:700, borderRadius:99, background:tab===v?"var(--surface)":"transparent", color:tab===v?"var(--t-700)":"var(--muted)", boxShadow:tab===v?"var(--neo-sm)":"none" }}><Icon name={ic} size={14} />{l}</button>
          ))}
        </div>
      )}

      {/* ── SYSTEM & INTEGRATIONS ── */}
      {live && tab==="system" && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {statBusy && !stat && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:10 }}><Icon name="cog" size={16} className="audit-spin" />Checking system…</div></SoftCard>}
          {stat && stat.error && <ErrBanner msg={stat.error} onRetry={loadStat} />}
          {stat && !stat.error && (()=>{
            const ints=Object.entries(stat.integrations||{});
            const okCount=ints.filter(([,v])=>v.configured).length;
            return (<>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
                <PatternCard icon="check" tone="teal" value={okCount+"/"+ints.length} title="Integrations live" sub="API connections configured" />
                <PatternCard icon="doc" tone="plum" value={(stat.prompts&&stat.prompts.count)||0} title="AI prompts" sub={((stat.prompts&&stat.prompts.overridden)||0)+" customised"} />
                <PatternCard icon="globe" tone="gold" value={stat.country||"UK"} title="Target market" sub="active site's research scope" />
                <PatternCard icon="shield" tone={stat.server&&stat.server.writesPaused?"gray":"clay"} value={stat.server&&stat.server.writesPaused?"PAUSED":"LIVE writes"} title="Write mode" sub={stat.server&&stat.server.writesPaused?"kill switch on — writes blocked":"armed sites write live"} />
              </div>
              <SoftCard hover={false}>
                <SectionHead sub="Every external service the platform depends on">Integrations</SectionHead>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                  {ints.map(([k,v])=>(
                    <div key={k} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <span style={{ width:10, height:10, borderRadius:99, background:v.configured?"var(--t-500)":"var(--clay)", flexShrink:0, boxShadow:v.configured?"0 0 0 3px rgba(45,140,120,.15)":"0 0 0 3px rgba(190,90,70,.12)" }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{v.label}</div>
                        <div style={{ fontSize:11.5, color:"var(--muted)" }}>{v.detail}</div>
                      </div>
                      <Chip tone={v.configured?"teal":"clay"} size="sm">{v.configured?"connected":"not set"}</Chip>
                    </div>
                  ))}
                </div>
              </SoftCard>
              <SoftCard hover={false}>
                <SectionHead sub="Runtime details">Server</SectionHead>
                <div style={{ display:"flex", gap:24, flexWrap:"wrap", fontSize:12.5 }}>
                  {[["Engine","v"+(stat.server&&stat.server.version)],["Node",stat.server&&stat.server.node],["Default model",stat.server&&stat.server.model],["Uptime",stat.server?Math.floor(stat.server.uptimeSec/60)+"m "+(stat.server.uptimeSec%60)+"s":"—"],["Prompt store",stat.prompts&&stat.prompts.tableOk?"Supabase ✓":"defaults only"],["Scope",stat.scope]].map(([l,v])=>(
                    <div key={l}><div style={{ fontSize:11, color:"var(--faint)", textTransform:"uppercase", letterSpacing:".04em" }}>{l}</div><div style={{ fontWeight:700, fontFamily:"var(--mono)", fontSize:12 }}>{v}</div></div>
                  ))}
                </div>
              </SoftCard>
              {health && !health.error && (
                <SoftCard hover={false}>
                  <SectionHead sub="Live error signal — recent route failures since the last restart (so breakage surfaces here, not by clicking a dead button)">Health</SectionHead>
                  {(!health.errors || !health.errors.length) ? (
                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 2px", fontSize:13.5, color:"var(--t-700)", fontWeight:600 }}><span style={{ width:10, height:10, borderRadius:99, background:"var(--t-500)", boxShadow:"0 0 0 3px rgba(45,140,120,.15)" }} />All clear — no route errors recorded ({(health.summary&&health.summary.totalOk)||0} successful calls tracked).</div>
                  ) : (<>
                    {health.summary && health.summary.failing && health.summary.failing.length>0 && <div style={{ fontSize:12.5, color:"var(--clay)", fontWeight:700, marginBottom:8 }}>⚠ Currently failing: {health.summary.failing.join(", ")}</div>}
                    <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflow:"auto" }}>
                      {health.errors.map((e,i)=>(
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12 }}>
                          <span style={{ fontFamily:"var(--mono)", color:"var(--clay)", fontWeight:700, flexShrink:0, minWidth:160 }}>{e.key}</span>
                          <span style={{ flex:1, minWidth:0, color:"var(--ink-2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={e.msg}>{e.msg}</span>
                          <span style={{ color:"var(--faint)", flexShrink:0, fontFamily:"var(--mono)" }}>{window.timeAgo?window.timeAgo(new Date(e.ts).toISOString()):""}</span>
                        </div>
                      ))}
                    </div>
                  </>)}
                </SoftCard>
              )}
              <div style={{ fontSize:11, color:"var(--faint)", lineHeight:1.5 }}>Tip: red dots = a key isn't in <code>.env</code>. DataForSEO shows live balance; top up at app.dataforseo.com when low.</div>
            </>);
          })()}
        </div>
      )}

      {/* ── AI PROMPTS ── */}
      {live && tab==="prompts" && (<>
      {err && <div style={{ marginBottom:16 }}><ErrBanner msg={err} onRetry={load} /></div>}
      {data && !tableOk && (
        <div style={{ marginBottom:16, display:"flex", gap:12, padding:"14px 16px", background:"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
          <Icon name="alert" size={18} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.5 }}>The <code>prompts</code> table isn't set up yet — edits won't persist. Run <code>supabase/prompts-table.sql</code> once in the Supabase SQL editor. You can still preview the defaults below.</div>
        </div>
      )}

      {live && data && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Prompts are per-site: every site has its own. */}
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 14px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
            <Icon name="doc" size={16} style={{ color:"var(--t-700)", flexShrink:0 }} />
            <span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Editing the AI prompts for <b>{s.name}</b>. Each site has its own prompts — switch site (top bar) to edit another. Saving a prompt sets it for this site only.</span>
          </div>
          <div style={{ fontSize:12, color:"var(--muted)" }}>{prompts.length} prompt(s) · {prompts.filter(p=>p.siteOverridden).length} customised for {s.name} · changes apply on the next AI call.</div>
          {cats.map(cat=>(
            <div key={cat}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--t-700)", margin:"6px 2px 8px" }}>{cat}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {prompts.filter(p=>p.category===cat).map(p=>{
                  const val=edits[p.key]!=null?edits[p.key]:p.content;
                  const dirty=(edits[p.key]!=null && edits[p.key]!==p.content) || cfgDirty(p);
                  const changedVsDefault = val!==p.default;
                  return (
                  <SoftCard key={p.key} hover={false}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13.5, fontWeight:700, display:"flex", alignItems:"center", gap:8 }}>{p.label}{p.overridden&&<Chip tone="teal" size="sm">customised</Chip>}{dirty&&<Chip tone="gold" size="sm">unsaved</Chip>}</div>
                        <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>{p.description} · <code style={{ fontSize:11 }}>{p.key}</code></div>
                      </div>
                      <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                        <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>setDiffOpen(diffOpen===p.key?"":p.key)} disabled={!changedVsDefault}>Diff</NeoButton>
                        <NeoButton kind="soft" size="sm" icon="clock" onClick={()=>toggleHist(p)}>History</NeoButton>
                        <NeoButton kind="soft" size="sm" icon={testing===p.key?undefined:"sparkles"} disabled={testing===p.key} onClick={()=>runTest(p)}>{testing===p.key&&<Icon name="cog" size={14} className="audit-spin" />}{testing===p.key?"Testing…":"Test"}</NeoButton>
                        {p.overridden && <NeoButton kind="soft" size="sm" icon="undo" disabled={saving===p.key} onClick={()=>reset(p)}>Reset</NeoButton>}
                        <NeoButton kind="primary" size="sm" icon={saving===p.key?undefined:"check"} disabled={saving===p.key||!dirty} onClick={()=>save(p)}>{saving===p.key&&<Icon name="cog" size={14} className="audit-spin" />}Save</NeoButton>
                      </div>
                    </div>
                    {/* model + temperature controls */}
                    <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
                      <Chip tone={p.engine==="perplexity"?"plum":"teal"} size="sm">{p.engine}</Chip>
                      <label style={{ fontSize:11.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}>Model
                        {p.engine==="perplexity" ? (
                          <select value={mdl(p)} onChange={e=>setCfg(c=>({...c,[p.key]:{...(c[p.key]||{}),model:e.target.value}}))} className="neo-btn" style={{ fontSize:11.5, padding:"4px 8px", borderRadius:8, background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                            <option value="">default</option><option value="fast">sonar (fast)</option><option value="pro">sonar-pro</option><option value="reason">sonar-reasoning</option>
                          </select>
                        ) : (
                          (()=>{ const cur=mdl(p); const OPTS=[["","default (Sonnet)"],["claude-opus-4-8","Opus 4.8 — top quality"],["claude-sonnet-4-6","Sonnet 4.6 — balanced"],["claude-haiku-4-5-20251001","Haiku 4.5 — fast & low-cost"]]; const known=OPTS.some(o=>o[0]===cur); return (
                          <select value={cur} onChange={e=>setCfg(c=>({...c,[p.key]:{...(c[p.key]||{}),model:e.target.value}}))} className="neo-btn" style={{ fontSize:11.5, padding:"4px 8px", borderRadius:8, background:"var(--bg)", boxShadow:"var(--neo-in)", color:"var(--ink)", maxWidth:220 }}>
                            {OPTS.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}
                            {!known && cur && <option value={cur}>{cur} (custom)</option>}
                          </select>
                          ); })()
                        )}
                      </label>
                      <label style={{ fontSize:11.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}>Temp
                        <input type="number" min="0" max="1" step="0.05" value={tmp(p)} onChange={e=>setCfg(c=>({...c,[p.key]:{...(c[p.key]||{}),temperature:e.target.value}}))} placeholder="auto" style={{ fontSize:11.5, padding:"4px 8px", borderRadius:8, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", width:64, color:"var(--ink)", outline:"none" }} />
                      </label>
                      {(p.model||p.temperature!=null) && <span style={{ fontSize:10.5, color:"var(--faint)" }}>active: {p.model||"default"} · temp {p.temperature!=null?p.temperature:"auto"}</span>}
                    </div>
                    <textarea value={val} onChange={e=>setEdits(x=>({...x,[p.key]:e.target.value}))} rows={Math.min(16,Math.max(4,Math.ceil(val.length/90)))}
                      style={{ width:"100%", resize:"vertical", padding:"11px 13px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12, fontFamily:"var(--mono)", lineHeight:1.5, color:"var(--ink)", outline:"none" }} />
                    {/* diff vs default */}
                    {diffOpen===p.key && (
                      <div style={{ marginTop:10, padding:"10px 12px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontFamily:"var(--mono)", fontSize:11.5, lineHeight:1.55, maxHeight:300, overflowY:"auto" }}>
                        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6, fontFamily:"var(--sans)" }}>Changes vs in-code default (<span style={{color:"var(--clay)"}}>− removed</span> / <span style={{color:"var(--t-700)"}}>+ added</span>):</div>
                        {diffLines(p.default,val).map((d,k)=>(
                          <div key={k} style={{ whiteSpace:"pre-wrap", padding:"0 4px", background:d.t==="add"?"rgba(45,140,120,.10)":d.t==="del"?"rgba(190,90,70,.10)":"transparent", color:d.t==="add"?"var(--t-800)":d.t==="del"?"var(--clay)":"var(--faint)", textDecoration:d.t==="del"?"line-through":"none" }}>{d.t==="add"?"+ ":d.t==="del"?"− ":"  "}{d.v||" "}</div>
                        ))}
                      </div>
                    )}
                    {/* Test output */}
                    {tests[p.key] && (
                      <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}><Chip tone="teal" size="sm" icon="sparkles">test output</Chip><span style={{ fontSize:11, color:"var(--faint)" }}>via {tests[p.key].engine}{tests[p.key].cost?` · $${tests[p.key].cost}`:""}</span><button onClick={()=>setTests(t=>{const n={...t};delete n[p.key];return n;})} style={{ marginLeft:"auto", fontSize:11, color:"var(--muted)", background:"none" }}>clear</button></div>
                        <pre style={{ margin:0, fontSize:11.5, fontFamily:"var(--mono)", whiteSpace:"pre-wrap", lineHeight:1.5, color:"var(--ink-2)", maxHeight:260, overflowY:"auto" }}>{tests[p.key].output}</pre>
                        {(tests[p.key].sources||[]).length>0 && <div style={{ fontSize:11, color:"var(--faint)", marginTop:6 }}>Sources: {(tests[p.key].sources||[]).slice(0,4).map((sr,k)=>(<a key={k} href={sr.url} target="_blank" style={{ color:"var(--t-600)", marginRight:7 }}>{sr.domain||(k+1)}</a>))}</div>}
                      </div>
                    )}
                    {/* Version history */}
                    {histOpen===p.key && (
                      <div style={{ marginTop:10, padding:"10px 12px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                        <div style={{ fontSize:11.5, fontWeight:700, color:"var(--ink-2)", marginBottom:7 }}>Version history</div>
                        {hist[p.key]===null && <div style={{ fontSize:12, color:"var(--muted)", display:"flex", gap:8, alignItems:"center" }}><Icon name="cog" size={13} className="audit-spin" />Loading…</div>}
                        {Array.isArray(hist[p.key]) && hist[p.key].length===0 && <div style={{ fontSize:12, color:"var(--muted)" }}>No saved versions yet — your first Save will appear here.</div>}
                        {Array.isArray(hist[p.key]) && hist[p.key].map((v,k)=>(
                          <div key={v.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 9px", borderRadius:"var(--r-sm)", background:k%2?"transparent":"var(--surface)" }}>
                            <span style={{ fontSize:11, color:"var(--muted)", width:120, flexShrink:0 }}>{fmtTime(v.saved_at)}</span>
                            <span style={{ flex:1, fontSize:11.5, fontFamily:"var(--mono)", color:"var(--ink-2)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(v.content||"").slice(0,80)}</span>
                            <button onClick={()=>setEdits(x=>({...x,[p.key]:v.content}))} className="neo-btn" style={{ fontSize:11, fontWeight:700, color:"var(--t-700)", padding:"3px 9px", borderRadius:7, background:"var(--bg)", boxShadow:"var(--neo-xs)", flexShrink:0 }}>Load</button>
                          </div>
                        ))}
                        {Array.isArray(hist[p.key]) && hist[p.key].length>0 && <div style={{ fontSize:10.5, color:"var(--faint)", marginTop:6 }}>"Load" puts the version in the editor — then Save to make it live.</div>}
                      </div>
                    )}
                  </SoftCard>
                  );
                })}
              </div>
            </div>
          ))}
          {prompts.length===0 && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13 }}>No prompts match "{q}".</div></SoftCard>}
        </div>
      )}
      </>)}
    </div>
  );
}

/* ---------------- Content Engine screen ---------------- */
/* One unified, de-duped, scored worklist from every content source (keywords,
   trending, People Also Ask, AI-visibility). "Run engine" is a HEAVY/slow route
   (~20-60s) that ingests + de-dupes; the worklist is loaded on mount & after a run.
   notProvisioned until supabase/content-engine.sql is run — amber notice, no error. */
/* ---------------- n8n Workflows screen ----------------
   Pick any n8n workflow, edit each node's prompts individually, run it, and
   inspect node errors — a thin proxy to the n8n public API. The instance URL +
   API key live in THIS browser (localStorage) and travel per request; the
   Sentinel server proxies and never stores them. Backend: backend-api/n8n.js. */
function N8nScreen({ ctx }){
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const LS_BASE="sentinel-n8n-base", LS_KEY="sentinel-n8n-key";
  const rd=(k,d)=>{ try{ return localStorage.getItem(k)||d; }catch(e){ return d; } };
  const [base,setBase] = useState(()=>rd(LS_BASE,"https://karimfirmlaw.app.n8n.cloud"));
  const [key,setKey] = useState("");
  const [stored,setStored] = useState(false);       // an encrypted n8n key already lives on the server
  const [changing,setChanging] = useState(false);   // user chose to (re)enter the key
  const [checking,setChecking] = useState(true);    // initial server-status probe in flight
  const [connected,setConnected] = useState(false); // workflows loaded (panel visible)
  const [workflows,setWorkflows] = useState([]);
  const [structure,setStructure] = useState([]);    // intended per-site plan vs live workflows
  const [wfId,setWfId] = useState("");
  const [wf,setWf] = useState(null);
  const [edits,setEdits] = useState({});
  const [busy,setBusy] = useState("");
  const [runOut,setRunOut] = useState(null);
  const [errs,setErrs] = useState(null);
  const [hist,setHist] = useState([]);            // prompt-change history (undo) for the selected workflow
  const [showAll,setShowAll] = useState(false);   // writers-only by default; toggle reveals every workflow
  const [maxPrompt,setMaxPrompt] = useState(null);  // { k, label, nodeName, value } — prompt shown maximized
  const eKey=(nodeId,path)=>nodeId+"\n"+path;
  // Group the workflow picker BY SITE and, by default, show only the real content
  // writers (the classifier tags each). Nothing is hidden permanently — "Show all"
  // reveals templates/experiments too. Duplicate (same site+type) writers are flagged.
  const SITE_ORDER = ["Go Legal AI","Go Legal","Go Visa","Fast ILA","Settlement Agreement Lawyers","GoodFor","Other"];
  // A deactivated DUPLICATE writer (inactive, but its site+type already has an ACTIVE
  // writer) is a retired second copy — e.g. the old SAL writer we turned off. Hide it from
  // the default writers view so only the live one shows. Still revealed under "Show all",
  // so nothing is permanently hidden.
  const hasActiveWriter = {}; for(const w of (workflows||[])){ if(w.isWriter && w.active){ hasActiveWriter[w.site+"|"+(w.type||"")]=true; } }
  const isDeadDup = (w)=> w.isWriter && !w.active && !!hasActiveWriter[w.site+"|"+(w.type||"")];
  const shownWf = (workflows||[]).filter(w=> showAll ? true : (w.isWriter && !isDeadDup(w)));
  const bySite = {}; for(const w of shownWf){ (bySite[w.site]=bySite[w.site]||[]).push(w); }
  const groups = SITE_ORDER.filter(s=>bySite[s]&&bySite[s].length).map(s=>({ site:s, items:bySite[s] }));
  const dupOf = {}; for(const w of (workflows||[])){ if(w.isWriter && !isDeadDup(w)){ const k=w.site+"|"+(w.type||""); dupOf[k]=(dupOf[k]||0)+1; } }
  const isDup = (w)=> w.isWriter && dupOf[w.site+"|"+(w.type||"")]>1;
  const writerN = (workflows||[]).filter(w=>w.isWriter && !isDeadDup(w)).length;
  const dupGroups = Object.keys(dupOf).filter(k=>dupOf[k]>1).length;
  const siteN = groups.filter(g=>g.site!=="Other").length;

  // List workflows using the server-stored key (no key in the browser).
  const loadWorkflows = ()=>{
    setBusy("connect");
    API.n8nWorkflows(base.trim()).then(r=>{
      if(r&&r.error){ ctx.toast("n8n: "+r.error,"clay"); setConnected(false); return; }
      setWorkflows((r&&r.workflows)||[]); setStructure((r&&r.structure)||[]); setConnected(true);
      ctx.toast(((r.workflows||[]).length)+" workflows loaded","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  // Connect once: validate + ENCRYPT the key into Supabase server-side, then load.
  // After this the key never leaves the server again — no re-pasting.
  const connect = ()=>{
    if(!(live && base.trim() && key.trim())){ ctx.toast("Enter your n8n instance URL and API key.","gold"); return; }
    try{ localStorage.setItem(LS_BASE,base.trim()); }catch(e){}
    setBusy("connect");
    API.n8nConnect(base.trim(),key.trim()).then(r=>{
      if(r&&r.error){ ctx.toast("n8n: "+r.error,"clay"); setBusy(""); return; }
      setStored(true); setChanging(false); setKey("");
      ctx.toast("Key encrypted & stored on the server ✓","teal");
      loadWorkflows();   // hands off `busy` — it stays "connect" until workflows finish loading
    }).catch(e=>{ ctx.toast(e.message,"clay"); setBusy(""); });
  };
  const disconnect = ()=>{
    setBusy("connect");
    API.n8nDisconnect().then(()=>{
      setStored(false); setConnected(false); setChanging(false); setKey("");
      setWorkflows([]); setStructure([]); setWf(null); setWfId("");
      ctx.toast("Disconnected — n8n key removed from the server.","gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  const loadWf = (id)=>{
    setWfId(id); setWf(null); setEdits({}); setRunOut(null); setErrs(null); setHist([]);
    if(!id) return;
    setBusy("load");
    API.n8nWorkflowPrompts(base.trim(),undefined,id).then(r=>{
      if(r&&r.error){ ctx.toast("n8n: "+r.error,"clay"); return; }
      setWf(r);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
    // change history (undo) — separate fetch, never blocks the prompts themselves
    API.n8nPromptHistory(id).then(r=>setHist((r&&r.history)||[])).catch(()=>{});
  };
  const save = ()=>{
    const list = Object.keys(edits).map(k=>{ const [nodeId,path]=k.split("\n"); return { nodeId, path, value: edits[k] }; });
    if(!list.length){ ctx.toast("No prompt changes to save.","gold"); return; }
    setBusy("save");
    API.n8nUpdatePrompts(base.trim(),undefined,wfId,list).then(r=>{
      if(r&&r.error){ ctx.toast("n8n save: "+r.error,"clay"); return; }
      ctx.toast("Saved "+((r&&r.updated)||list.length)+" prompt(s) to n8n ✓ — undo available in Change history","teal");
      setEdits({}); loadWf(wfId);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  // Roll the workflow's prompts back to the values BEFORE a recorded save.
  const rollback = (hid)=>{
    setBusy("rollback");
    API.n8nPromptRollback(base.trim(),undefined,wfId,hid).then(r=>{
      if(r&&r.error){ ctx.toast("n8n rollback: "+r.error,"clay"); return; }
      ctx.toast("Rolled back "+((r&&r.restored)||"")+" prompt(s) ✓","teal");
      loadWf(wfId);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  const run = ()=>{
    setBusy("run"); setRunOut(null);
    API.n8nRun(base.trim(),undefined,wfId,{}).then(r=>{
      setRunOut(r||{});
      if(r&&r.error) ctx.toast("n8n run: "+r.error,"clay");
      else if(r&&r.ranVia==="none") ctx.toast("No webhook trigger — run it from the n8n editor.","gold");
      else {
        // A writer webhook accepts the blank trigger (HTTP 200) but the run then dies at
        // its first Airtable node because no ?recordID was supplied — so a green
        // "triggered ✓" was misleading. Be honest for writer flows.
        const curWf=(workflows||[]).find(w=>String(w.id)===String(wfId));
        if(curWf&&curWf.isWriter) ctx.toast("Trigger fired, but writer flows need a specific Airtable record (?recordID) — a blank run won't produce an article. Flip that record's Status in Airtable for a real run.","gold");
        else ctx.toast("Workflow triggered ✓","teal");
      }
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  const loadErrs = ()=>{
    setBusy("errors"); setErrs(null);
    API.n8nExecutions(base.trim(),undefined,wfId,"error").then(r=>{
      if(r&&r.error){ ctx.toast("n8n: "+r.error,"clay"); return; }
      setErrs((r&&r.executions)||[]);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
  };
  // On mount: is a key already stored server-side? If so, load straight away (no
  // paste). Otherwise migrate a legacy browser-held key into the encrypted store once.
  useEffect(()=>{
    if(!live){ setChecking(false); return; }
    API.n8nStatus().then(s=>{
      if(s&&s.connected){
        setStored(true);
        if(s.baseUrl){ setBase(s.baseUrl); try{ localStorage.setItem(LS_BASE,s.baseUrl); }catch(e){} }
        loadWorkflows();
        return;
      }
      let legacy=""; try{ legacy=localStorage.getItem(LS_KEY)||""; }catch(e){}
      if(legacy && base.trim()){
        API.n8nConnect(base.trim(),legacy).then(r=>{
          if(r&&!r.error){ setStored(true); try{ localStorage.removeItem(LS_KEY); }catch(e){} loadWorkflows(); }
        }).catch(()=>{});
      }
    }).catch(()=>{}).finally(()=>setChecking(false));
  },[]);   // eslint-disable-line

  const inp = { width:"100%", boxSizing:"border-box", padding:"10px 12px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none", fontFamily:"inherit" };
  const ta = Object.assign({}, inp, { fontFamily:"var(--mono)", fontSize:12, lineHeight:1.5, resize:"vertical" });
  const nEdits = Object.keys(edits).length;

  return (
    <div>
      <PageHead title="n8n Workflows" sub="Pick a workflow, edit each node's prompts, run it, and inspect node errors — straight from your n8n instance." />

      <SoftCard hover={false}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Connect n8n</div>
        {stored && !changing ? (
          <div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <Chip tone={connected?"teal":"gold"} size="sm">{connected?"Connected ✓":"Key stored"}</Chip>
              <span style={{ fontSize:12.5, color:"var(--muted)", fontFamily:"var(--mono)" }}>{base}</span>
              <span style={{ fontSize:12, color:"var(--faint)" }}>· key encrypted on the server (never in this browser)</span>
              <div style={{ flex:1 }} />
              <NeoButton kind="soft" size="sm" disabled={busy==="connect"} onClick={loadWorkflows}>{busy==="connect"&&<Icon name="cog" size={13} className="audit-spin" />}Reload</NeoButton>
              <NeoButton kind="soft" size="sm" disabled={busy==="connect"} onClick={()=>{ setChanging(true); setKey(""); }}>Change key</NeoButton>
              <NeoButton kind="soft" size="sm" disabled={busy==="connect"} onClick={disconnect}>Disconnect</NeoButton>
            </div>
            {stored && !connected && !checking && busy!=="connect" && (
              <div style={{ marginTop:8, fontSize:12.5, color:"var(--clay,#c06a4a)" }}>
                Key is stored, but workflows didn't load — the key may be rotated/revoked or the n8n instance unreachable. Try <b>Reload</b>, or <b>Change key</b>.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div style={{ flex:"2 1 300px" }}>
              <div style={{ fontSize:11.5, color:"var(--muted)", marginBottom:4 }}>Instance URL</div>
              <input style={inp} value={base} onChange={e=>setBase(e.target.value)} placeholder="https://your-instance.app.n8n.cloud" />
            </div>
            <div style={{ flex:"2 1 300px" }}>
              <div style={{ fontSize:11.5, color:"var(--muted)", marginBottom:4 }}>API key <span style={{ color:"var(--faint)" }}>· encrypted &amp; stored on the server — pasted once</span></div>
              <input style={inp} type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="n8n public API key" />
            </div>
            <NeoButton kind="primary" icon={busy==="connect"?undefined:"bolt"} disabled={!(live&&base.trim()&&key.trim())||busy==="connect"} onClick={connect}>{busy==="connect"&&<Icon name="cog" size={15} className="audit-spin" />}{stored?"Save key":"Connect"}</NeoButton>
            {stored && changing && <NeoButton kind="soft" onClick={()=>{ setChanging(false); setKey(""); }}>Cancel</NeoButton>}
          </div>
        )}
        {!live && <div style={{ marginTop:8, fontSize:12.5, color:"var(--muted)" }}>Live mode required — the panel proxies through the Sentinel server.</div>}
        {live && checking && <div style={{ marginTop:8, fontSize:12.5, color:"var(--muted)" }}>Checking connection…</div>}
      </SoftCard>

      {connected && structure.length>0 && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:2 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Content structure</div>
            <span style={{ fontSize:12, color:"var(--muted)" }}>— the master set each site should have, mapped to your live workflows</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:10, marginTop:10 }}>
            {structure.map(s=>{
              const missing = s.planned.filter(p=>p.status==="missing").length;
              const dup = s.planned.filter(p=>p.status==="duplicate").length;
              return (
                <div key={s.site} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ fontSize:12.5, fontWeight:700, marginBottom:8 }}>{s.site}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {s.planned.map(p=>{
                      const one = p.workflows.find(w=>w.active) || p.workflows[0];
                      const off = (p.count||0)-(p.activeCount||0);
                      const tone = p.status==="ok"?"teal":p.status==="duplicate"?"clay":p.status==="inactive"?"gold":"gray";
                      const suffix = p.status==="ok"?(off>0?(" ✓ ·+"+off+" old"):" ✓")
                                   : p.status==="duplicate"?(" ⚠ ×"+p.activeCount+" active")
                                   : p.status==="inactive"?" · all off"
                                   : " — missing";
                      return (
                        <span key={p.type} onClick={one?()=>loadWf(one.id):undefined} style={{ cursor:one?"pointer":"default" }} title={one?one.name:"no workflow for this type yet"}>
                          <Chip tone={tone} size="sm">{p.type}{suffix}</Chip>
                        </span>
                      );
                    })}
                  </div>
                  {s.extras&&s.extras.length>0 && (
                    <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:8 }}>
                      <span style={{ color:"var(--faint)" }}>Extra (not in your plan): </span>
                      {s.extras.map((e,i)=>(<span key={e.id}>{i>0?", ":""}<span onClick={()=>loadWf(e.id)} style={{ cursor:"pointer", textDecoration:"underline dotted" }} title={e.name}>{e.type||"?"}{e.active?"":" (off)"}</span></span>))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", fontSize:11.5, color:"var(--muted)", marginTop:12 }}>
            <Chip tone="teal" size="sm">✓ active</Chip>
            <Chip tone="clay" size="sm">⚠ duplicate</Chip>
            <Chip tone="gold" size="sm">off</Chip>
            <Chip tone="gray" size="sm">missing</Chip>
            <span>· "active" = a workflow exists and is switched on — not that it has produced an article (check Run history in n8n) · click a type to open its prompts · nothing is deleted.</span>
          </div>
        </SoftCard>
      )}

      {connected && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Workflow</div>
            <select style={Object.assign({}, inp, { flex:"1 1 300px", cursor:"pointer" })} value={wfId} onChange={e=>loadWf(e.target.value)}>
              <option value="">Select a workflow…</option>
              {groups.map(g=>(
                <optgroup key={g.site} label={g.site+"  ("+g.items.length+")"}>
                  {g.items.map(w=>{
                    const dup=isDup(w);
                    const lbl=(w.active?"● ":"○ ")+(w.isWriter?(w.type||"Writer"):w.name)+(dup?("  ⚠ "+String(w.id).slice(0,6)):"")+(w.isWriter&&!w.active?"  · inactive":"");
                    return <option key={w.id} value={w.id}>{lbl}</option>;
                  })}
                </optgroup>
              ))}
            </select>
            <NeoButton kind="soft" size="sm" onClick={()=>setShowAll(v=>!v)}>{showAll?"Writers only":("Show all ("+(workflows||[]).length+")")}</NeoButton>
            {busy==="load" && <Icon name="cog" size={16} className="audit-spin" />}
          </div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>
            {writerN} content writer{writerN===1?"":"s"} across {siteN} site{siteN===1?"":"s"}
            {dupGroups?(<> · <span style={{ color:"var(--clay,#c06a4a)", fontWeight:600 }}>{dupGroups} duplicate group{dupGroups>1?"s":""} flagged ⚠</span></>):null}
            {!showAll&&(workflows||[]).length>writerN?(<> · <span style={{ color:"var(--faint)" }}>{(workflows||[]).length-writerN} other flows hidden</span></>):null}
          </div>
          {wf && (
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginTop:10 }}>
              {(()=>{ const sel=(workflows||[]).find(w=>w.id===wfId); return sel? (<>{sel.site!=="Other"&&<Chip tone="teal" size="sm">{sel.site}</Chip>}{sel.type&&<Chip tone="gray" size="sm">{sel.type}</Chip>}<Chip tone={sel.active?"teal":"gray"} size="sm">{sel.active?"active":"inactive"}</Chip>{isDup(sel)&&<Chip tone="clay" size="sm">duplicate ⚠</Chip>}{sel.updatedAt&&<span style={{ fontSize:11.5, color:"var(--faint)" }} title="Last saved in n8n (any editor, incl. the n8n UI)">· modified {new Date(sel.updatedAt).toLocaleString()}</span>}</>):null; })()}
              <NeoButton kind="primary" size="sm" icon={busy==="run"?undefined:"bolt"} disabled={busy==="run"||!wf.hasWebhook} onClick={run}>{busy==="run"&&<Icon name="cog" size={14} className="audit-spin" />}Run</NeoButton>
              <NeoButton kind="soft" size="sm" icon={busy==="errors"?undefined:"radar"} disabled={busy==="errors"} onClick={loadErrs}>{busy==="errors"&&<Icon name="cog" size={14} className="audit-spin" />}Errors</NeoButton>
              <NeoButton kind="soft" size="sm" icon={busy==="save"?undefined:"check"} disabled={busy==="save"||!nEdits} onClick={save}>{busy==="save"&&<Icon name="cog" size={14} className="audit-spin" />}Save prompts{nEdits?(" ("+nEdits+")"):""}</NeoButton>
            </div>
          )}
          {wf && !wf.hasWebhook && <div style={{ marginTop:8, fontSize:12, color:"var(--muted)" }}>No webhook trigger — Run from the n8n editor (this one is manual/schedule).</div>}
        </SoftCard>
      )}

      {/* Change history — every prompt save from this panel is recorded (last 10) and can
          be rolled back. Edits made directly in the n8n editor can't be hooked, but the
          workflow's "modified" stamp above reveals them. */}
      {wf && hist.length>0 && (
        <SoftCard hover={false}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Change history</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginBottom:10 }}>
            Last {hist.length} prompt save{hist.length===1?"":"s"} from this panel — <b>Undo</b> restores the values from before that save. Rollbacks are recorded too, so an undo can itself be undone. <span style={{ color:"var(--faint)" }}>(Edits made directly in the n8n editor aren't captured here.)</span>
          </div>
          {hist.map(h=>{
            const es=h.edits||[]; const nodes=[...new Set(es.map(e=>e.nodeName||e.nodeId))];
            return (
              <div key={h.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"9px 11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:8 }}>
                <Chip tone={h.source==="rollback"?"gold":"teal"} size="sm">{h.source==="rollback"?"rollback":"edit"}</Chip>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, color:"var(--ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{es.length} prompt{es.length===1?"":"s"} · {nodes.slice(0,3).join(", ")}{nodes.length>3?" +"+(nodes.length-3):""}</div>
                  <div style={{ fontSize:11.5, color:"var(--faint)" }}>{new Date(h.created_at).toLocaleString()}</div>
                </div>
                <NeoButton kind="soft" size="sm" disabled={busy==="rollback"} onClick={()=>rollback(h.id)}>{busy==="rollback"&&<Icon name="cog" size={13} className="audit-spin" />}Undo</NeoButton>
              </div>
            );
          })}
        </SoftCard>
      )}

      {runOut && (
        <SoftCard hover={false}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Run result</div>
          <pre style={{ margin:0, fontFamily:"var(--mono)", fontSize:11.5, color:"var(--ink)", whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:220, overflow:"auto" }}>{JSON.stringify(runOut,null,2)}</pre>
        </SoftCard>
      )}

      {errs && (
        <SoftCard hover={false}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Recent errors · {errs.length}</div>
          {!errs.length ? <div style={{ padding:"6px 2px", fontSize:13, color:"var(--muted)" }}>No errors 🎉</div> :
            errs.map(e=>(
              <div key={e.id} style={{ padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:8 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  {e.node && <Chip tone="clay" size="sm">{e.node}</Chip>}
                  <span style={{ fontSize:11, color:"var(--faint)" }}>{String(e.stoppedAt||e.startedAt||"").slice(0,19).replace("T"," ")}</span>
                </div>
                <div style={{ marginTop:4, fontSize:12.5, color:"var(--ink)", wordBreak:"break-word" }}>{e.message||"(no message)"}</div>
              </div>
            ))
          }
        </SoftCard>
      )}

      {wf && (
        <div>
          {(wf.nodes||[]).length===0 && <SoftCard hover={false}><div style={{ padding:"6px 2px", color:"var(--muted)", fontSize:13 }}>No editable prompts in this workflow.</div></SoftCard>}
          {(wf.nodes||[]).map(n=>(
            <SoftCard key={n.nodeId} hover={false}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
                <div style={{ fontSize:13.5, fontWeight:700 }}>{n.nodeName}</div>
                <Chip tone="teal" size="sm">{n.nodeType}</Chip>
              </div>
              {n.prompts.map(pr=>{
                const k = eKey(n.nodeId, pr.path);
                const val = (k in edits) ? edits[k] : pr.value;
                return (
                  <div key={pr.path} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:11.5, fontWeight:700, color:"var(--muted)" }}>{pr.label}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <span style={{ fontSize:10.5, color:"var(--faint)" }}>{(k in edits)?"edited · ":""}{String(val).length} chars</span>
                        <button type="button" title="Maximize — edit in a large window" onClick={()=>setMaxPrompt({ k, label:pr.label, nodeName:n.nodeName, value:pr.value })} style={{ border:"none", background:"var(--bg)", boxShadow:"var(--neo-xs)", cursor:"pointer", color:"var(--muted)", fontSize:13, lineHeight:1, padding:"4px 7px", borderRadius:7 }}>⤢</button>
                      </div>
                    </div>
                    <textarea style={Object.assign({}, ta, { minHeight: Math.min(320, Math.max(70, Math.round(String(val).length/9))) })} value={val} onChange={e=>setEdits(s=>Object.assign({}, s, { [k]: e.target.value }))} />
                  </div>
                );
              })}
            </SoftCard>
          ))}
        </div>
      )}

      {maxPrompt && (() => {
        const mval = (maxPrompt.k in edits) ? edits[maxPrompt.k] : maxPrompt.value;
        return (
          <div onClick={()=>setMaxPrompt(null)} onKeyDown={e=>{ if(e.key==="Escape") setMaxPrompt(null); }} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(20,20,28,0.55)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"3vh 3vw" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"0 24px 70px rgba(0,0,0,.4)", width:"min(1100px, 96vw)", height:"92vh", display:"flex", flexDirection:"column", padding:18, boxSizing:"border-box" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:800, letterSpacing:"-.01em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{maxPrompt.nodeName}</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{maxPrompt.label} · {String(mval).length} chars{(maxPrompt.k in edits)?" · edited":""}</div>
                </div>
                <div style={{ flex:1 }} />
                <NeoButton kind="soft" size="sm" onClick={()=>setMaxPrompt(null)}>Close ✕</NeoButton>
              </div>
              <textarea autoFocus value={mval} onChange={e=>setEdits(st=>Object.assign({}, st, { [maxPrompt.k]: e.target.value }))} style={{ flex:1, width:"100%", boxSizing:"border-box", resize:"none", border:"none", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", padding:"16px 18px", fontFamily:"var(--mono)", fontSize:13.5, lineHeight:1.65, color:"var(--ink)", outline:"none" }} />
              <div style={{ fontSize:11, color:"var(--faint)", marginTop:8, textAlign:"right" }}>Edits sync live — press <b>Save prompts</b> below to write them to n8n · Esc to close</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ContentEngineScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [items,setItems] = useState([]);
  const [running,setRunning] = useState(false);
  const [loading,setLoading] = useState(false);
  const [notProv,setNotProv] = useState(false);
  const [busyId,setBusyId] = useState("");   // id being dismissed / status-changed
  const [drafting,setDrafting] = useState(false);   // auto-draft top-5 → Article Writer in flight
  const [draftingAns,setDraftingAns] = useState(false);   // draft top-5 answer blocks in place
  const [syncing,setSyncing] = useState(false);   // sync published → monitor in flight
  const [openDraft,setOpenDraft] = useState("");   // in_review row id whose answer-block draft is expanded

  const load = ()=>{
    if(!live) return;
    setLoading(true);
    API.engineWorklist(s.id).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); setItems([]); return; }
      setNotProv(false);
      setItems(Array.isArray(r&&r.items)?r.items:[]);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setLoading(false));
  };
  useEffect(()=>{ setItems([]); setNotProv(false); if(live) load(); },[s.id]);

  const runEngine = ()=>{
    if(!live) return;
    setRunning(true);
    // The run is fire-and-forget server-side (it 504s if awaited — the producers
    // exceed the edge sync cap), so poll /engine-run-status until it finishes.
    let polls = 0;
    const poll = ()=>{
      API.engineRunStatus(s.id).then(st=>{
        if(!st || st.status==="running"){ if(++polls<40){ setTimeout(poll,7000); } else { ctx.toast("Engine still running — check back shortly.","gold"); setRunning(false); } return; }
        if(st.status==="error"){ ctx.toast("Content Engine: "+(st.error||"run failed"),"clay"); setRunning(false); return; }
        if(st.status==="unknown"){ ctx.toast("Engine run was interrupted (server restart) — please run it again.","gold"); setRunning(false); return; }
        setNotProv(!!st.notProvisioned);
        const n = (st&&st.count!=null)?st.count:0;
        ctx.toast(n>0?("Ingested "+n+" opportunity"+(n===1?"":"s")+" from every source ✓"):"No new opportunities found","teal");
        load(); setRunning(false);
      }).catch(()=>{ if(++polls<40){ setTimeout(poll,7000); } else { setRunning(false); } });
    };
    API.engineRun(s.id).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); setRunning(false); return; }
      if(r && r.error){ ctx.toast("Content Engine: "+r.error,"clay"); setRunning(false); return; }
      setNotProv(false);
      setTimeout(poll,6000);   // give the background run a head start, then poll
    }).catch(e=>{ ctx.toast(e.message,"clay"); setRunning(false); });
  };

  // Auto-draft the top-5 scored items into the existing Airtable Article Writer. n8n drafts +
  // publishes them → they land in Approve Changes for the operator to approve before publish.
  const autodraft = ()=>{
    if(!live) return;
    setDrafting(true);
    API.engineAutodraft(s.id, { topN:5, actionType:"article" }).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); return; }
      if(r && r.skipped){ ctx.toast(r.reason||"Nothing to auto-draft — connect Airtable Article Writer first","gold"); return; }
      if(r && r.error){ ctx.toast("Auto-draft: "+r.error,"clay"); return; }
      const n=(r&&r.drafted!=null)?r.drafted:0;
      ctx.toast(n>0?("Queued "+n+" to the Article Writer — they'll draft via n8n and land in Approve Changes"+((r&&r.skippedDup)?" ("+r.skippedDup+" already there)":"")):"All top items already in the Article Writer", n>0?"teal":"gold");
      load();
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setDrafting(false));
  };

  // Draft the top scored ANSWER-BLOCK opportunities in place (Claude → payload.draft,
  // moved to in_review) so the "View draft" preview actually has something to show.
  const draftAnswers = ()=>{
    if(!live) return;
    setDraftingAns(true);
    API.engineAutodraft(s.id, { topN:5, actionType:"answer_block" }).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); return; }
      if(r && r.error){ ctx.toast("Draft answers: "+r.error,"clay"); return; }
      const n=(r&&r.drafted!=null)?r.drafted:0;
      ctx.toast(n>0?("Drafted "+n+" answer block"+(n===1?"":"s")+" — open “View draft” below to preview"):"No scored answer-block opportunities to draft yet","teal");
      load();
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setDraftingAns(false));
  };

  // Inverse of auto-draft: read the n8n-completed rows back out of the Article Writer, advance the
  // matching queued/in_review opportunities → published, and start drift monitoring on each URL.
  const syncPublished = ()=>{
    if(!live) return;
    setSyncing(true);
    API.engineSyncPublished(s.id).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); return; }
      if(r && r.skipped){ ctx.toast(r.reason||"Nothing to sync — connect Airtable Article Writer first","gold"); return; }
      if(r && r.error){ ctx.toast("Sync published: "+r.error,"clay"); return; }
      const n=(r&&r.published!=null)?r.published:0;
      const b=(r&&r.baselines!=null)?r.baselines:0;
      ctx.toast(n>0?("Marked "+n+" published & started drift monitoring"+(b?" ("+b+" baseline"+(b===1?"":"s")+" captured)":"")):"No newly-published articles to sync yet", n>0?"teal":"gold");
      load();
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setSyncing(false));
  };

  const dismiss = (item)=>{
    setBusyId(item.id);
    API.engineDismiss(item.id).then(r=>{
      if(r && r.error && !r.notProvisioned){ ctx.toast("Dismiss: "+r.error,"clay"); return; }
      setItems(prev=>prev.filter(x=>x.id!==item.id));
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusyId(""));
  };
  // Push ANY single opportunity to the Article Writer (create content) — not just the top 5.
  const pushOne = (item)=>{
    setBusyId(item.id);
    API.engineAutodraft(s.id, { ids:[item.id] }).then(r=>{
      if(r && r.notProvisioned){ setNotProv(true); return; }
      if(r && r.skipped){ ctx.toast(r.reason||"Couldn't push — connect the Airtable Article Writer first","gold"); return; }
      if(r && r.error){ ctx.toast("Push: "+r.error,"clay"); return; }
      const n=(r&&r.drafted!=null)?r.drafted:0;
      ctx.toast(n>0?"Pushed to the Article Writer ✓ — set its Status to “Write Article” to generate":(r.skippedDup?"Already in the Article Writer":"Nothing pushed"), n>0?"teal":"gold");
      load();
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusyId(""));
  };
  const setStatus = (item,status)=>{
    setBusyId(item.id);
    API.engineSetStatus(item.id, status).then(r=>{
      if(r && r.error && !r.notProvisioned){ ctx.toast("Status: "+r.error,"clay"); return; }
      const next=(r&&r.item)||Object.assign({},item,{status});
      setItems(prev=>prev.map(x=>x.id===item.id?Object.assign({},x,next):x));
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusyId(""));
  };

  // action_type → distinct tone; intent → tone (mirrors OpportunitiesScreen).
  const actionTone = { article:"teal", answer_block:"plum", geo:"gold" };
  const actionLabel = { article:"Article", answer_block:"Answer block", geo:"GEO" };
  const intentTone = { informational:"teal", commercial:"gold", transactional:"plum", navigational:"gray" };
  // status flow: scored → queued (in the Article Writer) → in_review → published → done; dismissed is terminal.
  const statusTone  = { scored:"gray", queued:"teal", in_review:"gold", published:"teal", done:"teal", dismissed:"gray" };
  const statusLabel = { scored:"scored", queued:"Queued", in_review:"In review", published:"Published", done:"done", dismissed:"dismissed" };
  const sorted = items.slice().sort((a,b)=>(b.score||0)-(a.score||0));

  return (
    <div className="rise">
      <PageHead title="Content Engine" sub="One unified, de-duped, scored worklist from every content source — keywords, trending, People Also Ask and AI-visibility.">
        <NeoButton kind="soft" icon={syncing?undefined:"radar"} disabled={syncing||running||!live||notProv} onClick={syncPublished} title={!live?"Connect a live WordPress site":"Mark n8n-completed articles as published and start drift monitoring on each URL"}>
          {syncing&&<Icon name="cog" size={16} className="audit-spin" />}{syncing?"Syncing…":"Sync published → monitor"}
        </NeoButton>
        <NeoButton kind="soft" icon={drafting?undefined:"edit"} disabled={drafting||running||!live||notProv} onClick={autodraft} title={!live?"Connect a live WordPress site":"Push the top 5 scored opportunities into your Article Writer"}>
          {drafting&&<Icon name="cog" size={16} className="audit-spin" />}{drafting?"Queuing…":"Auto-draft top 5 → Article Writer"}
        </NeoButton>
        <NeoButton kind="soft" icon={draftingAns?undefined:"sparkles"} disabled={draftingAns||running||!live||notProv} onClick={draftAnswers} title={!live?"Connect a live WordPress site":"Generate featured-snippet answer blocks for the top scored answer-block opportunities (preview under View draft)"}>
          {draftingAns&&<Icon name="cog" size={16} className="audit-spin" />}{draftingAns?"Drafting…":"Draft top 5 answer blocks"}
        </NeoButton>
        <NeoButton kind="primary" icon={running?undefined:"layers"} disabled={running||!live} onClick={runEngine} title={!live?"Connect a live WordPress site":undefined}>
          {running&&<Icon name="cog" size={16} className="audit-spin" />}{running?"Running engine…":"Run engine"}
        </NeoButton>
      </PageHead>

      {live && !notProv && (
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", margin:"-2px 4px 2px" }}>
          <span style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
            Auto-draft moves top items into your Article Writer → they come back in Approve Changes for you to approve before publish.
          </span>
          {/* AUTO-PILOT: hands-off weekly actioning of the worklist (top 5 → Article Writer). */}
          <button onClick={()=>{
              const next=!s.auto_content_pilot;
              API.updateSite(s.id,{auto_content_pilot:next}).then(r=>{
                if(r&&r.error){ ctx.toast("Couldn't save: "+r.error,"clay"); return; }
                s.auto_content_pilot=next;
                ctx.toast(next?"Auto-pilot ON — top 5 scored items auto-draft to the Article Writer weekly (generation still starts only when Status is flipped)":"Auto-pilot off — items wait for you to push them","teal");
              }).catch(e=>ctx.toast(e.message,"clay"));
            }}
            className="neo-btn" title="When ON, the scheduler auto-drafts the top 5 scored opportunities into the Article Writer every week — nothing publishes without the usual Status flip."
            style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:"var(--r-pill)", border:"none", cursor:"pointer", background:s.auto_content_pilot?"var(--t-100)":"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12, fontWeight:700, color:s.auto_content_pilot?"var(--t-700)":"var(--muted)" }}>
            <span style={{ width:26, height:15, borderRadius:9, position:"relative", background:s.auto_content_pilot?"var(--t-500)":"var(--line)", transition:"background .15s" }}>
              <span style={{ position:"absolute", top:2, left:s.auto_content_pilot?13:2, width:11, height:11, borderRadius:"50%", background:"#fff", transition:"left .15s" }} />
            </span>
            Auto-pilot{s.auto_content_pilot?" ON":""}
          </button>
        </div>
      )}

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to run the Content Engine.</div></SoftCard>}

      {live && notProv && (
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)", borderLeft:"3px solid var(--gold)" }}>
          <Icon name="alert" size={16} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12.5, color:"var(--ink)", lineHeight:1.5 }}>Run <b>supabase/content-engine.sql</b> in Supabase to enable the Content Engine.</div>
        </div>
      )}

      {live && !notProv && running && items.length===0 && (
        <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Ingesting from every source (keywords, trending, People Also Ask, AI-visibility) and de-duping…</div></SoftCard>
      )}

      {live && !notProv && !running && loading && items.length===0 && (
        <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Loading worklist…</div></SoftCard>
      )}

      {live && !notProv && !running && !loading && items.length===0 && (
        <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14 }}>No opportunities yet — click Run engine to ingest from every source.</div></SoftCard>
      )}

      {live && !notProv && sorted.length>0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          {sorted.map(item=>{
            const scoreColor = tealForScore(Math.round((item.score||0)*4));  // scores ~0-15 → 0-60 for the color ramp
            const evidence = Array.isArray(item.evidence)?item.evidence:[];
            // Multi-source is the dedupe payoff — show ALL distinct sources.
            const sources = [...new Set(evidence.map(e=>e&&e.source).filter(Boolean))];
            const dim = busyId===item.id;
            // A generated answer-block draft (from claude.answerBlock) is stashed on payload.draft; only
            // show the "View draft" affordance for in_review answer_block rows that actually have one.
            const draft = item.payload && item.payload.draft;
            const hasDraft = item.status==="in_review" && item.action_type==="answer_block" && draft && (draft.heading||draft.answer||draft.html);
            const draftOpen = openDraft===item.id;
            return (
              <SoftCard key={item.id} hover={false} pad={16} style={{ opacity:dim?0.55:1 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", minWidth:40, height:28, padding:"0 9px", borderRadius:"var(--r-pill)", background:"var(--bg)", boxShadow:"var(--neo-in)", color:scoreColor, fontWeight:800, fontSize:14, flexShrink:0 }} title="Opportunity score">{Math.round((item.score||0)*10)/10}</span>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>{item.title||item.primary_keyword||"Untitled opportunity"}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginTop:7 }}>
                      <Chip tone={actionTone[item.action_type]||"gray"} size="sm">{actionLabel[item.action_type]||item.action_type||"opportunity"}</Chip>
                      {sources.map((src,i)=><Chip key={i} tone="gray" size="sm" icon="layers">{src}</Chip>)}
                      {item.intent && <Chip tone={intentTone[item.intent]||"gray"} size="sm">{item.intent}</Chip>}
                      {item.status && <Chip tone={statusTone[item.status]||"gray"} size="sm" dot>{statusLabel[item.status]||item.status}</Chip>}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    {item.action_type!=="answer_block" && item.status!=="queued" && item.status!=="done" && <NeoButton kind="primary" size="sm" icon="upload" disabled={dim} onClick={()=>pushOne(item)} title="Push this opportunity to the Article Writer (create content)">Push to writer</NeoButton>}
                    {item.status==="queued" && <Chip tone="teal" size="sm" dot>In Article Writer</Chip>}
                    {item.status!=="done" && <NeoButton kind="soft" size="sm" icon="check" disabled={dim} onClick={()=>setStatus(item,"done")} title="Mark done">Done</NeoButton>}
                    {hasDraft && <NeoButton kind="ghost" size="sm" icon={draftOpen?"x":"chevD"} onClick={()=>setOpenDraft(draftOpen?"":item.id)} title="Preview the generated answer-block draft">{draftOpen?"Hide draft":"View draft"}</NeoButton>}
                    <NeoButton kind="ghost" size="sm" icon="x" disabled={dim} onClick={()=>dismiss(item)}>Dismiss</NeoButton>
                  </div>
                </div>
                {hasDraft && draftOpen && (
                  <div style={{ marginTop:11, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", borderLeft:"3px solid var(--t-500)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7, flexWrap:"wrap" }}>
                      {draft.heading && <span style={{ fontSize:13, fontWeight:800 }}>{draft.heading}</span>}
                      {draft.format && <Chip tone="gray" size="sm">{draft.format}</Chip>}
                      <NeoButton kind="ghost" size="sm" icon="copy" style={{ marginLeft:"auto" }} onClick={()=>{ try{ navigator.clipboard.writeText(draft.html||draft.answer||""); ctx.toast("Answer block copied — paste it high on the page","teal"); }catch(e){ ctx.toast("Select & copy the block below","gold"); } }}>Copy</NeoButton>
                    </div>
                    {draft.answer && <div style={{ fontSize:12.5, color:"var(--ink)", lineHeight:1.5, marginBottom:8 }}>{draft.answer}</div>}
                    {draft.html && <div className="scroll md" style={{ maxHeight:280, overflow:"auto", fontSize:12.5, lineHeight:1.5, background:"var(--bg)", padding:"10px 13px", borderRadius:8, boxShadow:"var(--neo-in)" }} dangerouslySetInnerHTML={{ __html: draft.html }} />}
                  </div>
                )}
              </SoftCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Content Opportunities screen ---------------- */
/* The content-planning brain: keyword clusters from ranking + competitors +
   trends, gap-checked vs the sitemap, pushed to Airtable for content creation. */
function OpportunitiesScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [data,setData] = useState(null);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState(null);
  const [filter,setFilter] = useState("all");
  const [openId,setOpenId] = useState(null);
  const [pushing,setPushing] = useState("");
  const [trend,setTrend] = useState(null);
  const [trendBusy,setTrendBusy] = useState(false);
  const [ideaState,setIdeaState] = useState({});  // idea index -> { ignored?, pushed?, pushing?, edit?:{title,angle} }
  const [briefs,setBriefs] = useState({});   // clusterIndex → {brief, sources}
  const [briefBusy,setBriefBusy] = useState(-1);
  const [paaSeed,setPaaSeed] = useState("");
  const [paa,setPaa] = useState(null);
  const [paaBusy,setPaaBusy] = useState(false);
  const [paaSel,setPaaSel] = useState(()=>new Set());   // questions ticked for a selective push
  // Target country — same per-site market as the keyword data (semrush_db). Switching it
  // here re-points opportunities, trends & briefs at that country (mirrors Content Intel).
  const [dbVal,setDbVal] = useState(s.semrush_db||"uk");
  const [dbList,setDbList] = useState(null);
  useEffect(()=>{ setData(null); setErr(null); setTrend(null); setBriefs({}); setDbVal(s.semrush_db||"uk"); setPaa(null); setPaaSeed(""); },[s.id]);
  useEffect(()=>{ if(live&&!dbList) API.siteDatabase(s.id).then(r=>{ if(r&&r.countries) setDbList(r.countries); }).catch(()=>{}); },[live]);
  const changeCountry = (db)=>{
    if(!db||db===dbVal) return;
    setDbVal(db); s.semrush_db=db;
    var site=window.SITES.find(x=>x.id===s.id); if(site) site.semrush_db=db;
    setData(null); setTrend(null); setBriefs({});   // stale to the old market
    if(live) API.siteDatabase(s.id, db).then(()=>ctx.toast("Target country set to "+db.toUpperCase()+" — re-run to refresh for this market","teal")).catch(()=>{});
  };
  const cName = ((dbList||[]).find(c=>c.db===dbVal)||{}).label || dbVal.toUpperCase();

  // Run as a BACKGROUND job and poll — the analysis (GSC + DataForSEO + Claude clustering)
  // routinely outlives the request cap, which used to surface as "took too long and timed out".
  const load = ()=>{
    setBusy(true); setErr(null);
    let stopped=false, tries=0;
    const poll=()=>{
      if(stopped) return;
      API.contentOpportunitiesStatus(s.id).then(r=>{
        if(stopped) return;
        if(r.status==="running"){ if(++tries>150){ setErr("Still running after several minutes — try again."); setBusy(false); return; } setTimeout(poll,3000); return; }
        if(r.status==="error"||r.error){ setErr(r.error||"Analysis failed"); setBusy(false); return; }
        if(r.status==="unknown"){ setErr("The run was lost (server restart) — press Find opportunities again."); setBusy(false); return; }
        setData(r); setBusy(false);
      }).catch(e=>{ if(!stopped){ setErr(e.message); setBusy(false); } });
    };
    API.contentOpportunitiesStart(s.id,{db:dbVal}).then(r=>{
      if(r&&r.error){ setErr(r.error); setBusy(false); return; }
      setTimeout(poll,2500);
    }).catch(e=>{ setErr(e.message); setBusy(false); });
    return ()=>{ stopped=true; };
  };
  // RESUME on mount: the analysis runs SERVER-side, so navigating away no longer throws it
  // away. Coming back re-attaches — showing the finished result, or resuming the progress
  // spinner if it's still going. (The server keeps a completed run for 15 minutes.)
  useEffect(()=>{
    if(!live||!s.id) return;
    let stopped=false;
    const attach=()=>{
      if(stopped) return;
      API.contentOpportunitiesStatus(s.id).then(r=>{
        if(stopped||!r) return;
        if(r.status==="running"){ setBusy(true); setTimeout(attach,3000); return; }
        if(r.status==="done"){ setData(r); setBusy(false); return; }
        if(r.status==="error"){ setErr(r.error||"Analysis failed"); setBusy(false); return; }
        // "unknown" → nothing in flight; leave the screen as-is (idle).
      }).catch(()=>{});
    };
    attach();
    return ()=>{ stopped=true; };
  },[s.id]);   // eslint-disable-line
  const loadTrending = ()=>{ setTrendBusy(true); API.trendingIntel(s.id, undefined, dbVal).then(r=>setTrend(r)).catch(e=>setTrend({error:e.message})).finally(()=>setTrendBusy(false)); };
  // ITEM 4: one-click — push the trending topics straight into the Airtable keyword
  // column so the n8n writer turns each into an article. No cluster step needed.
  const pushTrending = ()=>{
    const kws=[...new Set(((trend&&trend.topics)||[]).map(t=>(t.keyword||t.title||"").trim()).filter(Boolean))];
    if(!kws.length){ ctx.toast("No trending topics to push — scan trends first","gold"); return; }
    setPushing("trend"); ctx.toast("Pushing "+kws.length+" trending topic(s) to Airtable…","teal");
    API.airtablePushKeywords(s.id, kws).then(r=>{ if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      ctx.toast(r.pushed>0?("Pushed "+r.pushed+" trending topic(s) → Airtable ✓"+(r.skipped?" ("+r.skipped+" already there)":"")):"All trending topics already in Airtable", r.pushed>0?"teal":"gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushing(""));
  };
  // Per-topic actions on the structured trending ideas: Push (→ Article Writer brief row), Amend (edit), Ignore.
  const setIdea = (i,patch)=>setIdeaState(st=>({ ...st, [i]:{ ...(st[i]||{}), ...patch } }));
  const ideaPlan = (idea)=> (idea.whyNow?idea.whyNow:"") + (idea.angle?((idea.whyNow?"\n\n":"")+idea.angle):"");
  const pushIdea = (idea,i)=>{
    const ed=(ideaState[i]||{}).edit;
    const title=(ed&&ed.title)||idea.title;
    const angle=(ed&&ed.angle)||ideaPlan(idea);
    setIdea(i,{ pushing:true });
    API.airtableSync(s.id,{ kinds:["article_brief"], cluster:{ suggestedTitle:title, primaryKeyword:idea.keyword||title }, brief:{ title, angle } }).then(r=>{
      const res=(r.synced&&r.synced.article_brief)||{};
      if(r.error||res.error){ ctx.toast("Push: "+(r.error||res.error),"clay"); setIdea(i,{ pushing:false }); return; }
      setIdea(i,{ pushing:false, pushed:true, edit:null });
      ctx.toast("Pushed “"+title.slice(0,38)+"” → Article Writer ✓ — set Status to “Write Article” to generate","teal");
    }).catch(e=>{ ctx.toast(e.message,"clay"); setIdea(i,{ pushing:false }); });
  };
  const startAmend = (idea,i)=>setIdea(i,{ edit:{ title:idea.title, angle:ideaPlan(idea) } });
  // ITEM 1: People Also Ask — pull real Google PAA questions for a seed keyword (in the
  // site's market via DataForSEO SERP), then push them to Airtable as content briefs.
  // Seed is OPTIONAL — with the box empty the server derives seeds from THIS site
  // (its top ranking keywords, else its saved site context) and returns seedsUsed.
  const findPaa = ()=>{
    const seed=(paaSeed||"").trim();
    setPaaBusy(true); setPaa(null);
    if(!seed) ctx.toast("Using your site's own topics…","teal");
    API.peopleAlsoAsk(s.id, seed||undefined).then(r=>{ if(r.error){ ctx.toast("People Also Ask: "+r.error,"clay"); setPaa({error:r.error}); return; } setPaa(r); if(r.autoSeeded&&(r.seedsUsed||[]).length) ctx.toast("Questions for: "+r.seedsUsed.join(", "),"teal"); }).catch(e=>{ ctx.toast(e.message,"clay"); setPaa({error:e.message}); }).finally(()=>setPaaBusy(false));
  };
  const pushPaa = ()=>{
    // Ticked questions only, when any are ticked; otherwise everything (incl. related terms).
    const all=[...(((paa&&paa.questions)||[]).map(q=>q.question)), ...((paa&&paa.related)||[])];
    const kws=[...new Set((paaSel.size?all.filter(k=>paaSel.has(k)):all).map(k=>(k||"").trim()).filter(Boolean))];
    if(!kws.length){ ctx.toast("No questions to push — find questions first","gold"); return; }
    setPushing("paa"); ctx.toast("Pushing "+kws.length+" question(s) to Airtable…","teal");
    API.airtablePushKeywords(s.id, kws).then(r=>{ if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      ctx.toast(r.pushed>0?("Pushed "+r.pushed+" question(s) → Airtable ✓"+(r.skipped?" ("+r.skipped+" already there)":"")):"All questions already in Airtable", r.pushed>0?"teal":"gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushing(""));
  };
  // "Push to writer": re-run PAA with push:true → each question becomes an Article Writer brief
  // (carries pattern→intent, snippetFormat→format). Toasts the synced count from the airtable result.
  // Push the TICKED questions (or all, if none ticked) into the master Article Writer as
  // briefs — one article answers each. Pushes exactly what's on screen rather than re-running
  // the lookup, so the selection is honoured and the seed box no longer has to be filled.
  const pushPaaToWriter = ()=>{
    const qs=((paa&&paa.questions)||[]);
    const chosen = paaSel.size ? qs.filter(q=>paaSel.has(q.question)) : qs;
    if(!chosen.length){ ctx.toast("Find questions first","gold"); return; }
    const fallbackSeed=(paaSeed||"").trim() || (((paa&&paa.seedsUsed)||[])[0]||"");
    setPushing("paa-writer"); ctx.toast("Sending "+chosen.length+" question(s) to the Article Writer…","teal");
    // answer = Google's own PAA snippet → becomes the row's Description (real context for the writer)
    const clusters = chosen.map(q=>({ suggestedTitle:q.question, primaryKeyword:q.seed||fallbackSeed, keyword:q.seed||fallbackSeed, label:q.question, intent:q.pattern, format:q.snippetFormat, answer:q.answer }));
    API.airtableSync(s.id,{ kinds:["opportunities"], clusters }).then(r=>{
      if(r&&r.error){ ctx.toast("Push to writer: "+r.error,"clay"); return; }
      const o=(r&&r.synced&&r.synced.opportunities)||{};
      const n=(o.pushed||0)+(o.updated||0);
      ctx.toast(n>0?("Pushed "+n+" question(s) → Article Writer ✓ — set Status to “Write Article” to generate"+(o.skipped?(" ("+o.skipped+" already there)"):"")):"All selected questions are already in the writer", n>0?"teal":"gold");
      if(n>0&&paaSel.size) setPaaSel(new Set());
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushing(""));
  };
  const genBrief = async (c,i)=>{
    setBriefBusy(i);
    const kw=c.primaryKeyword||c.suggestedTitle;
    try{
      // Background job (start → poll): a brief does SERP research + Claude and can exceed
      // the 95s request cap, which used to 504 the synchronous call.
      const st=await API.contentBriefStart(s.id, kw, c.intent);
      if(st&&st.error){ ctx.toast("Brief: "+st.error,"clay"); return; }
      for(let n=0;n<80;n++){ // ~10 min ceiling
        await new Promise(r=>setTimeout(r,4000));
        const r=await API.contentBriefStatus(s.id);
        if(!r) continue;
        if(r.status==="running") continue;
        if(r.status==="error"){ ctx.toast("Brief: "+(r.error||"failed"),"clay"); return; }
        if(r.status==="unknown"){ ctx.toast("Brief run was lost — try again.","gold"); return; }
        setBriefs(b=>({...b,[i]:{brief:r.brief,sources:r.sources||[]}})); return; // done
      }
      ctx.toast("Brief is taking unusually long — try again.","gold");
    }catch(e){ ctx.toast("Brief: "+e.message,"clay"); }
    finally{ setBriefBusy(-1); }
  };
  const withBriefs = (clusters)=> clusters.map((c)=>{ const idx=(data&&data.clusters||[]).indexOf(c); const b=briefs[idx]; return b?{...c,brief:b.brief,briefSources:b.sources}:c; });
  const pushAirtable = (clusters,tag)=>{
    if(!clusters.length){ ctx.toast("Nothing to send","gold"); return; }
    setPushing(tag);
    API.airtableSync(s.id,{kinds:["opportunities"],clusters:withBriefs(clusters)}).then(r=>{
      if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      const res=(r.synced&&r.synced.opportunities)||{};
      if(res.error){ ctx.toast("Airtable: "+res.error,"clay"); return; }
      const n=res.pushed||0, u=res.updated||0;
      const parts=[]; if(n)parts.push(n+" added"); if(u)parts.push(u+" updated");
      ctx.toast((parts.join(", ")||"0 rows")+" → "+(res.table||"Article Writer")+" — set Status to “Write Article” to generate","teal");
    }).catch(e=>ctx.toast("Airtable: "+e.message,"clay")).finally(()=>setPushing(""));
  };
  // Push a generated brief into the EXISTING Article Writer table (the one n8n flow),
  // so generation runs with the full plan as context. We don't trigger it — the user
  // flips Status to "Write Article" in the grid (the existing trigger) when ready.
  const pushBriefToWriter = (c,i)=>{
    const b = briefs[i];
    if(!b || !b.brief){ ctx.toast("Generate the brief first","gold"); return; }
    setPushing("writer"+i);
    API.airtableSync(s.id,{kinds:["article_brief"], cluster:c, brief:b.brief}).then(r=>{
      if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      const res = r.synced && r.synced.article_brief;
      if(res && res.error){ ctx.toast("Article Writer: "+res.error,"clay"); return; }
      ctx.toast("Brief → Article Writer ✓ — set Status to “Write Article” in Airtable to generate","teal");
    }).catch(e=>ctx.toast("Airtable: "+e.message,"clay")).finally(()=>setPushing(""));
  };

  const clusters = (data&&data.clusters||[]).filter(c=> filter==="all" || (filter==="gap"&&c.isGap) || (filter==="trending"&&c.trending) || (filter==="competitor"&&c.fromCompetitor));
  const FILTERS=[["all","All"],["gap","Gaps"],["trending","Trending"],["competitor","From competitors"]];
  const intentTone={informational:"teal",commercial:"gold",transactional:"plum",navigational:"gray"};

  return (
    <div className="rise">
      <PageHead title="Content Opportunities" sub="Keyword clusters from your rankings, competitors & live trends (in your target market) — gap-checked against your sitemap.">
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <CountrySelect value={dbVal} options={dbList} onChange={changeCountry} title="Target country for opportunities, trends & briefs — sets this site's market" />
          {data && <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>pushAirtable(clusters.filter(c=>c.isGap),"gaps")} disabled={pushing==="gaps"}>{pushing==="gaps"&&<Icon name="cog" size={14} className="audit-spin" />}Send gaps → Airtable</NeoButton>}
          <NeoButton kind="primary" size="sm" icon={busy?undefined:"sparkles"} disabled={busy} onClick={load}>{busy&&<Icon name="cog" size={15} className="audit-spin" />}{busy?"Analyzing…":data?"Re-analyze":"Find opportunities"}</NeoButton>
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to plan content.</div></SoftCard>}

      {/* Live UK trending intelligence (Perplexity + Tavily) */}
      {live && (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub={`What's trending in your niche in ${cName} right now — grounded & sourced`} right={
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <NeoButton kind="soft" size="sm" icon={trendBusy?undefined:"trend"} disabled={trendBusy} onClick={loadTrending}>{trendBusy&&<Icon name="cog" size={14} className="audit-spin" />}{trendBusy?"Scanning…":trend?"Refresh":"What's trending?"}</NeoButton>
            </div>
          }>{`Trending now (${cName})`}</SectionHead>
          {trend && trend.error && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"4px 2px" }}>{trend.error}</div>}
          {trend && !trend.error && (
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {(trend.ideas||[]).length>0 ? (<>
                <div style={{ fontSize:11.5, color:"var(--muted)" }}>Proposed articles for your niche this week — <b>Push</b> each to the Article Writer (Title + content plan), <b>Amend</b> it first, or <b>Ignore</b> it.</div>
                {(trend.ideas||[]).map((idea,i)=>{ const st=ideaState[i]||{}; if(st.ignored) return null; const ed=st.edit; return (
                  <div key={i} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", opacity:st.pushed?0.72:1 }}>
                    {ed ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                        <input value={ed.title} onChange={e=>setIdea(i,{ edit:{ ...ed, title:e.target.value } })} placeholder="Article title" style={{ fontSize:13.5, fontWeight:700, padding:"7px 10px", borderRadius:8, border:"none", background:"var(--surface)", boxShadow:"var(--neo-in)", color:"var(--ink)", outline:"none" }} />
                        <textarea value={ed.angle} onChange={e=>setIdea(i,{ edit:{ ...ed, angle:e.target.value } })} rows={4} placeholder="Content plan / angle" style={{ fontSize:12.5, lineHeight:1.5, padding:"8px 10px", borderRadius:8, border:"none", background:"var(--surface)", boxShadow:"var(--neo-in)", color:"var(--ink)", outline:"none", resize:"vertical", fontFamily:"inherit" }} />
                        <div style={{ display:"flex", gap:7 }}>
                          <NeoButton kind="primary" size="sm" icon={st.pushing?undefined:"upload"} disabled={st.pushing} onClick={()=>pushIdea(idea,i)}>{st.pushing&&<Icon name="cog" size={13} className="audit-spin" />}Save &amp; push</NeoButton>
                          <NeoButton kind="ghost" size="sm" onClick={()=>setIdea(i,{ edit:null })}>Cancel</NeoButton>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13.5, fontWeight:700, color:"var(--ink)" }}>{idea.title}</div>
                          {idea.whyNow && <div style={{ fontSize:11.5, color:"var(--gold)", marginTop:3 }}><b>Why now:</b> {idea.whyNow}</div>}
                          {idea.angle && <div style={{ fontSize:12.5, color:"var(--muted)", marginTop:4, lineHeight:1.5 }}>{idea.angle}</div>}
                          {idea.keyword && <div style={{ fontSize:11, color:"var(--faint)", fontFamily:"var(--mono)", marginTop:4 }}>kw: {idea.keyword}</div>}
                        </div>
                        <span style={{ display:"inline-flex", gap:6, flexShrink:0 }}>
                          {st.pushed ? <Chip tone="teal" size="sm" icon="check">Pushed</Chip> : (<>
                            <NeoButton kind="primary" size="sm" icon={st.pushing?undefined:"upload"} disabled={st.pushing} onClick={()=>pushIdea(idea,i)}>{st.pushing&&<Icon name="cog" size={13} className="audit-spin" />}Push</NeoButton>
                            <NeoButton kind="soft" size="sm" icon="doc" onClick={()=>startAmend(idea,i)}>Amend</NeoButton>
                            <NeoButton kind="ghost" size="sm" onClick={()=>setIdea(i,{ ignored:true })}>Ignore</NeoButton>
                          </>)}
                        </span>
                      </div>
                    )}
                  </div>
                ); })}
              </>) : (
                trend.summary && <div className="md" style={{ fontSize:13, lineHeight:1.55 }} dangerouslySetInnerHTML={{ __html:(window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(trend.summary))||trend.summary }} />
              )}
              {(trend.sources||[]).length>0 && <div style={{ fontSize:11, color:"var(--faint)" }}>Sources: {(trend.sources||[]).slice(0,5).map((s,i)=>(<a key={i} href={s.url} target="_blank" style={{ color:"var(--t-600)", marginRight:8 }}>{s.domain||(i+1)}</a>))}</div>}
            </div>
          )}
          {!trend && !trendBusy && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"2px" }}>{`Surface this week's trending topics in ${cName} in your niche, with sources — fresh content ideas grounded in the live web.`}</div>}
        </SoftCard>
      )}

      {/* ITEM 1: People Also Ask — real Google questions for a seed keyword → push to Airtable */}
      {live && (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub={`Real Google "People Also Ask" questions in ${cName} for any seed keyword — push them as content briefs (one article answers each).`} right={
            (paa && !paa.error && (paa.questions||[]).length>0) ? (
              <span style={{ display:"inline-flex", gap:8, alignItems:"center" }}>
                {(()=>{ const qs=(paa.questions||[]).map(q=>q.question); const allOn=qs.length>0&&qs.every(q=>paaSel.has(q));
                  return <NeoButton kind="ghost" size="sm" onClick={()=>setPaaSel(allOn?new Set():new Set(qs))} title={allOn?"Clear selection":"Select every question"}>{allOn?"Clear all":"Select all"}</NeoButton>; })()}
                <NeoButton kind="soft" size="sm" icon={pushing==="paa"?undefined:"upload"} disabled={!!pushing} onClick={pushPaa} title={paaSel.size?("Push the "+paaSel.size+" ticked question(s) to Airtable"):"Push every question to Airtable"}>{pushing==="paa"&&<Icon name="cog" size={14} className="audit-spin" />}Push{paaSel.size?(" "+paaSel.size):""} → Airtable</NeoButton>
                <NeoButton kind="primary" size="sm" icon={pushing==="paa-writer"?undefined:"doc"} disabled={!!pushing} onClick={pushPaaToWriter} title={paaSel.size?("Send the "+paaSel.size+" ticked question(s) to the Article Writer as briefs"):"Send each question to the Article Writer as a brief"}>{pushing==="paa-writer"&&<Icon name="cog" size={14} className="audit-spin" />}Push{paaSel.size?(" "+paaSel.size):""} to writer</NeoButton>
              </span>
            ) : null
          }>People Also Ask</SectionHead>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:(paa&&!paa.error&&(paa.questions||[]).length)?14:0 }}>
            <input value={paaSeed} onChange={e=>setPaaSeed(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")findPaa();}} placeholder="Optional — leave empty to use your site's own topics" style={{ flex:1, minWidth:220, padding:"10px 14px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none" }} />
            <NeoButton kind="primary" size="sm" icon={paaBusy?undefined:"search"} disabled={paaBusy} onClick={findPaa}>{paaBusy&&<Icon name="cog" size={14} className="audit-spin" />}{paaBusy?"Finding…":"Find questions"}</NeoButton>
          </div>
          {paa && paa.error && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"4px 2px" }}>{paa.error}</div>}
          {paa && !paa.error && (paa.questions||[]).length>0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {(paa.questions||[]).map((q,i)=>{ const on=paaSel.has(q.question); return (
                <div key={i} onClick={()=>setPaaSel(p=>{ const n=new Set(p); if(n.has(q.question)) n.delete(q.question); else n.add(q.question); return n; })}
                     title={on?"Ticked — click to unselect":"Click to tick this question for push"}
                     style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:on?"var(--t-50)":"var(--bg)", boxShadow:on?"inset 0 0 0 1.5px var(--t-500)":"var(--neo-in)", cursor:"pointer", transition:"background .12s ease" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)", display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span style={{ width:17, height:17, flexShrink:0, marginTop:1, borderRadius:5, display:"grid", placeItems:"center", background:on?"var(--t-500)":"var(--bg-2)", boxShadow:on?"none":"var(--neo-in)", color:"#fff", fontSize:11, fontWeight:900 }}>{on?"✓":""}</span>
                    <span style={{ flex:1 }}>{q.question}</span>{q.pattern && <Chip tone="plum" size="sm">{q.pattern}</Chip>}{q.snippetFormat && <Chip tone="teal" size="sm">{q.snippetFormat}</Chip>}</div>
                  {q.answer && <div style={{ fontSize:12, color:"var(--muted)", marginTop:4, lineHeight:1.5, paddingLeft:25 }}>{q.answer}{q.domain && <a href={q.url} target="_blank" onClick={e=>e.stopPropagation()} style={{ color:"var(--t-600)", marginLeft:6 }}>— {q.domain}</a>}</div>}
                </div>
              ); })}
              {(paa.related||[]).length>0 && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>Related searches: {(paa.related||[]).slice(0,10).join(" · ")}</div>}
            </div>
          )}
          {paa && !paa.error && (paa.questions||[]).length===0 && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"4px 2px" }}>No People Also Ask box for that keyword — try a broader seed.</div>}
          {!paa && !paaBusy && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"2px" }}>{`Just click Find questions — we use your site's own top topics. Add a keyword only to steer it somewhere specific. Live Google "People Also Ask" for ${cName}.`}</div>}
          {paa && paa.autoSeeded && (paa.seedsUsed||[]).length>0 && <div style={{ fontSize:12, color:"var(--muted)", padding:"2px 2px 6px" }}>From your site's topics: {(paa.seedsUsed||[]).map((sd,i)=>(<span key={i}>{i>0?", ":""}<b style={{ color:"var(--t-700)" }}>{sd}</b></span>))}</div>}
        </SoftCard>
      )}
      {live && err && <div style={{ marginBottom:16 }}><ErrBanner msg={err} onRetry={load} /></div>}
      {live && busy && !data && <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Gathering keywords (ranking + competitors + trends) and clustering…</div></SoftCard>}

      {live && data && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            <PatternCard icon="sparkles" tone="teal" value={data.clusterCount} title="Topic clusters" sub={data.totalKeywords+" keywords pooled"} />
            <PatternCard icon="flag" tone="clay" value={data.gapCount} title="Content gaps" sub="no page covers these yet" />
            <PatternCard icon="trend" tone="gold" value={data.trendingCount} title="Trending" sub="rising search demand" />
            <PatternCard icon="layers" tone="plum" value={(data.sources&&data.sources.competitorGap)||0} title="Competitor gap kws" sub="they rank, you don't" />
          </div>

          <SoftCard hover={false}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)" }}>
                {FILTERS.map(([v,l])=>(<button key={v} onClick={()=>setFilter(v)} style={{ padding:"7px 13px", fontSize:12.5, fontWeight:700, borderRadius:99, background:filter===v?"var(--surface)":"transparent", color:filter===v?"var(--t-700)":"var(--muted)", boxShadow:filter===v?"var(--neo-sm)":"none" }}>{l}</button>))}
              </div>
              <span style={{ fontSize:12.5, color:"var(--muted)" }}>{clusters.length} shown</span>
              <NeoButton kind="soft" size="sm" icon="layers" style={{ marginLeft:"auto" }} disabled={pushing==="shown"} onClick={()=>pushAirtable(clusters,"shown")}>{pushing==="shown"&&<Icon name="cog" size={14} className="audit-spin" />}Send {clusters.length} → Airtable</NeoButton>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {clusters.map((c,i)=>{
                const open=openId===i;
                return (
                <div key={i} style={{ borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", overflow:"hidden" }}>
                  <div className="row-link" onClick={()=>setOpenId(open?null:i)} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px" }}>
                    <div style={{ width:38, height:38, borderRadius:11, display:"grid", placeItems:"center", flexShrink:0, background:c.isGap?"var(--clay-bg)":"var(--t-50)", color:c.isGap?"var(--clay)":"var(--t-700)", fontWeight:800, fontSize:13 }}>{Math.round(c.score)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.suggestedTitle}</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontFamily:"var(--mono)" }}>{(c.totalVolume||0).toLocaleString()} vol</span>·<span>{c.keywordCount} kws</span>·<span style={{ textTransform:"capitalize" }}>{c.format}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                      <Chip tone={intentTone[c.intent]||"gray"} size="sm">{c.intent}</Chip>
                      {c.isGap && <Chip tone="clay" size="sm" icon="flag">gap</Chip>}
                      {c.trending && <Chip tone="gold" size="sm" icon="trend">+{c.avgTrend}%</Chip>}
                      {c.fromCompetitor && <Chip tone="plum" size="sm">comp</Chip>}
                    </div>
                    <Icon name="chevD" size={17} style={{ color:"var(--faint)", transform:open?"rotate(180deg)":"none", transition:"transform .2s", flexShrink:0 }} />
                  </div>
                  {open && (
                    <div className="rise" style={{ padding:"0 15px 14px" }}>
                      {!c.isGap && c.coveringUrl && <div style={{ fontSize:12, color:"var(--muted)", marginBottom:8 }}>Covered by <a href={c.coveringUrl} target="_blank" style={{ color:"var(--t-700)", fontFamily:"var(--mono)" }}>{(c.coveringUrl||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</a> — consider expanding/refreshing it.</div>}
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
                        {(c.keywords||[]).map((k,j)=>(
                          <span key={j} style={{ fontSize:11.5, padding:"4px 9px", borderRadius:99, background:"var(--surface)", boxShadow:"var(--neo-xs)", display:"flex", gap:6, alignItems:"center" }}>
                            {k.keyword} <b style={{ color:"var(--muted)" }}>{(k.volume||0).toLocaleString()}</b>{k.position!=null&&<span style={{ color:"var(--t-600)", fontWeight:700 }}>#{Math.round(k.position)}</span>}
                          </span>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <NeoButton kind="primary" size="sm" icon={briefBusy===i?undefined:"sparkles"} disabled={briefBusy===i} onClick={()=>genBrief(c,i)}>{briefBusy===i&&<Icon name="cog" size={14} className="audit-spin" />}{briefBusy===i?"Researching…":briefs[i]?"Regenerate brief":`Generate brief (${cName})`}</NeoButton>
                        <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>pushAirtable([c],"one"+i)} disabled={pushing==="one"+i}>{pushing==="one"+i&&<Icon name="cog" size={14} className="audit-spin" />}Send to Airtable</NeoButton>
                        {briefs[i] && briefs[i].brief && !briefs[i].brief.error && <NeoButton kind="soft" size="sm" icon="upload" onClick={()=>pushBriefToWriter(c,i)} disabled={pushing==="writer"+i}>{pushing==="writer"+i&&<Icon name="cog" size={14} className="audit-spin" />}Send brief → Article Writer</NeoButton>}
                      </div>
                      {briefs[i] && (()=>{ const b=briefs[i].brief||{}; return (
                        <div style={{ marginTop:12, padding:"14px 16px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                          {b.error ? <div style={{ fontSize:12.5, color:"var(--muted)" }}>⚠️ {b.error}</div> : <>
                            <div style={{ fontSize:13.5, fontWeight:800 }}>{b.title}</div>
                            {b.angle && <div style={{ fontSize:12, color:"var(--muted)", marginTop:3, fontStyle:"italic" }}>{b.angle}</div>}
                            {b.metaDescription && <div style={{ fontSize:12, color:"var(--t-800)", marginTop:6 }}><b>Meta:</b> {b.metaDescription}</div>}
                            {Array.isArray(b.outline) && <div style={{ marginTop:10 }}><div style={{ fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em", color:"var(--faint)", marginBottom:5 }}>Outline</div>{b.outline.map((o,j)=>(<div key={j} style={{ marginBottom:6 }}><div style={{ fontSize:12.5, fontWeight:700 }}>{o.h2}</div>{(o.points||[]).map((p,k)=>(<div key={k} style={{ fontSize:12, color:"var(--muted)", paddingLeft:12 }}>• {p}</div>))}</div>))}</div>}
                            {Array.isArray(b.keyFacts) && b.keyFacts.length>0 && <div style={{ marginTop:10 }}><div style={{ fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em", color:"var(--faint)", marginBottom:5 }}>Key facts (cited)</div>{b.keyFacts.map((f,j)=>(<div key={j} style={{ fontSize:12, color:"var(--ink-2)", marginBottom:3 }}>• {f.fact} <sup style={{ color:"var(--t-600)" }}>[{f.source}]</sup></div>))}</div>}
                            {Array.isArray(b.faqs) && b.faqs.length>0 && <div style={{ marginTop:10 }}><div style={{ fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em", color:"var(--faint)", marginBottom:5 }}>FAQ</div>{b.faqs.map((f,j)=>(<div key={j} style={{ marginBottom:5 }}><div style={{ fontSize:12, fontWeight:700 }}>{f.q}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{f.a}</div></div>))}</div>}
                            {(briefs[i].sources||[]).length>0 && <div style={{ fontSize:11, color:"var(--faint)", marginTop:10 }}>Sources: {(briefs[i].sources||[]).slice(0,6).map((src,j)=>(<a key={j} href={src.url} target="_blank" style={{ color:"var(--t-600)", marginRight:7 }}>[{j+1}] {src.domain}</a>))}</div>}
                          </>}
                        </div>
                      ); })()}
                    </div>
                  )}
                </div>
                );
              })}
              {clusters.length===0 && <div style={{ padding:"14px", fontSize:13, color:"var(--muted)" }}>No clusters match this filter.</div>}
            </div>
            <div style={{ fontSize:11, color:"var(--faint)", marginTop:12, lineHeight:1.5 }}>Sources: {Object.entries(data.sources||{}).filter(([k,v])=>typeof v==="number").map(([k,v])=>`${k} ${v}`).join(" · ")||"—"}. Priority = volume × gap × trend × competitor signal. Claude clusters & labels; all metrics computed from real data.</div>
          </SoftCard>
        </div>
      )}
      {live && !data && !busy && !err && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"30px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name="sparkles" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>Plan your next content</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:440 }}>Pulls keywords from your Search Console rankings, DataForSEO competitor gaps, and trending demand — clusters them into topics, flags the ones with no page yet, and lets you push them straight to Airtable.</div>
            <NeoButton kind="primary" icon="sparkles" onClick={load}>Find opportunities</NeoButton>
          </div>
        </SoftCard>
      )}
    </div>
  );
}

/* ---------------- On-Page Fixes screen ---------------- */
/* Closes the brief's generative gaps: internal links, per-page + legal schema,
   AI-SEO fact extraction, and real CSS fixes — each routed for human review. */
function OptimizeScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [tab,setTab] = useState("links");
  useEffect(()=>{ if(ctx.navTab && ["links","ext","schema","facts","css","images","speed"].includes(ctx.navTab)) setTab(ctx.navTab); },[ctx.navTab]);
  const [busy,setBusy] = useState("");
  const [err,setErr] = useState(null);
  const [links,setLinks] = useState(null);
  const [ext,setExt] = useState(null);
  const [applied,setApplied] = useState({});   // linkKey -> { busy, status, reason }
  const [batchBusy,setBatchBusy] = useState(false);  // true while "Approve & push all" is mid-run (prevents double-fire bursts)
  const [schema,setSchema] = useState(null);
  const [facts,setFacts] = useState(null);
  const [css,setCss] = useState(null);
  const [pageUrl,setPageUrl] = useState("");
  const [pageType,setPageType] = useState("page");
  const [media,setMedia] = useState(null);
  const [speed,setSpeed] = useState(null);
  const [speedStrat,setSpeedStrat] = useState("mobile");
  const [plug,setPlug] = useState(null);   // optimize-plugin status for THIS site
  const [health,setHealth] = useState(null); // what actually renders the LIVE site
  const builder = (s.stack && s.stack.builder) || "";
  const isBuilder = /elementor|beaver|divi|bricks|wpbakery/i.test(builder);
  const connBroken = plug && plug.reachable===false;
  const pluginOutdated = plug && plug.installed && plug.version && /^1\.[0-3]\./.test(String(plug.version));
  const pluginNotInstalled = isBuilder && plug && plug.installed===false && !connBroken;
  // CRITICAL: the live domain is served by another CMS (Drupal/Wix) or parked, so
  // WordPress edits won't appear on it. This supersedes the plugin banner. Only a
  // POSITIVE non-WordPress verdict triggers it (Unknown/Blocked never do).
  const cmsMismatch = health && health.nonWordPress===true;
  const pluginIssue = !cmsMismatch && (connBroken || pluginNotInstalled || pluginOutdated);
  useEffect(()=>{ setLinks(null); setExt(null); setApplied({}); setSchema(null); setFacts(null); setCss(null); setMedia(null); setSpeed(null); setErr(null); setPlug(null); setHealth(null); setPageUrl((s._rawUrl||s.url||"").replace(/\/$/,"")+"/"); },[s.id]);
  useEffect(()=>{ if(live) API.optimizeStatus(s.id).then(r=>setPlug(r||{})).catch(()=>{}); },[s.id]);
  useEffect(()=>{ if(live) API.siteHealth(s.id).then(r=>setHealth(r||{})).catch(()=>{}); },[s.id]);
  const copy = (t)=>{ try{ navigator.clipboard.writeText(t); ctx.toast("Copied to clipboard","teal"); }catch(e){ ctx.toast("Copy failed","gold"); } };
  // Apply schema/CSS straight to the live site (needs the seo-agent-optimize mu-plugin).
  const applySchemaLive = ()=>{ if(!schema){return;} setBusy("applySchema"); API.applySchema(s.id,{ url:pageUrl, jsonld:schema.json }).then(r=>{ if(r.status==="blocked"){ctx.toast(r.reason||"Site is read-only — arm writes on Admin first.","gold");return;} if(r.error){ctx.toast("Schema: "+r.error,"clay");return;} if(r.rendered===false){ctx.toast(r.warning||"Schema stored, but no JSON-LD block was found rendering on the page.","gold");return;} ctx.toast("Schema applied to the live page ✓","teal"); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy("")); };
  const applyCssLive = ()=>{ if(!css){return;} setBusy("applyCss"); API.applyCss(s.id, css.css).then(r=>{ if(r.status==="blocked"){ctx.toast(r.reason||"Site is read-only — arm writes on Admin first.","gold");return;} if(r.error){ctx.toast("CSS: "+r.error,"clay");return;} ctx.toast("CSS applied to the live site ✓","teal"); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy("")); };

  const findLinks = ()=>{ const sid=s.id; setBusy("links"); setErr(null); API.internalLinks(sid,{maxSources:8}).then(r=>{ if(r.error){setErr(r.error);return;} setLinks(Object.assign({_siteId:sid},r)); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genExt = ()=>{ if(!pageUrl){ctx.toast("Enter a page URL","gold");return;} const sid=s.id; setBusy("ext"); setErr(null); API.externalLinks(sid,pageUrl).then(r=>{ if(r.error){setErr(r.error);return;} setExt(Object.assign({_siteId:sid},r)); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  // Approve & push a single link (internal or external) into the live page.
  const linkKey = (l)=> (l.sourcePage||"")+"|"+l.anchor+"|"+l.targetUrl;
  const hostOf = (u)=>{ try{ return new URL(u).host.replace(/^www\./,""); }catch(e){ return ""; } };
  const applyOne = (l)=> new Promise((res)=>{
    const k=linkKey(l);
    // Guard: never apply a suggestion whose page isn't on the active site.
    const siteHost=hostOf(s.url||s._rawUrl||""), srcHost=hostOf(l.sourcePage||"");
    if(siteHost && srcHost && siteHost!==srcHost){ const msg="That suggestion is for "+srcHost+", but you're on "+siteHost+" — re-run “Find internal links” for this site."; setApplied(a=>({...a,[k]:{status:"error",reason:msg}})); ctx.toast(msg,"clay"); return res({error:msg}); }
    setApplied(a=>({...a,[k]:{busy:true}}));
    API.applyLink(s.id, l.sourcePage, l.anchor, l.targetUrl, l.sourceId, l.sourceType).then(r=>{
      setApplied(a=>({...a,[k]:{status:r.status||(r.error?"error":"?"), reason:r.reason||r.error||r.liveWarning, notOnLive:r.notOnLive, liveCms:r.liveCms}}));
      res(r||{});
    }).catch(e=>{ setApplied(a=>({...a,[k]:{status:"error", reason:e.message}})); res({error:e.message}); });
  });
  const applyAll = (sugs)=>{
    if(!sugs||!sugs.length) return;
    if(batchBusy) return;  // already pushing a batch — ignore a second click / replayed event so we don't fire 2× the calls
    setBatchBusy(true);
    ctx.toast("Pushing "+sugs.length+" link(s) to the live site…","teal");
    (async()=>{ let ok=0,manual=0,blocked=0,notlive=0; for(const l of sugs){ const r=await applyOne(l); if(r.status==="verified"){ if(r.notOnLive)notlive++; else ok++; } else if(r.status==="manual")manual++; else if(r.status==="blocked")blocked++; }
      ctx.toast(blocked? "Site is read-only — arm writes on the Admin screen first." : notlive? ("Saved to WordPress, but your live site isn’t WordPress — "+notlive+" link(s) won’t show on it.") : (ok+" link(s) applied"+(manual?" · "+manual+" need the page-builder editor":"")), (blocked||notlive)?"clay":(ok?"teal":"gold")); })().finally(()=>setBatchBusy(false));
  };
  const linkStatus = (l)=>{
    const st=applied[linkKey(l)]; if(!st) return null;
    if(st.busy) return <span style={{ fontSize:11, color:"var(--muted)", display:"inline-flex", alignItems:"center", gap:4 }}><Icon name="cog" size={12} className="audit-spin" />Applying…</span>;
    // Honest label: saved to WP but the live site is another CMS → not actually live.
    if(st.status==="verified" && st.notOnLive) return <span title={st.reason||""} style={{ fontSize:11, fontWeight:700, color:"var(--clay)" }}>⚠ WP only — not on live {st.liveCms||""}</span>;
    const tones={verified:["✓ Applied to live","var(--t-700)"],dry:["Dry-run","var(--muted)"],"dry-run":["Dry-run","var(--muted)"],manual:["Add in editor","var(--gold)"],blocked:["Read-only","var(--clay)"],error:["Failed","var(--clay)"],"silent-failure":["Didn’t stick","var(--clay)"]};
    const t=tones[st.status]||["—","var(--muted)"];
    return <span title={st.reason||""} style={{ fontSize:11, fontWeight:700, color:t[1] }}>{t[0]}</span>;
  };
  const pathOnly = (u)=>{ try{ return new URL(u).pathname; }catch(e){ return (u||"").replace(/^https?:\/\/[^/]+/,"")||"/"; } };
  // When a row couldn't be auto-applied, show WHY + how to do it manually inline.
  const manualHint = (l)=>{
    const st=applied[linkKey(l)];
    if(!st || st.status!=="manual") return null;
    return <div style={{ marginTop:6, padding:"8px 11px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", fontSize:11.5, color:"#7E5A14", lineHeight:1.55 }}>
      <b>Why “Add in editor”:</b> {st.reason || "this anchor sits in a button, menu, or a global header/footer/template — linking it automatically could break the layout, so it’s left for you."}<br/>
      <b>Add it manually (1 min):</b> open <a href={l.sourcePage} target="_blank" rel="noopener" style={{ color:"#7E5A14", textDecoration:"underline", fontFamily:"var(--mono)" }}>{pathOnly(l.sourcePage)}</a> in your page builder, select the text “<b>{l.anchor}</b>”, and link it to <b style={{ fontFamily:"var(--mono)" }}>{pathOnly(l.targetUrl)}</b>.
    </div>;
  };
  const genSchema = ()=>{ if(!pageUrl){ctx.toast("Enter a page URL","gold");return;} setBusy("schema"); setErr(null); API.generateSchema(s.id,{url:pageUrl,type:pageType,title:""}).then(r=>{ if(r.error){setErr(r.error);return;} setSchema(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genFacts = ()=>{ if(!pageUrl){ctx.toast("Enter a page URL","gold");return;} setBusy("facts"); setErr(null); API.aiSeoFacts(s.id,pageUrl).then(r=>{ if(r.error){setErr(r.error);return;} setFacts(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genCss = ()=>{ setBusy("css"); setErr(null); API.generateCss(s.id).then(r=>{ if(r.error){setErr(r.error);return;} setCss(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const scanMedia = ()=>{ setBusy("scan"); setErr(null); API.mediaScan(s.id).then(r=>{ if(r.error){setErr(r.error);return;} setMedia(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const [optProg,setOptProg] = useState(null); // {done,total} while converting all
  // Run ONE image-optimize batch as a background job (start → poll), so a heavy
  // library that takes minutes never 504s the way the old synchronous call did.
  const runMediaBatch = async (apply, max)=>{
    const st = await API.mediaOptimizeStart(s.id,{apply,max});
    if(st && st.error) return { error: st.error };
    if(st && st.status==="blocked") return { error: st.reason||"site is read-only" };
    for(let i=0;i<160;i++){ // up to ~13 min (matches the 20-min server job cap)
      await new Promise(r=>setTimeout(r, 5000));
      const stat = await API.mediaOptimizeStatus(s.id);
      if(!stat) continue;
      if(stat.status==="running"){ if(stat.progress) setOptProg(p=>({done:(p&&p.done||0)+(stat.progress.done||0),total:(p&&p.total)||stat.progress.total||0})); continue; }
      if(stat.status==="error") return { error: stat.error||"optimization failed" };
      if(stat.status==="unknown") return { error: "The run was lost (server restart) — click again to resume." };
      return stat; // done: carries processed/uploaded/savedKB/remaining/...
    }
    return { error: "Still running after 13 min — check back shortly." };
  };
  const optimizeMedia = async (apply)=>{
    if(!apply){ // preview: single background batch
      setBusy("preview");
      try{ const r=await runMediaBatch(false,10); if(r.error){ctx.toast("Images: "+r.error,"clay");} else { ctx.toast("Preview: "+r.processed+" image(s) · ~"+r.savedKB+" KB potential saving (no write)","teal"); setMedia(m=>({...(m||{}),lastRun:r})); } }
      catch(e){ ctx.toast(e.message,"clay"); } finally{ setBusy(""); }
      return;
    }
    // apply: loop background batches until the whole backlog is converted
    setBusy("apply");
    const total=(media&&media.heavyCount)||0;
    let done=0, saved=0, relinked=0, failed=0, lastErr=null, iter=0, last=null;
    setOptProg({done:0,total});
    try{
      while(iter<30){
        iter++;
        const r=await runMediaBatch(true,10);
        if(r.error){ lastErr=r.error; break; }
        last=r;
        done+=r.uploaded||0; saved+=r.savedKB||0; relinked=Math.max(relinked,r.relinked||0); failed+=r.failed||0;
        setOptProg({done,total:total||done+(r.remaining||0)});
        if((r.remaining||0)<=0 || ((r.processed||0)===0 && (r.relinked||0)>=0)) break;
      }
      if(lastErr) ctx.toast("Images: "+lastErr,"clay");
      else if(done>0) ctx.toast("Optimized "+done+" image(s) · "+(saved/1024).toFixed(1)+" MB lighter"+(relinked?" · re-linked "+relinked+" existing":"")+(failed?" · "+failed+" failed":"")+" ✓","teal");
      else if(relinked>0) ctx.toast(relinked+" already converted — re-linked their WebP so pages serve them (needs the optimize plugin).","teal");
      else ctx.toast("Nothing to optimize"+(failed?" — "+failed+" failed: "+(((last&&last.errors)||[])[0]||"WP rejected the upload"):" — every heavy image already has WebP."),failed?"clay":"gold");
      if(last) setMedia(m=>({...(m||{}),lastRun:last}));
    }catch(e){ ctx.toast(e.message,"clay"); }
    finally{
      setOptProg(null); setBusy("");
      // refresh counts so converted images drop off the list
      try{ const sc=await API.mediaScan(s.id); if(!sc.error) setMedia(m=>({...(m||{}),...sc})); }catch(e){}
    }
  };
  const runSpeed = ()=>{ if(!pageUrl){ctx.toast("Enter a URL","gold");return;} setBusy("speed"); setErr(null); API.speedTest(pageUrl,speedStrat).then(r=>{ if(r.error){setErr(r.error);return;} setSpeed(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };

  const TABS=[["links","Internal Links","link"],["ext","External Links","globe"],["schema","Schema","layers"],["facts","AI-SEO Facts","sparkles"],["css","CSS Fixes","bolt"],["images","Images","image"],["speed","Speed Test","gauge"]];
  const urlBar = (onGo,label,key)=>(
    <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
      <input value={pageUrl} onChange={e=>setPageUrl(e.target.value)} placeholder="https://your-site.com/page/" style={{ flex:1, minWidth:240, padding:"10px 13px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
      {key==="schema" && <select value={pageType} onChange={e=>setPageType(e.target.value)} className="neo-btn" style={{ padding:"0 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontWeight:700 }}><option value="page">Page</option><option value="post">Post/Article</option></select>}
      <NeoButton kind="primary" size="sm" icon={busy===key?undefined:"sparkles"} disabled={busy===key} onClick={onGo}>{busy===key&&<Icon name="cog" size={15} className="audit-spin" />}{label}</NeoButton>
    </div>
  );

  return (
    <div className="rise">
      <PageHead title="On-Page Fixes" sub="Generate internal links, schema, AI-citation facts & CSS — every change human-reviewed." />
      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to generate on-page fixes.</div></SoftCard>}
      {live && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", width:"fit-content", marginBottom:16 }}>
            {TABS.map(([v,l,ic])=>(<button key={v} onClick={()=>setTab(v)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 15px", fontSize:12.5, fontWeight:700, borderRadius:99, background:tab===v?"var(--surface)":"transparent", color:tab===v?"var(--t-700)":"var(--muted)", boxShadow:tab===v?"var(--neo-sm)":"none" }}><Icon name={ic} size={14} />{l}</button>))}
          </div>
          {err && <div style={{ marginBottom:14 }}><ErrBanner msg={err} onRetry={()=>setErr(null)} /></div>}

          {cmsMismatch && (
            <div style={{ marginBottom:14, padding:"13px 16px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)", borderLeft:"4px solid var(--clay)" }}>
              <div style={{ fontSize:13.5, fontWeight:800, color:"#8a2d1f", marginBottom:4 }}>⛔ Your live site is {health.parked?"a parked / for-sale domain":("served by "+health.liveCms+" — not WordPress")}</div>
              <div style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.55 }}>
                {health.mismatch || ("Sentinel edits the WordPress install behind "+s.url+", but the live page is rendered by "+health.liveCms+".")} <b>On-page fixes here — internal/external links, content refresh, schema, CSS and WebP — will NOT appear on the live site.</b> {health.parked? "There’s nothing live to optimize." : "Point Sentinel at the platform that actually serves "+(s.name||s.url)+", or make these changes in "+health.liveCms+"."}
              </div>
            </div>
          )}

          {pluginIssue && ["links","ext","schema","facts","css","images"].includes(tab) && (
            <div style={{ marginBottom:14, padding:"12px 15px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)" }}>
              {connBroken ? (<>
                <div style={{ fontSize:13, fontWeight:800, color:"#7E5A14", marginBottom:4 }}>⚠ Can’t reach {s.name}’s WordPress</div>
                <div style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.5 }}>The stored credentials for <b>{s.url}</b> aren’t working, so nothing (including the plugin check) can run here. <b>Reconnect this site</b> (Sites → this site → re-enter a WordPress application password). {plug.error?<span style={{ opacity:.8 }}>· {plug.error}</span>:null}</div>
              </>) : pluginOutdated ? (<>
                <div style={{ fontSize:13, fontWeight:800, color:"#7E5A14", marginBottom:4 }}>⚠ Optimize plugin is outdated on {s.name} (v{plug.version})</div>
                <div style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.5 }}>Update to <b>v1.4.0</b> for reliable link insertion (whole-field anchors, entity handling). Replace <code>seo-agent-optimize.php</code> in <code>wp-content/mu-plugins/</code> on <b>{s.url}</b>, then reload.</div>
              </>) : (<>
                <div style={{ fontSize:13, fontWeight:800, color:"#7E5A14", marginBottom:4 }}>⚠ Optimize plugin not installed on {s.name}</div>
                <div style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.5 }}>This is a <b>{builder}</b> site, so links / schema / CSS / WebP can only be pushed live with the <b>seo-agent-optimize</b> plugin — and it isn’t installed here. Without it, every Approve says “Add in editor.” Install <b>v1.4.0</b> into <code>wp-content/mu-plugins/</code> on <b>{s.url}</b>, then reload. <i>(Per-site — installing on one doesn’t cover the others.)</i></div>
              </>)}
            </div>
          )}

          {tab==="links" && (
            <div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:13.5, fontWeight:700 }}>Internal-link suggestions</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Contextual links between your real published pages — anchor text + target, with targets validated against the live page list (no invented URLs).</div>
                </div>
                <NeoButton kind="primary" size="sm" icon={busy==="links"?undefined:"link"} disabled={busy==="links"} onClick={findLinks}>{busy==="links"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="links"?"Analyzing…":"Find internal links"}</NeoButton>
              </div>
              {links && links._siteId===s.id && (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)" }}>{links.count} suggestion(s) across {links.analyzed} page(s) · {links.corpusSize} pages in corpus</span>
                    {(links.suggestions||[]).length>0 && <NeoButton kind="soft" size="sm" icon="check" style={{ marginLeft:"auto" }} disabled={batchBusy} onClick={()=>applyAll(links.suggestions)}>{batchBusy?"Pushing…":"Approve & push all"}</NeoButton>}
                  </div>
                  {(links.suggestions||[]).map((l,i)=>(
                    <div key={i} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", fontSize:13 }}>
                        <a href={l.sourcePage} target="_blank" rel="noopener" title="Open source page in a new tab" style={{ fontFamily:"var(--mono)", color:"var(--muted)", fontSize:11.5, textDecoration:"none" }}>{(l.sourcePage||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                        <Icon name="arrowUp" size={13} style={{ transform:"rotate(90deg)", color:"var(--faint)" }} />
                        <span style={{ fontWeight:700, color:"var(--t-700)" }}>“{l.anchor}”</span>
                        <Icon name="arrowUp" size={13} style={{ transform:"rotate(90deg)", color:"var(--faint)" }} />
                        <a href={l.targetUrl} target="_blank" rel="noopener" style={{ fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", fontSize:11.5 }}>{(l.targetUrl||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                        <span style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:8 }}>
                          {linkStatus(l)}
                          <NeoButton kind="ghost" size="sm" icon="check" disabled={(applied[linkKey(l)]||{}).busy} onClick={()=>applyOne(l).then(r=>{ if(r.status==="verified")ctx.toast(r.notOnLive?(r.liveWarning||"Saved to WordPress, but won’t show on your live site."):"Link applied to live ✓",r.notOnLive?"clay":"teal"); else if(r.status==="blocked")ctx.toast("Site is read-only — arm writes on Admin first.","clay"); else if(r.status==="manual")ctx.toast(r.reason||"Add this one in your page-builder editor.","gold"); else if(r.error||r.reason)ctx.toast(r.error||r.reason,"clay"); })}>Approve</NeoButton>
                        </span>
                      </div>
                      {l.reason && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:5 }}>{l.reason}</div>}
                      {manualHint(l)}
                    </div>
                  ))}
                  {(links.suggestions||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color: links.aiError?"#7E5A14":"var(--muted)", background: links.aiError?"var(--gold-bg)":"transparent", borderRadius:"var(--r-md)" }}>{links.aiError ? (/credit|too low|balance/i.test(links.aiError) ? "⚠️ AI link suggestions are paused — your Anthropic API credit balance is too low. Top up your Anthropic credits to restore link generation." : ("⚠️ AI temporarily unavailable — "+links.aiError)) : "No strong internal-link opportunities found — pages are already well interlinked."}</div>}
                </div>
              )}
              {(!links || links._siteId!==s.id) && busy!=="links" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Analyze your pages to surface contextual internal-link opportunities (anchor → target). <b>Approve</b> pushes the link straight into the live page (Classic/Gutenberg); page-builder pages (Elementor) are flagged to add in the editor. Links open in a new tab so this stays open.</div>}
            </div>
          )}

          {tab==="ext" && (
            <div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:6, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:13.5, fontWeight:700 }}>External-link opportunities</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Authoritative outbound links (gov/official/established sources) for a page — anchors are drawn from the page text so they apply cleanly. Builds topical trust.</div>
                </div>
              </div>
              {urlBar(genExt,"Find external links","ext")}
              {ext && ext._siteId===s.id && (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)" }}>{ext.count} authoritative link(s) suggested</span>
                    {(ext.suggestions||[]).length>0 && <NeoButton kind="soft" size="sm" icon="check" style={{ marginLeft:"auto" }} disabled={batchBusy} onClick={()=>applyAll((ext.suggestions||[]).map(l=>({sourcePage:ext.sourcePage,anchor:l.anchor,targetUrl:l.targetUrl,sourceId:l.sourceId,sourceType:l.sourceType})))}>{batchBusy?"Pushing…":"Approve & push all"}</NeoButton>}
                  </div>
                  {(ext.suggestions||[]).map((l,i)=>{ const row={sourcePage:ext.sourcePage,anchor:l.anchor,targetUrl:l.targetUrl,sourceId:l.sourceId,sourceType:l.sourceType}; return (
                    <div key={i} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", fontSize:13 }}>
                        <span style={{ fontWeight:700, color:"var(--t-700)" }}>“{l.anchor}”</span>
                        <Icon name="arrowUp" size={13} style={{ transform:"rotate(90deg)", color:"var(--faint)" }} />
                        <a href={l.targetUrl} target="_blank" rel="noopener nofollow" style={{ fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", fontSize:11.5, maxWidth:340, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.targetUrl}</a>
                        {l.source && <Chip tone="teal" size="sm">{l.source}</Chip>}
                        <span style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:8 }}>
                          {linkStatus(row)}
                          <NeoButton kind="ghost" size="sm" icon="check" disabled={(applied[linkKey(row)]||{}).busy} onClick={()=>applyOne(row).then(r=>{ if(r.status==="verified")ctx.toast(r.notOnLive?(r.liveWarning||"Saved to WordPress, but won’t show on your live site."):"External link applied to live ✓",r.notOnLive?"clay":"teal"); else if(r.status==="blocked")ctx.toast("Site is read-only — arm writes on Admin first.","clay"); else if(r.status==="manual")ctx.toast(r.reason||"Add this one in your page-builder editor.","gold"); else if(r.error||r.reason)ctx.toast(r.error||r.reason,"clay"); })}>Approve</NeoButton>
                        </span>
                      </div>
                      {l.reason && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:5 }}>{l.reason}</div>}
                      {manualHint(row)}
                    </div>
                  );})}
                  {(ext.suggestions||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color: ext.aiError?"#7E5A14":"var(--muted)", background: ext.aiError?"var(--gold-bg)":"transparent", borderRadius:"var(--r-md)" }}>{ext.aiError ? (/credit|too low|balance/i.test(ext.aiError) ? "⚠️ AI link suggestions are paused — your Anthropic API credit balance is too low. Top up your Anthropic credits to restore this." : ("⚠️ AI temporarily unavailable — "+ext.aiError)) : (ext.note || "No strong authoritative outbound links found for this page.")}</div>}
                </div>
              )}
              {(!ext || ext._siteId!==s.id) && busy!=="ext" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Enter a page URL to find authoritative outbound links. <b>Approve</b> pushes the link into the live page (Classic/Gutenberg); page-builder pages are flagged for the editor. Links open in a new tab.</div>}
            </div>
          )}

          {tab==="schema" && (
            <div>
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Generate a per-page JSON-LD <b>@graph</b> — WebPage + BreadcrumbList, Article for posts, and LegalService/Person for legal/YMYL sites. Copy into Rank Math's custom schema or your head.</div>
              {urlBar(genSchema,"Generate schema","schema")}
              {schema && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12.5, fontWeight:700 }}>Types:</span>
                    {(schema.types||[]).map((t,i)=>(<Chip key={i} tone={t==="LegalService"||t==="Person"?"plum":"teal"} size="sm">{t}</Chip>))}
                    {schema.isLegal && <Chip tone="gold" size="sm">legal/YMYL</Chip>}
                    <NeoButton kind="soft" size="sm" icon="doc" style={{ marginLeft:"auto" }} onClick={()=>copy(schema.json)}>Copy JSON-LD</NeoButton>
                    <NeoButton kind="primary" size="sm" icon={busy==="applySchema"?undefined:"check"} disabled={busy==="applySchema"} onClick={applySchemaLive}>{busy==="applySchema"&&<Icon name="cog" size={14} className="audit-spin" />}Apply to live</NeoButton>
                  </div>
                  <pre style={{ margin:0, padding:"13px 15px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontSize:11.5, fontFamily:"var(--mono)", color:"var(--ink)", overflowX:"auto", maxHeight:420, lineHeight:1.5 }}>{schema.json}</pre>
                </div>
              )}
            </div>
          )}

          {tab==="facts" && (
            <div>
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Extract the citable facts + FAQ from a page so AI assistants (ChatGPT, Gemini, Perplexity, AI Overviews) can quote it — plus a ready FAQPage schema.</div>
              {urlBar(genFacts,"Extract facts","facts")}
              {facts && (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {(facts.facts||[]).length>0 && <div><div style={{ fontSize:12.5, fontWeight:700, marginBottom:6 }}>Citable facts</div><div style={{ display:"flex", flexDirection:"column", gap:5 }}>{facts.facts.map((f,i)=>(<div key={i} style={{ fontSize:12.5, padding:"8px 11px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>• {f}</div>))}</div></div>}
                  {(facts.faqs||[]).length>0 && <div><div style={{ fontSize:12.5, fontWeight:700, marginBottom:6 }}>Suggested FAQ</div><div style={{ display:"flex", flexDirection:"column", gap:6 }}>{facts.faqs.map((q,i)=>(<div key={i} style={{ padding:"9px 12px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}><div style={{ fontSize:12.5, fontWeight:700 }}>{q.q}</div><div style={{ fontSize:12, color:"var(--muted)", marginTop:3 }}>{q.a}</div></div>))}</div></div>}
                  {(facts.suggestions||[]).length>0 && <div><div style={{ fontSize:12.5, fontWeight:700, marginBottom:6 }}>Additions to improve citability</div><div style={{ display:"flex", flexDirection:"column", gap:5 }}>{facts.suggestions.map((sug,i)=>(<div key={i} style={{ fontSize:12.5, padding:"8px 11px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", color:"var(--t-800)" }}>→ {sug}</div>))}</div></div>}
                  {facts.faqSchema && <div><div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}><span style={{ fontSize:12.5, fontWeight:700 }}>FAQPage schema</span>
                    <NeoButton kind="soft" size="sm" icon="doc" style={{ marginLeft:"auto" }} onClick={()=>copy(JSON.stringify(facts.faqSchema,null,2))}>Copy</NeoButton>
                    <NeoButton kind="primary" size="sm" icon={busy==="applyFacts"?undefined:"check"} disabled={busy==="applyFacts"} onClick={()=>{
                      if(!pageUrl){ctx.toast("Enter the page URL above first","gold");return;}
                      setBusy("applyFacts"); ctx.toast("Applying FAQ schema to the live page…","teal");
                      API.applySchema(s.id,{ url:pageUrl, jsonld:facts.faqSchema }).then(r=>{
                        if(r.status==="blocked"){ ctx.toast("Site is read-only — arm writes on the Admin screen first.","gold"); return; }
                        if(r.error){ ctx.toast(r.error,"clay"); return; }
                        ctx.toast("FAQPage schema applied to the live page ✓ (reversible)","teal");
                      }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy(""));
                    }}>{busy==="applyFacts"?"Applying…":"Apply to live page"}</NeoButton></div>
                    <pre style={{ margin:0, padding:"12px 14px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontSize:11, fontFamily:"var(--mono)", overflowX:"auto", maxHeight:300 }}>{JSON.stringify(facts.faqSchema,null,2)}</pre>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:5 }}>Injects the schema into the page via the seo-agent-optimize plugin — no manual paste. Needs the plugin installed and the site write-armed.</div></div>}
                </div>
              )}
            </div>
          )}

          {tab==="css" && (
            <div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:13.5, fontWeight:700 }}>Generated CSS fixes</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Real, conservative CSS for fixable findings (target-size, CLS, focus-visible, font-display, reduced-motion) from your latest audit. Review, then add to your <b>child theme</b>.</div>
                </div>
                <NeoButton kind="primary" size="sm" icon={busy==="css"?undefined:"bolt"} disabled={busy==="css"} onClick={genCss}>{busy==="css"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="css"?"Generating…":"Generate CSS"}</NeoButton>
              </div>
              {css && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                    <Chip tone="teal" size="sm">{css.fixableCount} ready</Chip>
                    {css.manualCount>0 && <Chip tone="gold" size="sm">{css.manualCount} need values</Chip>}
                    <NeoButton kind="soft" size="sm" icon="doc" style={{ marginLeft:"auto" }} onClick={()=>copy(css.css)}>Copy CSS</NeoButton>
                    <NeoButton kind="primary" size="sm" icon={busy==="applyCss"?undefined:"check"} disabled={busy==="applyCss"} onClick={applyCssLive}>{busy==="applyCss"&&<Icon name="cog" size={14} className="audit-spin" />}Apply to live</NeoButton>
                  </div>
                  <pre style={{ margin:0, padding:"13px 15px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontSize:11.5, fontFamily:"var(--mono)", color:"var(--ink)", overflowX:"auto", maxHeight:460, lineHeight:1.5 }}>{css.css}</pre>
                </div>
              )}
              {!css && busy!=="css" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Generate reviewable CSS from your latest audit's fixable findings.</div>}
            </div>
          )}

          {tab==="images" && (
            <div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:13.5, fontWeight:700 }}>Image compression → WebP</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>For full automatic WebP/AVIF across all images (incl. CSS backgrounds), use <b>Enable auto-WebP</b> — installs &amp; activates Converter for Media, which converts and serves WebP server-side. "Scan/Optimize" is the manual fallback.</div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <NeoButton kind="primary" size="sm" icon={busy==="webpPlugin"?undefined:"bolt"} disabled={busy==="webpPlugin"} onClick={()=>{ setBusy("webpPlugin"); API.installWebpPlugin(s.id).then(r=>{ if(r.error){ctx.toast("WebP: "+r.error,"clay");return;} ctx.toast(r.already?"WebP plugin already active ✓":"Auto-WebP enabled ✓ (Converter for Media)","teal"); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy("")); }}>{busy==="webpPlugin"&&<Icon name="cog" size={15} className="audit-spin" />}Enable auto-WebP</NeoButton>
                  <NeoButton kind="soft" size="sm" icon={busy==="scan"?undefined:"image"} disabled={busy==="scan"} onClick={scanMedia}>{busy==="scan"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="scan"?"Scanning…":"Scan media"}</NeoButton>
                </div>
              </div>
              {media && media.images && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                    <PatternCard icon="image" tone="gold" value={media.heavyCount} title="Heavy images" sub={"of "+media.totalImages+" total"+(media.alreadyCount?(" · "+media.alreadyCount+" done"):"")} />
                    <PatternCard icon="layers" tone="plum" value={(media.totalHeavyKB/1024).toFixed(1)+" MB"} title="To convert" sub="raster JPEG/PNG" />
                    <PatternCard icon="bolt" tone="teal" value={"~"+(media.estSavingKB/1024).toFixed(1)+" MB"} title="Est. saving" sub="≈65% smaller as WebP" />
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <NeoButton kind="soft" size="sm" icon={busy==="preview"?undefined:"eye"} disabled={busy==="preview"||busy==="apply"} onClick={()=>optimizeMedia(false)}>{busy==="preview"&&<Icon name="cog" size={14} className="audit-spin" />}Preview (no write)</NeoButton>
                    <NeoButton kind="primary" size="sm" icon={busy==="apply"?undefined:"upload"} disabled={busy==="apply"||!media.heavyCount} onClick={()=>optimizeMedia(true)}>{busy==="apply"&&<Icon name="cog" size={14} className="audit-spin" />}{busy==="apply"&&optProg?("Optimizing "+optProg.done+"/"+(optProg.total||"?")+"…"):("Optimize all"+(media.heavyCount?(" ("+media.heavyCount+")"):""))}</NeoButton>
                    {!media.heavyCount && media.alreadyCount>0 && <span style={{ fontSize:12, color:"var(--t-700)", fontWeight:700 }}>✓ All heavy images converted</span>}
                  </div>
                  {media.lastRun && (
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)" }}>{media.lastRun.applied?"Optimized":"Preview"} · {media.lastRun.savedKB} KB saved across {media.lastRun.processed} image(s){media.lastRun.relinked?<span style={{ color:"var(--t-700)" }}> · {media.lastRun.relinked} already converted → re-linked</span>:null}</div>
                      {media.lastRun.applied && (media.lastRun.relinked>0) && <div style={{ fontSize:11.5, color:"var(--muted)" }}>The big images already had WebP from before — re-linked so pages serve them. For full coverage (incl. Elementor backgrounds), use <b>Enable auto-WebP</b> above.</div>}
                      {(media.lastRun.results||[]).map((r,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12 }}>
                          <span style={{ flex:1, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.filename||r.url||r.id}</span>
                          {r.error?<Chip tone="clay" size="sm">err</Chip>:r.skip?<Chip tone="gray" size="sm">{r.skip}</Chip>:<><span style={{ color:"var(--muted)" }}>{r.fromKB}→{r.toKB} KB</span><Chip tone="teal" size="sm">−{r.pct}%</Chip></>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {media.images.slice(0,60).map((im,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12, opacity:im.alreadyWebp?0.55:1 }}>
                        <a href={im.url} target="_blank" style={{ flex:1, fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(im.url||"").split("/").pop()}</a>
                        <span style={{ color:"var(--muted)" }}>{im.w}×{im.h}</span>
                        <Chip tone={im.sizeKB>500?"clay":"gold"} size="sm">{im.sizeKB} KB</Chip>
                        {im.alreadyWebp && <Chip tone="teal" size="sm" icon="check">WebP</Chip>}
                      </div>
                    ))}
                    {media.images.length>60 && <div style={{ fontSize:11.5, color:"var(--muted)", padding:"4px 2px" }}>+{media.images.length-60} more — "Optimize all" processes every one, not just these.</div>}
                  </div>
                  <div style={{ fontSize:11, color:"var(--faint)", lineHeight:1.5 }}>Uploads WebP copies to your media library. Swapping references in existing pages (esp. Elementor) is a separate manual step for safety.</div>
                </div>
              )}
              {!media && busy!=="scan" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Scan your media library to find heavy images and convert them to WebP.</div>}
            </div>
          )}

          {tab==="speed" && (
            <div>
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Run a live PageSpeed test (median of 2 runs) for any URL. Shows the four Lighthouse scores + Core Web Vitals.</div>
              <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                <input value={pageUrl} onChange={e=>setPageUrl(e.target.value)} placeholder="https://your-site.com/page/" style={{ flex:1, minWidth:240, padding:"10px 13px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
                <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)" }}>
                  {[["mobile","Mobile"],["desktop","Desktop"]].map(([v,l])=>(<button key={v} onClick={()=>setSpeedStrat(v)} style={{ padding:"6px 13px", fontSize:12.5, fontWeight:700, borderRadius:99, background:speedStrat===v?"var(--surface)":"transparent", color:speedStrat===v?"var(--t-700)":"var(--muted)", boxShadow:speedStrat===v?"var(--neo-sm)":"none" }}>{l}</button>))}
                </div>
                <NeoButton kind="primary" size="sm" icon={busy==="speed"?undefined:"gauge"} disabled={busy==="speed"} onClick={runSpeed}>{busy==="speed"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="speed"?"Testing…":"Run speed test"}</NeoButton>
              </div>
              {speed && speed.scores && (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                    {[["Performance","performance"],["Accessibility","accessibility"],["Best Pr.","bestPractices"],["SEO","seo"]].map(([l,k])=>(
                      <div key={k} style={{ padding:"14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", textAlign:"center" }}>
                        <div style={{ fontSize:24, fontWeight:800, color:tealForScore(speed.scores[k]||0) }}>{speed.scores[k]??"—"}</div>
                        <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                    {[["LCP",speed.cwv.lcp!=null?(speed.cwv.lcp/1000).toFixed(1)+"s":"—"],["INP/TBT",speed.cwv.tbt!=null?Math.round(speed.cwv.tbt)+"ms":"—"],["CLS",speed.cwv.cls!=null?speed.cwv.cls.toFixed(2):"—"],["FCP",speed.cwv.fcp!=null?(speed.cwv.fcp/1000).toFixed(1)+"s":"—"],["TBT",speed.cwv.tbt!=null?Math.round(speed.cwv.tbt)+"ms":"—"]].map(([l,v])=>(
                      <div key={l} style={{ padding:"11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", textAlign:"center" }}><div style={{ fontSize:15, fontWeight:800 }}>{v}</div><div style={{ fontSize:10.5, color:"var(--muted)" }}>{l}</div></div>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:"var(--faint)" }}>{speed.strategy} · median of {speed.runs} run(s){speed.field?" · CrUX field data available":""}. Improve these with the Images tab (LCP) and CSS Fixes tab (CLS/INP).</div>
                </div>
              )}
              {!speed && busy!=="speed" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Enter a URL and run a live PageSpeed test.</div>}
            </div>
          )}
        </SoftCard>
      )}
    </div>
  );
}

/* ---------------- Audit History screen ---------------- */
/* Per-account, unique history of every saved audit. Reuses existing UI atoms
   (PageHead, SoftCard, Ring, Chip, SectionHead) — no new styling. */
function HistoryScreen({ ctx }) {
  const s = ctx.site;
  const hist = ctx.history || [];
  const [openId, setOpenId] = useState(hist[0] && hist[0].id);
  const [maxed, setMaxed] = useState(false);
  const [range, setRange] = useState("week");
  const [corr,setCorr] = useState(null);
  const [corrBusy,setCorrBusy] = useState(false);
  const API = window.SentinelAPI;
  const loadCorr = ()=>{
    setCorrBusy(true);
    API.correlation(s.id, 90).then(r=>setCorr(r)).catch(e=>setCorr({error:e.message})).finally(()=>setCorrBusy(false));
  };
  useEffect(()=>{ setCorr(null); },[s.id]);
  // combo-chart data bucketed by day/week/month/year from real audit history
  const chartData = bucketAudits(hist, range);
  const fmt = (iso)=>{ try{ const d=new Date(iso); return d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+" · "+d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };
  const avg = (sc)=>Math.round(((sc.performance||0)+(sc.accessibility||0)+(sc.bestPractices||0)+(sc.seo||0))/4);
  // Significance-aware delta. Returns {v, sig} — sig=false when the change sits
  // inside the run-to-run noise band (median-of-N IQR), so we don't chart noise.
  const delta = (i, key)=>{
    if(i>=hist.length-1) return null;
    const prev=hist[i+1].scores||{}; const cur=hist[i].scores||{};
    if(prev[key]==null||cur[key]==null) return null;
    const v=cur[key]-prev[key];
    const iqr=(hist[i].variance&&hist[i].variance.iqr&&hist[i].variance.iqr[key])||0;
    const band=Math.max(1.5*iqr,2);
    return { v, sig:Math.abs(v)>band };
  };
  const dStr=(d)=> d==null?"":d.v>0?`▲ +${d.v}`:d.v<0?`▼ ${d.v}`:"= 0";
  const dCol=(d)=> !d.sig?"var(--faint)":d.v>0?"var(--t-600)":d.v<0?"var(--clay)":"var(--faint)";

  return (
    <div className="rise">
      <PageHead title="Audit History" sub={`Every saved audit for ${s.name} — unique to this account.`}>
        <NeoButton kind="primary" icon={ctx.auditing?undefined:"radar"} disabled={ctx.auditing} onClick={ctx.runAudit}>{ctx.auditing&&<Icon name="cog" size={16} className="audit-spin" />}{ctx.auditing?"Auditing…":"Run audit"}</NeoButton>
      </PageHead>

      {/* summary strip */}
      <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
        <Chip tone="teal" icon="trend">{hist.length} audit{hist.length!==1?"s":""} logged</Chip>
        {hist[0] && <Chip tone="gray" icon="clock">Latest {fmt(hist[0].ts)}</Chip>}
        <Chip tone="plum" icon="globe">{s.url}</Chip>
      </div>

      {ctx.historyLoading && <SoftCard hover={false}><div style={{ padding:"10px 4px", color:"var(--muted)", fontSize:13.5, display:"flex", alignItems:"center", gap:10 }}><Icon name="cog" size={16} className="audit-spin" />Loading history…</div></SoftCard>}

      {/* score-trend combo chart (real per-account history) */}
      {!ctx.historyLoading && hist.length>=2 && chartData.length>=1 && (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub={`SEO (bars) vs Performance (scatter) · by ${range}`} right={
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ display:"flex", gap:2, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)" }}>
                {[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([r,l])=>(
                  <button key={r} onClick={()=>setRange(r)} style={{ padding:"6px 11px", fontSize:12, fontWeight:700, borderRadius:99, background:range===r?"var(--surface)":"transparent", color:range===r?"var(--t-700)":"var(--muted)", boxShadow:range===r?"var(--neo-sm)":"none" }}>{l}</button>
                ))}
              </div>
              <MaxBtn onClick={()=>setMaxed(true)} />
            </div>
          }>Score Trend</SectionHead>
          <Well pad="18px 16px 10px"><ComboChart data={chartData} height={190} /><div style={{ marginTop:8, display:"flex", justifyContent:"center" }}><ComboLegend /></div></Well>
          <ChartModal open={maxed} onClose={()=>setMaxed(false)} title="Audit Score Trend" sub={`${s.name} · grouped by ${range} · ${chartData.length} ${range==="day"?"points":range+"s"}`}>
            <Well pad="26px 22px 14px"><ComboChart data={chartData} height={440} big /><div style={{ marginTop:14, display:"flex", justifyContent:"center" }}><ComboLegend /></div></Well>
            <div style={{ display:"flex", gap:24, marginTop:18, flexWrap:"wrap" }}>
              {[["Avg. SEO",Math.round(chartData.reduce((a,d)=>a+d.seo,0)/chartData.length),"trend"],["Avg. Perf",Math.round(chartData.reduce((a,d)=>a+d.perf,0)/chartData.length),"bolt"],["Best SEO",Math.max(...chartData.map(d=>d.seo)),"arrowUp"],["Net change",(()=>{const g=chartData[chartData.length-1].seo-chartData[0].seo;return g>=0?"+"+g:""+g;})(),"check"]].map(([l,v,ic])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:11 }}><div style={{ width:40, height:40, borderRadius:12, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name={ic} size={18} /></div><div><div style={{ fontSize:19, fontWeight:800 }}>{v}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{l}</div></div></div>
              ))}
            </div>
          </ChartModal>
        </SoftCard>
      )}

      {/* correlation matrix — does fixing CWV/scores move rankings? */}
      {!ctx.historyLoading && hist.length>=3 && (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub="Spearman rank correlation across your audit + Search Console history — correlational, not causal" right={
            <NeoButton kind="soft" size="sm" icon={corrBusy?undefined:"radar"} disabled={corrBusy} onClick={loadCorr}>{corrBusy&&<Icon name="cog" size={15} className="audit-spin" />}{corrBusy?"Computing…":corr?"Recompute":"Analyze correlations"}</NeoButton>
          }>CWV ↔ ranking correlation</SectionHead>
          {corr && corr.error && <div style={{ fontSize:13, color:"var(--muted)", padding:"6px 2px" }}>{corr.insufficient?`Need more audit history (have ${corr.n||0}). Keep auditing over time and this will populate.`:`⚠️ ${corr.error}`}</div>}
          {corr && !corr.error && (()=>{
            const cell=(v)=>{ if(v==null) return ["var(--bg-2)","var(--faint)","—"]; const a=Math.abs(v); const pos=v>=0; const bg=pos?`rgba(45,140,120,${0.10+a*0.5})`:`rgba(190,90,70,${0.10+a*0.5})`; const fg=a>0.55?"#fff":"var(--ink)"; return [bg,fg,v.toFixed(2)]; };
            return (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {!corr.hasGsc && <div style={{ fontSize:12, color:"var(--muted)" }}>Connect Google Search Console to add real ranking & click columns — currently showing internal metric correlations only.</div>}
              <div style={{ overflowX:"auto" }}>
                <table style={{ borderCollapse:"separate", borderSpacing:3, fontSize:11.5 }}>
                  <thead><tr><th></th>{corr.metrics.map((m,i)=>(<th key={i} style={{ padding:"4px 6px", fontWeight:700, color:"var(--muted)", writingMode:"vertical-rl", transform:"rotate(180deg)", whiteSpace:"nowrap", height:78 }}>{m}</th>))}</tr></thead>
                  <tbody>
                    {corr.matrix.map((row,i)=>(
                      <tr key={i}>
                        <td style={{ padding:"4px 8px", fontWeight:700, color:"var(--muted)", whiteSpace:"nowrap", textAlign:"right" }}>{corr.metrics[i]}</td>
                        {row.map((v,j)=>{ const [bg,fg,txt]=cell(v); return (<td key={j} style={{ width:42, height:34, textAlign:"center", borderRadius:7, background:bg, color:fg, fontWeight:700 }}>{txt}</td>); })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:11.5, color:"var(--faint)" }}>n = {corr.n} paired observations. Green = positive, clay = negative. All metrics oriented "higher = better".</div>
              {(corr.rankingPairs&&corr.rankingPairs.length>0) && (
                <div>
                  <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", marginBottom:8 }}>What correlates with rankings/traffic</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {corr.rankingPairs.slice(0,6).map((p,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5 }}>
                        <span style={{ flex:1, fontWeight:600 }}>{p.a} ↔ {p.b}</span>
                        <span style={{ fontWeight:800, color:p.rho>=0?"var(--t-700)":"var(--clay)" }}>ρ {p.rho.toFixed(2)}</span>
                        <Chip tone={/p<0.05/.test(p.strength)?"teal":"gray"} size="sm">{p.strength}</Chip>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontSize:11, color:"var(--faint)", lineHeight:1.5 }}>{corr.note}</div>
            </div>
            );
          })()}
          {!corr && !corrBusy && <div style={{ fontSize:13, color:"var(--muted)", padding:"6px 2px" }}>Run the analysis to see whether your Core Web Vitals & Lighthouse scores actually track with this site's Google rankings and clicks.</div>}
        </SoftCard>
      )}

      {!ctx.historyLoading && hist.length===0 && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"30px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name="trend" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>No audits yet for {s.name}</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:380 }}>Run an audit to start building this account's history. Every run is saved here with its scores and findings.</div>
            <NeoButton kind="primary" icon="radar" onClick={ctx.openRunAudit}>Run first audit</NeoButton>
          </div>
        </SoftCard>
      )}

      {!ctx.historyLoading && hist.length>0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {hist.map((h,i)=>{
            const open=openId===h.id, sc=h.scores||{}, a=avg(sc);
            const cats=[["Perf","performance"],["A11y","accessibility"],["Best Pr.","bestPractices"],["SEO","seo"]];
            return (
              <SoftCard key={h.id} hover={false} pad={0} style={{ overflow:"hidden", boxShadow:open?"var(--neo)":"var(--neo-sm)" }}>
                <div className="row-link" onClick={()=>setOpenId(open?null:h.id)} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px" }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:tealForScore(a), fontWeight:800, fontSize:16, flexShrink:0 }}>{a}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14.5, fontWeight:700 }}>{fmt(h.ts)}</span>
                      {i===0 && <Chip tone="teal" size="sm" solid>Latest</Chip>}
                      <Chip tone="gray" size="sm" icon="radar">{h.scope||"single"}</Chip>
                    </div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:3 }}>{(h.findings||[]).length} findings · composite {a}/100</div>
                  </div>
                  <div style={{ display:"flex", gap:14 }}>
                    {cats.map(([l,k])=>{
                      const d=delta(i,k);
                      return (
                        <div key={l} style={{ textAlign:"center", minWidth:44 }}>
                          <div style={{ fontSize:15, fontWeight:800, color:tealForScore(sc[k]||0) }}>{sc[k]??"—"}</div>
                          <div style={{ fontSize:10, color:"var(--muted)" }}>{l}</div>
                          {d!=null && d.v!==0 && <div style={{ fontSize:10, fontWeight:700, color:dCol(d), opacity:d.sig?1:0.6 }} title={d.sig?"Significant vs noise band":"Within run-to-run noise — not significant"}>{dStr(d)}{!d.sig && " ·noise"}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <Icon name="chevD" size={18} style={{ color:"var(--faint)", transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
                </div>
                {open && (
                  <div className="rise" style={{ padding:"4px 20px 20px" }}>
                    <Well pad={16}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                        {cats.map(([l,k])=>(
                          <div key={l} className="htip" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                            <div className="htip-body">{l}: <b>{sc[k]??"—"}</b></div>
                            <Ring value={sc[k]||0} size={56} sw={6} />
                            <span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>{l}</span>
                          </div>
                        ))}
                      </div>
                    </Well>
                    {(h.findings||[]).length>0 && (
                      <div style={{ marginTop:14 }}>
                        <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", color:"var(--muted)", margin:"0 2px 9px" }}>Top findings ({(h.findings||[]).length})</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                          {(h.findings||[]).slice(0,6).map((f,fi)=>{
                            const dm=softDisc[f.disc]||softDisc.seo;
                            return (
                              <div key={fi} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                                <div style={{ width:28, height:28, borderRadius:8, background:TT[dm.tone][1], color:TT[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={14} /></div>
                                <span style={{ flex:1, minWidth:0, fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{f.title}</span>
                                <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{f.page}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </SoftCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Content Intelligence screen ---------------- */
/* Claude-powered content gaps, suggestions, keyword clusters. Reuses existing
   UI atoms (PageHead, SoftCard, Chip, SectionHead, NeoButton, PatternCard). */
function ContentScreen({ ctx }) {
  const s = ctx.site;
  const d = ctx.intel;
  const loading = ctx.intelLoading;
  const API = window.SentinelAPI;
  const [pushing,setPushing] = useState(false);
  const strengthTone = { strong:"teal", moderate:"gold", thin:"clay" };
  const prioTone = { high:"clay", medium:"gold", low:"gray" };
  // Target country for content/intel/briefs/research — same per-site market as the
  // keyword data (semrush_db), so changing it here switches the whole content focus.
  const live = API && window.SENTINEL_LIVE;
  const [dbVal,setDbVal] = useState(s.semrush_db||"uk");
  const [dbList,setDbList] = useState(null);
  // AEO readiness — score the current/pasted page for answer-engine extractability:
  // 0–100 score, thin-content flag, and the uncited-claim list (verifyClaims).
  const [aeoUrl,setAeoUrl] = useState("");
  const [aeoBusy,setAeoBusy] = useState(false);
  const [aeo,setAeo] = useState(null);
  const runAeoScore = ()=>{
    const url=(aeoUrl||"").trim();
    if(!url){ ctx.toast("Paste a page URL to score","gold"); return; }
    setAeoBusy(true); setAeo(null);
    API.contentScore("", url).then(r=>{ if(r.error){ ctx.toast("AEO score: "+r.error,"clay"); setAeo({ error:r.error }); return; } setAeo(r); }).catch(e=>{ ctx.toast(e.message,"clay"); setAeo({ error:e.message }); }).finally(()=>setAeoBusy(false));
  };
  // Humanize — paste a draft, strip robotic AI tells. Returns { out, changes, changed }.
  const [humText,setHumText] = useState("");
  const [humBusy,setHumBusy] = useState(false);
  const [hum,setHum] = useState(null);
  const runHumanize = ()=>{
    const text=(humText||"").trim();
    if(!text){ ctx.toast("Paste some draft text to humanize","gold"); return; }
    setHumBusy(true); setHum(null);
    API.contentHumanize(text).then(r=>{ if(r.error){ ctx.toast("Humanize: "+r.error,"clay"); setHum({ error:r.error }); return; } setHum(r); ctx.toast(r.changes>0?(r.changes+" robotic tell(s) cleaned ✓"):"Already clean — no AI tells found", r.changes>0?"teal":"gold"); }).catch(e=>{ ctx.toast(e.message,"clay"); setHum({ error:e.message }); }).finally(()=>setHumBusy(false));
  };
  useEffect(()=>{ setDbVal(s.semrush_db||"uk"); },[s.id]);
  useEffect(()=>{ if(live&&!dbList) API.siteDatabase(s.id).then(r=>{ if(r&&r.countries) setDbList(r.countries); }).catch(()=>{}); },[live]);
  const changeCountry = (db)=>{
    if(!db||db===dbVal) return;
    setDbVal(db); s.semrush_db=db;
    var site=window.SITES.find(x=>x.id===s.id); if(site) site.semrush_db=db;
    if(live) API.siteDatabase(s.id, db).then(()=>ctx.toast("Target country set to "+db.toUpperCase()+" — re-run Analyze to refresh for this market","teal")).catch(()=>{});
  };

  // Push the analysed keywords (suggestions + gaps) into the site's Airtable
  // keyword column → feeds the n8n article writer.
  const pushToAirtable = ()=>{
    // ONE click → push the full, correct keyword set the article-writer needs: every
    // keywordCluster (primary + its related keywords) + gap keywords + suggestion target
    // keywords, de-duped. No second trip to the Airtable screen, and the RIGHT keywords.
    const kws=[...new Set([
      ...((d&&d.keywordClusters)||[]).flatMap(c=>[c.primaryKeyword, ...((c.keywords)||[])]),
      ...((d&&d.gaps)||[]).map(g=>typeof g==="string"?g:(g.keyword||g.topic)),
      ...((d&&d.suggestions)||[]).map(x=>x.targetKeyword||x.keyword||x.title),
    ].map(k=>(k||"").trim()).filter(Boolean))];
    if(!kws.length){ ctx.toast("No keywords to push — analyze content first","gold"); return; }
    setPushing(true); ctx.toast("Pushing "+kws.length+" keyword(s) to Airtable…","teal");
    API.airtablePushKeywords(s.id, kws).then(r=>{ if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      ctx.toast(r.pushed>0?("Pushed "+r.pushed+" new keyword(s) to Airtable ✓"+(r.skipped?" ("+r.skipped+" already there)":"")):"All keywords already in Airtable", r.pushed>0?"teal":"gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushing(false));
  };

  return (
    <div className="rise">
      <PageHead title="Content Intelligence" sub={`Keyword clusters, content gaps & new-article ideas for ${s.name}.`}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <CountrySelect value={dbVal} options={dbList} onChange={changeCountry} title="Target country for content intel, briefs & research — sets this site's market" />
          {d && !d.error && !loading && <NeoButton kind="soft" size="sm" icon={pushing?undefined:"upload"} disabled={pushing} onClick={pushToAirtable}>{pushing&&<Icon name="cog" size={15} className="audit-spin" />}{pushing?"Pushing…":"Push to Airtable"}</NeoButton>}
          <NeoButton kind="primary" icon={loading?undefined:"sparkles"} disabled={loading} onClick={ctx.runContentIntel}>
            {loading && <Icon name="cog" size={17} className="audit-spin" />}{loading?"Analyzing…":d?"Re-analyze":"Analyze content"}
          </NeoButton>
        </div>
      </PageHead>

      {/* AEO readiness — answer-engine extractability score for a single page (preview/offline). */}
      <SoftCard hover={false} style={{ marginBottom:18 }}>
        <SectionHead sub="Score one page for answer-engine readiness — how cleanly LLMs & featured snippets can extract it. Flags thin content and uncited claims.">AEO readiness</SectionHead>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input value={aeoUrl} onChange={e=>setAeoUrl(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") runAeoScore(); }} placeholder="https://your-site.com/page-to-check"
            className="search-in" style={{ flex:1, minWidth:240, padding:"11px 14px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
          <NeoButton kind="primary" icon={aeoBusy?undefined:"radar"} disabled={aeoBusy} onClick={runAeoScore}>{aeoBusy&&<Icon name="cog" size={16} className="audit-spin" />}{aeoBusy?"Scoring…":"Score page"}</NeoButton>
        </div>
        {aeo && aeo.error && <div style={{ marginTop:12, fontSize:13, color:"var(--clay)" }}>{aeo.error}</div>}
        {aeo && !aeo.error && (()=>{ const tone=aeo.score>=80?"teal":aeo.score>=50?"gold":"clay"; const v=aeo.verify||{}; return (
          <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
              <div style={{ width:74, height:74, borderRadius:18, background:TT[tone][1], color:TT[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}>
                <span style={{ fontSize:26, fontWeight:800, lineHeight:1 }}>{aeo.score}</span>
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", marginBottom:5 }}>
                  <span style={{ fontSize:14.5, fontWeight:700 }}>AEO readiness score</span>
                  {aeo.thin && <Chip tone="clay" size="sm" icon="alert">thin content</Chip>}
                  {v.total!=null && <Chip tone={v.pass?"teal":"gold"} size="sm">{v.uncitedCount||0}/{v.total} uncited claim(s)</Chip>}
                  {aeo.words!=null && <Chip tone="gray" size="sm">{Number(aeo.words).toLocaleString()} words</Chip>}
                </div>
                {(aeo.flags||[]).length>0 && <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{(aeo.flags||[]).map((f,i)=><Chip key={i} tone="gray" size="sm">{f}</Chip>)}</div>}
              </div>
            </div>
            {(v.uncited||[]).length>0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.4, marginBottom:7 }}>Uncited claims — add a source or remove</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {(v.uncited||[]).map((c,i)=>(
                    <div key={i} style={{ display:"flex", gap:10, padding:"10px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <Icon name="alert" size={15} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />
                      <span style={{ fontSize:12.5, color:"var(--ink)", lineHeight:1.5 }}>{typeof c==="string"?c:(c.claim||c.text||JSON.stringify(c))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ); })()}
        {/* Humanize — de-AI a draft/answer block before publishing. */}
        <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid var(--line-soft)" }}>
          <div style={{ fontSize:12.5, fontWeight:800, color:"var(--ink-2)", marginBottom:3 }}>Humanize a draft</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginBottom:9 }}>Paste AI-written copy to strip robotic tells (em-dash spam, "delve", "in today's world", hedge words) before it goes live.</div>
          <textarea value={humText} onChange={e=>setHumText(e.target.value)} rows={4} placeholder="Paste a draft, intro, or answer block…" style={{ width:"100%", boxSizing:"border-box", padding:"10px 13px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, lineHeight:1.55, color:"var(--ink)", outline:"none", resize:"vertical", fontFamily:"inherit" }} />
          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:9, flexWrap:"wrap" }}>
            <NeoButton kind="primary" size="sm" icon={humBusy?undefined:"sparkles"} disabled={humBusy} onClick={runHumanize}>{humBusy&&<Icon name="cog" size={15} className="audit-spin" />}{humBusy?"Humanizing…":"Humanize"}</NeoButton>
            {hum && !hum.error && <Chip tone={hum.changes>0?"teal":"gray"} size="sm">{hum.changes||0} change(s)</Chip>}
          </div>
          {hum && hum.error && <div style={{ marginTop:10, fontSize:12.5, color:"var(--clay)" }}>{hum.error}</div>}
          {hum && !hum.error && hum.out!=null && (
            <div style={{ marginTop:11 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.4 }}>Cleaned text</span>
                <NeoButton kind="ghost" size="sm" icon="copy" style={{ marginLeft:"auto" }} onClick={()=>{ try{ navigator.clipboard.writeText(hum.out||""); ctx.toast("Cleaned text copied","teal"); }catch(e){ ctx.toast("Select & copy below","gold"); } }}>Copy</NeoButton>
              </div>
              <div className="scroll" style={{ maxHeight:240, overflow:"auto", fontSize:12.5, lineHeight:1.6, color:"var(--ink)", background:"var(--bg)", padding:"11px 13px", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", whiteSpace:"pre-wrap" }}>{hum.out}</div>
            </div>
          )}
        </div>
      </SoftCard>

      {!d && !loading && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"32px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name="sparkles" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>Analyze {s.name}'s content library</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:430 }}>Claude reads your published titles and maps your topic clusters, finds the gaps competitors fill, and proposes new articles with target keywords — all read-only.</div>
            <NeoButton kind="primary" icon="sparkles" onClick={ctx.runContentIntel}>Analyze content</NeoButton>
          </div>
        </SoftCard>
      )}

      {loading && (
        <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Reading the content library and analyzing with Claude… this takes ~30–60s.</div></SoftCard>
      )}

      {d && d.error && !loading && (
        <ErrBanner msg={d.error} onRetry={ctx.runContentIntel} />
      )}

      {d && !d.error && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            <PatternCard icon="layers" tone="teal" value={(d.clusters||[]).length+" clusters"} title="Topic clusters" sub={`Across ${d.analyzedTitles||0} pages analyzed`} />
            <PatternCard icon="flag" tone="gold" value={(d.gaps||[]).length+" gaps"} title="Content gaps" sub="High-value topics you're missing" />
            <PatternCard icon="doc" tone="plum" value={(d.suggestions||[]).length+" ideas"} title="Article suggestions" sub="Ready to brief & write" />
          </div>

          {/* NEW content keyword clusters — the actionable plan; THIS is what "Push to Airtable" sends. */}
          {(d.keywordClusters||[]).length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub="1 primary keyword → ~10 related keywords (each a unique angle) + article angles. These keywords are exactly what “Push to Airtable” sends to your article writer.">Content Keyword Clusters → Airtable</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {(d.keywordClusters||[]).map((c,i)=>(
                  <div key={i} style={{ padding:"14px 16px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", marginBottom:8 }}>
                      <Chip tone="teal" size="sm" icon="search">{c.primaryKeyword}</Chip>
                      <Chip tone="gray" size="sm">{c.intent}</Chip>
                      <span style={{ fontSize:11.5, color:"var(--muted)" }}>{(c.keywords||[]).length} keywords</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:(c.angles||[]).length?9:0 }}>
                      {(c.keywords||[]).map((k,ki)=><span key={ki} style={{ fontSize:11.5, fontWeight:600, color:"var(--t-700)", background:"var(--t-50)", padding:"3px 9px", borderRadius:99, fontFamily:"var(--mono)" }}>{k}</span>)}
                    </div>
                    {(c.angles||[]).length>0 && <div style={{ display:"flex", flexDirection:"column", gap:4 }}>{(c.angles||[]).map((a,ai)=>(<div key={ai} style={{ fontSize:12, color:"var(--muted)", display:"flex", gap:7 }}><Icon name="doc" size={13} style={{ color:"var(--t-600)", flexShrink:0, marginTop:1 }} /><span>{a}</span></div>))}</div>}
                  </div>
                ))}
              </div>
            </SoftCard>
          )}

          {/* Existing content clusters (descriptive — what the site already covers) */}
          <SoftCard hover={false}>
            <SectionHead sub="What your current pages already cover (existing content — not pushed)">Your Existing Topic Clusters</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(d.clusters||[]).map((c,i)=>(
                <div key={i} style={{ padding:"14px 16px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:7 }}>
                    <span style={{ fontSize:14.5, fontWeight:700 }}>{c.name}</span>
                    <Chip tone={strengthTone[c.strength]||"gray"} size="sm" dot>{c.strength}</Chip>
                    <Chip tone="gray" size="sm" icon="doc">~{c.pageCount} pages</Chip>
                  </div>
                  <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:9 }}>{c.theme}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {(c.keywords||[]).map((k,ki)=><span key={ki} style={{ fontSize:11.5, fontWeight:600, color:"var(--t-700)", background:"var(--t-50)", padding:"3px 9px", borderRadius:99, fontFamily:"var(--mono)" }}>{k}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </SoftCard>

          {/* Content gaps */}
          <SoftCard hover={false}>
            <SectionHead sub="High-value topics missing from your library">Content Gaps</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {(d.gaps||[]).map((g,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:13, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:TT[prioTone[g.priority]||"gray"][1], color:TT[prioTone[g.priority]||"gray"][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name="flag" size={16} /></div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{g.topic}</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{g.why}</div>
                  </div>
                  <Chip tone="gray" size="sm">{g.intent}</Chip>
                  <Chip tone={prioTone[g.priority]||"gray"} size="sm" dot>{g.priority}</Chip>
                </div>
              ))}
            </div>
          </SoftCard>

          {/* Suggestions */}
          <SoftCard hover={false}>
            <SectionHead sub="New articles to brief & write, with target keywords">Article Suggestions</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {(d.suggestions||[]).map((sg,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:13, padding:"13px 15px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"var(--t-100)", color:"var(--t-700)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name="doc" size={16} /></div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{sg.title}</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{sg.rationale}</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:8 }}>
                      <Chip tone="teal" size="sm" icon="search">{sg.targetKeyword}</Chip>
                      <Chip tone="gray" size="sm">{sg.format}</Chip>
                      {sg.cluster && <Chip tone="plum" size="sm" icon="layers">{sg.cluster}</Chip>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SoftCard>

          {/* Internal links */}
          {(d.internalLinks||[]).length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub="Connect related pages to strengthen topical authority">Internal Link Opportunities</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(d.internalLinks||[]).map((l,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--ink)" }}>{l.from}</span>
                    <Icon name="chevR" size={15} style={{ color:"var(--t-600)" }} />
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--t-700)" }}>{l.to}</span>
                    <span style={{ fontSize:12, color:"var(--muted)", marginLeft:"auto" }}>{l.reason}</span>
                  </div>
                ))}
              </div>
            </SoftCard>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- AI Visibility (GEO) screen ---------------- */
/* Measures whether AI engines (ChatGPT/Perplexity/Claude) CITE this site, plus
   GEO-enablement artifacts + DataForSEO. Reuses existing UI atoms. */
function GeoScreen({ ctx }) {
  const s = ctx.site;
  const d = ctx.geo;
  const loading = ctx.geoLoading;
  const [comps, setComps] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pushingOpps, setPushingOpps] = useState(false);
  const [geoHist, setGeoHist] = useState(null);
  const [citTrend, setCitTrend] = useState(null);
  const [ctxText, setCtxText] = useState(s.geo_context || "");
  const [savingCtx, setSavingCtx] = useState(false);
  const API = window.SentinelAPI;
  // Load scan history (for the trend) + citation SoV time-series + reset the per-site context on site change.
  useEffect(()=>{
    setCtxText(s.geo_context||"");
    if(API&&API.geoHistory) API.geoHistory(s.id).then(r=>setGeoHist((r&&r.runs)||[])).catch(()=>{});
    if(API&&API.geoCitationTrend) API.geoCitationTrend(s.id).then(r=>setCitTrend(r||null)).catch(()=>{});
  },[s.id, d]);
  // Push the current scan's prompt/citation results to Airtable (de-duped server-side).
  const pushAirtable = ()=>{
    if(!d || d.error || !((d.results||[]).length)){ ctx.toast("Run a scan first","gold"); return; }
    setPushing(true); ctx.toast("Pushing prompt + competitor results to Airtable…","teal");
    API.airtableSync(s.id,{kinds:["geo"],geoResults:d.results,geoCompetitors:d.competitors||[],geoTarget:{domain:d.targetDomain,share:d.shareOfVoice,cited:d.promptsCited}}).then(r=>{
      if(r.error){ ctx.toast(r.needsConnect?"Connect Airtable first (Integrations screen)":r.needsConfig?"Pick an Airtable base first (Integrations screen)":r.error,"clay"); return; }
      const g=(r.synced&&r.synced.geo)||{}; const pushed=g.pushed||0; const skipped=(r.synced&&r.synced.geoSkipped)||0;
      const comp=(r.synced&&r.synced.geo_competitors)||{}; const compPushed=comp.pushed||0;
      ctx.toast((pushed?("Pushed "+pushed+" prompt result(s)"+(skipped?" · "+skipped+" already there":"")):"Prompts already in Airtable")+(compPushed?(" · "+compPushed+" competitor row(s)"):"")+" ✓","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushing(false));
  };
  // Push the "show up for these" opportunities (uncited queries) to their own Airtable table.
  const pushAirtableOpps = ()=>{
    if(!opportunities.length){ ctx.toast("No opportunities to push — run a scan first","gold"); return; }
    setPushingOpps(true); ctx.toast("Pushing opportunities to Airtable…","teal");
    API.airtableSync(s.id,{kinds:["geo_opportunities"],geoOpportunities:opportunities}).then(r=>{
      if(r.error){ ctx.toast(r.needsConnect?"Connect Airtable first (Integrations screen)":r.needsConfig?"Pick an Airtable base first (Integrations screen)":r.error,"clay"); return; }
      const g=(r.synced&&r.synced.geo_opportunities)||{}; const pushed=g.pushed||0; const skipped=(r.synced&&r.synced.geoOppsSkipped)||0;
      ctx.toast(pushed?("Pushed "+pushed+" opportunit"+(pushed===1?"y":"ies")+(skipped?" · "+skipped+" already there":"")):"All opportunities already in Airtable ✓","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushingOpps(false));
  };
  // Save the per-site AI context (steers the next scan's prompt generation).
  const saveContext = ()=>{
    setSavingCtx(true);
    Promise.resolve(API.updateSite(s.id,{geo_context:ctxText})).then(r=>{
      if(r&&r.error){ ctx.toast("Couldn't save context (the geo_context column may be missing): "+r.error,"clay"); return; }
      s.geo_context=ctxText;
      ctx.toast("Site context saved — used to focus the next scan's prompts","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setSavingCtx(false));
  };
  // Publish llms.txt + AI-bot robots to the LIVE site (needs mu-plugin v1.8.0 + write-armed).
  const publishGeo = ()=>{
    if(!window.SENTINEL_LIVE || !s._rawUrl){ ctx.toast("Connect a live site first","gold"); return; }
    setPublishing(true); ctx.toast("Publishing llms.txt + AI robots to the site…","teal");
    API.geoEnable(s.id,{apply:true,siteName:s.name}).then(r=>{
      if(r.error){ ctx.toast(r.error,"clay"); return; }
      if(r.status==="blocked"){ ctx.toast("Site is read-only — arm writes in Settings first","gold"); return; }
      if(!r.ok){ ctx.toast("Publish failed: "+((r.published&&(r.published.llmsError||r.published.robotsError))||"update the mu-plugin to v1.8.0"),"clay"); return; }
      ctx.toast("Published ✓ — live at "+r.llmsUrl,"teal");
      if(r.physicalRobots) ctx.toast("Heads-up: a physical robots.txt exists and may override the AI-bot rules — remove it to let them apply.","gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPublishing(false));
  };
  // AI-visibility auto-push: publish Organization/LegalService entity signals to the homepage
  // (deterministic — no Anthropic credits). These are the structured-data signals ChatGPT /
  // Perplexity / Google use to identify and cite the brand.
  const applyEntity = ()=>{
    setBoosting(true); ctx.toast("Publishing AI entity signals…","teal");
    API.applyEntitySignals(s.id).then(r=>{
      if(r.error){ ctx.toast("Entity signals: "+r.error,"clay"); return; }
      if(r.status==="blocked"){ ctx.toast("Site is read-only — arm writes in Settings first","gold"); return; }
      ctx.toast("Published entity signals ("+((r.types||[]).join(", ")||"Organization")+") to homepage ✓","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBoosting(false));
  };

  // "Show up for these" — fresh queries where AI isn't citing us yet, ordered by
  // commercial > comparison > informational intent (highest-value gaps first).
  const intentRank = { commercial:0, comparison:1, informational:2 };
  const irank = (x)=> intentRank[x]===undefined ? 3 : intentRank[x];
  const opportunities = (d && !d.error && Array.isArray(d.results))
    ? d.results.filter(r=>!r.error && !r.targetCited).slice().sort((a,b)=>irank(a.intent)-irank(b.intent))
    : [];

  return (
    <div className="rise">
      <PageHead title="AI Visibility (GEO)" sub={`Does AI cite ${s.name}? Measure share-of-AI-voice across buyer-intent prompts.`}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <NeoButton kind="soft" icon={boosting?undefined:"sparkles"} disabled={boosting} onClick={applyEntity}>{boosting&&<Icon name="cog" size={15} className="audit-spin" />}Publish entity signals</NeoButton>
          <NeoButton kind="soft" icon="sparkles" onClick={ctx.runGeoEnable}>Preview llms.txt</NeoButton>
          <NeoButton kind="soft" icon={publishing?undefined:"globe"} disabled={publishing} onClick={publishGeo}>{publishing&&<Icon name="cog" size={15} className="audit-spin" />}Publish to site</NeoButton>
          <NeoButton kind="primary" icon={loading?undefined:"globe"} disabled={loading} onClick={()=>ctx.runGeoTrack(comps)}>
            {loading && <Icon name="cog" size={17} className="audit-spin" />}{loading?"Scanning…":d?"Re-scan":"Measure AI visibility"}
          </NeoButton>
        </div>
      </PageHead>

      {/* competitors input */}
      <SoftCard hover={false} style={{ flexDirection:"row", alignItems:"center", gap:14, flexWrap:"wrap", marginBottom:18 }}>
        <Icon name="search" size={18} style={{ color:"var(--t-700)" }} />
        <span style={{ fontSize:13.5, fontWeight:700 }}>Competitors</span>
        <input value={comps} onChange={e=>setComps(e.target.value)} placeholder="competitor1.com, competitor2.com (optional)"
          className="search-in" style={{ flex:1, minWidth:200, padding:"10px 14px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none" }} />
        <span style={{ fontSize:12, color:"var(--muted)" }}>Compared in the same AI answers</span>
      </SoftCard>

      {/* per-site AI context — steers prompt generation toward what this site actually is */}
      <SoftCard hover={false} style={{ marginBottom:18 }}>
        <SectionHead sub="Tell the AI what this site is about, who it serves and what to focus on — used to generate sharper, on-topic prompts. Saved per site.">Site context for AI prompts</SectionHead>
        <textarea value={ctxText} onChange={e=>setCtxText(e.target.value)} rows={3}
          placeholder="e.g. A UK consumer app that scans food & skincare barcodes to reveal ingredients, allergens and safety scores. Audience: health-conscious shoppers. Focus prompts on ingredient safety, product comparisons and label decoding."
          style={{ width:"100%", boxSizing:"border-box", padding:"11px 13px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.5 }} />
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
          <NeoButton kind="soft" size="sm" icon={savingCtx?undefined:"check"} disabled={savingCtx||ctxText===(s.geo_context||"")} onClick={saveContext}>{savingCtx&&<Icon name="cog" size={13} className="audit-spin" />}Save context</NeoButton>
        </div>
      </SoftCard>

      {!d && !loading && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"32px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name="globe" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>Is AI showing {s.name}?</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:460 }}>Claude generates real buyer-intent questions, asks them with live web search, and measures how often AI assistants cite your site vs competitors — the GEO equivalent of rank tracking.</div>
            <NeoButton kind="primary" icon="globe" onClick={()=>ctx.runGeoTrack(comps)}>Measure AI visibility</NeoButton>
          </div>
        </SoftCard>
      )}

      {loading && (
        <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />{ctx.geoStatus||"Scanning AI engines…"}</div></SoftCard>
      )}

      {d && d.error && !loading && (
        <ErrBanner msg={d.error} onRetry={()=>ctx.runGeoTrack(comps)} />
      )}

      {d && !d.error && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* hero share-of-voice */}
          <div className="drow drow--1">
            <SoftCard style={{ alignItems:"center", textAlign:"center" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:17, fontWeight:700 }}>Share of AI Voice</h3>
              <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:8 }}>% of prompts that cite your site</div>
              <Gauge value={d.shareOfVoice} size={168} sw={17} center={<><span style={{ fontSize:46, fontWeight:800, color:tealForScore(d.shareOfVoice), lineHeight:1 }}>{d.shareOfVoice}</span><span style={{ fontSize:12, color:"var(--muted)", fontWeight:600, marginTop:4 }}>%</span></>} />
              <Chip tone={d.promptsCited>0?"teal":"clay"} size="sm" icon="globe" style={{ marginTop:12 }}>{d.promptsCited}/{d.promptsTotal} prompts cited</Chip>
              {d.delta && d.previous && (
                <div style={{ marginTop:10, fontSize:12.5, fontWeight:700, color: d.delta.shareOfVoice>0?"var(--t-700)":d.delta.shareOfVoice<0?"var(--clay)":"var(--muted)" }}>
                  {d.delta.shareOfVoice>0?("▲ +"+d.delta.shareOfVoice):d.delta.shareOfVoice<0?("▼ "+d.delta.shareOfVoice):"no change"} pts vs last scan
                  {d.delta.promptsCited?(" · "+(d.delta.promptsCited>0?"+":"")+d.delta.promptsCited+" cited"):""}
                </div>
              )}
            </SoftCard>
            <SoftCard tone="dark">
              <SectionHead light sub="Who AI cites for your buyer-intent queries">Competitive Share</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:9, marginTop:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:12, background:"rgba(141,194,186,.16)" }}>
                  <Glyph color={s.favicon} char={s.glyph} size={28} r={9} />
                  <span style={{ flex:1, fontSize:13.5, fontWeight:700, color:"#F3EFE4" }}>{d.targetDomain} (you)</span>
                  <span style={{ fontSize:15, fontWeight:800, color:"#F3EFE4" }}>{d.shareOfVoice}%</span>
                </div>
                {(d.competitors||[]).map((c,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:12, background:"rgba(243,239,228,.05)" }}>
                    <div style={{ width:28, height:28, borderRadius:9, background:"rgba(243,239,228,.12)", color:"#F3EFE4", display:"grid", placeItems:"center", fontSize:13, fontWeight:700 }}>{(c.domain||"?")[0].toUpperCase()}</div>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:"rgba(243,239,228,.85)", fontFamily:"var(--mono)" }}>{c.domain}</span>
                    <span style={{ fontSize:14, fontWeight:800, color:"rgba(243,239,228,.7)" }}>{c.share}%</span>
                  </div>
                ))}
                {(!d.competitors||d.competitors.length===0) && <div style={{ fontSize:12.5, color:"rgba(243,239,228,.6)", padding:"4px 2px" }}>Add competitors above to benchmark.</div>}
              </div>
            </SoftCard>
            <SoftCard>
              <SectionHead sub="What the scan revealed">Insight</SectionHead>
              <div style={{ fontSize:13.5, color:"var(--ink-2)", lineHeight:1.6 }}>
                {d.shareOfVoice===0 ? <>AI assistants are <b style={{color:"var(--clay)"}}>not yet citing {s.name}</b> for these queries. Use the <b>Generate llms.txt + AI robots</b> action and strengthen citable answers + Organization schema, then re-scan.</> :
                 d.shareOfVoice<40 ? <>AI cites {s.name} for <b>{d.shareOfVoice}%</b> of queries — a foothold. Target the uncited prompts below with clearer answers and statistics.</> :
                 <>Strong AI visibility — <b style={{color:"var(--t-700)"}}>{d.shareOfVoice}%</b> citation share. Keep content fresh to defend it.</>}
              </div>
            </SoftCard>
          </div>

          {/* opportunities — the new queries we want to show up for */}
          {opportunities.length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub="Fresh queries where AI isn’t citing you yet — target these next (each scan surfaces new ones)" right={<NeoButton kind="soft" size="sm" icon={pushingOpps?undefined:"grid"} disabled={pushingOpps} onClick={pushAirtableOpps}>{pushingOpps&&<Icon name="cog" size={13} className="audit-spin" />}Push to Airtable</NeoButton>}>Opportunities — show up for these</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {opportunities.map((r,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:11, padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)" }}>
                    <Chip tone={r.intent==="commercial"?"gold":r.intent==="comparison"?"plum":"gray"} size="sm">{r.intent}</Chip>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:600 }}>{r.prompt}</div>
                      {r.citedDomains && r.citedDomains.length>0 && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>AI currently cites: {r.citedDomains.slice(0,4).join(", ")}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </SoftCard>
          )}

          {/* scan history — track progress (up/down) over time */}
          {Array.isArray(geoHist) && geoHist.length>1 && (
            <SoftCard hover={false}>
              <SectionHead sub="Share of AI voice across your recent scans — newest first">Scan history</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {geoHist.slice(0,8).map((h,i)=>{
                  const prev=geoHist[i+1]; const dlt=prev?Math.round((h.shareOfVoice||0)-(prev.shareOfVoice||0)):null;
                  let when="—"; try{ if(h.at) when=new Date(h.at).toLocaleDateString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){}
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <span style={{ fontSize:12, color:"var(--muted)", minWidth:124 }}>{when}</span>
                      <div style={{ flex:1, height:8, borderRadius:99, background:"var(--bg-2)", overflow:"hidden" }}><div style={{ width:Math.max(2,Math.min(100,Number(h.shareOfVoice)||0))+"%", height:"100%", background:"var(--t-700)" }} /></div>
                      <span style={{ fontSize:13.5, fontWeight:800, minWidth:42, textAlign:"right" }}>{h.shareOfVoice}%</span>
                      <span style={{ fontSize:11.5, color:"var(--muted)", minWidth:60, textAlign:"right" }}>{h.promptsCited}/{h.promptsTotal}</span>
                      <span style={{ fontSize:12, fontWeight:700, minWidth:40, textAlign:"right", color: dlt>0?"var(--t-700)":dlt<0?"var(--clay)":"var(--faint)" }}>{dlt===null?"":dlt>0?("▲"+dlt):dlt<0?("▼"+Math.abs(dlt)):"–"}</span>
                    </div>
                  );
                })}
              </div>
            </SoftCard>
          )}

          {/* citation trend — AI share-of-voice time-series (Supabase-backed) */}
          {citTrend && (
            <SoftCard hover={false}>
              <SectionHead sub="AI-citation share-of-voice tracked over time, per scan">Citation trend</SectionHead>
              {citTrend.notProvisioned ? (
                <div style={{ display:"flex", alignItems:"flex-start", gap:11, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)" }}>
                  <Icon name="globe" size={16} style={{ color:"var(--gold)", marginTop:1, flexShrink:0 }} />
                  <div style={{ fontSize:13, color:"var(--ink-2)", lineHeight:1.55 }}>Run <code style={{ fontFamily:"var(--mono)", fontSize:12.5 }}>supabase/citation-snapshots.sql</code> in Supabase to start tracking AI-citation share-of-voice over time.</div>
                </div>
              ) : citTrend.error ? (
                <div style={{ fontSize:13, color:"var(--muted)", padding:"4px 2px" }}>Couldn’t load the citation trend right now.</div>
              ) : (citTrend.count||0) < 2 ? (
                <div style={{ fontSize:13.5, color:"var(--muted)", padding:"6px 2px", lineHeight:1.55 }}>Only {citTrend.count||0} snapshot{(citTrend.count||0)===1?"":"s"} so far — run citation tracking a few times to see the trend.</div>
              ) : (() => {
                const dir = citTrend.direction;
                const latest = citTrend.latest||{};
                const dlt = Number(citTrend.deltaSov)||0;
                const dirTone = dir==="improving"?"teal":dir==="declining"?"clay":"gray";
                const dirIcon = dir==="improving"?"▲":dir==="declining"?"▼":"–";
                const pts = (citTrend.points||[]).slice(-12);
                const maxSov = Math.max(1, ...pts.map(p=>Number(p.sov)||0));
                const pp = latest.per_platform && typeof latest.per_platform==="object" ? Object.keys(latest.per_platform) : [];
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {/* latest SoV + direction */}
                    <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                        <span style={{ fontSize:34, fontWeight:800, color:tealForScore(Number(latest.sov)||0), lineHeight:1 }}>{Number(latest.sov)||0}</span>
                        <span style={{ fontSize:13, color:"var(--muted)", fontWeight:700 }}>% SoV</span>
                      </div>
                      <Chip tone={dirTone} size="sm">{dirIcon} {dir}</Chip>
                      <span style={{ fontSize:12.5, fontWeight:700, color: dlt>0?"var(--t-700)":dlt<0?"var(--clay)":"var(--muted)" }}>
                        {dlt>0?("+"+dlt):dlt<0?String(dlt):"0"} pts vs previous
                      </span>
                    </div>
                    {/* inline sparkline of the last points */}
                    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:54, padding:"0 2px" }}>
                      {pts.map((p,i)=>{
                        const v=Number(p.sov)||0; const h=Math.max(3,Math.round((v/maxSov)*52));
                        let when=""; try{ if(p.at) when=new Date(p.at).toLocaleDateString(undefined,{day:"numeric",month:"short"})+" · "+v+"%"; }catch(e){}
                        const isLast=i===pts.length-1;
                        return <div key={i} title={when} style={{ flex:1, minWidth:4, height:h, borderRadius:4, background:isLast?"var(--t-700)":"var(--t-100)" }} />;
                      })}
                    </div>
                    {/* per-platform breakdown of the latest snapshot */}
                    {pp.length>0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {pp.map((eng,i)=>{
                          const v=latest.per_platform[eng]||{}; const sov=Number(v.sov);
                          return <Chip key={i} tone={v.cited?"teal":"gray"} size="sm" icon={v.cited?"check":"x"}>{eng}{Number.isFinite(sov)?" · "+sov+"%":""}</Chip>;
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </SoftCard>
          )}

          {/* per-prompt results */}
          <SoftCard hover={false}>
            <SectionHead sub="Each buyer-intent query and whether AI cited you" right={<NeoButton kind="soft" size="sm" icon={pushing?undefined:"grid"} disabled={pushing} onClick={pushAirtable}>{pushing&&<Icon name="cog" size={13} className="audit-spin" />}Push to Airtable</NeoButton>}>Prompt Results</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {(d.results||[]).map((r,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ width:30, height:30, borderRadius:9, background:r.targetCited?"var(--t-100)":r.brandMentioned?"var(--gold-bg)":"var(--bg-2)", color:r.targetCited?"var(--t-700)":r.brandMentioned?"var(--gold)":"var(--faint)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={r.targetCited?"check":r.brandMentioned?"eye":"x"} size={15} sw={2.4} /></div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:600 }}>{r.prompt}</div>
                    <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>
                      {r.error ? <span style={{color:"var(--clay)"}}>error: {r.error}</span> : r.targetCited ? "Cited ✓" : r.brandMentioned ? "Mentioned, not cited" : "Not cited"}
                      {r.citedDomains && r.citedDomains.length>0 && <span> · AI cited: {r.citedDomains.slice(0,4).join(", ")}</span>}
                    </div>
                  </div>
                  <Chip tone={r.intent==="commercial"?"gold":r.intent==="comparison"?"plum":"gray"} size="sm">{r.intent}</Chip>
                </div>
              ))}
            </div>
          </SoftCard>
        </div>
      )}

      {/* Local Pack readiness — Local SEO: NAP-driven readiness score + LocalBusiness schema */}
      <SoftCard hover={false} style={{ marginTop:18 }}>
        <SectionHead sub="Score a page for Google's local 3-pack & generate LocalBusiness schema" right={<Chip tone="teal" size="sm" icon="globe">Local SEO</Chip>}>Local Pack readiness</SectionHead>
        <LocalPackPanel ctx={ctx} />
      </SoftCard>

      {/* DataForSEO section */}
      <SoftCard hover={false} style={{ marginTop:18 }}>
        <SectionHead sub="Real keyword, competitor & backlink data" right={<Chip tone="gold" size="sm" icon="bolt">DataForSEO</Chip>}>Search Data</SectionHead>
        <SemrushPanel ctx={ctx} />
      </SoftCard>
    </div>
  );
}

/* ---------------- Local Pack readiness panel (AI Visibility / Local SEO) ----------------
   Two one-click actions on the site's NAP (parsed from geo_context / homepage):
   • Check readiness — fetch a live page, score it 0-100 against the 6 Google-local checks
     (NAP present, LocalBusiness schema, clickable tel:, postcode) with a ✓/✗ list.
   • Generate LocalBusiness schema — build the [WebPage, LegalService] JSON-LD @graph,
     show validation + the parsed NAP, then "Apply to site" (write-armed gated server-side).
   Mirrors the AEO answer-block schema flow + DriftPanel layout; reuses existing atoms. */
function LocalPackPanel({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const copy = (text,label)=>{ try{ navigator.clipboard.writeText(text); ctx.toast((label||"Copied")+" ✓","teal"); }catch(e){ ctx.toast("Select & copy manually","gold"); } };
  const [url,setUrl] = useState((s._rawUrl||s.url||"").replace(/\/$/,"")+"/");
  const [readyBusy,setReadyBusy] = useState(false);
  const [ready,setReady] = useState(null);     // { score, checks:[{id,label,ok}], nap } | { error }
  const [schemaBusy,setSchemaBusy] = useState(false);
  const [schema,setSchema] = useState(null);   // { graph, validation, nap } | { error }
  const [applying,setApplying] = useState(false);
  const [applied,setApplied] = useState(false);
  useEffect(()=>{ setReady(null); setSchema(null); setApplied(false); setUrl((s._rawUrl||s.url||"").replace(/\/$/,"")+"/"); },[s.id]);

  const checkReadiness = ()=>{
    const u=(url||"").trim();
    if(!u){ ctx.toast("Enter a page URL to check","gold"); return; }
    setReadyBusy(true);
    API.localReadiness(s.id, u).then(r=>{
      if(r.error){ setReady({ error:r.error }); ctx.toast("Local readiness: "+r.error,"clay"); return; }
      setReady(r);
    }).catch(e=>{ setReady({ error:e.message }); ctx.toast(e.message,"clay"); }).finally(()=>setReadyBusy(false));
  };
  const genSchema = ()=>{
    setSchemaBusy(true); setApplied(false);
    API.localSchema(s.id).then(r=>{
      if(r.error){ setSchema({ error:r.error }); ctx.toast("LocalBusiness schema: "+r.error,"clay"); return; }
      setSchema({ graph:r.graph, validation:r.validation, nap:r.nap });
    }).catch(e=>{ setSchema({ error:e.message }); ctx.toast(e.message,"clay"); }).finally(()=>setSchemaBusy(false));
  };
  const applySchema = ()=>{
    setApplying(true);
    API.applyLocalSchema(s.id, { url:(url||"").trim()||undefined }).then(r=>{
      if(r.error){ ctx.toast("Apply LocalBusiness schema: "+r.error,"clay"); return; }
      if(r.status==="blocked"){ ctx.toast(r.reason||"Site is read-only — arm writes in Settings first","gold"); return; }
      setApplied(true);
      ctx.toast("LocalBusiness schema applied to the live page ✓","teal");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setApplying(false));
  };

  // Compact NAP renderer — shared by the readiness + schema results. Skips blank fields.
  const napRows = (nap)=>{
    if(!nap) return null;
    const lines = [
      ["Business", nap.businessName],
      ["Legal entity", nap.legalEntity],
      ["Address", [nap.streetAddress, nap.locality, nap.region, nap.postalCode, nap.country].filter(Boolean).join(", ")],
      ["Phone", nap.telephone],
      ["Email", nap.email],
    ].filter(r=>r[1]);
    if(!lines.length) return <div style={{ fontSize:12, color:"var(--muted)" }}>No NAP found — add the firm's name, address & phone to its geo_context or homepage.</div>;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        {lines.map(([k,v],i)=>(
          <div key={i} style={{ display:"flex", gap:10, fontSize:12.5, alignItems:"baseline" }}>
            <span style={{ width:88, flexShrink:0, fontSize:10.5, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4 }}>{k}</span>
            <span style={{ color:"var(--ink)", wordBreak:"break-word" }}>{v}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontSize:13.5, fontWeight:700 }}>Local Pack readiness — show up in the Google local 3-pack</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Scores the page against the signals Google &amp; AI use for local results (NAP consistency, <code>LocalBusiness</code> schema, a clickable <code>tel:</code> link, postcode) and generates the matching <code>LegalService</code> JSON-LD from the firm's NAP.</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!readyBusy) checkReadiness(); }} placeholder="https://your-firm.com/contact"
          style={{ flex:1, minWidth:220, padding:"11px 14px", fontSize:13.5, fontFamily:"var(--mono)", border:"none", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", color:"var(--ink)" }} />
        <NeoButton kind="primary" icon={readyBusy?undefined:"gauge"} disabled={readyBusy} onClick={checkReadiness}>{readyBusy&&<Icon name="cog" size={16} className="audit-spin" />}{readyBusy?"Checking…":"Check readiness"}</NeoButton>
        <NeoButton kind="soft" icon={schemaBusy?undefined:"layers"} disabled={schemaBusy} onClick={genSchema}>{schemaBusy&&<Icon name="cog" size={16} className="audit-spin" />}Generate LocalBusiness schema</NeoButton>
      </div>

      {/* readiness result */}
      {ready && ready.error && (
        <div style={{ fontSize:12.5, color:"var(--clay)", padding:"6px 2px", marginBottom:12 }}>{ready.error}</div>
      )}
      {ready && !ready.error && (
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", flexWrap:"wrap", padding:"14px 16px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:14 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, minWidth:78 }}>
            <span style={{ fontSize:38, fontWeight:800, color:tealForScore(ready.score), lineHeight:1 }}>{ready.score}</span>
            <span style={{ fontSize:11, color:"var(--muted)", fontWeight:600, marginTop:3 }}>/ 100</span>
          </div>
          <div style={{ flex:1, minWidth:200, display:"flex", flexDirection:"column", gap:6 }}>
            {(ready.checks||[]).map((c,i)=>(
              <div key={c.id||i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:12.5 }}>
                <span style={{ width:18, height:18, borderRadius:6, flexShrink:0, display:"grid", placeItems:"center", background:c.ok?"var(--t-100)":"var(--clay-bg)", color:c.ok?"var(--t-700)":"var(--clay)" }}><Icon name={c.ok?"check":"x"} size={12} sw={2.6} /></span>
                <span style={{ color:c.ok?"var(--ink)":"var(--muted)" }}>{c.label}</span>
              </div>
            ))}
          </div>
          {ready.nap && (
            <div style={{ flex:1, minWidth:200, borderLeft:"1px solid var(--line)", paddingLeft:14 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4, marginBottom:7 }}>Parsed NAP</div>
              {napRows(ready.nap)}
            </div>
          )}
        </div>
      )}

      {/* generated schema */}
      {schema && schema.error && (
        <div style={{ fontSize:12.5, color:"var(--clay)", padding:"6px 2px" }}>{schema.error}</div>
      )}
      {schema && !schema.error && (()=>{ const v=schema.validation||{}; return (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {v.ok
              ? <Chip tone="teal" size="sm" icon="check">Valid LocalBusiness graph</Chip>
              : <Chip tone="clay" size="sm" icon="alert">{(v.errors&&v.errors.length)||0} error{((v.errors&&v.errors.length)||0)===1?"":"s"}</Chip>}
            {(v.warnings&&v.warnings.length>0) && <Chip tone="gold" size="sm" icon="alert">{v.warnings.length} warning{v.warnings.length===1?"":"s"}</Chip>}
            {applied && <Chip tone="teal" size="sm" icon="check">applied live</Chip>}
            <div style={{ marginLeft:"auto", display:"flex", gap:9 }}>
              <NeoButton kind="soft" size="sm" icon="doc" onClick={()=>copy(JSON.stringify(schema.graph,null,2),"JSON-LD copied")}>Copy</NeoButton>
              <NeoButton kind="primary" size="sm" icon={applying?undefined:"upload"} disabled={applying} onClick={applySchema}>{applying&&<Icon name="cog" size={13} className="audit-spin" />}Apply to site</NeoButton>
            </div>
          </div>
          {(v.errors&&v.errors.length>0) && <div style={{ fontSize:12, color:"var(--clay)" }}>{v.errors.join(" · ")}</div>}
          {(v.warnings&&v.warnings.length>0) && <div style={{ fontSize:11.5, color:"var(--gold)" }}>{v.warnings.join(" · ")}</div>}
          {schema.nap && (
            <div style={{ padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4, marginBottom:7 }}>Parsed NAP</div>
              {napRows(schema.nap)}
            </div>
          )}
          <pre className="scroll" style={{ margin:0, padding:"12px 14px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontSize:11, fontFamily:"var(--mono)", color:"var(--ink)", overflowX:"auto", maxHeight:300, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{JSON.stringify(schema.graph,null,2)}</pre>
        </div>
      ); })()}

      {!ready && !schema && !readyBusy && !schemaBusy && <div style={{ padding:"6px 2px", fontSize:13, color:"var(--muted)" }}>Check a page's local readiness, or generate &amp; apply the LocalBusiness schema built from this firm's NAP.</div>}
    </div>
  );
}

/* DataForSEO data panel — loads a domain snapshot; shows a needs-key state cleanly. */
function SemrushPanel({ ctx }) {
  const s = ctx.site;
  const [data,setData]=useState(null), [loading,setLoading]=useState(false), [needsKey,setNeedsKey]=useState(false);
  const domain=(s._rawUrl||s.url||"").replace(/^https?:\/\//,"").replace(/\/$/,"");
  const load=()=>{
    if(!window.SentinelAPI||!window.SENTINEL_LIVE){ ctx.toast("Connect a live site first","gold"); return; }
    setLoading(true); setNeedsKey(false);
    window.SentinelAPI.semrushSnapshot(s.id, domain, (s.semrush_db)||"uk").then(r=>{
      if(r.needsKey){ setNeedsKey(true); return; }
      setData(r);
    }).catch(e=>ctx.toast("DataForSEO: "+e.message,"clay")).finally(()=>setLoading(false));
  };
  if(needsKey) return (
    <div style={{ display:"flex", gap:12, padding:"14px 16px", background:"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)", alignItems:"center" }}>
      <Icon name="lock" size={18} style={{ color:"var(--gold)" }} />
      <div style={{ flex:1, fontSize:13, color:"#7E5A14", lineHeight:1.5 }}>Add your <b>DataForSEO API credentials</b> (DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD from app.dataforseo.com/api-access) to pull live keyword, competitor & backlink data. The integration is wired and ready.</div>
    </div>
  );
  if(!data) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
      <span style={{ fontSize:13, color:"var(--muted)" }}>Pull live search-performance data for {domain}.</span>
      <NeoButton kind="soft" size="sm" icon={loading?undefined:"bolt"} disabled={loading} onClick={load}>{loading&&<Icon name="cog" size={15} className="audit-spin" />}{loading?"Loading…":"Load search data"}</NeoButton>
    </div>
  );
  const ov=data.overview||{};
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
        {[["Organic traffic",ov.organicTraffic||"—"],["Keywords",ov.organicKeywords||"—"],["Auth. rank",ov.rank||"—"]].map(([l,v])=>(
          <Well key={l} pad={14} style={{ textAlign:"center" }}><div style={{ fontSize:18, fontWeight:800 }}>{typeof v==="string"?v:Number(v).toLocaleString()}</div><div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{l}</div></Well>
        ))}
      </div>
      {(data.topKeywords||[]).length>0 && (
        <div>
          <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", color:"var(--muted)", margin:"0 2px 8px" }}>Top ranking keywords</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {(data.topKeywords||[]).slice(0,8).map((k,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"8px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                <span style={{ width:34, height:24, borderRadius:7, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center", fontSize:12, fontWeight:800, flexShrink:0 }}>#{k.position}</span>
                <span style={{ flex:1, fontSize:13, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{k.keyword}</span>
                <span style={{ fontSize:12, color:"var(--muted)" }}>{Number(k.volume).toLocaleString()} vol</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Drift panel (Audits / Search Console area) ----------------
   Diffs a live page against its stored baseline and surfaces SEO/meta/structure
   regressions, colour-coded by severity. Baseline history needs the
   supabase/drift-baselines.sql migration — degrades to an amber notice until then. */
function DriftPanel({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const [url,setUrl] = useState((s._rawUrl||s.url||"").replace(/\/$/,"")+"/");
  const [busy,setBusy] = useState(false);
  const [res,setRes] = useState(null);
  useEffect(()=>{ setRes(null); setUrl((s._rawUrl||s.url||"").replace(/\/$/,"")+"/"); },[s.id]);
  const run = (updateBaseline)=>{
    const u=(url||"").trim();
    if(!u){ ctx.toast("Enter a page URL to check","gold"); return; }
    setBusy(true);
    API.driftCheck(s.id, u, !!updateBaseline).then(r=>{
      setRes(r);
      if(r && r.error && !r.notProvisioned) ctx.toast("Drift: "+r.error,"clay");
      else if(r && r.rebaselined) ctx.toast("Baseline updated for this page ✓","teal");
      else if(r && r.baselineSet) ctx.toast("Baseline captured ✓","teal");
    }).catch(e=>{ setRes({ error:e.message }); ctx.toast(e.message,"clay"); }).finally(()=>setBusy(false));
  };
  const SEV = { critical:"clay", warning:"gold", info:"gray" };
  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontSize:13.5, fontWeight:700 }}>Drift — catch silent SEO regressions</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Snapshots a page (title, meta, canonical, robots, headings, schema, word count) and diffs it against a saved baseline — so a CMS edit that drops your title or adds <code>noindex</code> doesn't slip through.</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!busy) run(false); }} placeholder="https://your-site.com/page-to-check"
          style={{ flex:1, minWidth:220, padding:"11px 14px", fontSize:13.5, fontFamily:"var(--mono)", border:"none", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", color:"var(--ink)" }} />
        <NeoButton kind="primary" icon={busy?undefined:"radar"} disabled={busy} onClick={()=>run(false)}>{busy&&<Icon name="cog" size={16} className="audit-spin" />}{busy?"Checking…":"Check drift"}</NeoButton>
      </div>

      {res && res.notProvisioned && (
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--gold-bg)", boxShadow:"var(--neo-in)", borderLeft:"3px solid var(--gold)" }}>
          <Icon name="alert" size={16} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12.5, color:"var(--ink)", lineHeight:1.5 }}>Drift history isn't provisioned yet. Run <b>supabase/drift-baselines.sql</b> in the Supabase SQL editor to enable baseline tracking.{res.error?<div style={{ color:"var(--muted)", marginTop:4 }}>{res.error}</div>:null}</div>
        </div>
      )}

      {res && res.error && !res.notProvisioned && (
        <div style={{ fontSize:12.5, color:"var(--clay)", padding:"6px 2px" }}>{res.error}</div>
      )}

      {res && res.baselineSet && (
        <div style={{ display:"flex", alignItems:"center", gap:9, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--t-50)", boxShadow:"var(--neo-in)", borderLeft:"3px solid var(--t-500)" }}>
          <Icon name="check" size={16} style={{ color:"var(--t-600)", flexShrink:0 }} />
          <div style={{ fontSize:12.5, color:"var(--ink)" }}>Baseline captured ✓ — re-check later to detect drift against this snapshot.</div>
        </div>
      )}

      {res && res.drift && (()=>{
        const d=res.drift, sev=d.severity||"none", changes=d.changes||[];
        const tone = sev==="critical"?"clay":sev==="warning"?"gold":sev==="info"?"gray":"teal";
        return (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:2 }}>
              {sev==="none" || changes.length===0
                ? <Chip tone="teal" size="sm" icon="check">No drift — page matches baseline</Chip>
                : <Chip tone={tone} size="sm" icon="alert">{sev} · {changes.length} change{changes.length===1?"":"s"}</Chip>}
              {res.baselineAt && <span style={{ fontSize:11.5, color:"var(--muted)" }}>baseline {new Date(res.baselineAt).toLocaleString()}</span>}
              <NeoButton kind="soft" size="sm" icon="refresh" style={{ marginLeft:"auto" }} disabled={busy} onClick={()=>run(true)}>Set new baseline</NeoButton>
            </div>
            {changes.map((c,i)=>{
              const ct=SEV[c.severity]||"gray", col=TT[ct][0];
              return (
                <div key={i} style={{ padding:"10px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", borderLeft:"3px solid "+col }}>
                  <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
                    <Chip tone={ct} size="sm">{c.severity}</Chip>
                    <span style={{ fontSize:12.5, fontWeight:700 }}>{c.field}</span>
                    {c.rule && <span style={{ fontSize:11, color:"var(--faint)", fontFamily:"var(--mono)" }}>{c.rule}</span>}
                  </div>
                  <div style={{ display:"flex", gap:14, marginTop:7, fontSize:12, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:160 }}><span style={{ fontSize:10.5, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4 }}>Before</span><div style={{ color:"var(--muted)", marginTop:2, wordBreak:"break-word" }}>{fmtDriftVal(c.before)}</div></div>
                    <div style={{ flex:1, minWidth:160 }}><span style={{ fontSize:10.5, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4 }}>After</span><div style={{ color:"var(--ink)", marginTop:2, wordBreak:"break-word" }}>{fmtDriftVal(c.after)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {!res && !busy && <div style={{ padding:"6px 2px", fontSize:13, color:"var(--muted)" }}>Enter a URL and check — the first run for a page captures a baseline; later runs diff against it and flag what changed.</div>}
    </div>
  );
}
function fmtDriftVal(v){
  if(v==null) return "—";
  if(Array.isArray(v)) return v.length?v.join(", "):"—";
  if(typeof v==="boolean") return v?"true":"false";
  const s=String(v); return s.length?s:"—";
}

/* ---------------- IndexNow panel (near Search Console indexing) ----------------
   Deterministic key + publish instruction, then submit URLs to IndexNow (Bing/Yandex/
   Naver/Seznam). 403 → keyMissing notice (key file not yet served). */
function IndexNowPanel({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const [keyInfo,setKeyInfo] = useState(null);
  const [keyBusy,setKeyBusy] = useState(false);
  const [urls,setUrls] = useState("");
  const [subBusy,setSubBusy] = useState(false);
  useEffect(()=>{ setKeyInfo(null); setUrls(""); },[s.id]);
  const getKey = ()=>{
    setKeyBusy(true);
    API.indexnowKey(s.id).then(r=>{
      if(r.error){ ctx.toast("IndexNow: "+r.error,"clay"); return; }
      setKeyInfo(r);
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setKeyBusy(false));
  };
  const copy = (text,label)=>{ try{ navigator.clipboard.writeText(text); ctx.toast((label||"Copied")+" ✓","teal"); }catch(e){ ctx.toast("Select & copy manually","gold"); } };
  const submit = ()=>{
    if(!keyInfo||!keyInfo.key){ ctx.toast("Get a key first","gold"); return; }
    const list=(urls||"").split(/\s+/).map(u=>u.trim()).filter(Boolean);
    if(!list.length){ ctx.toast("Paste at least one URL","gold"); return; }
    setSubBusy(true);
    API.indexnowSubmit(s.id, keyInfo.key, list).then(r=>{
      if(r.error){ ctx.toast("IndexNow: "+r.error,"clay"); return; }
      if(r.keyMissing){ ctx.toast("Key file not found at "+(keyInfo.publishAt||"the publish URL")+" — publish it first","gold"); return; }
      if(r.ok){ ctx.toast((r.submitted!=null?r.submitted:list.length)+" URL(s) submitted to IndexNow ✓","teal"); return; }
      ctx.toast("IndexNow: "+(r.reason||("status "+(r.status||"?"))),"gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setSubBusy(false));
  };
  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontSize:13.5, fontWeight:700 }}>IndexNow — instant index across Bing, Yandex &amp; more</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Generate a verification key, publish it once at your site root, then ping IndexNow whenever a page changes — no Search Console required.</div>
        </div>
        <NeoButton kind="soft" size="sm" icon={keyBusy?undefined:"lock"} disabled={keyBusy} onClick={getKey}>{keyBusy&&<Icon name="cog" size={15} className="audit-spin" />}{keyBusy?"Generating…":(keyInfo?"Regenerate key":"Get key")}</NeoButton>
      </div>

      {keyInfo && (
        <div style={{ padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"var(--faint)", textTransform:"uppercase", letterSpacing:.4 }}>Key</span>
            <code style={{ flex:1, minWidth:160, fontSize:12.5, fontFamily:"var(--mono)", color:"var(--ink)", wordBreak:"break-all" }}>{keyInfo.key}</code>
            <NeoButton kind="ghost" size="sm" icon="doc" onClick={()=>copy(keyInfo.key,"Key copied")}>Copy</NeoButton>
          </div>
          <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--line-soft)" }}>
            <div style={{ fontSize:12, color:"var(--ink)", lineHeight:1.5 }}>Serve a file containing the key at:</div>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:6, flexWrap:"wrap" }}>
              <code style={{ flex:1, minWidth:160, fontSize:12, fontFamily:"var(--mono)", color:"var(--t-700)", wordBreak:"break-all" }}>{keyInfo.publishAt}</code>
              <NeoButton kind="ghost" size="sm" icon="doc" onClick={()=>copy(keyInfo.publishAt,"URL copied")}>Copy URL</NeoButton>
              {keyInfo.keyFile!=null && <NeoButton kind="ghost" size="sm" icon="doc" onClick={()=>copy(keyInfo.keyFile,"File contents copied")}>Copy file</NeoButton>}
            </div>
            <div style={{ fontSize:11, color:"var(--faint)", marginTop:6 }}>The file's body must be exactly the key text shown above. Once it's live, submit URLs below.</div>
          </div>
        </div>
      )}

      <textarea value={urls} onChange={e=>setUrls(e.target.value)} placeholder={"https://your-site.com/page-a\nhttps://your-site.com/page-b"} rows={4}
        style={{ width:"100%", boxSizing:"border-box", padding:"11px 14px", fontSize:12.5, fontFamily:"var(--mono)", lineHeight:1.6, border:"none", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", color:"var(--ink)", resize:"vertical" }} />
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:10, flexWrap:"wrap" }}>
        <span style={{ fontSize:11.5, color:"var(--muted)" }}>One URL per line — only URLs on this site's host are submitted.</span>
        <NeoButton kind="primary" size="sm" icon={subBusy?undefined:"upload"} disabled={subBusy||!keyInfo} style={{ marginLeft:"auto" }} onClick={submit}>{subBusy&&<Icon name="cog" size={15} className="audit-spin" />}{subBusy?"Submitting…":"Submit to IndexNow"}</NeoButton>
      </div>
    </div>
  );
}

/* ---------------- Google Search Console screen ---------------- */
/* First-party ground truth: clicks, impressions, CTR, position by query/page.
   Connect via service-account JSON → pick property → real GSC analytics. */
function GscScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [status,setStatus] = useState(null);
  const [props,setProps] = useState([]);
  const [saText,setSaText] = useState("");
  const [busy,setBusy] = useState("");
  const [data,setData] = useState(null);
  const [err,setErr] = useState(null);
  const [tab,setTab] = useState("queries");
  useEffect(()=>{ if(ctx.navTab && ["queries","pages","striking","steal","decay","anomalies","indexing"].includes(ctx.navTab)) setTab(ctx.navTab); },[ctx.navTab]);
  const [saEmail,setSaEmail] = useState(null);
  const [advanced,setAdvanced] = useState(false);   // show service-account paste
  const [propMenu,setPropMenu] = useState(false);   // header property switcher
  const [pushingQw,setPushingQw] = useState("");    // quick-win query being pushed to the Article Writer
  // Push a quick-win (page-2) query into the Article Writer table to create content for it.
  const pushQuickWin = (q)=>{
    const kw=String((q&&q.query)||"").trim(); if(!kw) return;
    setPushingQw(kw);
    API.airtablePushKeywords(ctx.site.id, [kw]).then(r=>{
      if(r&&r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      const pushed=(r&&r.pushed!=null)?r.pushed:0;
      ctx.toast(pushed>0?("Pushed “"+kw.slice(0,38)+"” → Article Writer ✓ — set Status to “Write Article” to generate"):"Already in the Article Writer", pushed>0?"teal":"gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setPushingQw(""));
  };
  const [propsLoading,setPropsLoading] = useState(false);
  const [decay,setDecay] = useState(null);
  const [decayBusy,setDecayBusy] = useState(false);
  const [briefFor,setBriefFor] = useState(null);
  const [anom,setAnom] = useState(null);
  const [anomBusy,setAnomBusy] = useState(false);
  const [idxHealth,setIdxHealth] = useState(null);
  const [drops,setDrops] = useState(null);
  const [idxBusy,setIdxBusy] = useState("");
  // Snippet Steal (AEO) — quick wins, question queries & rising impressions from GSC,
  // each with a one-click Claude "answer block" generator (preview only).
  const [steal,setSteal] = useState(null);
  const [stealBusy,setStealBusy] = useState(false);
  const [answerFor,setAnswerFor] = useState(null);  // { query, loading?|block?|error? }
  const [blockSchema,setBlockSchema] = useState(null);  // { query, loading?|applying?, graph?|validation?|error?, applied? }
  const autoPickedRef = useRef(new Set());   // sites we've already auto-mapped this session

  useEffect(()=>{ setData(null); setProps([]); setSaText(""); setErr(null); setDecay(null); setAnom(null); setIdxHealth(null); setDrops(null); setPropMenu(false); if(live) API.gscStatus(s.id).then(setStatus).catch(()=>{}); },[s.id]);
  const runIndexHealth = ()=>{ setIdxBusy("health"); setErr(null); API.gscIndexHealth(s.id).then(r=>{ if(r.error){setErr({msg:r.error,needsConnect:r.needsConnect});return;} setIdxHealth(r); }).catch(e=>setErr({msg:e.message})).finally(()=>setIdxBusy("")); };
  const runRankDrops = ()=>{ setIdxBusy("drops"); setErr(null); API.gscRankingDrops(s.id).then(r=>{ if(r.error){setErr({msg:r.error});return;} setDrops(r); }).catch(e=>setErr({msg:e.message})).finally(()=>setIdxBusy("")); };
  const submitIndex = ()=>{ setIdxBusy("submit"); API.gscSubmitUrls(s.id).then(r=>{ if(r.error){ctx.toast("Indexing: "+r.error,"clay");return;} ctx.toast(r.succeeded+"/"+r.submitted+" URLs submitted to Google for indexing","teal"); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setIdxBusy("")); };
  const loadAnom = ()=>{
    setAnomBusy(true); setErr(null);
    API.gscAnomalies(s.id, 90).then(r=>{ if(r.error){ setErr({ msg:r.error, needsConnect:r.needsConnect, needsProperty:r.needsProperty }); return; } setAnom(r); }).catch(e=>setErr({ msg:e.message })).finally(()=>setAnomBusy(false));
  };
  const loadSteal = ()=>{
    setStealBusy(true); setErr(null);
    API.gscSnippetSteal(s.id).then(r=>{ if(r.error){ setErr({ msg:r.error, noAccess:r.noAccess, needsConnect:r.needsConnect, needsProperty:r.needsProperty }); return; } setSteal(r); }).catch(e=>setErr({ msg:e.message })).finally(()=>setStealBusy(false));
  };
  // One-click: generate a featured-snippet "answer block" for a query (Claude, preview only).
  const genAnswer = (row)=>{
    setBlockSchema(null);   // stale to the previous block
    setAnswerFor({ query:row.query, loading:true });
    API.aeoAnswerBlock(s.id, row.page||"", row.query).then(r=>{
      if(r.error){ setAnswerFor({ query:row.query, error:r.error }); ctx.toast("Answer block: "+r.error,"clay"); return; }
      setAnswerFor({ query:row.query, block:r });
    }).catch(e=>{ setAnswerFor({ query:row.query, error:e.message }); ctx.toast(e.message,"clay"); });
  };
  // Build the JSON-LD @graph for the active answer block (preview), then optionally write it live.
  const genBlockSchema = (row, block)=>{
    setBlockSchema({ query:row.query, loading:true });
    API.aeoBlockSchema(s.id, row.page||"", block).then(r=>{
      if(r.error){ setBlockSchema({ query:row.query, error:r.error }); ctx.toast("Schema: "+r.error,"clay"); return; }
      setBlockSchema({ query:row.query, graph:r.graph, validation:r.validation });
    }).catch(e=>{ setBlockSchema({ query:row.query, error:e.message }); ctx.toast(e.message,"clay"); });
  };
  const applyBlockSchema = (row, block)=>{
    setBlockSchema(f=>({ ...(f||{ query:row.query }), applying:true }));
    API.aeoApplyBlockSchema(s.id, row.page||"", block).then(r=>{
      if(r.error){ ctx.toast("Apply schema: "+r.error,"clay"); setBlockSchema(f=>({ ...(f||{}), applying:false })); return; }
      if(r.status==="blocked"){ ctx.toast(r.reason||"Site is read-only — arm writes first","gold"); setBlockSchema(f=>({ ...(f||{}), applying:false })); return; }
      setBlockSchema(f=>({ ...(f||{ query:row.query }), applying:false, applied:true, validation:r.validation||(f&&f.validation) }));
      ctx.toast("Answer-block schema applied to the live page ✓","teal");
    }).catch(e=>{ ctx.toast(e.message,"clay"); setBlockSchema(f=>({ ...(f||{}), applying:false })); });
  };
  const loadDecay = ()=>{
    setDecayBusy(true); setErr(null);
    API.contentDecay(s.id, 28).then(r=>{ if(r.error){ setErr({ msg:r.error }); return; } setDecay(r); }).catch(e=>setErr({ msg:e.message })).finally(()=>setDecayBusy(false));
  };
  const genBrief = (pg)=>{
    setBriefFor({ page:pg.page, loading:true });
    API.contentDecayBrief(pg).then(r=>setBriefFor({ page:pg.page, brief:r.brief })).catch(e=>setBriefFor({ page:pg.page, brief:"⚠️ "+e.message }));
  };
  // One-click content refresh: write a grounded freshness block live + re-index.
  const [refreshFor,setRefreshFor] = useState(null);  // { page, loading?, result? }
  const [refreshAll,setRefreshAll] = useState(null);  // { done, total } while bulk-running
  const doRefresh = async (d)=>{
    setRefreshFor({ page:d.page, loading:true, step:"content" });
    let r;
    try{ r = await API.contentRefresh(s.id, d, true); }
    catch(e){ setRefreshFor({ page:d.page, result:{ error:e.message } }); ctx.toast(e.message,"clay"); return {error:e.message}; }
    // Then optimise THAT page's images (best-effort) — "update + optimise" in one action.
    let img=null;
    if(r.status==="applied" || r.status==="manual"){
      setRefreshFor({ page:d.page, loading:true, step:"images", result:r });
      try{ img = await API.pageOptimizeImages(s.id, d, true); }catch(e){ img={ error:e.message }; }
    }
    const merged = Object.assign({}, r, { images:img });
    setRefreshFor({ page:d.page, result:merged });
    const imgN = (img && img.uploaded) || 0, imgKB = (img && img.savedKB) || 0;
    if(r.status==="applied") ctx.toast("Refreshed live"+(imgN?(" · "+imgN+" image(s) optimised ("+(imgKB/1024).toFixed(1)+" MB)"):"")+(r.indexed&&r.indexed.ok?" · re-indexed":"")+" ✓","teal");
    else if(r.status==="blocked") ctx.toast("This site is read-only — arm writes first","gold");
    else if(r.status==="manual") ctx.toast("Content needs pasting (page-builder)"+(imgN?(" · "+imgN+" image(s) optimised"):""),"gold");
    else if(r.status==="thin") ctx.toast(r.reason||"Skipped — not enough article content for a meaningful refresh","gold");
    else if(r.error) ctx.toast(r.error,"clay");
    return merged;
  };
  const undoRefresh = (d)=>{
    API.contentRefreshUndo(s.id, d).then(r=>{ ctx.toast(r.status==="removed"?"Refresh removed from the page":(r.reason||"Nothing to undo"),"teal"); setRefreshFor(null); }).catch(e=>ctx.toast(e.message,"clay"));
  };
  // Full REWRITE of a decaying page: preview the Claude-rewritten content (review), then publish to the live post.
  const [rewriteFor,setRewriteFor] = useState(null);  // { page, loading?|applying?, preview?|manual?|applied?|error? }
  const [rwFeedback,setRwFeedback] = useState("");    // free-text "change this" for the regenerate loop
  const doRewrite = (d, feedback)=>{
    // When regenerating from feedback, carry the current draft so the model REVISES it.
    const priorDraft = (feedback && rewriteFor && rewriteFor.page===d.page && rewriteFor.preview && rewriteFor.preview.newHtml) || null;
    setRewriteFor({ page:d.page, loading:true, feedbackApplied: feedback||null });
    const handle=(r)=>{
      if(!r||r.error){ setRewriteFor({ page:d.page, error:(r&&r.error)||"Rewrite failed" }); ctx.toast("Rewrite: "+((r&&r.error)||"failed"),"clay"); return; }
      if(r.status==="manual"){ setRewriteFor({ page:d.page, manual:r }); ctx.toast(r.reason||"Edit this page in your builder","gold"); return; }
      setRewriteFor({ page:d.page, preview:r });
    };
    // Generation runs in the BACKGROUND (long pages exceed the ~100s gateway cap) → poll.
    API.contentRewrite(s.id, d, { start:true, feedback: feedback||undefined, priorDraft: priorDraft||undefined }).then(r=>{
      if(r&&r.error){ handle(r); return; }
      const postId = r && r.postId;
      if(!postId){ handle(r); return; }
      let tries=0;
      const poll=()=>{
        API.contentRewriteStatus(s.id, postId).then(st=>{
          if(st && st.status==="running"){ if(++tries>110){ setRewriteFor({ page:d.page, error:"Rewrite timed out — try again." }); return; } setTimeout(poll,4000); return; }
          if(st && st.status==="unknown"){ setRewriteFor({ page:d.page, error: st.reason||"Rewrite job was lost (server restart) — run it again." }); return; }
          handle(st);
        }).catch(e=>{ if(++tries>110){ setRewriteFor({ page:d.page, error:e.message }); return; } setTimeout(poll,4000); });
      };
      setTimeout(poll,3000);
    }).catch(e=>{ setRewriteFor({ page:d.page, error:e.message }); ctx.toast(e.message,"clay"); });
  };
  const applyRewrite = (d)=>{
    const prev = rewriteFor && rewriteFor.preview; if(!prev) return;
    setRewriteFor(f=>({ ...(f||{}), applying:true }));
    API.contentRewrite(s.id, d, { html:prev.newHtml, brief:prev.brief, apply:true }).then(r=>{
      if(r.error){ ctx.toast("Apply: "+r.error,"clay"); setRewriteFor(f=>({ ...(f||{}), applying:false })); return; }
      if(r.status==="blocked"){ ctx.toast(r.reason||"Site is read-only — arm writes first","gold"); setRewriteFor(f=>({ ...(f||{}), applying:false })); return; }
      // Builder page (Elementor/Divi…): NOT applied — overwriting content would break the layout.
      if(r.status==="manual-builder"){ setRewriteFor(f=>({ ...(f||{}), applying:false, builderBlocked:r })); ctx.toast(("Not pushed — this is a "+(r.builder||"page-builder")+" page. Copy the rewrite into the builder instead."),"gold"); return; }
      setRewriteFor({ page:d.page, applied:r });
      ctx.toast("Rewrote & refreshed the live page"+(r.indexed&&r.indexed.ok?" · re-indexed":"")+" ✓","teal");
    }).catch(e=>{ ctx.toast(e.message,"clay"); setRewriteFor(f=>({ ...(f||{}), applying:false })); });
  };
  // Undo a bad auto-apply: restore the page's previous WordPress revision.
  const [restoreBusy,setRestoreBusy] = useState("");
  const doRestore = (d)=>{
    if(!(typeof window!=="undefined" && window.confirm && window.confirm("Restore the previous version of this page?\n\n"+d.page+"\n\nThis reverts the page content to the WordPress revision saved before the last change (fixes a layout an auto-rewrite broke)."))) return;
    setRestoreBusy(d.page);
    API.contentRestore(d, s.id, {}).then(r=>{
      if(r&&r.error){ ctx.toast("Restore: "+r.error,"clay"); return; }
      if(r&&r.status==="blocked"){ ctx.toast(r.reason||"Site is read-only — arm writes first","gold"); return; }
      if(r&&r.status==="restored"){ ctx.toast("Restored the previous version ✓ — reload the page to confirm the layout","teal"); }
      else ctx.toast("Nothing to restore.","gold");
    }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setRestoreBusy(""));
  };
  const copyText = (txt)=>{ try{ (navigator.clipboard&&navigator.clipboard.writeText(txt)); ctx.toast("Copied — paste into the Elementor text widget","teal"); }catch(e){ ctx.toast("Copy failed — select the text and copy manually","gold"); } };
  // Safe Elementor push: swap ONLY the article-body text widget's content (backup + undo), layout intact.
  const applyElementor = (d)=>{
    const bb = rewriteFor && rewriteFor.builderBlocked; if(!bb || !bb.newHtml) return;
    setRewriteFor(f=>({ ...(f||{}), applyingEl:true }));
    API.contentApplyElementor(d, s.id, bb.newHtml, {}).then(r=>{
      if(r&&r.error){ ctx.toast("Elementor push: "+r.error,"clay"); setRewriteFor(f=>({ ...(f||{}), applyingEl:false })); return; }
      if(r&&(r.status==="not-elementor"||r.status==="no-widget"||r.status==="blocked")){ ctx.toast(r.reason||"Couldn't push — copy the text into Elementor manually","gold"); setRewriteFor(f=>({ ...(f||{}), applyingEl:false })); return; }
      setRewriteFor({ page:d.page, applied:Object.assign({ elementor:true }, r) });
      ctx.toast("Pushed into Elementor — layout preserved ✓"+(r.indexed&&r.indexed.ok?" · re-indexed":""),"teal");
    }).catch(e=>{ ctx.toast(e.message,"clay"); setRewriteFor(f=>({ ...(f||{}), applyingEl:false })); });
  };
  const doRefreshAll = async ()=>{
    const pages=(decay&&decay.pages)||[]; if(!pages.length) return;
    let applied=0,manual=0,blocked=0,imgs=0,skipped=0;
    for(let i=0;i<pages.length;i++){
      setRefreshAll({ done:i, total:pages.length });
      try{
        const r=await API.contentRefresh(s.id, pages[i], true);
        if(r.status==="applied")applied++; else if(r.status==="manual")manual++; else if(r.status==="thin")skipped++; else if(r.status==="blocked"){blocked++;continue;}
        if(r.status==="applied"||r.status==="manual"){ try{ const im=await API.pageOptimizeImages(s.id, pages[i], true); imgs+=(im&&im.uploaded)||0; }catch(e){} }
      }catch(e){}
    }
    setRefreshAll(null);
    if(blocked) ctx.toast("Site is read-only — arm writes for it, then retry","gold");
    else ctx.toast(applied+" refreshed & re-indexed"+(imgs?(" · "+imgs+" image(s) optimised"):"")+(manual?(" · "+manual+" need pasting (page-builder)"):"")+(skipped?(" · "+skipped+" skipped (too thin)"):"")+" ✓","teal");
  };

  const connect = ()=>{
    if(!saText.trim()){ ctx.toast("Paste the service-account JSON key","gold"); return; }
    setBusy("connect"); setErr(null);
    API.gscConnect(s.id, saText.trim()).then(r=>{
      if(r.error){ setErr({ msg:r.error }); return; }
      setProps(r.properties||[]); setSaEmail(r.serviceAccountEmail); setSaText("");
      ctx.toast("Connected — "+(r.properties||[]).length+" propertie(s) found","teal");
    }).catch(e=>setErr({ msg:e.message })).finally(()=>setBusy(""));
  };
  // One-click "Connect with Google": open the OAuth consent in a popup, then
  // load the account's properties when it reports success via postMessage.
  const connectGoogle = ()=>{
    const w=520,h=640, left=window.screenX+(window.outerWidth-w)/2, top=window.screenY+(window.outerHeight-h)/2;
    window.open(API.gscOAuthStartUrl(s.id), "gsc-oauth", "width="+w+",height="+h+",left="+left+",top="+top);
    const onMsg=(e)=>{
      if(!e.data||e.data.type!=="gsc-oauth") return;
      window.removeEventListener("message", onMsg);
      if(e.data.ok){
        ctx.toast("Google connected — loading your properties…","teal");
        setStatus(st=>Object.assign({},st,{connected:true,method:"oauth"}));
        API.gscProperties(s.id).then(r=>{ if(r.error){ setErr({ msg:r.error }); return; } setProps(r.properties||[]); }).catch(e=>setErr({ msg:e.message }));
      } else { ctx.toast("Google connection failed — please try again","clay"); }
    };
    window.addEventListener("message", onMsg);
  };
  const pickProperty = (p)=>{
    API.gscSetProperty(s.id, p).then(()=>{ setStatus(st=>Object.assign({},st,{connected:true,property:p})); setPropMenu(false); loadData(p); }).catch(e=>setErr({ msg:e.message }));
  };
  // Load every property the connected account can see (for the switcher dropdown).
  const loadProperties = ()=>{
    setPropsLoading(true); setErr(null);
    API.gscProperties(s.id).then(r=>{ if(r.error){ setErr({ msg:r.error, needsConnect:r.needsConnect }); return; } setProps(r.properties||[]); }).catch(e=>setErr({ msg:e.message })).finally(()=>setPropsLoading(false));
  };
  const togglePropMenu = ()=>{ setPropMenu(m=>{ const open=!m; if(open && !props.length) loadProperties(); return open; }); };
  const loadData = (prop)=>{
    setBusy("load"); setErr(null); setData(null);
    API.gscSnapshot(s.id, 28).then(r=>{
      if(r.error){ setErr({ msg:r.error, noAccess:r.noAccess, needsConnect:r.needsConnect, needsProperty:r.needsProperty }); return; }
      setData(r);
    }).catch(e=>setErr({ msg:e.message })).finally(()=>setBusy(""));
  };

  const connected = status && status.connected;
  const hasProp = status && status.property;
  const fmt=(v)=> v==null?"—":Number(v).toLocaleString();
  const pct=(v)=> v==null?"—":(v*100).toFixed(1)+"%";
  const posTone=(p)=> p<=3?"teal":p<=10?"gold":"gray";
  // Match GSC properties to the active site's domain so the right one floats up.
  const cleanProp=(u)=>(u||"").replace(/^sc-domain:/,"").replace(/^https?:\/\//,"").replace(/\/$/,"");
  const siteDomain=((s&&(s._rawUrl||s.url))||"").replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"");
  const isMatch=(u)=>{ const c=cleanProp(u).replace(/^www\./,""); return siteDomain && (c===siteDomain || c.endsWith("."+siteDomain) || siteDomain.endsWith("."+c) || c.includes(siteDomain)); };
  const sortedProps=[...props].sort((a,b)=>(isMatch(b.url)?1:0)-(isMatch(a.url)?1:0));

  // Once connected (globally), fetch the property list up front so the switcher
  // is instant and we can auto-map.
  useEffect(()=>{ if(live && status && status.connected && !props.length && !propsLoading) loadProperties(); },[status, live]);
  // Auto-map each site to the GSC property matching its domain (once per site).
  // Covers the "every site uses the same Google account" model: switch site →
  // its own property is selected automatically, even if none/the wrong one was set.
  useEffect(()=>{
    if(!live || !status || !status.connected || !props.length) return;
    if(autoPickedRef.current.has(s.id)) return;
    autoPickedRef.current.add(s.id);
    const m = sortedProps.find(p=>isMatch(p.url));
    if(m && status.property!==m.url) pickProperty(m.url);
  },[props, status]);

  return (
    <div className="rise">
      <PageHead title="Search Console" sub="First-party Google data — real clicks, impressions, CTR & position.">
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {/* Property switcher — this account may own many properties; pick the
              one to map to the active site. Always available once connected. */}
          {connected && (
            <div style={{ position:"relative" }}>
              <button onClick={togglePropMenu} className="neo-btn tip" data-tip="Switch Search Console property"
                style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 13px", borderRadius:10, background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontWeight:700, color:"var(--ink)", maxWidth:280 }}>
                <Icon name={hasProp?"check":"globe"} size={15} style={{ color:"var(--t-700)", flexShrink:0 }} />
                <span style={{ fontFamily:"var(--mono)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{hasProp?cleanProp(status.property):"Select property"}</span>
                <Icon name="chevD" size={14} style={{ color:"var(--muted)", flexShrink:0 }} />
              </button>
              {propMenu && (<>
                <div onClick={()=>setPropMenu(false)} style={{ position:"fixed", inset:0, zIndex:55 }} />
                <div className="scroll" style={{ position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:60, width:330, maxHeight:380, overflowY:"auto", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo)", border:"1px solid var(--line-soft)", padding:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px 7px" }}>
                    <span style={{ flex:1, fontSize:10.5, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.5 }}>Properties{status&&status.email?(" · "+status.email):""}</span>
                    <button onClick={loadProperties} className="neo-btn tip" data-tip="Reload" style={{ width:24, height:24, borderRadius:7, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="trend" size={12} /></button>
                  </div>
                  {propsLoading && <div style={{ padding:"10px 8px", color:"var(--muted)", fontSize:12.5, display:"flex", gap:8, alignItems:"center" }}><Icon name="cog" size={14} className="audit-spin" />Loading properties…</div>}
                  {!propsLoading && !props.length && <div style={{ padding:"10px 8px", color:"var(--muted)", fontSize:12.5 }}>No properties found for this account.</div>}
                  {!propsLoading && sortedProps.map((p,i)=>{
                    const cur = hasProp && status.property===p.url; const match = isMatch(p.url);
                    return (
                      <button key={i} onClick={()=>pickProperty(p.url)} className="neo-btn" style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 10px", borderRadius:9, background:cur?"var(--t-100)":"transparent", boxShadow:cur?"var(--neo-in)":"none", textAlign:"left", marginBottom:2 }}>
                        <Icon name={cur?"check":"globe"} size={14} style={{ color:cur?"var(--t-700)":"var(--muted)", flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:12.5, fontWeight:600, fontFamily:"var(--mono)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cleanProp(p.url)}</span>
                        {match && !cur && <Chip tone="teal" size="sm">match</Chip>}
                        {p.permission && <Chip tone="gray" size="sm">{p.permission}</Chip>}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </div>
          )}
          {data && <NeoButton kind="soft" size="sm" icon="trend" onClick={()=>loadData()}>Refresh</NeoButton>}
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site first.</div></SoftCard>}

      {live && err && <div style={{ marginBottom:16 }}>
        <ErrBanner msg={err.msg} noUnits={false} onRetry={()=>setErr(null)} />
        {(err.needsConnect || /revoked|expired|reconnect|token|connection/i.test(err.msg||"")) && (
          <div style={{ marginTop:9, display:"flex", alignItems:"center", gap:11, flexWrap:"wrap" }}>
            <NeoButton kind="primary" size="sm" icon="search" onClick={connectGoogle}>Reconnect with Google</NeoButton>
            <span style={{ fontSize:12, color:"var(--muted)" }}>One reconnect re-links <b>all</b> your sites (each keeps its own property).</span>
          </div>
        )}
      </div>}

      {/* CONNECT step */}
      {live && !connected && (
        <SoftCard hover={false}>
          <SectionHead sub="Sign in with the Google account that owns this property — no setup required">Connect Google Search Console</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Primary: one-click Google sign-in */}
            {(!status || status.oauthAvailable!==false) ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"22px 16px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
                <div style={{ fontSize:13.5, color:"var(--t-800)", textAlign:"center", lineHeight:1.5, maxWidth:380 }}>
                  Click below, choose your Google account, and approve access. We only request read access to your Search Console data.
                </div>
                <button onClick={connectGoogle} className="neo-btn" style={{ display:"inline-flex", alignItems:"center", gap:11, padding:"12px 20px", borderRadius:12, background:"#fff", boxShadow:"var(--neo-sm)", fontSize:14.5, fontWeight:700, color:"#3c4043" }}>
                  <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Connect with Google
                </button>
                {status && status.oauthAvailable===undefined && <div style={{ fontSize:11, color:"var(--muted)" }} />}
              </div>
            ) : (
              <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
                <Icon name="alert" size={18} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />
                <div style={{ fontSize:12.5, color:"var(--ink-2)", lineHeight:1.55 }}>One-click Google sign-in isn't enabled on this server yet (no OAuth client configured). Use the service-account method below, or ask your admin to set <code>GOOGLE_OAUTH_CLIENT_ID</code>/<code>SECRET</code>.</div>
              </div>
            )}

            {/* Advanced: service-account JSON (power users / unattended multi-site) */}
            <button onClick={()=>setAdvanced(a=>!a)} className="neo-btn" style={{ alignSelf:"flex-start", display:"inline-flex", alignItems:"center", gap:7, padding:"7px 12px", borderRadius:9, background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, fontWeight:600, color:"var(--muted)" }}>
              <Icon name={advanced?"chevD":"chevR"} size={13} /> Advanced: connect with a service-account key
            </button>
            {advanced && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
                  <Icon name="shield" size={18} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} />
                  <div style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.55 }}>
                    In Google Cloud Console → create a <b>Service Account</b> → enable the <b>Search Console API</b> → create a <b>JSON key</b>. Then in Search Console → <b>Settings → Users → Add user</b> → add the service-account email (ends in <code>.gserviceaccount.com</code>). Paste the JSON key below.
                  </div>
                </div>
                <textarea value={saText} onChange={e=>setSaText(e.target.value)} placeholder='Paste the full service-account JSON key here: { "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "..." }'
                  rows={5} className="search-in" style={{ width:"100%", resize:"vertical", padding:"12px 14px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <NeoButton kind="primary" icon={busy==="connect"?undefined:"link"} disabled={busy==="connect"} onClick={connect}>{busy==="connect"&&<Icon name="cog" size={16} className="audit-spin" />}Connect</NeoButton>
                </div>
              </div>
            )}
          </div>
        </SoftCard>
      )}

      {/* PICK PROPERTY (right after connecting, before a property is chosen) */}
      {live && props.length>0 && !hasProp && (
        <SoftCard hover={false} style={{ marginTop:16 }}>
          <SectionHead sub={(status&&status.email)?("Connected as "+status.email+" — choose the property for "+(s&&s.name||"this site")):(saEmail?("Connected as "+saEmail):"Choose the property to track")}>Select a property</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sortedProps.map((p,i)=>{
              const match=isMatch(p.url);
              return (
                <button key={i} className="neo-btn nav-item" onClick={()=>pickProperty(p.url)} style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", textAlign:"left" }}>
                  <Icon name="globe" size={16} style={{ color:"var(--t-700)" }} />
                  <span style={{ flex:1, fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>{cleanProp(p.url)}</span>
                  {match && <Chip tone="teal" size="sm" icon="check">matches {s&&s.name}</Chip>}
                  <Chip tone="gray" size="sm">{p.permission}</Chip>
                </button>
              );
            })}
          </div>
        </SoftCard>
      )}

      {/* CONNECTED but no data yet */}
      {live && connected && hasProp && !data && !busy && !err && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"30px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--t-50)", color:"var(--t-700)", display:"grid", placeItems:"center" }}><Icon name="search" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>Load Search Console data</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:420 }}>Real clicks, impressions, CTR & average position for the trailing 28 days, plus striking-distance queries.</div>
            <NeoButton kind="primary" icon="search" onClick={()=>loadData()}>Load GSC data</NeoButton>
          </div>
        </SoftCard>
      )}

      {busy==="load" && <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:14, display:"flex", alignItems:"center", gap:11 }}><Icon name="cog" size={18} className="audit-spin" />Pulling Search Console data…</div></SoftCard>}

      {/* DATA */}
      {data && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            <PatternCard icon="thumb" tone="teal" value={fmt(data.totals.clicks)} title="Clicks" sub="trailing 28 days" />
            <PatternCard icon="eye" tone="plum" value={fmt(data.totals.impressions)} title="Impressions" sub="trailing 28 days" />
            <PatternCard icon="trend" tone="gold" value={pct(data.totals.ctr)} title="Avg. CTR" sub="clicks ÷ impressions" />
            <PatternCard icon="flag" tone="gray" value={data.totals.avgPosition?data.totals.avgPosition.toFixed(1):"—"} title="Avg. position" sub="lower is better" />
          </div>

          <SoftCard hover={false}>
            <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", width:"fit-content", marginBottom:16 }}>
              {[["queries","Top Queries"],["pages","Top Pages"],["striking","Quick Wins (11–20)"],["steal","Snippet Steal"],["decay","Content Decay"],["anomalies","Anomalies"],["indexing","Indexing & Drops"]].map(([v,l])=>(
                <button key={v} onClick={()=>setTab(v)} style={{ padding:"8px 15px", fontSize:12.5, fontWeight:700, borderRadius:99, background:tab===v?"var(--surface)":"transparent", color:tab===v?"var(--t-700)":"var(--muted)", boxShadow:tab===v?"var(--neo-sm)":"none" }}>{l}</button>
              ))}
            </div>
            {tab==="queries" && (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <div style={{ display:"flex", padding:"0 12px 6px", fontSize:10.5, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", color:"var(--faint)" }}><span style={{ flex:1 }}>Query</span><span style={{ width:70, textAlign:"right" }}>Clicks</span><span style={{ width:80, textAlign:"right" }}>Impr.</span><span style={{ width:60, textAlign:"right" }}>CTR</span><span style={{ width:50, textAlign:"right" }}>Pos</span></div>
                {(data.topQueries||[]).slice(0,25).map((q,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", padding:"8px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{q.query}</span>
                    <span style={{ width:70, textAlign:"right", fontWeight:700 }}>{fmt(q.clicks)}</span>
                    <span style={{ width:80, textAlign:"right", color:"var(--muted)" }}>{fmt(q.impressions)}</span>
                    <span style={{ width:60, textAlign:"right", color:"var(--muted)", fontSize:12 }}>{pct(q.ctr)}</span>
                    <span style={{ width:50, textAlign:"right" }}><span style={{ fontSize:12, fontWeight:800, color:TT[posTone(q.position)][0] }}>{q.position.toFixed(1)}</span></span>
                  </div>
                ))}
              </div>
            )}
            {tab==="pages" && (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {(data.topPages||[]).slice(0,25).map((p,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", padding:"8px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <a href={p.page} target="_blank" style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"var(--ink)", textDecoration:"none" }}>{p.page.replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                    <span style={{ width:70, textAlign:"right", fontWeight:700 }}>{fmt(p.clicks)}</span>
                    <span style={{ width:80, textAlign:"right", color:"var(--muted)" }}>{fmt(p.impressions)}</span>
                    <span style={{ width:60, textAlign:"right", color:"var(--muted)", fontSize:12 }}>{pct(p.ctr)}</span>
                  </div>
                ))}
              </div>
            )}
            {tab==="striking" && (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:6 }}>Queries ranking positions 11–20 (page 2), by impressions — your highest-opportunity quick wins, from real Google data.</div>
                {(data.striking||[]).map((q,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <span style={{ width:46 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:22, borderRadius:7, background:"var(--gold-bg)", color:"var(--gold)", fontSize:12, fontWeight:800 }}>{q.position}</span></span>
                    <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{q.query}</span>
                    <span style={{ width:90, textAlign:"right", color:"var(--muted)" }}>{fmt(q.impressions)} impr.</span>
                    <NeoButton kind="soft" size="sm" icon={pushingQw===q.query?undefined:"upload"} disabled={pushingQw===q.query} onClick={()=>pushQuickWin(q)} title="Push this quick-win query to the Article Writer (create content)">{pushingQw===q.query&&<Icon name="cog" size={13} className="audit-spin" />}{pushingQw===q.query?"Pushing…":"Create content"}</NeoButton>
                  </div>
                ))}
                {(data.striking||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No page-2 queries in this window.</div>}
              </div>
            )}
            {tab==="steal" && (()=>{
              // Shared row renderer: query · position/impressions · "Generate answer block".
              // Below the row, the active query shows its Claude answer-block preview.
              const Row = (row, i, extra)=>{
                const active = answerFor && answerFor.query===row.query;
                return (
                  <div key={i} style={{ padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13 }}>
                      {row.position!=null && <span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:22, borderRadius:7, background:"var(--gold-bg)", color:"var(--gold)", fontSize:12, fontWeight:800, flexShrink:0 }}>{Number(row.position).toFixed(1)}</span>}
                      <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{row.query}</span>
                      <span style={{ width:90, textAlign:"right", color:"var(--muted)", flexShrink:0 }}>{extra}</span>
                      <NeoButton kind="soft" size="sm" icon={(active&&answerFor.loading)?undefined:"sparkles"} disabled={active&&answerFor.loading} onClick={()=>genAnswer(row)}>{active&&answerFor.loading&&<Icon name="cog" size={14} className="audit-spin" />}{active&&answerFor.loading?"Writing…":"Generate answer block"}</NeoButton>
                    </div>
                    {active && (answerFor.error||answerFor.block) && (
                      <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", borderLeft:"3px solid "+(answerFor.error?"var(--clay)":"var(--t-500)") }}>
                        {answerFor.error && <div style={{ fontSize:12.5, color:"var(--clay)" }}>{answerFor.error}</div>}
                        {answerFor.block && (()=>{ const b=answerFor.block; return (<>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, fontWeight:800 }}>{b.heading}</span>
                            {b.format && <Chip tone="gray" size="sm">{b.format}</Chip>}
                            <NeoButton kind="ghost" size="sm" icon="copy" style={{ marginLeft:"auto" }} onClick={()=>{ try{ navigator.clipboard.writeText(b.html||b.answer||""); ctx.toast("Answer block copied — paste it high on the page","teal"); }catch(e){ ctx.toast("Select & copy the block below","gold"); } }}>Copy</NeoButton>
                            <NeoButton kind="soft" size="sm" icon={(blockSchema&&blockSchema.query===row.query&&blockSchema.loading)?undefined:"doc"} disabled={blockSchema&&blockSchema.query===row.query&&blockSchema.loading} onClick={()=>genBlockSchema(row,b)} title="Build the JSON-LD @graph (FAQPage / QAPage) for this answer block">{blockSchema&&blockSchema.query===row.query&&blockSchema.loading&&<Icon name="cog" size={14} className="audit-spin" />}{blockSchema&&blockSchema.query===row.query&&blockSchema.loading?"Building…":"Schema"}</NeoButton>
                            <NeoButton kind="primary" size="sm" icon={(blockSchema&&blockSchema.query===row.query&&blockSchema.applying)?undefined:"check"} disabled={blockSchema&&blockSchema.query===row.query&&blockSchema.applying} onClick={()=>applyBlockSchema(row,b)} title="Write this answer block's schema to the live page (needs writes armed)">{blockSchema&&blockSchema.query===row.query&&blockSchema.applying&&<Icon name="cog" size={14} className="audit-spin" />}{blockSchema&&blockSchema.query===row.query&&blockSchema.applying?"Applying…":"Apply schema"}</NeoButton>
                          </div>
                          {b.answer && <div style={{ fontSize:12.5, color:"var(--ink)", lineHeight:1.5, marginBottom:8 }}>{b.answer}</div>}
                          {b.html && <div className="scroll md" style={{ maxHeight:280, overflow:"auto", fontSize:12.5, lineHeight:1.5, background:"var(--bg)", padding:"10px 13px", borderRadius:8, boxShadow:"var(--neo-in)" }} dangerouslySetInnerHTML={{ __html: b.html }} />}
                          {(b.faq||[]).length>0 && (
                            <div style={{ marginTop:9, display:"flex", flexDirection:"column", gap:6 }}>
                              <div style={{ fontSize:11, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.4 }}>FAQ</div>
                              {(b.faq||[]).map((f,fi)=>(
                                <div key={fi} style={{ padding:"8px 11px", background:"var(--bg)", borderRadius:8, boxShadow:"var(--neo-in)" }}>
                                  <div style={{ fontSize:12.5, fontWeight:700 }}>{f.q}</div>
                                  <div style={{ fontSize:12, color:"var(--ink)", marginTop:2 }}>{f.a}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* JSON-LD @graph for this answer block — preview, validation, and live-apply state. */}
                          {blockSchema && blockSchema.query===row.query && (blockSchema.graph||blockSchema.error||blockSchema.applied) && (()=>{ const v=blockSchema.validation||{}; return (
                            <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--line-soft)" }}>
                              {blockSchema.error && <div style={{ fontSize:12, color:"var(--clay)" }}>{blockSchema.error}</div>}
                              {v.ok!=null && (
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7, flexWrap:"wrap" }}>
                                  <Chip tone={v.ok?"teal":"clay"} size="sm" icon={v.ok?"check":"alert"}>{v.ok?"Valid JSON-LD":((v.errors||[]).length+" error(s)")}</Chip>
                                  {(v.warnings||[]).length>0 && <Chip tone="gold" size="sm">{(v.warnings||[]).length} warning(s)</Chip>}
                                  {blockSchema.applied && <Chip tone="teal" size="sm" icon="check">applied live</Chip>}
                                </div>
                              )}
                              {(v.errors||[]).map((e,ei)=><div key={"e"+ei} style={{ fontSize:11.5, color:"var(--clay)", marginBottom:3 }}>• {e}</div>)}
                              {(v.warnings||[]).map((w,wi)=><div key={"w"+wi} style={{ fontSize:11.5, color:"var(--gold)", marginBottom:3 }}>• {w}</div>)}
                              {blockSchema.graph && <pre className="scroll" style={{ margin:"4px 0 0", padding:"10px 13px", background:"var(--bg)", borderRadius:8, boxShadow:"var(--neo-in)", fontSize:11, fontFamily:"var(--mono)", color:"var(--ink)", overflowX:"auto", maxHeight:260, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{JSON.stringify(blockSchema.graph,null,2)}</pre>}
                            </div>
                          ); })()}
                        </>); })()}
                      </div>
                    )}
                  </div>
                );
              };
              return (
                <div>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>Snippet Steal — win the featured snippet & AI answers</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Queries where you're close, asking a question, or surging in impressions — each with a one-click Claude "answer block" engineered to capture the snippet / AI citation. Preview only; nothing publishes.</div>
                    </div>
                    <NeoButton kind="primary" size="sm" icon={stealBusy?undefined:"radar"} disabled={stealBusy} onClick={loadSteal}>{stealBusy&&<Icon name="cog" size={15} className="audit-spin" />}{stealBusy?"Scanning…":(steal?"Re-scan":"Find opportunities")}</NeoButton>
                  </div>
                  {steal && (
                    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                      {/* Quick Wins (pos 2–10) */}
                      <div>
                        <div style={{ fontSize:12.5, fontWeight:800, color:"var(--ink-2)", marginBottom:7, display:"flex", alignItems:"center", gap:7 }}><Icon name="arrowUp" size={14} style={{ color:"var(--t-700)" }} />Quick Wins · positions 2–10 <Chip tone="teal" size="sm">{(steal.quickWins&&steal.quickWins.count)||0}</Chip></div>
                        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                          {((steal.quickWins&&steal.quickWins.rows)||[]).map((row,i)=>Row(row,"qw"+i, fmt(row.impressions)+" impr."))}
                          {((steal.quickWins&&steal.quickWins.rows)||[]).length===0 && <div style={{ padding:"10px 12px", fontSize:13, color:"var(--muted)" }}>No queries sitting in positions 2–10 right now.</div>}
                        </div>
                      </div>
                      {/* Question queries */}
                      <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                        <div style={{ fontSize:12.5, fontWeight:800, color:"var(--ink-2)", marginBottom:7, display:"flex", alignItems:"center", gap:7 }}><Icon name="search" size={14} style={{ color:"var(--t-700)" }} />Question Queries <Chip tone="gold" size="sm">{(steal.questions&&steal.questions.count)||0}</Chip></div>
                        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                          {((steal.questions&&steal.questions.rows)||[]).map((row,i)=>Row(row,"q"+i, fmt(row.impressions)+" impr."))}
                          {((steal.questions&&steal.questions.rows)||[]).length===0 && <div style={{ padding:"10px 12px", fontSize:13, color:"var(--muted)" }}>No question-style queries detected in this window.</div>}
                        </div>
                      </div>
                      {/* Rising impressions */}
                      <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                        <div style={{ fontSize:12.5, fontWeight:800, color:"var(--ink-2)", marginBottom:7, display:"flex", alignItems:"center", gap:7 }}><Icon name="trend" size={14} style={{ color:"var(--t-700)" }} />Rising Impressions <Chip tone="plum" size="sm">{(steal.rising&&steal.rising.count)||0}</Chip></div>
                        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                          {((steal.rising&&steal.rising.rows)||[]).map((row,i)=>Row(row,"r"+i, "+"+fmt(row.impressionDelta)+" impr."))}
                          {((steal.rising&&steal.rising.rows)||[]).length===0 && <div style={{ padding:"10px 12px", fontSize:13, color:"var(--muted)" }}>No queries with rising impressions vs the prior period.</div>}
                        </div>
                      </div>
                    </div>
                  )}
                  {!steal && !stealBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Click "Find opportunities" to surface near-miss, question and surging queries from real Google data — then generate an answer block to capture each snippet.</div>}
                </div>
              );
            })()}
            {tab==="decay" && (
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>Content decay — pages losing clicks</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Compares the last 28 days vs the prior 28, ranked by absolute clicks lost. High-value declines that need a refresh.</div>
                  </div>
                  <span style={{ display:"inline-flex", gap:8 }}>
                    {decay && (decay.pages||[]).length>0 && (
                      <NeoButton kind="soft" size="sm" icon={refreshAll?undefined:"sparkles"} disabled={!!refreshAll} onClick={doRefreshAll}>{refreshAll&&<Icon name="cog" size={15} className="audit-spin" />}{refreshAll?("Refreshing "+(refreshAll.done+1)+"/"+refreshAll.total+"…"):"Refresh all & optimise"}</NeoButton>
                    )}
                    <NeoButton kind="primary" size="sm" icon={decayBusy?undefined:"trend"} disabled={decayBusy} onClick={loadDecay}>{decayBusy&&<Icon name="cog" size={15} className="audit-spin" />}{decayBusy?"Analyzing…":"Find decaying pages"}</NeoButton>
                  </span>
                </div>
                {decay && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ display:"flex", gap:16, marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700 }}>{decay.count} decaying page(s)</span>
                      <span style={{ fontSize:13, color:"var(--clay)", fontWeight:700 }}>−{fmt(decay.totalClicksLost)} clicks lost</span>
                    </div>
                    {(decay.pages||[]).map((d,i)=>(
                      <div key={i} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
                          <a href={d.page} target="_blank" style={{ flex:1, fontSize:13, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"var(--ink)", textDecoration:"none" }}>{d.page.replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                          {d.stale && <Chip tone="gold" size="sm" icon="clock">{d.ageDays}d old</Chip>}
                          <span style={{ fontSize:13, fontWeight:800, color:"var(--clay)" }}>−{fmt(d.clicksLost)}</span>
                          <span style={{ fontSize:11.5, color:"var(--muted)", width:42, textAlign:"right" }}>−{d.pctDrop}%</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:7, flexWrap:"wrap" }}>
                          <span style={{ fontSize:11.5, color:"var(--muted)" }}>{d.priorClicks}→{d.recentClicks} clicks · pos {d.prevPosition}→{d.position} {d.positionDrift>0?<b style={{color:"var(--clay)"}}>(+{d.positionDrift})</b>:null}</span>
                          <span style={{ marginLeft:"auto", display:"inline-flex", gap:7 }}>
                            <NeoButton kind="primary" size="sm" icon={(rewriteFor&&rewriteFor.page===d.page&&(rewriteFor.loading||rewriteFor.applying))?undefined:"sparkles"} disabled={rewriteFor&&rewriteFor.page===d.page&&(rewriteFor.loading||rewriteFor.applying)} onClick={()=>doRewrite(d)} title="Audits this page's content and refreshes it in place — updates stale info, fills ranking gaps, tightens intent (keeps the article, doesn't rewrite it). You review before it updates the live post.">{rewriteFor&&rewriteFor.page===d.page&&rewriteFor.loading&&<Icon name="cog" size={14} className="audit-spin" />}{rewriteFor&&rewriteFor.page===d.page&&rewriteFor.loading?"Auditing & refreshing…":"Audit & refresh"}</NeoButton>
                            <NeoButton kind="ghost" size="sm" icon="doc" onClick={()=>genBrief(d)}>Brief</NeoButton>
                            <NeoButton kind="soft" size="sm" icon={(refreshFor&&refreshFor.page===d.page&&refreshFor.loading)?undefined:"image"} disabled={refreshFor&&refreshFor.page===d.page&&refreshFor.loading} onClick={()=>doRefresh(d)} title="Lighter touch: optimise this page's images and bump its freshness date + re-index — no content change.">{refreshFor&&refreshFor.page===d.page&&refreshFor.loading&&<Icon name="cog" size={14} className="audit-spin" />}{refreshFor&&refreshFor.page===d.page&&refreshFor.loading?(refreshFor.step==="images"?"Optimising images…":"Refreshing…"):"Images + date"}</NeoButton>
                            <NeoButton kind="ghost" size="sm" disabled={restoreBusy===d.page} onClick={()=>doRestore(d)} title="Undo a bad apply — restore this page's previous WordPress version (fixes a layout an earlier rewrite broke)">{restoreBusy===d.page&&<Icon name="cog" size={13} className="audit-spin" />}Restore</NeoButton>
                          </span>
                        </div>
                        {/* One-click refresh result */}
                        {refreshFor && refreshFor.page===d.page && refreshFor.result && (()=>{ const r=refreshFor.result; const ok=r.status==="applied"; const manual=r.status==="manual"; const blocked=r.status==="blocked"; const failed=r.error||r.status==="silent-failure";
                          return (
                          <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", borderLeft:"3px solid "+(ok?"var(--teal)":blocked?"var(--gold)":failed?"var(--clay)":"var(--gold)") }}>
                            {ok && (<>
                              <div style={{ fontSize:12.5, fontWeight:700, color:"var(--teal)", display:"flex", alignItems:"center", gap:7 }}><Icon name="check" size={14} />{r.quiet?"Freshness date bumped":(r.replaced?"Refresh updated on the live page":"Freshness block added to the live page")}{r.indexed&&r.indexed.ok?" · re-submitted to Google for indexing":""}{r.removedBlock?" · removed an old block":""}</div>
                              {r.quiet && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:4 }}>This is a <b>quiet</b> refresh — it updates the page's last-modified date (a real freshness signal to Google) and asks Google to re-crawl it. The visible content is intentionally unchanged, so the page looks the same. Use <b>Rewrite &amp; refresh</b> if you want the body content actually rewritten.</div>}
                              {r.indexed && r.indexed.skipped && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:4 }}>{r.indexed.reason}</div>}
                              {r.indexed && r.indexed.error && <div style={{ fontSize:11.5, color:"var(--clay)", marginTop:4 }}>{r.indexed.error}</div>}
                              {r.parts && (
                                <div style={{ marginTop:8, padding:"9px 11px", background:"var(--bg)", borderRadius:8, boxShadow:"var(--neo-in)", fontSize:12 }}>
                                  <div style={{ fontWeight:800, marginBottom:3 }}>{r.parts.heading}</div>
                                  {r.parts.intro && <div style={{ color:"var(--ink)", marginBottom:4 }}>{r.parts.intro}</div>}
                                  {(r.parts.points||[]).length>0 && <ul style={{ margin:"2px 0 0 16px", padding:0 }}>{r.parts.points.map((p,j)=><li key={j} style={{ fontSize:11.5, marginBottom:2 }}>{p}</li>)}</ul>}
                                </div>
                              )}
                              {r.images && (r.images.uploaded>0
                                ? <div style={{ fontSize:11.5, color:"var(--t-700)", marginTop:6, display:"flex", alignItems:"center", gap:6 }}><Icon name="image" size={13} />Optimised {r.images.uploaded} image(s) on this page · {(r.images.savedKB/1024).toFixed(1)} MB lighter{r.images.relinked?(" · "+r.images.relinked+" re-linked"):""}</div>
                                : <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:6 }}>{r.images.error?("Images: "+r.images.error):(r.images.note||"Images: already optimised on this page")}</div>)}
                              <div style={{ marginTop:8 }}><NeoButton kind="ghost" size="sm" icon="undo" onClick={()=>undoRefresh(d)}>Undo (remove block)</NeoButton></div>
                            </>)}
                            {blocked && <div style={{ fontSize:12.5, color:"var(--gold)" }}><b>Site is read-only.</b> {r.reason} Arm writes for this site in its settings, then click Refresh again.</div>}
                            {manual && (<>
                              <div style={{ fontSize:12.5, fontWeight:700, color:"var(--gold)", marginBottom:4 }}>Add in editor — here's exactly how</div>
                              <div style={{ fontSize:12, color:"var(--ink)", marginBottom:6 }}>{r.reason}</div>
                              <div style={{ fontSize:11.5, color:"var(--muted)", marginBottom:6 }}><b>How:</b> {r.manualHint}</div>
                              {r.blockHtml && (<>
                                <div style={{ position:"relative" }}>
                                  <pre className="scroll" style={{ maxHeight:140, overflow:"auto", fontSize:11, background:"var(--bg)", padding:"9px 11px", borderRadius:8, boxShadow:"var(--neo-in)", whiteSpace:"pre-wrap", margin:0 }}>{r.blockHtml}</pre>
                                  <NeoButton kind="soft" size="sm" icon="copy" style={{ marginTop:6 }} onClick={()=>{ try{ navigator.clipboard.writeText(r.blockHtml); ctx.toast("Block copied — paste it at the top of the page","teal"); }catch(e){ ctx.toast("Select & copy the block above","gold"); } }}>Copy block</NeoButton>
                                </div>
                              </>)}
                            </>)}
                            {failed && <div style={{ fontSize:12.5, color:"var(--clay)" }}>{r.error||r.reason}</div>}
                          </div>
                          ); })()}
                        {briefFor && briefFor.page===d.page && (
                          <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                            {briefFor.loading ? <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}><Icon name="cog" size={14} className="audit-spin" />Claude is writing a refresh brief…</div>
                              : <div className="md" style={{ fontSize:12.5 }} dangerouslySetInnerHTML={{ __html:(window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(briefFor.brief))||briefFor.brief }} />}
                          </div>
                        )}
                        {rewriteFor && rewriteFor.page===d.page && (rewriteFor.loading||rewriteFor.error||rewriteFor.manual||rewriteFor.applied||rewriteFor.preview||rewriteFor.builderBlocked) && (
                          <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", borderLeft:"3px solid var(--t-500)" }}>
                            {rewriteFor.loading && <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}><Icon name="cog" size={14} className="audit-spin" />Claude is rewriting this page from a fresh brief…</div>}
                            {rewriteFor.error && <div style={{ fontSize:12.5, color:"var(--clay)" }}>{rewriteFor.error}</div>}
                            {rewriteFor.manual && <div style={{ fontSize:12.5, color:"var(--gold)" }}>{rewriteFor.manual.reason}</div>}
                            {rewriteFor.applied && <div style={{ fontSize:12.5, fontWeight:700, color:"var(--teal)", display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}><Icon name="check" size={14} />{rewriteFor.applied.elementor?"Pushed into the Elementor content — layout preserved, previous version backed up":"Rewrote the live page (previous version saved as a WordPress revision)"}{rewriteFor.applied.indexed&&rewriteFor.applied.indexed.ok?" · re-indexed":""}. <a href={d.page} target="_blank" style={{ color:"var(--t-700)" }}>View page →</a></div>}
                            {rewriteFor.builderBlocked && (()=>{ const bb=rewriteFor.builderBlocked; return (<>
                              <div style={{ fontSize:12.5, color:"#7E5A14", fontWeight:700, marginBottom:7, display:"flex", alignItems:"flex-start", gap:6 }}><Icon name="alert" size={14} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} />{bb.reason}</div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                                {bb.canElementorPush && <NeoButton kind="primary" size="sm" icon={rewriteFor.applyingEl?undefined:"sparkles"} disabled={rewriteFor.applyingEl} onClick={()=>applyElementor(d)} title="Swaps ONLY the article text widget inside Elementor — your columns/sidebar stay put; a backup is saved for one-click Restore">{rewriteFor.applyingEl&&<Icon name="cog" size={14} className="audit-spin" />}{rewriteFor.applyingEl?"Pushing…":"Push into Elementor (safe)"}</NeoButton>}
                                <NeoButton kind="soft" size="sm" icon="doc" onClick={()=>copyText(bb.newHtml||"")}>Copy HTML</NeoButton>
                                <NeoButton kind="ghost" size="sm" onClick={()=>setRewriteFor(null)}>Close</NeoButton>
                              </div>
                              <div className="scroll md" style={{ maxHeight:300, overflow:"auto", fontSize:12.5, lineHeight:1.5, background:"var(--bg)", padding:"10px 13px", borderRadius:8, boxShadow:"var(--neo-in)" }} dangerouslySetInnerHTML={{ __html: bb.newHtml }} />
                            </>); })()}
                            {rewriteFor.preview && (<>
                              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7, flexWrap:"wrap" }}>
                                <span style={{ fontSize:12.5, fontWeight:700 }}>Rewrite preview — review before it goes live</span>
                                <Chip tone="gray" size="sm">{rewriteFor.preview.oldWords}→{rewriteFor.preview.newWords} words</Chip>
                                <span style={{ marginLeft:"auto", display:"inline-flex", gap:7 }}>
                                  <NeoButton kind="primary" size="sm" icon={rewriteFor.applying?undefined:"check"} disabled={rewriteFor.applying} onClick={()=>applyRewrite(d)}>{rewriteFor.applying&&<Icon name="cog" size={14} className="audit-spin" />}{rewriteFor.applying?"Publishing…":"Apply to live page"}</NeoButton>
                                  <NeoButton kind="ghost" size="sm" onClick={()=>setRewriteFor(null)}>Discard</NeoButton>
                                </span>
                              </div>
                              <div className="scroll md" style={{ maxHeight:340, overflow:"auto", fontSize:12.5, lineHeight:1.5, background:"var(--bg)", padding:"10px 13px", borderRadius:8, boxShadow:"var(--neo-in)" }} dangerouslySetInnerHTML={{ __html: rewriteFor.preview.newHtml }} />
                              {/* Feedback loop — tell it what to change and regenerate, keeping the rest */}
                              <div style={{ marginTop:10, padding:"11px 13px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                                <div style={{ fontSize:12, fontWeight:700, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}><Icon name="sparkles" size={13} style={{ color:"var(--t-700)" }} />Not right? Tell it what to change</div>
                                <textarea value={rwFeedback} onChange={e=>setRwFeedback(e.target.value)} placeholder="e.g. remove the case-law section, make the intro punchier, add a section on payment terms, drop the pricing paragraph…" rows={2} style={{ width:"100%", resize:"vertical", padding:"9px 11px", borderRadius:8, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, fontFamily:"inherit", color:"var(--ink)", outline:"none" }} />
                                <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
                                  <NeoButton kind="primary" size="sm" icon="sparkles" disabled={!rwFeedback.trim()} onClick={()=>{ const fb=rwFeedback.trim(); setRwFeedback(""); doRewrite(d, fb); }}>Regenerate with my changes</NeoButton>
                                  <span style={{ fontSize:11, color:"var(--muted)" }}>Revises this draft — keeps everything you didn't mention.</span>
                                </div>
                              </div>
                            </>)}
                          </div>
                        )}
                      </div>
                    ))}
                    {(decay.pages||[]).length===0 && <div style={{ padding:"14px", fontSize:13, color:"var(--muted)" }}>No significant content decay detected — your high-value pages are holding or growing. 🎉</div>}
                  </div>
                )}
                {!decay && !decayBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Click "Find decaying pages" to surface high-value pages losing Google traffic — then generate a Claude refresh brief for each.</div>}
              </div>
            )}
            {tab==="anomalies" && (
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>Traffic & ranking anomalies</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Robust outlier scan (modified&nbsp;z&nbsp;≥&nbsp;3.5) on 90 days of daily clicks &amp; average position. Catches Google-update hits or tracking breaks within days — anchored on clicks, not impressions.</div>
                  </div>
                  <NeoButton kind="primary" size="sm" icon={anomBusy?undefined:"radar"} disabled={anomBusy} onClick={loadAnom}>{anomBusy&&<Icon name="cog" size={15} className="audit-spin" />}{anomBusy?"Scanning…":"Scan for anomalies"}</NeoButton>
                </div>
                {anom && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {(anom.events||[]).length===0
                      ? <div style={{ padding:"14px", fontSize:13, color:"var(--muted)" }}>No anomalies in the last 90 days — clicks and positions are moving within normal variation. ✅</div>
                      : <>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{anom.events.length} anomal{anom.events.length===1?"y":"ies"} flagged</div>
                        {anom.events.map((e,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                            <div style={{ width:40, height:40, borderRadius:11, display:"grid", placeItems:"center", flexShrink:0, background:e.severity==="high"?"var(--clay-bg)":"var(--gold-bg)", color:e.severity==="high"?"var(--clay)":"var(--gold)" }}>
                              <Icon name={e.metric==="clicks"?"thumb":"flag"} size={18} />
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{e.note}</div>
                              <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2 }}>{e.date} · {e.metric==="clicks"?"traffic drop":"ranking slip"}</div>
                            </div>
                            <Chip tone={e.severity==="high"?"clay":"gold"} size="sm">z {e.z}</Chip>
                          </div>
                        ))}
                      </>}
                  </div>
                )}
                {!anom && !anomBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Run the scan to detect statistically significant drops in clicks or slips in ranking over the trailing 90 days.</div>}
              </div>
            )}
            {tab==="indexing" && (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                {/* Auto-index */}
                <div>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>Auto-index new content</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Submit your pages to Google's Indexing API programmatically (≈200/day) — past the manual "Request indexing" 10/day limit.</div>
                    </div>
                    <NeoButton kind="primary" size="sm" icon={idxBusy==="submit"?undefined:"upload"} disabled={idxBusy==="submit"} onClick={submitIndex}>{idxBusy==="submit"&&<Icon name="cog" size={15} className="audit-spin" />}{idxBusy==="submit"?"Submitting…":"Submit pages to Google"}</NeoButton>
                  </div>
                  <div style={{ fontSize:11, color:"var(--faint)" }}>Requires the Indexing API enabled + the service account set as an <b>Owner</b> of this property.</div>
                </div>
                {/* De-index health */}
                <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>Index health — what's de-indexed</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Inspects your top pages and flags any Google is NOT indexing.</div>
                    </div>
                    <NeoButton kind="soft" size="sm" icon={idxBusy==="health"?undefined:"search"} disabled={idxBusy==="health"} onClick={runIndexHealth}>{idxBusy==="health"&&<Icon name="cog" size={15} className="audit-spin" />}{idxBusy==="health"?"Checking…":"Check index health"}</NeoButton>
                  </div>
                  {idxHealth && (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      <div style={{ display:"flex", gap:14, marginBottom:6 }}><Chip tone="teal" size="sm">{idxHealth.indexed} indexed</Chip><Chip tone={idxHealth.notIndexed.length?"clay":"gray"} size="sm">{idxHealth.notIndexed.length} not indexed</Chip><span style={{ fontSize:12, color:"var(--muted)" }}>of {idxHealth.checked} checked</span></div>
                      {idxHealth.notIndexed.map((p,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5 }}>
                          <Icon name="alert" size={15} style={{ color:"var(--clay)" }} />
                          <a href={p.url} target="_blank" style={{ flex:1, fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(p.url||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                          <Chip tone="clay" size="sm">{p.coverageState||p.verdict||"not indexed"}</Chip>
                        </div>
                      ))}
                      {idxHealth.notIndexed.length===0 && <div style={{ padding:"10px", fontSize:13, color:"var(--muted)" }}>All checked pages are indexed. ✅</div>}
                    </div>
                  )}
                </div>
                {/* Ranking drops */}
                <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>Ranking drops — refresh candidates</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Queries whose average position has slipped vs the prior period — update these pages first.</div>
                    </div>
                    <NeoButton kind="soft" size="sm" icon={idxBusy==="drops"?undefined:"trend"} disabled={idxBusy==="drops"} onClick={runRankDrops}>{idxBusy==="drops"&&<Icon name="cog" size={15} className="audit-spin" />}{idxBusy==="drops"?"Analyzing…":"Find ranking drops"}</NeoButton>
                  </div>
                  {drops && (
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", marginBottom:4 }}>{drops.count} query/queries dropped</div>
                      {(drops.drops||[]).map((d,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5 }}>
                          <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.query}</span>
                          <span style={{ fontSize:11.5, color:"var(--muted)" }}>{d.from} → {d.to}</span>
                          <Chip tone="clay" size="sm">▼ {d.slip}</Chip>
                        </div>
                      ))}
                      {(drops.drops||[]).length===0 && <div style={{ padding:"10px", fontSize:13, color:"var(--muted)" }}>No significant ranking drops — positions are holding. ✅</div>}
                    </div>
                  )}
                </div>
                {/* IndexNow — instant index ping (Bing/Yandex/etc.), independent of GSC */}
                <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                  <IndexNowPanel ctx={ctx} />
                </div>
                {/* Drift — diff a live page vs its saved baseline for silent SEO regressions */}
                <div style={{ borderTop:"1px solid var(--line-soft)", paddingTop:14 }}>
                  <DriftPanel ctx={ctx} />
                </div>
              </div>
            )}
          </SoftCard>
        </div>
      )}
    </div>
  );
}

/* ---------------- DataForSEO screen (full dashboard) ---------------- */
function SemrushScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const domain = (s._rawUrl||s.url||"").replace(/^https?:\/\//,"").replace(/\/$/,"");
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(false);
  const [needsKey,setNeedsKey] = useState(false);
  const [tab,setTab] = useState("keywords");
  useEffect(()=>{ if(ctx.navTab && ["keywords","value","striking","competitors","gap"].includes(ctx.navTab)) setTab(ctx.navTab); },[ctx.navTab]);
  const [gapComp,setGapComp] = useState("");
  const [gaps,setGaps] = useState(null);
  const [gapSel,setGapSel] = useState(()=>new Set());   // keywords ticked for a selective push
  const [gapBusy,setGapBusy] = useState(false);
  const [gapPlan,setGapPlan] = useState(null);  // { keyword, loading?|brief?|error?|pushed?, title?, busy? }
  const [gapPlanFb,setGapPlanFb] = useState("");   // feedback for regenerating the title
  const [striking,setStriking] = useState(null);
  const [strikeBusy,setStrikeBusy] = useState(false);
  const [tval,setTval] = useState(null);
  const [tvalBusy,setTvalBusy] = useState(false);
  const [units,setUnits] = useState(null);
  const [err,setErr] = useState(null);   // persistent inline error {msg, noUnits}
  const [competitors,setCompetitors] = useState(s.competitors||[]);
  const [negatives,setNegatives] = useState(s.negative_keywords||[]);
  const [newComp,setNewComp] = useState("");
  const [newNeg,setNewNeg] = useState("");
  const [dbVal,setDbVal] = useState(s.semrush_db||"uk");
  const [dbList,setDbList] = useState(null);

  useEffect(()=>{ setData(null); setGaps(null); setErr(null); setNeedsKey(false); setTval(null); setCompetitors(s.competitors||[]); setNegatives(s.negative_keywords||[]); setDbVal(s.semrush_db||"uk"); },[s.id]);
  useEffect(()=>{ if(live&&!dbList) API.siteDatabase(s.id).then(r=>{ if(r&&r.countries) setDbList(r.countries); }).catch(()=>{}); },[live]);
  const changeDb = (db)=>{
    if(!db||db===dbVal) return;
    setDbVal(db); s.semrush_db=db;
    var site=window.SITES.find(x=>x.id===s.id); if(site) site.semrush_db=db;
    setData(null); setStriking(null); setTval(null); setGaps(null);   // stale to the old market
    if(live) API.siteDatabase(s.id, db).then(()=>ctx.toast("Keyword market set to "+db.toUpperCase()+" — click Refresh to reload data","teal")).catch(()=>{});
  };
  const loadTval = ()=>{
    // Reuse already-loaded keywords → zero DataForSEO units spent.
    const kws=(data&&data.topKeywords)||[];
    setTvalBusy(true);
    API.trafficValue(s.id, kws, s.semrush_db||"uk").then(r=>{ if(r.error){ setTval({error:r.error,noUnits:r.noUnits}); return; } setTval(r); }).catch(e=>setTval({error:e.message})).finally(()=>setTvalBusy(false));
  };
  const saveCompetitors = (comps,negs)=>{
    setCompetitors(comps); setNegatives(negs);
    // reflect on BOTH ctx.site and window.SITES so it survives screen switches / remounts
    s.competitors=comps; s.negative_keywords=negs;
    var site=window.SITES.find(x=>x.id===s.id); if(site){ site.competitors=comps; site.negative_keywords=negs; }
    if(!live) return;
    API.saveSiteCompetitors(s.id, comps, negs).then(r=>{
      if(r&&r.error){ ctx.toast("Couldn't save competitors: "+r.error,"clay"); return; }
      // reconcile with the server's persisted truth (so nothing silently drops)
      if(r&&Array.isArray(r.competitors)){ setCompetitors(r.competitors); s.competitors=r.competitors; if(site) site.competitors=r.competitors; }
      if(r&&Array.isArray(r.negativeKeywords)){ setNegatives(r.negativeKeywords); s.negative_keywords=r.negativeKeywords; if(site) site.negative_keywords=r.negativeKeywords; }
    }).catch(e=>ctx.toast("Save failed — "+e.message+" (try again)","clay"));
  };

  useEffect(()=>{ if(live) API.semrushUnits().then(r=>setUnits(r.units)).catch(()=>{}); },[s.id]);
  const load = ()=>{
    if(!live){ ctx.toast("Connect a live site first","gold"); return; }
    setLoading(true); setNeedsKey(false); setErr(null);
    API.semrushSnapshot(s.id, domain, (s.semrush_db)||"uk").then(r=>{
      if(r.needsKey){ setNeedsKey(true); return; }
      if(r.error){ setErr({ msg:r.error, noUnits:!!r.noUnits }); if(r.unitsRemaining!=null) setUnits(r.unitsRemaining); return; }
      setData(r);
    }).catch(e=>setErr({ msg:e.message })).finally(()=>{ setLoading(false); API.semrushUnits().then(r=>setUnits(r.units)).catch(()=>{}); });
  };
  const runStriking = ()=>{
    setStrikeBusy(true); setStriking(null); setErr(null);
    API.semrushStriking(domain, (s.semrush_db)||"uk").then(r=>{
      if(r.needsKey){ setNeedsKey(true); return; }
      if(r.noUnits||r.error){ if(r.unitsRemaining!=null) setUnits(r.unitsRemaining); setStriking({keywords:[],error:r.error||`DataForSEO units exhausted (${r.unitsRemaining} left).`,noUnits:!!r.noUnits}); return; }
      setStriking(r); if(r.unitsRemaining!=null) setUnits(r.unitsRemaining);
    }).catch(e=>setStriking({keywords:[],error:e.message})).finally(()=>setStrikeBusy(false));
  };
  const runGap = ()=>{
    const useComps = competitors.length ? competitors : (gapComp.trim()?[gapComp.trim()]:[]);
    if(!useComps.length){ ctx.toast("Add at least one competitor below","gold"); return; }
    setGapBusy(true); setGaps(null); setGapSel(new Set());
    // siteId makes the backend merge saved competitors + negatives + niche (geo_context) AI filtering
    API.semrushKeywordGap(domain, gapComp.trim()||undefined, (s.semrush_db)||"uk", s.id).then(r=>{
      if(r.needsKey){ setNeedsKey(true); return; }
      if(r.error){ if(r.unitsRemaining!=null) setUnits(r.unitsRemaining); setGaps({gaps:[],error:r.error,noUnits:!!r.noUnits}); return; }
      setGaps(r);
    }).catch(e=>setGaps({gaps:[],error:e.message})).finally(()=>setGapBusy(false));
  };
  // Push gap keywords into the MASTER Article Writer as writer-ready rows (Title + Keyword +
  // Content Brief). `only` = the ticked subset; omitted → all. De-duped by Keyword server-side.
  // Plan an article from a single gap keyword: generate a real title + brief (research),
  // let the user tweak the title, then push to the Article Writer.
  const planGapArticle = (g)=>{
    setGapPlanFb("");
    setGapPlan({ keyword:g.keyword, loading:true });
    API.contentBriefStart(s.id, g.keyword).then(st=>{
      if(st&&st.error){ setGapPlan({ keyword:g.keyword, error:st.error }); return; }
      let tries=0;
      const poll=()=>{
        API.contentBriefStatus(s.id).then(r=>{
          if(!r){ if(++tries>90){setGapPlan({keyword:g.keyword,error:"Timed out — try again."});return;} setTimeout(poll,4000); return; }
          if(r.status==="running"){ if(++tries>90){setGapPlan({keyword:g.keyword,error:"Timed out — try again."});return;} setTimeout(poll,4000); return; }
          if(r.status==="error"){ setGapPlan({ keyword:g.keyword, error:r.error||"Brief failed" }); return; }
          if(r.status==="unknown"){ setGapPlan({ keyword:g.keyword, error:"Run was lost — try again." }); return; }
          const b=r.brief||{};
          setGapPlan({ keyword:g.keyword, brief:b, sources:r.sources||[], title:(b.title||g.keyword) });
        }).catch(e=>{ if(++tries>90){setGapPlan({keyword:g.keyword,error:e.message});return;} setTimeout(poll,4000); });
      };
      setTimeout(poll,3500);
    }).catch(e=>setGapPlan({ keyword:g.keyword, error:e.message }));
  };
  const regenGapTitle = ()=>{
    if(!gapPlan||!gapPlan.brief) return;
    const fb=gapPlanFb.trim();
    setGapPlan(p=>({ ...p, busy:"title" }));
    API.gapTitle(s.id, gapPlan.keyword, { angle:(gapPlan.brief&&gapPlan.brief.angle)||"", currentTitle:gapPlan.title, feedback:fb||undefined }).then(r=>{
      if(r&&r.error){ ctx.toast("Title: "+r.error,"clay"); setGapPlan(p=>({ ...p, busy:null })); return; }
      setGapPlanFb("");
      setGapPlan(p=>({ ...p, title:(r&&r.title)||p.title, busy:null }));
    }).catch(e=>{ ctx.toast(e.message,"clay"); setGapPlan(p=>({ ...p, busy:null })); });
  };
  const pushGapArticle = ()=>{
    if(!gapPlan||!gapPlan.brief) return;
    setGapPlan(p=>({ ...p, busy:"push" }));
    API.gapPushArticle(s.id, gapPlan.keyword, (gapPlan.title||"").trim(), gapPlan.brief).then(r=>{
      if(r&&r.error){ ctx.toast(r.error==="Airtable not connected"?"Connect Airtable first (Airtable Sync tab)":r.error,"clay"); setGapPlan(p=>({ ...p, busy:null })); return; }
      const o=(r&&r.synced&&r.synced.opportunities)||{};
      const ok=(o.pushed||0)+(o.updated||0)>0;
      ctx.toast(ok?"Pushed to Article Writer ✓ — set Status to “Write Article” to generate":"Already in the Article Writer", ok?"teal":"gold");
      setGapPlan(p=>({ ...p, busy:null, pushed:true }));
    }).catch(e=>{ ctx.toast("Airtable: "+e.message,"clay"); setGapPlan(p=>({ ...p, busy:null })); });
  };
  const pushGapsToWriter = (only)=>{
    const list = (gaps&&gaps.gaps||[]).filter(g=>!only||only.has(g.keyword));
    if(!list.length) return;
    ctx.toast("Pushing "+list.length+" keyword(s) to the Article Writer…","teal");
    API.airtableSync(s.id,{ kinds:["gaps"], gaps:list }).then(r=>{
      if(r.error){ ctx.toast(r.error==="Airtable not connected"?"Connect Airtable first (Airtable Sync tab)":r.error, "clay"); return; }
      const g=(r.synced&&r.synced.gaps)||{};
      const n=g.pushed||0;
      ctx.toast(n>0?("Pushed "+n+" → Article Writer ✓ — set Status to “Write Article” to generate"+(g.skipped?(" ("+g.skipped+" already there)"):"")):(g.skipped?"All selected already in the Article Writer":"Nothing pushed"), n>0?"teal":"gold");
      if(n>0&&only) setGapSel(new Set());
    }).catch(e=>ctx.toast("Airtable: "+e.message,"clay"));
  };

  const ov = data && data.overview || {};
  const fmt = (v)=> v==null||v===""?"—":(isNaN(v)?v:Number(v).toLocaleString());
  const posTone = (p)=> p<=3?"teal":p<=10?"gold":"gray";

  return (
    <div className="rise">
      <PageHead title="DataForSEO" sub={`Live search-performance data for ${domain}.`}>
        <div style={{ display:"flex", gap:10 }}>
          <CountrySelect value={dbVal} options={dbList} onChange={changeDb} title="Keyword data market — pick the country DataForSEO pulls rankings, volumes & competitors from" />
          {units!=null && <Chip tone={units<100?"clay":units<1000?"gold":"teal"} size="sm" icon="bolt">${(units/100).toFixed(2)} balance</Chip>}
          {data && <NeoButton kind="soft" size="sm" icon="trend" onClick={load}>Refresh</NeoButton>}
        </div>
      </PageHead>

      {needsKey && (
        <SoftCard hover={false}><div style={{ display:"flex", gap:12, padding:"6px 4px", alignItems:"center" }}>
          <Icon name="lock" size={18} style={{ color:"var(--gold)" }} />
          <span style={{ fontSize:13.5, color:"#7E5A14" }}>Add your <b>SEMRUSH_API_KEY</b> as a Supabase secret to enable this section.</span>
        </div></SoftCard>
      )}

      {err && !needsKey && (
        <div style={{ marginBottom:16 }}><ErrBanner msg={err.msg} noUnits={err.noUnits} onRetry={load} /></div>
      )}

      {!data && !needsKey && !err && (
        <SoftCard hover={false}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"32px 10px", textAlign:"center" }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"var(--gold-bg)", color:"var(--gold)", display:"grid", placeItems:"center" }}><Icon name="bolt" size={26} /></div>
            <div style={{ fontSize:16, fontWeight:700 }}>Load DataForSEO data for {domain}</div>
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:420 }}>Organic keywords, rankings, traffic and competitors — plus a keyword-gap tool that pushes straight to Airtable.</div>
            <NeoButton kind="primary" icon={loading?undefined:"bolt"} disabled={loading} onClick={load}>{loading&&<Icon name="cog" size={17} className="audit-spin" />}{loading?"Loading…":"Load DataForSEO data"}</NeoButton>
          </div>
        </SoftCard>
      )}

      {data && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* KPI strip */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            <PatternCard icon="trend" tone="teal" value={fmt(ov.organicTraffic)} title="Organic traffic" sub="Est. monthly visits" />
            <PatternCard icon="search" tone="gold" value={fmt(ov.organicKeywords)} title="Organic keywords" sub="Total ranking" />
            <PatternCard icon="flag" tone="plum" value={fmt(ov.rank)} title="Authority rank" sub="Lower is better" />
          </div>

          {/* tabs */}
          <SoftCard hover={false}>
            <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", width:"fit-content", marginBottom:16 }}>
              {[["keywords","Top Keywords"],["value","Traffic Value"],["striking","Striking Distance"],["competitors","Competitors"],["gap","Keyword Gap"]].map(([v,l])=>(
                <button key={v} onClick={()=>setTab(v)} style={{ padding:"8px 16px", fontSize:13, fontWeight:700, borderRadius:99, background:tab===v?"var(--surface)":"transparent", color:tab===v?"var(--t-700)":"var(--muted)", boxShadow:tab===v?"var(--neo-sm)":"none" }}>{l}</button>
              ))}
            </div>

            {tab==="keywords" && (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ display:"flex", padding:"0 12px 6px", fontSize:11, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", color:"var(--faint)" }}>
                  <span style={{ width:50 }}>Pos</span><span style={{ flex:1 }}>Keyword</span><span style={{ width:90, textAlign:"right" }}>Volume</span><span style={{ width:80, textAlign:"right" }}>Traffic %</span>
                </div>
                {(data.topKeywords||[]).map((k,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <span style={{ width:50 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:24, padding:"0 6px", borderRadius:7, background:TT[posTone(k.position)][1], color:TT[posTone(k.position)][0], fontSize:12.5, fontWeight:800 }}>#{k.position}</span></span>
                    <a href={k.url} target="_blank" style={{ flex:1, fontSize:13, fontWeight:600, color:"var(--ink)", fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textDecoration:"none" }} title={k.url}>{k.keyword}</a>
                    <span style={{ width:90, textAlign:"right", fontSize:13, fontWeight:700 }}>{fmt(k.volume)}</span>
                    <span style={{ width:80, textAlign:"right", fontSize:12.5, color:"var(--muted)" }}>{(k.trafficPct||0).toFixed(1)}%</span>
                  </div>
                ))}
                {(data.topKeywords||[]).length===0 && <div style={{ padding:"14px", color:"var(--muted)", fontSize:13 }}>No keyword data returned.</div>}
              </div>
            )}

            {tab==="value" && (
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>Traffic value — what your rankings are worth</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Est. clicks = volume × CTR(position); value = clicks × CPC. CTR curve is calibrated from your own Search Console data when GSC is connected. Reuses loaded keywords — no DataForSEO units spent.</div>
                  </div>
                  <NeoButton kind="primary" size="sm" icon={tvalBusy?undefined:"trend"} disabled={tvalBusy} onClick={loadTval}>{tvalBusy&&<Icon name="cog" size={15} className="audit-spin" />}{tvalBusy?"Modeling…":"Model traffic value"}</NeoButton>
                </div>
                {tval && tval.error && <ErrBanner msg={tval.error} noUnits={tval.noUnits} onRetry={loadTval} />}
                {tval && !tval.error && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                      <PatternCard icon="trend" tone="teal" value={tval.summary.monthlyValueLabel} title="Est. monthly value" sub={(tval.summary.totalEstClicks||0).toLocaleString()+" est. clicks/mo"} />
                      <PatternCard icon="flag" tone="gold" value={tval.summary.page2AtRiskValue.toLocaleString()+" "+tval.currency} title="Page-2 value at stake" sub={tval.summary.page2Count+" keywords in 11–20"} />
                      <PatternCard icon="shield" tone="plum" value={tval.curveSource==="site-calibrated"?"Calibrated":tval.curveSource==="partial"?"Partial":"Default"} title="CTR curve" sub={tval.curveSource==="site-calibrated"?"from your GSC data":tval.curveSource==="partial"?"partly from your GSC data":"industry curve — connect GSC to calibrate"} />
                    </div>
                    {(tval.striking||[]).length>0 && (
                      <div>
                        <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", margin:"4px 0 8px" }}>Biggest money moves — push page-2 → page-1 (top 3)</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {tval.striking.slice(0,8).map((k,i)=>(
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                              <span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:24, padding:"0 6px", borderRadius:7, background:"var(--gold-bg)", color:"var(--gold)", fontSize:12.5, fontWeight:800 }}>#{Math.round(k.position)}</span>
                              <span style={{ flex:1, fontSize:13, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{k.keyword}</span>
                              <span style={{ fontSize:11.5, color:"var(--muted)" }}>+{(k.uplift.gainClicks||0).toLocaleString()} clicks</span>
                              <span style={{ fontSize:13, fontWeight:800, color:"var(--t-700)" }}>+{(k.uplift.gainValue||0).toLocaleString()} {tval.currency}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", margin:"4px 0 8px" }}>Top keywords by value</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        <div style={{ display:"flex", padding:"0 12px 4px", fontSize:10.5, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", color:"var(--faint)" }}><span style={{ width:46 }}>Pos</span><span style={{ flex:1 }}>Keyword</span><span style={{ width:64, textAlign:"right" }}>Clicks</span><span style={{ width:50, textAlign:"right" }}>CPC</span><span style={{ width:84, textAlign:"right" }}>Value/mo</span></div>
                        {(tval.keywords||[]).slice(0,15).map((k,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"center", padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                            <span style={{ width:46 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:28, height:22, borderRadius:7, background:TT[posTone(k.position)][1], color:TT[posTone(k.position)][0], fontSize:12, fontWeight:800 }}>#{Math.round(k.position)}</span></span>
                            <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{k.keyword}</span>
                            <span style={{ width:64, textAlign:"right", color:"var(--muted)" }}>{(k.estClicks||0).toLocaleString()}</span>
                            <span style={{ width:50, textAlign:"right", color:"var(--muted)", fontSize:12 }}>{(k.cpc||0).toFixed(1)}</span>
                            <span style={{ width:84, textAlign:"right", fontWeight:800, color:"var(--t-700)" }}>{(k.estValue||0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {!tval && !tvalBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>{(data&&data.topKeywords&&data.topKeywords.length)?'Click "Model traffic value" to turn your rankings into £ — estimated monthly value, value at stake, and the biggest money moves.':"Load DataForSEO keyword data above first, then model its £ value."}</div>}
              </div>
            )}

            {tab==="striking" && (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>Striking-distance keywords</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Ranking positions 11–20 — your fastest wins to push onto page 1, by volume.</div>
                  </div>
                  <NeoButton kind="primary" size="sm" icon={strikeBusy?undefined:"bolt"} disabled={strikeBusy} onClick={runStriking}>{strikeBusy&&<Icon name="cog" size={15} className="audit-spin" />}{strikeBusy?"Finding…":"Find quick wins"}</NeoButton>
                </div>
                {striking && striking.error && (
                  <ErrBanner msg={striking.error} noUnits={striking.noUnits} onRetry={runStriking} />
                )}
                {striking && !striking.error && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", marginBottom:4 }}>{striking.count} keyword(s) in striking distance</div>
                    {(striking.keywords||[]).map((k,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                        <span style={{ width:50 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:24, padding:"0 6px", borderRadius:7, background:"var(--gold-bg)", color:"var(--gold)", fontSize:12.5, fontWeight:800 }}>#{k.position}</span></span>
                        <a href={k.url} target="_blank" style={{ flex:1, fontSize:13, fontWeight:600, color:"var(--ink)", fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textDecoration:"none" }}>{k.keyword}</a>
                        <span style={{ width:90, textAlign:"right", fontSize:13, fontWeight:700 }}>{fmt(k.volume)}</span>
                      </div>
                    ))}
                    {striking.count===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No keywords currently in positions 11–20 (in the scanned set).</div>}
                  </div>
                )}
                {!striking && !strikeBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Click "Find quick wins" to surface keywords you're ranking just below page 1 — small pushes can win these.</div>}
              </div>
            )}

            {tab==="competitors" && (() => {
              // Generic giants that rank for everything — not real SEO rivals. Hidden by default.
              const JUNK = /(^|\.)(google|youtube|facebook|instagram|twitter|x|linkedin|tiktok|pinterest|reddit|wikipedia|amazon|ebay|apple|microsoft|yahoo|bing|gov\.uk|service\.gov\.uk|nhs\.uk|.*\.gov|.*\.edu|quora|medium|wordpress|wix|squarespace|trustpilot|glassdoor|indeed|yelp)(\.|$)/i;
              const all = data.competitors || [];
              const real = all.filter(c => c.domain && !JUNK.test(c.domain) && c.domain.replace(/^www\./,"") !== domain);
              const hidden = all.length - real.length;
              return (
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                <div style={{ padding:"11px 14px", borderRadius:"var(--r-md)", background:"var(--t-50,#eef6f4)", boxShadow:"var(--neo-in)", marginBottom:4, fontSize:12.5, color:"var(--ink-2)", lineHeight:1.5 }}>
                  <b>What is this?</b> These are websites that rank on Google for the <b>same keywords as {domain}</b> — auto-discovered from your shared search results. They're <i>suggestions</i>, not yet tracked. Click <b>Track as competitor</b> on the real rivals and they move to your watch list (Gap tab), where their keywords feed your gap analysis.{hidden>0 && <> <span style={{ color:"var(--muted)" }}>{hidden} generic site(s) like Google/YouTube/Gov.uk hidden — they rank for everything and aren't useful rivals.</span></>}
                </div>
                {/* Add your OWN competitor right here — saved to this site, used for the gap analysis */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"11px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:4 }}>
                  <Icon name="plus" size={15} style={{ color:"var(--t-700)" }} /><span style={{ fontSize:12.5, fontWeight:700, marginRight:4 }}>Add your own competitor</span>
                  <input value={newComp} onChange={e=>setNewComp(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&newComp.trim()){ const d=newComp.trim().replace(/^https?:\/\//,"").replace(/\/.*$/,""); saveCompetitors([...new Set([...competitors,d])], negatives); ctx.toast("Added "+d+" — saved to this site","teal"); setNewComp(""); } }}
                    placeholder="e.g. duncanlewis.co.uk" className="search-in" style={{ flex:1, minWidth:170, padding:"8px 12px", borderRadius:"var(--r-pill)", border:"none", background:"var(--surface)", boxShadow:"var(--neo-in)", fontSize:12.5, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
                  <NeoButton kind="soft" size="sm" icon="plus" onClick={()=>{ if(newComp.trim()){ const d=newComp.trim().replace(/^https?:\/\//,"").replace(/\/.*$/,""); saveCompetitors([...new Set([...competitors,d])], negatives); ctx.toast("Added "+d+" — saved to this site","teal"); setNewComp(""); } }}>Add</NeoButton>
                </div>
                {competitors.length>0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:7, alignItems:"center", padding:"0 2px 6px" }}>
                    <span style={{ fontSize:11.5, color:"var(--muted)", fontWeight:700 }}>Tracked:</span>
                    {competitors.map((c,i)=>(
                      <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 11px", borderRadius:99, background:"var(--t-50,#eef6f4)", color:"var(--t-700)", fontSize:12, fontWeight:700, fontFamily:"var(--mono)" }}>
                        {c}<button onClick={()=>saveCompetitors(competitors.filter(x=>x!==c), negatives)} style={{ display:"grid", placeItems:"center", color:"var(--clay)" }} title="remove"><Icon name="x" size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {real.length>0 && <div style={{ fontSize:11.5, color:"var(--faint)", fontWeight:700, padding:"2px 2px 0" }}>Or track an auto-discovered rival:</div>}
                {real.map((c,i)=>{
                  const tracked = competitors.includes(c.domain) || competitors.includes(c.domain.replace(/^www\./,""));
                  return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"var(--clay-bg)", color:"var(--clay)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>{(c.domain||"?")[0].toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>{c.domain}</div>
                      <div style={{ fontSize:11.5, color:"var(--muted)" }}>{fmt(c.commonKeywords)} common keywords · {fmt(c.organicKeywords)} total</div>
                    </div>
                    {tracked
                      ? <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 11px", borderRadius:99, background:"var(--t-50,#eef6f4)", color:"var(--t-700)", fontSize:12, fontWeight:700 }}><Icon name="check" size={13} />Tracked</span>
                      : <NeoButton kind="soft" size="sm" icon="plus" onClick={()=>{ saveCompetitors([...new Set([...competitors,c.domain])], negatives); ctx.toast("Now tracking "+c.domain+" — find their gaps in the Gap tab","teal"); }}>Track as competitor</NeoButton>}
                  </div>
                );})}
                {real.length===0 && <div style={{ padding:"14px", color:"var(--muted)", fontSize:13 }}>{all.length? "Only generic sites were found — add a real rival manually in the Gap tab." : "No competitor data returned — load DataForSEO keyword data first."}</div>}
              </div>
            );})()}

            {tab==="gap" && (
              <div>
                {/* per-site competitor manager */}
                <div style={{ padding:"14px 16px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <Icon name="flag" size={15} style={{ color:"var(--t-700)" }} /><span style={{ fontSize:13, fontWeight:700 }}>This site's competitors</span>
                    <span style={{ fontSize:11.5, color:"var(--muted)" }}>· saved per site, used for the gap analysis</span>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:10 }}>
                    {competitors.map((c,i)=>(
                      <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 11px", borderRadius:99, background:"var(--surface)", boxShadow:"var(--neo-xs)", fontSize:12.5, fontWeight:700, fontFamily:"var(--mono)" }}>
                        {c}<button onClick={()=>saveCompetitors(competitors.filter(x=>x!==c), negatives)} style={{ display:"grid", placeItems:"center", color:"var(--clay)" }}><Icon name="x" size={13} /></button>
                      </span>
                    ))}
                    {competitors.length===0 && <span style={{ fontSize:12.5, color:"var(--faint)" }}>No competitors yet — add one.</span>}
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <input value={newComp} onChange={e=>setNewComp(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&newComp.trim()){ saveCompetitors([...new Set([...competitors,newComp.trim()])], negatives); setNewComp(""); } }}
                      placeholder="add competitor.com" className="search-in" style={{ flex:1, minWidth:180, padding:"8px 12px", borderRadius:"var(--r-pill)", border:"none", background:"var(--surface)", boxShadow:"var(--neo-in)", fontSize:12.5, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
                    <NeoButton kind="soft" size="sm" icon="plus" onClick={()=>{ if(newComp.trim()){ saveCompetitors([...new Set([...competitors,newComp.trim()])], negatives); setNewComp(""); } }}>Add</NeoButton>
                  </div>
                  {/* negative keywords */}
                  <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--line-soft)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <Icon name="x" size={14} style={{ color:"var(--clay)" }} /><span style={{ fontSize:12.5, fontWeight:700 }}>Exclude keywords containing</span>
                      <span style={{ fontSize:11, color:"var(--muted)" }}>· filters irrelevant terms</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                      {negatives.map((n,i)=>(
                        <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99, background:"var(--clay-bg)", fontSize:12, fontWeight:600, color:"#8A4231" }}>
                          {n}<button onClick={()=>saveCompetitors(competitors, negatives.filter(x=>x!==n))} style={{ color:"var(--clay)" }}><Icon name="x" size={12} /></button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={newNeg} onChange={e=>setNewNeg(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&newNeg.trim()){ saveCompetitors(competitors,[...new Set([...negatives,newNeg.trim()])]); setNewNeg(""); } }}
                        placeholder="e.g. premium bonds" className="search-in" style={{ flex:1, minWidth:160, padding:"7px 12px", borderRadius:"var(--r-pill)", border:"none", background:"var(--surface)", boxShadow:"var(--neo-in)", fontSize:12.5, color:"var(--ink)", outline:"none" }} />
                      <NeoButton kind="ghost" size="sm" icon="plus" onClick={()=>{ if(newNeg.trim()){ saveCompetitors(competitors,[...new Set([...negatives,newNeg.trim()])]); setNewNeg(""); } }}>Exclude</NeoButton>
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:14 }}>
                  <span style={{ fontSize:13, color:"var(--muted)" }}>Find keywords your <b>{competitors.length||"—"}</b> competitor(s) rank for that <b>{domain}</b> doesn't (brand names + excluded terms auto-filtered).</span>
                  <NeoButton kind="primary" size="sm" icon={gapBusy?undefined:"search"} disabled={gapBusy} onClick={runGap} style={{ marginLeft:"auto" }}>{gapBusy&&<Icon name="cog" size={15} className="audit-spin" />}{gapBusy?"Analyzing…":"Find gaps"}</NeoButton>
                </div>
                {gaps && gaps.error && (
                  <ErrBanner msg={gaps.error} noUnits={gaps.noUnits} onRetry={runGap} />
                )}
                {gaps && !gaps.error && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"var(--ink-2)" }}>{gaps.gapCount||(gaps.gaps||[]).length} gap keyword(s)</span>
                      {gaps.offNicheFiltered>0 && <Chip tone="teal" size="sm" title="AI filtered these out using your site's niche context (Settings → Site context) — off-topic keywords from broad competitors">{gaps.offNicheFiltered} off-niche removed by AI</Chip>}
                      <span style={{ fontSize:11.5, color:"var(--faint)" }}>brands & excluded terms auto-filtered · tick keywords to push only those</span>
                      <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                        <NeoButton kind="primary" size="sm" icon="upload" disabled={!gapSel.size} onClick={()=>pushGapsToWriter(gapSel)} title="Push ONLY the ticked keywords into the master Article Writer as writer-ready rows">Push selected{gapSel.size?(" ("+gapSel.size+")"):""}</NeoButton>
                        <NeoButton kind="soft" size="sm" icon="layers" disabled={!(gaps.gaps||[]).length} onClick={()=>pushGapsToWriter()} title="Push every listed keyword into the master Article Writer">Push all</NeoButton>
                      </div>
                    </div>
                    {(gaps.gaps||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No gap keywords found after filtering (all were competitor brand names, excluded terms or off-niche).</div>}
                    {/* render EVERY gap (backend caps at 80) — a hidden tail under "Push all" meant pushing keywords the user never saw */}
                    {(gaps.gaps||[]).map((g,i)=>{ const on=gapSel.has(g.keyword); const planning=gapPlan&&gapPlan.keyword===g.keyword; return (
                      <div key={i}>
                      <div onClick={()=>setGapSel(p=>{ const n=new Set(p); if(n.has(g.keyword)) n.delete(g.keyword); else n.add(g.keyword); return n; })} style={{ display:"flex", alignItems:"center", padding:"9px 12px", borderRadius:"var(--r-md)", background:on?"var(--t-50)":"var(--bg)", boxShadow:on?"inset 0 0 0 1.5px var(--t-500)":"var(--neo-in)", cursor:"pointer", transition:"background .12s ease" }} title={on?"Click to unselect":"Click to select for push"}>
                        <span style={{ width:30, display:"grid", placeItems:"center" }}><span style={{ width:17, height:17, borderRadius:5, display:"grid", placeItems:"center", background:on?"var(--t-500)":"var(--bg-2)", boxShadow:on?"none":"var(--neo-in)", color:"#fff", fontSize:11, fontWeight:900 }}>{on?"✓":""}</span></span>
                        <span style={{ width:50 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:22, padding:"0 6px", borderRadius:7, background:TT[posTone(g.competitorPos)][1], color:TT[posTone(g.competitorPos)][0], fontSize:12, fontWeight:800 }}>#{g.competitorPos}</span></span>
                        <span style={{ flex:1, fontSize:13, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.keyword}</span>
                        <span style={{ width:80, textAlign:"right", fontSize:13, fontWeight:700 }}>{fmt(g.volume)}</span>
                        <span style={{ width:56, textAlign:"right", fontSize:12, color:"var(--muted)" }}>${(g.cpc||0).toFixed(2)}</span>
                        <NeoButton kind={planning?"soft":"ghost"} size="sm" icon={planning&&gapPlan.loading?undefined:"sparkles"} onClick={(e)=>{ e.stopPropagation(); if(planning) setGapPlan(null); else planGapArticle(g); }} style={{ marginLeft:8 }} title="Generate an article title + brief from this keyword, then push to the writer">{planning&&gapPlan.loading&&<Icon name="cog" size={13} className="audit-spin" />}{planning?"Close":"Plan"}</NeoButton>
                      </div>
                      {planning && (
                        <div className="rise" style={{ margin:"6px 0 10px", padding:"13px 15px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                          {gapPlan.loading && <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}><Icon name="cog" size={14} className="audit-spin" />Researching sources and drafting a title + brief…</div>}
                          {gapPlan.error && <div style={{ fontSize:12.5, color:"var(--clay)" }}>{gapPlan.error}</div>}
                          {gapPlan.brief && (<>
                            <div style={{ fontSize:11, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.4, marginBottom:5 }}>Article title</div>
                            <input value={gapPlan.title||""} onChange={e=>setGapPlan(p=>({ ...p, title:e.target.value }))} style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, fontWeight:700, color:"var(--ink)", outline:"none" }} />
                            <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center", flexWrap:"wrap" }}>
                              <input value={gapPlanFb} onChange={e=>setGapPlanFb(e.target.value)} placeholder="Ask to change the title — e.g. more specific, mention directors, less salesy…" style={{ flex:"1 1 260px", padding:"8px 11px", borderRadius:8, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, color:"var(--ink)", outline:"none" }} onKeyDown={e=>{ if(e.key==="Enter"&&!gapPlan.busy) regenGapTitle(); }} />
                              <NeoButton kind="soft" size="sm" icon={gapPlan.busy==="title"?undefined:"sparkles"} disabled={gapPlan.busy==="title"} onClick={regenGapTitle}>{gapPlan.busy==="title"&&<Icon name="cog" size={13} className="audit-spin" />}Regenerate title</NeoButton>
                            </div>
                            {(()=>{ const b=gapPlan.brief; const outline=Array.isArray(b.outline)?b.outline:[]; return (
                              <div style={{ marginTop:11, padding:"10px 12px", background:"var(--bg)", borderRadius:8, boxShadow:"var(--neo-in)", fontSize:12, lineHeight:1.55, maxHeight:220, overflow:"auto" }}>
                                {b.angle && <div style={{ marginBottom:6 }}><b>Angle:</b> {b.angle}</div>}
                                {b.metaDescription && <div style={{ marginBottom:6, color:"var(--muted)" }}>{b.metaDescription}</div>}
                                {outline.length>0 && <div><b>Outline</b><ul style={{ margin:"4px 0 0", paddingLeft:18 }}>{outline.slice(0,8).map((o,j)=><li key={j} style={{ marginBottom:2 }}>{o.h2||o.heading||""}</li>)}</ul></div>}
                                <div style={{ marginTop:6, fontSize:11, color:"var(--faint)" }}>{Array.isArray(b.faqs)?b.faqs.length:0} FAQs · target ~{b.wordCount||"—"} words · {(gapPlan.sources||[]).length} sources</div>
                              </div>
                            ); })()}
                            <div style={{ display:"flex", gap:9, marginTop:11, alignItems:"center" }}>
                              <NeoButton kind="primary" size="sm" icon={gapPlan.busy==="push"?undefined:"upload"} disabled={gapPlan.busy==="push"||!(gapPlan.title||"").trim()} onClick={pushGapArticle}>{gapPlan.busy==="push"&&<Icon name="cog" size={13} className="audit-spin" />}{gapPlan.pushed?"Pushed ✓ — push again?":"Approve & push to Airtable"}</NeoButton>
                              {gapPlan.pushed && <span style={{ fontSize:11.5, color:"var(--t-700)" }}>In the Article Writer — set Status to “Write Article” to generate.</span>}
                            </div>
                          </>)}
                        </div>
                      )}
                      </div>
                    ); })}
                  </div>
                )}
                {!gaps && !gapBusy && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Pick a competitor to find high-value keywords they rank for that you're missing — then push them to Airtable in one click.</div>}
              </div>
            )}
          </SoftCard>
        </div>
      )}
    </div>
  );
}

/* ---------------- Embedded Airtable grid (view + edit in-place) ----------
   One editable cell. Text commits on blur/Enter; singleSelect (e.g. Status →
   triggers the n8n workflow) commits immediately. Read-only for computed types. */
const GRID_EDITABLE = new Set(["singleLineText","multilineText","richText","number","currency","percent","url","email","phoneNumber","date","dateTime","singleSelect"]);
/* Airtable color-name → [bg, fg] for select pills (approximate Airtable palette). */
function atColor(c){
  const m={ blue:["#cfdfff","#2750ae"], cyan:["#d0f0fd","#0b76b7"], teal:["#c3f0e9","#067a76"], green:["#d2f7c2","#2d7a16"], yellow:["#ffeab6","#9c6f00"], orange:["#fee2d5","#cc4d26"], red:["#ffdce5","#b21e2c"], pink:["#ffdaf4","#b2158b"], purple:["#ede2fe","#6b1cb0"], gray:["#e5e9f0","#3d4757"] };
  const s=String(c||"").toLowerCase();
  const key=Object.keys(m).find(k=>s.includes(k));
  if(key) return m[key];
  const fams=Object.keys(m); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return m[fams[h%fams.length]];
}
function GridPill({ label, color }){ const [bg,fg]=atColor(color); return <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:11, fontSize:11.5, fontWeight:600, lineHeight:1.6, background:bg, color:fg, whiteSpace:"nowrap", maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", verticalAlign:"middle" }}>{label}</span>; }
const GRID_ICON={ singleSelect:"chevD", multipleSelects:"layers", checkbox:"check", url:"link", number:"trend", currency:"trend", percent:"trend", multilineText:"doc", richText:"doc", date:"doc", dateTime:"doc" };
function gridFieldIcon(t){ return GRID_ICON[t]||"doc"; }

/* One editable cell. `big` = inside the expanded-record modal (taller, textarea for long text). */
function GridCell({ field, value, onSave, big }){
  const init = value==null?"":(Array.isArray(value)?value.join(", "):String(value));
  const [v,setV] = useState(init);
  useEffect(()=>{ setV(init); },[init]);
  const base = { width:"100%", border:"none", outline:"none", background:"transparent", font:"inherit", fontSize:12.5, color:"var(--ink)", padding:"7px 9px" };
  if(field.type==="checkbox") return <div style={{ padding:"6px 9px", textAlign: big?"left":"center" }}><input type="checkbox" checked={value===true||value==="true"} onChange={e=>onSave(e.target.checked)} style={{ cursor:"pointer", width:15, height:15, accentColor:"var(--t-600)" }} /></div>;
  if(field.type==="singleSelect"){
    const opt=(field.options||[]).find(o=>o.name===v)||{};
    return (
      <div style={{ position:"relative", padding:"4px 7px", minHeight:28, display:"flex", alignItems:"center" }}>
        <select value={v||""} onChange={e=>{ setV(e.target.value); onSave(e.target.value||null); }} style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", border:"none" }}>
          <option value="">—</option>{(field.options||[]).map(o=><option key={o.name} value={o.name}>{o.name}</option>)}
        </select>
        {v ? <GridPill label={v} color={opt.color} /> : <span style={{ fontSize:12.5, color:"var(--faint)" }}>Set…</span>}
      </div>
    );
  }
  if(field.type==="multipleSelects" && Array.isArray(value)) return <div style={{ display:"flex", gap:4, flexWrap:"wrap", padding:"5px 7px" }}>{value.length?value.map((x,i)=><GridPill key={i} label={x} color={((field.options||[]).find(o=>o.name===x)||{}).color} />):<span style={{ fontSize:12.5, color:"var(--faint)" }}>—</span>}</div>;
  if(field.type==="multilineText" || field.type==="richText"){
    if(big){ const commit=()=>{ if(v!==init) onSave(v===""?null:v); }; return <textarea value={v} onChange={e=>setV(e.target.value)} onBlur={commit} rows={5} placeholder="—" style={{ ...base, resize:"vertical", lineHeight:1.55, padding:"9px 11px", fontFamily:"var(--ff)" }} />; }
    return <span style={{ ...base, display:"block", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color: init?"var(--ink)":"var(--faint)" }} title={init}>{init||"—"}</span>;
  }
  if(field.type==="url" && init) return <a href={init} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} title={init} style={{ ...base, display:"block", color:"var(--t-700)", textDecoration:"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{init.replace(/^https?:\/\//,"")}</a>;
  if(!GRID_EDITABLE.has(field.type)) return <span style={{ ...base, display:"block", color:"var(--muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={init}>{init||"—"}</span>;
  const commit=()=>{ if(v!==init) onSave(v===""?null:v); };
  return <input value={v} onChange={e=>setV(e.target.value)} onBlur={commit} onKeyDown={e=>{ if(e.key==="Enter") e.target.blur(); if(e.key==="Escape"){ setV(init); e.target.blur(); } }} style={base} placeholder="—" title={v} />;
}

/* Airtable-style expanded record — edit every field of one row in a form (no need to open Airtable). */
function RecordModal({ rec, fields, onSave, onClose }){
  if(!rec) return null;
  const primary=fields[0];
  const t=primary?rec.fields[primary.name]:null;
  const title=String(Array.isArray(t)?t.join(", "):(t||"Untitled record")).slice(0,90)||"Untitled record";
  return (
    <SoftModal open onClose={onClose} w={660}>
      <SoftModalHead icon="doc" tone="teal" title={title} sub="Edit this record — every change saves live to Airtable" onClose={onClose} />
      <div className="scroll" style={{ padding:"14px 20px 20px", maxHeight:"68vh", display:"flex", flexDirection:"column", gap:13 }}>
        {fields.map(f=>(
          <div key={f.name}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:".03em", textTransform:"uppercase", color:/status/i.test(f.name)?"var(--t-700)":"var(--muted)", marginBottom:5, display:"flex", alignItems:"center", gap:6 }}><Icon name={gridFieldIcon(f.type)} size={12} />{f.name}</div>
            <div style={{ background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
              <GridCell field={f} value={rec.fields[f.name]} onSave={(val)=>onSave(rec.id, f.name, val)} big />
            </div>
          </div>
        ))}
      </div>
    </SoftModal>
  );
}

function AirtableGrid({ ctx, siteId }) {
  const API = window.SentinelAPI;
  const [d,setD] = useState(null);          // { fields, records, offset, tableName, tableId, tables }
  const [loading,setLoading] = useState(false);
  const [err,setErr] = useState(null);
  const [saving,setSaving] = useState(0);
  const [table,setTable] = useState(null);  // selected table id (null → backend default = keyword table)
  const [q,setQ] = useState("");            // record search box (queries the WHOLE table server-side)
  const [qActive,setQActive] = useState(""); // the search term actually applied (debounced)
  const [expanded,setExpanded] = useState(null);  // record open in the expand modal
  const [freshIds,setFreshIds] = useState(()=>new Set());  // rows to briefly highlight (just pushed / added / synced in)
  const prevIds = useRef(null);      // record ids from the previous data load (to detect new arrivals)
  const flashed = useRef(new Set()); // ids already flashed once (so each row highlights at most once)
  const gridScroll = useRef(null);   // the grid's scroll container (to surface fresh rows at the top)
  // Sequence guard: only the LATEST request may write state. Kills two races: a slow poll
  // response replacing pages the user just loaded ("snap-back"), and a slow load-more from
  // table A merging into table B after a tab switch (mixed-table corruption).
  const seqRef = useRef(0);
  const load = (offset, silent, search)=>{
    const mySeq = ++seqRef.current;
    if(!silent){ setLoading(true); setErr(null); }
    API.airtableRecords(siteId,{ offset, pageSize:50, table, search: search||undefined }).then(r=>{
      if(seqRef.current!==mySeq) return;              // superseded by a newer request — discard
      if(r.error){ if(!silent) setErr(r.error); return; }
      setD(prev=>{
        if(offset && prev && prev.tableId===r.tableId){
          const seen=new Set(prev.records.map(x=>x.id));   // numeric paging over a live list can overlap at the boundary
          return { ...r, records:[...prev.records, ...r.records.filter(x=>!seen.has(x.id))] };
        }
        return r;
      });
    }).catch(e=>{ if(seqRef.current===mySeq && !silent) setErr(e.message); }).finally(()=>{ if(seqRef.current===mySeq && !silent) setLoading(false); });
  };
  useEffect(()=>{ setD(null); setQ(""); setQActive(""); setExpanded(null); },[siteId]);  // blank on site switch (different base)
  useEffect(()=>{ const h=setTimeout(()=>setQActive(q.trim()), 350); return ()=>clearTimeout(h); },[q]);  // debounce the search box
  useEffect(()=>{ load(undefined, false, qActive||undefined); },[siteId, table, qActive]);  // (re)load on site / table / search change
  // Live sync — silently re-pull the current table so new rows + status changes
  // (incl. ones n8n writes back) appear without a manual reload. Paused while the
  // user is editing (modal open / focused field) or has loaded extra pages.
  useEffect(()=>{
    if(!d) return;
    const canPoll=()=>{
      if(typeof document!=="undefined" && document.hidden) return false;   // tab not visible
      if(expanded) return false;                                           // editing a record in the modal
      if(qActive) return false;                                            // showing search results — don't replace them
      if(saving>0) return false;                                           // a save is in flight — don't clobber it
      const ae = typeof document!=="undefined" && document.activeElement;
      if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName||"")) return false;  // mid cell-edit
      if((d.records||[]).length>50) return false;                          // user loaded more pages — don't reset them
      return true;
    };
    const tick=()=>{ if(canPoll()) load(undefined, true); };
    const iv = setInterval(tick, 12000);
    // re-pull the instant the user returns to the tab (e.g. after editing in Airtable).
    // visibilitychange ONLY — binding focus too fired BOTH on tab return → two overlapping
    // sweeps that could burst past Airtable's 5 req/s/base limit (30s 429 penalty breaks saves).
    const onWake=()=>{ if(typeof document==="undefined" || !document.hidden) tick(); };
    if(typeof document!=="undefined") document.addEventListener("visibilitychange", onWake);
    return ()=>{
      clearInterval(iv);
      if(typeof document!=="undefined") document.removeEventListener("visibilitychange", onWake);
    };
  },[d, expanded, saving, qActive, table, siteId]);
  // Surface freshly-arrived rows — ones that appear via Add row / a chat or dashboard
  // push / a live-sync poll, plus any created in the last 2 min on first load (e.g. you
  // just pushed a brief then opened this screen). Each row highlights at most once.
  useEffect(()=>{
    if(!d) return;
    const recs = d.records||[];
    const idSet = new Set(recs.map(r=>r.id));
    const now = Date.now();
    const fresh = new Set();
    for(const r of recs){
      if(flashed.current.has(r.id)) continue;
      const appeared = prevIds.current && !prevIds.current.has(r.id);
      let recent = false;
      if(r.createdTime){ const t = new Date(r.createdTime).getTime(); recent = !isNaN(t) && (now - t) < 120000; }
      if(appeared || recent){ fresh.add(r.id); flashed.current.add(r.id); }
    }
    prevIds.current = idSet;
    if(fresh.size){
      setFreshIds(new Set(fresh));
      // newest-first puts them at the top — surface them, but don't yank a user browsing deeper down
      if(gridScroll.current && gridScroll.current.scrollTop < 220) gridScroll.current.scrollTop = 0;
      const t = setTimeout(()=>setFreshIds(new Set()), 4200);
      return ()=>clearTimeout(t);
    }
  },[d]);
  const saveCell=(recId, fieldName, value)=>{
    setD(p=>({ ...p, records:p.records.map(r=>r.id===recId?{ ...r, fields:{ ...r.fields, [fieldName]:value } }:r) }));
    setExpanded(x=> (x&&x.id===recId) ? { ...x, fields:{ ...x.fields, [fieldName]:value } } : x);  // keep the open modal in sync
    setSaving(c=>c+1);
    API.airtableUpdateRecord(siteId, recId, { [fieldName]:value }, d&&d.tableId)
      .then(r=>{ if(r.error) ctx.toast("Save failed: "+r.error,"clay"); })
      .catch(e=>ctx.toast("Save failed: "+e.message,"clay")).finally(()=>setSaving(c=>c-1));
  };
  const addRow=()=>{
    API.airtableCreateRecord(siteId,{}, d&&d.tableId).then(r=>{ if(r.error){ ctx.toast("Add failed: "+r.error,"clay"); return; } setD(p=>({ ...p, records:[r.record, ...p.records] })); setExpanded(r.record); ctx.toast("Row added — fill it in","teal"); }).catch(e=>ctx.toast(e.message,"clay"));
  };

  if(err) return <SoftCard hover={false}><ErrBanner msg={err} onRetry={()=>{ setErr(null); load(undefined,false,qActive||undefined); }} /></SoftCard>;
  if(!d) return <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:13.5, display:"flex", alignItems:"center", gap:10 }}><Icon name="cog" size={16} className="audit-spin" />Loading records…</div></SoftCard>;
  const fields = d.fields||[];
  // search runs server-side across the whole table (see qActive); here we just order what
  // came back newest-first — so a row you just pushed / added / searched surfaces at the top;
  // records without a createdTime (just-added, pre-refresh) are treated as newest.
  const rows = (d.records||[]).slice().sort((a,b)=>{ const ca=a.createdTime||"￿", cb=b.createdTime||"￿"; return ca<cb?1:ca>cb?-1:0; });
  const HCELL = { textAlign:"left", padding:"8px 10px", fontSize:11, fontWeight:700, letterSpacing:".02em", color:"var(--muted)", background:"var(--bg-2)", borderBottom:"2px solid var(--line)", borderRight:"1px solid var(--line-soft)", whiteSpace:"nowrap" };
  return (
    <SoftCard hover={false} style={{ padding:0, overflow:"hidden" }}>
      {/* table tabs (Airtable-style) — the MASTER content list (Article Writer) always first + badged */}
      {(d.tables && d.tables.length>1) && (
        <div className="scroll" style={{ display:"flex", gap:2, padding:"7px 10px 0", borderBottom:"1px solid var(--line-soft)", overflowX:"auto" }}>
          {d.tables.slice().sort((a,b)=>(a.id===d.masterTableId?-1:0)-(b.id===d.masterTableId?-1:0)).map(t=>{ const on=(d.tableId===t.id); const master=(t.id===d.masterTableId); return (
            <button key={t.id} onClick={()=>{ if(!on){ setTable(t.id); setQ(""); setQActive(""); } }} style={{ padding:"8px 14px", fontSize:13, fontWeight:on?800:600, border:"none", borderRadius:"9px 9px 0 0", cursor:"pointer", whiteSpace:"nowrap", color:on?"var(--t-700)":"var(--muted)", background:on?"var(--surface)":"transparent", boxShadow:on?"inset 0 -2px 0 var(--t-500)":"none", display:"inline-flex", alignItems:"center", gap:6 }}>{master&&<span style={{ fontSize:9.5, fontWeight:800, letterSpacing:".04em", padding:"1px 6px", borderRadius:8, background:"var(--t-100)", color:"var(--t-700)" }}>MASTER</span>}{t.name}</button>
          ); })}
        </div>
      )}
      {/* toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 16px", borderBottom:"1px solid var(--line-soft)", flexWrap:"wrap" }}>
        <div style={{ fontSize:15, fontWeight:800 }}>{d.tableName||"Records"}</div>
        <span style={{ fontSize:11.5, color:"var(--muted)" }}>{qActive?(<>{rows.length} match{rows.length===1?"":"es"} for “{qActive}”{d.offset?"+":""}</>):(<>{rows.length}{d.total>rows.length?(" of "+d.total):""} record{(d.total||rows.length)===1?"":"s"} · newest first · live-synced</>)} · click a row’s # to expand</span>
        {(saving>0||loading) && <Chip tone="gold" size="sm"><Icon name="cog" size={11} className="audit-spin" />{saving>0?"Saving":"Loading"}</Chip>}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ position:"relative" }}>
            <Icon name="search" size={13} style={{ position:"absolute", left:11, top:9, color:"var(--faint)" }} />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search all records…" title="Searches the whole table (every record), not just the loaded page" style={{ padding:"7px 12px 7px 31px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, color:"var(--ink)", outline:"none", width:170 }} />
          </div>
          <NeoButton kind="soft" size="sm" icon="refresh" disabled={loading} onClick={()=>load(undefined,false,qActive||undefined)} title="Re-pull from Airtable now (also auto-syncs every few seconds)">Refresh</NeoButton>
          <NeoButton kind="primary" size="sm" icon="plus" onClick={addRow}>Add row</NeoButton>
        </div>
      </div>
      {/* what IS this table? — one-liner so the tabs aren't a mystery */}
      {(()=>{ const isMaster=d.tableId&&d.tableId===d.masterTableId;
        const INFO={
          "AI Citation Results":"Read-only log from AI Visibility scans — which AI prompts cited your site. Tracking only; articles are not written from here.",
          "AI Competitor Share":"Read-only share-of-AI-voice snapshots (you vs competitors) from each AI Visibility scan. Tracking only.",
          "AI Visibility Opportunities":"Read-only list of AI prompts where your site is NOT cited yet — visibility gaps to target. Tracking only.",
          "SEO Keyword Gaps":"Legacy sync table — keyword gaps now push into the master Article Writer instead. Safe to ignore.",
          "Content Suggestions":"Legacy sync table from older content-intel runs. Safe to ignore.",
          "Content Opportunities":"Legacy sync table — opportunities now push into the master Article Writer instead. Safe to ignore.",
        };
        const txt = isMaster ? "THE master content list — every push (Content Engine, Quick Wins, Keyword gaps, Trending, PAA, Chat) lands here, newest first. Set Status → “Write Article” to trigger the n8n writer."
          : (INFO[d.tableName] || "Not written to by the dashboard — this table was created outside Sentinel (e.g. directly in Airtable or by n8n).");
        return <div style={{ padding:"8px 16px", fontSize:12, color:isMaster?"var(--t-700)":"var(--muted)", background:isMaster?"var(--t-50)":"var(--bg-2)", borderBottom:"1px solid var(--line-soft)" }}>{isMaster&&<b>MASTER · </b>}{txt}</div>; })()}
      {/* grid */}
      <div ref={gridScroll} className="scroll" style={{ overflowX:"auto", maxHeight:600, overflowY:"auto", background:"var(--surface)" }}>
        <table style={{ borderCollapse:"separate", borderSpacing:0, width:"max-content", minWidth:"100%" }}>
          <thead><tr style={{ position:"sticky", top:0, zIndex:2 }}>
            <th style={{ ...HCELL, position:"sticky", left:0, zIndex:3, width:46, minWidth:46, textAlign:"center" }}>#</th>
            {fields.map(f=>(
              <th key={f.name} style={{ ...HCELL, color:/status/i.test(f.name)?"var(--t-700)":"var(--muted)", minWidth: (f.type==="multilineText"||f.type==="richText")?240:140 }}>
                <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><Icon name={gridFieldIcon(f.type)} size={11} style={{ opacity:.55 }} />{f.name}</span>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((rec,ri)=>{ const fresh = freshIds.has(rec.id); return (
              <tr key={rec.id} className="row-link">
                <td onClick={()=>setExpanded(rec)} title="Expand record — edit every field" style={{ position:"sticky", left:0, zIndex:1, width:46, minWidth:46, textAlign:"center", borderBottom:"1px solid var(--line-soft)", borderRight:"2px solid var(--line)", background:fresh?"var(--t-100)":"var(--bg)", color:fresh?"var(--t-700)":"var(--faint)", fontSize:11.5, fontWeight:fresh?800:600, cursor:"pointer", transition:"background 1.4s ease, color 1.4s ease" }}>{fresh?"●":ri+1}</td>
                {fields.map(f=>(
                  <td key={f.name} style={{ borderBottom:"1px solid var(--line-soft)", borderRight:"1px solid var(--line-soft)", verticalAlign:"middle", maxWidth:340, background:fresh?"var(--t-50)":undefined, transition:"background 1.4s ease" }}>
                    <GridCell field={f} value={rec.fields[f.name]} onSave={(val)=>saveCell(rec.id, f.name, val)} />
                  </td>
                ))}
              </tr>
            ); })}
            {rows.length===0 && <tr><td colSpan={fields.length+1} style={{ padding:"24px", textAlign:"center", color:"var(--muted)", fontSize:13 }}>{qActive?(loading?"Searching…":"No records match “"+qActive+"”."):"No records yet — click “Add row”."}</td></tr>}
          </tbody>
        </table>
      </div>
      {d.offset && (
        <div style={{ padding:"12px 18px", borderTop:"1px solid var(--line-soft)", textAlign:"center" }}>
          <NeoButton kind="soft" size="sm" icon={loading?undefined:"chevD"} disabled={loading} onClick={()=>load(d.offset, false, qActive||undefined)}>{loading&&<Icon name="cog" size={14} className="audit-spin" />}{loading?"Loading…":"Load 50 more"}</NeoButton>
        </div>
      )}
      {expanded && <RecordModal rec={expanded} fields={fields} onSave={saveCell} onClose={()=>setExpanded(null)} />}
    </SoftCard>
  );
}

/* ---------------- Airtable Sync screen ---------------- */
/* Controls the whole Airtable flow: connect (PAT) → pick base → map tables →
   sync DataForSEO keyword gaps + content suggestions + GEO results. Reuses UI atoms. */
function AirtableScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE;
  const [status,setStatus] = useState(null);     // {connected, config}
  const [bases,setBases] = useState([]);
  const [tables,setTables] = useState([]);
  const [pat,setPat] = useState("");
  const [baseId,setBaseId] = useState("");
  const [tableId,setTableId] = useState("");      // chosen keyword table (id)
  const [keywordField,setKeywordField] = useState("");  // chosen keyword column name
  const [busy,setBusy] = useState("");
  const [log,setLog] = useState([]);
  const [airErr,setAirErr] = useState(null);   // persistent error banner

  // Load tables for a base, restoring the saved table + keyword-field selection.
  const loadTables = (bid, cfg)=>{
    setBusy("tables");
    API.airtableTables(s.id, bid).then(r=>{
      if(r.error){ setAirErr({ msg:r.error }); return; }
      const tbls=r.tables||[]; setTables(tbls);
      const savedTable = cfg && cfg.table_keywords;
      if(savedTable && tbls.some(t=>t.id===savedTable||t.name===savedTable)) setTableId(savedTable);
      if(cfg && cfg.keyword_field) setKeywordField(cfg.keyword_field);
    }).catch(e=>setAirErr({ msg:e.message })).finally(()=>setBusy(""));
  };
  const refresh = ()=>{
    if(!live){ return; }
    API.airtableStatus(s.id).then(st=>{
      setStatus(st);
      const cfg = st.config||{};
      if(cfg.base_id){ setBaseId(cfg.base_id); }
      if(cfg.table_keywords) setTableId(cfg.table_keywords);
      if(cfg.keyword_field) setKeywordField(cfg.keyword_field);
      if(st.connected){
        API.airtableBases(s.id).then(b=>{ if(!b.error) setBases(b.bases||[]); }).catch(()=>{});
        if(cfg.base_id) loadTables(cfg.base_id, cfg);
      }
    }).catch(()=>{});
    API.listAirtableLog(s.id).then(setLog).catch(()=>{});
  };
  useEffect(()=>{ setStatus(null); setBases([]); setTables([]); setPat(""); setBaseId(""); setTableId(""); setKeywordField(""); setLog([]); setAirErr(null); refresh(); },[s.id]);

  const connect = ()=>{
    if(!pat.trim()){ ctx.toast("Paste your Airtable Personal Access Token","gold"); return; }
    setBusy("connect"); setAirErr(null);
    API.airtableConnect(s.id, pat.trim()).then(r=>{
      if(r.error){ setAirErr({ msg:r.error }); return; }
      setBases(r.bases||[]); setPat("");
      ctx.toast("Airtable connected — "+(r.bases||[]).length+" base(s)","teal");
      refresh();
    }).catch(e=>setAirErr({ msg:"Connect failed: "+e.message })).finally(()=>setBusy(""));
  };
  const chooseBase = (bid)=>{
    if(!bid){ return; }
    setBaseId(bid); setTableId(""); setKeywordField(""); setTables([]); setAirErr(null);
    API.airtableConfig(s.id,{ baseId:bid }).catch(()=>{});
    loadTables(bid, null);
  };
  const chooseTable = (tid)=>{
    setTableId(tid);
    const t = tables.find(x=>x.id===tid||x.name===tid);
    // default the keyword column to a field literally named "keyword", else first field
    let field = keywordField;
    if(t && t.fields){ const kw=t.fields.find(f=>/keyword/i.test(f.name)); field = (kw&&kw.name) || (t.fields[0]&&t.fields[0].name) || ""; setKeywordField(field); }
    API.airtableConfig(s.id,{ tableKeywords:tid, keywordField:field }).catch(()=>{});
  };
  const chooseField = (name)=>{ setKeywordField(name); API.airtableConfig(s.id,{ keywordField:name }).catch(()=>{}); };
  const pushKeywords = ()=>{
    setBusy("push"); setAirErr(null); ctx.toast("Finding content-gap keywords…","teal");
    API.airtablePushKeywords(s.id).then(r=>{
      if(r.error){ setAirErr({ msg:r.error }); return; }
      const msg = r.pushed>0 ? ("Pushed "+r.pushed+" keyword(s) to Airtable ✓"+(r.skipped?" ("+r.skipped+" already there)":"")) : (r.skipped? ("All "+r.skipped+" keyword(s) already in Airtable — nothing new"):"No new keywords to push");
      ctx.toast(msg, r.pushed>0?"teal":"gold");
      refresh();
    }).catch(e=>setAirErr({ msg:"Push failed: "+e.message })).finally(()=>setBusy(""));
  };

  const connected = status && status.connected;
  const selectedTable = tables.find(t=>t.id===tableId||t.name===tableId);
  const ready = connected && baseId && tableId && keywordField;
  const SEL_STYLE = { padding:"11px 14px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, color:"var(--ink)", outline:"none", fontFamily:"var(--ff)", minWidth:240, cursor:"pointer" };

  return (
    <div className="rise">
      <PageHead title="Airtable Sync" sub={`Push ${s.name}'s content-gap keywords into its Airtable base — Airtable writes the articles.`}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          {baseId && <NeoButton kind="soft" size="sm" iconR="upload" onClick={()=>window.open("https://airtable.com/"+baseId+(tableId?("/"+tableId):""),"_blank","noopener")}>Open in Airtable</NeoButton>}
          {ready && <NeoButton kind="primary" icon={busy==="push"?undefined:"upload"} disabled={busy==="push"} onClick={pushKeywords}>{busy==="push"&&<Icon name="cog" size={17} className="audit-spin" />}{busy==="push"?"Pushing…":"Push keywords"}</NeoButton>}
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"14px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site first to configure Airtable for it.</div></SoftCard>}

      {live && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {airErr && <ErrBanner msg={airErr.msg} onRetry={()=>setAirErr(null)} />}
          {/* Step 1 — connect */}
          <SoftCard hover={false}>
            <SectionHead sub="Personal Access Token — encrypted at rest, never shown again" right={connected?<Chip tone="teal" size="sm" dot>Connected</Chip>:<Chip tone="gray" size="sm" dot>Not connected</Chip>}>1 · Connect Airtable</SectionHead>
            {!connected ? (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <input type="password" value={pat} onChange={e=>setPat(e.target.value)} placeholder="patXXXXXXXXXXXXXX.xxxxxxxx…"
                    className="search-in" style={{ flex:1, minWidth:260, padding:"12px 14px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, color:"var(--ink)", outline:"none", fontFamily:"var(--mono)" }} />
                  <NeoButton kind="primary" icon={busy==="connect"?undefined:"link"} disabled={busy==="connect"} onClick={connect}>{busy==="connect"&&<Icon name="cog" size={16} className="audit-spin" />}Connect</NeoButton>
                </div>
                <div style={{ display:"flex", gap:10, padding:"12px 14px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
                  <Icon name="shield" size={17} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} />
                  <span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Create a token at <b>airtable.com/create/tokens</b> with scopes <b>data.records:read</b> + <b>data.records:write</b> + <b>schema.bases:read</b>. Grant it access to this site's base. The token is encrypted server-side and never returned to the browser.</span>
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:11, fontSize:13.5, color:"var(--ink-2)" }}>
                <Icon name="check" size={17} style={{ color:"var(--t-600)" }} />Token stored & verified. {status.config&&status.config.last_sync?`Last push ${window.timeAgo?window.timeAgo(status.config.last_sync):status.config.last_sync}.`:"No push yet."}
                <NeoButton kind="ghost" size="sm" icon="link" style={{ marginLeft:"auto" }} onClick={()=>{ setStatus({connected:false}); setBases([]); setTables([]); setBaseId(""); setTableId(""); setKeywordField(""); setPat(""); ctx.toast("Enter a new Airtable token to reconnect","gold"); }}>Reconnect</NeoButton>
              </div>
            )}
          </SoftCard>

          {/* Step 2 — destination: base → table → keyword column (per site) */}
          {connected && (
            <SoftCard hover={false}>
              <SectionHead sub="Each site maps to its own base, table and keyword column">2 · Destination</SectionHead>
              <div style={{ display:"flex", flexWrap:"wrap", gap:18 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11.5, fontWeight:700, color:"var(--muted)" }}>Base / app</label>
                  <select value={baseId} onChange={e=>chooseBase(e.target.value)} style={SEL_STYLE}>
                    <option value="">{bases.length?"Select a base…":"Loading bases…"}</option>
                    {bases.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11.5, fontWeight:700, color:"var(--muted)" }}>Table</label>
                  <select value={tableId} onChange={e=>chooseTable(e.target.value)} disabled={!baseId||busy==="tables"} style={Object.assign({},SEL_STYLE,{opacity:(!baseId||busy==="tables")?.55:1})}>
                    <option value="">{busy==="tables"?"Loading tables…":(baseId?"Select a table…":"Pick a base first")}</option>
                    {tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11.5, fontWeight:700, color:"var(--muted)" }}>Keyword column</label>
                  <select value={keywordField} onChange={e=>chooseField(e.target.value)} disabled={!selectedTable} style={Object.assign({},SEL_STYLE,{opacity:!selectedTable?.55:1})}>
                    <option value="">{selectedTable?"Select a column…":"Pick a table first"}</option>
                    {selectedTable&&(selectedTable.fields||[]).map(f=><option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop:16, display:"flex", gap:10, padding:"12px 14px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
                <Icon name="sparkles" size={17} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} />
                <span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Sentinel fills <b>only the keyword column</b> — one row per content-gap keyword (topics you don't have a page for yet, from your rankings, sitemap, competitors &amp; trending). Existing keywords are skipped. Your Airtable automation writes the articles.</span>
              </div>
            </SoftCard>
          )}

          {/* Step 3 — push */}
          {connected && (
            <SoftCard hover={false}>
              <SectionHead sub="Finds content-gap keywords for this site and adds the new ones">3 · Push keywords</SectionHead>
              {ready ? (
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  <NeoButton kind="primary" icon={busy==="push"?undefined:"upload"} disabled={busy==="push"} onClick={pushKeywords}>{busy==="push"&&<Icon name="cog" size={16} className="audit-spin" />}{busy==="push"?"Pushing…":"Push content-gap keywords"}</NeoButton>
                  <span style={{ fontSize:12.5, color:"var(--muted)" }}>→ <b>{selectedTable&&selectedTable.name}</b> · column <b>{keywordField}</b></span>
                </div>
              ) : (
                <div style={{ fontSize:13, color:"var(--muted)" }}>Choose a base, table and keyword column above to enable pushing.</div>
              )}
            </SoftCard>
          )}

          {/* Embedded editable grid — manage the table without leaving the app.
              Change a row's Status (e.g. "Write Article") to trigger the n8n flow. */}
          {ready && (
            <div>
              <SectionHead sub="View & edit your Airtable records here. Set Status to trigger the n8n article workflow — no need to open Airtable.">Records — manage in-place</SectionHead>
              <AirtableGrid ctx={ctx} siteId={s.id} />
            </div>
          )}

          {/* sync log */}
          {log.length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub="Recent keyword pushes to Airtable">Push Log</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {log.map((l,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:l.status==="ok"?"var(--t-100)":"var(--clay-bg)", color:l.status==="ok"?"var(--t-700)":"var(--clay)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={l.status==="ok"?"check":"alert"} size={14} /></div>
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{l.kind==="keywords"?"Keywords":l.kind==="gaps"?"Keyword gaps":l.kind==="content"?"Content suggestions":"AI citation results"}</span>
                    <span style={{ fontSize:12.5, fontWeight:700, color:"var(--t-700)" }}>{l.records_pushed} {l.kind==="keywords"?"added":"rows"}</span>
                    <span style={{ fontSize:11.5, color:"var(--muted)" }}>{window.timeAgo?window.timeAgo(l.created_at):""}</span>
                  </div>
                ))}
              </div>
            </SoftCard>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Shared chat hook (history + images + resume) ---------- */
function useChat(siteId) {
  const API = window.SentinelAPI;
  const [msgs,setMsgs] = useState([]);
  const [history,setHistory] = useState([]);  // Claude api_history (resume context)
  const [busy,setBusy] = useState(false);
  const [convoId,setConvoId] = useState(null);
  const abortRef = useRef(null);
  // Mirror history in a ref so send() always reads the LATEST memory (never a stale
  // closure). This is what stops the assistant "forgetting" a plan on a fast follow-up.
  const historyRef = useRef([]);
  const applyHistory = (h)=>{ const v=h||[]; historyRef.current=v; setHistory(v); };
  // Generation counter: any context change (site switch, New chat, resume) bumps it and aborts
  // the in-flight stream, so a late response from a PREVIOUS context can never write its history/
  // convoId into the new one (cross-client leak). Every send tags itself with the current gen and
  // gates all its state writes on it.
  const genRef = useRef(0);
  const invalidate = ()=>{ genRef.current++; if(abortRef.current){ try{ abortRef.current.abort(); }catch(e){} abortRef.current=null; } setBusy(false); };
  useEffect(()=>{ invalidate(); setMsgs([]); applyHistory([]); setConvoId(null); },[siteId]);
  const stop = ()=>{ if(abortRef.current){ try{ abortRef.current.abort(); }catch(e){} } };

  // send: text + optional images. STREAMS the reply token-by-token via SSE.
  const send = async (text, images)=>{
    const t=(text||"").trim(); const imgs=(images||[]);
    if((!t&&!imgs.length)||busy||!siteId) return;
    const myGen=genRef.current;             // this send belongs to the current context…
    const fresh=()=>genRef.current===myGen; // …still current? (no site switch / New chat / resume since)
    const userMsg={ role:"user", text:t, images:imgs.map(i=>i.url) };
    const nextDisplay=[...msgs,userMsg];
    // add the user msg + an empty assistant msg we stream into
    setMsgs([...nextDisplay,{role:"assistant",text:"",tools:[],streaming:true}]);
    setBusy(true);
    const cfg=window.SENTINEL_CONFIG||{};
    const ctrl=new AbortController(); abortRef.current=ctrl;
    const apply=(fn)=>{ if(!fresh()) return; setMsgs(m=>{ const a=[...m]; const last=a[a.length-1]; if(last&&last.role==="assistant") a[a.length-1]=fn(last); return a; }); };
    try{
      const res=await fetch((cfg.engineApi!=null?cfg.engineApi:"http://localhost:8787")+"/chat-stream",{
        method:"POST", headers:{"Content-Type":"application/json", ...(window.sentinelKeyHeaders?window.sentinelKeyHeaders():{})}, signal:ctrl.signal,
        body:JSON.stringify({ siteId, text:t, images:imgs.map(i=>i.url), apiHistory:historyRef.current, displayMessages:nextDisplay, conversationId:convoId }),
      });
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf="";
      for(;;){
        const {done,value}=await reader.read(); if(done) break;
        buf+=dec.decode(value,{stream:true});
        const chunks=buf.split("\n\n"); buf=chunks.pop()||"";
        for(const ch of chunks){
          const ev=(ch.match(/event: (\w+)/)||[])[1]; const dm=(ch.match(/data: (.+)/s)||[])[1];
          if(!ev||!dm) continue; let d; try{ d=JSON.parse(dm); }catch{ continue; }
          if(ev==="delta") apply(a=>({...a,text:a.text+d.text}));
          else if(ev==="tools") apply(a=>({...a,tools:[...new Set([...(a.tools||[]),...d.tools])]}));
          else if(ev==="done"){ apply(a=>({...a,streaming:false,tools:d.toolsUsed||a.tools}));
              // Only adopt this response's memory/convo if the context hasn't changed since we sent
              // it — otherwise a stale stream would poison a DIFFERENT site's chat (cross-client leak).
              if(fresh()){
                if(d.apiHistory) applyHistory(d.apiHistory);
                if(d.conversationId){ setConvoId(d.conversationId);
                  if(!d.apiHistory) API.chatLoad(d.conversationId).then(rr=>{ if(fresh()&&rr.conversation&&rr.conversation.api_history) applyHistory(rr.conversation.api_history); }).catch(()=>{}); } } }
          else if(ev==="error") apply(a=>({...a,text:(a.text||"")+"\n⚠️ "+d.error,streaming:false}));
        }
      }
      apply(a=>({...a,streaming:false}));
    }catch(e){
      if(e.name==="AbortError"){ apply(a=>({...a,text:(a.text||"")+(a.text?"\n\n_(stopped)_":"_(stopped)_"),streaming:false,stopped:true})); }
      else if(fresh()) setMsgs(m=>{ const a=[...m]; const last=a[a.length-1]; if(last&&last.role==="assistant"&&!last.text) a[a.length-1]={...last,text:"⚠️ "+e.message,streaming:false}; return a; });
    }
    finally{ if(fresh()){ setBusy(false); abortRef.current=null; } }
  };
  const reset = ()=>{ invalidate(); setMsgs([]); applyHistory([]); setConvoId(null); };
  // resume a saved conversation (abort any in-flight stream first so it can't clobber the
  // load — and gen-check the RESPONSE too, so a slow load finishing after a site switch
  // can't inject another site's history into the current one)
  const load = (id)=>{
    invalidate();
    const myGen=genRef.current;
    API.chatLoad(id).then(r=>{
      if(genRef.current!==myGen) return;   // context changed while loading — discard
      const c=r.conversation; if(!c) return;
      setMsgs(c.messages||[]); applyHistory(c.api_history||[]); setConvoId(c.id);
    }).catch(()=>{});
  };
  return { msgs, busy, send, stop, reset, load, convoId };
}

/* Voice input hook (Web Speech API). */
function useVoice(onText, getBase){
  const [listening,setListening] = useState(false);
  const recRef = useRef(null);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const toggle = (toast)=>{
    if(!SR){ toast&&toast("Voice needs Chrome/Edge","gold"); return; }
    if(listening){ try{ recRef.current&&recRef.current.stop(); }catch(e){} return; }
    const rec=new SR(); rec.lang="en-US"; rec.interimResults=true; rec.continuous=false;
    const base=(getBase?getBase():"")||""; const sep=base?base+" ":"";
    rec.onresult=(e)=>{ let t=""; for(let i=e.resultIndex;i<e.results.length;i++) t+=e.results[i][0].transcript; onText(sep+t); };
    rec.onerror=(e)=>{ setListening(false); if(e.error!=="aborted"&&e.error!=="no-speech") toast&&toast("Mic: "+e.error,"clay"); };
    rec.onend=()=>setListening(false);
    recRef.current=rec; setListening(true); rec.start();
  };
  return { listening, toggle, supported:!!SR };
}

const TOOL_LABEL = { get_site_overview:"site overview", list_pages:"site pages", get_semrush_keywords:"DataForSEO keywords", get_keyword_gaps:"keyword gaps", get_content_intel:"content analysis", get_geo_visibility:"AI visibility", get_latest_audit:"latest audit", fetch_url:"web page" };

/* ---------------- Dedicated AI Chat screen (Claude-style) ---------------- */
function ChatScreen({ ctx }) {
  const API = window.SentinelAPI;
  const sites = ctx.sites.filter(s=>s.status==="connected");
  const [chatSite,setChatSite] = useState(ctx.site && ctx.site.status==="connected" ? ctx.site.id : (sites[0]&&sites[0].id));
  const [guideOpen,setGuideOpen] = useState(false);
  const chatGuide = ((typeof window!=="undefined" && window.PAGE_GUIDES) || {})["ai-strategist"] || null;
  const active = ctx.sites.find(s=>s.id===chatSite);
  const { msgs, busy, send, stop, reset, load, convoId } = useChat(chatSite);
  const [input,setInput] = useState("");
  const [convos,setConvos] = useState([]);
  const [imgs,setImgs] = useState([]);          // pending attachments [{url,name}]
  const [uploading,setUploading] = useState(false);
  const bodyRef = useRef(null);
  const fileRef = useRef(null);
  const voice = useVoice(setInput, ()=>input);
  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop=bodyRef.current.scrollHeight; },[msgs,busy]);

  // load conversation list for this site; refresh after each exchange
  const refreshList = ()=>{ if(chatSite) API.chatList(chatSite).then(r=>setConvos(r.conversations||[])).catch(()=>{}); };
  useEffect(()=>{ setImgs([]); refreshList(); },[chatSite]);
  useEffect(()=>{ if(!busy) refreshList(); },[busy]);

  const submit = ()=>{ if(input.trim()||imgs.length){ send(input, imgs); setInput(""); setImgs([]); } };
  // Seed from elsewhere (e.g. Content Decay → "Fix in chat"). Prefilled, not
  // auto-sent, so you review before the agentic assistant acts.
  useEffect(()=>{ try{ const seed=window.SENTINEL_CHAT_SEED; if(seed){ window.SENTINEL_CHAT_SEED=null; setInput(seed); } }catch(e){} },[]);

  const onPickFiles = (files)=>{
    if(!chatSite) return;
    setUploading(true);
    const arr=[...files].slice(0,4);
    Promise.all(arr.map(f=> new Promise(res=>{
      const reader=new FileReader();
      reader.onload=()=>API.chatUploadImage(chatSite, reader.result).then(r=>res({url:r.url,name:f.name})).catch(()=>res(null));
      reader.readAsDataURL(f);
    }))).then(results=>{ setImgs(p=>[...p,...results.filter(Boolean)]); }).finally(()=>setUploading(false));
  };

  const suggestions = [
    "What content gaps should I fill?",
    "What are my biggest SEO opportunities right now?",
    "Which keywords am I close to ranking page 1 for?",
    "How is my AI citation visibility vs competitors?",
    "Write an article brief for my highest-impact gap",
  ];

  return (
    <div className="rise" style={{ height:"calc(100vh - 150px)", display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, marginBottom:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <h1 style={{ margin:0, fontSize:28, fontWeight:800, letterSpacing:"-.025em", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ width:38, height:38, borderRadius:12, background:"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4", display:"grid", placeItems:"center" }}><Icon name="sparkles" size={20} /></span>
              AI Strategist
            </h1>
            {chatGuide && (
              <button onClick={()=>setGuideOpen(o=>!o)} title="How to use this page"
                style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:"var(--r-pill)", border:"none", cursor:"pointer", background:"var(--bg)", boxShadow:guideOpen?"var(--neo-in)":"var(--neo-sm)", color:guideOpen?"var(--t-700)":"var(--muted)", fontSize:11.5, fontWeight:700 }}>
                <Icon name="help" size={13} />How to use
              </button>
            )}
          </div>
          <p style={{ margin:"6px 0 0", fontSize:14, color:"var(--muted)" }}>Connected to your live data — audits, keywords, gaps, AI visibility.</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:"var(--muted)" }}>Working on</span>
          <div style={{ position:"relative" }}>
            <select value={chatSite||""} onChange={e=>setChatSite(e.target.value)}
              style={{ appearance:"none", padding:"10px 38px 10px 14px", borderRadius:"var(--r-pill)", border:"none", background:"var(--surface)", boxShadow:"var(--neo-sm)", fontSize:13.5, fontWeight:700, color:"var(--ink)", fontFamily:"var(--ff)", cursor:"pointer", outline:"none" }}>
              {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Icon name="chevD" size={16} style={{ position:"absolute", right:14, top:13, color:"var(--faint)", pointerEvents:"none" }} />
          </div>
          {msgs.length>0 && <NeoButton kind="soft" size="sm" icon="doc" onClick={()=>{ const c=convos.find(x=>x.id===convoId); window.SentinelHelpers.exportConversation(c?c.title:"Conversation", msgs, active&&active.name); ctx.toast("Conversation exported (Markdown)","teal"); }}>Export</NeoButton>}
        </div>
      </div>

      {chatGuide && guideOpen && <PageGuidePanel guide={chatGuide} onClose={()=>setGuideOpen(false)} />}

      <div style={{ flex:1, display:"flex", gap:16, minHeight:0 }}>
        {/* history sidebar */}
        <SoftCard hover={false} pad={0} style={{ width:236, flexShrink:0, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid var(--line-soft)" }}>
            <NeoButton kind="primary" size="sm" icon="plus" full onClick={reset}>New chat</NeoButton>
          </div>
          <div className="scroll" style={{ flex:1, padding:"8px", display:"flex", flexDirection:"column", gap:4, minHeight:0 }}>
            <div style={{ padding:"6px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>History</div>
            {convos.length===0 && <div style={{ padding:"10px", fontSize:12, color:"var(--muted)" }}>No saved chats yet.</div>}
            {convos.map(c=>(
              <div key={c.id} className="nav-item row-link" onClick={()=>load(c.id)} role="button"
                style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 10px", borderRadius:10, background:convoId===c.id?"var(--bg)":"transparent", boxShadow:convoId===c.id?"var(--neo-in)":"none", cursor:"pointer" }}>
                <Icon name="sparkles" size={13} style={{ color:"var(--t-600)", flexShrink:0 }} />
                <span style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title}</span>
                <button onClick={e=>{ e.stopPropagation(); API.chatDelete(c.id).then(()=>{ refreshList(); if(convoId===c.id) reset(); }); }} className="tip" data-tip="Delete" style={{ color:"var(--faint)", flexShrink:0, opacity:.6 }}><Icon name="x" size={13} /></button>
              </div>
            ))}
          </div>
        </SoftCard>

        <SoftCard hover={false} pad={0} style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
        <div ref={bodyRef} className="scroll" style={{ flex:1, padding:"24px 28px", display:"flex", flexDirection:"column", gap:16, minHeight:0 }}>
          {msgs.length===0 && (
            <div style={{ margin:"auto", maxWidth:560, textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
              <div style={{ width:60, height:60, borderRadius:18, background:"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4", display:"grid", placeItems:"center", boxShadow:"var(--neo)" }}><Icon name="sparkles" size={30} /></div>
              <div><div style={{ fontSize:19, fontWeight:800 }}>How can I help with {active?active.name:"your site"}?</div>
                <div style={{ fontSize:14, color:"var(--muted)", marginTop:6 }}>I can see this site's audits, keywords, competitor gaps and AI-visibility. Ask me anything strategic — I'll pull the real numbers.</div></div>
              <div style={{ display:"flex", flexDirection:"column", gap:9, width:"100%", marginTop:6 }}>
                {suggestions.map((q,i)=>(
                  <button key={i} onClick={()=>send(q)} className="nav-item row-link" style={{ textAlign:"left", padding:"13px 16px", borderRadius:14, background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, fontWeight:600, color:"var(--ink-2)", display:"flex", alignItems:"center", gap:11 }}>
                    <Icon name="sparkles" size={15} style={{ color:"var(--t-700)", flexShrink:0 }} />{q}<Icon name="chevR" size={15} style={{ color:"var(--faint)", marginLeft:"auto" }} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m,i)=>(
            <div key={i} style={{ display:"flex", gap:13, justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              {m.role==="assistant" && <div style={{ width:34, height:34, borderRadius:11, background:"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4", display:"grid", placeItems:"center", flexShrink:0, boxShadow:"var(--neo-sm)" }}><Icon name="sparkles" size={17} /></div>}
              <div style={{ maxWidth:m.role==="user"?"70%":"82%" }}>
                {m.role==="assistant" && m.tools && m.tools.length>0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                    {[...new Set(m.tools)].map((t,j)=><span key={j} style={{ fontSize:11, fontWeight:700, color:"var(--t-700)", background:"var(--t-50)", padding:"3px 9px", borderRadius:99, display:"inline-flex", alignItems:"center", gap:5 }}><Icon name="check" size={11} sw={2.6} />{TOOL_LABEL[t]||t}</span>)}
                  </div>
                )}
                {m.role==="assistant" ? (
                  (m.streaming && !m.text) ? (
                    <div style={{ padding:"14px 18px", borderRadius:"4px 16px 16px 16px", background:"var(--bg)", boxShadow:"var(--neo-in)", color:"var(--muted)", fontSize:13, display:"flex", alignItems:"center", gap:9 }}><Icon name="cog" size={15} className="audit-spin" />{(m.tools&&m.tools.length)?"Reading "+(TOOL_LABEL[m.tools[m.tools.length-1]]||"data")+"…":"Thinking…"}</div>
                  ) : (
                    <div className="md" style={{ padding:"15px 18px", borderRadius:"4px 16px 16px 16px", background:"var(--bg)", boxShadow:"var(--neo-in)" }}
                      dangerouslySetInnerHTML={{ __html:((window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(m.text))||m.text)+(m.streaming?'<span class="stream-cursor"></span>':'') }} />
                  )
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:7, alignItems:"flex-end" }}>
                    {m.images && m.images.length>0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"flex-end" }}>
                        {m.images.map((u,k)=><img key={k} src={u} alt="" style={{ maxWidth:160, maxHeight:160, borderRadius:12, boxShadow:"var(--neo-sm)" }} />)}
                      </div>
                    )}
                    {m.text && <div style={{ padding:"12px 16px", borderRadius:"16px 16px 4px 16px", background:"var(--t-700)", color:"#F3EFE4", boxShadow:"var(--neo-sm)", fontSize:13.5, lineHeight:1.55, whiteSpace:"pre-wrap" }}>{m.text}</div>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* pending image attachments */}
        {(imgs.length>0||uploading) && (
          <div style={{ padding:"10px 20px 0", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            {imgs.map((im,k)=>(
              <div key={k} style={{ position:"relative" }}>
                <img src={im.url} alt="" style={{ width:54, height:54, objectFit:"cover", borderRadius:10, boxShadow:"var(--neo-in)" }} />
                <button onClick={()=>setImgs(imgs.filter((_,j)=>j!==k))} style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:99, background:"var(--clay)", color:"#fff", display:"grid", placeItems:"center", boxShadow:"var(--neo-xs)" }}><Icon name="x" size={12} sw={2.6} /></button>
              </div>
            ))}
            {uploading && <span style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><Icon name="cog" size={13} className="audit-spin" />Uploading…</span>}
          </div>
        )}
        {/* composer */}
        <div style={{ padding:"14px 20px 16px", borderTop:"1px solid var(--line-soft)", display:"flex", gap:11, alignItems:"flex-end" }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>{ onPickFiles(e.target.files); e.target.value=""; }} />
          <button onClick={()=>fileRef.current&&fileRef.current.click()} className="neo-btn tip" data-tip="Attach image" aria-label="Attach image"
            style={{ width:46, height:46, borderRadius:14, background:"var(--surface)", color:"var(--t-700)", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", flexShrink:0 }}><Icon name="image" size={20} /></button>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } }}
            placeholder={voice.listening?"Listening…":`Ask about ${active?active.name:"this site"}, or attach an image…`} rows={1} className="search-in"
            style={{ flex:1, resize:"none", maxHeight:130, padding:"13px 16px", borderRadius:16, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:14, color:"var(--ink)", outline:"none", fontFamily:"var(--ff)" }} />
          <button onClick={()=>voice.toggle(ctx.toast)} className="neo-btn tip" data-tip={voice.listening?"Stop":"Voice"} aria-label="Voice input"
            style={{ width:46, height:46, borderRadius:14, background:voice.listening?"var(--clay)":"var(--surface)", color:voice.listening?"#F3EFE4":"var(--t-700)", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", flexShrink:0, position:"relative" }}>
            <Icon name="mic" size={20} />{voice.listening && <span style={{ position:"absolute", top:8, right:9, width:7, height:7, borderRadius:99, background:"#F3EFE4", animation:"pulse 1.2s infinite" }} />}
          </button>
          {busy ? (
            <button onClick={stop} className="neo-btn tip" data-tip="Stop generating" aria-label="Stop"
              style={{ width:46, height:46, borderRadius:14, background:"var(--clay)", color:"#F3EFE4", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", flexShrink:0 }}>
              <span style={{ width:15, height:15, borderRadius:4, background:"#F3EFE4" }} />
            </button>
          ) : (
            <button onClick={submit} disabled={!input.trim()&&!imgs.length} className="neo-btn" style={{ width:46, height:46, borderRadius:14, background:"var(--t-700)", color:"#F3EFE4", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", opacity:(!input.trim()&&!imgs.length)?.5:1, flexShrink:0 }}><Icon name="chevR" size={20} sw={2.4} /></button>
          )}
        </div>
      </SoftCard>
      </div>
    </div>
  );
}

/* ---------------- AI Assistant (floating chatbot) ---------------- */
function Assistant({ ctx, open, setOpen }) {
  const s = ctx.site;
  // Use the shared streaming chat hook (SSE) — same as the full chat screen — so
  // the floating assistant shows progressive output and survives proxy timeouts
  // instead of sitting on a blocking request that can drop with "Failed to fetch".
  // load/convoId give the mini window the same resumable history as the full chat screen —
  // previously it could only ever show the CURRENT exchange, so closing it lost everything.
  const { msgs, busy, send:sendChat, reset, load, convoId } = useChat(s.id);
  const API = window.SentinelAPI;
  const [input,setInput] = useState("");
  const [showHist,setShowHist] = useState(false);
  const [convos,setConvos] = useState([]);
  const loadConvos = ()=>{ if(!API||!API.chatList) return; API.chatList(s.id).then(r=>setConvos((r&&r.conversations)||[])).catch(()=>{}); };
  // refresh the list when the panel opens, and after each exchange finishes (new/renamed convo)
  useEffect(()=>{ if(open) loadConvos(); },[open, s.id]);   // eslint-disable-line
  useEffect(()=>{ if(!busy && open) loadConvos(); },[busy, convoId]);   // eslint-disable-line
  const bodyRef = useRef(null);
  const voice = useVoice(setInput, ()=>input);
  const listening = voice.listening;
  const toggleMic = ()=>voice.toggle(ctx.toast);
  useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop=bodyRef.current.scrollHeight; },[msgs,busy]);

  const send = (text)=>{ const t=(text||input).trim(); if(!t||busy) return; sendChat(t); setInput(""); };
  const quick = [
    "Extract keywords from a URL…",
    "Write an SEO article about…",
    "What content gaps should I fill?",
  ];

  return (
    <>
      {/* floating launcher */}
      <button className="neo-btn" onClick={()=>setOpen(!open)} aria-label="AI assistant"
        style={{ position:"fixed", right:26, bottom:26, width:58, height:58, borderRadius:20, zIndex:110,
          background:open?"var(--dark)":"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4",
          display:"grid", placeItems:"center", boxShadow:"6px 8px 24px rgba(20,90,82,.4)" }}>
        <Icon name={open?"chevD":"sparkles"} size={24} />
      </button>

      {open && (
        <div style={{ position:"fixed", right:26, bottom:96, width:400, maxWidth:"calc(100vw - 40px)", height:560, maxHeight:"calc(100vh - 130px)", zIndex:110,
          background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo)", display:"flex", flexDirection:"column", overflow:"hidden", animation:"pop .18s both", border:"1px solid var(--line-soft)" }}>
          {/* header */}
          <div style={{ display:"flex", alignItems:"center", gap:11, padding:"15px 18px", borderBottom:"1px solid var(--line-soft)" }}>
            <div style={{ width:36, height:36, borderRadius:11, background:"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)" }}><Icon name="sparkles" size={18} /></div>
            <div style={{ flex:1 }}><div style={{ fontSize:14.5, fontWeight:800 }}>SEO Assistant</div><div style={{ fontSize:11.5, color:"var(--muted)" }}>scoped to {s.name}</div></div>
            <button onClick={()=>{ setShowHist(v=>{ const n=!v; if(n) loadConvos(); return n; }); }} className="neo-btn tip" data-tip="Past conversations" style={{ width:32, height:32, borderRadius:9, background:showHist?"var(--t-100)":"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:showHist?"var(--t-700)":"var(--muted)" }}><Icon name="clock" size={15} /></button>
            <button onClick={()=>{ setOpen(false); ctx.goto("chat"); }} className="neo-btn tip" data-tip="Open full chat" style={{ width:32, height:32, borderRadius:9, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="upload" size={15} /></button>
            <button onClick={()=>{ reset(); setShowHist(false); }} className="neo-btn tip" data-tip="New chat" style={{ width:32, height:32, borderRadius:9, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="edit" size={15} /></button>
          </div>
          {/* history — resume any past conversation for this site */}
          {showHist && (
            <div className="scroll" style={{ maxHeight:180, overflowY:"auto", borderBottom:"1px solid var(--line-soft)", background:"var(--bg-2)", padding:"6px 8px" }}>
              {convos.length===0 && <div style={{ fontSize:12, color:"var(--muted)", padding:"8px 6px" }}>No saved conversations yet — they appear here once you've chatted.</div>}
              {convos.map(c=>(
                <div key={c.id} onClick={()=>{ load(c.id); setShowHist(false); }}
                  style={{ padding:"8px 10px", borderRadius:9, cursor:"pointer", background:c.id===convoId?"var(--t-100)":"transparent", display:"flex", gap:8, alignItems:"center" }}>
                  <Icon name="doc" size={13} style={{ color:"var(--muted)", flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:12.5, fontWeight:c.id===convoId?700:600, color:"var(--ink-2)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title||"Conversation"}</span>
                  <span style={{ fontSize:10.5, color:"var(--faint)", flexShrink:0 }}>{c.updated_at?new Date(c.updated_at).toLocaleDateString():""}</span>
                </div>
              ))}
            </div>
          )}
          {/* messages */}
          <div ref={bodyRef} className="scroll" style={{ flex:1, padding:"16px 16px 8px", display:"flex", flexDirection:"column", gap:12 }}>
            {msgs.length===0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"10px 4px" }}>
                <div style={{ fontSize:13.5, color:"var(--ink-2)", lineHeight:1.5 }}>Hi — I'm your SEO assistant for <b>{s.name}</b>. Paste a link to extract keywords or write an article, or ask anything.</div>
                {quick.map((q,i)=><button key={i} onClick={()=>setInput(q.replace("…",""))} className="nav-item" style={{ textAlign:"left", padding:"10px 12px", borderRadius:11, background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, fontWeight:600, color:"var(--ink-2)" }}><Icon name="sparkles" size={13} style={{ color:"var(--t-700)", marginRight:7 }} />{q}</button>)}
              </div>
            )}
            {msgs.map((m,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                {m.role==="assistant" ? (
                  <div className="md" style={{ maxWidth:"90%", padding:"11px 14px", borderRadius:"14px 14px 14px 4px", background:"var(--bg)", boxShadow:"var(--neo-in)" }}
                    dangerouslySetInnerHTML={{ __html: (window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(m.text))||m.text }} />
                ) : (
                  <div style={{ maxWidth:"86%", padding:"10px 13px", borderRadius:"14px 14px 4px 14px",
                    background:"var(--t-700)", color:"#F3EFE4",
                    boxShadow:"var(--neo-sm)", fontSize:13, lineHeight:1.55, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{m.text}</div>
                )}
              </div>
            ))}
            {busy && <div style={{ display:"flex", gap:6, padding:"8px 4px", color:"var(--muted)", fontSize:12.5, alignItems:"center" }}><Icon name="cog" size={14} className="audit-spin" />Thinking…</div>}
          </div>
          {/* input */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid var(--line-soft)", display:"flex", gap:9, alignItems:"flex-end" }}>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); } }}
              placeholder={listening?"Listening…":"Paste a link, ask, or 🎤"} rows={1} className="search-in"
              style={{ flex:1, resize:"none", maxHeight:90, padding:"11px 14px", borderRadius:16, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, color:"var(--ink)", outline:"none", fontFamily:"var(--ff)" }} />
            <button onClick={toggleMic} className="neo-btn tip" data-tip={listening?"Stop":"Voice input"} aria-label="Voice input"
              style={{ width:42, height:42, borderRadius:13, background:listening?"var(--clay)":"var(--surface)", color:listening?"#F3EFE4":"var(--t-700)", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", flexShrink:0, position:"relative" }}>
              <Icon name="mic" size={19} />{listening && <span style={{ position:"absolute", top:7, right:8, width:7, height:7, borderRadius:99, background:"#F3EFE4", animation:"pulse 1.2s infinite" }} />}
            </button>
            <button onClick={()=>send()} disabled={busy||!input.trim()} className="neo-btn"
              style={{ width:42, height:42, borderRadius:13, background:"var(--t-700)", color:"#F3EFE4", display:"grid", placeItems:"center", boxShadow:"var(--neo-sm)", opacity:(busy||!input.trim())?.5:1, flexShrink:0 }}><Icon name="chevR" size={19} sw={2.4} /></button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Playbook (guided, numbered per-site workflow) ----------
   ONE structured place: do step 1, then 2, then 3 — with a clear status for
   every step and an explicit tag for whether it writes to the LIVE site. */
function PlaybookScreen({ ctx }) {
  const s = ctx.site;
  const API = window.SentinelAPI;
  const live = API && window.SENTINEL_LIVE && s && s._rawUrl;
  const [gsc,setGsc] = useState(null);
  const [air,setAir] = useState(null);
  useEffect(()=>{ setGsc(null); setAir(null); if(API){ API.gscStatus(s.id).then(setGsc).catch(()=>{}); API.airtableStatus(s.id).then(setAir).catch(()=>{}); } },[s.id]);

  const props = ctx.proposals||[];
  const pending = props.filter(p=>p.status==="proposed"||p.status==="approved").length;
  const liveApplied = props.filter(p=>p.status==="verified").length;
  const lastAudit = (ctx.history&&ctx.history.length)? ctx.history[ctx.history.length-1] : null;
  const sc = lastAudit && lastAudit.scores;
  const composite = sc ? Math.round(((sc.performance||0)+(sc.accessibility||0)+(sc.bestPractices||0)+(sc.seo||0))/4) : null;

  const connected = s.status==="connected";
  const gscConn = !!(gsc && gsc.connected);
  const gscOk = !!(gscConn && gsc.property);
  const airOk = !!(air && air.connected && air.config && air.config.table_keywords);
  const airPushed = !!(air && air.config && air.config.last_sync);

  const STEPS = [
    { phase:"1 · Connect — one-time per site", items:[
      { title:"Connect the WordPress site", desc:"Securely link the site so the agent can read it (and write only when you arm it).", tag:"setup",
        status: connected?"done":"todo", note: connected?"Connected":"Not connected yet", go:["sites"] },
      { title:"Connect Google Search Console", desc:"Real clicks, impressions & rankings. Pick this site's GSC property.", tag:"read",
        status: gscOk?"done":(gscConn?"progress":"todo"), note: gscOk?("Property: "+gsc.property.replace(/^sc-domain:/,"").replace(/^https?:\/\//,"")):(gscConn?"Connected — pick a property":"Not connected"), go:["gsc"] },
      { title:"Connect the site's Airtable base", desc:"Pick this site's base + keyword column. Airtable then writes the articles.", tag:"offsite",
        status: airOk?"done":"todo", note: airOk?"Base & keyword column set":"Not configured", go:["airtable"] },
    ]},
    { phase:"2 · Analyse — read-only, nothing goes live", items:[
      { title:"Run a site audit", desc:"Lighthouse performance, SEO, accessibility & best-practices → a prioritised findings list.", tag:"read",
        status: lastAudit?"done":"todo", note: lastAudit?("Latest composite "+composite+"/100"):"No audit run yet", go:["audits"] },
      { title:"Review content opportunities", desc:"Keyword clusters & content gaps from your rankings, competitors and trends.", tag:"read",
        status:"todo", note:"Find gaps for new articles", go:["plan"] },
    ]},
    { phase:"3 · Improve — this is where changes happen", items:[
      { title:"Approve & apply on-page fixes", desc:"Meta, titles, schema, internal links — you review each, then it's written to the live site.", tag:"live",
        status: pending>0?"progress":(liveApplied>0?"done":"todo"),
        note: pending>0?(pending+" fix(es) awaiting your approval"):(liveApplied>0?(liveApplied+" fix(es) applied to the live site"):"Run an audit, then propose fixes"), go:["review"] },
      { title:"Optimise images to WebP", desc:"Compress heavy images and upload WebP copies to the media library (60–80% lighter).", tag:"live",
        status:"todo", note:"Scan & optimise the heaviest images", go:["optimize","images"] },
      { title:"Push keywords to Airtable", desc:"Send content-gap keywords into the keyword column so Airtable generates the articles.", tag:"offsite",
        status: airPushed?"done":"todo", note: airPushed?("Last pushed "+(window.timeAgo?window.timeAgo(air.config.last_sync):"recently")):(airOk?"Ready — push content-gap keywords":"Configure Airtable first"), go:["airtable"] },
    ]},
    { phase:"4 · Automate — hands-off from here", items:[
      { title:"Automation is running", desc:"Daily auto-indexing to Google, ranking-drop & content-decay alerts, weekly keyword push — all logged.", tag:"auto",
        status:"auto", note:"Active — results appear in Activity", go:["activity"] },
    ]},
  ];

  const allItems = STEPS.flatMap(p=>p.items);
  const doneCount = allItems.filter(i=>i.status==="done"||i.status==="auto").length;
  const STATUS = {
    done:{tone:"teal", icon:"check", label:"Done"},
    todo:{tone:"gray", icon:"dots", label:"To do"},
    progress:{tone:"gold", icon:"clock", label:"Action needed"},
    auto:{tone:"plum", icon:"sparkles", label:"Automatic"},
  };
  const TAG = {
    live:{tone:"clay", label:"Writes to LIVE site"},
    offsite:{tone:"plum", label:"Off-site (Airtable/Google)"},
    read:{tone:"teal", label:"Read-only"},
    setup:{tone:"gray", label:"Setup"},
    auto:{tone:"plum", label:"Automatic"},
  };

  let n=0;
  return (
    <div className="rise">
      <PageHead title="Playbook" sub={`The standard step-by-step process for ${s.name}. Work top to bottom — each step shows its status and whether it touches the live site.`}>
        <Chip tone={doneCount>=allItems.length?"teal":"gold"} size="sm" icon="check">{doneCount}/{allItems.length} done</Chip>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to begin — start with step 1 below.</div></SoftCard>}

      {/* legend */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", margin:"2px 2px 18px", fontSize:11.5, color:"var(--muted)" }}>
        <span style={{ fontWeight:700 }}>Tags:</span>
        <Chip tone="clay" size="sm">Writes to LIVE site</Chip>
        <Chip tone="plum" size="sm">Off-site (Airtable/Google)</Chip>
        <Chip tone="teal" size="sm">Read-only</Chip>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
        {STEPS.map((ph,pi)=>(
          <div key={pi}>
            <div style={{ fontSize:12, fontWeight:800, letterSpacing:".03em", textTransform:"uppercase", color:"var(--t-700)", margin:"2px 2px 11px" }}>{ph.phase}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {ph.items.map((it,ii)=>{ n++; const st=STATUS[it.status]; const tg=TAG[it.tag]; const done=it.status==="done"||it.status==="auto";
                return (
                  <SoftCard key={ii} hover={false} style={{ padding:"15px 18px" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:15 }}>
                      <div style={{ width:40, height:40, borderRadius:13, flexShrink:0, display:"grid", placeItems:"center", fontWeight:800, fontSize:16,
                        background: done?"var(--t-100)":"var(--bg)", color: done?"var(--t-700)":"var(--muted)", boxShadow: done?"var(--neo-xs)":"var(--neo-in)" }}>
                        {done? <Icon name="check" size={20} /> : n}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:14.5, fontWeight:800 }}>{it.title}</span>
                          <Chip tone={st.tone} size="sm" icon={st.icon}>{st.label}</Chip>
                          <Chip tone={tg.tone} size="sm">{tg.label}</Chip>
                        </div>
                        <div style={{ fontSize:12.5, color:"var(--muted)", marginTop:4, lineHeight:1.5 }}>{it.desc}</div>
                        <div style={{ fontSize:12, color: it.status==="progress"?"var(--gold)":(it.status==="done"?"var(--t-700)":"var(--ink-2)"), marginTop:6, fontWeight:700 }}>{it.note}</div>
                      </div>
                      <NeoButton kind={done?"soft":"primary"} size="sm" iconR="chevR" onClick={()=>ctx.goto(it.go[0], it.go[1])}>{done?"View":"Open"}</NeoButton>
                    </div>
                  </SoftCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
function App() {
  const [collapsed, setCollapsed] = useState(()=>{ try{return localStorage.getItem("sentinel-collapsed")==="1";}catch(e){return false;} });
  const [screen, setScreen] = useState("playbook");
  const [navTab, setNavTab] = useState(null);   // deep-link target sub-tab for the next screen
  const [sites, setSites] = useState(window.SITES);
  const [siteId, setSiteId] = useState((window.SITES[0]&&window.SITES[0].id)||"atlas");
  const [proposals, setProposals] = useState(window.PROPOSALS);
  const [killSwitch, setKillSwitch] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [auditing, setAuditing] = useState(false);
  const auditStartRef = useRef(0);          // when the current audit began (stuck-flag recovery)
  const [auditError, setAuditError] = useState(null);   // surfaced by the modal instead of a false "complete"
  const [auditPages, setAuditPages] = useState(null);   // multi-page audit progress {done,total,current}
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addSiteFor, setAddSiteFor] = useState(null);
  const [runAuditOpen, setRunAuditOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [history, setHistory] = useState([]);
  // Findings are PER-SITE: tagged with the site they belong to so switching sites
  // (or rerunning) never shows another site's findings. Hydrated from the latest
  // saved audit on site change; overwritten by runAudit for the active site only.
  const [findingsState, setFindingsState] = useState({ siteId:null, items:[] });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [geo, setGeo] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState("");
  const [, forceTick] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Update detection: an SPA tab left open for days keeps running OLD code after every
  // deploy — fixes look like they "didn't work" until a manual reload. Poll /status's
  // buildId (bundle mtime) every 5 min; on change, show a fixed Reload banner.
  const [staleBuild, setStaleBuild] = useState(false);
  useEffect(()=>{
    const cfg = window.SENTINEL_CONFIG||{};
    const base = cfg.engineApi!=null?cfg.engineApi:"";
    let initial=null, stop=false;
    const check=()=>fetch(base+"/status").then(r=>r.json()).then(s=>{
      if(stop||!s||!s.buildId) return;
      if(initial===null){ initial=s.buildId; return; }
      if(s.buildId!==initial) setStaleBuild(true);
    }).catch(()=>{});
    check();
    const iv=setInterval(check, 300000);
    // hydrate the persisted (server-side) kill switch so every tab shows the truth
    if(window.SentinelAPI&&window.SentinelAPI.killSwitch) window.SentinelAPI.killSwitch().then(r=>{ if(r&&typeof r.on==="boolean") setKillSwitch(r.on); }).catch(()=>{});
    return ()=>{ stop=true; clearInterval(iv); };
  },[]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const scrollRef = useRef(null);
  const API = window.SentinelAPI;

  // Live hydration bridge: data.jsx calls this after loading Supabase data so we
  // swap the mock globals for live ones. Design/render code is unchanged.
  useEffect(()=>{
    window.__sentinelRerender = ()=>{
      setSites(window.SITES);
      setProposals(window.PROPOSALS);
      setSiteId(id=>{ const ok=window.SITES.find(s=>s.id===id); return ok?id:((window.SITES.find(s=>s.status==="connected")||window.SITES[0]||{}).id); });
      forceTick(t=>t+1);
    };
    if(window.SITES!==sites) window.__sentinelRerender();
    return ()=>{ window.__sentinelRerender=null; };
  },[]);

  useEffect(()=>{ try{localStorage.setItem("sentinel-collapsed", collapsed?"1":"0");}catch(e){} },[collapsed]);
  const site = sites.find(s=>s.id===siteId)||sites[0];
  const isLive = ()=> API && window.SENTINEL_LIVE && site && site._rawUrl;
  const toast = useCallback((msg,tone="teal")=>{ const id=Math.random().toString(36).slice(2); setToasts(t=>[...t,{id,msg,tone}]); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000); },[]);
  const goto = useCallback((k, tab)=>{ setScreen(k); setNavTab(tab||null); if(scrollRef.current) scrollRef.current.scrollTop=0; },[]);

  // Load this account's audit history whenever the active site changes (unique per account).
  const loadHistory = useCallback((sid)=>{
    const id = sid || siteId;
    if(!API || !id || String(id).length<10){ setHistory([]); return; }
    setHistoryLoading(true);
    API.listAudits(id).then(rows=>{
      const mapped=(rows||[]).slice().reverse().map(r=>({ id:r.id, ts:r.created_at, scope:r.scope, scores:r.scores||{}, cwv:r.cwv||{}, findings:r.findings||[], variance:(r.summary&&r.summary.variance)||null }));
      setHistory(mapped);
      // Hydrate this site's findings from its most-recent saved audit (order-independent).
      const latest=mapped.reduce((a,b)=>(!a||new Date(b.ts)>new Date(a.ts))?b:a,null);
      setFindingsState({ siteId:id, items:(latest&&latest.findings)||[] });
    }).catch(()=>{ setHistory([]); setFindingsState({ siteId:id, items:[] }); }).finally(()=>setHistoryLoading(false));
  },[siteId]);
  useEffect(()=>{ loadHistory(siteId); setIntel(null); setGeo(null); setGeoStatus(""); },[siteId]);
  // Keep the legacy global mirror in sync with the ACTIVE site's findings (never stale).
  useEffect(()=>{ try{ window.FINDINGS = (findingsState.siteId===siteId?findingsState.items:[])||[]; }catch(e){} },[findingsState,siteId]);

  const ctx = {
    screen, navTab, goto, site, sites, proposals, killSwitch, toast, auditing, auditError, auditPages, addSiteFor,
    notifOpen, setNotifOpen, searchQuery, setSearchQuery,
    history, historyLoading, reloadHistory:()=>loadHistory(siteId),
    findings: findingsState.siteId===siteId ? (findingsState.items||[]) : [],
    intel, intelLoading,
    geo, geoLoading, geoStatus,
    // GEO / AI-citation tracking: Claude generates buyer-intent prompts, queries
    // them with web search, measures whether THIS site gets cited by AI.
    runGeoTrack:(competitors)=>{
      if(geoLoading) return;
      if(!isLive()){ toast("Connect a live site to measure AI visibility","gold"); return; }
      setGeoLoading(true); setGeo(null); setGeoStatus("Generating buyer-intent prompts…");
      toast("Measuring AI citation visibility…","teal");
      const domain=(site._rawUrl||"").replace(/^https?:\/\//,"").replace(/\/$/,"");
      const comps=(competitors||"").split(",").map(c=>c.trim()).filter(Boolean);
      // Pass prompts from the prior run as exclusions so each scan surfaces NEW
      // buyer-intent queries to target (backend also pulls prior prompts from geo_runs).
      const priorPrompts=((geo&&geo.results)||[]).map(r=>r&&r.prompt).filter(Boolean);
      API.geoPrompts(siteId, site.name, undefined, [], priorPrompts).then(pr=>{  // backend grounds on the site's real page titles (stack.type was NOT the niche)
        const prompts=(pr.prompts||[]).slice(0,12); // cap for cost/time
        if(!prompts.length) throw new Error("Couldn't generate buyer-intent prompts — check the Claude API key.");
        setGeoStatus("Querying "+prompts.length+" prompts through AI (web search)… ~1-2 min");
        return API.geoTrack(siteId, domain, prompts, comps);
      }).then(r=>{
        if(r.error){ setGeo({ error:r.error }); toast("GEO scan: "+r.error.slice(0,50),"clay"); return; }
        setGeo(r);
        try{ API.logActivity({site_id:siteId,owner:site.owner,type:"audit",actor:"Agent",icon:"globe",text:"AI visibility scan — "+r.shareOfVoice+"% share of voice",meta:r.promptsCited+"/"+r.promptsTotal+" prompts cited"}); }catch(e){}
        toast("AI visibility: "+r.shareOfVoice+"% share of voice","teal");
        // Auto-push the scan to Airtable (best-effort; de-duped; silent if Airtable isn't set up).
        // Sends BOTH result sets: prompt citations + competitor share-of-voice.
        try{ API.airtableSync(siteId,{kinds:["geo"],geoResults:r.results||[],geoCompetitors:r.competitors||[],geoTarget:{domain:r.targetDomain,share:r.shareOfVoice,cited:r.promptsCited}}).then(res=>{ const g=res&&res.synced&&res.synced.geo; const c=res&&res.synced&&res.synced.geo_competitors; const n=(g&&g.pushed)||0, m=(c&&c.pushed)||0; if(n||m) toast("Pushed "+n+" result(s)"+(m?(" + "+m+" competitor row(s)"):"")+" to Airtable","teal"); }).catch(()=>{}); }catch(e){}
      }).catch(e=>setGeo({ error:e.message })).finally(()=>{ setGeoLoading(false); setGeoStatus(""); });
    },
    // Generate llms.txt + AI-bot robots allowlist (review-then-publish).
    runGeoEnable:()=>{
      if(!isLive()){ toast("Connect a live site first","gold"); return; }
      toast("Generating GEO artifacts…","teal");
      const pages=(site.stack? []:[]); // key pages optional
      API.geoEnable(siteId,{ siteName:site.name }).then(r=>{
        // open the artifacts in a print/preview window for review
        var w=window.open("","_blank");
        if(w){ w.document.write("<pre style='font:13px monospace;padding:24px;white-space:pre-wrap'>"+
          "=== llms.txt (publish at "+site.url+"/llms.txt) ===\n\n"+(r.llmsTxt||"").replace(/</g,"&lt;")+
          "\n\n\n=== robots.txt AI-bot rules (merge into robots.txt) ===\n\n"+(r.aiRobots||"").replace(/</g,"&lt;")+"</pre>"); w.document.close();
          toast("GEO artifacts generated — review in the new tab","teal"); }
        else { toast("GEO artifacts ready, but your browser blocked the preview tab — allow pop-ups for this site and click Preview again.","gold"); }
      }).catch(e=>toast("Failed: "+e.message,"clay"));
    },
    runContentIntel:()=>{
      if(intelLoading) return;
      if(!isLive()){ toast("Connect a live site to analyze content","gold"); return; }
      setIntelLoading(true); setIntel(null);
      toast("Analyzing content library with Claude…","teal");
      API.contentIntel(siteId, (site.stack&&site.stack.type)||undefined).then(r=>{
        if(r.error){ setIntel({ error:r.error }); toast("Content analysis: "+r.error.slice(0,50),"clay"); return; }
        setIntel(r);
        toast("Content analysis ready — "+((r.suggestions||[]).length)+" suggestions","teal");
      }).catch(e=>setIntel({ error:e.message })).finally(()=>setIntelLoading(false));
    },
    // Export the current site's audit report as a printable PDF (browser print).
    exportReport:()=>{
      const ok=window.SentinelHelpers.exportAuditPDF(site, (findingsState.siteId===siteId?findingsState.items:[])||[], proposals);
      toast(ok?"Opening printable report — choose 'Save as PDF'":"Allow pop-ups to export","teal");
    },
    // Export the activity trail as CSV.
    exportTrail:()=>{
      const rows=(window.ACTIVITY||[]).map(a=>({ time:a.t, type:a.type, who:a.who, action:a.text, meta:a.meta }));
      const ok=window.SentinelHelpers.exportCSV("sentinel-activity.csv", rows);
      toast(ok?"Activity trail exported (CSV)":"Nothing to export yet","teal");
    },
    switchSite:(id)=>{ const x=sites.find(s=>s.id===id); if(x.status!=="connected"){ setAddSiteFor(x); setAddSiteOpen(true); return; } setSiteId(id); setProposals([]); if(isLive()){ API.listProposals(id).then(rows=>{ window.PROPOSALS=(rows||[]).map(window.mapProposalRow||(y=>y)); setProposals(window.PROPOSALS); }).catch(()=>{}); } toast("Switched to "+x.name,"teal"); },
    runAudit:(scope)=>{
      // A stuck `auditing` flag used to make every later click a SILENT no-op — the modal
      // sat at 92% forever and the operator concluded "audits don't work". Now a run that
      // has clearly overrun is reclaimable, and a genuine in-flight run says so out loud
      // instead of ignoring the click.
      if(auditing){
        const startedAt = auditStartRef.current || 0;
        if(Date.now() - startedAt < 300000){ toast("An audit is already running — give it a moment.","gold"); return; }
        toast("Previous audit never finished — starting a fresh one.","gold");
      }
      const sc0 = (scope==="key"||scope==="full")?scope:"single";
      auditStartRef.current = Date.now();
      setAuditing(true); setAuditError(null); setAuditPages(null);
      toast(sc0==="single"?"Read-only audit running…":("Read-only "+(sc0==="key"?"key-pages":"sampled full-site")+" audit running…"),"teal");
      // LIVE: full audit (scores + findings + draft proposals) via the engine.
      if(isLive()){
        const url = site._rawUrl.replace(/\/$/,"")+"/";
        // Shared post-processing for BOTH paths (single call + multi-page background job) —
        // the scope selector used to be entirely dead: every choice audited one URL.
        const finish = async (res)=>{
          if(res&&res.scores){
            // NOTE: this used to chain a psi-median run (THREE more full PageSpeed passes,
            // strictly serial) straight after the audit's own Lighthouse run — roughly
            // doubling wall-clock (measured 25s + 28s) for a ±5pt noise refinement, all of
            // it displayed as a frozen 92%. The audit's own scores are used directly now;
            // the median tool is still available on the Page Fixes screen when wanted.
            let variance=null;
            const cwv=res.cwv||{};
            const sc=res.scores;
            const cwvUi={ lcp:{v:cwv.lcp?(cwv.lcp/1000).toFixed(1)+"s":"—",state:cwv.lcp<2500?"good":cwv.lcp<4000?"ni":"poor"},
              inp:{v:cwv.tbt!=null?Math.round(cwv.tbt)+"ms":"—",state:"good"},
              cls:{v:cwv.cls!=null?cwv.cls.toFixed(2):"—",state:(cwv.cls||0)<0.1?"good":"ni"} };
            setSites(prev=>prev.map(x=>x.id!==siteId?x:{...x,lastAudit:"just now",prev:x.scores,scores:sc,cwv:cwvUi,openFindings:(res.findings||[]).length}));
            // Findings feed the Audits screen — tagged to THIS site so a later
            // site-switch can't show them (and they hydrate from saved audits).
            setFindingsState({ siteId, items: res.findings||[] });
            // Persist scores + audit + activity.
            try{ await API.updateSite(siteId,{scores:sc,prev_scores:site.scores,last_audit:new Date().toISOString(),open_findings:(res.findings||[]).length}); }catch(e){}
            try{ await API.createAudit({site_id:siteId,owner:site.owner,scope:sc0,scores:sc,cwv:res.cwv,findings:res.findings,summary:variance?{variance}:null}); }catch(e){}
            try{ await API.logActivity({site_id:siteId,owner:site.owner,type:"audit",actor:"Agent",icon:"radar",text:(res.findings||[]).length+" findings · "+site.name,meta:"Perf "+sc.performance+" · SEO "+sc.seo}); }catch(e){}
            // Create draft proposals in Supabase — DE-DUPED against what's already queued.
            // Without this, every audit re-filed each finding as a fresh "proposed" row, so
            // work the user had already approved/applied was buried under new copies of the
            // same finding (20+ duplicates per finding) and looked like it had reverted.
            const drafts=res.proposals||[];
            const created=[];
            let tracked=new Set();
            try{
              const cur=await API.listProposals(siteId);
              tracked=new Set((cur||[]).filter(r=>r.status!=="dismissed").map(r=>r.finding_id));
            }catch(e){}
            for(const p of drafts){
              if(tracked.has(p.findingId)) continue;   // already in the queue (any state) — don't re-file
              try{
                const row=await API.createProposal({site_id:siteId,owner:site.owner,finding_id:p.findingId,disc:p.disc,risk:p.risk,channel:p.channel,title:p.title,page:p.page,impact:p.impact,target:p.target,field:p.field,before_val:p.before,after_val:p.after,status:"proposed"});
                created.push(row); tracked.add(p.findingId);
              }catch(e){}
            }
            // Refresh proposals from Supabase so Review Queue is live.
            try{
              const fresh=await API.listProposals(siteId);
              window.PROPOSALS=(fresh||[]).map(window.mapProposalRow||(x=>x));
              setProposals(window.PROPOSALS);
            }catch(e){}
          }
          loadHistory(siteId); // refresh the saved-audit history
          setAuditing(false); setAuditPages(null);
          toast("Audit complete — "+((res.findings||[]).length)+" findings, "+((res.proposals||[]).length)+" proposals ✓"+(res.pagesAudited?(" · "+res.pagesAudited+" page(s)"):""),"teal");
        };
        // ALL scopes run as a background job + poll now — including single. A single-page
        // audit is otherwise a 60–90s SYNCHRONOUS request (PSI ~55s + homepage metadata
        // draft), sitting right at the edge/proxy/browser response cap, so it intermittently
        // gets its socket cut and the dashboard shows "Audit failed" even though the server
        // finished — which reads as "audits don't work / aren't implementing". The background
        // job returns immediately and we poll /audit-scope-status, immune to that cap.
        API.auditScopeStart(siteId, url, sc0).then(r=>{
          if(r&&r.error){ setAuditing(false); setAuditError(r.error); toast("Audit failed: "+r.error,"clay"); return; }
          const poll=()=>{
            API.auditScopeStatus(siteId).then(st=>{
              if(st.status==="running"){ setAuditPages(st.progress||null); setTimeout(poll,5000); return; }
              if(st.status==="error"||st.error){ setAuditing(false); setAuditPages(null); setAuditError(st.error||"Audit failed"); toast("Audit failed: "+(st.error||"unknown"),"clay"); return; }
              if(st.status==="unknown"){ setAuditing(false); setAuditPages(null); setAuditError("The audit run was lost (server restart) — run it again."); return; }
              finish(st);
            }).catch(e=>{ setAuditing(false); setAuditPages(null); setAuditError(e.message); });
          };
          setTimeout(poll,4000);
        }).catch(e=>{ setAuditing(false); setAuditError(e.message||"Audit failed"); toast("Audit failed: "+e.message,"clay"); });
        return;
      }
      // MOCK fallback (design preview)
      setTimeout(()=>{
        setSites(prev=>prev.map(x=>{
          if(x.id!==siteId) return x;
          const bump=(v,by)=>Math.min(100, v+by);
          return { ...x, lastAudit:"just now", scores:{
            performance:bump(x.scores.performance,5), accessibility:bump(x.scores.accessibility,3),
            bestPractices:bump(x.scores.bestPractices,1), seo:bump(x.scores.seo,4) } };
        }));
        setAuditing(false);
        toast("Audit complete — scores updated ✓","teal");
      }, 2200);
    },
    proposeFix:(finding)=>{
      // LIVE: ask the engine for a concrete proposal, persist it, refresh queue.
      if(isLive()){
        toast("Generating fix proposal…","teal");
        API.proposeFix(finding).then(async (r)=>{
          const p=r.proposal; if(!p) throw new Error("no proposal");
          try{
            await API.createProposal({site_id:siteId,owner:site.owner,finding_id:p.findingId,disc:p.disc,risk:p.risk,channel:p.channel,title:p.title,page:p.page,impact:p.impact,target:p.target,field:p.field,before_val:p.before,after_val:p.after,status:"proposed"});
            const fresh=await API.listProposals(siteId);
            window.PROPOSALS=(fresh||[]).map(window.mapProposalRow||(x=>x));
            setProposals(window.PROPOSALS);
            try{ await API.logActivity({site_id:siteId,owner:site.owner,type:"approved",actor:"You",icon:"sparkles",text:"Proposed fix — "+p.title,meta:p.disc+" · "+p.channel}); }catch(e){}
          }catch(e){}
          toast("Fix proposal added → review queue","teal");
        }).catch(e=>toast("Could not propose: "+e.message,"clay"));
        return;
      }
      toast("Fix proposal generated → review queue","teal");
    },
    // Manually cross off a finding (stable key) so re-audits stop re-suggesting it.
    dismissFinding:(finding)=>{
      const key=(window.seoFindingKey?window.seoFindingKey(finding):(finding.key||finding.id));
      if(isLive()){
        API.createProposal({site_id:siteId,owner:site.owner,finding_id:key,disc:finding.disc||"seo",risk:"low",channel:"manual",title:finding.title,page:finding.page||"/",impact:"—",target:"—",field:"manual",before_val:finding.detail||finding.title,after_val:"Marked done by user",status:"dismissed"}).then(async()=>{
          const fresh=await API.listProposals(siteId); window.PROPOSALS=(fresh||[]).map(window.mapProposalRow||(x=>x)); setProposals(window.PROPOSALS);
          try{ await API.logActivity({site_id:siteId,owner:site.owner,type:"approved",actor:"You",icon:"check",text:"Marked done — "+finding.title,meta:finding.page||""}); }catch(e){}
        }).catch(e=>toast("Couldn't mark done: "+e.message,"clay"));
      }
      toast("Marked done — crossed off, won't be re-suggested","teal");
    },
    // Undo a manual dismissal (only dismissals; real fixes stay resolved).
    reopenFinding:(finding)=>{
      const key=(window.seoFindingKey?window.seoFindingKey(finding):(finding.key||finding.id));
      const row=(window.PROPOSALS||[]).find(p=>p.findingId===key && p.status==="dismissed");
      if(isLive() && row){
        API.updateProposal(row.id,{status:"reopened"}).then(async()=>{
          const fresh=await API.listProposals(siteId); window.PROPOSALS=(fresh||[]).map(window.mapProposalRow||(x=>x)); setProposals(window.PROPOSALS);
        }).catch(e=>toast("Couldn't reopen: "+e.message,"clay"));
      }
      toast("Reopened","gold");
    },
    openRunAudit:()=>setRunAuditOpen(true),
    closeRunAudit:()=>setRunAuditOpen(false),
    openAddSite:(s)=>{ setAddSiteFor(s); setAddSiteOpen(true); },
    closeAddSite:()=>{ setAddSiteOpen(false); setAddSiteFor(null); },
    finishAddSite:(editing, formData)=>{
      // LIVE: one secure server call validates auth, detects the stack, and
      // stores the app password ENCRYPTED (browser never persists the secret).
      if(API && window.SENTINEL_LIVE && formData && formData.url){
        const creds={ baseUrl:formData.url, username:formData.user, appPassword:formData.pw };
        const name=formData.name||creds.baseUrl.replace(/^https?:\/\//,"").replace(/\/$/,"");
        toast("Connecting & detecting stack…","teal");
        (async()=>{
          try{
            await API.siteConnect(creds,{ name, staging:formData.staging||null, caps:formData.caps||undefined,
              siteId:(editing&&editing.id&&String(editing.id).length>10)?editing.id:undefined });
            await window.SentinelHydrate();
            toast((editing?name+" reconnected ✓":"Site connected & stack detected ✓"),"teal");
          }catch(e){ toast("Connect failed: "+e.message,"clay"); }
        })();
        setAddSiteOpen(false); setAddSiteFor(null); return;
      }
      // MOCK fallback (design preview)
      if(editing){ setSites(prev=>prev.map(x=>x.id===editing.id?{...x,status:"connected",role:"Administrator",writeArmed:true,selftest:"ready",muPlugin:true}:x)); toast(editing.name+" reconnected ✓","teal"); }
      else toast("Site connected & stack detected ✓","teal");
      setAddSiteOpen(false); setAddSiteFor(null);
    },
    toggleProposal:(id)=>{ setProposals(p=>p.map(x=>x.id===id?{...x,status:(x.status==="verified"||x.status==="approved")?"proposed":"approved"}:x)); },
    approveProposal:(id)=>{ setProposals(p=>p.map(x=>x.id===id?{...x,status:"approved"}:x)); if(isLive())API.updateProposal(id,{status:"approved"}).catch(()=>{}); toast("Proposal approved","teal"); },
    rejectProposal:(id)=>{ setProposals(p=>p.filter(x=>x.id!==id)); if(isLive())API.updateProposal(id,{status:"rejected"}).catch(()=>{}); toast("Proposal rejected & removed","gold"); },
    editProposal:(id)=>{
      const p=proposals.find(x=>x.id===id); if(!p) return;
      const next=window.prompt("Edit the proposed value (the 'after'):", p.after||"");
      if(next===null) return; // cancelled
      setProposals(ps=>ps.map(x=>x.id===id?{...x,after:next}:x));
      if(isLive())API.updateProposal(id,{after_val:next}).catch(()=>{});
      toast("Proposal updated","plum");
    },
    bulkApprove:()=>{ setProposals(p=>p.map(x=>{ if(x.status==="proposed"&&x.risk==="low"){ if(isLive())API.updateProposal(x.id,{status:"approved"}).catch(()=>{}); return {...x,status:"approved"}; } return x; })); toast("Low-risk batch approved","teal"); },
    openApply:()=>setApplyOpen(true),
    closeApply:()=>setApplyOpen(false),
    commitApplied:()=>{
      // LIVE: apply each approved REST-write proposal with verify-after-write.
      // Returns a promise resolving to the REAL counts so the Apply modal can show an
      // honest result (and only mark "verified" what actually verified). Does not close
      // the modal itself — the modal drives its own completion from the resolved counts.
      if(isLive()){
        const approved=proposals.filter(p=>p.status==="approved");
        return (async()=>{
          let applied=0,failed=0,manual=0,blocked=0; const cssProps=[];
          // PERSIST the outcome. Previously only /apply-meta (rest-write) wrote back to
          // Supabase; schema + theme/css applies updated React state only, so a reload
          // showed them as still-approved — the change "went back" even though the site
          // had been written. Every channel now records status + applied_at.
          const markApplied=(p,status)=>API.updateProposal(p.id,{ status, applied_at:new Date().toISOString() }).catch(()=>{});
          for(const p of approved){
            if(p.channel==="rest-write"){
              try{
                // Secure apply: the server resolves the post from the page URL and
                // decrypts the stored secret by siteId. killSwitch → dry-run only.
                const r=await API.applyMeta(siteId,{proposalId:p.id,objectType:p._objectType,postId:p._postId,url:p.page,field:p.field,value:p.after},killSwitch);
                const st=(r&&r.status==="verified")?"verified":(r&&(r.status==="dry-run"||r.status==="blocked"))?"approved":"failed";
                if(r&&r.status==="verified")applied++; else if(r&&r.status==="blocked")blocked++; else if(r&&r.status==="dry-run"){} else failed++;
                setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:st}:x));
              }catch(e){ failed++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"failed"}:x)); }
            } else if(p.channel==="schema"){
              // Structured-data proposal → write JSON-LD to the live page.
              if(killSwitch){ /* simulated under kill switch */ }
              else{ try{ const r=await API.applySchema(siteId,{ url:p.page, jsonld:p.after }); if(r&&r.ok){ applied++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"verified"}:x)); await markApplied(p,"verified"); } else if(r&&r.status==="blocked"){ blocked++; } else { failed++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"failed"}:x)); await markApplied(p,"failed"); } }catch(e){ failed++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"failed"}:x)); await markApplied(p,"failed"); } }
            } else if(p.channel==="theme/css"){
              cssProps.push(p);   // batch — one bundled seo-agent-a11y.css write below
            } else {
              // genuinely manual (functions.php / JS / content edits) — no auto-write exists.
              manual++;
            }
          }
          // ONE bundled CSS write covers ALL approved theme/css (accessibility) proposals —
          // they live in a single site-wide seo-agent-a11y.css. Generate from the approved
          // findings, apply once. (color-contrast/target-size → CSS; skip-link/landmark/label/
          // aria need functions.php/JS and legitimately stay manual.)
          if(cssProps.length && !killSwitch){
            try{
              const findings=cssProps.map(p=>({ auditId:String(p.findingId||"").split("::")[0]||undefined, title:p.title }));
              const g=await API.generateCss(siteId, findings);
              if(g && !g.error && (g.rules||[]).length){
                // Per-rule accounting: only proposals whose auditId produced a REAL
                // (non-manual) rule get applied+verified; template rules that need human
                // values, and findings with no rule at all, are honestly counted manual.
                const ruleByAudit={}; (g.rules||[]).forEach(r=>{ ruleByAudit[r.auditId]=r; });
                const coveredProps=[], uncovered=[];
                for(const p of cssProps){
                  const aid=String(p.findingId||"").split("::")[0];
                  const r=ruleByAudit[aid];
                  if(r && !r.manual) coveredProps.push({p, rule:r});
                  else uncovered.push(p);
                }
                // Whatever CSS can't express (skip-link, link-name, label, landmark,
                // aria-*, image-alt, button-name…) now goes to the a11y DOM-fix channel
                // instead of being counted "manual · nothing was written" forever.
                if(uncovered.length){
                  try{
                    const af=await API.applyA11yFixes(siteId, uncovered.map(p=>({ auditId:String(p.findingId||"").split("::")[0] })));
                    const done=new Set((af&&af.applied)||[]);
                    for(const p of uncovered){
                      const aid=String(p.findingId||"").split("::")[0];
                      if(af&&af.ok&&done.has(aid)){ applied++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"verified"}:x)); await markApplied(p,"verified"); }
                      else if(af&&af.status==="blocked"){ blocked++; }
                      else manual++;
                    }
                  }catch(e){ uncovered.forEach(()=>manual++); }
                }
                if(coveredProps.length){
                  // Accumulating apply: rules PERSIST server-side per proposal, and the live
                  // bundle is rebuilt as the union — a new batch can't wipe earlier fixes.
                  const items=coveredProps.map(({p,rule})=>({ proposalId:p.id, auditId:rule.auditId, note:rule.note, css:rule.css }));
                  const w=await API.applyCssFixes(siteId, items);
                  if(w && w.ok){ for(const {p} of coveredProps){ applied++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"verified"}:x)); await markApplied(p,"verified"); } }
                  else if(w && w.status==="blocked"){ coveredProps.forEach(()=>blocked++); }
                  else { for(const {p} of coveredProps){ failed++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"failed"}:x)); await markApplied(p,"failed"); } }
                }
              } else {
                // No CSS rule matched ANY of them → try the a11y DOM channel for the lot
                // before declaring manual (this is the common SAL case: skip-link +
                // link-name + label have no CSS expression at all).
                try{
                  const af=await API.applyA11yFixes(siteId, cssProps.map(p=>({ auditId:String(p.findingId||"").split("::")[0] })));
                  const done=new Set((af&&af.applied)||[]);
                  for(const p of cssProps){
                    const aid=String(p.findingId||"").split("::")[0];
                    if(af&&af.ok&&done.has(aid)){ applied++; setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"verified"}:x)); await markApplied(p,"verified"); }
                    else if(af&&af.status==="blocked"){ blocked++; }
                    else manual++;
                  }
                }catch(e){ cssProps.forEach(()=>manual++); }
              }
            }catch(e){ cssProps.forEach(()=>failed++); }
          }
          if(killSwitch){ toast("Kill switch on — "+approved.length+" simulated, nothing written","gold"); }
          else { const bits=[]; if(applied)bits.push(applied+" applied & verified"); if(blocked)bits.push(blocked+" blocked (read-only)"); if(manual)bits.push(manual+" need manual action"); if(failed)bits.push(failed+" failed"); toast(bits.length?bits.join(" · "):"Nothing to apply", failed?"clay":(applied?"teal":"gold")); }
          return {applied,failed,manual,blocked,total:approved.length,killSwitch:!!killSwitch};
        })();
      }
      // MOCK fallback (design preview)
      const n=proposals.filter(x=>x.status==="approved").length;
      setProposals(p=>p.map(x=>x.status==="approved"?{...x,status:"verified"}:x)); toast("Applied & verified · rollback armed","teal");
      return Promise.resolve({applied:n,failed:0,manual:0,blocked:0,total:n,killSwitch:false});
    },
    rollback:(id)=>{
      const p=proposals.find(x=>x.id===id);
      if(killSwitch){ toast("Kill switch is on — rollbacks are writes too. Release it first.","gold"); return; }
      if(isLive() && p){
        // CHANNEL-AWARE: css proposals roll back via the accumulated-CSS store (remove the
        // rule, re-apply the remaining bundle) — the old path attempted a bogus META write
        // for a change that never touched post meta. Schema has no rollback implementation:
        // say so instead of pretending.
        if(p.channel==="theme/css"){
          API.rollbackCss(siteId,id).then(r=>{
            if(r&&r.error){ toast("CSS rollback failed: "+r.error,"clay"); return; }
            if(r&&r.status==="blocked"){ toast("Site is read-only — arm writes first.","clay"); return; }
            setProposals(ps=>ps.map(x=>x.id===id?{...x,status:"rolled-back"}:x));
            toast("CSS fix removed — bundle rebuilt with "+(r.ruleGroups||0)+" remaining rule group(s)","gold");
          }).catch(e=>toast("CSS rollback failed: "+e.message,"clay"));
          return;
        }
        if(p.channel==="schema"){ toast("Schema changes have no one-click rollback yet — remove the JSON-LD block from the page, or re-apply a corrected version.","gold"); return; }
        API.rollbackMeta(siteId,{proposalId:id,objectType:p._objectType,postId:p._postId,url:p.page,field:p.field,oldValue:p._oldValue||p.before}).then((r)=>{
          if(r&&r.error){ toast("Rollback failed: "+r.error,"clay"); return; }
          if(r&&r.status==="blocked"){ toast("Site is read-only — arm writes first.","clay"); return; }
          API.updateProposal(id,{status:"rolled-back"}).catch(()=>{});
          API.logActivity({site_id:siteId,owner:site.owner,type:"rolled-back",actor:"You",icon:"undo",text:"Rolled back "+p.title,meta:"restored old value"}).catch(()=>{});
          setProposals(ps=>ps.map(x=>x.id===id?{...x,status:"rolled-back"}:x)); toast("Change rolled back — value restored","gold");
        }).catch(e=>toast("Rollback failed: "+e.message,"clay"));
        return;
      }
      // MOCK fallback
      setProposals(ps=>ps.map(x=>x.id===id?{...x,status:"rolled-back"}:x)); toast("Change rolled back — value restored","gold"); },
    toggleWriteArm:()=>{
      const next=!site.writeArmed;
      setSites(prev=>prev.map(x=>x.id===siteId?{...x,writeArmed:next}:x));
      if(isLive())API.updateSite(siteId,{write_armed:next}).catch(()=>{});
      toast(next?"Write mode armed — approved changes can apply":"Switched to read-only", next?"teal":"gray");
    },
    // Persist a capability toggle for the active site.
    setCapability:(key,on)=>{
      setSites(prev=>prev.map(x=>x.id===siteId?{...x,caps:{...x.caps,[key]:on}}:x));
      if(isLive())API.updateSite(siteId,{caps:{...(site.caps||{}),[key]:on}}).catch(()=>{});
    },
    // Remove the account (and its encrypted secret cascades) from Supabase.
    removeSite:()=>{
      if(!window.confirm("Remove "+site.name+"? Its encrypted credential is purged. This cannot be undone."))return;
      if(isLive()){
        fetch(window.SENTINEL_CONFIG.supabaseUrl+"/rest/v1/sites?id=eq."+siteId,{method:"DELETE",headers:{apikey:window.SENTINEL_CONFIG.supabaseAnonKey,Authorization:"Bearer "+window.SENTINEL_CONFIG.supabaseAnonKey}})
          .then(()=>window.SentinelHydrate()).then(()=>{ setScreen("sites"); toast("Account removed & secret purged","clay"); })
          .catch(e=>toast("Remove failed: "+e.message,"clay"));
      } else toast("Account removed (demo)","clay");
    },
    // SERVER-enforced: persists via /kill-switch so every tab AND every API caller is
    // blocked at the dispatcher — not just this tab's React state.
    toggleKill:()=>{ setKillSwitch(k=>{
      const next=!k;
      if(isLive()&&API.killSwitch) API.killSwitch(next).then(r=>{ if(r&&r.error) toast("Kill switch server sync failed: "+r.error,"clay"); }).catch(e=>toast("Kill switch server sync failed: "+e.message,"clay"));
      toast(next?"Kill switch ON — all writes blocked server-side":"Kill switch released", next?"clay":"teal");
      return next;
    }); },
    openAllowlistGuide:()=>setGuideOpen(true),
    addBrandConstraint:()=>{
      const v=window.prompt("Add a brand constraint the agent must NEVER change (e.g. a locked color #1A2B3C, a font name, or a tagline):");
      if(!v||!v.trim()) return;
      const next=[...new Set([...(site.brand_constraints||[]),v.trim()])];
      setSites(prev=>prev.map(x=>x.id===siteId?{...x,brand_constraints:next}:x));
      if(isLive())API.updateSite(siteId,{brand_constraints:next}).catch(()=>{});
      toast("Brand constraint locked","teal");
    },
    removeBrandConstraint:(bc)=>{
      const next=(site.brand_constraints||[]).filter(x=>x!==bc);
      setSites(prev=>prev.map(x=>x.id===siteId?{...x,brand_constraints:next}:x));
      if(isLive())API.updateSite(siteId,{brand_constraints:next}).catch(()=>{});
    },
  };

  const SCREENS = { playbook:PlaybookScreen, overview:Dashboard, exec:ExecScreen, sites:SitesScreen, audits:AuditsScreen, history:HistoryScreen, plan:OpportunitiesScreen, engine:ContentEngineScreen, content:ContentScreen, optimize:OptimizeScreen, chat:ChatScreen, geo:GeoScreen, gsc:GscScreen, semrush:SemrushScreen, airtable:AirtableScreen, review:ReviewScreen, activity:ActivityScreen, admin:AdminScreen, settings:SettingsScreen, experience:ExperienceScreen, uxactivation:UxActivationScreen, n8n:N8nScreen };
  const Screen = SCREENS[screen] || Dashboard;

  let content = <Screen ctx={ctx} run />;

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"var(--bg)" }}>
      <Sidebar ctx={ctx} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="content-panel" style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, minHeight:0 }}>
        <TopBar ctx={ctx} />
        <main ref={scrollRef} className="scroll" style={{ flex:1, minHeight:0, padding:"16px 30px 36px" }}>
          <div style={{ maxWidth:1320, margin:"0 auto" }}>{content}</div>
        </main>
      </div>
      {addSiteOpen && <AddSiteModal ctx={ctx} />}
      {runAuditOpen && <RunAuditModal ctx={ctx} />}
      {applyOpen && <ApplyModal ctx={ctx} />}
      {/* stale-tab banner — a deploy happened since this tab loaded; old code = "broken" fixes */}
      {staleBuild && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", gap:14, padding:"10px 18px", background:"var(--t-700)", color:"#F3EFE4", boxShadow:"0 4px 18px rgba(0,0,0,.25)" }}>
          <Icon name="sparkles" size={16} />
          <span style={{ fontSize:13.5, fontWeight:700 }}>Sentinel was updated — this tab is running an older version.</span>
          <button onClick={()=>{ try{ window.location.reload(); }catch(e){} }} className="neo-btn" style={{ padding:"7px 16px", borderRadius:10, background:"#F3EFE4", color:"var(--t-700)", fontSize:13, fontWeight:800, border:"none", cursor:"pointer" }}>Reload now</button>
        </div>
      )}
      <ChartModal open={guideOpen} onClose={()=>setGuideOpen(false)} title="Security-plugin allowlist guide" sub="If a security plugin blocks the agent's REST/auth requests">
        <div className="md" style={{ fontSize:13.5, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html: (window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(
`Some security plugins (Wordfence, MalCare, Sucuri) can block the agent's REST API or Application-Password auth, causing **401/403** errors. To allowlist the agent:

## Wordfence
1. **Wordfence → Firewall → Blocking** — ensure no rule blocks \`/wp-json/\`.
2. **Login Security → Settings** — allow **Application Passwords** (don't disable XML-RPC/REST auth).
3. If you see live blocks: **Wordfence → Tools → Live Traffic**, find the blocked request, and **allowlist the agent's IP**.

## MalCare
1. **MalCare dashboard → Firewall** — add the agent's IP to the **whitelist**.
2. Ensure **Login Protection** isn't blocking the REST user.

## Sucuri
1. **Sucuri → Firewall (WAF) → Access Control** — **Whitelist IP Address** for the agent.

## General checklist
- Confirm **Application Passwords are enabled** (Users → Profile → Application Passwords).
- The REST route \`/wp-json/wp/v2/\` must be publicly reachable (some "hardening" plugins disable it).
- If using Cloudflare/CDN, add a **WAF allow rule** for the agent.

After allowlisting, click **Re-authenticate** on the site card.`))} } />
      </ChartModal>
      <Toasts list={toasts} />
      <Assistant ctx={ctx} open={assistantOpen} setOpen={setAssistantOpen} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
