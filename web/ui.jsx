/* ===========================================================
   Sentinel — UI primitives & icon set
   =========================================================== */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---- icon set (simple feather-ish strokes) ---- */
const I = {
  grid:    "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  globe:   "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18",
  radar:   "M12 12l6-3M12 21a9 9 0 109-9M12 7a5 5 0 105 5",
  check:   "M20 6L9 17l-5-5",
  shield:  "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  bolt:    "M13 2L4 14h7l-1 8 9-12h-7z",
  search:  "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  bell:    "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  gauge:   "M12 14l4-4M5 19a9 9 0 1114 0",
  image:   "M3 5h18v14H3zM8 11a2 2 0 100-4 2 2 0 000 4zM21 16l-5-5L5 21",
  sparkles:"M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3zM18 14l.9 2.2L21 17l-2.1.8L18 20l-.9-2.2L15 17l2.1-.8z",
  a11y:    "M12 6a2 2 0 100-4 2 2 0 000 4zM5 9l7 1 7-1M12 10v5M9 21l3-6 3 6",
  plus:    "M12 5v14M5 12h14",
  arrowUp: "M7 17L17 7M7 7h10v10",
  chevD:   "M6 9l6 6 6-6",
  chevR:   "M9 6l6 6-6 6",
  power:   "M12 4v8M6.3 7a8 8 0 1011.4 0",
  upload:  "M12 16V4M7 9l5-5 5 5M5 20h14",
  undo:    "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  thumb:   "M7 10v11M7 10l4-7a2 2 0 013 2l-1 5h5a2 2 0 012 2.3l-1.3 6A2 2 0 0118 21H7",
  link:    "M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1",
  alert:   "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 002 3h16a2 2 0 002-3L13.7 3.9a2 2 0 00-3.4 0z",
  x:       "M18 6L6 18M6 6l12 12",
  cog:     "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a8 8 0 00.1-6l-2-.5a6 6 0 00-1-1.7l.6-2a8 8 0 00-5.2-3l-1 1.8a6 6 0 00-2 0l-1-1.8a8 8 0 00-5.2 3l.6 2a6 6 0 00-1 1.7l-2 .5a8 8 0 00.1 6l2 .5a6 6 0 001 1.7l-.6 2a8 8 0 005.2 3l1-1.8a6 6 0 002 0l1 1.8a8 8 0 005.2-3l-.6-2a6 6 0 001-1.7z",
  clock:   "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  layers:  "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  doc:     "M14 3H6v18h12V7zM14 3l4 4M14 3v4h4M9 13h6M9 17h6",
  list:    "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  flag:    "M5 21V4M5 4l8 .5L11 8l2 3.5L5 11",
  eye:     "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  lock:    "M5 11h14v10H5zM8 11V8a4 4 0 018 0v3",
  edit:    "M4 20h4L19 9l-4-4L4 16zM14 5l4 4",
  filter:  "M3 5h18l-7 8v6l-4 2v-8z",
  mail:    "M3 5h18v14H3zM3 6l9 7 9-7",
  trend:   "M3 17l6-6 4 4 8-8M21 7h-5M21 7v5",
};

function Icon({ name, size = 18, sw = 1.7, fill = false, style }) {
  const d = I[name] || I.grid;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split("M").filter(Boolean).map((seg,i)=><path key={i} d={"M"+seg} />)}
    </svg>
  );
}

/* ---- Card ---- */
function Card({ children, pad = 22, className = "", style, hover, onClick, tone }) {
  const bg = tone === "ink" ? "var(--g-900)" : tone === "tint" ? "var(--g-50)" : "var(--card)";
  return (
    <div onClick={onClick}
      className={"sn-card "+(hover?"sn-card--h ":"")+className}
      style={{ background:bg, borderRadius:"var(--r-lg)", padding:pad,
        border:"1px solid "+(tone==="ink"?"transparent":"var(--line)"),
        boxShadow:"var(--sh-sm)", ...style }}>
      {children}
    </div>
  );
}

