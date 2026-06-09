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
    const res = await fetch(ENGINE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
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

    // ---- engine operations ----
    // Secure connect: validate + detect + encrypt-store in one server call.
    siteConnect(creds, opts) { return engine("/site-connect", Object.assign({ creds }, opts || {})); },
    generateContent(task, input, finding, siteId) { return engine("/generate-content", { task, input, finding, siteId }); },
    contentIntel(siteId, niche) { return engine("/content-intel", { siteId, niche }); },
    contentOpportunities(siteId, opts) { return engine("/content-opportunities", Object.assign({ siteId }, opts || {})); },
    contentBrief(siteId, keyword, intent) { return engine("/content-brief", { siteId, keyword, intent }); },
    trendingIntel(siteId, niche) { return engine("/trending-intel", { siteId, niche }); },
    researchStatus() { return engine("/research-status", {}); },
    adminStatus() { return engine("/admin-status", {}); },
    promptsList(siteId) { return engine("/prompts-list", { siteId }); },
    promptSave(key, content, model, temperature, siteId) { return engine("/prompt-save", { key, content, model, temperature, siteId }); },
    promptReset(key, siteId) { return engine("/prompt-reset", { key, siteId }); },
    promptHistory(key) { return engine("/prompt-history", { key }); },
    promptTest(key, content, model, temperature) { return engine("/prompt-test", { key, content, model, temperature }); },
    geoPrompts(siteName, niche, sampleTitles) { return engine("/geo-prompts", { siteName, niche, sampleTitles }); },
    geoTrack(siteId, targetDomain, prompts, competitors) { return engine("/geo-track", { siteId, targetDomain, prompts, competitors }); },
    geoEnable(siteId, opts) { return engine("/geo-enable", Object.assign({ siteId }, opts || {})); },
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
    auditAnomalies(history) { return engine("/audit-anomalies", { history }); },
    correlation(siteId, days) { return engine("/correlation", { siteId, days: days || 90 }); },
    execScorecard(siteId) { return engine("/exec-scorecard", { siteId }); },
    execNarrative(metrics) { return engine("/exec-narrative", { metrics }); },
    internalLinks(siteId, opts) { return engine("/internal-links", Object.assign({ siteId }, opts || {})); },
    generateSchema(siteId, page, schemaConfig, faqs) { return engine("/generate-schema", { siteId, page, schemaConfig, faqs }); },
    // Live "apply" layer (needs the seo-agent-optimize mu-plugin)
    optimizeStatus(siteId) { return engine("/optimize-status", { siteId }); },
    installWebpPlugin(siteId) { return engine("/install-webp-plugin", { siteId }); },
    applySchema(siteId, opts) { return engine("/apply-schema", Object.assign({ siteId }, opts || {})); },
    applyCss(siteId, css) { return engine("/apply-css", { siteId, css }); },
    aiSeoFacts(siteId, url, title) { return engine("/ai-seo-facts", { siteId, url, title }); },
    generateCss(siteId, findings) { return engine("/generate-css", { siteId, findings }); },
    mediaScan(siteId) { return engine("/media-scan", { siteId }); },
    mediaOptimize(siteId, opts) { return engine("/media-optimize", Object.assign({ siteId }, opts || {})); },
    speedTest(url, strategy) { return engine("/speed-test", { url, strategy }); },
    contentDecay(siteId, windowDays) { return engine("/content-decay", { siteId, windowDays }); },
    contentDecayBrief(page) { return engine("/content-decay-brief", { page }); },
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
    airtableUpdateRecord(siteId, recordId, fields) { return engine("/airtable-update-record", { siteId, recordId, fields }); },
    airtableCreateRecord(siteId, fields) { return engine("/airtable-create-record", { siteId, fields }); },
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
