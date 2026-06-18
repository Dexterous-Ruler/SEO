-- ===========================================================================
-- 004_experience.sql — Experience Monitor (UX & conversion-defect monitoring)
-- ADDITIVE + INERT: new tables + defaulted columns only. Nothing here changes
-- existing tables' types/constraints, and the whole subsystem stays dark until
-- RUM_ENABLED (env) AND sites.rum_armed are turned on. Safe to apply anytime.
-- RLS service-role-only (mirrors jobs/scheduler); every row carries site_id.
-- ===========================================================================

-- ux_events: raw, ephemeral, HARD-CAPPED ring (writer-enforced) + TTL backstop.
create table if not exists ux_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  page text not null,                 -- normalized PATH (joins to GSC landing pages)
  event_type text not null,           -- enum (js_error|unhandled_rejection|broken_resource|ajax_4xx|dest_404|broken_cta|form_validation)
  selector text, role text,
  confidence text not null default 'high',
  count int not null default 1,
  detail jsonb not null default '{}'::jsonb,   -- PII-free, type-specific
  ip_hash text,                       -- salted /24-truncated; NEVER raw IP
  pv_id text,                         -- ephemeral page-view id (not a visitor id)
  beacon_ver text,
  received_at timestamptz not null default now()  -- server stamp (trust boundary)
);
create index if not exists ux_events_rollup_idx on ux_events (site_id, received_at);
create index if not exists ux_events_prune_idx  on ux_events (received_at);
alter table ux_events enable row level security;

-- ux_defects: aggregated, durable, GSC-joined (mirrors proposals/findings shape).
create table if not exists ux_defects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  page text not null, event_type text not null, selector text,
  signature text not null,            -- sha256(site_id|page|event_type|selector)
  confidence text not null default 'high',
  severity text,
  occurrences int not null default 0, sessions int not null default 0,
  pageviews_seen int not null default 0, defect_rate numeric,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  sample_detail jsonb,
  gsc_clicks int, gsc_position numeric,
  clicks_exposed numeric,             -- gsc_clicks × defect_rate × confidence_weight (NO conv funnel)
  rice_score numeric, anomaly_z numeric,
  status text not null default 'open',-- open|proposed|fixed|ignored
  proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_defects_sig_idx on ux_defects (site_id, signature);
create index if not exists ux_defects_worklist_idx on ux_defects (site_id, status, clicks_exposed desc);
alter table ux_defects enable row level security;

-- per-site beacon key + arm flag + compliance sign-off (additive columns on sites).
alter table sites add column if not exists rum_key text;
alter table sites add column if not exists rum_armed boolean not null default false;
alter table sites add column if not exists rum_signed_off boolean not null default false;
