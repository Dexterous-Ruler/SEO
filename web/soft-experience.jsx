/* ===========================================================
   Sentinel Soft-UI — Experience Monitor (UX/conversion defects)
   -----------------------------------------------------------
   INERT scaffold by default: the beacon ships OFF, zero data,
   gated behind a compliance sign-off. This screen renders the
   onboarding pitch when disarmed, a live worklist when armed,
   and a friendly empty state when armed-but-collecting.

   Global script (concatenated by web/build.mjs alongside
   web/soft-screens-a.jsx) — NO import/export. React hooks and
   UI atoms come in as globals (see web/soft-ui.jsx).

   API surface (registered separately):
     API.beaconStatus(siteId)            -> { armed, signedOff, hasKey, eventCount }
     API.armBeacon(siteId, on)           -> { armed, signedOff, reason? }
     API.uxDefects(siteId, opts)         -> { defects:[...], totals }
     API.uxDefectAction(defectId, action, siteId)  // 'ignore'|'propose'|'apply'
   =========================================================== */

/* ---- safe number formatting (never crash on null/undefined/NaN) ---- */
function expNum(n) {
  const v = Number(n);
  if (!isFinite(v)) return "0";
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  return v.toLocaleString();
}
function expPct(n) {
  const v = Number(n);
  if (!isFinite(v)) return "0%";
  // accept either a 0–1 rate or an already-scaled 0–100 number
  const pct = v <= 1 ? v * 100 : v;
  return (Math.round(pct * 10) / 10) + "%";
}

/* event_type → presentation (icon / tone / human label) */
const EXP_EVENTS = {
  broken_resource:        { icon: "alert",    tone: "clay", label: "Broken resource" },
  broken_cta:             { icon: "bolt",     tone: "clay", label: "Broken CTA" },
  "broken internal link": { icon: "link",     tone: "clay", label: "Broken internal link" },
  broken_internal_link:   { icon: "link",     tone: "clay", label: "Broken internal link" },
  "tap-target":           { icon: "filter",   tone: "gold", label: "Tap-target too small" },
  tap_target:             { icon: "filter",   tone: "gold", label: "Tap-target too small" },
  rage_click:             { icon: "alert",    tone: "gold", label: "Rage click" },
  dead_click:             { icon: "eye",      tone: "gold", label: "Dead click" },
  form_abandon:           { icon: "edit",     tone: "plum", label: "Form abandonment" },
  layout_shift:           { icon: "layers",   tone: "gold", label: "Layout shift" },
  slow_interaction:       { icon: "clock",    tone: "gold", label: "Slow interaction" },
};
function expEventMeta(t) {
  return EXP_EVENTS[t] || { icon: "search", tone: "gray", label: String(t || "Issue").replace(/[_-]+/g, " ") };
}

/* confidence → chip tone/label */
function expConfMeta(c) {
  const k = String(c || "").toLowerCase();
  if (k === "high")   return { tone: "teal", label: "High confidence" };
  if (k === "medium") return { tone: "gold", label: "Medium confidence" };
  return { tone: "gray", label: (k ? k[0].toUpperCase() + k.slice(1) : "Low") + " confidence" };
}

/* Only HIGH-confidence, deterministically-fixable defects get [Apply].
   Everything else routes through [Review] (human-in-the-loop). */
const EXP_FIXABLE = new Set(["broken_resource", "broken_cta", "broken internal link", "broken_internal_link", "tap-target", "tap_target"]);
function expCanApply(d) {
  return String(d && d.confidence).toLowerCase() === "high" && EXP_FIXABLE.has(d && d.event_type);
}

/* ---- privacy guarantees — these define what is NEVER collected ---- */
const EXP_PRIVACY = [
  "Cookie-consent gated",
  "No session / visitor ID",
  "No session replay",
  "No form values",
  "No full IP address",
  "Aggregate-only",
  "Raw events ≤ 72h retention",
];

