-- Owned by the agency-console app (separate repo); kept here so this project's migration history is complete.
-- Daily message counters for Agency Console's public chat (per hashed visitor IP + global).
-- Lives in the shared Supabase project; all objects are prefixed agency_ to stay separate.
-- RLS is on with no policies, so the tables are reachable only through the function below,
-- which requires a server-held secret (stored in agency_chat_config) on every call.

create table if not exists public.agency_chat_usage (
  day date not null,
  bucket text not null,
  count integer not null default 0,
  primary key (day, bucket)
);
alter table public.agency_chat_usage enable row level security;

create table if not exists public.agency_chat_config (
  id boolean primary key default true check (id),
  secret_hash text not null
);
alter table public.agency_chat_config enable row level security;

create or replace function public.agency_chat_consume(
  p_secret text,
  p_ip_hash text,
  p_ip_limit integer,
  p_global_limit integer
)
returns table (allowed boolean, ip_used integer, global_used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global integer;
  v_ip integer;
begin
  if not exists (
    select 1 from public.agency_chat_config c
    where c.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{32}$' then
    raise exception 'bad ip hash' using errcode = '22023';
  end if;

  -- Clamp so a leaked secret still cannot lift the caps beyond these ceilings.
  p_ip_limit := least(greatest(coalesce(p_ip_limit, 0), 0), 200);
  p_global_limit := least(greatest(coalesce(p_global_limit, 0), 0), 5000);

  insert into public.agency_chat_usage as u (day, bucket, count)
  values (current_date, 'global', 1)
  on conflict (day, bucket) do update set count = u.count + 1
  returning u.count into v_global;

  insert into public.agency_chat_usage as u (day, bucket, count)
  values (current_date, 'ip:' || p_ip_hash, 1)
  on conflict (day, bucket) do update set count = u.count + 1
  returning u.count into v_ip;

  delete from public.agency_chat_usage where day < current_date - 7;

  return query select (v_global <= p_global_limit and v_ip <= p_ip_limit), v_ip, v_global;
end;
$$;

revoke all on function public.agency_chat_consume(text, text, integer, integer) from public;
grant execute on function public.agency_chat_consume(text, text, integer, integer) to anon, authenticated;
