/* ===========================================================================
   Sentinel — API client (browser)
   Talks to Supabase REST (data/auth) and the local engine API (agent ops).
   Exposes window.SentinelAPI. No build step — plain fetch, loaded via Babel.

   Design is untouched: this layer only feeds data to / runs actions for the
   existing components. If anything is unreachable, callers fall back to mocks.
   =========================================================================== */
(function () {
  const CFG = window.SENTINEL_CONFIG || {};
  const SB = CFG.supabaseUrl;
  const ANON = CFG.supabaseAnonKey;
  const ENGINE = CFG.engineApi;

  // ---- auth token (anon by default; real user token after sign-in) ----------
  let authToken = ANON;
  try {
    const saved = localStorage.getItem("sentinel-token");
    if (saved) authToken = saved;
  } catch (e) {}

  function sbHeaders(extra) {
    return Object.assign({
      "apikey": ANON,
      "Authorization": "Bearer " + authToken,
      "Content-Type": "application/json",
    }, extra || {});
  }

  // ---- Supabase REST helpers ------------------------------------------------
  async function sbSelect(table, query) {
    const url = SB + "/rest/v1/" + table + (query ? "?" + query : "");
    const res = await fetch(url, { headers: sbHeaders() });
    if (!res.ok) throw new Error("supabase select " + table + " → " + res.status);
    return res.json();
  }
  async function sbInsert(table, row) {
    const res = await fetch(SB + "/rest/v1/" + table, {
      method: "POST",
      headers: sbHeaders({ "Prefer": "return=representation" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error("supabase insert " + table + " → " + res.status);
    return res.json();
  }
  async function sbUpdate(table, id, patch) {
    const res = await fetch(SB + "/rest/v1/" + table + "?id=eq." + id, {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=representation" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("supabase update " + table + " → " + res.status);
    return res.json();
  }

  // ---- engine API helper ----------------------------------------------------
  async function engine(path, body) {
    let res;
    try {
      res = await fetch(ENGINE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new Error("Can't reach the server — check your connection and try again.");
    }
    // Read as text first so a non-JSON body (a gateway/proxy HTML error page returned
    // while the service is busy/restarting/timing out) doesn't blow up as a raw
    // "Unexpected token '<'" JSON-parse error — show a clean, actionable message instead.
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = null; }
    if (data === null) {
      if (res.status === 504 || res.status === 524) throw new Error("That request took too long and timed out — please try again in a moment.");
      if (res.status === 502 || res.status === 503) throw new Error("The service is busy or restarting — please try again in a moment.");
      throw new Error("Unexpected response from the server (" + res.status + ") — please try again.");
    }
    if (!res.ok) throw new Error(data.error || ("engine " + path + " → " + res.status));
    return data;
  }

  // ---- reachability ---------------------------------------------------------
  async function ping() {
    try {
      const res = await fetch(ENGINE + "/health");
      return res.ok;
    } catch (e) { return false; }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================
  window.SentinelAPI = {
    cfg: CFG,
    ping,
    setToken(t) { authToken = t || ANON; try { localStorage.setItem("sentinel-token", t || ""); } catch (e) {} },

    // ---- sites ----
    async listSites() { return sbSelect("sites", "select=*&order=created_at.asc"); },
    async createSite(row) { return (await sbInsert("sites", row))[0]; },
    async updateSite(id, patch) { return (await sbUpdate("sites", id, patch))[0]; },
    // Re-run stack + mu-plugin detection for a site and persist the fresh result.
    siteRedetect(siteId) { return engine("/site-redetect", { siteId }); },

    // ---- engine operations ----
    // Secure connect: validate + detect + encrypt-store in one server call.
    siteConnect(creds, opts) { return engine("/site-connect", Object.assign({ creds }, opts || {})); },
    generateContent(task, input, finding, siteId) { return engine("/generate-content", { task, input, finding, siteId }); },
    contentIntel(siteId, niche) { return engine("/content-intel", { siteId, niche }); },
    contentOpportunities(siteId, opts) { return engine("/content-opportunities", Object.assign({ siteId }, opts || {})); },
    contentBrief(siteId, keyword, intent) { return engine("/content-brief", { siteId, keyword, intent }); },
    // Content Engine — one unified, de-duped, scored worklist from every content source
    // (keywords, trending, People Also Ask, AI-visibility). HEAVY/slow route (~20-60s).
    // notProvisioned until supabase/content-engine.sql is run.
    engineRun(siteId, opts) { return engine("/engine-run", Object.assign({ siteId }, opts || {})); },
    engineRunStatus(siteId) { return engine("/engine-run-status", { siteId }); },
    engineWorklist(siteId, opts) { return engine("/engine-worklist", Object.assign({ siteId }, opts || {})); },
    engineSetStatus(id, status) { return engine("/engine-set-status", { id, status }); },
    engineDismiss(id) { return engine("/engine-dismiss", { id }); },
    // ---- n8n control panel — base URL + API key are held in the browser
    // (localStorage) and sent per request; the server proxies + never stores them.
    n8nConnect(baseUrl, apiKey) { return engine("/n8n-connect", { baseUrl, apiKey }); },
    n8nStatus() { return engine("/n8n-status", {}); },
    n8nDisconnect() { return engine("/n8n-disconnect", {}); },
    n8nWorkflows(baseUrl, apiKey) { return engine("/n8n-workflows", { baseUrl, apiKey }); },
    n8nWorkflowPrompts(baseUrl, apiKey, id) { return engine("/n8n-workflow-prompts", { baseUrl, apiKey, id }); },
    n8nUpdatePrompts(baseUrl, apiKey, id, edits) { return engine("/n8n-update-prompts", { baseUrl, apiKey, id, edits }); },
    n8nRun(baseUrl, apiKey, id, payload) { return engine("/n8n-run", { baseUrl, apiKey, id, payload }); },
    n8nExecutions(baseUrl, apiKey, id, status) { return engine("/n8n-executions", { baseUrl, apiKey, id, status }); },
    // Auto-draft: push the top-N scored opportunities into the existing Airtable Article Writer
    // (n8n watches it → drafts + publishes → back in Approve Changes). Flips those rows → queued.
    engineAutodraft(siteId, opts) { return engine("/engine-autodraft", Object.assign({ siteId }, opts || {})); },
    // Inverse of auto-draft: read n8n-completed rows from the Article Writer, advance the matching
    // queued/in_review opportunities → published, and capture a drift baseline per published URL.
    engineSyncPublished(siteId) { return engine("/engine-sync-published", { siteId }); },
    trendingIntel(siteId, niche, db) { return engine("/trending-intel", { siteId, niche, db }); },
    peopleAlsoAsk(siteId, keyword, depth) { return engine("/people-also-ask", { siteId, keyword, depth }); },
    // Same route with push:true → sends each PAA question to the Airtable Article Writer; returns { ..., airtable }.
    peopleAlsoAskPush(siteId, keyword, depth) { return engine("/people-also-ask", { siteId, keyword, depth, push: true }); },
    researchStatus() { return engine("/research-status", {}); },
    adminStatus(siteId) { return engine("/admin-status", { siteId }); },
    promptsList(siteId) { return engine("/prompts-list", { siteId }); },
    promptSave(key, content, model, temperature, siteId) { return engine("/prompt-save", { key, content, model, temperature, siteId }); },
    promptReset(key, siteId) { return engine("/prompt-reset", { key, siteId }); },
    promptHistory(key) { return engine("/prompt-history", { key }); },
    promptTest(key, content, model, temperature, siteId) { return engine("/prompt-test", { key, content, model, temperature, siteId }); },
    geoPrompts(siteId, siteName, niche, sampleTitles, exclude) { return engine("/geo-prompts", { siteId, siteName, niche, sampleTitles, exclude }); },
    geoTrack(siteId, targetDomain, prompts, competitors) { return engine("/geo-track", { siteId, targetDomain, prompts, competitors }); },
    geoEnable(siteId, opts) { return engine("/geo-enable", Object.assign({ siteId }, opts || {})); },
    geoHistory(siteId) { return engine("/geo-history", { siteId }); },
    // AI-citation share-of-voice over time. notProvisioned until supabase/citation-snapshots.sql is run.
    geoCitationTrend(siteId) { return engine("/geo-citation-trend", { siteId }); },
    // Experience Monitor (UX/conversion defects) — inert until RUM_ENABLED + site armed.
    beaconStatus(siteId) { return engine("/beacon-status", { siteId }); },
    uxDefects(siteId, opts) { return engine("/ux-defects", Object.assign({ siteId }, opts || {})); },
    uxDefectAction(id, action, siteId) { return engine("/ux-defect-action", { id, action, siteId }); },
    armBeacon(siteId, on, sample, consent) { return engine("/arm-beacon", { siteId, on, sample, consent }); },
    siteProbe(siteId) { return engine("/site-probe", siteId ? { siteId } : {}); },
    signOffCompliance(siteId, on, confirm) { return engine("/sign-off-compliance", { siteId, on, confirm }); },
    beaconSelftest(siteId) { return engine("/beacon-selftest", { siteId }); },
    setConsentBanner(siteId, opts) { return engine("/set-consent-banner", Object.assign({ siteId }, opts || {})); },
    pushMuUpdate(siteId) { return engine("/push-mu-update", { siteId }); },
    semrushSnapshot(siteId, domain, db) { return engine("/semrush-snapshot", { siteId, domain, db }); },
    semrushKeywordGap(target, competitor, db, siteId) { return engine("/semrush-keyword-gap", { target, competitor, db, siteId }); },
    semrushStriking(domain, db) { return engine("/semrush-striking", { domain, db }); },
    semrushUnits() { return engine("/semrush-units", {}); },
    trafficValue(siteId, keywords, db) { return engine("/traffic-value", { siteId, keywords, db: db || "uk" }); },
    saveSiteCompetitors(siteId, competitors, negativeKeywords) { return engine("/site-competitors", { siteId, competitors, negativeKeywords }); },
    siteDatabase(siteId, db) { return engine("/site-database", { siteId, db }); },
    chat(opts) { return engine("/chat", opts); },
    chatList(siteId) { return engine("/chat-list", { siteId }); },
    chatLoad(conversationId) { return engine("/chat-load", { conversationId }); },
    chatDelete(conversationId) { return engine("/chat-delete", { conversationId }); },
    chatRename(conversationId, title) { return engine("/chat-rename", { conversationId, title }); },
    chatUploadImage(siteId, dataUrl) { return engine("/chat-upload-image", { siteId, dataUrl }); },
    // Google Search Console
    gscConnect(siteId, serviceAccount) { return engine("/gsc-connect", { siteId, serviceAccount }); },
    gscSetProperty(siteId, property) { return engine("/gsc-set-property", { siteId, property }); },
    gscStatus(siteId) { return engine("/gsc-status", { siteId }); },
    // One-click OAuth ("Connect with Google")
    gscOAuthConfig() { return engine("/gsc-oauth-config", {}); },
    gscOAuthStartUrl(siteId) { return (ENGINE || "") + "/gsc-oauth-start?siteId=" + encodeURIComponent(siteId); },
    gscProperties(siteId) { return engine("/gsc-properties", { siteId }); },
    gscDisconnect(siteId) { return engine("/gsc-disconnect", { siteId }); },
    gscSnapshot(siteId, days) { return engine("/gsc-snapshot", { siteId, days }); },
    gscAnomalies(siteId, days) { return engine("/gsc-anomalies", { siteId, days: days || 90 }); },
    gscSubmitUrls(siteId, urls) { return engine("/gsc-submit-urls", { siteId, urls }); },
    gscIndexHealth(siteId) { return engine("/gsc-index-health", { siteId }); },
    gscRankingDrops(siteId) { return engine("/gsc-ranking-drops", { siteId }); },
    // AEO / answer-engine optimisation (snippet-steal + answer blocks + readiness scoring)
    gscSnippetSteal(siteId) { return engine("/gsc-snippet-steal", { siteId }); },
    aeoAnswerBlock(siteId, url, query, format) { return engine("/aeo-answer-block", { siteId, url, query, format }); },
    // Build the JSON-LD @graph for a generated answer block (preview) and apply it live (write-armed gated server-side).
    aeoBlockSchema(siteId, url, block) { return engine("/aeo-block-schema", { siteId, url, block }); },
    aeoApplyBlockSchema(siteId, url, block) { return engine("/aeo-apply-block-schema", { siteId, url, block }); },
    // Local Pack / Local SEO — LocalBusiness (LegalService) JSON-LD + Google-local readiness scoring.
    // localSchema: build the [WebPage, LegalService] @graph from the site's NAP (geo_context/homepage) → { graph, validation, nap }.
    // localReadiness: fetch a live page and score it 0-100 against the 6 local checks → { score, checks:[{id,label,ok}], nap }.
    // applyLocalSchema: publish the LocalBusiness schema live via the existing /apply-schema writer (write-armed gated server-side; force overrides).
    localSchema(siteId, areaServed) { return engine("/local-schema", { siteId, areaServed }); },
    localReadiness(siteId, url) { return engine("/local-readiness", { siteId, url }); },
    applyLocalSchema(siteId, opts) { return engine("/apply-local-schema", Object.assign({ siteId }, opts || {})); },
    // Drift — diff a live page against its stored baseline (SEO/meta/structure regressions).
    // notProvisioned until supabase/drift-baselines.sql is run; updateBaseline=true (re)captures.
    driftCheck(siteId, url, updateBaseline) { return engine("/drift-check", { siteId, url, updateBaseline: !!updateBaseline }); },
    driftSnapshot(url) { return engine("/drift-snapshot", { url }); },
    // IndexNow — instant-index ping. Get a deterministic key + publish instruction, then submit URLs.
    indexnowKey(siteId, seed) { return engine("/indexnow-key", { siteId, seed }); },
    indexnowSubmit(siteId, key, urls) { return engine("/indexnow-submit", { siteId, key, urls }); },
    // De-AI a draft/block of text — strips robotic tells, returns { out, changes, changed }.
    contentHumanize(text) { return engine("/content-humanize", { text }); },
    contentScore(html, url) { return engine("/content-score", { html, url }); },
    validateSchema(schema) { return engine("/validate-schema", { schema }); },
    auditAnomalies(history) { return engine("/audit-anomalies", { history }); },
    correlation(siteId, days) { return engine("/correlation", { siteId, days: days || 90 }); },
    execScorecard(siteId) { return engine("/exec-scorecard", { siteId }); },
    execNarrative(metrics) { return engine("/exec-narrative", { metrics }); },
    internalLinks(siteId, opts) { return engine("/internal-links", Object.assign({ siteId }, opts || {})); },
    externalLinks(siteId, targetUrl) { return engine("/external-links", { siteId, targetUrl }); },
    // Durable background jobs
    jobRun(type, payload, siteId) { return engine("/jobs/run", { type, payload, siteId }); },
    jobGet(id) { return engine("/jobs/get", { id }); },
    jobList(siteId, limit) { return engine("/jobs/list", { siteId, limit }); },
    // Enqueue a job and poll until it finishes (or inline-completes). onTick(job) optional.
    async runJob(type, payload, siteId, onTick) {
      const j = await this.jobRun(type, payload, siteId);
      if (!j || j.error) return j;
      if (j.inline || j.status === "done" || j.status === "failed") return j; // ran inline (no jobs table)
      let id = j.id, tries = 0;
      while (tries++ < 150) {
        await new Promise(r => setTimeout(r, 2000));
        const cur = await this.jobGet(id).catch(() => null);
        if (!cur || cur.error) continue;
        if (onTick) try { onTick(cur); } catch (e) {}
        if (cur.status === "done" || cur.status === "failed") return cur;
      }
      return { id, status: "timeout", error: "Still running — check back shortly." };
    },
    applyLink(siteId, sourcePage, anchor, targetUrl, sourceId, sourceType) { return engine("/apply-link", { siteId, sourcePage, anchor, targetUrl, sourceId, sourceType }); },
    generateSchema(siteId, page, schemaConfig, faqs) { return engine("/generate-schema", { siteId, page, schemaConfig, faqs }); },
    // Live "apply" layer (needs the seo-agent-optimize mu-plugin)
    optimizeStatus(siteId) { return engine("/optimize-status", { siteId }); },
    siteHealth(siteId, url) { return engine("/site-health", { siteId, url }); },
    installWebpPlugin(siteId) { return engine("/install-webp-plugin", { siteId }); },
    applySchema(siteId, opts) { return engine("/apply-schema", Object.assign({ siteId }, opts || {})); },
    applyEntitySignals(siteId, opts) { return engine("/apply-entity-signals", Object.assign({ siteId }, opts || {})); },
    applyCss(siteId, css) { return engine("/apply-css", { siteId, css }); },
    aiSeoFacts(siteId, url, title) { return engine("/ai-seo-facts", { siteId, url, title }); },
    generateCss(siteId, findings) { return engine("/generate-css", { siteId, findings }); },
    mediaScan(siteId) { return engine("/media-scan", { siteId }); },
    mediaOptimize(siteId, opts) { return engine("/media-optimize", Object.assign({ siteId }, opts || {})); },
    speedTest(url, strategy) { return engine("/speed-test", { url, strategy }); },
    contentDecay(siteId, windowDays) { return engine("/content-decay", { siteId, windowDays }); },
    contentDecayBrief(page) { return engine("/content-decay-brief", { page }); },
    contentRefresh(siteId, page, apply) { return engine("/content-refresh", { siteId, page, apply: !!apply }); },
    contentRefreshUndo(siteId, page) { return engine("/content-refresh-undo", { siteId, page }); },
    contentRewrite(siteId, page, opts) { return engine("/content-rewrite", Object.assign({ siteId, page }, opts || {})); },
    refreshBlocksPurge(siteId) { return engine("/refresh-blocks-purge", { siteId }); },
    pageOptimizeImages(siteId, page, apply) { return engine("/page-optimize-images", { siteId, page, apply: !!apply }); },
    async listGeoRuns(siteId) { return sbSelect("geo_runs", "site_id=eq." + siteId + "&select=*&order=created_at.desc&limit=20"); },
    // Per-site setup completeness (site-switcher badge)
    sitesSetup() { return engine("/sites-setup", {}); },
    // Airtable
    airtableConnect(siteId, pat) { return engine("/airtable-connect", { siteId, pat }); },
    airtableBases(siteId) { return engine("/airtable-bases", { siteId }); },
    airtableTables(siteId, baseId) { return engine("/airtable-tables", { siteId, baseId }); },
    airtableConfig(siteId, opts) { return engine("/airtable-config", Object.assign({ siteId }, opts || {})); },
    airtableStatus(siteId) { return engine("/airtable-status", { siteId }); },
    airtablePushKeywords(siteId, keywords) { return engine("/airtable-push-keywords", { siteId, keywords }); },
    // Embedded editable grid
    airtableRecords(siteId, opts) { return engine("/airtable-records", Object.assign({ siteId }, opts || {})); },
    airtableUpdateRecord(siteId, recordId, fields, table) { return engine("/airtable-update-record", { siteId, recordId, fields, table }); },
    airtableCreateRecord(siteId, fields, table) { return engine("/airtable-create-record", { siteId, fields, table }); },
    airtableSync(siteId, opts) { return engine("/airtable-sync", Object.assign({ siteId }, opts || {})); },
    async listAirtableLog(siteId) { return sbSelect("airtable_sync_log", "site_id=eq." + siteId + "&select=*&order=created_at.desc&limit=15"); },
    connect(creds) { return engine("/connect", { creds }); },
    detect(creds) { return engine("/detect", { creds }); },
    crawl(creds, orphans) { return engine("/crawl", { creds, orphans }); },
    auditFull(url, creds, withContent) { return engine("/audit-full", { url, creds, withContent: !!withContent }); },
    proposeFix(finding) { return engine("/propose-fix", { finding }); },
    psi(urls, strategy) { return engine("/psi", { urls, strategy }); },
    psiMedian(urls, strategy, n) { return engine("/psi-median", { urls, strategy, n: n || 3 }); },
    psiDetail(url, categories, strategy) { return engine("/psi-detail", { url, categories, strategy }); },
    seoRead(url) { return engine("/seo-read", { url }); },
    prioritize(results, traffic) { return engine("/prioritize", { results, traffic }); },
    prioritizeFindings(siteId, findings) { return engine("/prioritize-findings", { siteId, findings }); },
    // siteId-based (secure): server decrypts the stored secret. dryRun honored.
    applyMeta(siteId, change, dryRun) {
      return engine("/apply-meta", Object.assign({ siteId, dryRun: !!dryRun }, change));
    },
    rollbackMeta(siteId, change) { return engine("/rollback-meta", Object.assign({ siteId }, change)); },

    // ---- proposals ----
    async listProposals(siteId) { return sbSelect("proposals", "site_id=eq." + siteId + "&select=*&order=created_at.desc"); },
    async createProposal(row) { return (await sbInsert("proposals", row))[0]; },
    async updateProposal(id, patch) { return (await sbUpdate("proposals", id, patch))[0]; },

    // ---- activity ----
    async listActivity(siteId) {
      const q = siteId ? "site_id=eq." + siteId + "&" : "";
      return sbSelect("activity", q + "select=*&order=created_at.desc&limit=20");
    },
    async logActivity(row) { return sbInsert("activity", row); },

    // ---- audits ----
    async listAudits(siteId) { return sbSelect("audits", "site_id=eq." + siteId + "&select=*&order=created_at.asc"); },
    async createAudit(row) { return (await sbInsert("audits", row))[0]; },
  };
})();
