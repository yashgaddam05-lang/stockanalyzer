import type { BacktestResponse } from '@/lib/supabase';

export { MIN_CAPTURE_DATES } from '@/lib/backtest/engine';

/** Decimal return (0.05) -> "+5.0%". Null/non-finite -> em dash. */
export function formatPct(value: number | null | undefined, opts: { signed?: boolean; digits?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const { signed = true, digits = 1 } = opts;
  const pct = (value * 100).toFixed(digits);
  return signed && value > 0 ? `+${pct}%` : `${pct}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function returnTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'text-neutral-700';
  return value > 0 ? 'text-emerald-700' : 'text-red-700';
}

/**
 * Distinct UTC score dates, if the backend sends them. Not part of the shared contract yet
 * (proposed to the contract owners); unknown -> null so callers never guess from snapshots.
 */
export function sampleDates(sample: BacktestResponse['sample']): number | null {
  const v = (sample as { dates?: unknown }).dates;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Rows with SPY closes in a band (base of mean_excess_vs_spy) if sent, else the band's n. */
export function bucketExcessWeight(bucket: BacktestResponse['buckets'][number]): number {
  const v = (bucket as { n_excess?: unknown }).n_excess;
  return typeof v === 'number' && Number.isFinite(v) ? v : bucket.n;
}
