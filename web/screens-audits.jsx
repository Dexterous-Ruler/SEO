/* ===========================================================
   Screen — Audits & Reports
   =========================================================== */
const impactMeta = { high:["red","High"], medium:["amber","Medium"], low:["green","Low"] };

function RunAuditModal({ ctx }) {
  const [scope, setScope] = useState("key");
  const [phase, setPhase] = useState(-1); // -1 config, 0..n running, 99 done
  const PHASES = ["Crawling & sampling pages","Running Lighthouse / PSI","Pulling Core Web Vitals field data","Scanning SEO & structured data","Checking accessibility (WCAG)","Prioritizing by traffic × gap"];
  const [prog, setProg] = useState(0);

  useEffect(()=>{
    if(phase<0 || phase>=99) return;
    const t = setTimeout(()=>{
      if(phase < PHASES.length-1) setPhase(phase+1);
      else setPhase(99);
    }, 700);
    return ()=>clearTimeout(t);
  },[phase]);

  useEffect(()=>{
    if(phase<0) { setProg(0); return; }
    if(phase>=99){ setProg(100); return; }
    setProg(Math.round(((phase+1)/PHASES.length)*100));
  },[phase]);

  const scopes = [
    { v:"single", t:"Single page", d:"Audit one URL — fastest" },
    { v:"key", t:"Key pages", d:"Home, top templates & money pages" },
    { v:"full", t:"Full-site (sampled)", d:"Crawl & sample up to 500 URLs" },
  ];

  return (
    <Modal open onClose={phase<0||phase>=99?ctx.closeRunAudit:undefined} w={560}>
      <ModalHead icon="radar" title="Run read-only audit" sub={`${ctx.site.name} · ${ctx.site.url}`} onClose={phase<0||phase>=99?ctx.closeRunAudit:undefined} />
      <div className="scroll" style={{ padding:"20px 22px", maxHeight:"60vh" }}>
        {phase<0 && (
          <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Scope</div>
            {scopes.map(s=>(
              <button key={s.v} onClick={()=>setScope(s.v)} style={{ textAlign:"left", display:"flex", alignItems:"center", gap:13, padding:"13px 15px", borderRadius:"var(--r-md)", border:"1.5px solid "+(scope===s.v?"var(--g-500)":"var(--line)"), background: scope===s.v?"var(--g-50)":"var(--card)", transition:"all .15s" }}>
                <div style={{ width:20, height:20, borderRadius:99, border:"2px solid "+(scope===s.v?"var(--g-600)":"var(--faint)"), display:"grid", placeItems:"center" }}>
                  {scope===s.v && <div style={{ width:9, height:9, borderRadius:99, background:"var(--g-600)" }} />}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{s.t}</div>
                  <div style={{ fontSize:12, color:"var(--muted)" }}>{s.d}</div>
                </div>
              </button>
            ))}
            <div style={{ display:"flex", gap:10, padding:"12px 14px", background:"var(--g-50)", border:"1px solid var(--g-200)", borderRadius:"var(--r-md)", marginTop:4 }}>
              <Icon name="eye" size={17} style={{ color:"var(--g-700)", flexShrink:0, marginTop:1 }} />
              <span style={{ fontSize:12.5, color:"var(--g-800)", lineHeight:1.5 }}>Audits are <strong>read-only</strong> — nothing is written to your site. Long runs continue in the background and notify you on completion.</span>
            </div>
          </div>
        )}
        {phase>=0 && (
          <div className="fade-up" style={{ padding:"6px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>{phase>=99?"Audit complete":"Auditing…"}</span>
              <span style={{ fontSize:22, fontWeight:800, color:"var(--g-700)" }}>{prog}%</span>
            </div>
            <Meter value={prog} h={9} />
            <div style={{ display:"flex", flexDirection:"column", gap:11, marginTop:18 }}>
              {PHASES.map((p,i)=>{
                const done = phase>i || phase>=99, cur = phase===i;
                return (
                  <div key={p} style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:24, height:24, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0, background: done?"var(--g-600)":"var(--bg-soft)", color: done?"#fff":"var(--faint)", border: done?"none":"1px solid var(--line)" }}>
                      {done?<Icon name="check" size={13} sw={2.6} />:cur?<Icon name="cog" size={13} className="spin" />:<span style={{ width:4,height:4,borderRadius:99,background:"currentColor" }} />}
                    </div>
                    <span style={{ fontSize:13.5, color: done?"var(--ink)":cur?"var(--ink-2)":"var(--faint)", fontWeight: done||cur?600:500 }}>{p}</span>
                  </div>
                );
              })}
            </div>
            {phase>=99 && (
              <div className="pop" style={{ marginTop:18, padding:"14px 16px", background:"var(--g-50)", border:"1px solid var(--g-200)", borderRadius:"var(--r-md)", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:99, background:"var(--g-600)", color:"#fff", display:"grid", placeItems:"center" }}><Icon name="check" size={20} sw={2.4} /></div>
                <div><div style={{ fontSize:14, fontWeight:700 }}>8 findings · 6 fix proposals generated</div>
                  <div style={{ fontSize:12.5, color:"var(--muted)" }}>Prioritized by traffic × score gap. History updated.</div></div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"16px 22px", borderTop:"1px solid var(--line)", background:"var(--card-2)" }}>
        {phase<0 && <><Btn kind="ghost" onClick={ctx.closeRunAudit}>Cancel</Btn><Btn icon="radar" onClick={()=>setPhase(0)}>Start audit</Btn></>}
        {phase>=0 && phase<99 && <Btn kind="ghost" onClick={ctx.closeRunAudit}>Run in background</Btn>}
        {phase>=99 && <><Btn kind="ghost" onClick={ctx.closeRunAudit}>Close</Btn><Btn icon="list" onClick={()=>{ctx.closeRunAudit(); ctx.goto("review");}}>Review proposals</Btn></>}
      </div>
    </Modal>
  );
}

function FindingRow({ f, ctx, open, onToggle }) {
  const dm = discMeta[f.disc];
  const [imTone, imLabel] = impactMeta[f.impact];
  const inQueue = ctx.proposals.find(p=>p.findingId===f.id);
  const chMeta = { "rest-write":["green","REST write"], "theme/css":["amber","Theme / CSS"], manual:["gray","Manual"] }[f.channel];
  return (
    <div style={{ border:"1px solid "+(open?"var(--g-200)":"var(--line)"), borderRadius:"var(--r-md)", overflow:"hidden", background: open?"var(--g-50)":"var(--card)", transition:"all .15s" }}>
      <div className="sn-row" onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", cursor:"pointer" }}>
        <div style={{ width:36, height:36, borderRadius:10, background:TONES[dm.tone][1], color:TONES[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={18} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>{f.title}</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, fontSize:12, color:"var(--muted)" }}>
            <span style={{ fontFamily:"var(--mono)" }}>{f.page}</span>
            {f.traffic!=="—" && <><span>·</span><span>{f.traffic} traffic</span></>}
          </div>
        </div>
        <Pill tone={imTone} size="sm" dot>{imLabel} impact</Pill>
        <div style={{ textAlign:"right", minWidth:54 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"var(--g-700)" }}>+{f.gapPts}</div>
          <div style={{ fontSize:10.5, color:"var(--faint)" }}>pts gap</div>
        </div>
        <Icon name="chevD" size={18} style={{ color:"var(--faint)", transform:open?"rotate(180deg)":"none", transition:"transform .2s" }} />
      </div>
      {open && (
        <div className="fade-up" style={{ padding:"0 16px 16px 66px" }}>
          <p style={{ margin:"0 0 12px", fontSize:13.5, color:"var(--ink-2)", lineHeight:1.55 }}>{f.detail}</p>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <Pill tone={chMeta[0]} size="sm" icon="upload">{chMeta[1]}</Pill>
            {inQueue ? <Pill tone="blue" size="sm" icon="list">In review queue</Pill>
              : <Btn kind="soft" size="sm" icon="sparkles" onClick={()=>ctx.toast("Fix proposal generated → review queue","green")}>Propose fix</Btn>}
            {inQueue && <Btn kind="quiet" size="sm" iconR="chevR" onClick={()=>ctx.goto("review")}>Open in queue</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

function PatternCard({ icon, tone, title, value, sub }) {
  return (
    <div style={{ display:"flex", gap:13, padding:16, border:"1px solid var(--line)", borderRadius:"var(--r-md)", background:"var(--card)" }}>
      <div style={{ width:40, height:40, borderRadius:11, background:TONES[tone][1], color:TONES[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={icon} size={20} /></div>
      <div>
        <div style={{ fontSize:21, fontWeight:800, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:13, fontWeight:700, marginTop:4 }}>{title}</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{sub}</div>
      </div>
    </div>
  );
}

function AuditsScreen({ ctx }) {
  const s = ctx.site;
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState("f1");
  const filtered = FINDINGS.filter(f=> filter==="all" || f.disc===filter);

  return (
    <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {/* report header */}
      <Card pad={22} style={{ display:"flex", flexWrap:"wrap", gap:24, alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, minWidth:240 }}>
          <Glyph color={s.favicon} char={s.glyph} size={46} r={13} />
          <div>
            <div style={{ fontSize:17, fontWeight:700 }}>{s.name} — audit report</div>
            <div style={{ fontSize:12.5, color:"var(--muted)", display:"flex", alignItems:"center", gap:7, marginTop:2 }}>
              <Icon name="clock" size={13} />Last run {s.lastAudit} · key pages · {s.scale.sitemap} URLs in sitemap
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:18 }}>
          {[["Performance",s.scores.performance],["Accessibility",s.scores.accessibility],["Best Pr.",s.scores.bestPractices],["SEO",s.scores.seo]].map(([l,v])=>(
            <div key={l} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <ScoreRing value={v} size={56} sw={6} />
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn kind="ghost" icon="doc" onClick={()=>ctx.toast("Report exported (PDF)","green")}>Export</Btn>
          <Btn icon="radar" onClick={ctx.openRunAudit}>Re-run audit</Btn>
        </div>
      </Card>

      {/* site-wide patterns */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        <PatternCard icon="layers" tone="amber" value="3 templates" title="Site-wide patterns" sub="Same issue repeats across page types" />
        <PatternCard icon="doc" tone="blue" value="4 pages" title="Duplicate content" sub="Overlapping titles & descriptions" />
        <PatternCard icon="sparkles" tone="green" value="62%" title="AI-visibility gap" sub="Missing schema for answer engines" />
      </div>

      {/* prioritized findings */}
      <Card pad={22}>
        <SectionTitle sub="Ranked by impact = traffic × score gap"
          right={<Segmented size="sm" value={filter} onChange={setFilter}
            options={[{v:"all",l:"All"},{v:"seo",l:"SEO"},{v:"performance",l:"Perf"},{v:"accessibility",l:"A11y"},{v:"image",l:"Images"}]} />}>
          Prioritized Findings <span style={{ color:"var(--faint)", fontWeight:600 }}>· {filtered.length}</span>
        </SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(f=><FindingRow key={f.id} f={f} ctx={ctx} open={openId===f.id} onToggle={()=>setOpenId(openId===f.id?null:f.id)} />)}
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { AuditsScreen, RunAuditModal });
