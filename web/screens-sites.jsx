/* ===========================================================
   Screen — Sites (multi-account) + Add / Detect flow
   =========================================================== */
const statusMeta = {
  connected:   { tone:"green", label:"Connected", icon:"check" },
  "auth-failed":{ tone:"red", label:"Auth failed", icon:"lock" },
  unreachable: { tone:"amber", label:"Unreachable", icon:"alert" },
};

function StackChip({ k, v, accent }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"9px 12px", background:"var(--card-2)", border:"1px solid var(--line)", borderRadius:"var(--r-md)" }}>
      <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", color:"var(--faint)" }}>{k}</span>
      <span style={{ fontSize:13, fontWeight:700, color:accent?"var(--g-700)":"var(--ink)" }}>{v}</span>
    </div>
  );
}

function SiteCard({ s, active, ctx }) {
  const sm = statusMeta[s.status];
  const isFail = s.status!=="connected";
  return (
    <Card pad={0} style={{ overflow:"hidden", border: active?"1.5px solid var(--g-500)":"1px solid var(--line)",
      boxShadow: active?"0 0 0 4px var(--g-100), var(--sh-md)":"var(--sh-sm)" }}>
      <div style={{ padding:"20px 22px", display:"flex", gap:16, alignItems:"flex-start" }}>
        <Glyph color={s.favicon} char={s.glyph} size={48} r={14} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:17, fontWeight:700 }}>{s.name}</span>
            {active && <Pill tone="green" size="sm" solid>Active</Pill>}
            <Pill tone={sm.tone} size="sm" icon={sm.icon}>{sm.label}</Pill>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4, fontSize:13, color:"var(--muted)" }}>
            <Icon name="globe" size={14} /><span style={{ fontFamily:"var(--mono)" }}>{s.url}</span>
          </div>
        </div>
        {s.status==="connected" && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Pill tone={s.writeArmed?"green":"gray"} dot>{s.writeArmed?"Write-armed":"Read-only"}</Pill>
          </div>
        )}
      </div>

      {isFail ? (
        <div style={{ margin:"0 22px 20px", padding:"14px 16px", background:"var(--red-bg)", border:"1px solid var(--red-line)", borderRadius:"var(--r-md)" }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <Icon name="alert" size={18} style={{ color:"var(--red)", flexShrink:0, marginTop:1 }} />
            <div>
              <div style={{ fontSize:13.5, fontWeight:700, color:"var(--red)" }}>401 Unauthorized — application password rejected</div>
              <div style={{ fontSize:12.5, color:"#8C3A2E", marginTop:3, lineHeight:1.5 }}>The site is reachable but the credential failed. Wordfence may be blocking REST auth — add the agent IP to the allowlist, then re-authenticate.</div>
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <Btn kind="ghost" size="sm" icon="link" onClick={()=>ctx.openAddSite(s)}>Re-authenticate</Btn>
                <Btn kind="quiet" size="sm" icon="shield" onClick={()=>ctx.toast("Allowlist guide opened","blue")}>Allowlist guide</Btn>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding:"0 22px 18px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            <StackChip k="WordPress" v={s.stack.wp} />
            <StackChip k="Theme" v={s.stack.theme} />
            <StackChip k="SEO Plugin" v={s.stack.seo} accent />
            <StackChip k="Cache" v={s.stack.cache} />
          </div>
          <div style={{ padding:"0 22px 18px", display:"flex", flexWrap:"wrap", gap:7 }}>
            <Pill tone="gray" size="sm" icon="image">{s.stack.image}</Pill>
            <Pill tone="gray" size="sm" icon="shield">{s.stack.security}</Pill>
            {s.stack.builder && <Pill tone="gray" size="sm" icon="layers">{s.stack.builder}</Pill>}
            {s.stack.other.map(o=><Pill key={o} tone="gray" size="sm">{o}</Pill>)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:18, padding:"14px 22px", borderTop:"1px solid var(--line)", background:"var(--card-2)", flexWrap:"wrap" }}>
            {[["Posts",s.scale.posts],["Pages",s.scale.pages],["Media",s.scale.media],["Sitemap URLs",s.scale.sitemap]].map(([l,v])=>(
              <div key={l} style={{ display:"flex", flexDirection:"column" }}>
                <span style={{ fontSize:15, fontWeight:800 }}>{v.toLocaleString()}</span>
                <span style={{ fontSize:11, color:"var(--muted)" }}>{l}</span>
              </div>
            ))}
            <div style={{ width:1, height:30, background:"var(--line)" }} />
            <div style={{ display:"flex", flexDirection:"column" }}>
              <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, fontWeight:700, color: s.selftest==="ready"?"var(--g-700)": s.selftest==="partial"?"var(--amber)":"var(--red)" }}>
                <Icon name={s.muPlugin?"check":"x"} size={13} sw={2.4} />mu-plugin {s.selftest}
              </span>
              <span style={{ fontSize:11, color:"var(--muted)" }}>Role: {s.role}</span>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              {!active && <Btn kind="ghost" size="sm" onClick={()=>ctx.switchSite(s.id)}>Set active</Btn>}
              {active && <Btn kind="soft" size="sm" icon="radar" onClick={()=>ctx.openRunAudit()}>Run audit</Btn>}
              <button className="sn-iconbtn" style={{ width:34, height:34, borderRadius:9, display:"grid", placeItems:"center", border:"1px solid var(--line)", color:"var(--muted)" }} onClick={()=>ctx.toast("Edit account","gray")}><Icon name="cog" size={16} /></button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Add Site / Re-auth flow ---------- */
