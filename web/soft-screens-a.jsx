/* ===========================================================
   Sentinel Soft-UI — Sites & Audits screens
   =========================================================== */

/* ---- shared page header ---- */
function PageHead({ title, sub, children }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:22 }}>
      <div>
        <h1 style={{ margin:0, fontSize:30, fontWeight:800, letterSpacing:"-.025em" }}>{title}</h1>
        <p style={{ margin:"7px 0 0", fontSize:14.5, color:"var(--muted)" }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function StackChip({ k, v, accent }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"10px 13px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
      <span style={{ fontSize:10, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", color:"var(--faint)" }}>{k}</span>
      <span style={{ fontSize:13, fontWeight:700, color:accent?"var(--t-700)":"var(--ink)" }}>{v}</span>
    </div>
  );
}

/* ================= SITES ================= */
function SiteCard({ s, active, ctx }) {
  const sm = softStatus[s.status];
  const fail = s.status!=="connected";
  return (
    <SoftCard hover={false} pad={0} style={{ overflow:"hidden",
      boxShadow: active?"0 0 0 2px var(--t-400), var(--neo)":"var(--neo)" }}>
      <div style={{ padding:"22px 24px", display:"flex", gap:16, alignItems:"flex-start" }}>
        <Glyph color={s.favicon} char={s.glyph} size={50} r={15} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:17, fontWeight:700 }}>{s.name}</span>
            {active && <Chip tone="teal" size="sm" solid>Active</Chip>}
            <Chip tone={sm.tone} size="sm" icon={sm.icon}>{sm.label}</Chip>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:5, fontSize:13, color:"var(--muted)" }}>
            <Icon name="globe" size={14} /><span style={{ fontFamily:"var(--mono)" }}>{s.url}</span>
          </div>
        </div>
        {s.status==="connected" && <Chip tone={s.writeArmed?"teal":"gray"} dot>{s.writeArmed?"Write-armed":"Read-only"}</Chip>}
      </div>

      {fail ? (
        <div style={{ margin:"0 24px 22px", padding:"15px 17px", background:"var(--clay-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
          <div style={{ display:"flex", gap:11, alignItems:"flex-start" }}>
            <Icon name="alert" size={18} style={{ color:"var(--clay)", flexShrink:0, marginTop:1 }} />
            <div>
              <div style={{ fontSize:13.5, fontWeight:700, color:"var(--clay)" }}>401 Unauthorized — application password rejected</div>
              <div style={{ fontSize:12.5, color:"#8A4231", marginTop:3, lineHeight:1.5 }}>The site is reachable but the credential failed. Wordfence may be blocking REST auth — add the agent IP to the allowlist, then re-authenticate.</div>
              <div style={{ display:"flex", gap:9, marginTop:13 }}>
                <NeoButton kind="primary" size="sm" icon="link" onClick={()=>ctx.openAddSite(s)}>Re-authenticate</NeoButton>
                <NeoButton kind="soft" size="sm" icon="shield" onClick={()=>ctx.openAllowlistGuide&&ctx.openAllowlistGuide()}>Allowlist guide</NeoButton>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding:"0 24px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            <StackChip k="WordPress" v={s.stack.wp} />
            <StackChip k="Theme" v={s.stack.theme} />
            <StackChip k="SEO Plugin" v={s.stack.seo} accent />
            <StackChip k="Cache" v={s.stack.cache} />
          </div>
          <div style={{ padding:"0 24px 18px", display:"flex", flexWrap:"wrap", gap:7 }}>
            <Chip tone="gray" size="sm" icon="image">{s.stack.image}</Chip>
            <Chip tone="gray" size="sm" icon="shield">{s.stack.security}</Chip>
            {s.stack.builder && <Chip tone="gray" size="sm" icon="layers">{s.stack.builder}</Chip>}
            {s.stack.other.map(o=><Chip key={o} tone="gray" size="sm">{o}</Chip>)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:18, padding:"16px 24px", borderTop:"1px solid var(--line-soft)", background:"var(--canvas)", flexWrap:"wrap" }}>
            {[["Posts",s.scale.posts],["Pages",s.scale.pages],["Media",s.scale.media],["Sitemap",s.scale.sitemap]].map(([l,v])=>(
              <div key={l}>
                <div style={{ fontSize:15, fontWeight:800 }}>{v>=1000?(v/1000).toFixed(1)+"k":v.toLocaleString()}</div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>{l}</div>
              </div>
            ))}
            <div style={{ width:1, height:30, background:"var(--line)" }} />
            <div>
              <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, fontWeight:700, color: s.selftest==="ready"?"var(--t-700)":s.selftest==="partial"?"var(--gold)":"var(--clay)" }}>
                <Icon name={s.muPlugin?"check":"x"} size={13} sw={2.4} />mu-plugin {s.selftest}
              </span>
              <span style={{ fontSize:11, color:"var(--muted)" }}>Role: {s.role}</span>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:9 }}>
              {!active && <NeoButton kind="soft" size="sm" onClick={()=>ctx.switchSite(s.id)}>Set active</NeoButton>}
              {active && <NeoButton kind="primary" size="sm" icon="radar" onClick={ctx.openRunAudit}>Run audit</NeoButton>}
              <button className="neo-btn" style={{ width:36, height:36, borderRadius:11, background:"var(--surface)", boxShadow:"var(--neo-sm)", display:"grid", placeItems:"center", color:"var(--muted)" }} onClick={()=>ctx.goto("settings")}><Icon name="cog" size={16} /></button>
            </div>
          </div>
        </>
      )}
    </SoftCard>
  );
}

