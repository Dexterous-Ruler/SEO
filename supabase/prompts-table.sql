-- ===========================================================================
-- Prompt store — every editable system prompt, category-wise. The admin panel
-- reads/writes this via the engine (service role). Run once in the Supabase SQL
-- editor; the server auto-seeds the catalogue on first start.
-- ===========================================================================
create table if not exists public.prompts (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,         -- e.g. 'content.brief'
  category    text,                          -- e.g. 'Content Briefs & Research'
  label       text,
  description text,
  content     text not null,                 -- the live prompt text
  model       text,
  updated_at  timestamptz not null default now()
);

create index if not exists prompts_category_idx on public.prompts (category);

alter table public.prompts enable row level security;

-- Single-operator console: allow anon read (so the UI could read directly if
-- ever needed) and service-role full access (the admin panel writes via the
-- engine using the service role). Adjust if you add multi-user auth.
drop policy if exists prompts_read on public.prompts;
create policy prompts_read on public.prompts for select using (true);

drop policy if exists prompts_write on public.prompts;
create policy prompts_write on public.prompts for all to service_role using (true) with check (true);
