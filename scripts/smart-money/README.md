# Smart Money backtest

Tests whether specialist healthcare fund ownership (SEC 13F) and C-suite insider buying (Form 4)
predict returns, under the track-record rules: point-in-time S&P 500 members, quarterly rebalance,
and each 13F or Form 4 counted only from its SEC filing date (13Fs arrive up to 45 days after quarter end).

`managers.json` is the fixed manager list (same rows as migration `20261026120000_smart_money.sql`).

1. `node scripts/smart-money/fetch-13f.mjs`: every 13F-HR info table since 2015 plus OpenFIGI CUSIP to
   ticker map → `data/` (gitignored, resumable, about 45 minutes at SEC's rate limit).
2. `node scripts/smart-money/fetch-insiders.mjs`: SEC quarterly Form 345 data sets → `data/insider-buys.json`.
   Needs `scripts/track-record/data/universe.json` (track-record step 1).
3. Signal test: `npx tsx --tsconfig tsconfig.app.json scripts/smart-money/backtest.ts`
4. Model test: v2.2 plus a candidate dimension through the track-record hook:
   `TR_SCORE_HOOK=./scripts/smart-money/hook.ts SM_VARIANT=holders+delta SM_WEIGHT=8 npx tsx --tsconfig tsconfig.app.json scripts/track-record/compute.ts out.json bots.json`
   and compare with the same command without `TR_SCORE_HOOK`.

Results and the ship decision are in `PROGRESS.md` (Smart Money).
