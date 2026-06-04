/* ===========================================================
   Screen — Review Queue (approval gate + apply + verify)
   =========================================================== */
const propStatus = {
  proposed:   { tone:"gray",  label:"Proposed",   icon:"flag" },
  approved:   { tone:"blue",  label:"Approved",    icon:"thumb" },
  applied:    { tone:"amber", label:"Applying",    icon:"upload" },
  verified:   { tone:"green", label:"Verified",    icon:"check" },
  "rolled-back":{ tone:"amber",label:"Rolled back", icon:"undo" },
  failed:     { tone:"red",   label:"Failed",      icon:"alert" },
};

function ProposalCard({ p, ctx, expanded, onToggle }) {
  const dm = discMeta[p.disc];
  const st = propStatus[p.status];
  const isProd = p.target==="production";
  const canAct = p.status==="proposed";
  return (
    <div style={{ border:"1px solid "+(expanded?"var(--g-200)":"var(--line)"), borderRadius:"var(--r-lg)", overflow:"hidden", background:"var(--card)", boxShadow: expanded?"var(--sh-md)":"none", transition:"all .18s" }}>
      <div className="sn-row" onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 18px", cursor:"pointer" }}>
        <div style={{ width:38, height:38, borderRadius:10, background:TONES[dm.tone][1], color:TONES[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={18} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:14.5, fontWeight:700 }}>{p.title}</span>
            <Pill tone={st.tone} size="sm" icon={st.icon} solid={p.status==="verified"}>{st.label}</Pill>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, fontSize:12, color:"var(--muted)" }}>
            <span style={{ fontFamily:"var(--mono)" }}>{p.page}</span><span>·</span>
            <span style={{ fontWeight:700, color:"var(--g-700)" }}>{p.impact}</span>
          </div>
        </div>
        <RiskPill risk={p.risk} />
        <Pill tone={isProd?"amber":"gray"} size="sm" icon={isProd?"alert":"layers"}>{isProd?"Production":"Staging"}</Pill>
        <Icon name="chevD" size={18} style={{ color:"var(--faint)", transform:expanded?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </div>
      {expanded && (
        <div className="fade-up" style={{ padding:"4px 18px 18px" }}>
          <Diff field={p.field+"  ·  "+({"rest-write":"REST write","theme/css":"theme / CSS edit",manual:"manual step"}[p.channel])} before={p.before} after={p.after} />
          {isProd && (
            <div style={{ display:"flex", gap:9, marginTop:12, padding:"10px 13px", background:"var(--amber-bg)", border:"1px solid var(--amber-line)", borderRadius:"var(--r-md)" }}>
              <Icon name="alert" size={16} style={{ color:"var(--amber)", flexShrink:0, marginTop:1 }} />
              <span style={{ fontSize:12.5, color:"#8A5310", lineHeight:1.5 }}>This target has no staging — change applies to <strong>production</strong>. Verify-after-write + one-click rollback still apply.</span>
            </div>
          )}
          {canAct && (
            <div style={{ display:"flex", gap:9, marginTop:14 }}>
              <Btn kind="primary" size="sm" icon="thumb" onClick={()=>ctx.approveProposal(p.id)}>Approve</Btn>
              <Btn kind="ghost" size="sm" icon="edit" onClick={()=>ctx.toast("Inline editor opened — tweak before approving","blue")}>Edit</Btn>
              <Btn kind="quiet" size="sm" icon="x" onClick={()=>ctx.rejectProposal(p.id)} style={{ color:"var(--red)" }}>Reject</Btn>
            </div>
          )}
          {p.status==="approved" && <div style={{ marginTop:12, fontSize:12.5, color:"var(--blue)", display:"flex", alignItems:"center", gap:6 }}><Icon name="check" size={14} />Approved — queued for the next apply batch.</div>}
          {p.status==="verified" && <div style={{ marginTop:12, fontSize:12.5, color:"var(--g-700)", display:"flex", alignItems:"center", gap:6 }}><Icon name="check" size={14} sw={2.4} />Applied & read-back confirmed · cache purged · <button onClick={()=>ctx.rollback(p.id)} style={{ color:"var(--amber)", fontWeight:700, textDecoration:"underline" }}>roll back</button></div>}
        </div>
      )}
    </div>
  );
}

function ApplyModal({ ctx }) {
  const approved = ctx.proposals.filter(p=>p.status==="approved");
  const [phase, setPhase] = useState(-1); // -1 confirm, 0..n, 99 done
  const STEPS = ["Snapshotting current values (rollback point)","Applying via REST / theme channel","Reading back every write to confirm","Purging caching-plugin cache","Re-scoring affected pages"];
  const prodCount = approved.filter(p=>p.target==="production").length;

  useEffect(()=>{
    if(phase<0||phase>=99) return;
    const t=setTimeout(()=>{ phase<STEPS.length-1?setPhase(phase+1):setPhase(99); }, 720);
    return ()=>clearTimeout(t);
  },[phase]);

  return (
    <Modal open onClose={phase<0||phase>=99?ctx.closeApply:undefined} w={560}>
      <ModalHead icon={phase>=99?"check":"upload"} tone={phase>=99?"green":"green"}
        title={phase>=99?"Changes applied & verified":"Apply approved changes"}
        sub={`${approved.length} change${approved.length!==1?"s":""} · ${ctx.site.name}`}
        onClose={phase<0||phase>=99?ctx.closeApply:undefined} />
      <div className="scroll" style={{ padding:"20px 22px", maxHeight:"60vh" }}>
        {phase<0 && (
          <div className="fade-up">
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {approved.map(p=>(
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", border:"1px solid var(--line)", borderRadius:"var(--r-md)" }}>
                  <Icon name="check" size={15} style={{ color:"var(--g-600)" }} />
                  <span style={{ fontSize:13.5, fontWeight:600, flex:1 }}>{p.title}</span>
                  <Pill tone={p.target==="production"?"amber":"gray"} size="sm">{p.target}</Pill>
                </div>
              ))}
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:9 }}>Safety guarantees</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[["layers","Staging-first where available"],["eye","Verify-after-write read-back"],["undo","One-click rollback per change"],["bolt","Cache purge + rate-limited"]].map(([ic,t])=>(
                <div key={t} style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px", background:"var(--g-50)", borderRadius:"var(--r-md)" }}>
                  <Icon name={ic} size={16} style={{ color:"var(--g-700)" }} /><span style={{ fontSize:12.5, fontWeight:600, color:"var(--g-800)" }}>{t}</span>
                </div>
              ))}
            </div>
            {prodCount>0 && (
              <div style={{ display:"flex", gap:10, padding:"13px 15px", background:"var(--amber-bg)", border:"1px solid var(--amber-line)", borderRadius:"var(--r-md)" }}>
                <Icon name="alert" size={18} style={{ color:"var(--amber)", flexShrink:0, marginTop:1 }} />
                <span style={{ fontSize:13, color:"#8A5310", lineHeight:1.5 }}><strong>{prodCount} change{prodCount>1?"s":""} target production.</strong> No content/legal edits are included (YMYL guardrail). Proceed?</span>
              </div>
            )}
          </div>
        )}
        {phase>=0 && (
          <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:11, padding:"6px 0" }}>
            {STEPS.map((stp,i)=>{
              const done=phase>i||phase>=99, cur=phase===i;
              return (
                <div key={stp} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:24, height:24, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0, background: done?"var(--g-600)":"var(--bg-soft)", color: done?"#fff":"var(--faint)", border: done?"none":"1px solid var(--line)" }}>
                    {done?<Icon name="check" size={13} sw={2.6} />:cur?<Icon name="cog" size={13} className="spin" />:<span style={{ width:4,height:4,borderRadius:99,background:"currentColor" }} />}
                  </div>
                  <span style={{ fontSize:13.5, color: done?"var(--ink)":cur?"var(--ink-2)":"var(--faint)", fontWeight: done||cur?600:500 }}>{stp}</span>
                </div>
              );
            })}
            {phase>=99 && (
              <div className="pop" style={{ marginTop:8, padding:"14px 16px", background:"var(--g-50)", border:"1px solid var(--g-200)", borderRadius:"var(--r-md)", display:"flex", gap:12, alignItems:"center" }}>
                <div style={{ width:38, height:38, borderRadius:99, background:"var(--g-600)", color:"#fff", display:"grid", placeItems:"center" }}><Icon name="check" size={20} sw={2.4} /></div>
                <div><div style={{ fontSize:14, fontWeight:700 }}>All writes verified ✓</div><div style={{ fontSize:12.5, color:"var(--muted)" }}>Read-back matched · before/after logged · rollback armed.</div></div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"16px 22px", borderTop:"1px solid var(--line)", background:"var(--card-2)" }}>
        {phase<0 && <><Btn kind="ghost" onClick={ctx.closeApply}>Cancel</Btn><Btn icon="upload" onClick={()=>setPhase(0)}>Apply {approved.length} change{approved.length!==1?"s":""}</Btn></>}
        {phase>=99 && <><Btn kind="ghost" onClick={()=>{ctx.commitApplied(); ctx.goto("activity");}}>View in log</Btn><Btn icon="check" onClick={ctx.commitApplied}>Done</Btn></>}
      </div>
    </Modal>
  );
}

