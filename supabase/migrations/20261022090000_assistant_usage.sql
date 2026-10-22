-- Per-user daily message counter for the in-app help assistant.
create table if not exists public.assistant_usage (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  day date not null default (now() at time zone 'utc')::date,
  messages int not null default 0,
  primary key (owner_id, day)
);
alter table public.assistant_usage enable row level security;
drop policy if exists assistant_usage_own_read on public.assistant_usage;
create policy assistant_usage_own_read on public.assistant_usage for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.assistant_usage from anon;

-- Atomically counts one assistant message for the caller; returns remaining (or -1 when over the limit).
create or replace function public.assistant_consume(p_limit int)
returns int language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int;
begin
  if uid is null then return -1; end if;
  insert into public.assistant_usage as u (owner_id, day, messages)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (owner_id, day) do update set messages = u.messages + 1
  returning messages into used;
  if used > p_limit then return -1; end if;
  return p_limit - used;
end $$;
revoke all on function public.assistant_consume(int) from public, anon;
grant execute on function public.assistant_consume(int) to authenticated;
