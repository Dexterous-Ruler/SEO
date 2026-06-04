/* ===========================================================
   Screen — Overview
   =========================================================== */
function StatCard({ label, value, delta, deltaTone="green", sub, icon, highlight, onClick }) {
  return (
    <Card tone={highlight?"ink":undefined} hover onClick={onClick}
      pad={20} style={{ position:"relative", overflow:"hidden" }}>
      {highlight && <div style={{ position:"absolute", right:-30, top:-30, width:130, height:130, borderRadius:99,
        background:"radial-gradient(circle at 30% 30%, rgba(79,186,136,.45), transparent 70%)" }} />}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
        <span style={{ fontSize:13.5, fontWeight:600, color:highlight?"rgba(255,255,255,.78)":"var(--muted)" }}>{label}</span>
        <div style={{ width:30, height:30, borderRadius:9, display:"grid", placeItems:"center",
          background:highlight?"rgba(255,255,255,.14)":"var(--g-50)", color:highlight?"#fff":"var(--g-700)" }}>
          <Icon name={icon} size={16} sw={2} />
        </div>
      </div>
      <div style={{ fontSize:36, fontWeight:800, letterSpacing:"-.02em", marginTop:12, lineHeight:1,
        color:highlight?"#fff":"var(--ink)" }}>{value}</div>
      <div style={{ marginTop:11, display:"flex", alignItems:"center", gap:7 }}>
        {delta && <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:12, fontWeight:700,
          padding:"2px 7px", borderRadius:99,
          background:highlight?"rgba(255,255,255,.16)":TONES[deltaTone][1],
          color:highlight?"#fff":TONES[deltaTone][0] }}>
          <Icon name="trend" size={12} sw={2.2} />{delta}</span>}
        <span style={{ fontSize:12.5, color:highlight?"rgba(255,255,255,.7)":"var(--muted)" }}>{sub}</span>
      </div>
    </Card>
  );
}

function TrendChart({ data }) {
  const max = 100, today = data.length-1;
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:14, height:200, paddingTop:24 }}>
      {data.map((d,i)=>{
        const isToday = i===today;
        const hSeo = (d.seo/max)*100;
        return (
          <div key={d.d} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:10, height:"100%" }}>
            <div style={{ flex:1, width:"100%", maxWidth:46, display:"flex", alignItems:"flex-end", position:"relative" }}>
              {isToday && <div style={{ position:"absolute", top:-2, left:"50%", transform:"translateX(-50%)",
                background:"var(--g-900)", color:"#fff", fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:7, whiteSpace:"nowrap" }}>
                {d.seo} SEO</div>}
              <div style={{ width:"100%", height:hSeo+"%", borderRadius:99,
                background: isToday ? "linear-gradient(180deg,var(--g-500),var(--g-700))"
                  : i>=today-2 ? "var(--g-400)" : undefined,
                ...(i<today-2 ? {
                  backgroundImage:"repeating-linear-gradient(135deg, var(--g-100) 0 6px, transparent 6px 12px)",
                  border:"1px solid var(--g-200)"
                } : {}),
                boxShadow: isToday?"0 6px 16px rgba(26,110,74,.32)":"none",
                transition:"height .8s cubic-bezier(.3,.8,.3,1)" }} />
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:isToday?"var(--ink)":"var(--faint)" }}>{d.d}</span>
          </div>
        );
      })}
    </div>
  );
}

function CWVRow({ label, v, state }) {
  const map = { good:["green","Good"], ni:["amber","Needs work"], poor:["red","Poor"], na:["gray","—"] };
  const [tone] = map[state]||map.na;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 0", borderBottom:"1px solid var(--line-2)" }}>
      <div>
        <div style={{ fontSize:13, fontWeight:700 }}>{label}</div>
        <div style={{ fontSize:18, fontWeight:800, color:TONES[tone][0], marginTop:2, fontFamily:"var(--mono)" }}>{v}</div>
      </div>
      <Pill tone={tone} size="sm" dot>{map[state][1]}</Pill>
    </div>
  );
}

