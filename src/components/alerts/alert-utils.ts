import { ApiError } from '@/lib/api';
import type { AlertKind } from '@/lib/supabase';

export const ALERTS_DISCLAIMER = 'In-app notifications only. Alerts are informational and not investment advice.';
export const ALERTS_UNAVAILABLE = 'Alerts will be available after the next database update';

export const ALERT_KINDS: AlertKind[] = [
  'score_above',
  'score_below',
  'score_change',
  'price_above',
  'price_below',
  'catalyst_within',
];

export const KIND_LABELS: Record<AlertKind, string> = {
  score_above: 'Score rises above',
  score_below: 'Score falls below',
  score_change: 'Score changes by at least',
  price_above: 'Price rises above',
  price_below: 'Price falls below',
  catalyst_within: 'Catalyst within',
};

export const KIND_UNITS: Record<AlertKind, string> = {
  score_above: 'points (0-100)',
  score_below: 'points (0-100)',
  score_change: 'points (1-50)',
  price_above: 'USD',
  price_below: 'USD',
  catalyst_within: 'days (1-90)',
};

/** Client-side mirror of the API bounds. Returns an error message or null when valid. */
export function validateThreshold(kind: AlertKind, value: number): string | null {
  if (!Number.isFinite(value)) return 'Enter a number.';
  switch (kind) {
    case 'score_above':
    case 'score_below':
      return value >= 0 && value <= 100 ? null : 'Score must be between 0 and 100.';
    case 'score_change':
      return value >= 1 && value <= 50 ? null : 'Score change must be between 1 and 50 points.';
    case 'price_above':
    case 'price_below':
      return value > 0 ? null : 'Price must be greater than 0.';
    case 'catalyst_within':
      if (!Number.isInteger(value)) return 'Days must be a whole number.';
      return value >= 1 && value <= 90 ? null : 'Days must be between 1 and 90.';
    default:
      return 'Unknown alert type.';
  }
}

export function inputStep(kind: AlertKind): string {
  if (kind === 'price_above' || kind === 'price_below') return '0.01';
  return '1';
}

export function formatThreshold(kind: AlertKind, value: number): string {
  switch (kind) {
    case 'price_above':
    case 'price_below':
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'score_change':
      return `${value} pts`;
    case 'catalyst_within':
      return `${value} ${value === 1 ? 'day' : 'days'}`;
    default:
      return String(value);
  }
}

/** Suggested starting threshold for a kind, based on the stock's current values. */
export function suggestThreshold(kind: AlertKind, price?: number | null, score?: number | null): string {
  switch (kind) {
    case 'score_above':
      return typeof score === 'number' ? String(Math.min(100, Math.round(score) + 5)) : '70';
    case 'score_below':
      return typeof score === 'number' ? String(Math.max(0, Math.round(score) - 5)) : '40';
    case 'score_change':
      return '10';
    case 'price_above':
      return typeof price === 'number' && price > 0 ? (price * 1.1).toFixed(2) : '';
    case 'price_below':
      return typeof price === 'number' && price > 0 ? (price * 0.9).toFixed(2) : '';
    case 'catalyst_within':
      return '14';
    default:
      return '';
  }
}

export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const diff = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(then).toLocaleDateString();
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) return 'Please sign in to manage alerts.';
  return err instanceof Error && err.message ? err.message : fallback;
}

export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
