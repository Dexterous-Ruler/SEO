/* ===========================================================
   Screens — Activity log & Settings
   =========================================================== */
function ActivityScreen({ ctx }) {
  const aTone = { verified:"green", approved:"green", applied:"blue", "rolled-back":"amber", audit:"violet", connection:"gray", failed:"red" };
  const [filter, setFilter] = useState("all");
  const TYPES = [{v:"all",l:"All"},{v:"verified",l:"Writes"},{v:"approved",l:"Approvals"},{v:"rolled-back",l:"Rollbacks"},{v:"failed",l:"Failures"}];
  const rows = ACTIVITY.filter(a=> filter==="all" || a.type===filter || (filter==="verified"&&(a.type==="applied"||a.type==="verified")));

  return (
    <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <Segmented value={filter} onChange={setFilter} options={TYPES} />
        <Btn kind="ghost" icon="doc" onClick={()=>ctx.toast("Audit trail exported (CSV)","green")}>Export trail</Btn>
      </div>
      <Card pad={0}>
        {rows.map((a,i)=>{
          const tone = aTone[a.type]||"gray";
          const reversible = a.type==="verified"||a.type==="applied";
          const site = SITES.find(s=>s.id===a.site);
          return (
            <div key={a.id} className="sn-row" style={{ display:"flex", gap:14, padding:"16px 20px", borderBottom: i===rows.length-1?"none":"1px solid var(--line-2)", alignItems:"center" }}>
              <div style={{ width:38, height:38, borderRadius:11, background:TONES[tone][1], color:TONES[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={a.icon} size={18} /></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600 }}>{a.text}</div>
                <div style={{ fontSize:12, color:"var(--faint)", marginTop:2, fontFamily:"var(--mono)" }}>{a.meta}</div>
              </div>
              {site && <Pill tone="gray" size="sm"><Glyph color={site.favicon} char={site.glyph} size={15} r={5} sw="none" />{site.name}</Pill>}
              <div style={{ textAlign:"right", minWidth:90 }}>
                <div style={{ fontSize:12.5, fontWeight:600 }}>{a.who}</div>
                <div style={{ fontSize:11.5, color:"var(--muted)" }}>{a.t}</div>
              </div>
              {reversible
                ? <Btn kind="ghost" size="sm" icon="undo" onClick={()=>ctx.toast("Change rolled back — value restored","amber")}>Roll back</Btn>
                : <div style={{ width:104 }} />}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function SettingRow({ icon, tone="green", title, desc, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 0", borderBottom:"1px solid var(--line-2)" }}>
      <div style={{ width:38, height:38, borderRadius:11, background:TONES[tone][1], color:TONES[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={icon} size={18} /></div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:700 }}>{title}</div>
        <div style={{ fontSize:12.5, color:"var(--muted)", marginTop:2 }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}

function SettingsScreen({ ctx }) {
  const s = ctx.site;
  const [caps, setCaps] = useState(s.caps);
  const [staging, setStaging] = useState(!!s.staging);
  const [dryRun, setDryRun] = useState(!s.writeArmed);
  useEffect(()=>{ setCaps(s.caps); setStaging(!!s.staging); setDryRun(!s.writeArmed); },[s.id]);

  return (
    <div className="fade-up" style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:18, alignItems:"start" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        {/* capabilities */}
        <Card pad={22}>
          <SectionTitle sub={`Enabled agent capabilities for ${s.name}`}>Capabilities</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {CAP_DEFS.map(c=>(
              <div key={c.key} style={{ display:"flex", alignItems:"center", gap:13, padding:"12px 14px", border:"1px solid var(--line)", borderRadius:"var(--r-md)", background: caps[c.key]?"var(--g-50)":"var(--card)" }}>
                <div style={{ width:34, height:34, borderRadius:9, background: caps[c.key]?"var(--g-100)":"var(--bg-soft)", color: caps[c.key]?"var(--g-700)":"var(--faint)", display:"grid", placeItems:"center" }}><Icon name={c.icon} size={17} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{c.label}</div>
                  <div style={{ fontSize:12, color:"var(--muted)" }}>{c.desc}</div>
                </div>
                <Toggle on={!!caps[c.key]} onChange={v=>{ setCaps({...caps,[c.key]:v}); ctx.toast((v?"Enabled ":"Disabled ")+c.label,"gray"); }} />
              </div>
            ))}
          </div>
        </Card>

        {/* brand constraints */}
        <Card pad={22}>
          <SectionTitle sub="The agent must never change these">Brand constraints</SectionTitle>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", border:"1px solid var(--line)", borderRadius:99 }}>
              <span style={{ width:16, height:16, borderRadius:5, background:s.favicon }} /><span style={{ fontSize:13, fontWeight:600, fontFamily:"var(--mono)" }}>{s.favicon}</span><Icon name="lock" size={13} style={{ color:"var(--faint)" }} />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", border:"1px solid var(--line)", borderRadius:99 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Recoleta · Söhne</span><Icon name="lock" size={13} style={{ color:"var(--faint)" }} />
            </div>
            <button className="sn-iconbtn" style={{ padding:"9px 13px", border:"1px dashed var(--line)", borderRadius:99, fontSize:13, fontWeight:600, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }} onClick={()=>ctx.toast("Add a locked brand token","gray")}><Icon name="plus" size={14} />Add constraint</button>
          </div>
        </Card>
      </div>

      {/* right column: safety */}
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        <Card pad={22}>
          <SectionTitle sub="Per-site write behaviour">Safety</SectionTitle>
          <SettingRow icon="eye" title="DRY_RUN default" desc="Simulate writes; never touch the live site.">
            <Toggle on={dryRun} onChange={v=>{setDryRun(v); ctx.toast(v?"DRY_RUN on — writes simulated":"DRY_RUN off","amber");}} />
          </SettingRow>
          <SettingRow icon="layers" tone="blue" title="Staging-first" desc={s.staging?`Writes target ${s.staging}`:"No staging URL configured"}>
            <Toggle on={staging} onChange={setStaging} disabled={!s.staging} tone="blue" />
          </SettingRow>
          <SettingRow icon="power" tone="green" title="Write mode" desc={s.writeArmed?"Armed — approved changes can apply":"Read-only — approvals only"}>
            <Toggle on={s.writeArmed} onChange={()=>ctx.toggleWriteArm()} />
          </SettingRow>
          <div style={{ marginBottom:-15 }}>
            <SettingRow icon="image" tone="violet" title="Image tool" desc={s.stack?.image||"—"}>
              <Pill tone="violet" size="sm">{s.stack?.image||"none"}</Pill>
            </SettingRow>
          </div>
        </Card>

        {/* secrets */}
        <Card pad={22}>
          <SectionTitle sub="Encrypted · never shown in full">Credential</SectionTitle>
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", background:"var(--card-2)", border:"1px solid var(--line)", borderRadius:"var(--r-md)" }}>
            <Icon name="lock" size={18} style={{ color:"var(--g-700)" }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13.5, fontWeight:700, fontFamily:"var(--mono)" }}>•••• •••• •••• 7Q2f</div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>App password · role {s.role}</div>
            </div>
            <Btn kind="ghost" size="sm" icon="link" onClick={()=>ctx.openAddSite(s)}>Re-auth</Btn>
          </div>
          <Btn kind="quiet" size="sm" icon="x" full style={{ marginTop:10, color:"var(--red)", justifyContent:"center" }} onClick={()=>ctx.toast("Secret revoked & purged from store","red")}>Revoke & remove account</Btn>
        </Card>

        {/* kill switch */}
        <Card pad={22} tone={ctx.killSwitch?undefined:undefined} style={{ border:"1px solid "+(ctx.killSwitch?"var(--red-line)":"var(--line)"), background: ctx.killSwitch?"var(--red-bg)":"var(--card)" }}>
          <div style={{ display:"flex", gap:13, alignItems:"flex-start" }}>
            <div style={{ width:42, height:42, borderRadius:12, background: ctx.killSwitch?"var(--red)":"var(--red-bg)", color: ctx.killSwitch?"#fff":"var(--red)", display:"grid", placeItems:"center", flexShrink:0 }}><Icon name="power" size={22} sw={2.2} /></div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700 }}>Global kill switch</div>
              <div style={{ fontSize:12.5, color:"var(--ink-2)", marginTop:3, lineHeight:1.5 }}>Instantly disables every write across all connected sites. Audits and approvals stay available.</div>
              <Btn danger={!ctx.killSwitch} kind={ctx.killSwitch?"ghost":undefined} size="sm" icon="power" style={{ marginTop:13 }} onClick={ctx.toggleKill}>
                {ctx.killSwitch?"Release kill switch":"Activate kill switch"}
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ActivityScreen, SettingsScreen });
