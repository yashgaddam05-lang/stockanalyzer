# Track record (2016 to now)

Rebuilds the 3x score point-in-time for every quarter since 2016 and backtests Top 10/20/50 vs SPY.
Top N and the equal-weight line only pick stocks that were S&P 500 members on each rebalance day
(`sp500_ticker_start_end.csv`), like the bots: curated growth names are in today's list because they ran.
Output: `public/data/track-record.json`, read by `/track-record` and the landing page.

1. Prices come from Yahoo, which rate-limits local machines, so the backfill calls a temporary
   Supabase edge function `history-backfill` (redeploy it from git history of this README's commit,
   run, then retire it). SEC companyfacts are fetched directly.
   `node scripts/track-record/backfill.mjs` → `scripts/track-record/data/` (gitignored).
   With the edge function retired, `node scripts/track-record/prices-local.mjs` fetches the prices
   directly from Yahoo at a gentle pace (about 15 minutes for 570 tickers).
2. `npx tsx --tsconfig tsconfig.app.json scripts/track-record/compute.ts public/data/track-record.json`

`TR_SCORE_HOOK=<module>` tests a candidate signal on top of the current model (see `scripts/smart-money`).

Re-run quarterly. Results are hypothetical and carry survivorship bias (today's stock list).
