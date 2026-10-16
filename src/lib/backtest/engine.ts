/**
 * Score backtest aggregation. Pure and deterministic: takes rows from the SQL
 * function score_forward_returns and summarises how forward returns line up
 * with the 3x Opportunity Score. No I/O. The only clock read is
 * `new Date()` for generated_at, and only when opts.now is absent.
 *
 * Types are local on purpose (the API contracts land in the same wave); the
 * result is structurally identical to BacktestResponse.
 */

/** One row of score_forward_returns. */
export type ForwardObservation = {
  ticker: string;
  captured_at: string;
  three_x_score: number;
  risk_score: number | null;
  entry_date: string;
  entry_close: number;
  exit_date: string;
  exit_close: number;
  spy_entry_close: number | null;
  spy_exit_close: number | null;
};

export type HorizonDays = 5 | 21 | 63;

export type BacktestOptions = {
  horizonDays: HorizonDays;
  modelVersion: string;
  versions: string[];
  /** Default 30. */
  minObservations?: number;
  /** ISO timestamp for generated_at; falls back to the current time. */
  now?: string;
};

export type BacktestBucket = {
  label: string;
  min_score: number;
  max_score: number;
  n: number;
  mean_return: number | null;
  median_return: number | null;
  hit_rate: number | null;
  /** Mean over the n_excess rows that have SPY closes, not over all n. */
  mean_excess_vs_spy: number | null;
  /** Rows in this band with SPY entry and exit closes (the base of mean_excess_vs_spy). */
  n_excess: number;
};

export type BacktestSample = {
  /** Distinct captured_at timestamps (several per day: chunked inserts, repeat refreshes). */
  snapshots: number;
  /** Distinct UTC score dates (captured_at day); the sufficiency rule counts these. */
  dates: number;
  observations: number;
  tickers: number;
  first_date: string | null;
  last_date: string | null;
};

export type BacktestTopVsBottom = {
  spread: number;
  n_top: number;
  n_bottom: number;
};

export type BacktestResult = {
  available: boolean;
  model_version: string;
  versions: string[];
  horizon_days: number;
  generated_at: string;
  sample: BacktestSample;
  buckets: BacktestBucket[];
  top_vs_bottom: BacktestTopVsBottom | null;
  information_coefficient: number | null;
  sufficient: boolean;
  min_observations: number;
  caveats: string[];
};

/** Fixed, interpretable score bands (inclusive integer bounds). */
export const SCORE_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '0-39', min: 0, max: 39 },
  { label: '40-54', min: 40, max: 54 },
  { label: '55-69', min: 55, max: 69 },
  { label: '70-100', min: 70, max: 100 },
];

export const DEFAULT_MIN_OBSERVATIONS = 30;
export const MIN_CAPTURE_DATES = 5;
export const MIN_TICKERS_PER_DATE = 5;
export const MIN_PER_QUINTILE_SIDE = 10;
export const SCORE_HISTORY_START = '2026-10-15';

export const BASE_CAVEATS: readonly string[] = [
  `Score history only starts ${SCORE_HISTORY_START}, so the sample is small and results are noisy.`,
  "Entries use the next session's close after the score date (no look-ahead), with adjusted closes where available.",
  'Observations from consecutive days overlap and are not independent, so effective sample size is smaller than the count.',
  'Survivorship bias: only the current universe is tested; delisted names are absent.',
  'Same model version only; no transaction costs or slippage are included.',
  'Past results do not predict future returns.',
  'Educational research only, not investment advice.',
];

type CleanObs = {
  ticker: string;
  date: string;
  capturedAt: string;
  score: number;
  ret: number;
  excess: number | null;
};

const isPosFinite = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0;