/* ===================== drill-down modal ===================== */
function ExpDefectModal({ d, ctx, onClose, onAction }) {
  if (!d) return null;
  const ev = expEventMeta(d.event_type);
  const conf = expConfMeta(d.confidence);
  const canApply = expCanApply(d);
  const [busy, setBusy] = useState("");
  const act = (action) => {
    setBusy(action);
    Promise.resolve(onAction && onAction(d, action)).finally(() => setBusy(""));
  };
  return (
    <SoftModal open onClose={onClose} w={620}>
      <SoftModalHead
        icon={ev.icon}
        tone={ev.tone}
        title={ev.label}
        sub={d.page || "/"}
        onClose={onClose}
      />
      <div className="scroll" style={{ padding: "20px 22px", maxHeight: "64vh", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* GSC join — the literal numbers behind the priority signal */}
        <Well pad={0}>
          <div style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--faint)", borderBottom: "1px solid var(--line)" }}>
            GSC organic join
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, background: "var(--line)" }}>
            {[
              ["Organic clicks", expNum(d.gsc_clicks)],
              ["Avg. position", isFinite(Number(d.gsc_position)) ? (Math.round(Number(d.gsc_position) * 10) / 10) : "—"],
              ["Defect rate", expPct(d.defect_rate)],
              ["Clicks exposed", expNum(d.clicks_exposed)],
            ].map(([l, v]) => (
              <div key={l} style={{ background: "var(--bg)", padding: "12px 14px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{v}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 14px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
            “Clicks exposed” = GSC clicks × defect-rate × confidence. A <b>correlational priority signal</b>, not measured lost revenue.
          </div>
        </Well>

        {/* aggregate evidence */}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Aggregate evidence</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Chip tone={conf.tone} size="sm" dot>{conf.label}</Chip>
            <Chip tone="gray" size="sm" icon="trend">{expNum(d.occurrences)} occurrences</Chip>
            <Chip tone="gray" size="sm" icon="globe">{expNum(d.sessions)} sessions sampled</Chip>
            <Chip tone="gray" size="sm" icon="gauge">defect rate {expPct(d.defect_rate)}</Chip>
            {isFinite(Number(d.rice_score)) && <Chip tone="plum" size="sm" icon="layers">RICE {Math.round(Number(d.rice_score))}</Chip>}
          </div>
          {d.sample_detail && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{d.sample_detail}</div>
          )}
        </div>

        {/* the stable selector — in mono, the thing a fix would target */}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Stable selector</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, padding: "11px 13px", borderRadius: "var(--r-md)", background: "var(--bg)", boxShadow: "var(--neo-in)", color: "var(--t-800)", wordBreak: "break-all" }}>
            {d.selector || "—"}
          </div>
        </div>

        {/* suggested fix preview — only for fixable rows */}
        {canApply && (
          <Well style={{ background: "var(--t-50)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="sparkles" size={16} style={{ color: "var(--t-700)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t-800)" }}>Suggested fix preview</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t-800)", lineHeight: 1.55, marginBottom: 12 }}>
              {d.event_type === "tap-target" || d.event_type === "tap_target"
                ? "Enlarge the interactive target to meet the ≥24px (WCAG 2.5.8) / 44px comfortable tap-area on the selector below — applied as a scoped CSS rule, fully reversible."
                : "Repair the broken target on the selector below (corrected href / asset URL). Applied through the safety chain — never a blind write."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {[["DRY_RUN", "eye"], ["write-armed", "lock"], ["read-back", "refresh"], ["ledger", "doc"]].map(([l, ic], i) => (
                <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Chip tone="teal" size="sm" icon={ic}>{l}</Chip>
                  {i < 3 && <Icon name="chevR" size={13} style={{ color: "var(--faint)" }} />}
                </span>
              ))}
            </div>
          </Well>
        )}

        {/* explicit privacy footnote — what we did NOT collect */}
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--r-md)", boxShadow: "var(--neo-in)" }}>
          <Icon name="lock" size={16} style={{ color: "var(--t-700)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            No session replay, no field values, no visitor identity, and no PII were collected to detect this — only aggregate, consented, anonymous interaction counts.
          </span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 22px", borderTop: "1px solid var(--line-soft)", background: "var(--canvas)" }}>
        <NeoButton kind="ghost" size="sm" icon="x" disabled={!!busy} onClick={() => act("ignore")}>
          {busy === "ignore" && <Icon name="cog" size={14} className="audit-spin" />}Ignore
        </NeoButton>
        <div style={{ display: "flex", gap: 10 }}>
          <NeoButton kind="soft" disabled={!!busy} onClick={onClose}>Close</NeoButton>
          {canApply ? (
            <NeoButton kind="primary" icon={busy === "apply" ? undefined : "check"} disabled={!!busy} onClick={() => act("apply")}>
              {busy === "apply" && <Icon name="cog" size={16} className="audit-spin" />}Apply fix
            </NeoButton>
          ) : (
            <NeoButton kind="primary" icon={busy === "propose" ? undefined : "sparkles"} disabled={!!busy} onClick={() => act("propose")}>
              {busy === "propose" && <Icon name="cog" size={16} className="audit-spin" />}Send to review
            </NeoButton>
          )}
        </div>
      </div>
    </SoftModal>
  );
}

/* ===================== one defect row ===================== */
function ExpDefectRow({ d, ctx, onOpen, onAction }) {
  const ev = expEventMeta(d.event_type);
  const conf = expConfMeta(d.confidence);
  const canApply = expCanApply(d);
  const [busy, setBusy] = useState(false);
  const quickApply = (e) => {
    e.stopPropagation();
    setBusy(true);
    Promise.resolve(onAction && onAction(d, canApply ? "apply" : "propose")).finally(() => setBusy(false));
  };
  const pos = Number(d.gsc_position);
  return (
    <div className="row-link" onClick={() => onOpen(d)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 15px", borderRadius: "var(--r-md)", background: "var(--bg)", boxShadow: "var(--neo-in)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: TT[ev.tone][1], color: TT[ev.tone][0], display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={ev.icon} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.page || "/"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <span>{expNum(d.gsc_clicks)} GSC clicks</span>
          <span>·</span>
          <span>pos {isFinite(pos) ? (Math.round(pos * 10) / 10) : "—"}</span>
          <span>·</span>
          <span style={{ fontFamily: "var(--mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{d.selector || "—"}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: 70 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t-700)" }}>{expNum(d.clicks_exposed)}</div>
        <div style={{ fontSize: 10, color: "var(--faint)" }}>exposed</div>
      </div>
      <Chip tone={conf.tone} size="sm" dot>{String(d.confidence || "low")}</Chip>
      {canApply ? (
        <NeoButton kind="primary" size="sm" icon={busy ? undefined : "check"} disabled={busy} onClick={quickApply}>
          {busy && <Icon name="cog" size={14} className="audit-spin" />}Apply
        </NeoButton>
      ) : (
        <NeoButton kind="soft" size="sm" icon="eye" disabled={busy} onClick={(e) => { e.stopPropagation(); onOpen(d); }}>Review</NeoButton>
      )}
    </div>
  );
}

/* ===================== main screen ===================== */
function ExperienceScreen({ ctx }) {
  const s = (ctx && ctx.site) || {};
  const API = window.SentinelAPI;

  const [status, setStatus] = useState(null);     // { armed, signedOff, hasKey, eventCount }
  const [statusErr, setStatusErr] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [data, setData] = useState(null);          // { defects, totals }
  const [dataErr, setDataErr] = useState(null);
  const [loadingDefects, setLoadingDefects] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sampling, setSampling] = useState(5);     // 2 / 5 / 10  (%)
  const [drill, setDrill] = useState(null);

  const toast = (m, t) => ctx && ctx.toast && ctx.toast(m, t);

  /* ---- load beacon status on mount + site change ---- */
  const loadStatus = useCallback(() => {
    if (!API || !API.beaconStatus) { setStatusErr("Experience monitor API is unavailable."); return; }
    setLoadingStatus(true); setStatusErr(null);
    Promise.resolve(API.beaconStatus(s.id))
      .then((r) => { setStatus(r || {}); })
      .catch((e) => setStatusErr((e && e.message) || "Couldn't load beacon status."))
      .finally(() => setLoadingStatus(false));
  }, [API, s.id]);

  /* ---- load defects when armed ---- */
  const loadDefects = useCallback(() => {
    if (!API || !API.uxDefects) return;
    setLoadingDefects(true); setDataErr(null);
    Promise.resolve(API.uxDefects(s.id, {}))
      .then((r) => { if (r && r.error) { setDataErr(r.error); setData(null); } else { setData(r || { defects: [], totals: {} }); } })
      .catch((e) => setDataErr((e && e.message) || "Couldn't load defects."))
      .finally(() => setLoadingDefects(false));
  }, [API, s.id]);

  useEffect(() => {
    setStatus(null); setData(null); setDataErr(null); setStatusErr(null); setDrill(null);
    loadStatus();
  }, [s.id]); // re-run on mount + site change

  useEffect(() => {
    if (status && status.armed) loadDefects();
  }, [status && status.armed, s.id]);

  /* ---- install / arm the beacon (gated on compliance sign-off) ---- */
  const installBeacon = () => {
    if (!API || !API.armBeacon) { toast("Experience monitor API is unavailable.", "clay"); return; }
    // Don't even attempt if we already know the site isn't signed off.
    if (status && status.signedOff === false) {
      toast("Complete the compliance sign-off for this site first (see EXPERIENCE-MONITOR-PLAN.md §5)", "gold");
      return;
    }
    setInstalling(true);
    Promise.resolve(API.armBeacon(s.id, true))
      .then((r) => {
        r = r || {};
        if (r.reason === "not-signed-off" || r.signedOff === false || r.armed === false) {
          toast("Complete the compliance sign-off for this site first (see EXPERIENCE-MONITOR-PLAN.md §5)", "gold");
          // keep whatever the server told us so the UI reflects reality
          setStatus((st) => Object.assign({}, st, r));
          return;
        }
        setStatus((st) => Object.assign({}, st || {}, { armed: true }, r));
        toast("Beacon installed — collecting consented, aggregate interaction data", "teal");
      })
      .catch((e) => toast((e && e.message) || "Couldn't install the beacon.", "clay"))
      .finally(() => setInstalling(false));
  };

  /* ---- kill switch: toggle beacon OFF/ON from the header ---- */
  const toggleBeacon = (on) => {
    if (!API || !API.armBeacon) { toast("Experience monitor API is unavailable.", "clay"); return; }
    setToggling(true);
    Promise.resolve(API.armBeacon(s.id, on))
      .then((r) => {
        r = r || {};
        if (on && (r.reason === "not-signed-off" || r.signedOff === false || r.armed === false)) {
          toast("Complete the compliance sign-off for this site first (see EXPERIENCE-MONITOR-PLAN.md §5)", "gold");
          setStatus((st) => Object.assign({}, st, r));
          return;
        }
        setStatus((st) => Object.assign({}, st || {}, { armed: on }, r));
        toast(on ? "Beacon armed" : "Beacon disabled — collection stopped", on ? "teal" : "gold");
        if (!on) { setData(null); setDrill(null); }
      })
      .catch((e) => toast((e && e.message) || "Couldn't change beacon state.", "clay"))
      .finally(() => setToggling(false));
  };

  /* ---- row / modal actions ---- */
  const doAction = (d, action) => {
    if (!API || !API.uxDefectAction || !d) return Promise.resolve();
    return Promise.resolve(API.uxDefectAction(d.id, action, s.id))
      .then((r) => {
        r = r || {};
        if (r.error) { toast(r.error, "clay"); return; }
        if (action === "apply") toast("Fix applied through the safety chain ✓", "teal");
        else if (action === "propose") toast("Sent to the review queue", "teal");
        else if (action === "ignore") toast("Defect ignored — it won't be re-surfaced", "gold");
        setDrill(null);
        loadDefects();
      })
      .catch((e) => toast((e && e.message) || "Action failed.", "clay"));
  };

  const armed = !!(status && status.armed);
  const defects = (data && Array.isArray(data.defects)) ? data.defects : [];
  const totals = (data && data.totals) || {};

  /* directional sum of exposed clicks across all defects */
  const exposedSum = defects.reduce((a, d) => a + (Number(d && d.clicks_exposed) || 0), 0);
  const totalExposed = isFinite(Number(totals.clicks_exposed)) ? Number(totals.clicks_exposed) : exposedSum;

  /* experience-health = inverse of weighted defect pressure (defensive, clamped 0–100) */
  const avgDefectRate = defects.length
    ? defects.reduce((a, d) => { const r = Number(d && d.defect_rate) || 0; return a + (r <= 1 ? r : r / 100); }, 0) / defects.length
    : 0;
  const health = Math.max(0, Math.min(100, Math.round(
    isFinite(Number(totals.health)) ? Number(totals.health) : (100 - avgDefectRate * 100)
  )));
  const defectRatePct = Math.max(0, Math.min(100, Math.round(
    (isFinite(Number(totals.defect_rate)) ? (Number(totals.defect_rate) <= 1 ? Number(totals.defect_rate) * 100 : Number(totals.defect_rate)) : avgDefectRate * 100)
  )));

  /* group defects by event_type for the worklist */
  const groups = {};
  for (const d of defects) {
    const k = (d && d.event_type) || "other";
    (groups[k] = groups[k] || []).push(d);
  }
  const groupKeys = Object.keys(groups).sort((a, b) => {
    // surface highest aggregate exposed-clicks group first
    const sum = (arr) => arr.reduce((x, d) => x + (Number(d.clicks_exposed) || 0), 0);
    return sum(groups[b]) - sum(groups[a]);
  });

  /* ============ RENDER ============ */
  return (
    <div className="rise">
      <PageHead
        title="Experience Monitor"
        sub={`Find UX & conversion defects on ${s.name || "your"} ranking pages, joined to GSC organic traffic.`}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* kill switch — always present once we know the status */}
          {status && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", borderRadius: "var(--r-pill)", background: "var(--bg)", boxShadow: "var(--neo-in)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: armed ? "var(--t-700)" : "var(--muted)" }}>
                Beacon: {armed ? "ON" : "OFF"}
              </span>
              <Toggle on={armed} disabled={toggling} onChange={(v) => toggleBeacon(v)} size={42} />
            </div>
          )}
          {armed && <NeoButton kind="soft" icon={loadingDefects ? undefined : "refresh"} disabled={loadingDefects} onClick={loadDefects}>{loadingDefects && <Icon name="cog" size={15} className="audit-spin" />}Refresh</NeoButton>}
        </div>
      </PageHead>

      {/* status load error */}
      {statusErr && (
        <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "var(--clay-bg)", borderRadius: "var(--r-md)", boxShadow: "var(--neo-xs)", alignItems: "flex-start", marginBottom: 18 }}>
          <Icon name="alert" size={18} style={{ color: "var(--clay)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#8A4231" }}>Couldn't load the beacon</div>
            <div style={{ fontSize: 12.5, color: "#8A4231", marginTop: 2, lineHeight: 1.5 }}>{statusErr}</div>
          </div>
          <NeoButton kind="soft" size="sm" icon="refresh" onClick={loadStatus}>Retry</NeoButton>
        </div>
      )}

      {/* loading status */}
      {loadingStatus && !status && (
        <SoftCard hover={false}>
          <div style={{ padding: "14px 4px", color: "var(--muted)", fontSize: 14, display: "flex", alignItems: "center", gap: 11 }}>
            <Icon name="cog" size={18} className="audit-spin" />Checking beacon status…
          </div>
        </SoftCard>
      )}

      {/* ===== ONBOARDING (beacon OFF — the default) ===== */}
      {status && !armed && !statusErr && (
        <SoftCard hover={false} style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "20px 12px 6px" }}>
            <div style={{ width: 56, height: 56, borderRadius: 17, background: "var(--t-50)", color: "var(--t-700)", display: "grid", placeItems: "center" }}>
              <Icon name="gauge" size={28} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Find UX & conversion defects on your ranking pages</div>
            <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, maxWidth: 520 }}>
              A privacy-first beacon detects broken CTAs, dead links, mis-sized tap targets and friction on the pages that
              actually earn organic clicks — joined to Google Search Console so you fix what costs you the most exposure first.
            </div>
          </div>

          {/* privacy guarantees — gold well */}
          <Well style={{ background: "var(--gold-bg)", margin: "18px 0 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="shield" size={17} style={{ color: "var(--gold)" }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#7E5A14" }}>Privacy guarantees</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXP_PRIVACY.map((g) => (
                <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#7E5A14", padding: "6px 11px", borderRadius: "var(--r-pill)", background: "var(--surface)", boxShadow: "var(--neo-xs)" }}>
                  <Icon name="check" size={13} sw={2.6} style={{ color: "var(--t-600)" }} />{g}
                </span>
              ))}
            </div>
          </Well>

          {/* compliance gate notice */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Chip tone={status.signedOff ? "teal" : "gold"} icon={status.signedOff ? "check" : "lock"}>
              {status.signedOff ? "Compliance signed off ✓" : "Compliance: review & sign off before enabling"}
            </Chip>
          </div>

          {/* sampling segmented control */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>Sampling rate</div>
            <div style={{ display: "flex", gap: 3, padding: 3, background: "var(--bg)", borderRadius: "var(--r-pill)", boxShadow: "var(--neo-in)" }}>
              {[2, 5, 10].map((r) => (
                <button key={r} onClick={() => setSampling(r)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 99, border: "none", cursor: "pointer", background: sampling === r ? "var(--surface)" : "transparent", color: sampling === r ? "var(--t-700)" : "var(--muted)", boxShadow: sampling === r ? "var(--neo-sm)" : "none" }}>
                  {r}%
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Lower sampling = lighter footprint. {sampling}% of consented sessions are observed.</div>
          </div>

          {/* primary install + Clarity complement */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <NeoButton kind="primary" size="lg" icon={installing ? undefined : "bolt"} disabled={installing || loadingStatus} onClick={installBeacon}>
              {installing && <Icon name="cog" size={18} className="audit-spin" />}Install beacon
            </NeoButton>
            <a
              href="https://clarity.microsoft.com/"
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--t-700)", textDecoration: "none" }}
            >
              <Icon name="eye" size={14} />Open in Microsoft Clarity ↗
            </a>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>A complementary qualitative view — our beacon is the quantitative, GSC-joined signal.</span>
          </div>
        </SoftCard>
      )}

      {/* ===== ARMED — defects load error ===== */}
      {armed && dataErr && !loadingDefects && (
        <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "var(--clay-bg)", borderRadius: "var(--r-md)", boxShadow: "var(--neo-xs)", alignItems: "flex-start" }}>
          <Icon name="alert" size={18} style={{ color: "var(--clay)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#8A4231" }}>Couldn't load defects</div>
            <div style={{ fontSize: 12.5, color: "#8A4231", marginTop: 2, lineHeight: 1.5 }}>{dataErr}</div>
          </div>
          <NeoButton kind="soft" size="sm" icon="refresh" onClick={loadDefects}>Retry</NeoButton>
        </div>
      )}

      {/* ===== ARMED — loading ===== */}
      {armed && loadingDefects && !data && (
        <SoftCard hover={false}>
          <div style={{ padding: "14px 4px", color: "var(--muted)", fontSize: 14, display: "flex", alignItems: "center", gap: 11 }}>
            <Icon name="cog" size={18} className="audit-spin" />Loading experience defects…
          </div>
        </SoftCard>
      )}

      {/* ===== ARMED — empty (collecting) ===== */}
      {armed && data && !dataErr && defects.length === 0 && (
        <SoftCard hover={false}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 10px", textAlign: "center" }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, background: "var(--t-50)", color: "var(--t-700)", display: "grid", placeItems: "center" }}>
              <Icon name="check" size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Beacon armed — no defects detected yet</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 440 }}>
              We're collecting consented, aggregate interaction data from {sampling}% of sessions. Defects on your
              ranking pages will appear here as enough signal accumulates.
            </div>
            <Chip tone="teal" size="sm" icon="globe">{expNum(status && status.eventCount)} events collected</Chip>
          </div>
        </SoftCard>
      )}

      {/* ===== ARMED — has defects ===== */}
      {armed && data && !dataErr && defects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* hero row */}
          <div className="drow drow--1">
            {/* (1) organic clicks exposed — dark card, directional */}
            <SoftCard tone="dark">
              <SectionHead light sub="GSC organic clicks on pages with detected defects">Organic clicks exposed</SectionHead>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: "#F3EFE4" }}>{expNum(totalExposed)}</span>
                <Chip tone="gold" size="sm" solid>directional</Chip>
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(243,239,228,.6)", marginTop: 10, lineHeight: 1.5 }}>
                A priority signal — not measured lost revenue. See the methodology note below.
              </div>
            </SoftCard>

            {/* (2) experience health gauge */}
            <SoftCard style={{ alignItems: "center", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Experience health</h3>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>Inverse of weighted defect pressure</div>
              <Gauge value={health} size={150} sw={16} label="health" />
            </SoftCard>

            {/* (3) defect-rate ring + chip */}
            <SoftCard style={{ alignItems: "center", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Defect rate</h3>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Sessions hitting a defect</div>
              <Ring value={defectRatePct} size={104} sw={11} />
              <Chip tone={defectRatePct >= 20 ? "clay" : defectRatePct >= 8 ? "gold" : "teal"} size="sm" dot style={{ marginTop: 12 }}>
                {defects.length} defect{defects.length === 1 ? "" : "s"} across {Object.keys(groups).length} type{Object.keys(groups).length === 1 ? "" : "s"}
              </Chip>
            </SoftCard>
          </div>

          {/* methodology caption */}
          <div style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.55, padding: "0 2px" }}>
            Sampled · “exposed” = GSC clicks × defect-rate × confidence — a correlational priority signal, not measured lost revenue.
          </div>

          {/* worklist grouped by event_type */}
          {groupKeys.map((k) => {
            const ev = expEventMeta(k);
            const rows = groups[k].slice().sort((a, b) => (Number(b.clicks_exposed) || 0) - (Number(a.clicks_exposed) || 0));
            const groupExposed = rows.reduce((a, d) => a + (Number(d.clicks_exposed) || 0), 0);
            return (
              <SoftCard hover={false} key={k}>
                <SectionHead
                  sub={`${rows.length} affected page${rows.length === 1 ? "" : "s"} · ${expNum(groupExposed)} organic clicks exposed`}
                  right={<Chip tone={ev.tone} size="sm" icon={ev.icon}>{ev.label}</Chip>}
                >
                  {ev.label}
                </SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rows.map((d, i) => (
                    <ExpDefectRow key={d.id || (k + ":" + i)} d={d} ctx={ctx} onOpen={setDrill} onAction={doAction} />
                  ))}
                </div>
              </SoftCard>
            );
          })}

          {/* global privacy footnote */}
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--r-md)", boxShadow: "var(--neo-in)" }}>
            <Icon name="lock" size={16} style={{ color: "var(--t-700)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              No session replay, no field values, and no visitor identity are ever collected — only consented, aggregate, anonymous interaction counts with ≤72h raw retention.
            </span>
          </div>
        </div>
      )}

      {/* drill-down modal */}
      {drill && <ExpDefectModal d={drill} ctx={ctx} onClose={() => setDrill(null)} onAction={doAction} />}
    </div>
  );
}

Object.assign(window, { ExperienceScreen });
