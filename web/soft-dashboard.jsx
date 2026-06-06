/* ===========================================================
   Sentinel — Soft-UI dashboard, collapsible sidebar, app
   =========================================================== */
const SNAV = [
  { k:"overview", label:"Dashboard", icon:"grid" },
  { k:"exec",     label:"Executive Scorecard", icon:"flag" },
  { k:"sites",    label:"Sites",     icon:"globe" },
  { k:"audits",   label:"Audits",    icon:"radar" },
  { k:"history",  label:"Audit History", icon:"trend" },
  { k:"plan",     label:"Content Plan", icon:"sparkles" },
  { k:"content",  label:"Content Intel", icon:"sparkles" },
  { k:"optimize", label:"On-Page Fixes", icon:"bolt" },
  { k:"gsc",      label:"Search Console", icon:"search" },
  { k:"semrush",  label:"DataForSEO", icon:"bolt" },
  { k:"airtable", label:"Airtable Sync", icon:"layers" },
  { k:"review",   label:"Review Queue", icon:"list", badge:true },
  { k:"chat",     label:"AI Chat", icon:"sparkles" },
  { k:"activity", label:"Activity",  icon:"clock" },
  { k:"geo",      label:"AI Visibility", icon:"globe" },
  { k:"admin",    label:"Admin Panel", icon:"gauge" },
  { k:"settings", label:"Settings",  icon:"cog" },
];

