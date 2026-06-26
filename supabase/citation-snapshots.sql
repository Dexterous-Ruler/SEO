-- ===========================================================================
-- Citation snapshots — GEO/AEO time-series. One row per citation-tracking pass
-- storing the overall AI Share-of-Voice (0-100), whether the site was cited at
-- all, a per-platform breakdown (ChatGPT/Claude/Gemini/Perplexity), and the
-- full raw result. backend-api/geo.js writes a snapshot after each pass
-- (saveCitationSnapshot) and reads them back as a trend (citationTrend) to chart
-- AI visibility over time.
--
-- Run this ONCE in the Supabase SQL editor (Project → SQL Editor → New query).
-- Until it exists, geo.js degrades gracefully and reports "not provisioned".
-- ===========================================================================
create table if not exists public.citation_snapshots (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid,
  captured_at  timestamptz default now(),
  sov          numeric,                         -- overall AI share-of-voice, 0-100
  cited        boolean,                         -- was the site cited in any prompt?
  per_platform jsonb,                           -- { claude: { sov, cited, ... }, ... }
  result       jsonb                            -- the full runCitationTracking result
);

create index if not exists citation_snapshots_site_captured_idx on public.citation_snapshots (site_id, captured_at desc);

alter table public.citation_snapshots enable row level security;

-- Single-operator console: allow anon read and service-role full access (the
-- engine reads/writes via the service role). Adjust if you add multi-user auth.
drop policy if exists citation_snapshots_read on public.citation_snapshots;
create policy citation_snapshots_read on public.citation_snapshots for select using (true);

drop policy if exists citation_snapshots_write on public.citation_snapshots;
create policy citation_snapshots_write on public.citation_snapshots for all to service_role using (true) with check (true);
