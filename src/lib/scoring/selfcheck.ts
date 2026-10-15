/**
 * Self-check for model v2 on three seeded tickers (values copied from
 * supabase/migrations/20261012191154_create_stocks_and_watchlist.sql and the
 * backfill in 20261015120200_expand_universe_seed.sql).
 *
 *   ticker  v1 total  v2 total  confidence (avail wt)  risk v2
 *   NVDA    81        75        high (95)             20 low
 *   CRSP    94        72        high (95)             40 medium
 *   RGTI    49        55        medium (77)           69 high
 *
 *   v2 dimension scores (0-100):
 *   NVDA growth 100, valuation 60, momentum 92, quality 98, catalyst 7,  position 96, risk 52, regime n/a
 *   CRSP growth 100, valuation 15, momentum 82, quality 99, catalyst 85, position 58, risk 74, regime n/a
 *   RGTI growth 34,  valuation n/a, momentum 55, quality 67, catalyst 40, position 70, risk 95, regime n/a
 *
 *   Why: v1 summed uncapped growth (45 of 100 pts) so hyper-growth names saturated;
 *   v2 caps growth at 20% weight and adds valuation (CRSP P/S 90 drags it down),
 *   market position and a separate risk score.
 *
 * Run: compile with tsc (nodenext) and call runSelfCheck(), or import it in a
 * test. Pure — no I/O.
 */
import type { Stock } from '../supabase.js';
import { scoreStock } from './model.js';
import type { ScoreResult } from './model.js';
import { computeRiskScore } from './risk.js';
import type { RiskResult } from './risk.js';

const base = {
  thesis: '',
  updated_at: '2026-10-15T00:00:00Z',
  data_source: 'seed' as const,
};

export const FIXTURES: Stock[] = [
  {
    ...base,
    id: 'fixture-nvda',
    ticker: 'NVDA',
    company_name: 'NVIDIA Corporation',
    sector: 'Tech',
    market_cap: 2300000000000,
    current_price: 935,
    revenue_growth_yoy: 206,
    earnings_growth_yoy: 286,
    momentum_score: 92,
    volatility: 52,
    debt_to_equity: 0.04,
    beta: 1.68,
    rd_ratio: 7.2,
    pipeline_count: 0,
    cash_runway_months: 200,
    three_x_score: 85,
    risk_level: 'medium',
    industry: 'Semiconductors',
    forward_pe: 40,
    price_to_sales: 25,
    peg_ratio: 1,
    gross_margin: 72,
    operating_margin: 60,
    profit_margin: 53,
    avg_volume: 180000000,
  },
  {
    ...base,
    id: 'fixture-crsp',
    ticker: 'CRSP',
    company_name: 'Crispr Therapeutics AG',
    sector: 'Biotech',
    market_cap: 4200000000,
    current_price: 52.1,
    revenue_growth_yoy: 287.5,
    earnings_growth_yoy: 156.3,
    momentum_score: 82,
    volatility: 68,
    debt_to_equity: 0.05,
    beta: 2.15,
    rd_ratio: 45,
    pipeline_count: 6,
    cash_runway_months: 60,
    three_x_score: 81,
    risk_level: 'high',
    industry: 'Biotechnology',
    price_to_sales: 90,
    avg_volume: 2000000,
  },
  {
    ...base,
    id: 'fixture-rgti',
    ticker: 'RGTI',
    company_name: 'Rigetti Computing',
    sector: 'Quantum',
    market_cap: 350000000,
    current_price: 1.85,
    revenue_growth_yoy: 15,
    earnings_growth_yoy: -20,
    momentum_score: 55,
    volatility: 85,
    debt_to_equity: 0.12,
    beta: 2.8,
    rd_ratio: 40,
    pipeline_count: 0,
    cash_runway_months: 28,
    three_x_score: 57,
    risk_level: 'extreme',
    industry: 'Computer Hardware',
    avg_volume: 40000000,
  },
];

export interface SelfCheckRow {
  ticker: string;
  total: number;
  confidence: ScoreResult['confidence'];
  availableWeight: number;
  dimensions: Record<string, number | null>;
  risk: Pick<RiskResult, 'score' | 'label'>;
}

export function runSelfCheck(): SelfCheckRow[] {
  return FIXTURES.map((s) => {
    const score = scoreStock(s);
    const risk = computeRiskScore(s);
    return {
      ticker: s.ticker,
      total: score.total,
      confidence: score.confidence,
      availableWeight: score.availableWeight,
      dimensions: Object.fromEntries(score.dimensions.map((d) => [d.key, d.score])),
      risk: { score: risk.score, label: risk.label },
    };
  });
}
