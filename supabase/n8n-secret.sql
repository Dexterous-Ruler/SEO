-- Generic global app-secret store (pgcrypto). One row per named secret, ciphertext
-- at rest — for GLOBAL (non-per-site) credentials like the n8n public API key.
-- Mirrors private_secrets/get_site_secret_srv but keyed by a name instead of a site,
-- because one n8n instance serves every site (a single global credential).
create table if not exists public.app_secrets (
  name       text primary key,
  val_enc    bytea,
  updated_at timestamptz default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Encrypt-and-upsert. SECURITY DEFINER so it runs as owner; the service role calls
-- it with p_key = SITE_SECRET_KEY. Nothing else can decrypt without that key.
create or replace function public.set_app_secret(p_name text, p_val text, p_key text)
returns void language plpgsql security definer as $$
begin
  insert into public.app_secrets(name, val_enc)
    values (p_name, pgp_sym_encrypt(p_val, p_key))
    on conflict (name) do update set val_enc = excluded.val_enc, updated_at = now();
end $$;

create or replace function public.get_app_secret(p_name text, p_key text)
returns text language plpgsql security definer as $$
declare v text;
begin
  select pgp_sym_decrypt(val_enc, p_key) into v from public.app_secrets where name = p_name;
  return v;
end $$;

-- The key (SITE_SECRET_KEY) is the guard, but lock EXECUTE down to the server too.
-- NOTE: functions carry a default GRANT EXECUTE TO PUBLIC — revoking only anon/
-- authenticated leaves PUBLIC intact, so anon could still call these via PostgREST
-- and (since set_app_secret does no key check) overwrite/corrupt the store. Revoke
-- from PUBLIC and re-grant to just the service_role the server authenticates as.
revoke execute on function public.set_app_secret(text, text, text) from public, anon, authenticated;
revoke execute on function public.get_app_secret(text, text) from public, anon, authenticated;
grant execute on function public.set_app_secret(text, text, text) to service_role;
grant execute on function public.get_app_secret(text, text) to service_role;
