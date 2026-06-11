-- Scheduler clustering (Tier-2 horizontal scale). Run once in Supabase SQL editor.
-- Lets you run >1 instance (Koyeb min >= 2) without double-running scheduled jobs.
-- Until this exists, the scheduler runs as today (single-instance, in-memory).

-- Single-row leader lock: only the holder ticks; TTL lets another instance take
-- over if the leader dies.
create table if not exists scheduler_lock (
  id          text primary key,
  holder      text,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);
insert into scheduler_lock (id) values ('leader') on conflict (id) do nothing;

-- Persisted per-(site,job) last-run so due-ness survives redeploys (no more
-- re-running everything after a deploy, and shared across instances).
create table if not exists scheduler_runs (
  site_id   uuid not null,
  job       text not null,
  last_run  timestamptz not null default now(),
  primary key (site_id, job)
);

alter table scheduler_lock enable row level security;
alter table scheduler_runs enable row level security;
