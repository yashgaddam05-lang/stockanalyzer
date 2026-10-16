import type { getPortfolios } from '@/lib/api';
import type { PortfolioQuote } from '@/lib/portfolio';
import type { StocksContextValue } from '@/components/data/StocksProvider';

/** Types derived from the API client so the UI never imports the Supabase module. */
export type PortfoliosData = Awaited<ReturnType<typeof getPortfolios>>;
export type PortfolioWithPositions = PortfoliosData['portfolios'][number];
export type PortfolioPosition = PortfolioWithPositions['positions'][number];

export const MAX_PORTFOLIOS = 10;
export const MAX_PORTFOLIO_NAME = 60;
export const DEFAULT_PORTFOLIO_NAME = 'My Portfolio';
export const NOTES_MAX = 500;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const shareFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

export function formatMoney(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (compact && Math.abs(value) >= 1_000_000) return usdCompact.format(value);
  return usd.format(value);
}

export function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const s = usd.format(Math.abs(value));
  return value > 0 ? `+${s}` : value < 0 ? `-${s}` : s;
}

/** Formats a decimal ratio (0.123) as a percentage string. */
export function formatPct(value: number | null | undefined, signed = false, dp = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const s = `${(Math.abs(value) * 100).toFixed(dp)}%`;
  if (!signed) return value < 0 ? `-${s}` : s;
  return value > 0 ? `+${s}` : value < 0 ? `-${s}` : s;
}

export function formatShares(value: number): string {
  return shareFmt.format(value);
}

/** Tailwind text color for a profit / loss value. */
export function plColor(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return 'text-neutral-700';
  return value > 0 ? 'text-emerald-700' : 'text-red-700';
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Builds valuePortfolio quotes from the live stock universe (last refreshed prices). */
export function buildQuotes(
  stocks: StocksContextValue['stocks'],
  analyses: StocksContextValue['analyses'],
): Record<string, PortfolioQuote> {
  const quotes: Record<string, PortfolioQuote> = {};
  for (const s of stocks) {
    const a = analyses[s.ticker];
    quotes[s.ticker.toUpperCase()] = {
      current_price: s.current_price,
      sector: s.sector,
      risk_level: a?.riskLabel ?? s.risk_level,
      risk_score: a?.riskScore ?? s.risk_score ?? null,
      three_x_score: a?.totalScore ?? s.three_x_score,
    };
  }
  return quotes;
}

export interface PositionFormValues {
  ticker: string;
  shares: string;
  cost_basis: string;
  opened_at: string;
  notes: string;
}

export type PositionFormErrors = Partial<Record<keyof PositionFormValues | 'portfolio', string>>;

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function validatePositionForm(values: PositionFormValues, today = todayIso()): PositionFormErrors {
  const errors: PositionFormErrors = {};
  const ticker = values.ticker.trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) errors.ticker = 'Enter a valid ticker (letters, up to 10 characters).';

  const shares = Number(values.shares);
  if (values.shares.trim() === '' || !Number.isFinite(shares) || shares <= 0) {
    errors.shares = 'Shares must be greater than 0.';
  }

  const cost = Number(values.cost_basis);
  if (values.cost_basis.trim() === '' || !Number.isFinite(cost) || cost < 0) {
    errors.cost_basis = 'Cost basis must be 0 or more.';
  }

  if (values.opened_at) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.opened_at)) errors.opened_at = 'Enter a valid date.';
    else if (values.opened_at > today) errors.opened_at = 'Date cannot be in the future.';
  }

  if (values.notes.length > NOTES_MAX) errors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  return errors;
}
