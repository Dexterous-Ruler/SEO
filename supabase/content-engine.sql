-- ===========================================================================
-- Content Engine — the unified content-opportunity queue. ONE normalized,
-- deduped, scored row per topic, merged across every producer (keyword
-- clusters, trending intel, People-Also-Ask questions, AI-visibility gaps).
-- backend-api/content-engine.js writes here (ingest → persist) and reads it
-- back as the writer's worklist. dedupe_key collapses "uk spouse visa cost"
-- and "cost of a UK spouse visa" onto ONE row; a shared key merges evidence
-- (multi-source = higher confidence) and takes the max score.
--
-- Run this ONCE in the Supabase SQL editor (Project → SQL Editor → New query).
-- Until it exists, content-engine.js degrades gracefully and reports
-- "not provisioned".
-- ===========================================================================
create table if not exists public.content_opportunities (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid,
  source          text,                            -- keywords | trending | paa | ai_visibility | content_plan
  source_ref      text,                            -- the producer's own id/label for this item
  title           text,
  primary_keyword text,
  intent          text,
  action_type     text,                            -- article | answer_block | geo
  cluster_key     text,
  dedupe_key      text,                            -- normalized token signature (collision = same topic)
  score           numeric,
  score_breakdown jsonb,                           -- the factors behind the score
  evidence        jsonb,                           -- [{source, detail}] — concatenated across merged sources
  status          text default 'scored',           -- scored | queued | in_progress | done | dismissed
  airtable_ref    text,                            -- record id if mirrored to the Content Command table
  payload         jsonb,                           -- the richest raw producer record (for the writer)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (site_id, dedupe_key)
);

create index if not exists content_opportunities_site_score_idx on public.content_opportunities (site_id, score desc);

alter table public.content_opportunities enable row level security;

-- Single-operator console: allow anon read and service-role full access (the
-- engine reads/writes via the service role). Adjust if you add multi-user auth.
drop policy if exists content_opportunities_read on public.content_opportunities;
create policy content_opportunities_read on public.content_opportunities for select using (true);

drop policy if exists content_opportunities_write on public.content_opportunities;
create policy content_opportunities_write on public.content_opportunities for all to service_role using (true) with check (true);