function ReviewScreen({ ctx }) {
  const [openId, setOpenId] = useState("p1");
  const proposed = ctx.proposals.filter(p=>p.status==="proposed");
  const approved = ctx.proposals.filter(p=>p.status==="approved");
  const lowRiskProposed = proposed.filter(p=>p.risk==="low");
  const writeBlocked = ctx.killSwitch || !ctx.site.writeArmed;

  // group by discipline
  const groups = {};
  ctx.proposals.forEach(p=>{ (groups[p.disc]=groups[p.disc]||[]).push(p); });

  return (
    <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {/* action bar */}
      <Card pad={18} style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:20, flex:1, minWidth:200 }}>
          {[["Proposed",proposed.length,"gray"],["Approved",approved.length,"blue"],["Verified",ctx.proposals.filter(p=>p.status==="verified").length,"green"]].map(([l,v,t])=>(
            <div key={l}>
              <div style={{ fontSize:24, fontWeight:800, color:TONES[t][0] }}>{v}</div>
              <div style={{ fontSize:12, color:"var(--muted)", fontWeight:600 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {lowRiskProposed.length>0 && <Btn kind="soft" icon="thumb" onClick={()=>ctx.bulkApprove()}>Bulk-approve {lowRiskProposed.length} low-risk</Btn>}
          <Btn icon="upload" disabled={approved.length===0||writeBlocked} onClick={ctx.openApply}
            title={writeBlocked?"Writes disabled — arm write mode / release kill switch":undefined}>
            Apply {approved.length>0?`(${approved.length})`:""}
          </Btn>
        </div>
      </Card>

      {writeBlocked && (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 18px", background:"var(--red-bg)", border:"1px solid var(--red-line)", borderRadius:"var(--r-lg)" }}>
          <Icon name="lock" size={18} style={{ color:"var(--red)" }} />
          <span style={{ fontSize:13.5, color:"#8C3A2E", fontWeight:600 }}>
            {ctx.killSwitch ? "Global kill switch is ON — all writes disabled. Release it from the top bar to apply." : `${ctx.site.name} is in read-only mode. Arm write mode on the Sites screen to apply changes.`}
          </span>
        </div>
      )}

      {/* grouped queue */}
      {Object.entries(groups).map(([disc,items])=>{
        const dm = discMeta[disc];
        return (
          <div key={disc}>
            <div style={{ display:"flex", alignItems:"center", gap:9, margin:"2px 2px 12px" }}>
              <div style={{ width:26, height:26, borderRadius:8, background:TONES[dm.tone][1], color:TONES[dm.tone][0], display:"grid", placeItems:"center" }}><Icon name={dm.icon} size={15} sw={2} /></div>
              <span style={{ fontSize:14, fontWeight:700 }}>{dm.label}</span>
              <span style={{ fontSize:13, color:"var(--faint)", fontWeight:600 }}>· {items.length}</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
              {items.map(p=><ProposalCard key={p.id} p={p} ctx={ctx} expanded={openId===p.id} onToggle={()=>setOpenId(openId===p.id?null:p.id)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ReviewScreen, ApplyModal, propStatus });