/* ---- Pill / Badge ---- */
const TONES = {
  green:  ["var(--g-700)","var(--g-50)","var(--g-200)"],
  amber:  ["var(--amber)","var(--amber-bg)","var(--amber-line)"],
  red:    ["var(--red)","var(--red-bg)","var(--red-line)"],
  blue:   ["var(--blue)","var(--blue-bg)","var(--blue-line)"],
  violet: ["var(--violet)","var(--violet-bg)","#DAD3EE"],
  gray:   ["var(--ink-2)","var(--bg-soft)","var(--line)"],
};
function Pill({ children, tone = "gray", dot, icon, solid, size = "md", style }) {
  const [fg, bg, ln] = TONES[tone] || TONES.gray;
  const s = size === "sm" ? { fs:11, py:3, px:8, g:5 } : { fs:12, py:4, px:10, g:6 };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:s.g,
      background: solid ? fg : bg, color: solid ? "#fff" : fg,
      border:"1px solid "+(solid?"transparent":ln),
      fontSize:s.fs, fontWeight:600, lineHeight:1, padding:`${s.py}px ${s.px}px`,
      borderRadius:99, whiteSpace:"nowrap", ...style }}>
      {dot && <span style={{ width:6, height:6, borderRadius:99, background:solid?"#fff":fg }} />}
      {icon && <Icon name={icon} size={s.fs} sw={2} />}
      {children}
    </span>
  );
}

/* ---- Button ---- */
function Btn({ children, kind = "primary", icon, iconR, size = "md", disabled, onClick, full, danger, style, title }) {
  const sz = size === "sm" ? { py:8, px:13, fs:13, ic:15 } :
             size === "lg" ? { py:13, px:20, fs:15, ic:18 } : { py:10, px:16, fs:14, ic:16 };
  const palettes = {
    primary:{ bg:"var(--g-700)", fg:"#fff", bd:"transparent", sh:"0 2px 8px rgba(26,110,74,.28)" },
    dark:{ bg:"var(--g-900)", fg:"#fff", bd:"transparent" },
    ghost:{ bg:"var(--card)", fg:"var(--ink)", bd:"var(--line)" },
    soft:{ bg:"var(--g-50)", fg:"var(--g-800)", bd:"var(--g-200)" },
    quiet:{ bg:"transparent", fg:"var(--ink-2)", bd:"transparent" },
  };
  let p = palettes[kind] || palettes.primary;
  if (danger) p = { bg:"var(--red)", fg:"#fff", bd:"transparent", sh:"0 2px 8px rgba(188,58,43,.28)" };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="sn-btn"
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        background:p.bg, color:p.fg, border:"1px solid "+p.bd,
        padding:`${sz.py}px ${sz.px}px`, fontSize:sz.fs, fontWeight:600,
        borderRadius:"var(--r-md)", boxShadow:p.sh||"none",
        width:full?"100%":"auto", opacity:disabled?.45:1,
        cursor:disabled?"not-allowed":"pointer", transition:"transform .12s, box-shadow .15s, filter .15s", ...style }}>
      {icon && <Icon name={icon} size={sz.ic} sw={2} />}
      {children}
      {iconR && <Icon name={iconR} size={sz.ic} sw={2} />}
    </button>
  );
}

