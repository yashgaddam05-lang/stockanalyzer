import type { CheckStatus, RefreshRun } from '@/lib/supabase';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses an ISO timestamp or a YYYY-MM-DD date (as local midnight). Returns null when invalid. */
export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

export function formatRelative(value: string | null | undefined, now: number = Date.now()): string {
  const d = parseTime(value);
  if (!d || !value) return 'Never';
  if (isDateOnly(value)) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days > 1) return `${days} days ago`;
    return days === -1 ? 'Tomorrow' : `In ${-days} days`;
  }
  const diffSec = Math.round((now - d.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? 'ago' : 'from now';
  if (abs < 45) return diffSec >= 0 ? 'Just now' : 'In a moment';
  if (abs < 3600) return `${Math.round(abs / 60)}m ${suffix}`;
  if (abs < 86_400) return `${Math.round(abs / 3600)}h ${suffix}`;
  return `${Math.round(abs / 86_400)}d ${suffix}`;
}

export function formatAbsolute(value: string | null | undefined): string {
  const d = parseTime(value);
  if (!d || !value) return 'No timestamp recorded';
  if (isDateOnly(value)) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatDuration(run: Pick<RefreshRun, 'started_at' | 'finished_at'>): string {
  const start = parseTime(run.started_at);
  const end = parseTime(run.finished_at);
  if (!start) return '—';
  if (!end) return 'Running';
  const sec = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export type Tone = 'ok' | 'warn' | 'fail';

export const TONE_STYLES: Record<Tone, { badge: string; banner: string; dot: string; text: string }> = {
  ok: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    banner: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
  },
  warn: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    banner: 'border-amber-200 bg-amber-50 text-amber-900',
    dot: 'bg-amber-500',
    text: 'text-amber-800',
  },
  fail: {
    badge: 'border-red-200 bg-red-50 text-red-700',
    banner: 'border-red-200 bg-red-50 text-red-900',
    dot: 'bg-red-500',
    text: 'text-red-700',
  },
};

export const CHECK_LABELS: Record<CheckStatus, string> = { ok: 'OK', warn: 'Warning', fail: 'Failing' };

export function runTone(status: RefreshRun['status']): Tone {
  if (status === 'ok') return 'ok';
  if (status === 'partial') return 'warn';
  return 'fail';
}

export const RUN_LABELS: Record<RefreshRun['status'], string> = { ok: 'OK', partial: 'Partial', failed: 'Failed' };

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatStatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : null;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 37)}...` : value;
  if (Array.isArray(value)) return `${value.length} items`;
  return null;
}

/** Picks up to `limit` scalar stats from a run's stats bag for compact display. */
export function keyStats(stats: Record<string, unknown> | null | undefined, limit = 4): { key: string; label: string; value: string }[] {
  if (!stats || typeof stats !== 'object') return [];
  const out: { key: string; label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(stats)) {
    const value = formatStatValue(raw);
    if (value === null) continue;
    out.push({ key, label: humanizeKey(key), value });
    if (out.length >= limit) break;
  }
  return out;
}
