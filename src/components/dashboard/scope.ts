import type { DashboardScope } from '@/lib/supabase';

export const SCOPE_OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: 'mine', label: 'My stocks' },
  { value: 'sp500', label: 'S&P 500' },
  { value: 'all', label: 'All tracked' },
];

export const DEFAULT_SCOPE: DashboardScope = 'sp500';

export function isScope(v: unknown): v is DashboardScope {
  return v === 'mine' || v === 'sp500' || v === 'all';
}

/** Noun phrase used in section titles, e.g. "Top opportunities in your stocks". */
export function scopePhrase(scope: DashboardScope): string {
  if (scope === 'mine') return 'your stocks';
  if (scope === 'sp500') return 'the S&P 500';
  return 'all tracked stocks';
}

/** Appends `scope` to an /app/explore link so the destination shows the same universe. */
export function withScope(href: string, scope: DashboardScope | undefined): string {
  if (!scope) return href;
  return `${href}${href.includes('?') ? '&' : '?'}scope=${scope}`;
}