/* ---- Section heading ---- */
function SectionTitle({ children, sub, right, style }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16, ...style }}>
      <div>
        <h3 style={{ margin:0, fontSize:18, fontWeight:700, letterSpacing:"-.01em" }}>{children}</h3>
        {sub && <div style={{ color:"var(--muted)", fontSize:13, marginTop:3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ---- Avatar / site glyph ---- */
function Glyph({ color, char, size = 36, r = 11, sw }) {
  return (
    <div style={{ width:size, height:size, borderRadius:r, flexShrink:0,
      background:color, color:"#fff", display:"grid", placeItems:"center",
      fontWeight:800, fontSize:size*0.42, boxShadow:sw||"inset 0 -2px 6px rgba(0,0,0,.15)" }}>{char}</div>
  );
}

/* ---- score ring ---- */
function scoreColor(v){ return v>=90?"var(--g-600)": v>=75?"var(--g-500)": v>=50?"var(--amber)":"var(--red)"; }
function ScoreRing({ value, size = 62, sw = 6, label }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  const col = value ? scoreColor(value) : "var(--faint)";
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c - (c * (value||0)) / 100}
          style={{ transition:"stroke-dashoffset 1s cubic-bezier(.3,.8,.3,1)" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", flexDirection:"column" }}>
        <span style={{ fontSize:size*0.30, fontWeight:800, color:col, lineHeight:1 }}>{value||"—"}</span>
        {label && <span style={{ fontSize:9, color:"var(--muted)", marginTop:2, fontWeight:600 }}>{label}</span>}
      </div>
    </div>
  );
}

/* ---- linear meter ---- */
function Meter({ value, tone = "green", h = 7, track = "var(--line)" }) {
  const col = tone==="auto"?scoreColor(value):TONES[tone][0];
  return (
    <div style={{ background:track, height:h, borderRadius:99, overflow:"hidden" }}>
      <div style={{ width:value+"%", height:"100%", background:col, borderRadius:99,
        transformOrigin:"left", animation:"barGrow .8s cubic-bezier(.3,.8,.3,1) both",
        transition:"width .6s" }} />
    </div>
  );
}

/* ---- toggle switch ---- */
function Toggle({ on, onChange, disabled, tone = "green" }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled}
      onClick={()=>!disabled&&onChange&&onChange(!on)}
      style={{ width:42, height:24, borderRadius:99, padding:2, flexShrink:0,
        background:on?TONES[tone][0]:"#CCD2CB", opacity:disabled?.5:1,
        transition:"background .2s", cursor:disabled?"not-allowed":"pointer" }}>
      <span style={{ display:"block", width:20, height:20, borderRadius:99, background:"#fff",
        boxShadow:"0 1px 3px rgba(0,0,0,.25)", transform:`translateX(${on?18:0}px)`, transition:"transform .2s" }} />
    </button>
  );
}

/* ---- segmented control ---- */
function Segmented({ options, value, onChange, size="md" }) {
  const py = size==="sm"?6:8;
  return (
    <div style={{ display:"inline-flex", background:"var(--bg-soft)", borderRadius:"var(--r-md)", padding:3, gap:2, border:"1px solid var(--line)" }}>
      {options.map(o=>{
        const v = o.v ?? o, lab = o.l ?? o, active = v===value;
        return <button key={v} onClick={()=>onChange(v)}
          style={{ padding:`${py}px 14px`, fontSize:13, fontWeight:600, borderRadius:9,
            background:active?"var(--card)":"transparent", color:active?"var(--ink)":"var(--muted)",
            boxShadow:active?"var(--sh-sm)":"none", transition:"all .15s" }}>{lab}</button>;
      })}
    </div>
  );
}

/* ---- risk pill helper ---- */
function RiskPill({ risk }) {
  const map = { low:["green","Low risk"], medium:["amber","Medium risk"], high:["red","High risk"] };
  const [tone,label]=map[risk]||map.low;
  return <Pill tone={tone} size="sm" dot>{label}</Pill>;
}

/* ---- modal shell ---- */
function Modal({ open, onClose, children, w = 560 }) {
  useEffect(()=>{
    if(!open) return;
    const h = e=>e.key==="Escape"&&onClose&&onClose();
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  },[open,onClose]);
  if(!open) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:80,
      background:"rgba(16,40,28,.34)", backdropFilter:"blur(4px)",
      display:"grid", placeItems:"center", padding:24, animation:"pop .2s both" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:w, maxWidth:"100%", maxHeight:"90vh",
        background:"var(--card)", borderRadius:"var(--r-xl)", boxShadow:"var(--sh-lg)",
        overflow:"hidden", display:"flex", flexDirection:"column", animation:"fadeUp .28s both" }}>
        {children}
      </div>
    </div>
  );
}
function ModalHead({ title, sub, onClose, icon, tone="green" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:13, padding:"20px 22px", borderBottom:"1px solid var(--line)" }}>
      {icon && <div style={{ width:40, height:40, borderRadius:11, background:TONES[tone][1], color:TONES[tone][0], display:"grid", placeItems:"center" }}><Icon name={icon} size={20} /></div>}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>{title}</div>
        {sub && <div style={{ fontSize:13, color:"var(--muted)", marginTop:2 }}>{sub}</div>}
      </div>
      {onClose && <button onClick={onClose} style={{ width:32, height:32, borderRadius:9, display:"grid", placeItems:"center", color:"var(--muted)" }} className="sn-iconbtn"><Icon name="x" size={18} /></button>}
    </div>
  );
}

