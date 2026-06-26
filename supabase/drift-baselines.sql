-- ===========================================================================
-- Drift baselines — "git for SEO". One row per (site, url) storing the last
-- known-good snapshot of a page's SEO-critical surface (title, canonical,
-- meta robots, schema @types, headings, OG tags, word count, content hash).
-- backend-api/drift.js compares a fresh snapshot against this baseline to flag
-- regressions (canonical changed, noindex added, answer-surface schema lost, …).
--
-- Run this ONCE in the Supabase SQL editor (Project → SQL Editor → New query).
-- Until it exists, drift.js degrades gracefully and reports "not provisioned".
-- ===========================================================================
create table if not exists public.drift_baselines (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid,
  url          text not null,
  snapshot     jsonb not null,                 -- the captured SEO surface
  content_hash text,                            -- djb2/FNV hash of main text
  created_at   timestamptz default now(),
  unique (site_id, url)
);

create index if not exists drift_baselines_site_url_idx on public.drift_baselines (site_id, url);

alter table public.drift_baselines enable row level security;

-- Single-operator console: allow anon read and service-role full access (the
-- engine reads/writes via the service role). Adjust if you add multi-user auth.
drop policy if exists drift_baselines_read on public.drift_baselines;
create policy drift_baselines_read on public.drift_baselines for select using (true);

drop policy if exists drift_baselines_write on public.drift_baselines;
create policy drift_baselines_write on public.drift_baselines for all to service_role using (true) with check (true);
