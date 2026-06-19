-- ===========================================================================
-- 006_experience_rollup_atomic.sql — make the Experience Monitor rollup merge AND
-- its watermark advance ATOMIC, in one transaction. Fixes the double-count bug where
-- the RPC merge committed but a SEPARATE watermark HTTP write failed, so the next
-- tick re-drained the same (additively-merged) window. Now the watermark advances
-- iff the merge commits. ADDITIVE + idempotent (create or replace).
--
-- Replaces the 1-arg ux_defect_merge(jsonb) from 005 with a 3-arg overload (the old
-- one is dropped first to avoid PostgREST overload ambiguity). Calling with only
-- {rows} still works (p_site/p_watermark default null → no watermark write).
-- ===========================================================================
drop function if exists ux_defect_merge(jsonb);

create or replace function ux_defect_merge(rows jsonb, p_site uuid default null, p_watermark timestamptz default null)
returns void language plpgsql security definer as $$
begin
  insert into ux_defects (site_id, page, event_type, selector, signature, confidence,
    occurrences, sessions, pageviews_seen, last_seen, sample_detail, gsc_clicks, gsc_position, status, updated_at)
  select (r->>'site_id')::uuid, r->>'page', r->>'event_type', nullif(r->>'selector',''), r->>'signature',
    coalesce(r->>'confidence','high'),
    coalesce((r->>'occurrences')::int,0), coalesce((r->>'sessions')::int,0), coalesce((r->>'pageviews_seen')::int,0),
    coalesce((r->>'last_seen')::timestamptz, now()), (r->'sample_detail'),
    nullif(r->>'gsc_clicks','')::int, nullif(r->>'gsc_position','')::numeric, 'open', now()
  from jsonb_array_elements(rows) as r
  on conflict (site_id, signature) do update set
    occurrences   = ux_defects.occurrences   + excluded.occurrences,
    sessions      = ux_defects.sessions       + excluded.sessions,
    pageviews_seen= ux_defects.pageviews_seen + excluded.pageviews_seen,
    last_seen     = greatest(ux_defects.last_seen, excluded.last_seen),
    sample_detail = coalesce(excluded.sample_detail, ux_defects.sample_detail),
    gsc_clicks    = coalesce(excluded.gsc_clicks, ux_defects.gsc_clicks),
    gsc_position  = coalesce(excluded.gsc_position, ux_defects.gsc_position),
    updated_at    = now()
  where ux_defects.status not in ('ignored','fixed');

  -- Advance the rollup watermark in the SAME transaction (atomic with the merge).
  if p_site is not null and p_watermark is not null then
    insert into scheduler_runs (site_id, job, last_run)
    values (p_site, 'ux-rollup-wm', p_watermark)
    on conflict (site_id, job) do update set last_run = excluded.last_run;
  end if;
end; $$;
