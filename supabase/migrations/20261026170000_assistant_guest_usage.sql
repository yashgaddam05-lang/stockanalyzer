-- Daily message counters for the signed-out assistant: per hashed visitor IP and one global bucket, so guest chat
-- has a hard daily cost ceiling. RLS is on with no policies; the table is reachable only through the function, and
-- the limits live in the function so a caller cannot raise them.
create table if not exists public.assistant_guest_usage (
  day date not null default (now() at time zone 'utc')::date,
  bucket text not null,
  messages int not null default 0,
  primary key (day, bucket)
);
alter table public.assistant_guest_usage enable row level security;
revoke all on public.assistant_guest_usage from anon, authenticated;

-- Counts one guest message; returns the visitor's remaining messages today, or -1 when a limit is hit.
create or replace function public.assistant_guest_consume(p_ip_hash text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  ip_limit constant int := 10;
  global_limit constant int := 500;
  today date := (now() at time zone 'utc')::date;
  used int;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return -1; end if;
  insert into public.assistant_guest_usage as u (day, bucket, messages) values (today, 'global', 1)
  on conflict (day, bucket) do update set messages = u.messages + 1 returning messages into used;
  if used > global_limit then return -1; end if;
  insert into public.assistant_guest_usage as u (day, bucket, messages) values (today, 'ip:' || p_ip_hash, 1)
  on conflict (day, bucket) do update set messages = u.messages + 1 returning messages into used;
  if used > ip_limit then return -1; end if;
  return ip_limit - used;
end $$;
revoke all on function public.assistant_guest_consume(text) from public;
grant execute on function public.assistant_guest_consume(text) to anon, authenticated;
