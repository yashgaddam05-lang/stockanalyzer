create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 20 minutes: refresh the 120 stalest stocks from Yahoo, then rescore the universe.
-- Replaces reliance on a single daily run, which cannot cover 500+ stocks in one call.
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-stocks-batch';
select cron.schedule(
  'refresh-stocks-batch',
  '*/20 * * * *',
  $$ select net.http_post(
       url := 'https://stockanalyzer-bolot1.vercel.app/api/refresh',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);
