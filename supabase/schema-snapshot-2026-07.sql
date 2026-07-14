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


-- ── Credential RPCs (pgcrypto SECURITY DEFINER) — captured from live for repo hygiene
-- (audit: referenced in supabase.js but absent from any committed migration). Idempotent.

create or replace function public.get_airtable_pat(p_site uuid, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ declare v text; begin select pgp_sym_decrypt(pat_enc, p_key) into v from airtable_secrets where site_id=p_site; return v; end $function$
;

create or replace function public.get_app_secret(p_name text, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v text;
begin
  select pgp_sym_decrypt(val_enc, p_key) into v from public.app_secrets where name = p_name;
  return v;
end $function$
;

create or replace function public.get_gsc_sa(p_site uuid, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ declare v text; begin select pgp_sym_decrypt(sa_enc, p_key) into v from gsc_secrets where site_id=p_site; return v; end $function$
;

create or replace function public.get_site_secret_srv(p_site uuid, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v text;
begin
  select pgp_sym_decrypt(secret_enc, p_key) into v from private_secrets where site_id = p_site;
  return v;
end $function$
;

create or replace function public.set_airtable_pat(p_site uuid, p_pat text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin insert into airtable_secrets(site_id, pat_enc) values (p_site, pgp_sym_encrypt(p_pat, p_key)) on conflict (site_id) do update set pat_enc=excluded.pat_enc, updated_at=now(); end $function$
;

create or replace function public.set_app_secret(p_name text, p_val text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.app_secrets(name, val_enc)
    values (p_name, pgp_sym_encrypt(p_val, p_key))
    on conflict (name) do update set val_enc = excluded.val_enc, updated_at = now();
end $function$
;

create or replace function public.set_gsc_sa(p_site uuid, p_sa text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin insert into gsc_secrets(site_id, sa_enc) values (p_site, pgp_sym_encrypt(p_sa, p_key)) on conflict (site_id) do update set sa_enc=excluded.sa_enc, updated_at=now(); end $function$
;

create or replace function public.set_site_secret_srv(p_site uuid, p_secret text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into private_secrets(site_id, secret_enc)
    values (p_site, pgp_sym_encrypt(p_secret, p_key))
    on conflict (site_id) do update set secret_enc = excluded.secret_enc, updated_at = now();
end $function$
;