/* ---------------- Collapsible Sidebar ---------------- */
function Sidebar({ ctx, collapsed, setCollapsed }) {
  const W = collapsed ? 84 : 256;
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

      {/* nav — scrollable so all items stay reachable on short screens */}
      <nav className="scroll" style={{ flex:1, minHeight:0, overflowY:"auto", overflowX:"hidden", display:"flex", flexDirection:"column", gap:7, margin:"0 -6px", padding:"0 6px" }}>
        {!collapsed && <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:"var(--faint)", padding:"0 6px 6px" }}>Menu</div>}
        {SNAV.map(it=>{
          const active = ctx.screen===it.k;
          const badge = it.badge ? ctx.proposals.filter(p=>p.status==="proposed").length : 0;
          return (
            <button key={it.k} onClick={()=>ctx.goto(it.k)} className={"nav-item "+(collapsed?"tip":"")} data-tip={it.label}
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
  return (
    <div style={{ position:"relative" }}>
      <button className="neo-btn" onClick={()=>setOpen(!open)}
        style={{ display:"flex", alignItems:"center", gap:11, padding:"7px 14px 7px 8px", borderRadius:"var(--r-pill)", background:"var(--surface)", boxShadow:"var(--neo-sm)" }}>
        <Glyph color={s.favicon} char={s.glyph} size={32} r={10} />
        <div style={{ textAlign:"left" }}>
          <div style={{ fontSize:13.5, fontWeight:700, lineHeight:1.1 }}>{s.name}</div>
          <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{s.url}</div>
        </div>
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
                  <Chip tone={fail?"clay":"teal"} size="sm" dot>{fail?"Auth":"OK"}</Chip>
                </button>
              );
            })}
            <div style={{ height:1, background:"var(--line-soft)", margin:"6px 8px" }} />
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
  const total = res.findings.length + res.proposals.length + res.sites.length;
  const go = (screen)=>{ setOpen(false); setQ(""); ctx.goto(screen); };
  return (
    <div style={{ position:"relative", width:260 }}>
      <Icon name="search" size={17} style={{ position:"absolute", left:15, top:12, color:"var(--faint)", zIndex:1 }} />
      <input placeholder="Search findings, pages…" className="search-in" value={q}
        onChange={e=>{ setQ(e.target.value); setOpen(true); }} onFocus={()=>setOpen(true)}
        onKeyDown={e=>{ if(e.key==="Escape"){ setOpen(false); e.target.blur(); } }}
        style={{ width:"100%", padding:"11px 14px 11px 42px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13.5, color:"var(--ink)", outline:"none" }} />
      {open && q.trim() && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
          <div className="scroll" style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:340, maxHeight:420, zIndex:50, padding:8,
            background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo)", animation:"pop .16s both" }}>
            {total===0 && <div style={{ padding:"16px 12px", fontSize:13, color:"var(--muted)", textAlign:"center" }}>No matches for “{q}”.</div>}
            {res.findings.length>0 && <div style={{ padding:"6px 10px 4px", fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"var(--faint)" }}>Findings · {res.findings.length}</div>}
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
        <Chip tone="teal" size="sm" icon="trend">+4 vs last audit</Chip>
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
          const [rl,rbg,rfg] = riskChip[p.risk];
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
  const rows = [
    ["LCP", s.cwv.lcp, [2.4,2.8,3.0,2.9,3.2,3.1,3.1], v=>v.toFixed(1)+"s"],
    ["INP", s.cwv.inp, [240,210,205,195,185,182,180], v=>Math.round(v)+"ms"],
    ["CLS", s.cwv.cls, [0.12,0.10,0.09,0.07,0.05,0.04,0.04], v=>v.toFixed(2)],
  ];
  const map = { good:["teal","Good"], ni:["gold","Fair"], poor:["clay","Poor"], na:["gray","—"] };
  return (
    <SoftCard>
      <SectionHead sub="Real-user field data" right={<MaxBtn onClick={()=>setMaxed(true)} />}>Core Web Vitals</SectionHead>
      <ChartModal open={maxed} onClose={()=>setMaxed(false)} title="Core Web Vitals" sub="Real-user field data · trailing 28 days">
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {rows.map(([l,m,sp,fmt])=>{ const [tone,lab]=map[m.state]||map.na, [fg]=TT[tone]; return (
            <Well key={l} pad={20}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:"var(--surface)", boxShadow:"var(--neo-sm)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800, color:fg }}>{l}</div>
                <div style={{ flex:1 }}><div style={{ fontSize:24, fontWeight:800, fontFamily:"var(--mono)", color:fg, lineHeight:1 }}>{m.v}</div><div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>p75 · {l==="LCP"?"Largest Contentful Paint":l==="INP"?"Interaction to Next Paint":"Cumulative Layout Shift"}</div></div>
                <Chip tone={tone} dot>{lab}</Chip>
              </div>
              <BigSpark points={sp} color={fg} fmt={fmt} />
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
                <div style={{ fontSize:10, color:"var(--muted)", marginTop:3, fontWeight:600 }}>p75</div>
              </div>
              <div style={{ flex:1, display:"flex", justifyContent:"center" }}><Spark points={sp} color={fg} fmt={fmt} /></div>
              <Chip tone={tone} size="sm" dot>{lab}</Chip>
            </div>
          );
        })}
      </div>
      <div className="card-foot" style={{ marginTop:16, paddingTop:13, borderTop:"1px solid var(--line-soft)", fontSize:11.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}>
        <Icon name="clock" size={13} />Field data · trailing 28 days
      </div>
    </SoftCard>
  );
}

function ActivityCard({ ctx }) {
  const tone = { verified:"teal", approved:"teal", applied:"plum", "rolled-back":"gold", audit:"plum", connection:"gray", failed:"clay" };
  const items = ACTIVITY.slice(0,4);
  return (
    <SoftCard>
      <SectionHead sub="Every action is logged" right={<NeoButton kind="ghost" size="sm" iconR="chevR" onClick={()=>ctx.goto("activity")}>All</NeoButton>}>Recent Activity</SectionHead>
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
          <h1 style={{ margin:0, fontSize:34, fontWeight:800, letterSpacing:"-.03em" }}>Welcome back, Mara</h1>
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
  const [stat,setStat] = useState(null);
  const [statBusy,setStatBusy] = useState(false);
  const load = ()=>{ setBusy(true); setErr(null); API.promptsList().then(r=>{ if(r.error){setErr(r.error);return;} setData(r); setEdits({}); }).catch(e=>setErr(e.message)).finally(()=>setBusy(false)); };
  const loadStat = ()=>{ setStatBusy(true); API.adminStatus().then(setStat).catch(e=>setStat({error:e.message})).finally(()=>setStatBusy(false)); };
  useEffect(()=>{ if(live){ loadStat(); if(!data) load(); } },[]);

  const toggleHist = (p)=>{
    if(histOpen===p.key){ setHistOpen(""); return; }
    setHistOpen(p.key);
    if(hist[p.key]===undefined){ setHist(h=>({...h,[p.key]:null})); API.promptHistory(p.key).then(r=>setHist(h=>({...h,[p.key]:r.versions||[]}))).catch(()=>setHist(h=>({...h,[p.key]:[]}))); }
  };
  const runTest = (p)=>{
    const content=edits[p.key]!=null?edits[p.key]:p.content;
    setTesting(p.key);
    API.promptTest(p.key, content, mdl(p)||null, tmp(p)===""?null:tmp(p)).then(r=>{ if(r.error){ ctx.toast("Test: "+r.error,"clay"); return; } setTests(t=>({...t,[p.key]:r})); }).catch(e=>ctx.toast("Test: "+e.message,"clay")).finally(()=>setTesting(""));
  };
  const fmtTime = (iso)=>{ try{ return new Date(iso).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };

  const mdl=(p)=> cfg[p.key]&&cfg[p.key].model!==undefined ? cfg[p.key].model : (p.model||"");
  const tmp=(p)=> cfg[p.key]&&cfg[p.key].temperature!==undefined ? cfg[p.key].temperature : (p.temperature!=null?p.temperature:"");
  const cfgDirty=(p)=> (cfg[p.key]&&cfg[p.key].model!==undefined && (cfg[p.key].model||"")!==(p.model||"")) || (cfg[p.key]&&cfg[p.key].temperature!==undefined && String(cfg[p.key].temperature)!==String(p.temperature!=null?p.temperature:""));
  const save = (p)=>{
    const content=edits[p.key]!=null?edits[p.key]:p.content;
    setSaving(p.key);
    API.promptSave(p.key, content, mdl(p)||null, tmp(p)===""?null:tmp(p)).then(r=>{
      if(r.error){ ctx.toast("Save failed: "+r.error,"clay"); return; }
      ctx.toast("Saved — live on next call","teal"); setCfg(c=>{const n={...c};delete n[p.key];return n;}); load();
    }).catch(e=>ctx.toast("Save failed: "+e.message,"clay")).finally(()=>setSaving(""));
  };
  const reset = (p)=>{
    setSaving(p.key);
    API.promptReset(p.key).then(r=>{ if(r.error){ctx.toast(r.error,"clay");return;} ctx.toast("Reset to default","gold"); load(); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setSaving(""));
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
                <PatternCard icon="globe" tone="gold" value="UK only" title="Audience scope" sub="all data geo-locked" />
                <PatternCard icon="shield" tone={stat.server&&stat.server.dryRun?"gray":"clay"} value={stat.server&&stat.server.dryRun?"DRY-RUN":"LIVE writes"} title="Write mode" sub={stat.server&&stat.server.dryRun?"safe — no live writes":"approved writes go live"} />
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
          <div style={{ fontSize:12, color:"var(--muted)" }}>{prompts.length} prompt(s) · {data.status.overridden||0} customised · changes apply on the next AI call (and re-sync from Supabase every ~45s).</div>
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
                          <input value={mdl(p)} onChange={e=>setCfg(c=>({...c,[p.key]:{...(c[p.key]||{}),model:e.target.value}}))} placeholder="default (Sonnet)" style={{ fontSize:11.5, padding:"4px 8px", borderRadius:8, border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", width:200, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
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
  const [briefs,setBriefs] = useState({});   // clusterIndex → {brief, sources}
  const [briefBusy,setBriefBusy] = useState(-1);
  useEffect(()=>{ setData(null); setErr(null); setTrend(null); setBriefs({}); },[s.id]);

  const load = ()=>{ setBusy(true); setErr(null); API.contentOpportunities(s.id,{}).then(r=>{ if(r.error){setErr(r.error);return;} setData(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy(false)); };
  const loadTrending = ()=>{ setTrendBusy(true); API.trendingIntel(s.id).then(r=>setTrend(r)).catch(e=>setTrend({error:e.message})).finally(()=>setTrendBusy(false)); };
  const genBrief = (c,i)=>{
    setBriefBusy(i);
    API.contentBrief(s.id, c.primaryKeyword||c.suggestedTitle, c.intent).then(r=>{
      if(r.error){ ctx.toast("Brief: "+r.error,"clay"); return; }
      setBriefs(b=>({...b,[i]:{brief:r.brief,sources:r.sources||[]}}));
    }).catch(e=>ctx.toast("Brief: "+e.message,"clay")).finally(()=>setBriefBusy(-1));
  };
  const withBriefs = (clusters)=> clusters.map((c)=>{ const idx=(data&&data.clusters||[]).indexOf(c); const b=briefs[idx]; return b?{...c,brief:b.brief,briefSources:b.sources}:c; });
  const pushAirtable = (clusters,tag)=>{
    if(!clusters.length){ ctx.toast("Nothing to send","gold"); return; }
    setPushing(tag);
    API.airtableSync(s.id,{kinds:["opportunities"],clusters:withBriefs(clusters)}).then(r=>{
      if(r.error){ ctx.toast("Airtable: "+r.error,"clay"); return; }
      const n=(r.synced&&r.synced.opportunities&&r.synced.opportunities.pushed)||0;
      ctx.toast(n+" opportunit"+(n===1?"y":"ies")+" sent to Airtable","teal");
    }).catch(e=>ctx.toast("Airtable: "+e.message,"clay")).finally(()=>setPushing(""));
  };

  const clusters = (data&&data.clusters||[]).filter(c=> filter==="all" || (filter==="gap"&&c.isGap) || (filter==="trending"&&c.trending) || (filter==="competitor"&&c.fromCompetitor));
  const FILTERS=[["all","All"],["gap","Gaps"],["trending","Trending"],["competitor","From competitors"]];
  const intentTone={informational:"teal",commercial:"gold",transactional:"plum",navigational:"gray"};

  return (
    <div className="rise">
      <PageHead title="Content Opportunities" sub="UK keyword clusters from your rankings, competitors & live trends — gap-checked against your sitemap.">
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <Chip tone="gray" size="sm" icon="globe">UK only</Chip>
          {data && <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>pushAirtable(clusters.filter(c=>c.isGap),"gaps")} disabled={pushing==="gaps"}>{pushing==="gaps"&&<Icon name="cog" size={14} className="audit-spin" />}Send gaps → Airtable</NeoButton>}
          <NeoButton kind="primary" size="sm" icon={busy?undefined:"sparkles"} disabled={busy} onClick={load}>{busy&&<Icon name="cog" size={15} className="audit-spin" />}{busy?"Analyzing…":data?"Re-analyze":"Find opportunities"}</NeoButton>
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site to plan content.</div></SoftCard>}

      {/* Live UK trending intelligence (Perplexity + Tavily) */}
      {live && (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub="What's trending in your niche across the UK web right now — grounded & sourced" right={
            <NeoButton kind="soft" size="sm" icon={trendBusy?undefined:"trend"} disabled={trendBusy} onClick={loadTrending}>{trendBusy&&<Icon name="cog" size={14} className="audit-spin" />}{trendBusy?"Scanning…":trend?"Refresh":"What's trending?"}</NeoButton>
          }>Trending now (UK)</SectionHead>
          {trend && trend.error && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"4px 2px" }}>{trend.error}</div>}
          {trend && !trend.error && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {trend.summary && <div className="md" style={{ fontSize:13, lineHeight:1.55 }} dangerouslySetInnerHTML={{ __html:(window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(trend.summary))||trend.summary }} />}
              {(trend.topics||[]).length>0 && <div style={{ display:"flex", flexDirection:"column", gap:5 }}>{trend.topics.slice(0,6).map((t,i)=>(<a key={i} href={t.url} target="_blank" style={{ fontSize:12.5, padding:"8px 11px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", color:"var(--ink)", textDecoration:"none", display:"flex", gap:8, alignItems:"center" }}><Icon name="trend" size={13} style={{color:"var(--gold)"}} /><span style={{ flex:1 }}>{t.title}</span></a>))}</div>}
              {(trend.sources||[]).length>0 && <div style={{ fontSize:11, color:"var(--faint)" }}>Sources: {(trend.sources||[]).slice(0,5).map((s,i)=>(<a key={i} href={s.url} target="_blank" style={{ color:"var(--t-600)", marginRight:8 }}>{s.domain||(i+1)}</a>))}</div>}
            </div>
          )}
          {!trend && !trendBusy && <div style={{ fontSize:12.5, color:"var(--muted)", padding:"2px" }}>Surface this week's trending UK topics in your niche, with sources — fresh content ideas grounded in the live web.</div>}
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
                        <NeoButton kind="primary" size="sm" icon={briefBusy===i?undefined:"sparkles"} disabled={briefBusy===i} onClick={()=>genBrief(c,i)}>{briefBusy===i&&<Icon name="cog" size={14} className="audit-spin" />}{briefBusy===i?"Researching…":briefs[i]?"Regenerate brief":"Generate brief (UK)"}</NeoButton>
                        <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>pushAirtable([c],"one"+i)} disabled={pushing==="one"+i}>{pushing==="one"+i&&<Icon name="cog" size={14} className="audit-spin" />}Send to Airtable</NeoButton>
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
  const [busy,setBusy] = useState("");
  const [err,setErr] = useState(null);
  const [links,setLinks] = useState(null);
  const [schema,setSchema] = useState(null);
  const [facts,setFacts] = useState(null);
  const [css,setCss] = useState(null);
  const [pageUrl,setPageUrl] = useState("");
  const [pageType,setPageType] = useState("page");
  const [media,setMedia] = useState(null);
  const [speed,setSpeed] = useState(null);
  const [speedStrat,setSpeedStrat] = useState("mobile");
  useEffect(()=>{ setLinks(null); setSchema(null); setFacts(null); setCss(null); setMedia(null); setSpeed(null); setErr(null); setPageUrl((s._rawUrl||s.url||"").replace(/\/$/,"")+"/"); },[s.id]);
  const copy = (t)=>{ try{ navigator.clipboard.writeText(t); ctx.toast("Copied to clipboard","teal"); }catch(e){ ctx.toast("Copy failed","gold"); } };

  const findLinks = ()=>{ setBusy("links"); setErr(null); API.internalLinks(s.id,{maxSources:8}).then(r=>{ if(r.error){setErr(r.error);return;} setLinks(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genSchema = ()=>{ if(!pageUrl){ctx.toast("Enter a page URL","gold");return;} setBusy("schema"); setErr(null); API.generateSchema(s.id,{url:pageUrl,type:pageType,title:""}).then(r=>{ if(r.error){setErr(r.error);return;} setSchema(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genFacts = ()=>{ if(!pageUrl){ctx.toast("Enter a page URL","gold");return;} setBusy("facts"); setErr(null); API.aiSeoFacts(s.id,pageUrl).then(r=>{ if(r.error){setErr(r.error);return;} setFacts(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const genCss = ()=>{ setBusy("css"); setErr(null); API.generateCss(s.id).then(r=>{ if(r.error){setErr(r.error);return;} setCss(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const scanMedia = ()=>{ setBusy("scan"); setErr(null); API.mediaScan(s.id).then(r=>{ if(r.error){setErr(r.error);return;} setMedia(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };
  const optimizeMedia = (apply)=>{ setBusy(apply?"apply":"preview"); API.mediaOptimize(s.id,{apply,max:8}).then(r=>{ if(r.error){ctx.toast("Images: "+r.error,"clay");return;} ctx.toast((apply?"Optimized + uploaded ":"Preview: ")+r.processed+" image(s) · "+r.savedKB+" KB saved","teal"); setMedia(m=>({...(m||{}),lastRun:r})); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setBusy("")); };
  const runSpeed = ()=>{ if(!pageUrl){ctx.toast("Enter a URL","gold");return;} setBusy("speed"); setErr(null); API.speedTest(pageUrl,speedStrat).then(r=>{ if(r.error){setErr(r.error);return;} setSpeed(r); }).catch(e=>setErr(e.message)).finally(()=>setBusy("")); };

  const TABS=[["links","Internal Links","link"],["schema","Schema","layers"],["facts","AI-SEO Facts","sparkles"],["css","CSS Fixes","bolt"],["images","Images","image"],["speed","Speed Test","gauge"]];
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

          {tab==="links" && (
            <div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:13.5, fontWeight:700 }}>Internal-link suggestions</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Contextual links between your real published pages — anchor text + target, with targets validated against the live page list (no invented URLs).</div>
                </div>
                <NeoButton kind="primary" size="sm" icon={busy==="links"?undefined:"link"} disabled={busy==="links"} onClick={findLinks}>{busy==="links"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="links"?"Analyzing…":"Find internal links"}</NeoButton>
              </div>
              {links && (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", marginBottom:4 }}>{links.count} suggestion(s) across {links.analyzed} page(s) · {links.corpusSize} pages in corpus</div>
                  {(links.suggestions||[]).map((l,i)=>(
                    <div key={i} style={{ padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", fontSize:13 }}>
                        <span style={{ fontFamily:"var(--mono)", color:"var(--muted)", fontSize:11.5 }}>{(l.sourcePage||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</span>
                        <Icon name="arrowUp" size={13} style={{ transform:"rotate(90deg)", color:"var(--faint)" }} />
                        <span style={{ fontWeight:700, color:"var(--t-700)" }}>“{l.anchor}”</span>
                        <Icon name="arrowUp" size={13} style={{ transform:"rotate(90deg)", color:"var(--faint)" }} />
                        <a href={l.targetUrl} target="_blank" style={{ fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", fontSize:11.5 }}>{(l.targetUrl||"").replace(/^https?:\/\/[^/]+/,"")||"/"}</a>
                      </div>
                      {l.reason && <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:5 }}>{l.reason}</div>}
                    </div>
                  ))}
                  {(links.suggestions||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No strong internal-link opportunities found — pages are already well interlinked.</div>}
                </div>
              )}
              {!links && busy!=="links" && <div style={{ padding:"10px 2px", fontSize:13, color:"var(--muted)" }}>Analyze your pages to surface contextual internal-link opportunities (anchor → target), then add them in your editor.</div>}
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
                  {facts.faqSchema && <div><div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}><span style={{ fontSize:12.5, fontWeight:700 }}>FAQPage schema</span><NeoButton kind="soft" size="sm" icon="doc" style={{ marginLeft:"auto" }} onClick={()=>copy(JSON.stringify(facts.faqSchema,null,2))}>Copy</NeoButton></div><pre style={{ margin:0, padding:"12px 14px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", fontSize:11, fontFamily:"var(--mono)", overflowX:"auto", maxHeight:300 }}>{JSON.stringify(facts.faqSchema,null,2)}</pre></div>}
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
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Scans your media library for heavy JPEG/PNG images and converts them to WebP (≈60–80% smaller) to lift LCP &amp; Performance. Preview is safe; "Optimize" uploads WebP versions.</div>
                </div>
                <NeoButton kind="primary" size="sm" icon={busy==="scan"?undefined:"image"} disabled={busy==="scan"} onClick={scanMedia}>{busy==="scan"&&<Icon name="cog" size={15} className="audit-spin" />}{busy==="scan"?"Scanning…":"Scan media"}</NeoButton>
              </div>
              {media && media.images && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                    <PatternCard icon="image" tone="gold" value={media.heavyCount} title="Heavy images" sub={"of "+media.totalImages+" total"} />
                    <PatternCard icon="layers" tone="plum" value={(media.totalHeavyKB/1024).toFixed(1)+" MB"} title="Current weight" sub="raster JPEG/PNG" />
                    <PatternCard icon="bolt" tone="teal" value={"~"+(media.estSavingKB/1024).toFixed(1)+" MB"} title="Est. saving" sub="≈65% smaller as WebP" />
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <NeoButton kind="soft" size="sm" icon={busy==="preview"?undefined:"eye"} disabled={busy==="preview"} onClick={()=>optimizeMedia(false)}>{busy==="preview"&&<Icon name="cog" size={14} className="audit-spin" />}Preview top 8 (no write)</NeoButton>
                    <NeoButton kind="primary" size="sm" icon={busy==="apply"?undefined:"upload"} disabled={busy==="apply"} onClick={()=>optimizeMedia(true)}>{busy==="apply"&&<Icon name="cog" size={14} className="audit-spin" />}Optimize &amp; upload top 8</NeoButton>
                  </div>
                  {media.lastRun && (
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)" }}>{media.lastRun.applied?"Optimized":"Preview"} · {media.lastRun.savedKB} KB saved across {media.lastRun.processed} image(s)</div>
                      {(media.lastRun.results||[]).map((r,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12 }}>
                          <span style={{ flex:1, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.filename||r.url||r.id}</span>
                          {r.error?<Chip tone="clay" size="sm">err</Chip>:r.skip?<Chip tone="gray" size="sm">{r.skip}</Chip>:<><span style={{ color:"var(--muted)" }}>{r.fromKB}→{r.toKB} KB</span><Chip tone="teal" size="sm">−{r.pct}%</Chip></>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {media.images.slice(0,12).map((im,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12 }}>
                        <a href={im.url} target="_blank" style={{ flex:1, fontFamily:"var(--mono)", color:"var(--ink)", textDecoration:"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(im.url||"").split("/").pop()}</a>
                        <span style={{ color:"var(--muted)" }}>{im.w}×{im.h}</span>
                        <Chip tone={im.sizeKB>500?"clay":"gold"} size="sm">{im.sizeKB} KB</Chip>
                      </div>
                    ))}
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
  const strengthTone = { strong:"teal", moderate:"gold", thin:"clay" };
  const prioTone = { high:"clay", medium:"gold", low:"gray" };

  return (
    <div className="rise">
      <PageHead title="Content Intelligence" sub={`Keyword clusters, content gaps & new-article ideas for ${s.name}.`}>
        <NeoButton kind="primary" icon={loading?undefined:"sparkles"} disabled={loading} onClick={ctx.runContentIntel}>
          {loading && <Icon name="cog" size={17} className="audit-spin" />}{loading?"Analyzing…":d?"Re-analyze":"Analyze content"}
        </NeoButton>
      </PageHead>

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

          {/* Keyword clusters */}
          <SoftCard hover={false}>
            <SectionHead sub="Your content mapped into topic clusters">Keyword Clusters</SectionHead>
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

  return (
    <div className="rise">
      <PageHead title="AI Visibility (GEO)" sub={`Does AI cite ${s.name}? Measure share-of-AI-voice across buyer-intent prompts.`}>
        <div style={{ display:"flex", gap:10 }}>
          <NeoButton kind="soft" icon="sparkles" onClick={ctx.runGeoEnable}>Generate llms.txt + AI robots</NeoButton>
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

          {/* per-prompt results */}
          <SoftCard hover={false}>
            <SectionHead sub="Each buyer-intent query and whether AI cited you">Prompt Results</SectionHead>
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

      {/* DataForSEO section */}
      <SoftCard hover={false} style={{ marginTop:18 }}>
        <SectionHead sub="Real keyword, competitor & backlink data" right={<Chip tone="gold" size="sm" icon="bolt">DataForSEO</Chip>}>Search Data</SectionHead>
        <SemrushPanel ctx={ctx} />
      </SoftCard>
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
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[["Organic traffic",ov.organicTraffic||"—"],["Keywords",ov.organicKeywords||"—"],["Auth. rank",ov.rank||"—"],["Backlinks",(data.backlinks&&data.backlinks.total)||"—"]].map(([l,v])=>(
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
  const [saEmail,setSaEmail] = useState(null);
  const [decay,setDecay] = useState(null);
  const [decayBusy,setDecayBusy] = useState(false);
  const [briefFor,setBriefFor] = useState(null);
  const [anom,setAnom] = useState(null);
  const [anomBusy,setAnomBusy] = useState(false);
  const [idxHealth,setIdxHealth] = useState(null);
  const [drops,setDrops] = useState(null);
  const [idxBusy,setIdxBusy] = useState("");

  useEffect(()=>{ setData(null); setProps([]); setSaText(""); setErr(null); setDecay(null); setAnom(null); setIdxHealth(null); setDrops(null); if(live) API.gscStatus(s.id).then(setStatus).catch(()=>{}); },[s.id]);
  const runIndexHealth = ()=>{ setIdxBusy("health"); setErr(null); API.gscIndexHealth(s.id).then(r=>{ if(r.error){setErr({msg:r.error,needsConnect:r.needsConnect});return;} setIdxHealth(r); }).catch(e=>setErr({msg:e.message})).finally(()=>setIdxBusy("")); };
  const runRankDrops = ()=>{ setIdxBusy("drops"); setErr(null); API.gscRankingDrops(s.id).then(r=>{ if(r.error){setErr({msg:r.error});return;} setDrops(r); }).catch(e=>setErr({msg:e.message})).finally(()=>setIdxBusy("")); };
  const submitIndex = ()=>{ setIdxBusy("submit"); API.gscSubmitUrls(s.id).then(r=>{ if(r.error){ctx.toast("Indexing: "+r.error,"clay");return;} ctx.toast(r.succeeded+"/"+r.submitted+" URLs submitted to Google for indexing","teal"); }).catch(e=>ctx.toast(e.message,"clay")).finally(()=>setIdxBusy("")); };
  const loadAnom = ()=>{
    setAnomBusy(true); setErr(null);
    API.gscAnomalies(s.id, 90).then(r=>{ if(r.error){ setErr({ msg:r.error, needsConnect:r.needsConnect, needsProperty:r.needsProperty }); return; } setAnom(r); }).catch(e=>setErr({ msg:e.message })).finally(()=>setAnomBusy(false));
  };
  const loadDecay = ()=>{
    setDecayBusy(true); setErr(null);
    API.contentDecay(s.id, 28).then(r=>{ if(r.error){ setErr({ msg:r.error }); return; } setDecay(r); }).catch(e=>setErr({ msg:e.message })).finally(()=>setDecayBusy(false));
  };
  const genBrief = (pg)=>{
    setBriefFor({ page:pg.page, loading:true });
    API.contentDecayBrief(pg).then(r=>setBriefFor({ page:pg.page, brief:r.brief })).catch(e=>setBriefFor({ page:pg.page, brief:"⚠️ "+e.message }));
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
  const pickProperty = (p)=>{
    API.gscSetProperty(s.id, p).then(()=>{ setStatus({connected:true,property:p}); setProps([]); loadData(p); }).catch(e=>setErr({ msg:e.message }));
  };
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

  return (
    <div className="rise">
      <PageHead title="Search Console" sub="First-party Google data — real clicks, impressions, CTR & position.">
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {hasProp && <Chip tone="teal" size="sm" icon="check">{status.property.replace(/^sc-domain:/,"").replace(/^https?:\/\//,"")}</Chip>}
          {data && <NeoButton kind="soft" size="sm" icon="trend" onClick={()=>loadData()}>Refresh</NeoButton>}
        </div>
      </PageHead>

      {!live && <SoftCard hover={false}><div style={{ padding:"12px 4px", color:"var(--muted)", fontSize:13.5 }}>Connect a live WordPress site first.</div></SoftCard>}

      {live && err && <div style={{ marginBottom:16 }}><ErrBanner msg={err.msg} noUnits={false} onRetry={()=>setErr(null)} /></div>}

      {/* CONNECT step */}
      {live && !connected && (
        <SoftCard hover={false}>
          <SectionHead sub="Service-account auth — works server-side for all your sites">Connect Google Search Console</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
              <Icon name="shield" size={18} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} />
              <div style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.55 }}>
                <b>Setup (one-time):</b> In Google Cloud Console → create a <b>Service Account</b> → enable the <b>Search Console API</b> → create a <b>JSON key</b>. Then in Search Console → <b>Settings → Users → Add user</b> → paste the service-account email (ends in <code>.gserviceaccount.com</code>) as a <b>Restricted</b> user. Paste the JSON key below.
              </div>
            </div>
            <textarea value={saText} onChange={e=>setSaText(e.target.value)} placeholder='Paste the full service-account JSON key here: { "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "..." }'
              rows={5} className="search-in" style={{ width:"100%", resize:"vertical", padding:"12px 14px", borderRadius:"var(--r-md)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <NeoButton kind="primary" icon={busy==="connect"?undefined:"link"} disabled={busy==="connect"} onClick={connect}>{busy==="connect"&&<Icon name="cog" size={16} className="audit-spin" />}Connect</NeoButton>
            </div>
          </div>
        </SoftCard>
      )}

      {/* PICK PROPERTY */}
      {live && props.length>0 && (
        <SoftCard hover={false} style={{ marginTop:16 }}>
          <SectionHead sub={saEmail?("Connected as "+saEmail):"Choose the property to track"}>Select a property</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {props.map((p,i)=>(
              <button key={i} className="neo-btn nav-item" onClick={()=>pickProperty(p.url)} style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", textAlign:"left" }}>
                <Icon name="globe" size={16} style={{ color:"var(--t-700)" }} />
                <span style={{ flex:1, fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>{p.url}</span>
                <Chip tone="gray" size="sm">{p.permission}</Chip>
              </button>
            ))}
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
              {[["queries","Top Queries"],["pages","Top Pages"],["striking","Quick Wins (11–20)"],["decay","Content Decay"],["anomalies","Anomalies"],["indexing","Indexing & Drops"]].map(([v,l])=>(
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
                  <div key={i} style={{ display:"flex", alignItems:"center", padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13 }}>
                    <span style={{ width:46 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:22, borderRadius:7, background:"var(--gold-bg)", color:"var(--gold)", fontSize:12, fontWeight:800 }}>{q.position}</span></span>
                    <span style={{ flex:1, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{q.query}</span>
                    <span style={{ width:90, textAlign:"right", color:"var(--muted)" }}>{fmt(q.impressions)} impr.</span>
                  </div>
                ))}
                {(data.striking||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No page-2 queries in this window.</div>}
              </div>
            )}
            {tab==="decay" && (
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>Content decay — pages losing clicks</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Compares the last 28 days vs the prior 28, ranked by absolute clicks lost. High-value declines that need a refresh.</div>
                  </div>
                  <NeoButton kind="primary" size="sm" icon={decayBusy?undefined:"trend"} disabled={decayBusy} onClick={loadDecay}>{decayBusy&&<Icon name="cog" size={15} className="audit-spin" />}{decayBusy?"Analyzing…":"Find decaying pages"}</NeoButton>
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
                          <NeoButton kind="soft" size="sm" icon="sparkles" style={{ marginLeft:"auto" }} onClick={()=>genBrief(d)}>Refresh brief</NeoButton>
                        </div>
                        {briefFor && briefFor.page===d.page && (
                          <div style={{ marginTop:10, padding:"12px 14px", background:"var(--surface)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
                            {briefFor.loading ? <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}><Icon name="cog" size={14} className="audit-spin" />Claude is writing a refresh brief…</div>
                              : <div className="md" style={{ fontSize:12.5 }} dangerouslySetInnerHTML={{ __html:(window.SentinelHelpers&&window.SentinelHelpers.renderMarkdown(briefFor.brief))||briefFor.brief }} />}
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
  const [gapComp,setGapComp] = useState("");
  const [gaps,setGaps] = useState(null);
  const [gapBusy,setGapBusy] = useState(false);
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

  useEffect(()=>{ setData(null); setGaps(null); setErr(null); setNeedsKey(false); setTval(null); setCompetitors(s.competitors||[]); setNegatives(s.negative_keywords||[]); },[s.id]);
  const loadTval = ()=>{
    // Reuse already-loaded keywords → zero DataForSEO units spent.
    const kws=(data&&data.topKeywords)||[];
    setTvalBusy(true);
    API.trafficValue(s.id, kws, s.semrush_db||"uk").then(r=>{ if(r.error){ setTval({error:r.error,noUnits:r.noUnits}); return; } setTval(r); }).catch(e=>setTval({error:e.message})).finally(()=>setTvalBusy(false));
  };
  const saveCompetitors = (comps,negs)=>{
    setCompetitors(comps); setNegatives(negs);
    if(live) API.saveSiteCompetitors(s.id, comps, negs).catch(()=>{});
    // reflect in local SITES so it persists across screen switches
    var site=window.SITES.find(x=>x.id===s.id); if(site){ site.competitors=comps; site.negative_keywords=negs; }
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
    setGapBusy(true); setGaps(null);
    // siteId makes the backend merge saved competitors + negatives + brand filtering
    API.semrushKeywordGap(domain, gapComp.trim()||undefined, (s.semrush_db)||"uk", s.id).then(r=>{
      if(r.needsKey){ setNeedsKey(true); return; }
      if(r.error){ if(r.unitsRemaining!=null) setUnits(r.unitsRemaining); setGaps({gaps:[],error:r.error,noUnits:!!r.noUnits}); return; }
      setGaps(r);
    }).catch(e=>setGaps({gaps:[],error:e.message})).finally(()=>setGapBusy(false));
  };
  const pushGapsToAirtable = ()=>{
    if(!gaps||!gaps.gaps||!gaps.gaps.length) return;
    ctx.toast("Pushing "+gaps.gaps.length+" gaps to Airtable…","teal");
    API.airtableSync(s.id,{ kinds:["gaps"], gaps:gaps.gaps }).then(r=>{
      if(r.error){ ctx.toast(r.error==="Airtable not connected"?"Connect Airtable first (Airtable Sync tab)":r.error, "clay"); return; }
      const n=(r.synced&&r.synced.gaps&&r.synced.gaps.pushed)||0;
      ctx.toast("Pushed "+n+" keyword gaps to Airtable ✓","teal");
    }).catch(e=>ctx.toast("Airtable: "+e.message,"clay"));
  };

  const ov = data && data.overview || {};
  const fmt = (v)=> v==null||v===""?"—":(isNaN(v)?v:Number(v).toLocaleString());
  const posTone = (p)=> p<=3?"teal":p<=10?"gold":"gray";

  return (
    <div className="rise">
      <PageHead title="DataForSEO" sub={`Live search-performance data for ${domain}.`}>
        <div style={{ display:"flex", gap:10 }}>
          <Chip tone="gray" size="sm" icon="globe">{(s.semrush_db||"uk").toUpperCase()} database</Chip>
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
            <div style={{ fontSize:13.5, color:"var(--muted)", maxWidth:420 }}>Organic keywords, rankings, traffic, competitors and backlinks — plus a keyword-gap tool that pushes straight to Airtable.</div>
            <NeoButton kind="primary" icon={loading?undefined:"bolt"} disabled={loading} onClick={load}>{loading&&<Icon name="cog" size={17} className="audit-spin" />}{loading?"Loading…":"Load DataForSEO data"}</NeoButton>
          </div>
        </SoftCard>
      )}

      {data && (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* KPI strip */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            <PatternCard icon="trend" tone="teal" value={fmt(ov.organicTraffic)} title="Organic traffic" sub="Est. monthly visits" />
            <PatternCard icon="search" tone="gold" value={fmt(ov.organicKeywords)} title="Organic keywords" sub="Total ranking" />
            <PatternCard icon="flag" tone="plum" value={fmt(ov.rank)} title="Authority rank" sub="Lower is better" />
            <PatternCard icon="link" tone="gray" value={fmt(data.backlinks&&data.backlinks.total)} title="Backlinks" sub={(data.backlinks&&fmt(data.backlinks.domains)||"—")+" ref. domains"} />
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
                      <PatternCard icon="shield" tone="plum" value={tval.curveSource==="site-calibrated"?"Calibrated":"Default"} title="CTR curve" sub={tval.curveSource==="site-calibrated"?"from your GSC data":"industry curve — connect GSC to calibrate"} />
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

            {tab==="competitors" && (
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {(data.competitors||[]).map((c,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"var(--clay-bg)", color:"var(--clay)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>{(c.domain||"?")[0].toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>{c.domain}</div>
                      <div style={{ fontSize:11.5, color:"var(--muted)" }}>{fmt(c.commonKeywords)} common keywords · {fmt(c.organicKeywords)} total</div>
                    </div>
                    <NeoButton kind="soft" size="sm" icon="plus" onClick={()=>{ saveCompetitors([...new Set([...competitors,c.domain])], negatives); setTab("gap"); ctx.toast("Added "+c.domain+" to competitors","teal"); }}>Track as competitor</NeoButton>
                  </div>
                ))}
                {(data.competitors||[]).length===0 && <div style={{ padding:"14px", color:"var(--muted)", fontSize:13 }}>No competitor data returned.</div>}
              </div>
            )}

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
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"var(--ink-2)" }}>{gaps.gapCount||(gaps.gaps||[]).length} gap keyword(s) · competitor brands & excluded terms filtered out</span>
                      <NeoButton kind="soft" size="sm" icon="layers" disabled={!(gaps.gaps||[]).length} onClick={pushGapsToAirtable}>Push to Airtable</NeoButton>
                    </div>
                    {(gaps.gaps||[]).length===0 && <div style={{ padding:"12px", fontSize:13, color:"var(--muted)" }}>No gap keywords found after filtering (all were competitor brand names or excluded terms).</div>}
                    {(gaps.gaps||[]).slice(0,40).map((g,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                        <span style={{ width:50 }}><span style={{ display:"inline-grid", placeItems:"center", minWidth:30, height:22, padding:"0 6px", borderRadius:7, background:TT[posTone(g.competitorPos)][1], color:TT[posTone(g.competitorPos)][0], fontSize:12, fontWeight:800 }}>#{g.competitorPos}</span></span>
                        <span style={{ flex:1, fontSize:13, fontWeight:600, fontFamily:"var(--mono)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.keyword}</span>
                        <span style={{ width:90, textAlign:"right", fontSize:13, fontWeight:700 }}>{fmt(g.volume)}</span>
                        <span style={{ width:70, textAlign:"right", fontSize:12, color:"var(--muted)" }}>${(g.cpc||0).toFixed(2)}</span>
                      </div>
                    ))}
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
  const [busy,setBusy] = useState("");
  const [competitor,setCompetitor] = useState("");
  const [log,setLog] = useState([]);
  const [syncKinds,setSyncKinds] = useState({ gaps:true, content:true, geo:true });
  const [airErr,setAirErr] = useState(null);   // persistent error banner

  const refresh = ()=>{
    if(!live){ return; }
    API.airtableStatus(s.id).then(st=>{ setStatus(st); if(st.config&&st.config.base_id) setBaseId(st.config.base_id); }).catch(()=>{});
    API.listAirtableLog(s.id).then(setLog).catch(()=>{});
  };
  useEffect(()=>{ setStatus(null); setBases([]); setTables([]); setPat(""); setBaseId(""); setLog([]); setAirErr(null); refresh(); },[s.id]);

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
    setBaseId(bid); setBusy("tables"); setAirErr(null);
    API.airtableTables(s.id, bid).then(r=>{ if(r.error){ setAirErr({ msg:r.error }); return; } setTables(r.tables||[]); }).catch(e=>setAirErr({ msg:e.message })).finally(()=>setBusy(""));
    API.airtableConfig(s.id,{ baseId:bid }).catch(()=>{});
  };
  const runSync = ()=>{
    const kinds=Object.keys(syncKinds).filter(k=>syncKinds[k]);
    if(!kinds.length){ ctx.toast("Select at least one data type","gold"); return; }
    setBusy("sync"); setAirErr(null); ctx.toast("Syncing to Airtable…","teal");
    API.airtableSync(s.id,{
      kinds,
      competitor: competitor.trim()||undefined,
      suggestions: (ctx.intel&&ctx.intel.suggestions)||[],
      geoResults: (ctx.geo&&ctx.geo.results)||[],
    }).then(r=>{
      if(r.error){ setAirErr({ msg:r.error }); return; }
      const total=Object.values(r.synced||{}).reduce((a,x)=>a+(x.pushed||0),0);
      if(total===0){ setAirErr({ msg:"Nothing was synced — run Content Intel / AI Visibility first (for content & GEO), or set a competitor + DataForSEO units (for keyword gaps)." }); return; }
      ctx.toast("Synced "+total+" record(s) to Airtable ✓","teal");
      refresh();
    }).catch(e=>setAirErr({ msg:"Sync failed: "+e.message })).finally(()=>setBusy(""));
  };

  const connected = status && status.connected;
  const hasBase = baseId || (status&&status.config&&status.config.base_id);

  return (
    <div className="rise">
      <PageHead title="Airtable Sync" sub={`Push ${s.name}'s keyword gaps, content ideas & AI-citation data into Airtable.`}>
        {connected && hasBase && <NeoButton kind="primary" icon={busy==="sync"?undefined:"upload"} disabled={busy==="sync"} onClick={runSync}>{busy==="sync"&&<Icon name="cog" size={17} className="audit-spin" />}{busy==="sync"?"Syncing…":"Sync now"}</NeoButton>}
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
                  <span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Create a token at <b>airtable.com/create/tokens</b> with scopes <b>data.records:write</b> + <b>schema.bases:read</b> (add <b>schema.bases:write</b> to auto-create tables). Grant it access to your base. The token is encrypted server-side and never returned to the browser.</span>
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:11, fontSize:13.5, color:"var(--ink-2)" }}>
                <Icon name="check" size={17} style={{ color:"var(--t-600)" }} />Token stored & verified. {status.config&&status.config.last_sync?`Last sync ${window.timeAgo?window.timeAgo(status.config.last_sync):status.config.last_sync}.`:"No sync yet."}
                <NeoButton kind="ghost" size="sm" icon="link" style={{ marginLeft:"auto" }} onClick={()=>{ setStatus({connected:false}); setBases([]); setTables([]); setPat(""); ctx.toast("Enter a new Airtable token to reconnect","gold"); }}>Reconnect</NeoButton>
              </div>
            )}
          </SoftCard>

          {/* Step 2 — base + tables */}
          {connected && (
            <SoftCard hover={false}>
              <SectionHead sub="Choose the base; tables auto-create if your token allows it">2 · Destination base</SectionHead>
              {bases.length===0 && !hasBase && <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>{ setBusy("bases"); API.airtableConnect(s.id, "noop").catch(()=>{}); refresh(); ctx.toast("Re-enter token to list bases","gold"); }}>Load bases</NeoButton>}
              <div style={{ display:"flex", flexWrap:"wrap", gap:9 }}>
                {bases.map(b=>(
                  <button key={b.id} onClick={()=>chooseBase(b.id)} className="neo-btn"
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:"var(--r-md)", background:baseId===b.id?"var(--t-50)":"var(--surface)", boxShadow:baseId===b.id?"var(--neo-xs)":"var(--neo-sm)", fontSize:13, fontWeight:700, color:baseId===b.id?"var(--t-700)":"var(--ink-2)" }}>
                    <Icon name="layers" size={15} />{b.name}
                  </button>
                ))}
                {bases.length===0 && hasBase && <Chip tone="teal" size="sm" icon="check">Base configured: {(status.config&&status.config.base_id)||baseId}</Chip>}
              </div>
              {tables.length>0 && (
                <div style={{ marginTop:14, fontSize:12.5, color:"var(--muted)" }}>
                  <b>{tables.length}</b> table(s) in this base. The agent will write to (or create): <b>SEO Keyword Gaps</b>, <b>Content Suggestions</b>, <b>AI Citation Results</b>.
                </div>
              )}
            </SoftCard>
          )}

          {/* Step 3 — what to sync */}
          {connected && hasBase && (
            <SoftCard hover={false}>
              <SectionHead sub="Pick the data, then Sync now (top-right)">3 · What to sync</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {[["gaps","SEO Keyword Gaps","DataForSEO keywords competitors rank for that you don't","bolt"],
                  ["content","Content Suggestions","Claude article ideas from Content Intel","sparkles"],
                  ["geo","AI Citation Results","Per-prompt GEO citation results","globe"]].map(([k,label,desc,icon])=>(
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:"var(--r-md)", background:syncKinds[k]?"var(--t-50)":"var(--bg)", boxShadow:syncKinds[k]?"var(--neo-xs)":"var(--neo-in)" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:syncKinds[k]?"var(--t-100)":"var(--surface)", color:syncKinds[k]?"var(--t-700)":"var(--faint)", display:"grid", placeItems:"center" }}><Icon name={icon} size={16} /></div>
                    <div style={{ flex:1 }}><div style={{ fontSize:13.5, fontWeight:700 }}>{label}</div><div style={{ fontSize:11.5, color:"var(--muted)" }}>{desc}</div></div>
                    <Toggle on={syncKinds[k]} onChange={v=>setSyncKinds({...syncKinds,[k]:v})} size={40} />
                  </div>
                ))}
              </div>
              {syncKinds.gaps && (
                <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:12, flexWrap:"wrap" }}>
                  <span style={{ fontSize:12.5, fontWeight:700, color:"var(--muted)" }}>Keyword-gap competitor:</span>
                  <input value={competitor} onChange={e=>setCompetitor(e.target.value)} placeholder="competitor.com"
                    className="search-in" style={{ flex:1, minWidth:180, padding:"9px 13px", borderRadius:"var(--r-pill)", border:"none", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:13, fontFamily:"var(--mono)", color:"var(--ink)", outline:"none" }} />
                  <span style={{ fontSize:11.5, color:"var(--faint)" }}>needs DataForSEO key</span>
                </div>
              )}
              <div style={{ marginTop:14, fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:7 }}>
                <Icon name="sparkles" size={13} />Content + GEO sync use your latest Content Intel / AI Visibility results. Run those first for data.
              </div>
            </SoftCard>
          )}

          {/* sync log */}
          {log.length>0 && (
            <SoftCard hover={false}>
              <SectionHead sub="Recent pushes to Airtable">Sync Log</SectionHead>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {log.map((l,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:l.status==="ok"?"var(--t-100)":"var(--clay-bg)", color:l.status==="ok"?"var(--t-700)":"var(--clay)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={l.status==="ok"?"check":"alert"} size={14} /></div>
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{l.kind==="gaps"?"Keyword gaps":l.kind==="content"?"Content suggestions":"AI citation results"}</span>
                    <span style={{ fontSize:12.5, fontWeight:700, color:"var(--t-700)" }}>{l.records_pushed} rows</span>
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
  useEffect(()=>{ setMsgs([]); setHistory([]); setConvoId(null); },[siteId]);
  const stop = ()=>{ if(abortRef.current){ try{ abortRef.current.abort(); }catch(e){} } };

  // send: text + optional images. STREAMS the reply token-by-token via SSE.
  const send = async (text, images)=>{
    const t=(text||"").trim(); const imgs=(images||[]);
    if((!t&&!imgs.length)||busy||!siteId) return;
    const userMsg={ role:"user", text:t, images:imgs.map(i=>i.url) };
    const nextDisplay=[...msgs,userMsg];
    // add the user msg + an empty assistant msg we stream into
    setMsgs([...nextDisplay,{role:"assistant",text:"",tools:[],streaming:true}]);
    setBusy(true);
    const cfg=window.SENTINEL_CONFIG||{};
    const ctrl=new AbortController(); abortRef.current=ctrl;
    const apply=(fn)=>setMsgs(m=>{ const a=[...m]; const last=a[a.length-1]; if(last&&last.role==="assistant") a[a.length-1]=fn(last); return a; });
    try{
      const res=await fetch((cfg.engineApi||"http://localhost:8787")+"/chat-stream",{
        method:"POST", headers:{"Content-Type":"application/json"}, signal:ctrl.signal,
        body:JSON.stringify({ siteId, text:t, images:imgs.map(i=>i.url), apiHistory:history, displayMessages:nextDisplay, conversationId:convoId }),
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
          else if(ev==="done"){ apply(a=>({...a,streaming:false,tools:d.toolsUsed||a.tools})); if(d.conversationId){ setConvoId(d.conversationId);
              API.chatLoad(d.conversationId).then(rr=>{ if(rr.conversation&&rr.conversation.api_history) setHistory(rr.conversation.api_history); }).catch(()=>{}); } }
          else if(ev==="error") apply(a=>({...a,text:(a.text||"")+"\n⚠️ "+d.error,streaming:false}));
        }
      }
      apply(a=>({...a,streaming:false}));
    }catch(e){
      if(e.name==="AbortError"){ apply(a=>({...a,text:(a.text||"")+(a.text?"\n\n_(stopped)_":"_(stopped)_"),streaming:false,stopped:true})); }
      else setMsgs(m=>{ const a=[...m]; const last=a[a.length-1]; if(last&&last.role==="assistant"&&!last.text) a[a.length-1]={...last,text:"⚠️ "+e.message,streaming:false}; return a; });
    }
    finally{ setBusy(false); abortRef.current=null; }
  };
  const reset = ()=>{ setMsgs([]); setHistory([]); setConvoId(null); };
  // resume a saved conversation
  const load = (id)=>{
    API.chatLoad(id).then(r=>{
      const c=r.conversation; if(!c) return;
      setMsgs(c.messages||[]); setHistory(c.api_history||[]); setConvoId(c.id);
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
          <h1 style={{ margin:0, fontSize:28, fontWeight:800, letterSpacing:"-.025em", display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ width:38, height:38, borderRadius:12, background:"linear-gradient(135deg,var(--t-500),var(--t-700))", color:"#F3EFE4", display:"grid", placeItems:"center" }}><Icon name="sparkles" size={20} /></span>
            AI Strategist
          </h1>
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
  const { msgs, busy, send:sendChat, reset } = useChat(s.id);
  const [input,setInput] = useState("");
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
            <button onClick={()=>{ setOpen(false); ctx.goto("chat"); }} className="neo-btn tip" data-tip="Open full chat" style={{ width:32, height:32, borderRadius:9, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="upload" size={15} /></button>
            <button onClick={reset} className="neo-btn tip" data-tip="New chat" style={{ width:32, height:32, borderRadius:9, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="edit" size={15} /></button>
          </div>
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

/* ---------------- App ---------------- */
function App() {
  const [collapsed, setCollapsed] = useState(()=>{ try{return localStorage.getItem("sentinel-collapsed")==="1";}catch(e){return false;} });
  const [screen, setScreen] = useState("overview");
  const [sites, setSites] = useState(window.SITES);
  const [siteId, setSiteId] = useState((window.SITES[0]&&window.SITES[0].id)||"atlas");
  const [proposals, setProposals] = useState(window.PROPOSALS);
  const [killSwitch, setKillSwitch] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [auditing, setAuditing] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addSiteFor, setAddSiteFor] = useState(null);
  const [runAuditOpen, setRunAuditOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [geo, setGeo] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState("");
  const [, forceTick] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const goto = useCallback((k)=>{ setScreen(k); if(scrollRef.current) scrollRef.current.scrollTop=0; },[]);

  // Load this account's audit history whenever the active site changes (unique per account).
  const loadHistory = useCallback((sid)=>{
    const id = sid || siteId;
    if(!API || !id || String(id).length<10){ setHistory([]); return; }
    setHistoryLoading(true);
    API.listAudits(id).then(rows=>{
      const mapped=(rows||[]).slice().reverse().map(r=>({ id:r.id, ts:r.created_at, scope:r.scope, scores:r.scores||{}, cwv:r.cwv||{}, findings:r.findings||[], variance:(r.summary&&r.summary.variance)||null }));
      setHistory(mapped);
    }).catch(()=>setHistory([])).finally(()=>setHistoryLoading(false));
  },[siteId]);
  useEffect(()=>{ loadHistory(siteId); setIntel(null); setGeo(null); setGeoStatus(""); },[siteId]);

  const ctx = {
    screen, goto, site, sites, proposals, killSwitch, toast, auditing, addSiteFor,
    notifOpen, setNotifOpen, searchQuery, setSearchQuery,
    history, historyLoading, reloadHistory:()=>loadHistory(siteId),
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
      API.geoPrompts(site.name, (site.stack&&site.stack.type)||undefined, []).then(pr=>{
        const prompts=(pr.prompts||[]).slice(0,12); // cap for cost/time
        if(!prompts.length) throw new Error("Couldn't generate buyer-intent prompts — check the Claude API key.");
        setGeoStatus("Querying "+prompts.length+" prompts through AI (web search)… ~1-2 min");
        return API.geoTrack(siteId, domain, prompts, comps);
      }).then(r=>{
        if(r.error){ setGeo({ error:r.error }); toast("GEO scan: "+r.error.slice(0,50),"clay"); return; }
        setGeo(r);
        try{ API.logActivity({site_id:siteId,owner:site.owner,type:"audit",actor:"Agent",icon:"globe",text:"AI visibility scan — "+r.shareOfVoice+"% share of voice",meta:r.promptsCited+"/"+r.promptsTotal+" prompts cited"}); }catch(e){}
        toast("AI visibility: "+r.shareOfVoice+"% share of voice","teal");
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
          "\n\n\n=== robots.txt AI-bot rules (merge into robots.txt) ===\n\n"+(r.aiRobots||"").replace(/</g,"&lt;")+"</pre>"); w.document.close(); }
        toast("GEO artifacts generated — review in the new tab","teal");
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
      const ok=window.SentinelHelpers.exportAuditPDF(site, window.FINDINGS||[], proposals);
      toast(ok?"Opening printable report — choose 'Save as PDF'":"Allow pop-ups to export","teal");
    },
    // Export the activity trail as CSV.
    exportTrail:()=>{
      const rows=(window.ACTIVITY||[]).map(a=>({ time:a.t, type:a.type, who:a.who, action:a.text, meta:a.meta }));
      const ok=window.SentinelHelpers.exportCSV("sentinel-activity.csv", rows);
      toast(ok?"Activity trail exported (CSV)":"Nothing to export yet","teal");
    },
    switchSite:(id)=>{ const x=sites.find(s=>s.id===id); if(x.status!=="connected"){ setAddSiteFor(x); setAddSiteOpen(true); return; } setSiteId(id); toast("Switched to "+x.name,"teal"); },
    runAudit:()=>{
      if(auditing) return;
      setAuditing(true);
      toast("Read-only audit running…","teal");
      // LIVE: full audit (scores + findings + draft proposals) via the engine.
      if(isLive()){
        const url = site._rawUrl.replace(/\/$/,"")+"/";
        API.auditFull(url, null, true).then(async (res)=>{
          if(res&&res.scores){
            // Median-of-N PSI in parallel → stabler scores + IQR noise band (credibility).
            let variance=null, medScores=null;
            try{
              const mr=await API.psiMedian([url],"mobile",3);
              const m=(mr&&mr.results&&mr.results[0])||null;
              if(m&&m.scores&&!m.error){ medScores=m.scores; variance={iqr:m.scoresIqr,n:m.runs}; }
            }catch(e){}
            const cwv=res.cwv||{};
            // Prefer the median when available — single runs carry ±5-10pt noise.
            const sc=medScores?{...res.scores,...medScores}:res.scores;
            const cwvUi={ lcp:{v:cwv.lcp?(cwv.lcp/1000).toFixed(1)+"s":"—",state:cwv.lcp<2500?"good":cwv.lcp<4000?"ni":"poor"},
              inp:{v:cwv.tbt!=null?Math.round(cwv.tbt)+"ms":"—",state:"good"},
              cls:{v:cwv.cls!=null?cwv.cls.toFixed(2):"—",state:(cwv.cls||0)<0.1?"good":"ni"} };
            setSites(prev=>prev.map(x=>x.id!==siteId?x:{...x,lastAudit:"just now",prev:x.scores,scores:sc,cwv:cwvUi,openFindings:(res.findings||[]).length}));
            // Findings feed the Audits screen (reads window.FINDINGS).
            window.FINDINGS = res.findings||[];
            // Persist scores + audit + activity.
            try{ await API.updateSite(siteId,{scores:sc,prev_scores:site.scores,last_audit:new Date().toISOString(),open_findings:(res.findings||[]).length}); }catch(e){}
            try{ await API.createAudit({site_id:siteId,owner:site.owner,scope:"single",scores:sc,cwv:res.cwv,findings:res.findings,summary:variance?{variance}:null}); }catch(e){}
            try{ await API.logActivity({site_id:siteId,owner:site.owner,type:"audit",actor:"Agent",icon:"radar",text:(res.findings||[]).length+" findings · "+site.name,meta:"Perf "+sc.performance+" · SEO "+sc.seo}); }catch(e){}
            // Create draft proposals in Supabase (deduped against existing).
            const drafts=res.proposals||[];
            const created=[];
            for(const p of drafts){
              try{
                const row=await API.createProposal({site_id:siteId,owner:site.owner,finding_id:p.findingId,disc:p.disc,risk:p.risk,channel:p.channel,title:p.title,page:p.page,impact:p.impact,target:p.target,field:p.field,before_val:p.before,after_val:p.after,status:"proposed"});
                created.push(row);
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
          setAuditing(false); toast("Audit complete — "+((res.findings||[]).length)+" findings, "+((res.proposals||[]).length)+" proposals ✓","teal");
        }).catch(e=>{ setAuditing(false); toast("Audit failed: "+e.message,"clay"); });
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
            await API.siteConnect(creds,{ name, staging:formData.staging||null,
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
      if(isLive()){
        const approved=proposals.filter(p=>p.status==="approved");
        (async()=>{
          for(const p of approved){
            if(p.channel==="rest-write" && p._postId){
              try{
                // Secure apply: server decrypts the stored secret by siteId.
                const r=await API.applyMeta(siteId,{proposalId:p.id,objectType:p._objectType||"posts",postId:p._postId,field:p.field,value:p.after},killSwitch);
                const st=(r&&r.status==="verified")?"verified":(r&&r.status==="dry-run")?"approved":(r&&r.status==="blocked")?"approved":"failed";
                setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:st}:x));
              }catch(e){ setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"failed"}:x)); }
            } else {
              // non-REST (theme/css/manual) → manual track, mark verified.
              setProposals(ps=>ps.map(x=>x.id===p.id?{...x,status:"verified"}:x));
              if(isLive())API.updateProposal(p.id,{status:"verified"}).catch(()=>{});
            }
          }
          setApplyOpen(false); toast(killSwitch?"Kill switch on — simulated only":"Applied & verified · rollback armed","teal");
        })();
        return;
      }
      // MOCK fallback
      setProposals(p=>p.map(x=>x.status==="approved"?{...x,status:"verified"}:x)); setApplyOpen(false); toast("Applied & verified · rollback armed","teal");
    },
    rollback:(id)=>{
      const p=proposals.find(x=>x.id===id);
      if(isLive() && p && p._postId){
        API.rollbackMeta(siteId,{proposalId:id,objectType:p._objectType||"posts",postId:p._postId,field:p.field,oldValue:p._oldValue||p.before}).then(()=>{
          API.updateProposal(id,{status:"rolled-back"}).catch(()=>{});
          API.logActivity({site_id:siteId,owner:site.owner,type:"rolled-back",actor:"You",icon:"undo",text:"Rolled back "+p.title,meta:"restored old value"}).catch(()=>{});
        }).catch(e=>toast("Rollback failed: "+e.message,"clay"));
      }
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
    toggleKill:()=>{ setKillSwitch(k=>{ toast(!k?"Kill switch ON — all writes disabled":"Kill switch released", !k?"clay":"teal"); return !k; }); },
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

  const SCREENS = { overview:Dashboard, exec:ExecScreen, sites:SitesScreen, audits:AuditsScreen, history:HistoryScreen, plan:OpportunitiesScreen, content:ContentScreen, optimize:OptimizeScreen, chat:ChatScreen, geo:GeoScreen, gsc:GscScreen, semrush:SemrushScreen, airtable:AirtableScreen, review:ReviewScreen, activity:ActivityScreen, admin:AdminScreen, settings:SettingsScreen };
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