function AddSiteModal({ ctx }) {
  const editing = ctx.addSiteFor;             // existing site being re-authed, or null
  const [step, setStep] = useState(0);        // 0 creds, 1 detect, 2 review
  const [form, setForm] = useState({
    url: editing?.url||"", user:"", pw:"", staging: editing?.staging||""
  });
  const [doneSteps, setDoneSteps] = useState([]);
  const [caps, setCaps] = useState({ lighthouse:true, seo:true, perf:true, image:true, geo:false, a11y:true });

  // run detection animation when entering step 1
  useEffect(()=>{
    if(step!==1) return;
    setDoneSteps([]);
    let i = 0;
    const tick = ()=>{
      i++; setDoneSteps(DETECT_STEPS.slice(0,i).map(s=>s.k));
      if(i<DETECT_STEPS.length) setTimeout(tick, 560);
      else setTimeout(()=>setStep(2), 650);
    };
    const t = setTimeout(tick, 500);
    return ()=>clearTimeout(t);
  },[step]);

  const valid = form.url && form.user && form.pw;
  const detected = { wp:"6.5.3", theme:"Twenty Twenty-Four", builder:"Gutenberg", seo:"Rank Math", cache:"WP Rocket", image:"ShortPixel", security:"Wordfence" };

  return (
    <Modal open onClose={ctx.closeAddSite} w={580}>
      <ModalHead icon={editing?"link":"plus"} tone="green"
        title={editing? "Re-authenticate "+editing.name : "Connect a WordPress site"}
        sub={["Enter credentials","Detecting environment","Confirm & enable"][step]}
        onClose={ctx.closeAddSite} />

      {/* step indicator */}
      <div style={{ display:"flex", gap:6, padding:"14px 22px 0" }}>
        {["Credentials","Detection","Capabilities"].map((l,i)=>(
          <div key={l} style={{ flex:1 }}>
            <div style={{ height:4, borderRadius:99, background: i<=step?"var(--g-500)":"var(--line)", transition:"background .3s" }} />
            <div style={{ fontSize:11, fontWeight:600, marginTop:6, color: i<=step?"var(--g-700)":"var(--faint)" }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="scroll" style={{ padding:"18px 22px", maxHeight:"56vh" }}>
        {step===0 && (
          <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Field label="Site URL" hint="The WordPress home URL">
              <input className="sn-input" placeholder="https://example.com" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} />
            </Field>
            <Field label="Username / User ID">
              <input className="sn-input" placeholder="seo-agent" value={form.user} onChange={e=>setForm({...form,user:e.target.value})} />
            </Field>
            <Field label="Application Password" hint="Stored encrypted at rest · never shown again">
              <div style={{ position:"relative" }}>
                <input className="sn-input" type="password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={form.pw} onChange={e=>setForm({...form,pw:e.target.value})} style={{ paddingRight:38 }} />
                <Icon name="lock" size={15} style={{ position:"absolute", right:13, top:13, color:"var(--faint)" }} />
              </div>
            </Field>
            <Field label="Staging URL" hint="Optional — writes target staging first">
              <input className="sn-input" placeholder="https://staging.example.com" value={form.staging} onChange={e=>setForm({...form,staging:e.target.value})} />
            </Field>
            <div style={{ display:"flex", gap:10, padding:"12px 14px", background:"var(--g-50)", border:"1px solid var(--g-200)", borderRadius:"var(--r-md)" }}>
              <Icon name="shield" size={17} style={{ color:"var(--g-700)", flexShrink:0, marginTop:1 }} />
              <span style={{ fontSize:12.5, color:"var(--g-800)", lineHeight:1.5 }}>Use a dedicated application password with least-privilege. The secret is encrypted, never logged, and revocable here at any time.</span>
            </div>
          </div>
        )}

        {step===1 && (
          <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:12, padding:"6px 0" }}>
            {DETECT_STEPS.map(d=>{
              const done = doneSteps.includes(d.k);
              const current = !done && doneSteps.length===DETECT_STEPS.indexOf(d);
              return (
                <div key={d.k} style={{ display:"flex", alignItems:"center", gap:13 }}>
                  <div style={{ width:26, height:26, borderRadius:99, display:"grid", placeItems:"center", flexShrink:0,
                    background: done?"var(--g-600)":"var(--bg-soft)", color: done?"#fff":"var(--faint)",
                    border: done?"none":"1px solid var(--line)", transition:"all .3s" }}>
                    {done ? <Icon name="check" size={14} sw={2.6} /> : current ? <Icon name="cog" size={14} className="spin" /> : <span style={{ width:5, height:5, borderRadius:99, background:"currentColor" }} />}
                  </div>
                  <span style={{ fontSize:13.5, fontWeight: done?600:500, color: done?"var(--ink)": current?"var(--ink-2)":"var(--faint)" }}>{d.label}</span>
                  {current && <Pill tone="green" size="sm" style={{ marginLeft:"auto" }}>running…</Pill>}
                </div>
              );
            })}
          </div>
        )}

        {step===2 && (
          <div className="fade-up">
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:14 }}>
              <Icon name="check" size={18} style={{ color:"var(--g-600)" }} />
              <span style={{ fontSize:14, fontWeight:700 }}>Stack detected — confirm or correct below</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:9, marginBottom:18 }}>
              <StackChip k="WordPress" v={detected.wp} />
              <StackChip k="Theme" v={detected.theme} />
              <StackChip k="Builder" v={detected.builder} />
              <StackChip k="SEO" v={detected.seo} accent />
              <StackChip k="Cache" v={detected.cache} />
              <StackChip k="Image" v={detected.image} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Capabilities</div>
            <div style={{ fontSize:12.5, color:"var(--muted)", marginBottom:12 }}>Pre-selected from detection — <strong style={{color:"var(--g-700)"}}>Rank Math found</strong>, so SEO write-path is on. Override anything.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {CAP_DEFS.map(c=>(
                <div key={c.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 13px", border:"1px solid var(--line)", borderRadius:"var(--r-md)", background: caps[c.key]?"var(--g-50)":"var(--card)" }}>
                  <div style={{ width:32, height:32, borderRadius:8, background: caps[c.key]?"var(--g-100)":"var(--bg-soft)", color: caps[c.key]?"var(--g-700)":"var(--faint)", display:"grid", placeItems:"center" }}><Icon name={c.icon} size={16} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>{c.label}</div>
                    <div style={{ fontSize:11.5, color:"var(--muted)" }}>{c.desc}</div>
                  </div>
                  <Toggle on={caps[c.key]} onChange={v=>setCaps({...caps,[c.key]:v})} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"16px 22px", borderTop:"1px solid var(--line)", background:"var(--card-2)" }}>
        <span style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><Icon name="lock" size={13} />Encrypted at rest</span>
        <div style={{ display:"flex", gap:10 }}>
          {step===0 && <Btn kind="ghost" onClick={ctx.closeAddSite}>Cancel</Btn>}
          {step===0 && <Btn icon="bolt" disabled={!valid} onClick={()=>setStep(1)}>Validate & detect</Btn>}
          {step===2 && <Btn kind="ghost" onClick={()=>setStep(0)}>Back</Btn>}
          {step===2 && <Btn icon="check" onClick={()=>{ ctx.finishAddSite(editing); }}>{editing?"Reconnect":"Connect site"}</Btn>}
        </div>
      </div>
    </Modal>
  );
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

function SitesScreen({ ctx }) {
  return (
    <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:10 }}>
        <Pill tone="green" icon="check">{ctx.sites.filter(s=>s.status==="connected").length} connected</Pill>
        <Pill tone="red" icon="lock">{ctx.sites.filter(s=>s.status==="auth-failed").length} needs attention</Pill>
        <Pill tone="gray" icon="globe">scoped to {ctx.site.name}</Pill>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {ctx.sites.map(s=><SiteCard key={s.id} s={s} active={s.id===ctx.site.id} ctx={ctx} />)}
      </div>
    </div>
  );
}

Object.assign(window, { SitesScreen, AddSiteModal });
