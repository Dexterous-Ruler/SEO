-- Durable job queue (Tier-2 robustness). Run once in the Supabase SQL editor.
-- Until this exists, the app runs jobs inline (no durability) and won't error.

create extension if not exists pgcrypto;

create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid,
  type            text not null,
  status          text not null default 'queued',   -- queued | running | done | failed
  payload         jsonb not null default '{}'::jsonb,
  result          jsonb,
  error           text,
  attempts        int  not null default 0,
  max_attempts    int  not null default 3,
  priority        int  not null default 0,
  idempotency_key text,
  run_after       timestamptz not null default now(),
  locked_by       text,
  locked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Fast claim of due work.
create index if not exists jobs_claim_idx on jobs (status, run_after, priority desc, created_at);
-- Per-site listing.
create index if not exists jobs_site_idx on jobs (site_id, created_at desc);
-- Idempotency: at most one live job per key.
create unique index if not exists jobs_idem_idx on jobs (idempotency_key) where idempotency_key is not null;

-- Service-role only (the server uses the service key; never exposed to the browser).
alter table jobs enable row level security;
