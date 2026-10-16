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

export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
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

/** Mirrors MIN_CAPTURE_DATES in src/lib/backtest/engine.ts. */
export const MIN_CAPTURE_DATES = 5;
