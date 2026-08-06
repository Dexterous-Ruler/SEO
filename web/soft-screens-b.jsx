/* ===========================================================
   Sentinel Soft-UI — Review Queue, Activity, Settings
   =========================================================== */
const softPropStatus = {
  proposed:{ tone:"gray", label:"Proposed", icon:"flag" },
  approved:{ tone:"plum", label:"Approved", icon:"thumb" },
  applied:{ tone:"gold", label:"Applying", icon:"upload" },
  verified:{ tone:"teal", label:"Verified", icon:"check" },
  "rolled-back":{ tone:"gold", label:"Rolled back", icon:"undo" },
  dismissed:{ tone:"gray", label:"Done", icon:"check" },
  reopened:{ tone:"gold", label:"Reopened", icon:"undo" },
  rejected:{ tone:"clay", label:"Rejected", icon:"flag" },
};

/* ================= REVIEW QUEUE ================= */
function ProposalCard({ p, ctx, open, onToggle }) {
  const dm = softDisc[p.disc] || softDisc.seo, st = softPropStatus[p.status] || softPropStatus.proposed;
  // A write hits production whenever the target is explicitly production OR the site has
  // no staging URL configured (true for every site today) — the old check keyed only on
  // p.target, which defaults to "staging", so it falsely showed a "Staging" chip and hid
  // the production warning even though the change went straight to the live site.
  const noStaging = !(ctx && ctx.site && ctx.site.staging);
  const isProd = p.target==="production" || noStaging, canAct = p.status==="proposed";
  return (
    <SoftCard hover={false} pad={0} style={{ overflow:"hidden", boxShadow:open?"var(--neo)":"var(--neo-sm)" }}>
      <div className="row-link" onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 18px" }}>
        <div style={{ width:38, height:38, borderRadius:11, background:TT[dm.tone][1], color:TT[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={18} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
            <span style={{ fontSize:14.5, fontWeight:700 }}>{p.title}</span>
            <Chip tone={st.tone} size="sm" icon={st.icon} solid={p.status==="verified"}>{st.label}</Chip>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, fontSize:12, color:"var(--muted)" }}>
            <span style={{ fontFamily:"var(--mono)" }}>{p.page}</span><span>·</span><span style={{ fontWeight:700, color:"var(--t-700)" }}>{p.impact}</span>
          </div>
        </div>
        <SoftRisk risk={p.risk} />
        <Chip tone={isProd?"gold":"gray"} size="sm" icon={isProd?"alert":"layers"}>{isProd?"Production":"Staging"}</Chip>
        <Icon name="chevD" size={18} style={{ color:"var(--faint)", transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </div>
      {open && (
        <div className="rise" style={{ padding:"4px 18px 18px" }}>
          <SoftDiff field={p.field+"  ·  "+({"rest-write":"REST write","theme/css":"theme / CSS edit",manual:"manual step"}[p.channel])} before={p.before} after={p.after} />
          {isProd && (
            <div style={{ display:"flex", gap:9, marginTop:12, padding:"10px 13px", background:"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}>
              <Icon name="alert" size={16} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} /><span style={{ fontSize:12.5, color:"#7E5A14", lineHeight:1.5 }}>This target has no staging — change applies to <b>production</b>. Verify-after-write + one-click rollback still apply.</span>
            </div>
          )}
          {canAct && (
            <div style={{ display:"flex", gap:9, marginTop:14 }}>
              <NeoButton kind="primary" size="sm" icon="thumb" onClick={()=>ctx.approveProposal(p.id)}>Approve</NeoButton>
              <NeoButton kind="soft" size="sm" icon="edit" onClick={()=>ctx.editProposal(p.id)}>Edit</NeoButton>
              <NeoButton kind="ghost" size="sm" icon="x" onClick={()=>ctx.rejectProposal(p.id)} style={{ color:"var(--clay)" }}>Reject</NeoButton>
            </div>
          )}
          {p.status==="approved" && <div style={{ marginTop:12, fontSize:12.5, color:"var(--plum)", display:"flex", alignItems:"center", gap:6 }}><Icon name="check" size={14} />Approved — queued for the next apply batch.</div>}
          {p.status==="verified" && <div style={{ marginTop:12, fontSize:12.5, color:"var(--t-700)", display:"flex", alignItems:"center", gap:6 }}><Icon name="check" size={14} sw={2.4} />Applied & read-back confirmed · <button onClick={()=>ctx.rollback(p.id)} style={{ color:"var(--gold)", fontWeight:700, textDecoration:"underline" }}>roll back</button></div>}
        </div>
      )}
    </SoftCard>
  );
}

function ApplyModal({ ctx }) {
  const approved = ctx.proposals.filter(p=>p.status==="approved");
  const [phase,setPhase] = useState(-1);
  const [result,setResult] = useState(null);
  const STEPS = ["Snapshotting current values (rollback point)","Applying via REST / theme channel","Reading back every write to confirm","Purging caching-plugin cache","Re-scoring affected pages"];
  const noStaging = !(ctx.site && ctx.site.staging);
  const prodCount = approved.filter(p=>p.target==="production"||noStaging).length;
  // Advance the step checklist while applying, but HOLD on the last step until the
  // REAL commitApplied resolves — completion (phase 99) is driven by the actual writes,
  // not a timer, so the "verified" card can never appear before anything was written.
  useEffect(()=>{ if(phase<0||phase>=99||phase>=STEPS.length-1) return; const t=setTimeout(()=>setPhase(phase+1),680); return ()=>clearTimeout(t); },[phase]);
  const startApply = ()=>{ setPhase(0); Promise.resolve(ctx.commitApplied()).then(r=>{ setResult(r||{}); setPhase(99); }).catch(()=>{ setResult({failed:approved.length,total:approved.length}); setPhase(99); }); };
  const R = result||{};
  const applyBits = [];
  if(R.applied) applyBits.push(R.applied+" applied & verified");
  if(R.blocked) applyBits.push(R.blocked+" blocked (read-only)");
  if(R.manual) applyBits.push(R.manual+" need manual action");
  if(R.skipped) applyBits.push(R.skipped+" skipped (not applicable)");
  if(R.failed) applyBits.push(R.failed+" failed");
  const applyTitle = R.killSwitch ? ("Simulated — "+(R.total||0)+" not written") : (applyBits.join(" · ")||"Nothing applied");
  const applySub = R.killSwitch ? "Kill switch is on — turn it off to apply for real." : (R.failed?"Some writes failed — check the review queue.":(R.skipped&&!R.applied?"Skipped items were archive/taxonomy pages that can't take page meta.":(R.applied?"Read-back verified · rollback armed.":"Nothing was written.")));
  const applyOk = !R.killSwitch && R.applied>0 && !R.failed;
  return (
    <SoftModal open onClose={phase<0||phase>=99?ctx.closeApply:undefined} w={560}>
      <SoftModalHead icon={phase>=99?(applyOk?"check":"info"):"upload"} title={phase>=99?applyTitle:"Apply approved changes"} sub={`${approved.length} change${approved.length!==1?"s":""} · ${ctx.site.name}`} onClose={phase<0||phase>=99?ctx.closeApply:undefined} />
      <div className="scroll" style={{ padding:"20px 22px", maxHeight:"60vh" }}>
        {phase<0 && (
          <div className="rise">
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {approved.map(p=>(
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 13px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <Icon name="check" size={15} style={{ color:"var(--t-600)" }} /><span style={{ fontSize:13.5, fontWeight:600, flex:1 }}>{p.title}</span><Chip tone={(p.target==="production"||noStaging)?"gold":"gray"} size="sm">{(p.target==="production"||noStaging)?"production":"staging"}</Chip>
                </div>
              ))}
              {approved.length===0 && <div style={{ fontSize:13.5, color:"var(--muted)", textAlign:"center", padding:"20px 0" }}>No approved changes to apply yet.</div>}
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:9 }}>Safety guarantees</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[[noStaging?"alert":"layers",noStaging?"Writes go to production":"Staging-first where available"],["eye","Verify-after-write read-back"],["undo","One-click rollback per change"],["bolt","Cache purge + rate-limited"]].map(([ic,t])=>(
                <div key={t} style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px", background:"var(--t-50)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}><Icon name={ic} size={16} style={{ color:"var(--t-700)" }} /><span style={{ fontSize:12.5, fontWeight:600, color:"var(--t-800)" }}>{t}</span></div>
              ))}
            </div>
            {prodCount>0 && <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)" }}><Icon name="alert" size={18} style={{ color:"var(--gold)", flexShrink:0, marginTop:1 }} /><span style={{ fontSize:13, color:"#7E5A14", lineHeight:1.5 }}><b>{prodCount} change{prodCount>1?"s":""} target production.</b> No content/legal edits are included (YMYL guardrail).</span></div>}
          </div>
        )}
        {phase>=0 && (
          <div className="rise" style={{ display:"flex", flexDirection:"column", gap:11, padding:"6px 0" }}>
            {STEPS.map((stp,i)=>{ const ok=phase>i||phase>=99, cur=phase===i; return (
              <div key={stp} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:24, height:24, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0, background:ok?"var(--t-600)":"var(--bg)", color:ok?"#F3EFE4":"var(--faint)", boxShadow:ok?"none":"var(--neo-in)" }}>{ok?<Icon name="check" size={13} sw={2.6} />:cur?<Icon name="cog" size={13} className="audit-spin" />:<span style={{ width:4,height:4,borderRadius:99,background:"currentColor" }} />}</div>
                <span style={{ fontSize:13.5, color:ok?"var(--ink)":cur?"var(--ink-2)":"var(--faint)", fontWeight:ok||cur?600:500 }}>{stp}</span>
              </div>
            ); })}
            {phase>=99 && <div style={{ marginTop:8, padding:"14px 16px", background:applyOk?"var(--t-50)":"var(--gold-bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-xs)", display:"flex", gap:12, alignItems:"center" }}><div style={{ width:38, height:38, borderRadius:99, background:applyOk?"var(--t-600)":"var(--gold)", color:"#F3EFE4", display:"grid", placeItems:"center" }}><Icon name={applyOk?"check":"info"} size={20} sw={2.4} /></div><div><div style={{ fontSize:14, fontWeight:700 }}>{applyTitle}</div><div style={{ fontSize:12.5, color:"var(--muted)" }}>{applySub}</div></div></div>}
          </div>
        )}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"16px 22px", borderTop:"1px solid var(--line-soft)", background:"var(--canvas)" }}>
        {phase<0 && <><NeoButton kind="soft" onClick={ctx.closeApply}>Cancel</NeoButton><NeoButton icon="upload" disabled={approved.length===0} onClick={startApply}>Apply {approved.length} change{approved.length!==1?"s":""}</NeoButton></>}
        {phase>=99 && <><NeoButton kind="soft" onClick={()=>{ctx.closeApply();ctx.goto("activity");}}>View in log</NeoButton><NeoButton icon="check" onClick={ctx.closeApply}>Done</NeoButton></>}
      </div>
    </SoftModal>
  );
}

