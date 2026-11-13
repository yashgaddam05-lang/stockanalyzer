-- refresh-filings is killed by the free-tier Edge CPU cap (~2s, HTTP 546) when one
-- daily call tries to cover the whole universe. It now does a small batch of the
-- stalest tickers per call, so run it every 10 minutes (~2,100 ticker syncs/day
-- for ~570 stocks). The function's own 8-minute skip window guards double runs.
-- verify_jwt is off on this function and no force flag is sent, so no secret is
-- embedded here; the Vercel daily cron (/api/cron?job=filings) keeps working.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-filings-batch';
select cron.schedule(
  'refresh-filings-batch',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://irbwaucilrznbqynhtmr.supabase.co/functions/v1/refresh-filings',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);
