-- Delisted or acquired stocks keep returning a frozen quote from Yahoo (CRNX's last
-- trade was 2026-08-31, KVUE's 2026-10-30), so the refresh marks them fresh and they
-- stay in rankings at a dead price. Daily: deactivate any active stock whose newest
-- daily bar is 14+ days old (no trading in ~10 sessions), log the tickers in
-- refresh_runs. Reversible: set stocks.is_active = true to bring one back.
create or replace function public.deactivate_delisted_stocks(p_days int default 14)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  hit text[];
  active_n int;
begin
  -- Candidates: the refresh reached Yahoo recently (so this is not an outage), yet
  -- the newest daily bar is old, i.e. the symbol stopped trading.
  select coalesce(array_agg(s.ticker order by s.ticker), '{}') into hit
    from stocks s
    join price_daily_coverage c on c.ticker = s.ticker
   where s.is_active
     and c.last_d < current_date - p_days
     and s.last_refreshed_at > now() - interval '2 days';
  select count(*) into active_n from stocks where is_active;

  -- Safety cap: more than 5% at once smells like a data problem, not delistings.
  if cardinality(hit) > greatest(3, active_n / 20) then
    insert into refresh_runs (job, started_at, finished_at, status, stats)
    values ('sql:deactivate-delisted', now(), now(), 'failed',
            jsonb_build_object('error', 'too_many_candidates_skipped', 'candidates', to_jsonb(hit)));
    return '{}';
  end if;

  update stocks set is_active = false where ticker = any(hit);
  insert into refresh_runs (job, started_at, finished_at, status, stats)
  values ('sql:deactivate-delisted', now(), now(), 'ok',
          jsonb_build_object('deactivated', to_jsonb(hit), 'threshold_days', p_days));
  return hit;
end;
$$;

revoke all on function public.deactivate_delisted_stocks(int) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'deactivate-delisted-stocks';
select cron.schedule('deactivate-delisted-stocks', '15 9 * * *', $$ select public.deactivate_delisted_stocks(); $$);
