# Track record (2016 to now)

Rebuilds the 3x score point-in-time for every quarter since 2016 and backtests Top 10/20/50 vs SPY.
Output: `public/data/track-record.json`, read by `/track-record` and the landing page.

1. Prices come from Yahoo, which rate-limits local machines, so the backfill calls a temporary
   Supabase edge function `history-backfill` (redeploy it from git history of this README's commit,
   run, then retire it). SEC companyfacts are fetched directly.
   `node scripts/track-record/backfill.mjs` → `scripts/track-record/data/` (gitignored)
2. `npx tsx --tsconfig tsconfig.app.json scripts/track-record/compute.ts public/data/track-record.json`

Re-run quarterly. Results are hypothetical and carry survivorship bias (today's stock list).
