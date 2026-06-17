/* ===========================================================
   Sentinel — Soft-UI primitives (cream + teal neumorphism)
   =========================================================== */
const { useState, useEffect, useRef, useCallback } = React;

const SI = {
  grid:"M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  globe:"M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18",
  radar:"M12 12l6-3M12 21a9 9 0 109-9M12 7a5 5 0 105 5",
  refresh:"M21 12a9 9 0 11-2.6-6.4M21 3v5h-5",
  list:"M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  clock:"M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  cog:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a8 8 0 00.1-6l-2-.5a6 6 0 00-1-1.7l.6-2a8 8 0 00-5.2-3l-1 1.8a6 6 0 00-2 0l-1-1.8a8 8 0 00-5.2 3l.6 2a6 6 0 00-1 1.7l-2 .5a8 8 0 00.1 6l2 .5a6 6 0 001 1.7l-.6 2a8 8 0 005.2 3l1-1.8a6 6 0 002 0l1 1.8a8 8 0 005.2-3l-.6-2a6 6 0 001-1.7z",
  shield:"M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  bolt:"M13 2L4 14h7l-1 8 9-12h-7z",
  search:"M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  flag:"M5 21V4M5 4l8 .5L11 8l2 3.5L5 11",
  check:"M20 6L9 17l-5-5",
  arrowUp:"M7 17L17 7M7 7h10v10",
  chevD:"M6 9l6 6 6-6",
  chevL:"M15 6l-6 6 6 6",
  chevR:"M9 6l6 6-6 6",
  power:"M12 4v8M6.3 7a8 8 0 1011.4 0",
  bell:"M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  mic:"M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8",
  play:"M7 4l13 8-13 8z",
  pause:"M7 4h4v16H7zM15 4h4v16h-4z",
  image:"M3 5h18v14H3zM8 11a2 2 0 100-4 2 2 0 000 4zM21 16l-5-5L5 21",
  sparkles:"M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z",
  a11y:"M12 6a2 2 0 100-4 2 2 0 000 4zM5 9l7 1 7-1M12 10v5M9 21l3-6 3 6",
  layers:"M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  trend:"M3 17l6-6 4 4 8-8M21 7h-5M21 7v5",
  doc:"M14 3H6v18h12V7zM14 3l4 4M14 3v4h4",
  panelL:"M4 4h16v16H4zM10 4v16",
  plus:"M12 5v14M5 12h14",
  lock:"M5 11h14v10H5zM8 11V8a4 4 0 018 0v3",
  eye:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  undo:"M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  upload:"M12 16V4M7 9l5-5 5 5M5 20h14",
  thumb:"M7 10v11M7 10l4-7a2 2 0 013 2l-1 5h5a2 2 0 012 2.3l-1.3 6A2 2 0 0118 21H7",
  alert:"M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 002 3h16a2 2 0 002-3L13.7 3.9a2 2 0 00-3.4 0z",
  dots:"M5 12h.01M12 12h.01M19 12h.01",
  x:"M18 6L6 18M6 6l12 12",
  edit:"M4 20h4L19 9l-4-4L4 16zM14 5l4 4",
  link:"M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1",
  filter:"M3 5h18l-7 8v6l-4 2v-8z",
  gauge:"M12 14l4-4M5 19a9 9 0 1114 0",
};
function Icon({ name, size=20, sw=2, style, fill }) {
  const d = SI[name] || SI.grid;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill?"currentColor":"none"} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split("M").filter(Boolean).map((s,i)=><path key={i} d={"M"+s} />)}
    </svg>
  );
}

const TT = {
  teal:["var(--t-700)","var(--t-50)","var(--t-100)"],
  gold:["var(--gold)","var(--gold-bg)","var(--gold-line)"],
  clay:["var(--clay)","var(--clay-bg)","var(--clay-line)"],
  plum:["var(--plum)","var(--plum-bg)","#DCD2EA"],
  gray:["var(--ink-2)","var(--bg-2)","var(--line)"],
};