/* ---- tiny diff block ---- */
function Diff({ before, after, field }) {
  return (
    <div style={{ fontFamily:"var(--mono)", fontSize:12.5, borderRadius:"var(--r-md)", overflow:"hidden", border:"1px solid var(--line)" }}>
      {field && <div style={{ padding:"6px 12px", background:"var(--bg-soft)", color:"var(--muted)", fontWeight:600, borderBottom:"1px solid var(--line)", fontSize:11.5 }}>{field}</div>}
      <div style={{ display:"flex", gap:8, padding:"9px 12px", background:"var(--red-bg)", color:"#8C3A2E", alignItems:"flex-start" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>−</span><span style={{ lineHeight:1.5 }}>{before}</span>
      </div>
      <div style={{ display:"flex", gap:8, padding:"9px 12px", background:"var(--g-50)", color:"var(--g-800)", alignItems:"flex-start" }}>
        <span style={{ opacity:.6, userSelect:"none" }}>+</span><span style={{ lineHeight:1.5 }}>{after}</span>
      </div>
    </div>
  );
}

/* ---- empty state ---- */
function Empty({ icon, title, sub, action }) {
  return (
    <div style={{ textAlign:"center", padding:"44px 20px", color:"var(--muted)" }}>
      <div style={{ width:52, height:52, borderRadius:14, background:"var(--bg-soft)", display:"grid", placeItems:"center", margin:"0 auto 14px", color:"var(--faint)" }}><Icon name={icon} size={24} /></div>
      <div style={{ fontWeight:700, color:"var(--ink)", fontSize:15 }}>{title}</div>
      {sub && <div style={{ fontSize:13, marginTop:5, maxWidth:320, marginInline:"auto" }}>{sub}</div>}
      {action && <div style={{ marginTop:16 }}>{action}</div>}
    </div>
  );
}

const discMeta = {
  performance:{ icon:"bolt", tone:"amber", label:"Performance" },
  seo:{ icon:"search", tone:"green", label:"SEO" },
  image:{ icon:"image", tone:"violet", label:"Images" },
  accessibility:{ icon:"a11y", tone:"blue", label:"Accessibility" },
  geo:{ icon:"sparkles", tone:"green", label:"AI-SEO" },
};

/* hover micro-styles injected once */
(function(){
  const s = document.createElement("style");
  s.textContent = `
    .sn-card--h{transition:transform .16s, box-shadow .18s, border-color .18s; cursor:pointer}
    .sn-card--h:hover{transform:translateY(-2px); box-shadow:var(--sh-md); border-color:var(--g-200)}
    .sn-btn:hover:not(:disabled){filter:brightness(1.04); transform:translateY(-1px)}
    .sn-btn:active:not(:disabled){transform:translateY(0)}
    .sn-iconbtn{transition:background .15s, color .15s}
    .sn-iconbtn:hover{background:var(--bg-soft); color:var(--ink)}
    .sn-nav:hover{background:var(--bg-soft)}
    .sn-row:hover{background:var(--card-2)}
    .sn-input{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:var(--r-md);font-size:14px;background:var(--card-2);color:var(--ink);transition:border-color .15s, box-shadow .15s}
    .sn-input:focus{outline:none;border-color:var(--g-500);box-shadow:0 0 0 3px var(--g-100);background:var(--card)}
    .sn-input::placeholder{color:var(--faint)}
  `;
  document.head.appendChild(s);
})();

Object.assign(window, {
  Icon, Card, Pill, Btn, SectionTitle, Glyph, ScoreRing, Meter, Toggle,
  Segmented, RiskPill, Modal, ModalHead, Diff, Empty, scoreColor, discMeta, TONES,
  useState, useEffect, useRef, useMemo, useCallback
});