function SitesScreen({ ctx }) {
  return (
    <div className="rise">
      <PageHead title="Sites" sub="Connect, detect, and switch between WordPress accounts.">
        <NeoButton kind="primary" icon="plus" onClick={()=>ctx.openAddSite(null)}>Connect a site</NeoButton>
      </PageHead>
      <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
        <Chip tone="teal" icon="check">{ctx.sites.filter(s=>s.status==="connected").length} connected</Chip>
        <Chip tone="clay" icon="lock">{ctx.sites.filter(s=>s.status!=="connected").length} needs attention</Chip>
        <Chip tone="gray" icon="globe">scoped to {ctx.site.name}</Chip>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        {ctx.sites.map(s=><SiteCard key={s.id} s={s} active={s.id===ctx.site.id} ctx={ctx} />)}
      </div>
    </div>
  );
}

/* ---- Connect / Re-auth modal ---- */
function AddSiteModal({ ctx }) {
  const editing = ctx.addSiteFor;
  const [step,setStep] = useState(0);
  const [form,setForm] = useState({ url:editing?.url||"", user:"", pw:"", staging:editing?.staging||"" });
  const [done,setDone] = useState([]);
  const [caps,setCaps] = useState({ lighthouse:true, seo:true, perf:true, image:true, geo:false, a11y:true });

  useEffect(()=>{
    if(step!==1) return;
    setDone([]); let i=0;
    const tick=()=>{ i++; setDone(DETECT_STEPS.slice(0,i).map(s=>s.k)); if(i<DETECT_STEPS.length) setTimeout(tick,520); else setTimeout(()=>setStep(2),600); };
    const t=setTimeout(tick,450); return ()=>clearTimeout(t);
  },[step]);

  const valid = form.url && form.user && form.pw;
  const det = { wp:"6.5.3", theme:"Twenty Twenty-Four", builder:"Gutenberg", seo:"Rank Math", cache:"WP Rocket", image:"ShortPixel" };

  return (
    <SoftModal open onClose={ctx.closeAddSite} w={580}>
      <SoftModalHead icon={editing?"link":"plus"} title={editing?"Re-authenticate "+editing.name:"Connect a WordPress site"}
        sub={["Enter credentials","Detecting environment","Confirm & enable"][step]} onClose={ctx.closeAddSite} />
      <div style={{ display:"flex", gap:6, padding:"16px 22px 0" }}>
        {["Credentials","Detection","Capabilities"].map((l,i)=>(
          <div key={l} style={{ flex:1 }}>
            <div style={{ height:5, borderRadius:99, background:i<=step?"var(--t-500)":"var(--bg)", boxShadow:i<=step?"none":"var(--neo-in)", transition:"background .3s" }} />
            <div style={{ fontSize:11, fontWeight:700, marginTop:6, color:i<=step?"var(--t-700)":"var(--faint)" }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="scroll" style={{ padding:"18px 22px", maxHeight:"56vh" }}>
        {step===0 && (
          <div className="rise" style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field label="Site URL" hint="WordPress home URL"><SoftInput placeholder="https://example.com" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} /></Field>
            <Field label="Username / User ID"><SoftInput placeholder="seo-agent" value={form.user} onChange={e=>setForm({...form,user:e.target.value})} /></Field>
            <Field label="Application Password" hint="Encrypted at rest · never shown again"><SoftInput type="password" placeholder="xxxx xxxx xxxx xxxx" value={form.pw} onChange={e=>setForm({...form,pw:e.target.value})} /></Field>
            <Field label="Staging URL" hint="Optional — writes target staging first"><SoftInput placeholder="https://staging.example.com" value={form.staging} onChange={e=>setForm({...form,staging:e.target.value})} /></Field>
            <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
              <Icon name="shield" size={17} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} />
              <span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Use a dedicated, least-privilege application password. The secret is encrypted, never logged, and revocable anytime.</span>
            </div>
          </div>
        )}
        {step===1 && (
          <div className="rise" style={{ display:"flex", flexDirection:"column", gap:13, padding:"6px 0" }}>
            {DETECT_STEPS.map((d,idx)=>{
              const ok=done.includes(d.k), cur=!ok&&done.length===idx;
              return (
                <div key={d.k} style={{ display:"flex", alignItems:"center", gap:13 }}>
                  <div style={{ width:27, height:27, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0, background:ok?"var(--t-600)":"var(--bg)", color:ok?"#F3EFE4":"var(--faint)", boxShadow:ok?"none":"var(--neo-in)" }}>
                    {ok?<Icon name="check" size={14} sw={2.6} />:cur?<Icon name="cog" size={14} className="audit-spin" />:<span style={{ width:5,height:5,borderRadius:99,background:"currentColor" }} />}
                  </div>
                  <span style={{ fontSize:13.5, fontWeight:ok?600:500, color:ok?"var(--ink)":cur?"var(--ink-2)":"var(--faint)" }}>{d.label}</span>
                  {cur && <Chip tone="teal" size="sm" style={{ marginLeft:"auto" }}>running…</Chip>}
                </div>
              );
            })}
          </div>
        )}
        {step===2 && (
          <div className="rise">
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:14 }}>
              <Icon name="check" size={18} style={{ color:"var(--t-600)" }} /><span style={{ fontSize:14, fontWeight:700 }}>Stack detected — confirm capabilities</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:9, marginBottom:18 }}>
              <StackChip k="WordPress" v={det.wp} /><StackChip k="Theme" v={det.theme} /><StackChip k="Builder" v={det.builder} />
              <StackChip k="SEO" v={det.seo} accent /><StackChip k="Cache" v={det.cache} /><StackChip k="Image" v={det.image} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Capabilities</div>
            <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:12 }}><b style={{color:"var(--t-700)"}}>Rank Math detected</b> — SEO write-path pre-selected. Override anything.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {CAP_DEFS.map(c=>(
                <div key={c.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 13px", borderRadius:"var(--r-md)", background:caps[c.key]?"var(--t-50)":"var(--bg)", boxShadow:caps[c.key]?"var(--neo-xs)":"var(--neo-in)" }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:caps[c.key]?"var(--t-100)":"var(--surface)", color:caps[c.key]?"var(--t-700)":"var(--faint)", display:"grid", placeItems:"center" }}><Icon name={c.icon} size={16} /></div>
                  <div style={{ flex:1 }}><div style={{ fontSize:13.5, fontWeight:700 }}>{c.label}</div><div style={{ fontSize:11.5, color:"var(--muted)" }}>{c.desc}</div></div>
                  <Toggle on={caps[c.key]} onChange={v=>setCaps({...caps,[c.key]:v})} size={40} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"16px 22px", borderTop:"1px solid var(--line-soft)", background:"var(--canvas)" }}>
        <span style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><Icon name="lock" size={13} />Encrypted at rest</span>
        <div style={{ display:"flex", gap:10 }}>
          {step===0 && <NeoButton kind="soft" onClick={ctx.closeAddSite}>Cancel</NeoButton>}
          {step===0 && <NeoButton icon="bolt" disabled={!valid} onClick={()=>setStep(1)}>Validate & detect</NeoButton>}
          {step===2 && <NeoButton kind="soft" onClick={()=>setStep(0)}>Back</NeoButton>}
          {step===2 && <NeoButton icon="check" onClick={()=>ctx.finishAddSite(editing, { url:form.url, user:form.user, pw:form.pw, staging:form.staging, caps })}>{editing?"Reconnect":"Connect site"}</NeoButton>}
        </div>
      </div>
    </SoftModal>
  );
}