/* raised neumorphic card — hairline border + hover lift/accent */
function SoftCard({ children, pad=24, tone, hover=true, onClick, style, className="" }) {
  const isDark = tone==="dark", isTeal = tone==="teal";
  const bg = isDark?"var(--dark)": isTeal?"var(--t-700)":"var(--surface)";
  const cls = "scard " + (isDark?"scard--dark ":isTeal?"scard--teal ":"") + (hover?"hoverable ":"") + className;
  return (
    <div onClick={onClick} className={cls}
      style={{ background:bg, padding:pad,
        color: isDark||isTeal?"#F3EFE4":"var(--ink)",
        cursor:onClick?"pointer":(hover?"default":"default"), ...style }}>
      {children}
    </div>
  );
}

/* inset well (for chart areas / chips containers) */
function Well({ children, pad=16, style }) {
  return <div style={{ background:"var(--bg)", borderRadius:"var(--r-md)", boxShadow:"var(--neo-in)", padding:pad, ...style }}>{children}</div>;
}

function NeoButton({ children, icon, iconR, kind="primary", size="md", onClick, disabled, full, title, style, className="" }) {
  const sz = size==="sm"?{py:9,px:14,fs:13,ic:16}: size==="lg"?{py:14,px:22,fs:15,ic:19}:{py:11,px:18,fs:14,ic:17};
  const styles = {
    primary:{ bg:"var(--t-700)", fg:"#F3EFE4", sh:"4px 4px 11px rgba(20,80,72,.34), -3px -3px 9px rgba(255,255,255,.65)" },
    dark:{ bg:"var(--dark)", fg:"#F3EFE4", sh:"4px 4px 11px rgba(40,36,28,.4), -3px -3px 9px rgba(255,255,255,.5)" },
    soft:{ bg:"var(--surface)", fg:"var(--t-700)", sh:"var(--neo-sm)" },
    ghost:{ bg:"transparent", fg:"var(--ink-2)", sh:"none" },
  };
  const p = styles[kind]||styles.primary;
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={"neo-btn "+className}
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        background:p.bg, color:p.fg, boxShadow:p.sh, borderRadius:"var(--r-pill)",
        padding:`${sz.py}px ${sz.px}px`, fontSize:sz.fs, fontWeight:700, width:full?"100%":"auto", whiteSpace:"nowrap",
        opacity:disabled?.45:1, cursor:disabled?"not-allowed":"pointer", ...style }}>
      {icon && <Icon name={icon} size={sz.ic} />}{children}{iconR && <Icon name={iconR} size={sz.ic} />}
    </button>
  );
}

function Chip({ children, tone="gray", icon, dot, solid, size="md", style }) {
  const [fg,bg,ln] = TT[tone]||TT.gray;
  const s = size==="sm"?{fs:11.5,py:4,px:9,g:5}:{fs:12.5,py:5,px:11,g:6};
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:s.g, fontSize:s.fs, fontWeight:700, lineHeight:1,
      padding:`${s.py}px ${s.px}px`, borderRadius:"var(--r-pill)", whiteSpace:"nowrap",
      background:solid?fg:bg, color:solid?"#F3EFE4":fg, boxShadow: solid?"none":"var(--neo-xs)", ...style }}>
      {dot && <span style={{ width:6,height:6,borderRadius:99,background:solid?"#F3EFE4":fg }} />}
      {icon && <Icon name={icon} size={s.fs} />}{children}
    </span>
  );
}

