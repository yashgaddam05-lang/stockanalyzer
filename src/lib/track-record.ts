// Historical track record: the 3x model reconstructed point-in-time since 2016 vs the S&P 500.
// Generated offline (see scripts/track-record) into public/data/track-record.json.

export type SeriesKey = 'top10' | 'top20' | 'top50' | 'universe' | 'spy';

export interface SeriesStats {
  totalReturn: number;
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  sharpe: number | null;
  endValue: number;
  yearly: Record<string, number>;
}

export interface TrackRecord {
  generatedAt: string;
  modelVersion: string;
  start: string;
  end: string;
  universeSize: number;
  rebalance: string;
  sizes: number[];
  summary: Record<SeriesKey, SeriesStats>;
  beatRate: Record<string, number>;
  curves: Record<SeriesKey, { d: string; v: number }[]>;
  quarters: { date: string; eligible: number; picks: [string, number][]; ret: Record<SeriesKey, number> }[];
}

export const SERIES: { key: SeriesKey; label: string; short: string; color: string; dashed?: boolean; strategy: boolean }[] = [
  { key: 'top10', label: '3x Hunter Top 10', short: 'Top 10', color: '#0f766e', strategy: true },
  { key: 'top20', label: '3x Hunter Top 20', short: 'Top 20', color: '#171717', strategy: true },
  { key: 'top50', label: '3x Hunter Top 50', short: 'Top 50', color: '#2563eb', strategy: true },
  { key: 'universe', label: 'Same stocks, equal weight', short: 'Equal weight', color: '#a3a3a3', dashed: true, strategy: false },
  { key: 'spy', label: 'S&P 500 (SPY)', short: 'S&P 500', color: '#d97706', strategy: false },
];

let cache: Promise<TrackRecord> | null = null;

export function loadTrackRecord(): Promise<TrackRecord> {
  cache ??= fetch('/data/track-record.json').then((r) => {
    if (!r.ok) throw new Error('Track record unavailable.');
    return r.json() as Promise<TrackRecord>;
  });
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

/** Strategy with the highest total return. */
export function bestStrategy(t: TrackRecord): SeriesKey {
  return (['top10', 'top20', 'top50'] as const).reduce((best, k) => (t.summary[k].totalReturn > t.summary[best].totalReturn ? k : best), 'top10' as SeriesKey);
}

export const money = (v: number) =>
  `$${(v * 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; // curve starts at 100 = $10,000
export const signedPct = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
