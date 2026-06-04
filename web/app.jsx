/* ===========================================================
   Sentinel — App shell, routing, global state
   =========================================================== */
const NAV = [
  { group:"Workspace", items:[
    { k:"overview", label:"Overview", icon:"grid" },
    { k:"sites",    label:"Sites",    icon:"globe" },
    { k:"audits",   label:"Audits & Reports", icon:"radar" },
    { k:"review",   label:"Review Queue", icon:"list", badge:"pending" },
  ]},
  { group:"Manage", items:[
    { k:"activity", label:"Activity", icon:"clock" },
    { k:"settings", label:"Settings", icon:"cog" },
  ]},
];
const HEADERS = {
  overview:["Overview","Health, safety state, and what needs your attention."],
  sites:["Sites","Connect, detect, and switch between WordPress accounts."],
  audits:["Audits & Reports","Read-only audits with prioritized, in-app findings."],
  review:["Review Queue","Approve, edit, or reject every proposed change."],
  activity:["Activity","A complete, exportable audit trail."],
  settings:["Settings","Capabilities, safety switches, and credentials."],
};

function Toasts({ list }) {
  return (
    <div style={{ position:"fixed", right:22, bottom:22, zIndex:120, display:"flex", flexDirection:"column", gap:10 }}>
      {list.map(t=>(
        <div key={t.id} className="pop" style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 16px",
          background:"var(--g-900)", color:"#fff", borderRadius:"var(--r-md)", boxShadow:"var(--sh-lg)", maxWidth:360 }}>
          <span style={{ width:24, height:24, borderRadius:99, background:TONES[t.tone]?TONES[t.tone][0]:"var(--g-500)", display:"grid", placeItems:"center", flexShrink:0 }}>
            <Icon name={t.tone==="red"?"alert":t.tone==="amber"?"undo":"check"} size={14} sw={2.4} />
          </span>
          <span style={{ fontSize:13.5, fontWeight:600 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function SiteSwitcher({ ctx, open, setOpen }) {
  const s = ctx.site;
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:11, padding:"7px 12px 7px 8px", border:"1px solid var(--line)", borderRadius:"var(--r-md)", background:"var(--card)", boxShadow:"var(--sh-sm)" }}>
        <Glyph color={s.favicon} char={s.glyph} size={32} r={9} />
        <div style={{ textAlign:"left" }}>
          <div style={{ fontSize:13.5, fontWeight:700, lineHeight:1.1 }}>{s.name}</div>
          <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{s.url}</div>
        </div>
        <Icon name="chevD" size={16} style={{ color:"var(--faint)", marginLeft:4, transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
          <div className="pop" style={{ position:"absolute", top:"calc(100% + 8px)", left:0, width:320, zIndex:50,
            background:"var(--card)", borderRadius:"var(--r-lg)", boxShadow:"var(--sh-lg)", border:"1px solid var(--line)", overflow:"hidden" }}>
            <div style={{ padding:"11px 16px", fontSize:11, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", color:"var(--faint)" }}>Switch site · scopes everything</div>
            {ctx.sites.map(site=>{
              const sm = statusMeta[site.status];
              const active = site.id===ctx.site.id;
              return (
                <button key={site.id} onClick={()=>{ ctx.switchSite(site.id); setOpen(false); }} className="sn-nav"
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 16px", background: active?"var(--g-50)":"transparent", transition:"background .12s" }}>
                  <Glyph color={site.favicon} char={site.glyph} size={34} r={10} />
                  <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>{site.name}</div>
                    <div style={{ fontSize:11.5, color:"var(--muted)", fontFamily:"var(--mono)" }}>{site.url}</div>
                  </div>
                  <Pill tone={sm.tone} size="sm" dot>{sm.label}</Pill>
                  {active && <Icon name="check" size={16} style={{ color:"var(--g-600)" }} />}
                </button>
              );
            })}
            <button onClick={()=>{ ctx.openAddSite(null); setOpen(false); }} className="sn-nav" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 16px", borderTop:"1px solid var(--line)", color:"var(--g-700)", fontWeight:700, fontSize:13.5 }}>
              <div style={{ width:34, height:34, borderRadius:10, border:"1.5px dashed var(--g-200)", display:"grid", placeItems:"center" }}><Icon name="plus" size={16} /></div>
              Connect a new site
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Sidebar({ ctx }) {
  return (
    <aside style={{ width:248, flexShrink:0, background:"var(--card)", borderRight:"1px solid var(--line)", display:"flex", flexDirection:"column", padding:"22px 16px" }}>
      {/* logo */}
      <div style={{ display:"flex", alignItems:"center", gap:11, padding:"0 8px 4px" }}>
        <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(145deg,var(--g-600),var(--g-800))", display:"grid", placeItems:"center", boxShadow:"0 4px 12px rgba(26,110,74,.32)" }}>
          <Icon name="shield" size={21} style={{ color:"#fff" }} fill />
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, letterSpacing:"-.02em" }}>Sentinel</div>
          <div style={{ fontSize:10.5, color:"var(--muted)", fontWeight:600, letterSpacing:".02em", marginTop:-1 }}>WP SEO Agent</div>
        </div>
      </div>

      <nav style={{ marginTop:26, flex:1 }}>
        {NAV.map(grp=>(
          <div key={grp.group} style={{ marginBottom:22 }}>
            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:"var(--faint)", padding:"0 12px 8px" }}>{grp.group}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {grp.items.map(it=>{
                const active = ctx.screen===it.k;
                const badge = it.badge==="pending" ? ctx.proposals.filter(p=>p.status==="proposed").length : null;
                return (
                  <button key={it.k} onClick={()=>ctx.goto(it.k)} className="sn-nav"
                    style={{ position:"relative", display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:"var(--r-md)",
                      background: active?"var(--g-50)":"transparent", color: active?"var(--g-800)":"var(--ink-2)", fontWeight: active?700:600, fontSize:14, transition:"background .14s, color .14s" }}>
                    {active && <span style={{ position:"absolute", left:-16, top:"50%", transform:"translateY(-50%)", width:4, height:22, borderRadius:99, background:"var(--g-600)" }} />}
                    <Icon name={it.icon} size={19} sw={active?2:1.7} />
                    <span style={{ flex:1, textAlign:"left" }}>{it.label}</span>
                    {badge>0 && <span style={{ fontSize:11, fontWeight:800, color:"#fff", background:"var(--g-600)", borderRadius:99, padding:"1px 7px", minWidth:20, textAlign:"center" }}>{badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* safety state card */}
      <div style={{ borderRadius:"var(--r-lg)", overflow:"hidden", border:"1px solid "+(ctx.killSwitch?"var(--red-line)":"var(--g-200)"), background: ctx.killSwitch?"var(--red-bg)":"var(--g-50)" }}>
        <div style={{ padding:"14px 15px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:9, height:9, borderRadius:99, background: ctx.killSwitch?"var(--red)":"var(--g-500)", animation:"pulseDot 1.8s infinite" }} />
            <span style={{ fontSize:12.5, fontWeight:700, color: ctx.killSwitch?"var(--red)":"var(--g-800)" }}>{ctx.killSwitch?"Writes disabled":"Safe mode active"}</span>
          </div>
          <div style={{ fontSize:11.5, color: ctx.killSwitch?"#8C3A2E":"var(--g-700)", marginTop:5, lineHeight:1.5 }}>
            {ctx.killSwitch ? "Kill switch engaged across all sites." : "Read-only by default. Every write is verified & reversible."}
          </div>
          <Btn danger={!ctx.killSwitch} kind={ctx.killSwitch?"ghost":undefined} size="sm" full icon="power" style={{ marginTop:11, justifyContent:"center" }} onClick={ctx.toggleKill}>
            {ctx.killSwitch?"Release":"Kill switch"}
          </Btn>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ ctx, switcherOpen, setSwitcherOpen }) {
  const writeArmed = ctx.site.writeArmed && !ctx.killSwitch;
  return (
    <header style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 28px", borderBottom:"1px solid var(--line)", background:"var(--bg-soft)" }}>
      <SiteSwitcher ctx={ctx} open={switcherOpen} setOpen={setSwitcherOpen} />
      <div style={{ flex:1, maxWidth:360, position:"relative" }}>
        <Icon name="search" size={17} style={{ position:"absolute", left:14, top:11, color:"var(--faint)" }} />
        <input className="sn-input" placeholder="Search findings, pages, sites…" style={{ paddingLeft:40, background:"var(--card)" }} />
      </div>
      <div style={{ flex:1 }} />
      {/* global safety pill */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 13px", borderRadius:99,
        background: ctx.killSwitch?"var(--red-bg)":writeArmed?"var(--g-50)":"var(--bg)",
        border:"1px solid "+(ctx.killSwitch?"var(--red-line)":writeArmed?"var(--g-200)":"var(--line)") }}>
        <Icon name={ctx.killSwitch?"lock":writeArmed?"power":"eye"} size={15} style={{ color: ctx.killSwitch?"var(--red)":writeArmed?"var(--g-700)":"var(--muted)" }} />
        <span style={{ fontSize:12.5, fontWeight:700, color: ctx.killSwitch?"var(--red)":writeArmed?"var(--g-800)":"var(--ink-2)" }}>
          {ctx.killSwitch?"Kill switch ON":writeArmed?"Write-armed":"Read-only"}
        </span>
      </div>
      <button className="sn-iconbtn" style={{ width:40, height:40, borderRadius:11, display:"grid", placeItems:"center", border:"1px solid var(--line)", background:"var(--card)", color:"var(--ink-2)", position:"relative" }} onClick={()=>ctx.goto("activity")}>
        <Icon name="bell" size={18} />
        <span style={{ position:"absolute", top:9, right:10, width:7, height:7, borderRadius:99, background:"var(--red)", border:"1.5px solid var(--card)" }} />
      </button>
      <div style={{ display:"flex", alignItems:"center", gap:10, paddingLeft:6 }}>
        <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#3A6EA5,#5B4B9A)", color:"#fff", display:"grid", placeItems:"center", fontWeight:700, fontSize:14 }}>MR</div>
        <div style={{ lineHeight:1.2 }}>
          <div style={{ fontSize:13.5, fontWeight:700 }}>Mara Reyes</div>
          <div style={{ fontSize:11.5, color:"var(--muted)" }}>Owner · 2FA on</div>
        </div>
      </div>
    </header>
  );
}

function App() {
  const [screen, setScreen] = useState("overview");
  const [siteId, setSiteId] = useState("atlas");
  const [sites, setSites] = useState(SITES);
  const [proposals, setProposals] = useState(PROPOSALS);
  const [killSwitch, setKillSwitch] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addSiteFor, setAddSiteFor] = useState(null);
  const [runAuditOpen, setRunAuditOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const scrollRef = useRef(null);

  const site = sites.find(s=>s.id===siteId) || sites[0];

  const toast = useCallback((msg, tone="green")=>{
    const id = Math.random().toString(36).slice(2);
    setToasts(t=>[...t,{id,msg,tone}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 3200);
  },[]);

  const goto = useCallback((k)=>{ setScreen(k); if(scrollRef.current) scrollRef.current.scrollTop=0; },[]);

  const ctx = {
    screen, goto, site, sites, proposals, killSwitch,
    addSiteFor,
    toast,
    switchSite:(id)=>{ const s=sites.find(x=>x.id===id); if(s.status==="auth-failed"){ setAddSiteFor(s); setAddSiteOpen(true); return; } setSiteId(id); toast("Switched to "+s.name+" — scope updated","green"); },
    openAddSite:(s)=>{ setAddSiteFor(s); setAddSiteOpen(true); },
    closeAddSite:()=>{ setAddSiteOpen(false); setAddSiteFor(null); },
    finishAddSite:(editing)=>{
      if(editing){ setSites(prev=>prev.map(x=>x.id===editing.id?{...x,status:"connected",role:"Administrator",writeArmed:true,selftest:"ready",muPlugin:true}:x)); toast(editing.name+" reconnected ✓","green"); }
      else { toast("Site connected & stack detected ✓","green"); }
      setAddSiteOpen(false); setAddSiteFor(null);
    },
    openRunAudit:()=>setRunAuditOpen(true),
    closeRunAudit:()=>setRunAuditOpen(false),
    approveProposal:(id)=>{ setProposals(p=>p.map(x=>x.id===id?{...x,status:"approved"}:x)); toast("Proposal approved","green"); },
    rejectProposal:(id)=>{ setProposals(p=>p.filter(x=>x.id!==id)); toast("Proposal rejected & removed","amber"); },
    bulkApprove:()=>{ setProposals(p=>p.map(x=>(x.status==="proposed"&&x.risk==="low")?{...x,status:"approved"}:x)); toast("Low-risk batch approved","green"); },
    openApply:()=>setApplyOpen(true),
    closeApply:()=>setApplyOpen(false),
    commitApplied:()=>{ setProposals(p=>p.map(x=>x.status==="approved"?{...x,status:"verified"}:x)); setApplyOpen(false); toast("Applied & verified · rollback armed","green"); },
    rollback:(id)=>{ setProposals(p=>p.map(x=>x.id===id?{...x,status:"rolled-back"}:x)); toast("Change rolled back — value restored","amber"); },
    toggleKill:()=>{ setKillSwitch(k=>{ toast(!k?"Kill switch ON — all writes disabled":"Kill switch released","red"); return !k; }); },
    toggleWriteArm:()=>{ setSites(prev=>prev.map(x=>x.id===siteId?{...x,writeArmed:!x.writeArmed}:x)); toast(site.writeArmed?"Switched to read-only":"Write mode armed","green"); },
  };

  const SCREENS = { overview:OverviewScreen, sites:SitesScreen, audits:AuditsScreen, review:ReviewScreen, activity:ActivityScreen, settings:SettingsScreen };
  const Screen = SCREENS[screen] || OverviewScreen;
  const [title, sub] = HEADERS[screen];

  const headerAction = {
    overview:<Btn icon="radar" onClick={ctx.openRunAudit}>Run audit</Btn>,
    audits:<Btn icon="radar" onClick={ctx.openRunAudit}>Run audit</Btn>,
    sites:<Btn icon="plus" onClick={()=>ctx.openAddSite(null)}>Connect a site</Btn>,
    review:null, activity:null, settings:null,
  }[screen];

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden" }}>
      <Sidebar ctx={ctx} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <Topbar ctx={ctx} switcherOpen={switcherOpen} setSwitcherOpen={setSwitcherOpen} />
        <main ref={scrollRef} className="scroll" style={{ flex:1, padding:"26px 28px 40px", background:"var(--bg)" }}>
          <div style={{ maxWidth:1240, margin:"0 auto" }}>
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:22, gap:16, flexWrap:"wrap" }}>
              <div>
                <h1 style={{ margin:0, fontSize:30, fontWeight:800, letterSpacing:"-.025em" }}>{title}</h1>
                <p style={{ margin:"6px 0 0", fontSize:14.5, color:"var(--muted)" }}>{sub}</p>
              </div>
              {headerAction}
            </div>
            <Screen ctx={ctx} />
          </div>
        </main>
      </div>

      {addSiteOpen && <AddSiteModal ctx={ctx} />}
      {runAuditOpen && <RunAuditModal ctx={ctx} />}
      {applyOpen && <ApplyModal ctx={ctx} />}
      <Toasts list={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