function Toggle({ on, onChange, disabled, size=44 }) {
  const h = Math.round(size*0.55);
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={()=>!disabled&&onChange&&onChange(!on)}
      style={{ width:size, height:h, borderRadius:99, padding:3, flexShrink:0, position:"relative",
        background: on?"var(--t-600)":"var(--bg)", boxShadow: on?"inset 2px 2px 5px rgba(10,60,54,.5)":"var(--neo-in)",
        opacity:disabled?.5:1, transition:"background .2s", cursor:disabled?"not-allowed":"pointer" }}>
      <span style={{ display:"block", width:h-6, height:h-6, borderRadius:99, background:"var(--surface-hi)",
        boxShadow:"2px 2px 5px rgba(120,108,84,.45)", transform:`translateX(${on?size-h:0}px)`, transition:"transform .22s cubic-bezier(.3,.8,.4,1.2)" }} />
    </button>
  );
}

function tealForScore(v){ return v>=85?"var(--t-500)": v>=65?"var(--t-700)": v>=45?"var(--gold)":"var(--clay)"; }

/* respects reduced-motion */
const prefersReduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* count-up animation hook — animates from previous value to target */
function useCountUp(target, { duration=850, decimals=0, run=true } = {}) {
  const [val, setVal] = useState(run ? 0 : target);
  const raf = useRef(0);
  const fromRef = useRef(0);
  useEffect(()=>{
    if(!run){ setVal(target); fromRef.current=target; return; }
    if(prefersReduced()){ setVal(target); fromRef.current=target; return; }
    const start = performance.now();
    const from = fromRef.current;
    const tick = (now)=>{
      const t = Math.min(1,(now-start)/duration);
      const e = 1-Math.pow(1-t,3);
      setVal(from + (target-from)*e);
      if(t<1) raf.current = requestAnimationFrame(tick);
      else { setVal(target); fromRef.current=target; }
    };
    raf.current = requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf.current);
  },[target, run, duration]);
  const factor = Math.pow(10, decimals);
  return Math.round(val*factor)/factor;
}

/* radial gauge */
function Gauge({ value, size=160, sw=16, label, sub, center }) {
  const r=(size-sw)/2, c=2*Math.PI*r, col=tealForScore(value);
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c-(c*value)/100}
          style={{ transition:"stroke-dashoffset 1.1s cubic-bezier(.3,.8,.3,1)" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        {center ? center : <>
          <span style={{ fontSize:size*0.26, fontWeight:800, color:col, lineHeight:1 }}>{value}</span>
          {label && <span style={{ fontSize:size*0.085, color:"var(--muted)", fontWeight:600, marginTop:4 }}>{label}</span>}
          {sub && <span style={{ fontSize:size*0.07, color:"var(--faint)", marginTop:2 }}>{sub}</span>}
        </>}
      </div>
    </div>
  );
}

function Ring({ value, size=64, sw=7, label }) {
  const r=(size-sw)/2, c=2*Math.PI*r, col=tealForScore(value);
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c-(c*value)/100} style={{ transition:"stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center" }}>
        <span style={{ fontSize:size*0.30, fontWeight:800, color:col }}>{value}</span>
      </div>
    </div>
  );
}