function round(x: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const roundOrNull = (x: number | null): number | null => (x === null ? null : round(x));

function clean(obs: ForwardObservation[]): CleanObs[] {
  const out: CleanObs[] = [];
  for (const o of obs) {
    if (!o || typeof o.ticker !== 'string' || typeof o.captured_at !== 'string') continue;
    if (typeof o.three_x_score !== 'number' || !Number.isFinite(o.three_x_score)) continue;
    if (!isPosFinite(o.entry_close) || !isPosFinite(o.exit_close)) continue;
    const ret = o.exit_close / o.entry_close - 1;
    let excess: number | null = null;
    if (isPosFinite(o.spy_entry_close) && isPosFinite(o.spy_exit_close)) {
      excess = ret - (o.spy_exit_close / o.spy_entry_close - 1);
    }
    out.push({
      ticker: o.ticker,
      date: o.captured_at.slice(0, 10),
      capturedAt: o.captured_at,
      score: o.three_x_score,
      ret,
      excess,
    });
  }
  return out;
}

function bandIndex(score: number): number {
  if (score < 40) return 0;
  if (score < 55) return 1;
  if (score < 70) return 2;
  return 3;
}

function buildBuckets(rows: CleanObs[]): BacktestBucket[] {
  const groups: CleanObs[][] = SCORE_BANDS.map(() => []);
  for (const r of rows) groups[bandIndex(r.score)].push(r);
  return SCORE_BANDS.map((b, i) => {
    const g = groups[i];
    const rets = g.map((r) => r.ret);
    const excess = g.flatMap((r) => (r.excess === null ? [] : [r.excess]));
    return {
      label: b.label,
      min_score: b.min,
      max_score: b.max,
      n: g.length,
      mean_return: roundOrNull(mean(rets)),
      median_return: roundOrNull(median(rets)),
      hit_rate: g.length ? round(rets.filter((x) => x > 0).length / g.length) : null,
      mean_excess_vs_spy: roundOrNull(mean(excess)),
      n_excess: excess.length,
    };
  });
}

function topVsBottom(rows: CleanObs[]): BacktestTopVsBottom | null {
  const q = Math.floor(rows.length / 5);
  if (q < MIN_PER_QUINTILE_SIDE) return null;
  // Stable tie-break on ticker/date keeps the split deterministic.
  const sorted = [...rows].sort(
    (a, b) => a.score - b.score || a.ticker.localeCompare(b.ticker) || a.capturedAt.localeCompare(b.capturedAt),
  );
  const bottom = sorted.slice(0, q).map((r) => r.ret);
  const top = sorted.slice(sorted.length - q).map((r) => r.ret);
  const mt = mean(top);
  const mb = mean(bottom);
  if (mt === null || mb === null) return null;
  return { spread: round(mt - mb), n_top: top.length, n_bottom: bottom.length };
}

/** Average ranks (1-based), ties share the mean rank. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation; null when either side has zero variance. */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = mean(rx) as number;
  const my = mean(ry) as number;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function informationCoefficient(rows: CleanObs[]): number | null {
  const byDate = new Map<string, CleanObs[]>();
  for (const r of rows) {
    const g = byDate.get(r.date);
    if (g) g.push(r);
    else byDate.set(r.date, [r]);
  }
  const ics: number[] = [];
  for (const g of byDate.values()) {
    if (new Set(g.map((r) => r.ticker)).size < MIN_TICKERS_PER_DATE) continue;
    const ic = spearman(
      g.map((r) => r.score),
      g.map((r) => r.ret),
    );
    if (ic !== null) ics.push(ic);
  }
  return roundOrNull(mean(ics));
}

export function aggregateBacktest(obs: ForwardObservation[], opts: BacktestOptions): BacktestResult {
  const minObservations = opts.minObservations ?? DEFAULT_MIN_OBSERVATIONS;
  const rows = clean(Array.isArray(obs) ? obs : []);

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const snapshots = new Set(rows.map((r) => r.capturedAt)).size;
  const tickers = new Set(rows.map((r) => r.ticker)).size;

  const sufficient = rows.length >= minObservations && dates.length >= MIN_CAPTURE_DATES;

  const caveats = [...BASE_CAVEATS];
  if (!sufficient) {
    caveats.unshift(
      `Insufficient data: ${rows.length} observations across ${dates.length} score dates ` +
        `(need at least ${minObservations} observations and ${MIN_CAPTURE_DATES} dates). ` +
        'Treat every statistic below as unreliable.',
    );
  }

  return {
    available: true,
    model_version: opts.modelVersion,
    versions: [...opts.versions],
    horizon_days: opts.horizonDays,
    generated_at: opts.now ?? new Date().toISOString(),
    sample: {
      snapshots,
      dates: dates.length,
      observations: rows.length,
      tickers,
      first_date: dates.length ? dates[0] : null,
      last_date: dates.length ? dates[dates.length - 1] : null,
    },
    buckets: buildBuckets(rows),
    top_vs_bottom: topVsBottom(rows),
    information_coefficient: informationCoefficient(rows),
    sufficient,
    min_observations: minObservations,
    caveats,
  };
}
