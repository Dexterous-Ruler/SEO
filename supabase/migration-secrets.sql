-- Move site secrets to a private table with ZERO anon/authenticated access.
-- The public.sites table (browser-readable) no longer contains any secret.

create table if not exists private_secrets (
  site_id    uuid primary key references public.sites(id) on delete cascade,
  secret_enc bytea,
  updated_at timestamptz default now()
);
alter table private_secrets enable row level security;
revoke all on private_secrets from anon, authenticated;

-- migrate any existing secret out of public.sites (if the column still exists)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='sites' and column_name='secret_enc') then
    insert into private_secrets (site_id, secret_enc)
      select id, secret_enc from public.sites where secret_enc is not null
      on conflict (site_id) do update set secret_enc = excluded.secret_enc;
    alter table public.sites drop column secret_enc;
  end if;
end $$;

create or replace function public.set_site_secret_srv(p_site uuid, p_secret text, p_key text)
returns void language plpgsql security definer as $$
begin
  insert into private_secrets(site_id, secret_enc)
    values (p_site, pgp_sym_encrypt(p_secret, p_key))
    on conflict (site_id) do update set secret_enc = excluded.secret_enc, updated_at = now();
end $$;

create or replace function public.get_site_secret_srv(p_site uuid, p_key text)
returns text language plpgsql security definer as $$
declare v text;
begin
  select pgp_sym_decrypt(secret_enc, p_key) into v from private_secrets where site_id = p_site;
  return v;
end $$;
