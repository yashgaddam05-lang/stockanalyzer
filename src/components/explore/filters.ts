import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { applyPresetScreen, computeRiskScore, getPresetScreen, scoreStock } from '@/lib/scoring';
import type { ScoredStock } from '@/lib/scoring';

export type CapBucket = 'all' | 'small' | 'mid' | 'large' | 'mega';
export type SourceFilter = 'all' | 'live' | 'seed';
export type RiskFilter = 'all' | 'low' | 'medium' | 'high' | 'extreme';
export type SortKey = 'score' | 'score_change' | 'risk' | 'momentum' | 'revenue_growth' | 'market_cap';

export interface ExploreFilters {
  query: string;
  sector: string;
  risk: RiskFilter;
  cap: CapBucket;
  source: SourceFilter;
  watchOnly: boolean;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  query: '',
  sector: 'all',
  risk: 'all',
  cap: 'all',
  source: 'all',
  watchOnly: false,
};

export const CAP_OPTIONS: { value: CapBucket; label: string }[] = [
  { value: 'all', label: 'All Market Caps' },
  { value: 'small', label: 'Small (<$2B)' },
  { value: 'mid', label: 'Mid ($2-10B)' },
  { value: 'large', label: 'Large ($10-200B)' },
  { value: 'mega', label: 'Mega (>$200B)' },
];

export const RISK_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'low', label: 'Low Risk' },
  { value: 'medium', label: 'Medium Risk' },
  { value: 'high', label: 'High Risk' },
  { value: 'extreme', label: 'Extreme Risk' },
];

export const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All Data' },
  { value: 'live', label: 'Live data' },
  { value: 'seed', label: 'Seed data' },
];

/** Sort options; risk sorts ascending (safest first), everything else descending. */
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: '3x Score' },
  { key: 'score_change', label: 'Score Change' },
  { key: 'risk', label: 'Risk (low first)' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'revenue_growth', label: 'Revenue Growth' },
  { key: 'market_cap', label: 'Market Cap' },
];

export function capBucket(marketCap: number | null | undefined): Exclude<CapBucket, 'all'> | null {
  if (typeof marketCap !== 'number' || !Number.isFinite(marketCap) || marketCap <= 0) return null;
  if (marketCap < 2e9) return 'small';
  if (marketCap < 10e9) return 'mid';
  if (marketCap < 200e9) return 'large';
  return 'mega';
}

export function isLive(stock: StockListItem): boolean {
  return stock.data_source === 'yahoo';
}

export interface ExploreRow {
  stock: StockListItem;
  analysis: AnalysisResult;
  scored: ScoredStock;
}

export function buildRows(stocks: StockListItem[], analyses: Record<string, AnalysisResult>): ExploreRow[] {
  return stocks
    .filter((s) => analyses[s.ticker])
    .map((stock) => ({
      stock,
      analysis: analyses[stock.ticker],
      scored: { stock, score: scoreStock(stock), risk: computeRiskScore(stock) },
    }));
}

/** Applies a preset (filter + its own ordering). Unknown ids return rows unchanged. */
export function applyPreset(rows: ExploreRow[], presetId: string | null): ExploreRow[] {
  if (!presetId || !getPresetScreen(presetId)) return rows;
  const byScored = new Map(rows.map((r) => [r.scored, r]));
  return applyPresetScreen(
    presetId,
    rows.map((r) => r.scored),
  ).map((s) => byScored.get(s) as ExploreRow);
}

export function applyFilters(rows: ExploreRow[], f: ExploreFilters, watchlist: Set<string>): ExploreRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(({ stock, analysis }) => {
    if (q) {
      const hay = `${stock.ticker} ${stock.company_name} ${stock.industry ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.sector !== 'all' && stock.sector !== f.sector) return false;
    if (f.risk !== 'all' && analysis.riskLabel !== f.risk) return false;
    if (f.cap !== 'all' && capBucket(stock.market_cap) !== f.cap) return false;
    if (f.source === 'live' && !isLive(stock)) return false;
    if (f.source === 'seed' && isLive(stock)) return false;
    if (f.watchOnly && !watchlist.has(stock.ticker.toUpperCase())) return false;
    return true;
  });
}

const n = (v: number | null | undefined, fallback = -Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function sortRows(rows: ExploreRow[], key: SortKey): ExploreRow[] {
  const out = [...rows];
  const cmp: Record<SortKey, (a: ExploreRow, b: ExploreRow) => number> = {
    score: (a, b) => b.analysis.totalScore - a.analysis.totalScore,
    score_change: (a, b) => n(b.stock.score_change) - n(a.stock.score_change),
    risk: (a, b) => a.analysis.riskScore - b.analysis.riskScore,
    momentum: (a, b) => n(b.stock.momentum_score) - n(a.stock.momentum_score),
    revenue_growth: (a, b) => n(b.stock.revenue_growth_yoy) - n(a.stock.revenue_growth_yoy),
    market_cap: (a, b) => n(b.stock.market_cap) - n(a.stock.market_cap),
  };
  return out.sort((a, b) => cmp[key](a, b) || b.analysis.totalScore - a.analysis.totalScore);
}

export function isSortKey(v: string | null): v is SortKey {
  return !!v && SORT_OPTIONS.some((o) => o.key === v);
}

export function pickOption<T extends string>(v: string | null, options: { value: T }[], fallback: T): T {
  return (options.find((o) => o.value === v)?.value ?? fallback) as T;
}

export function hasActiveFilters(f: ExploreFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.sector !== 'all' ||
    f.risk !== 'all' ||
    f.cap !== 'all' ||
    f.source !== 'all' ||
    f.watchOnly
  );
}