function SectionHead({ children, sub, right, light }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, gap:12 }}>
      <div>
        <h3 style={{ margin:0, fontSize:17, fontWeight:700, letterSpacing:"-.01em", color: light?"#F3EFE4":"var(--ink)" }}>{children}</h3>
        {sub && <div style={{ fontSize:12.5, color: light?"rgba(243,239,228,.6)":"var(--muted)", marginTop:3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Glyph({ color, char, size=40, r=13, light }) {
  return <div style={{ width:size, height:size, borderRadius:r, flexShrink:0, background:color, color:"#F7F3EA",
    display:"grid", placeItems:"center", fontWeight:800, fontSize:size*0.42,
    boxShadow: light?"none":"3px 3px 8px rgba(120,108,84,.4), inset 0 -2px 5px rgba(0,0,0,.12)" }}>{char}</div>;
}

/* ---- modal ---- */
function SoftModal({ open, onClose, children, w=580 }) {
  useEffect(()=>{ if(!open) return; const h=e=>e.key==="Escape"&&onClose&&onClose(); window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[open,onClose]);
  if(!open) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:90, background:"rgba(42,38,32,.40)", backdropFilter:"blur(5px)", display:"grid", placeItems:"center", padding:24, animation:"pop .2s both" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:w, maxWidth:"100%", maxHeight:"90vh", background:"var(--surface)", borderRadius:"var(--r-lg)", boxShadow:"0 30px 80px rgba(40,36,28,.4)", border:"1px solid var(--line-soft)", overflow:"hidden", display:"flex", flexDirection:"column", animation:"rise .3s both" }}>
        {children}
      </div>
    </div>
  );
}
function SoftModalHead({ title, sub, onClose, icon, tone="teal" }) {
  const [fg,bg] = TT[tone]||TT.teal;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:13, padding:"20px 22px", borderBottom:"1px solid var(--line-soft)" }}>
      {icon && <div style={{ width:42, height:42, borderRadius:13, background:bg, color:fg, display:"grid", placeItems:"center", boxShadow:"var(--neo-xs)" }}><Icon name={icon} size={20} /></div>}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{title}</div>
        {sub && <div style={{ fontSize:13, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
      </div>
      {onClose && <button onClick={onClose} className="neo-btn" style={{ width:34, height:34, borderRadius:11, background:"var(--bg)", boxShadow:"var(--neo-in)", display:"grid", placeItems:"center", color:"var(--muted)" }}><Icon name="x" size={18} /></button>}
    </div>
  );
}

/* ---- diff block ---- */
function SoftDiff({ field, before, after }) {
  return (
    <div style={{ fontFamily:"var(--mono)", fontSize:12.5, borderRadius:"var(--r-md)", overflow:"hidden", boxShadow:"var(--neo-in)", background:"var(--bg)" }}>
      {field && <div style={{ padding:"7px 13px", color:"var(--muted)", fontWeight:600, borderBottom:"1px solid var(--line)", fontSize:11.5 }}>{field}</div>}
      <div style={{ display:"flex", gap:9, padding:"10px 13px", alignItems:"flex-start", color:"#9A4A37" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>−</span><span style={{ lineHeight:1.5 }}>{before}</span>
      </div>
      <div style={{ display:"flex", gap:9, padding:"10px 13px", alignItems:"flex-start", color:"var(--t-700)", background:"var(--t-50)" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>+</span><span style={{ lineHeight:1.5 }}>{after}</span>
      </div>
    </div>
  );
}

/* discipline + status maps */
const softDisc = {
  performance:{ icon:"bolt", tone:"gold", label:"Performance" },
  seo:{ icon:"search", tone:"teal", label:"SEO" },
  image:{ icon:"image", tone:"plum", label:"Images" },
  accessibility:{ icon:"a11y", tone:"plum", label:"Accessibility" },
  geo:{ icon:"sparkles", tone:"teal", label:"AI-SEO" },
};
const softStatus = {
  connected:{ tone:"teal", label:"Connected", icon:"check" },
  "auth-failed":{ tone:"clay", label:"Auth failed", icon:"lock" },
  unreachable:{ tone:"gold", label:"Unreachable", icon:"alert" },
};
const impactTone = { high:["clay","High"], medium:["gold","Medium"], low:["teal","Low"] };
function SoftRisk({ risk }) {
  const m = { low:["teal","Low risk"], medium:["gold","Medium risk"], high:["clay","High risk"] };
  const [tone,label]=m[risk]||m.low;
  return <Chip tone={tone} size="sm" dot>{label}</Chip>;
}

/* form field */
function SoftInput(props){
  return <input {...props} className={"sin "+(props.className||"")} />;
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

Object.assign(window, {
  Icon, SoftCard, Well, NeoButton, Chip, Toggle, Gauge, Ring, SectionHead, Glyph,
  SoftModal, SoftModalHead, SoftDiff, SoftRisk, SoftInput, Field,
  softDisc, softStatus, impactTone,
  tealForScore, useCountUp, prefersReduced, TT, useState, useEffect, useRef, useCallback
});
