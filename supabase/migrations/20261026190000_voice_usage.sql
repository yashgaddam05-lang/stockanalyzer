-- Daily voice usage (ElevenLabs): text-to-speech characters and speech-to-text clips, per account or, signed out, per
-- hashed visitor IP plus one global guest bucket. RLS on with no policies; reachable only through the function, and the
-- limits live in the function so a caller cannot raise them.
create table if not exists public.voice_usage (
  day date not null default (now() at time zone 'utc')::date,
  bucket text not null,
  kind text not null check (kind in ('tts', 'stt')),
  amount int not null default 0,
  primary key (day, bucket, kind)
);
alter table public.voice_usage enable row level security;
revoke all on public.voice_usage from anon, authenticated;

-- Counts p_amount of p_kind for the caller; returns what is left today, or -1 when a limit is hit.
create or replace function public.voice_consume(p_kind text, p_amount int, p_ip_hash text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  lim int;
  used int;
begin
  if p_kind not in ('tts', 'stt') or p_amount is null or p_amount < 1 or p_amount > 5000 then return -1; end if;
  if uid is null then
    if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return -1; end if;
    insert into public.voice_usage as v (day, bucket, kind, amount) values (today, 'guest-global', p_kind, p_amount)
    on conflict (day, bucket, kind) do update set amount = v.amount + p_amount returning amount into used;
    if used > (case p_kind when 'tts' then 150000 else 300 end) then return -1; end if;
    lim := case p_kind when 'tts' then 3000 else 6 end;
    insert into public.voice_usage as v (day, bucket, kind, amount) values (today, 'ip:' || p_ip_hash, p_kind, p_amount)
    on conflict (day, bucket, kind) do update set amount = v.amount + p_amount returning amount into used;
  else
    lim := case p_kind when 'tts' then 40000 else 80 end;
    insert into public.voice_usage as v (day, bucket, kind, amount) values (today, 'user:' || uid, p_kind, p_amount)
    on conflict (day, bucket, kind) do update set amount = v.amount + p_amount returning amount into used;
  end if;
  if used > lim then return -1; end if;
  return lim - used;
end $$;
revoke all on function public.voice_consume(text, int, text) from public;
grant execute on function public.voice_consume(text, int, text) to anon, authenticated;