/* ---- Run-audit modal ---- */
function RunAuditModal({ ctx }) {
  const [scope,setScope] = useState("key");
  const [phase,setPhase] = useState(-1);
  const PHASES = ["Crawling & sampling pages","Running Lighthouse / PSI","Pulling Core Web Vitals field data","Scanning SEO & structured data","Checking accessibility (WCAG)","Prioritizing by traffic × gap"];
  const [prog,setProg] = useState(0);
  useEffect(()=>{ if(phase<0||phase>=99) return; const t=setTimeout(()=>{ phase<PHASES.length-1?setPhase(phase+1):setPhase(99); },650); return ()=>clearTimeout(t); },[phase]);
  useEffect(()=>{ if(phase<0){setProg(0);return;} if(phase>=99){setProg(100);return;} setProg(Math.round(((phase+1)/PHASES.length)*100)); },[phase]);
  const scopes=[{v:"single",t:"Single page",d:"Audit one URL — fastest"},{v:"key",t:"Key pages",d:"Home, top templates & money pages"},{v:"full",t:"Full-site (sampled)",d:"Crawl & sample up to 500 URLs"}];
  return (
    <SoftModal open onClose={phase<0||phase>=99?ctx.closeRunAudit:undefined} w={560}>
      <SoftModalHead icon="radar" title="Run read-only audit" sub={`${ctx.site.name} · ${ctx.site.url}`} onClose={phase<0||phase>=99?ctx.closeRunAudit:undefined} />
      <div className="scroll" style={{ padding:"20px 22px", maxHeight:"60vh" }}>
        {phase<0 && (
          <div className="rise" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Scope</div>
            {scopes.map(s=>(
              <button key={s.v} onClick={()=>setScope(s.v)} style={{ textAlign:"left", display:"flex", alignItems:"center", gap:13, padding:"13px 15px", borderRadius:"var(--r-md)", background:scope===s.v?"var(--t-50)":"var(--bg)", boxShadow:scope===s.v?"var(--neo-xs)":"var(--neo-in)" }}>
                <div style={{ width:20, height:20, borderRadius:99, border:"2px solid "+(scope===s.v?"var(--t-600)":"var(--faint)"), display:"grid", placeItems:"center" }}>{scope===s.v && <div style={{ width:9, height:9, borderRadius:99, background:"var(--t-600)" }} />}</div>
                <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700 }}>{s.t}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{s.d}</div></div>
              </button>
            ))}
            <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)", marginTop:4 }}>
              <Icon name="eye" size={17} style={{ color:"var(--t-700)", flexShrink:0, marginTop:1 }} /><span style={{ fontSize:12.5, color:"var(--t-800)", lineHeight:1.5 }}>Audits are <b>read-only</b> — nothing is written to your site.</span>
            </div>
          </div>
        )}
        {phase>=0 && (
          <div className="rise" style={{ padding:"6px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>{phase>=99?"Audit complete":"Auditing…"}</span>
              <span style={{ fontSize:22, fontWeight:800, color:"var(--t-700)" }}>{prog}%</span>
            </div>
            <div style={{ height:10, borderRadius:99, background:"var(--bg)", boxShadow:"var(--neo-in)", overflow:"hidden" }}>
              <div style={{ width:prog+"%", height:"100%", borderRadius:99, background:"linear-gradient(90deg,var(--t-500),var(--t-700))", transition:"width .5s" }} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:11, marginTop:18 }}>
              {PHASES.map((p,i)=>{ const ok=phase>i||phase>=99, cur=phase===i; return (
                <div key={p} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:24, height:24, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0, background:ok?"var(--t-600)":"var(--bg)", color:ok?"#F3EFE4":"var(--faint)", boxShadow:ok?"none":"var(--neo-in)" }}>{ok?<Icon name="check" size={13} sw={2.6} />:cur?<Icon name="cog" size={13} className="audit-spin" />:<span style={{ width:4,height:4,borderRadius:99,background:"currentColor" }} />}</div>
                  <span style={{ fontSize:13.5, color:ok?"var(--ink)":cur?"var(--ink-2)":"var(--faint)", fontWeight:ok||cur?600:500 }}>{p}</span>
                </div>
              ); })}
            </div>
            {phase>=99 && (
              <div style={{ marginTop:18, padding:"14px 16px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:99, background:"var(--t-600)", color:"#F3EFE4", display:"grid", placeItems:"center" }}><Icon name="check" size={20} sw={2.4} /></div>
                <div><div style={{ fontSize:14, fontWeight:700 }}>8 findings · 6 fix proposals generated</div><div style={{ fontSize:12.5, color:"var(--muted)" }}>Prioritized by traffic × score gap.</div></div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"16px 22px", borderTop:"1px solid var(--line-soft)", background:"var(--canvas)" }}>
        {phase<0 && <><NeoButton kind="soft" onClick={ctx.closeRunAudit}>Cancel</NeoButton><NeoButton icon="radar" onClick={()=>setPhase(0)}>Start audit</NeoButton></>}
        {phase>=0 && phase<99 && <NeoButton kind="soft" onClick={ctx.closeRunAudit}>Run in background</NeoButton>}
        {phase>=99 && <><NeoButton kind="soft" onClick={ctx.closeRunAudit}>Close</NeoButton><NeoButton icon="list" onClick={()=>{ctx.closeRunAudit();ctx.goto("review");}}>Review proposals</NeoButton></>}
      </div>
    </SoftModal>
  );
}

