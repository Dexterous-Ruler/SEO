-- Prompt edit history — every save is recorded so any prior version can be
-- restored with one click. Pruned to the last ~20 versions per prompt by the app.
create table if not exists public.prompt_history (
  id        uuid primary key default gen_random_uuid(),
  key       text not null,
  content   text not null,
  saved_at  timestamptz not null default now()
);
create index if not exists prompt_history_key_idx on public.prompt_history (key, saved_at desc);

alter table public.prompt_history enable row level security;
drop policy if exists ph_read on public.prompt_history;
create policy ph_read on public.prompt_history for select using (true);
drop policy if exists ph_write on public.prompt_history;
create policy ph_write on public.prompt_history for all to service_role using (true) with check (true);
