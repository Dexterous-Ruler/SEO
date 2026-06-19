-- 005_experience_rollup.sql — atomic incremental rollup merge for Experience Monitor.
-- ADDITIVE + idempotent. Accumulates occurrences/sessions/pageviews on conflict so the
-- hourly rollup never double-counts or overwrites. Derived metrics (defect_rate,
-- clicks_exposed, rice_score) are computed at READ time, not stored here. Never
-- resurrects an 'ignored'/'fixed' defect. Callable via PostgREST RPC (service role).
create or replace function ux_defect_merge(rows jsonb)
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
end; $$;