function ReviewMini({ ctx }) {
  const top = ctx.proposals.filter(p=>p.status==="proposed").slice(0,3);
  return (
    <Card pad={20} style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <SectionTitle sub={`${ctx.proposals.filter(p=>p.status==="proposed").length} awaiting your decision`}
        right={<Btn kind="quiet" size="sm" iconR="chevR" onClick={()=>ctx.goto("review")}>Open queue</Btn>}>
        Review Queue
      </SectionTitle>
      <div style={{ display:"flex", flexDirection:"column", gap:10, flex:1 }}>
        {top.length===0 && <Empty icon="check" title="Queue clear" sub="No proposals waiting." />}
        {top.map(p=>{
          const dm = discMeta[p.disc];
          return (
            <div key={p.id} className="sn-row" style={{ border:"1px solid var(--line)", borderRadius:"var(--r-md)", padding:12, transition:"background .15s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:8, background:TONES[dm.tone][1], color:TONES[dm.tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={dm.icon} size={15} sw={2} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.title}</div>
                  <div style={{ fontSize:11.5, color:"var(--muted)", fontFamily:"var(--mono)" }}>{p.page}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
                <RiskPill risk={p.risk} />
                <span style={{ fontSize:12, fontWeight:700, color:"var(--g-700)" }}>{p.impact.split("·")[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityFeed({ ctx, compact }) {
  const aTone = { verified:"green", approved:"green", applied:"blue", "rolled-back":"amber", audit:"violet", connection:"gray", failed:"red" };
  const items = ACTIVITY.slice(0, compact?5:ACTIVITY.length);
  return (
    <Card pad={20} style={{ height:"100%" }}>
      <SectionTitle sub="Audit trail — every action logged"
        right={compact && <Btn kind="quiet" size="sm" iconR="chevR" onClick={()=>ctx.goto("activity")}>All</Btn>}>Recent Activity</SectionTitle>
      <div style={{ display:"flex", flexDirection:"column" }}>
        {items.map((a,i)=>{
          const tone = aTone[a.type]||"gray";
          return (
            <div key={a.id} style={{ display:"flex", gap:12, paddingBottom:i===items.length-1?0:16 }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ width:30, height:30, borderRadius:99, background:TONES[tone][1], color:TONES[tone][0], display:"grid", placeItems:"center", flexShrink:0 }}><Icon name={a.icon} size={15} sw={2} /></div>
                {i<items.length-1 && <div style={{ width:2, flex:1, background:"var(--line)", marginTop:4 }} />}
              </div>
              <div style={{ flex:1, paddingBottom:2 }}>
                <div style={{ fontSize:13.5, fontWeight:600, lineHeight:1.4 }}>{a.text}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, fontSize:11.5, color:"var(--muted)" }}>
                  <span style={{ fontWeight:600 }}>{a.who}</span>·<span>{a.t}</span>
                </div>
                {a.meta && <div style={{ fontSize:11.5, color:"var(--faint)", marginTop:2, fontFamily:"var(--mono)" }}>{a.meta}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function OverviewScreen({ ctx }) {
  const s = ctx.site;
  const avg = Math.round((s.scores.performance+s.scores.accessibility+s.scores.bestPractices+s.scores.seo)/4);
  const verifiedCount = ctx.proposals.filter(p=>p.status==="verified").length;
  const pending = ctx.proposals.filter(p=>p.status==="proposed").length;

  return (
    <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
        <StatCard highlight label="Overall Health" value={avg} delta="+4" sub="vs. last audit" icon="shield" onClick={()=>ctx.goto("audits")} />
        <StatCard label="Open Findings" value={s.openFindings} sub="prioritized by impact" icon="flag" deltaTone="amber" onClick={()=>ctx.goto("audits")} />
        <StatCard label="Pending Approvals" value={pending} sub="in review queue" icon="list" deltaTone="blue" onClick={()=>ctx.goto("review")} />
        <StatCard label="Verified Fixes" value={verifiedCount} delta="this wk" sub="read-back confirmed" icon="check" onClick={()=>ctx.goto("activity")} />
      </div>

      {/* row 2 */}
      <div style={{ display:"grid", gridTemplateColumns:"1.7fr 1fr", gap:16 }}>
        <Card pad={22}>
          <SectionTitle sub="SEO score across audits this week"
            right={<Segmented size="sm" options={[{v:"w",l:"Week"},{v:"m",l:"Month"}]} value="w" onChange={()=>{}} />}>
            Audit Score Trend
          </SectionTitle>
          <TrendChart data={TREND} />
          <div style={{ display:"flex", gap:18, marginTop:14, fontSize:12, color:"var(--muted)" }}>
            <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:11, height:11, borderRadius:4, background:"var(--g-500)" }} />Recent</span>
            <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:11, height:11, borderRadius:4, backgroundImage:"repeating-linear-gradient(135deg, var(--g-100) 0 4px, transparent 4px 8px)", border:"1px solid var(--g-200)" }} />Earlier</span>
          </div>
        </Card>
        <ReviewMini ctx={ctx} />
      </div>

      {/* row 3 */}
      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 1fr 1.2fr", gap:16 }}>
        {/* category scores */}
        <Card pad={22}>
          <SectionTitle sub="Latest Lighthouse run">Category Scores</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, placeItems:"center" }}>
            {[["Performance",s.scores.performance],["Accessibility",s.scores.accessibility],["Best Practices",s.scores.bestPractices],["SEO",s.scores.seo]].map(([l,v])=>(
              <div key={l} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                <ScoreRing value={v} size={72} sw={7} />
                <span style={{ fontSize:12, fontWeight:600, color:"var(--muted)" }}>{l}</span>
              </div>
            ))}
          </div>
        </Card>
        {/* CWV */}
        <Card pad={22}>
          <SectionTitle sub="Real-user field data (28d)">Core Web Vitals</SectionTitle>
          <CWVRow label="Largest Contentful Paint" v={s.cwv.lcp.v} state={s.cwv.lcp.state} />
          <CWVRow label="Interaction to Next Paint" v={s.cwv.inp.v} state={s.cwv.inp.state} />
          <div style={{ marginBottom:-11 }}><CWVRow label="Cumulative Layout Shift" v={s.cwv.cls.v} state={s.cwv.cls.state} /></div>
        </Card>
        {/* activity */}
        <ActivityFeed ctx={ctx} compact />
      </div>
    </div>
  );
}

Object.assign(window, { OverviewScreen, ActivityFeed, StatCard });
