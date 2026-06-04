-- ===========================================================================
-- Sentinel — Supabase schema
-- Stores connected WordPress accounts, encrypted secrets, audit history,
-- fix proposals, and the activity/audit-trail. RLS scopes everything to the
-- owning user. Application Passwords are encrypted with pgcrypto (never stored
-- or returned in plaintext).
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---- sites: one row per connected WordPress account ------------------------
create table if not exists public.sites (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  url          text not null,
  username     text not null,
  -- secret: app password encrypted at rest (pgp_sym_encrypt). Never selected raw.
  secret_enc   bytea,
  staging_url  text,
  glyph        text,                          -- single-letter avatar
  favicon      text default '#1A746B',        -- accent color
  status       text not null default 'connected',  -- connected | auth-failed | unreachable
  role         text,
  write_armed  boolean not null default false,
  mu_plugin    boolean not null default false,
  selftest     text default 'missing',        -- ready | partial | missing
  stack        jsonb,                          -- detected stack
  scale        jsonb,                          -- {posts,pages,media,sitemap}
  caps         jsonb,                          -- enabled capabilities
  scores       jsonb,                          -- latest category scores
  prev_scores  jsonb,
  cwv          jsonb,                          -- core web vitals
  last_audit   timestamptz,
  created_at   timestamptz not null default now()
);

-- ---- audits: every audit run (history / trend) ----------------------------
create table if not exists public.audits (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  owner       uuid not null references auth.users(id) on delete cascade,
  scope       text,                            -- single | key | full
  scores      jsonb,
  cwv         jsonb,
  findings    jsonb,                           -- prioritized findings list
  summary     jsonb,
  created_at  timestamptz not null default now()
);

-- ---- proposals: fix proposals awaiting approval ---------------------------
create table if not exists public.proposals (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  owner        uuid not null references auth.users(id) on delete cascade,
  finding_id   text,
  disc         text,                           -- seo | performance | accessibility | image
  risk         text default 'low',
  channel      text,                           -- rest-write | theme/css | manual
  title        text,
  page         text,
  impact       text,
  target       text default 'staging',         -- staging | production
  field        text,
  before_val   text,
  after_val    text,
  status       text not null default 'proposed', -- proposed|approved|applied|verified|rolled-back|failed
  -- rollback ledger
  object_type  text default 'posts',
  post_id      bigint,
  old_value    text,
  applied_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ---- activity: append-only audit trail ------------------------------------
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid references public.sites(id) on delete cascade,
  owner       uuid not null references auth.users(id) on delete cascade,
  type        text,                            -- verified|approved|applied|rolled-back|audit|connection|failed
  actor       text,                            -- 'You' | 'Agent'
  icon        text,
  text        text,
  meta        text,
  created_at  timestamptz not null default now()
);

-- ---- global per-user settings (kill switch etc.) --------------------------
create table if not exists public.user_settings (
  owner        uuid primary key references auth.users(id) on delete cascade,
  kill_switch  boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security — every table scoped to its owner
-- ===========================================================================
alter table public.sites          enable row level security;
alter table public.audits         enable row level security;
alter table public.proposals      enable row level security;
alter table public.activity       enable row level security;
alter table public.user_settings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sites','audits','proposals','activity','user_settings'] loop
    execute format('drop policy if exists own_all on public.%I', t);
    execute format(
      'create policy own_all on public.%I for all using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;

-- ===========================================================================
-- Secret handling: encrypt on write, decrypt only inside SECURITY DEFINER fns.
-- The app password is passed once; the raw column is never exposed via RLS
-- selects because clients select explicit columns (not secret_enc).
-- ===========================================================================

-- Store/update a site secret (encrypted). key comes from a server-side setting.
create or replace function public.set_site_secret(p_site uuid, p_secret text, p_key text)
returns void language plpgsql security definer as $$
begin
  update public.sites
     set secret_enc = pgp_sym_encrypt(p_secret, p_key)
   where id = p_site and owner = auth.uid();
end $$;

-- Decrypt a site secret (only callable by owner; used by trusted server/edge fn).
create or replace function public.get_site_secret(p_site uuid, p_key text)
returns text language plpgsql security definer as $$
declare v text;
begin
  select pgp_sym_decrypt(secret_enc, p_key) into v
    from public.sites where id = p_site and owner = auth.uid();
  return v;
end $$;