/* ================= AUDITS ================= */
// Stable, content-derived finding key — MUST match backend audit-pipeline.js
// findingKey() so resolutions (verified/approved/dismissed proposals) cross off
// the matching finding across re-audits. f.key is set by newer audits; older
// saved findings fall back to the same formula.
function seoFindingKey(f){
  if(f && f.key) return f.key;
  const slug=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
  const what=(f&&(f._auditId||f._field||f.field))||slug(f&&f.title)||"misc";
  return what+"::"+((f&&f.page)||"/");
}
const RESOLVED_STATUSES = { verified:1, approved:1, applied:1, dismissed:1 };

function FindingRow({ f, ctx, open, onToggle }) {
  const dm = softDisc[f.disc], [imTone,imLabel]=impactTone[f.impact];
  const fk = seoFindingKey(f);
  // Only a genuinely-pending proposal counts as "in queue" — not a dismissed/reopened/
  // rejected ledger entry (those share the finding's key but aren't review items).
  const inQueue = ctx.proposals.find(p=>p.findingId===fk && !["dismissed","reopened","rejected"].includes(p.status));
  const ch = { "rest-write":["teal","REST write"], "theme/css":["gold","Theme / CSS"], manual:["gray","Manual"] }[f.channel];
  return (
    <div style={{ borderRadius:"var(--r-md)", overflow:"hidden", background:open?"var(--t-50)":"var(--bg)", boxShadow:open?"var(--neo-xs)":"var(--neo-in)", transition:"all .16s" }}>
      <div className="row-link" onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px" }}>
        <div style={{ width:38, height:38, borderRadius:11, background:TT[dm.tone][1], color:TT[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={18} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>{f.title}</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, fontSize:12, color:"var(--muted)" }}>
            <span style={{ fontFamily:"var(--mono)" }}>{f.page}</span>{f.traffic!=="—" && <><span>·</span><span>{f.traffic} traffic</span></>}
          </div>
        </div>
        <Chip tone={imTone} size="sm" dot>{imLabel} impact</Chip>
        <div style={{ textAlign:"right", minWidth:50 }}><div style={{ fontSize:16, fontWeight:800, color:"var(--t-700)" }}>+{f.gapPts}</div><div style={{ fontSize:10, color:"var(--faint)" }}>pts gap</div></div>
        <Icon name="chevD" size={18} style={{ color:"var(--faint)", transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </div>
      {open && (
        <div className="rise" style={{ padding:"0 16px 16px 68px" }}>
          <p style={{ margin:"0 0 12px", fontSize:13.5, color:"var(--ink-2)", lineHeight:1.55 }}>{f.detail}</p>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <Chip tone={ch[0]} size="sm" icon="upload">{ch[1]}</Chip>
            {inQueue ? <Chip tone="plum" size="sm" icon="list">In review queue</Chip> : <NeoButton kind="soft" size="sm" icon="sparkles" onClick={()=>ctx.proposeFix(f)}>Propose fix</NeoButton>}
            {inQueue && <NeoButton kind="ghost" size="sm" iconR="chevR" onClick={()=>ctx.goto("review")}>Open in queue</NeoButton>}
            <NeoButton kind="ghost" size="sm" icon="check" onClick={()=>ctx.dismissFinding(f)}>Mark done</NeoButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PatternCard({ icon, tone, value, title, sub }) {
  return (
    <SoftCard hover={false} pad={18} style={{ flexDirection:"row", gap:14, alignItems:"center" }}>
      <div style={{ width:46, height:46, borderRadius:14, background:TT[tone][1], color:TT[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={icon} size={22} /></div>
      <div><div style={{ fontSize:21, fontWeight:800, lineHeight:1 }}>{value}</div><div style={{ fontSize:13, fontWeight:700, marginTop:4 }}>{title}</div><div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{sub}</div></div>
    </SoftCard>
  );
}

function AuditsScreen({ ctx }) {
  const s = ctx.site;
  const [filter,setFilter] = useState("all");
  const [openId,setOpenId] = useState("f1");
  const [prio,setPrio] = useState(null);
  const [prioBusy,setPrioBusy] = useState(false);
  const [showResolved,setShowResolved] = useState(false);
  const API = window.SentinelAPI;
  const loadPrio = ()=>{
    setPrioBusy(true);
    const findings=(ctx.findings||[]);
    API.prioritizeFindings(s.id, findings).then(r=>setPrio(r)).catch(e=>setPrio({error:e.message})).finally(()=>setPrioBusy(false));
  };
  useEffect(()=>{ setPrio(null); setShowResolved(false); },[s.id]);
  // Cross off findings whose fix has been ACTIONED (verified/approved/applied) or
  // manually dismissed — matched by stable key so it survives re-audits (#3).
  const resolvedKeys={};
  for(const p of (ctx.proposals||[])){ if(p&&p.findingId&&RESOLVED_STATUSES[p.status]) resolvedKeys[p.findingId]=p.status; }
  const tagged=(ctx.findings||[]).map(f=>({ ...f, _res:resolvedKeys[seoFindingKey(f)]||null }));
  const activeAll=tagged.filter(f=>!f._res);
  const resolvedAll=tagged.filter(f=>f._res);
  const filtered = activeAll.filter(f=>filter==="all"||f.disc===filter);
  const FILTERS=[{v:"all",l:"All"},{v:"seo",l:"SEO"},{v:"performance",l:"Perf"},{v:"accessibility",l:"A11y"},{v:"image",l:"Images"}];
  return (
    <div className="rise">
      <PageHead title="Audits & Reports" sub="Read-only audits with prioritized, in-app findings.">
        <div style={{ display:"flex", gap:10 }}>
          <NeoButton kind="soft" icon="doc" onClick={()=>ctx.exportReport()}>Export</NeoButton>
          <NeoButton kind="primary" icon="radar" onClick={ctx.openRunAudit}>Run audit</NeoButton>
        </div>
      </PageHead>

      <SoftCard hover={false} style={{ flexDirection:"row", flexWrap:"wrap", gap:24, alignItems:"center", marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, minWidth:240 }}>
          <Glyph color={s.favicon} char={s.glyph} size={46} r={14} />
          <div><div style={{ fontSize:17, fontWeight:700 }}>{s.name} — audit report</div>
            <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:7, marginTop:2 }}><Icon name="clock" size={13} />Last run {s.lastAudit} · {s.scale.sitemap} URLs in sitemap</div></div>
        </div>
        <div style={{ display:"flex", gap:16 }}>
          {[["Perf",s.scores.performance],["A11y",s.scores.accessibility],["Best Pr.",s.scores.bestPractices],["SEO",s.scores.seo]].map(([l,v])=>(
            <div key={l} className="htip" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <div className="htip-body">{l}: <b>{v}</b></div>
              <Ring value={v} size={56} sw={6} /><span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>{l}</span>
            </div>
          ))}
        </div>
      </SoftCard>

      {/* Road to 100 — per-category gap + what's blocking it (priority: 4×100) */}
      {(()=>{
        const sc=s.scores||{};
        const F=activeAll;   // gap reflects UNRESOLVED findings only
        const bucket={performance:[],accessibility:[],bestPractices:[],seo:[]};
        for(const f of F){ const d=(f.disc||"").toLowerCase(); if(d==="performance"||d==="image")bucket.performance.push(f); else if(d==="accessibility")bucket.accessibility.push(f); else if(d==="seo")bucket.seo.push(f); else bucket.bestPractices.push(f); }
        const cats=[["Performance","performance"],["Accessibility","accessibility"],["Best Practices","bestPractices"],["SEO","seo"]];
        const allDone=cats.every(([,k])=>(sc[k]||0)>=100);
        return (
        <SoftCard hover={false} style={{ marginBottom:18 }}>
          <SectionHead sub={allDone?"All four metrics at 100 — maintain & re-verify after each change":"Each metric's gap to 100 and the issues blocking it"}>Road to 100 {allDone&&<Chip tone="teal" size="sm" icon="check" style={{marginLeft:8}}>Perfect</Chip>}</SectionHead>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {cats.map(([label,k])=>{
              const v=sc[k]||0, gap=Math.max(0,100-v), issues=bucket[k].length;
              const tone=v>=100?"teal":v>=90?"gold":"clay";
              return (
                <div key={k} style={{ padding:"14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--muted)" }}>{label}</span>
                    <span style={{ fontSize:20, fontWeight:800, color:tealForScore(v) }}>{v}</span>
                  </div>
                  <div style={{ height:7, borderRadius:99, background:"var(--surface)", boxShadow:"var(--neo-in)", marginTop:8, overflow:"hidden" }}>
                    <div style={{ width:v+"%", height:"100%", borderRadius:99, background:TT[tone][0], transition:"width .5s" }} />
                  </div>
                  <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:8, display:"flex", justifyContent:"space-between" }}>
                    <span>{gap===0?"✓ at 100":"+"+gap+" to go"}</span>
                    <span>{issues} issue{issues===1?"":"s"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14, flexWrap:"wrap" }}>
            <NeoButton kind="soft" size="sm" icon="layers" onClick={()=>{ const el=document.getElementById("rice-worklist"); if(el)el.scrollIntoView({behavior:"smooth"}); }}>See ranked fixes ↓</NeoButton>
            <NeoButton kind="soft" size="sm" icon="bolt" onClick={()=>ctx.goto("optimize")}>Generate fixes (schema/CSS/links)</NeoButton>
            <NeoButton kind="primary" size="sm" icon="radar" onClick={ctx.openRunAudit}>Re-audit & verify</NeoButton>
          </div>
        </SoftCard>
        );
      })()}

      {/* Impact × Effort prioritization (RICE) */}
      <div id="rice-worklist" />
      <SoftCard hover={false} style={{ marginBottom:18 }}>
        <SectionHead sub="RICE worklist — (Reach × Impact × Confidence) ÷ Effort. Reach = real GSC clicks/page when connected." right={
          <NeoButton kind="soft" size="sm" icon={prioBusy?undefined:"layers"} disabled={prioBusy} onClick={loadPrio}>{prioBusy&&<Icon name="cog" size={15} className="audit-spin" />}{prioBusy?"Scoring…":prio?"Recompute":"Prioritize findings"}</NeoButton>
        }>Impact × Effort</SectionHead>
        {prio && prio.error && <div style={{ fontSize:13, color:"var(--muted)", padding:"6px 2px" }}>{prio.empty?"Run an audit first to generate findings to prioritize.":`⚠️ ${prio.error}`}</div>}
        {prio && !prio.error && (()=>{
          const QC={"Quick win":"var(--t-600)","Major project":"var(--gold)","Fill-in":"var(--plum)","Deprioritize":"var(--ink-2)"};
          const items=prio.ranked||[];
          const maxEff=Math.max(5,...items.map(i=>i.effort));
          const maxImp=Math.max(6,...items.map(i=>i.impact));
          const W=460,H=240,PL=44,PB=34,PT=12,PR=14;
          const px=(e)=>PL+(e/maxEff)*(W-PL-PR);
          const py=(i)=>H-PB-(i/maxImp)*(H-PT-PB);
          return (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {!prio.hasTraffic && <div style={{ fontSize:12, color:"var(--muted)" }}>Connect Google Search Console to weight by real per-page clicks — currently every page counts equally.</div>}
            <div style={{ overflowX:"auto" }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", maxWidth:560, height:"auto" }}>
                {/* quadrant guides */}
                <line x1={px(3)} y1={PT} x2={px(3)} y2={H-PB} stroke="var(--line)" strokeDasharray="4 4" />
                <line x1={PL} y1={py(4)} x2={W-PR} y2={py(4)} stroke="var(--line)" strokeDasharray="4 4" />
                <text x={PL+4} y={PT+12} fontSize="9" fill="var(--t-600)" fontWeight="700">QUICK WINS</text>
                <text x={W-PR-4} y={PT+12} fontSize="9" fill="var(--gold)" fontWeight="700" textAnchor="end">MAJOR PROJECTS</text>
                {/* axes labels */}
                <text x={(PL+W-PR)/2} y={H-6} fontSize="10" fill="var(--muted)" textAnchor="middle">Effort →</text>
                <text x={12} y={(PT+H-PB)/2} fontSize="10" fill="var(--muted)" textAnchor="middle" transform={`rotate(-90 12 ${(PT+H-PB)/2})`}>Impact →</text>
                {items.map((it,i)=>(
                  <circle key={i} cx={px(it.effort)} cy={py(it.impact)} r={3+(it.priority/100)*7} fill={QC[it.quadrant]||"var(--ink-2)"} opacity="0.72" stroke="#fff" strokeWidth="1">
                    <title>{it.title} — {it.quadrant} (priority {it.priority})</title>
                  </circle>
                ))}
              </svg>
            </div>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:11.5 }}>
              {Object.keys(QC).map(q=>(<span key={q} style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:10, borderRadius:99, background:QC[q] }} />{q} {prio.quadrants&&prio.quadrants[q]?`(${prio.quadrants[q]})`:""}</span>))}
            </div>
            <div>
              <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-2)", marginBottom:8 }}>Top of the worklist</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {items.slice(0,8).map((it,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5 }}>
                    <span style={{ width:30, height:24, display:"grid", placeItems:"center", borderRadius:7, background:"var(--surface)", boxShadow:"var(--neo-sm)", fontWeight:800, color:"var(--t-700)", fontSize:11.5 }}>{it.priority}</span>
                    <span style={{ flex:1, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{it.title}</span>
                    <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"var(--mono)" }}>{it.page}</span>
                    <Chip tone={it.quadrant==="Quick win"?"teal":it.quadrant==="Major project"?"gold":it.quadrant==="Fill-in"?"plum":"gray"} size="sm">{it.quadrant}</Chip>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize:11, color:"var(--faint)", lineHeight:1.5 }}>Reach = log-damped page clicks · Impact = category weight × severity · Confidence = fix reliability · Effort = engineering cost. Every term is shown so the ranking is auditable.</div>
          </div>
          );
        })()}
        {!prio && !prioBusy && <div style={{ fontSize:13, color:"var(--muted)", padding:"6px 2px" }}>Score every finding by expected value ÷ effort and plot it on an impact×effort map — so you fix the quick wins first, not whatever's at the top of the list.</div>}
      </SoftCard>

      <SoftCard hover={false}>
        <SectionHead sub="Ranked by impact = traffic × score gap"
          right={<div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)" }}>
            {FILTERS.map(f=><button key={f.v} onClick={()=>setFilter(f.v)} style={{ padding:"6px 12px", fontSize:12.5, fontWeight:700, borderRadius:99, background:filter===f.v?"var(--surface)":"transparent", color:filter===f.v?"var(--t-700)":"var(--muted)", boxShadow:filter===f.v?"var(--neo-sm)":"none" }}>{f.l}</button>)}
          </div>}>
          Prioritized Findings <span style={{ color:"var(--faint)", fontWeight:600 }}>· {filtered.length}</span>
        </SectionHead>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(f=><FindingRow key={f.id} f={f} ctx={ctx} open={openId===f.id} onToggle={()=>setOpenId(openId===f.id?null:f.id)} />)}
          {filtered.length===0 && <div style={{ padding:"14px 2px", fontSize:13, color:"var(--muted)" }}>{resolvedAll.length>0?"No open findings in this view — all actioned. 🎉":"No findings — run an audit to populate."}</div>}
        </div>

        {/* Resolved / crossed-off — actioned or dismissed, kept out of the worklist */}
        {resolvedAll.length>0 && (
          <div style={{ marginTop:16 }}>
            <button onClick={()=>setShowResolved(v=>!v)} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", border:"none", cursor:"pointer", color:"var(--ink)" }}>
              <Icon name="check" size={15} style={{ color:"var(--teal)" }} />
              <span style={{ fontSize:13, fontWeight:700 }}>Resolved · {resolvedAll.length}</span>
              <span style={{ fontSize:12, color:"var(--muted)" }}>actioned or dismissed — won't be re-suggested</span>
              <Icon name="chevD" size={16} style={{ marginLeft:"auto", color:"var(--faint)", transform:showResolved?"rotate(180deg)":"none", transition:"transform .2s" }} />
            </button>
            {showResolved && (
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
                {resolvedAll.map((f,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12.5, opacity:.7 }}>
                    <Icon name="check" size={14} style={{ color:"var(--teal)" }} />
                    <span style={{ flex:1, textDecoration:"line-through", textDecorationColor:"var(--faint)" }}>{f.title}</span>
                    <span style={{ fontFamily:"var(--mono)", color:"var(--muted)", fontSize:11 }}>{f.page}</span>
                    <Chip tone={f._res==="dismissed"?"gray":"teal"} size="sm">{f._res==="dismissed"?"dismissed":(f._res==="verified"?"fixed":f._res)}</Chip>
                    {f._res==="dismissed" && <NeoButton kind="ghost" size="sm" icon="undo" onClick={()=>ctx.reopenFinding(f)}>Reopen</NeoButton>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SoftCard>
    </div>
  );
}

Object.assign(window, { PageHead, SitesScreen, AddSiteModal, RunAuditModal, AuditsScreen, seoFindingKey });