// Outcome measurement: did the applied fixes move the needle? Loads on demand (a heavy
// GSC call). Shows before→after clicks / impressions / avg-position for the optimized pages.
function ImpactCard({ ctx }) {
  const [busy,setBusy] = useState(false);
  const [imp,setImp] = useState(null);
  const live = window.SentinelAPI && window.SENTINEL_LIVE;
  const run = ()=>{ if(!live){ ctx.toast("Connect a live site first","gold"); return; } setBusy(true); setImp(null); window.SentinelAPI.applyImpact(ctx.site.id).then(setImp).catch(e=>setImp({error:e.message})).finally(()=>setBusy(false)); };
  const Delta = ({v})=>{ const s=(v>0?"+":"")+v; return <span style={{ fontWeight:700, color: (v===0||v==null)?"var(--muted)":(v>0?"var(--t-600)":"var(--clay)") }}>{v==null?"—":s}</span>; };
  return (
    <SoftCard hover={false} style={{ marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:14, fontWeight:800 }}>Impact of applied changes</div>
          <div style={{ fontSize:12.5, color:"var(--muted)" }}>Google Search Console performance of your optimized pages — before the changes vs the last 28 days. No DataForSEO units.</div>
        </div>
        <NeoButton kind="soft" size="sm" icon={busy?undefined:"trend"} disabled={busy} onClick={run}>{busy&&<Icon name="cog" size={14} className="audit-spin" />}{busy?"Measuring…":"Measure impact"}</NeoButton>
      </div>
      {imp && (imp.error||imp.noChanges||imp.needsConnect) && <div style={{ marginTop:12, fontSize:13, color: imp.error?"var(--clay)":"var(--muted)" }}>{imp.error||imp.note}</div>}
      {imp && imp.summary && (
        <div style={{ marginTop:14 }}>
          {imp.note && <div style={{ fontSize:12, color:"var(--t-800)", background:"var(--gold-bg)", padding:"8px 11px", borderRadius:"var(--r-md)", marginBottom:12 }}>{imp.note}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
            {[["Clicks", imp.summary.clicks],["Impressions", imp.summary.impressions],["Avg position", imp.summary.avgPosition]].map(([label,m])=>(
              <div key={label} style={{ padding:"12px 14px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                <div style={{ fontSize:11, color:"var(--faint)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:14.5, fontWeight:800 }}>{m.before==null?"—":m.before} → {m.after==null?"—":m.after} <span style={{ fontSize:12.5, fontWeight:600 }}>(<Delta v={m.delta} />)</span></div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:8 }}>{imp.pagesMeasured} of {imp.pagesApplied} optimized pages had Google data · {imp.pagesImproved} improved · <span style={{ fontFamily:"var(--mono)", fontSize:11 }}>{imp.window.before} vs {imp.window.after}</span></div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflow:"auto" }}>
            {(imp.changes||[]).filter(c=>c.measurable).slice(0,25).map((c,i)=>(
              <div key={i} style={{ display:"flex", gap:12, alignItems:"center", padding:"8px 11px", borderRadius:"var(--r-md)", background:"var(--bg)", boxShadow:"var(--neo-in)", fontSize:12 }}>
                <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--mono)" }} title={c.page}>{c.page}</span>
                <span style={{ flexShrink:0, color:"var(--muted)" }}>clicks <Delta v={c.clicks.delta} /></span>
                <span style={{ flexShrink:0, color:"var(--muted)" }}>pos <Delta v={c.position.delta} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SoftCard>
  );
}

function ReviewScreen({ ctx }) {
  const [openId,setOpenId] = useState("p1");
  const proposed = ctx.proposals.filter(p=>p.status==="proposed");
  const approved = ctx.proposals.filter(p=>p.status==="approved");
  const verified = ctx.proposals.filter(p=>p.status==="verified");
  const lowRisk = proposed.filter(p=>p.risk==="low");
  const writeBlocked = ctx.killSwitch || !ctx.site.writeArmed;
  const groups = {}; ctx.proposals.forEach(p=>{ (groups[p.disc]=groups[p.disc]||[]).push(p); });
  return (
    <div className="rise">
      <PageHead title="Review Queue" sub="Approve, edit, or reject every proposed change." />
      <SoftCard hover={false} style={{ flexDirection:"row", alignItems:"center", gap:16, flexWrap:"wrap", marginBottom:18 }}>
        <div style={{ display:"flex", gap:24, flex:1, minWidth:200 }}>
          {[["Proposed",proposed.length,"gray"],["Approved",approved.length,"plum"],["Verified",verified.length,"teal"]].map(([l,v,t])=>(
            <div key={l}><div style={{ fontSize:24, fontWeight:800, color:TT[t][0] }}>{v}</div><div style={{ fontSize:12, color:"var(--muted)", fontWeight:600 }}>{l}</div></div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          {lowRisk.length>0 && <NeoButton kind="soft" icon="thumb" onClick={ctx.bulkApprove}>Bulk-approve {lowRisk.length} low-risk</NeoButton>}
          <NeoButton kind="primary" icon="upload" disabled={approved.length===0||writeBlocked} onClick={ctx.openApply} title={writeBlocked?"Writes disabled":undefined}>Apply{approved.length>0?` (${approved.length})`:""}</NeoButton>
        </div>
      </SoftCard>

      <ImpactCard ctx={ctx} />

      {writeBlocked && (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"var(--clay-bg)", borderRadius:"var(--r-lg)", boxShadow:"var(--neo-xs)", marginBottom:18 }}>
          <Icon name="lock" size={18} style={{ color:"var(--clay)" }} />
          <span style={{ fontSize:13.5, color:"#8A4231", fontWeight:600 }}>{ctx.killSwitch?"Global kill switch is ON — release it from the sidebar to apply.":`${ctx.site.name} is read-only. Arm write mode in Settings to apply changes.`}</span>
        </div>
      )}

      {Object.entries(groups).map(([disc,items])=>{
        const dm = softDisc[disc] || softDisc.seo;
        return (
          <div key={disc} style={{ marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, margin:"2px 2px 12px" }}>
              <div style={{ width:26, height:26, borderRadius:8, background:TT[dm.tone][1], color:TT[dm.tone][0], display:"grid", placeItems:"center" }}><Icon name={dm.icon} size={15} sw={2} /></div>
              <span style={{ fontSize:14, fontWeight:700 }}>{dm.label}</span><span style={{ fontSize:13, color:"var(--faint)", fontWeight:600 }}>· {items.length}</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {items.map(p=><ProposalCard key={p.id} p={p} ctx={ctx} open={openId===p.id} onToggle={()=>setOpenId(openId===p.id?null:p.id)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= ACTIVITY ================= */
function ActivityScreen({ ctx }) {
  const tone = { verified:"teal", approved:"teal", applied:"plum", "rolled-back":"gold", audit:"plum", connection:"gray", failed:"clay" };
  const [filter,setFilter] = useState("all");
  const [,setTick] = useState(0);
  // Refresh the live trail on mount so "View in log" (and this screen) reflect actions
  // the user JUST performed — window.ACTIVITY is only hydrated once at boot otherwise.
  useEffect(()=>{
    if(!window.SENTINEL_LIVE || !window.SentinelAPI) return;
    window.SentinelAPI.listActivity(null).then(a=>{ if(Array.isArray(a)){ window.ACTIVITY=a.map(window.mapActivityRow||(x=>x)); setTick(n=>n+1); } }).catch(()=>{});
  },[]);
  const TYPES=[{v:"all",l:"All"},{v:"writes",l:"Writes"},{v:"approved",l:"Approvals"},{v:"rolled-back",l:"Rollbacks"},{v:"failed",l:"Failures"}];
  // LIVE: only ever show the real hydrated trail (empty → honest empty state).
  // The demo ACTIVITY seed is for design-preview (non-live) mode only.
  const src = window.SENTINEL_LIVE ? (window.ACTIVITY||[]) : (window.ACTIVITY||ACTIVITY);
  const rows = src.filter(a=> filter==="all" || a.type===filter || (filter==="writes"&&(a.type==="applied"||a.type==="verified")));
  return (
    <div className="rise">
      <PageHead title="Activity" sub="A complete, exportable audit trail.">
        <NeoButton kind="soft" icon="doc" onClick={()=>ctx.exportTrail()}>Export trail</NeoButton>
      </PageHead>
      <div style={{ display:"flex", gap:3, padding:3, background:"var(--bg)", borderRadius:"var(--r-pill)", boxShadow:"var(--neo-in)", marginBottom:18, width:"fit-content" }}>
        {TYPES.map(f=><button key={f.v} onClick={()=>setFilter(f.v)} style={{ padding:"8px 16px", fontSize:13, fontWeight:700, borderRadius:99, background:filter===f.v?"var(--surface)":"transparent", color:filter===f.v?"var(--t-700)":"var(--muted)", boxShadow:filter===f.v?"var(--neo-sm)":"none" }}>{f.l}</button>)}
      </div>
      <SoftCard hover={false} pad={0}>
        {rows.map((a,i)=>{
          const t = tone[a.type]||"gray", site = (window.SITES||SITES).find(s=>s.id===a.site);
          const reversible = a.type==="verified"||a.type==="applied";
          return (
            <div key={a.id} className="row-link" style={{ display:"flex", gap:14, padding:"16px 20px", borderBottom:i===rows.length-1?"none":"1px solid var(--line-soft)", alignItems:"center" }}>
              <div style={{ width:40, height:40, borderRadius:12, background:TT[t][1], color:TT[t][0], display:"grid", placeItems:"center", flexShrink:0, boxShadow:"var(--neo-xs)" }}><Icon name={a.icon} size={18} /></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600 }}>{a.text}</div>
                <div style={{ fontSize:11.5, color:"var(--muted)", marginTop:2, fontFamily:"var(--mono)" }}>{a.meta}</div>
              </div>
              {site && <Chip tone="gray" size="sm"><Glyph color={site.favicon} char={site.glyph} size={15} r={5} light />{site.name}</Chip>}
              <div style={{ textAlign:"right", minWidth:88 }}><div style={{ fontSize:12.5, fontWeight:600 }}>{a.who}</div><div style={{ fontSize:11.5, color:"var(--muted)" }}>{a.t}</div></div>
              {reversible ? <NeoButton kind="soft" size="sm" icon="undo" onClick={()=>ctx.goto("review")}>Roll back</NeoButton> : <div style={{ width:108 }} />}
            </div>
          );
        })}
        {rows.length===0 && <div style={{ padding:"48px 20px", textAlign:"center", color:"var(--muted)" }}><div style={{ fontSize:14, fontWeight:600 }}>No activity yet</div><div style={{ fontSize:12.5, marginTop:4 }}>Audits, approvals, and applied changes will show up here as you use the platform.</div></div>}
      </SoftCard>
    </div>
  );
}

/* ================= SETTINGS ================= */
function SettingRow({ icon, tone="teal", title, desc, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 0", borderBottom:"1px solid var(--line-soft)" }}>
      <div style={{ width:38, height:38, borderRadius:12, background:TT[tone][1], color:TT[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={icon} size={18} /></div>
      <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700 }}>{title}</div><div style={{ fontSize:12.5, color:"var(--muted)", marginTop:2 }}>{desc}</div></div>
      {children}
    </div>
  );
}

function SettingsScreen({ ctx }) {
  const s = ctx.site;
  const [caps,setCaps] = useState(s.caps);
  useEffect(()=>{ setCaps(s.caps); },[s.id]);
  return (
    <div className="rise">
      <PageHead title="Settings" sub="Capabilities, safety switches, and credentials." />
      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:18, alignItems:"start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          <SoftCard hover={false}>
            <SectionHead sub={`Enabled agent capabilities for ${s.name}`}>Capabilities</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {CAP_DEFS.map(c=>(
                <div key={c.key} style={{ display:"flex", alignItems:"center", gap:13, padding:"12px 14px", borderRadius:"var(--r-md)", background:caps[c.key]?"var(--t-50)":"var(--bg)", boxShadow:caps[c.key]?"var(--neo-xs)":"var(--neo-in)" }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:caps[c.key]?"var(--t-100)":"var(--surface)", color:caps[c.key]?"var(--t-700)":"var(--faint)", display:"grid", placeItems:"center" }}><Icon name={c.icon} size={17} /></div>
                  <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700 }}>{c.label}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{c.desc}</div></div>
                  <Toggle on={!!caps[c.key]} onChange={v=>{ setCaps({...caps,[c.key]:v}); ctx.setCapability(c.key,v); ctx.toast((v?"Enabled ":"Disabled ")+c.label,"gray"); }} />
                </div>
              ))}
            </div>
          </SoftCard>
          <SoftCard hover={false}>
            <SectionHead sub="The agent must never change these (colors, fonts, phrases)">Brand constraints</SectionHead>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", borderRadius:99, background:"var(--bg)", boxShadow:"var(--neo-in)" }}><span style={{ width:16, height:16, borderRadius:5, background:s.favicon }} /><span style={{ fontSize:13, fontWeight:600, fontFamily:"var(--mono)" }}>{s.favicon}</span><Icon name="lock" size={13} style={{ color:"var(--faint)" }} /></div>
              {(s.brand_constraints||[]).map((bc,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", borderRadius:99, background:"var(--bg)", boxShadow:"var(--neo-in)" }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{bc}</span>
                  <button onClick={()=>ctx.removeBrandConstraint&&ctx.removeBrandConstraint(bc)} style={{ color:"var(--clay)" }}><Icon name="x" size={12} /></button>
                </div>
              ))}
              <button className="neo-btn" style={{ padding:"9px 13px", borderRadius:99, background:"var(--surface)", boxShadow:"var(--neo-sm)", fontSize:13, fontWeight:600, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }} onClick={()=>ctx.addBrandConstraint&&ctx.addBrandConstraint()}><Icon name="plus" size={14} />Add constraint</button>
            </div>
          </SoftCard>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          <SoftCard hover={false}>
            <SectionHead sub="Per-site write behaviour">Safety</SectionHead>
            <SettingRow icon="eye" title="DRY_RUN (kill switch)" desc="Simulate every write across all sites — approvals apply as dry-runs; nothing touches the live site.">
              <Toggle on={ctx.killSwitch} onChange={()=>ctx.toggleKill()} />
            </SettingRow>
            <SettingRow icon="layers" tone="plum" title="Staging-first" desc={s.staging?`Writes target ${s.staging}`:"No staging URL configured — writes go to production"}>
              <Toggle on={!!s.staging} disabled />
            </SettingRow>
            <div style={{ marginBottom:-15 }}>
              <SettingRow icon="power" tone="teal" title="Write mode" desc={s.writeArmed?"Armed — approved changes can apply":"Read-only — approvals only"}>
                <Toggle on={s.writeArmed} onChange={()=>ctx.toggleWriteArm()} />
              </SettingRow>
            </div>
          </SoftCard>
          <SoftCard hover={false}>
            <SectionHead sub="Encrypted · never shown in full">Credential</SectionHead>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)" }}>
              <Icon name="lock" size={18} style={{ color:"var(--t-700)" }} />
              <div style={{ flex:1 }}><div style={{ fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>•••• •••• •••• 7Q2f</div><div style={{ fontSize:12, color:"var(--muted)" }}>App password · role {s.role}</div></div>
              <NeoButton kind="soft" size="sm" icon="link" onClick={()=>ctx.openAddSite(s)}>Re-auth</NeoButton>
            </div>
            <button className="neo-btn" style={{ marginTop:10, width:"100%", padding:"10px", borderRadius:"var(--r-md)", color:"var(--clay)", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }} onClick={()=>ctx.removeSite()}><Icon name="x" size={15} />Revoke & remove account</button>
          </SoftCard>
          <SoftCard hover={false} style={{ background:ctx.killSwitch?"var(--clay-bg)":"var(--surface)" }}>
            <div style={{ display:"flex", gap:13, alignItems:"flex-start" }}>
              <div style={{ width:42, height:42, borderRadius:13, background:ctx.killSwitch?"var(--clay)":"var(--clay-bg)", color:ctx.killSwitch?"#F3EFE4":"var(--clay)", display:"grid", placeItems:"center", flexShrink:0, boxShadow:ctx.killSwitch?"none":"var(--neo-xs)" }}><Icon name="power" size={22} sw={2.2} /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700 }}>Global kill switch</div>
                <div style={{ fontSize:12.5, color:"var(--ink-2)", marginTop:3, lineHeight:1.5 }}>Instantly disables every write across all connected sites. Audits and approvals stay available.</div>
                <NeoButton kind={ctx.killSwitch?"soft":"dark"} size="sm" icon="power" style={{ marginTop:13 }} onClick={ctx.toggleKill}>{ctx.killSwitch?"Release kill switch":"Activate kill switch"}</NeoButton>
              </div>
            </div>
          </SoftCard>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ReviewScreen, ApplyModal, ActivityScreen, SettingsScreen });
