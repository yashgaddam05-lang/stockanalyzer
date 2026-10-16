import type { RegimeLabel } from '@/lib/supabase';

export const REGIME_LABEL_TEXT: Record<RegimeLabel, string> = {
  risk_on: 'Risk-on',
  neutral: 'Neutral',
  risk_off: 'Risk-off',
  insufficient_data: 'Insufficient data',
};

export const REGIME_LABEL_CLASS: Record<RegimeLabel, string> = {
  risk_on: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  neutral: 'border-neutral-200 bg-neutral-100 text-neutral-700',
  risk_off: 'border-amber-200 bg-amber-50 text-amber-800',
  insufficient_data: 'border-neutral-200 bg-neutral-50 text-muted-foreground',
};

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  return isFiniteNumber(v) ? v.toFixed(digits) : '—';
}

export function fmtSigned(v: number | null | undefined, digits = 1, suffix = ''): string {
  if (!isFiniteNumber(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}${suffix}`;
}

export function signClass(v: number | null | undefined): string {
  if (!isFiniteNumber(v) || v === 0) return 'text-neutral-700';
  return v > 0 ? 'text-emerald-700' : 'text-amber-700';
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // as_of is YYYY-MM-DD; parse as local date to avoid timezone day shifts.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const REGIME_EMPTY_MESSAGE = 'Regime data appears after the next daily refresh';
