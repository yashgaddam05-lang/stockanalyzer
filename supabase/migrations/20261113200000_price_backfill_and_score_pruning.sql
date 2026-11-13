-- 1) 5-year daily price history. price_daily only reached back to 2025-10-16
--    (avg ~133 bars per symbol), which caps backtests and the score track record.
--    The backfill-prices Edge Function fills 5y per symbol in small batches
--    (pg_cron every 2 min); price_backfill_state records what is done.
--    ~1,260 bars x ~600 symbols = ~750k rows, ~160 MB. 10y would not fit free tier.
-- 2) score_history grows ~2,150 rows/day (~270 MB/yr). Keep every snapshot for
--    30 days, then only the last snapshot per ticker, model and UTC day, which is
--    exactly what backtests and forward returns read (DISTINCT ON per day).

create table if not exists public.price_backfill_state (
  ticker text primary key,
  range text not null default '5y',
  done_at timestamptz,
  bars int,
  first_d date,
  attempts int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.price_backfill_state enable row level security;
-- No policies: service role only.

-- Seed every symbol already stored (stocks, SPY, ^VIX, sector ETFs, inactive ones).
insert into public.price_backfill_state (ticker)
select distinct ticker from public.price_daily
on conflict (ticker) do nothing;

create or replace function public.price_backfill_queue(p_limit int default 4, p_max_attempts int default 3)
returns table (ticker text)
language sql
stable
security definer
set search_path = public
as $$
  select q.ticker from (
    select b.ticker from price_backfill_state b
     where b.done_at is null and b.attempts < p_max_attempts
    union
    select k.ticker from stocks k
     where k.is_active and not exists (select 1 from price_backfill_state b where b.ticker = k.ticker)
  ) q
  -- SPY first (backtest benchmark), then active stocks, then everything else.
  order by (q.ticker = 'SPY') desc,
           exists (select 1 from stocks k where k.ticker = q.ticker and k.is_active) desc,
           q.ticker
  limit p_limit;
$$;

create or replace function public.price_backfill_remaining(p_max_attempts int default 3)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from price_backfill_queue(1000000, p_max_attempts);
$$;

create or replace function public.price_backfill_fail(p_ticker text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into price_backfill_state (ticker, attempts, last_error, updated_at)
  values (p_ticker, 1, p_error, now())
  on conflict (ticker) do update
     set attempts = price_backfill_state.attempts + 1, last_error = excluded.last_error, updated_at = now();
$$;

create or replace function public.prune_score_history(p_keep_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with ranked as (
    select id, row_number() over (
             partition by ticker, model_version, (captured_at at time zone 'UTC')::date
             order by captured_at desc) as rn
      from score_history
     where captured_at < now() - make_interval(days => p_keep_days)
  )
  delete from score_history sh using ranked r where sh.id = r.id and r.rn > 1;
  get diagnostics n = row_count;
  insert into refresh_runs (job, started_at, finished_at, status, stats)
  values ('sql:prune-score-history', now(), now(), 'ok', jsonb_build_object('deleted', n, 'keep_days', p_keep_days));
  return n;
end;
$$;

revoke all on function public.price_backfill_queue(int, int) from public, anon, authenticated;
revoke all on function public.price_backfill_remaining(int) from public, anon, authenticated;
revoke all on function public.price_backfill_fail(text, text) from public, anon, authenticated;
revoke all on function public.prune_score_history(int) from public, anon, authenticated;
grant execute on function public.price_backfill_queue(int, int) to service_role;
grant execute on function public.price_backfill_remaining(int) to service_role;
grant execute on function public.price_backfill_fail(text, text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('backfill-prices', 'prune-score-history');
select cron.schedule(
  'backfill-prices',
  '*/2 * * * *',
  $$ select net.http_post(
       url := 'https://irbwaucilrznbqynhtmr.supabase.co/functions/v1/backfill-prices',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);
select cron.schedule('prune-score-history', '30 9 * * *', $$ select public.prune_score_history(); $$);
