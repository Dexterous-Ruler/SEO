-- Schema snapshot (repo-hygiene for the Jul 2026 audit). These objects ALREADY EXIST
-- in the live Supabase DB; captured here so a fresh provision reproduces them and the
-- repo documents ground truth. IF NOT EXISTS makes this a safe/idempotent no-op live.
-- Also present live (defined via pgcrypto SECURITY DEFINER RPCs, not re-created here):
--   set_gsc_sa/get_gsc_sa, set_airtable_pat/get_airtable_pat, set_app_secret/get_app_secret.
-- prompts.temperature also already exists live.

create table if not exists public.airtable_config (
  id uuid default gen_random_uuid() not null,
  site_id uuid,
  base_id text,
  table_gaps text,
  table_content text,
  table_geo text,
  connected boolean default false,
  last_sync timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.airtable_sync_log (
  id uuid default gen_random_uuid() not null,
  site_id uuid,
  kind text,
  records_pushed integer default 0,
  status text,
  detail text,
  created_at timestamptz default now()
);

create table if not exists public.chat_conversations (
  id uuid default gen_random_uuid() not null,
  site_id uuid,
  title text default 'New chat'::text,
  messages jsonb default '[]'::jsonb,
  api_history jsonb default '[]'::jsonb,
  message_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.geo_runs (
  id uuid default gen_random_uuid() not null,
  site_id uuid,
  engine text default 'claude'::text,
  share_of_voice numeric,
  prompts_total integer,
  prompts_cited integer,
  results jsonb,
  competitors jsonb,
  created_at timestamptz default now()
);

create table if not exists public.gsc_daily (
  id bigint not null,
  site_id uuid,
  date date not null,
  query text,
  page text,
  dim text default 'query'::text,
  clicks integer default 0,
  impressions integer default 0,
  ctr numeric default 0,
  position numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.semrush_snapshots (
  id uuid default gen_random_uuid() not null,
  site_id uuid,
  domain text,
  kind text,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists public.user_settings (
  owner uuid not null,
  kill_switch boolean default false not null,
  updated_at timestamptz default now() not null
);

