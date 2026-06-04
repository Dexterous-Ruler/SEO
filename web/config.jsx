/* ===========================================================================
   Sentinel — runtime configuration
   Edit these to point the console at your Supabase project + local engine API.
   Loaded before everything else. Safe to expose (anon key + public URLs only).
   =========================================================================== */
window.SENTINEL_CONFIG = {
  // Supabase project (anon key is public by design; RLS protects data)
  supabaseUrl: "https://kzzhshxwusamqgqxervb.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6emhzaHh3dXNhbXFncXhlcnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTY3OTcsImV4cCI6MjA5NTk3Mjc5N30.aTpwL5dXWr2gEFrbDIRQSPplnpIBb3-vgOB97VNa_xA",

  // Engine API (backend-api/server.js). In local dev the API runs on :8787
  // (separate from the static server); in production ONE server serves both the
  // console and the API, so we call it same-origin (relative URLs).
  engineApi: (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8787"
    : "",

  // When true, the UI runs on mock data only (no network). Auto-falls back to
  // this if Supabase/engine are unreachable, so the design always renders.
  offline: false,
};
