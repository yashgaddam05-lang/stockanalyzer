/**
 * Synthetic self-check for runDataQualityChecks. Pure; throws on the first failed assertion.
 * Run: compile with tsc (nodenext) and call runSelfCheck().
 */
import { runDataQualityChecks } from './index.js';
import type { DataQualityInput, DqStockInput } from './index.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`data-quality selfcheck failed: ${msg}`);
}

const NOW = '2026-10-19T13:00:00Z'; // Monday morning ET

function stock(ticker: string, refreshed: string, over: Partial<DqStockInput> = {}): DqStockInput {
  return {
    ticker,
    current_price: 100,
    market_cap: 1e10,
    volatility: 40,
    last_refreshed_at: refreshed,
    three_x_score: 60,
    revenue_growth_yoy: 20,
    sector: 'Technology',
    ...over,
  };
}

function healthy(over: Partial<DataQualityInput> = {}): DataQualityInput {
  const tickers = ['AAA', 'BBB', 'CCC', 'DDD'];
  return {
    now: NOW,
    stocks: tickers.map((t) => stock(t, '2026-10-19T06:00:00Z')),
    coverage: tickers.map((t) => ({ ticker: t, bars: 250, last_d: '2026-10-16' })),
    regimeAsOf: '2026-10-16',
    lastSnapshotAt: '2026-10-19T06:00:00Z',
    filingsLastSyncedAt: '2026-10-18T06:00:00Z',
    runs: [{ job: 'refresh-stocks', started_at: '2026-10-19T06:00:00Z', status: 'success' }],
    ...over,
  };
}

export function runSelfCheck(): string[] {
  const passed: string[] = [];
  const byId = (r: ReturnType<typeof runDataQualityChecks>, id: string) => r.checks.find((c) => c.id === id);

  // Healthy Monday morning (last bar Friday) -> all ok
  const h = runDataQualityChecks(healthy());
  assert(h.overall === 'ok', `healthy Monday overall ok, got ${JSON.stringify(h.checks.filter((c) => c.status !== 'ok'))}`);
  assert(h.checks.length === 9, 'nine checks');
  passed.push('healthy Monday morning ok');

  // All refreshed 3 days ago -> stale_prices fail, overall fail
  const s = runDataQualityChecks(
    healthy({ stocks: ['AAA', 'BBB', 'CCC', 'DDD'].map((t) => stock(t, '2026-10-16T13:00:00Z')) }),
  );
  assert(byId(s, 'stale_prices')?.status === 'fail', 'stale_prices fail');
  assert(s.overall === 'fail', 'overall fail');
  passed.push('all stale -> fail');

  // Invalid / missing / coverage problems -> warn
  const w = runDataQualityChecks(
    healthy({
      stocks: [
        stock('AAA', '2026-10-19T06:00:00Z', { current_price: -1 }),
        stock('BBB', '2026-10-19T06:00:00Z', { volatility: 500 }),
        stock('CCC', '2026-10-19T06:00:00Z', { three_x_score: null }),
        stock('EEE', '2026-10-19T06:00:00Z'),
      ],
      coverage: [
        { ticker: 'AAA', bars: 30, last_d: '2026-10-16' },
        { ticker: 'BBB', bars: 250, last_d: '2026-10-01' },
        { ticker: 'CCC', bars: 250, last_d: '2026-10-16' },
      ],
      regimeAsOf: null,
      runs: [{ job: 'refresh-stocks', started_at: '2026-10-18T06:00:00Z', status: 'failed' }],
    }),
  );
  assert(byId(w, 'invalid_values')?.status === 'warn', 'invalid warn');
  assert(byId(w, 'invalid_values')?.affected?.join() === 'AAA,BBB', 'invalid affected');
  assert(byId(w, 'missing_inputs')?.affected?.join() === 'CCC', 'missing affected');
  assert(byId(w, 'price_daily_coverage')?.affected?.join() === 'AAA,BBB', 'coverage affected');
  assert(byId(w, 'price_daily_missing')?.affected?.join() === 'EEE', 'missing coverage');
  assert(byId(w, 'regime_freshness')?.status === 'warn', 'regime missing warn');
  assert(byId(w, 'recent_run_failures')?.status === 'warn', 'run failure warn');
  assert(w.overall === 'warn', 'overall warn');
  passed.push('warn-level problems');

  // Snapshot age thresholds and affected cap
  const old = runDataQualityChecks(healthy({ lastSnapshotAt: '2026-10-10T00:00:00Z' }));
  assert(byId(old, 'score_history_freshness')?.status === 'fail', 'snapshot >7d fail');
  const mid = runDataQualityChecks(healthy({ lastSnapshotAt: '2026-10-16T00:00:00Z' }));
  assert(byId(mid, 'score_history_freshness')?.status === 'warn', 'snapshot >48h warn');
  const big = runDataQualityChecks(
    healthy({ stocks: Array.from({ length: 40 }, (_, i) => stock(`T${i}`, '2026-10-01T00:00:00Z')), coverage: [] }),
  );
  assert((byId(big, 'stale_prices')?.affected ?? []).length === 25, 'affected capped at 25');
  passed.push('snapshot thresholds and cap');

  return passed;
}
