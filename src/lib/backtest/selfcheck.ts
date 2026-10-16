/**
 * Self-check for the backtest aggregator on synthetic data. Pure, no I/O.
 *
 *   case        expectation
 *   empty       available true, sufficient false, 4 buckets n=0 with null stats,
 *               IC null, top_vs_bottom null, caveats non-empty
 *   monotonic   6 dates x 12 tickers, return rises with score -> IC = 1,
 *               top_vs_bottom.spread > 0, sufficient true
 *   bad closes  rows with NaN / 0 / negative closes are dropped from the count
 *
 * Run: compile with tsc (nodenext) and call runSelfCheck(); it returns the
 * list of failed assertions (empty = pass).
 */
import { aggregateBacktest } from './engine.js';
import type { BacktestResult, ForwardObservation } from './engine.js';

const OPTS = { horizonDays: 21 as const, modelVersion: 'v2', versions: ['v2'], now: '2026-10-16T00:00:00Z' };

function obs(
  ticker: string,
  date: string,
  score: number,
  entry: number,
  exit: number,
  spy: [number | null, number | null] = [400, 404],
): ForwardObservation {
  return {
    ticker,
    captured_at: `${date}T21:00:00Z`,
    three_x_score: score,
    risk_score: null,
    entry_date: date,
    entry_close: entry,
    exit_date: date,
    exit_close: exit,
    spy_entry_close: spy[0],
    spy_exit_close: spy[1],
  };
}

export function monotonicFixture(dates = 6, tickers = 12): ForwardObservation[] {
  const out: ForwardObservation[] = [];
  for (let d = 0; d < dates; d++) {
    const date = `2026-10-${String(15 + d).padStart(2, '0')}`;
    for (let t = 0; t < tickers; t++) {
      const score = 10 + Math.round((t * 85) / (tickers - 1)); // 10..95
      const ret = -0.1 + 0.02 * t + 0.001 * d; // strictly rising with score
      out.push(obs(`T${t}`, date, score, 100, 100 * (1 + ret)));
    }
  }
  return out;
}

export type SelfCheckReport = {
  empty: BacktestResult;
  monotonic: BacktestResult;
  badCloses: BacktestResult;
  failures: string[];
};

export function runSelfCheck(): SelfCheckReport {
  const failures: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) failures.push(msg);
  };

  const empty = aggregateBacktest([], OPTS);
  check(empty.available === true, 'empty: available should be true');
  check(empty.sufficient === false, 'empty: sufficient should be false');
  check(empty.buckets.length === 4, 'empty: 4 buckets');
  check(
    empty.buckets.every((b) => b.n === 0 && b.mean_return === null && b.median_return === null && b.hit_rate === null),
    'empty: buckets n=0 with null stats',
  );
  check(empty.information_coefficient === null, 'empty: IC null');
  check(empty.top_vs_bottom === null, 'empty: top_vs_bottom null');
  check(empty.caveats.length > 0, 'empty: caveats non-empty');

  const mono = monotonicFixture();
  const monotonic = aggregateBacktest(mono, OPTS);
  check((monotonic.information_coefficient ?? 0) > 0.9, 'monotonic: IC > 0.9');
  check((monotonic.top_vs_bottom?.spread ?? 0) > 0, 'monotonic: spread > 0');
  check(monotonic.sufficient === true, 'monotonic: sufficient');
  check(monotonic.sample.observations === 72, 'monotonic: 72 observations');
  check(monotonic.sample.dates === 6, 'monotonic: 6 dates');

  // Several captured_at timestamps per day (chunked inserts) must not inflate the date count.
  const chunked = mono.slice(0, 24).map((o, i) => ({ ...o, captured_at: `${o.captured_at.slice(0, 10)}T21:00:0${i % 3}Z` }));
  const chunkedRes = aggregateBacktest(chunked, OPTS);
  check(chunkedRes.sample.dates === 2, 'chunked: 2 dates');
  check(chunkedRes.sample.snapshots === 6, 'chunked: 6 snapshots');
  check(chunkedRes.sufficient === false, 'chunked: insufficient on 2 dates');

  // Missing SPY closes: n_excess counts only rows with SPY data.
  const partialSpy = mono.map((o, i) => (i % 2 ? { ...o, spy_entry_close: null } : o));
  const partialRes = aggregateBacktest(partialSpy, OPTS);
  check(
    partialRes.buckets.reduce((a, b) => a + b.n_excess, 0) === 36,
    'partial spy: n_excess sums to rows with SPY closes',
  );

  const bad: ForwardObservation[] = [
    ...mono,
    obs('BAD1', '2026-10-15', 50, Number.NaN, 100),
    obs('BAD2', '2026-10-15', 50, 0, 100),
    obs('BAD3', '2026-10-15', 50, 100, -5),
    obs('BAD4', '2026-10-15', 50, 100, Number.POSITIVE_INFINITY),
    obs('BAD5', '2026-10-15', Number.NaN, 100, 110),
  ];
  const badCloses = aggregateBacktest(bad, OPTS);
  check(badCloses.sample.observations === 72, 'bad closes: dropped');
  check(badCloses.sample.tickers === 12, 'bad closes: ticker count unchanged');
  check(badCloses.information_coefficient === monotonic.information_coefficient, 'bad closes: IC unchanged');

  return { empty, monotonic, badCloses, failures };
}
