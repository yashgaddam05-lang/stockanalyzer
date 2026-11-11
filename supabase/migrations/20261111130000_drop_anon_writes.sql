-- APPLY ONLY AFTER SUPABASE_SERVICE_ROLE_KEY is set in Vercel (server writes then bypass RLS).
-- Closes the hole where the public anon key (shipped to every browser) could edit or delete stock data.
drop policy if exists anon_delete_stocks on public.stocks;
drop policy if exists anon_update_stocks on public.stocks;
drop policy if exists anon_insert_stocks on public.stocks;
drop policy if exists anon_insert_score_history on public.score_history;
drop policy if exists public_insert_market_regime_snapshots on public.market_regime_snapshots;
drop policy if exists public_update_market_regime_snapshots on public.market_regime_snapshots;
drop policy if exists public_insert_refresh_runs on public.refresh_runs;
