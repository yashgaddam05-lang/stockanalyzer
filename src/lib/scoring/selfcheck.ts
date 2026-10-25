/**
 * Self-check for model v2 on three seeded tickers (values copied from
 * supabase/migrations/20261012191154_create_stocks_and_watchlist.sql and the
 * backfill in 20261015192133_expand_universe_seed.sql).
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
 *   v2.1 (regime dimension, weight 5) on synthetic 260-bar series below:
 *   regime (risk appetite)  ticker  fit  total v2.0 -> v2.1
 *   risk_on  (76)           NVDA    58   75 -> 74
 *   risk_on  (76)           CRSP    67   72 -> 72
 *   risk_on  (76)           RGTI    61   55 -> 56
 *   risk_off (22)           NVDA    41   75 -> 73
 *   risk_off (22)           CRSP    30   72 -> 70
 *   risk_off (22)           RGTI    37   55 -> 54
 *   Without a stored regime_fit_score, v2.1 totals equal v2.0 (asserted).
 *
 *   v2.2 (Room to 3x, weight 20; rebalanced) base totals without regime:
 *   NVDA 75 -> 59 ($2.3T has little room)  CRSP 72 -> 76  RGTI 55 -> 65
 *   The table above is historical; current base totals live in BASE_EXPECTED.
 *
 * Run: compile with tsc (nodenext) and call runSelfCheck() / runRegimeSelfCheck() (throws on failure), or import it in a
 * test. Pure — no I/O.
 */
import type { Stock } from '../supabase.js';
import { MODEL_VERSION, scoreStock } from './model.js';
import type { ScoreResult } from './model.js';
import { computeRiskScore } from './risk.js';
import type { RiskResult } from './risk.js';
import { computeRegimeSnapshot, regimeFitForStock, sectorEtfFor } from './regime.js';
import type { Bar, RegimeSeries } from './regime.js';

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

// ---------- v2.1 regime examples ----------

/** Current-model totals / available weight for the fixtures (regime dimension unscored). */
export const BASE_EXPECTED: Record<string, { total: number; availableWeight: number }> = {
  NVDA: { total: 59, availableWeight: 95 },
  CRSP: { total: 76, availableWeight: 95 },
  RGTI: { total: 65, availableWeight: 82 },
};

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`selfcheck failed: ${msg}`);
}

function isoDay(i: number): string {
  return new Date(Date.UTC(2025, 0, 2) + i * 86400000).toISOString().slice(0, 10);
}

/** Deterministic geometric path: daily drift plus a small wiggle. */
function path(start: number, dailyDrift: number, n: number, wiggle = 0.004): Bar[] {
  const out: Bar[] = [];
  let px = start;
  for (let i = 0; i < n; i++) {
    px *= 1 + dailyDrift + wiggle * Math.sin(i / 3);
    out.push({ d: isoDay(i), close: Math.round(px * 100) / 100 });
  }
  return out;
}

function flat(level: number, n: number, slopePerDay = 0): Bar[] {
  return Array.from({ length: n }, (_, i) => ({ d: isoDay(i), close: Math.round((level + slopePerDay * i) * 100) / 100 }));
}

/** ^TNX in the legacy x10 format for the first half, plain percent after. */
function tnx(startPct: number, endPct: number, n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const y = startPct + ((endPct - startPct) * i) / (n - 1);
    return { d: isoDay(i), close: Math.round((i < n / 2 ? y * 10 : y) * 1000) / 1000 };
  });
}

const N = 260;

export const RISK_ON_SERIES: RegimeSeries = {
  '^VIX': flat(14.1, N),
  '^TNX': tnx(4.6, 4.0, N),
  SPY: path(450, 0.0008, N),
  QQQ: path(380, 0.0011, N),
  IWM: path(200, 0.001, N),
  XLK: path(200, 0.0011, N),
  SMH: path(220, 0.0014, N),
  IGV: path(80, 0.001, N),
  XBI: path(90, 0.0013, N),
  XLV: path(140, 0.0004, N),
  XLU: path(65, 0.0001, N),
  XLP: path(75, 0.0001, N),
  ITA: path(130, 0.0007, N),
};

export const RISK_OFF_SERIES: RegimeSeries = {
  '^VIX': flat(24, N, 0.04),
  '^TNX': tnx(3.9, 4.8, N),
  SPY: path(500, -0.0006, N),
  QQQ: path(420, -0.0010, N),
  IWM: path(210, -0.0011, N),
  XLK: path(210, -0.0010, N),
  SMH: path(240, -0.0014, N),
  IGV: path(85, -0.0011, N),
  XBI: path(95, -0.0013, N),
  XLV: path(140, 0.0002, N),
  XLU: path(65, 0.0004, N),
  XLP: path(75, 0.0003, N),
  ITA: path(130, -0.0003, N),
};

export interface RegimeCheckRow {
  regime: string;
  riskAppetite: number | null;
  ticker: string;
  fit: number | null;
  totalV20: number;
  totalV21: number;
  drivers: string[];
}

/**
 * Throws on any failed assertion. Returns per-ticker regime fit and totals for
 * the synthetic risk-on and risk-off regimes.
 */
export function runRegimeSelfCheck(): RegimeCheckRow[] {
  assert(MODEL_VERSION === 'v2.2', 'MODEL_VERSION is v2.2');

  // Totals match the regime-free baseline when regime_fit_score is null / absent.
  for (const s of FIXTURES) {
    const exp = BASE_EXPECTED[s.ticker];
    for (const variant of [s, { ...s, regime_fit_score: null }]) {
      const sc = scoreStock(variant);
      assert(sc.total === exp.total, `${s.ticker} total ${sc.total} === base ${exp.total}`);
      assert(sc.availableWeight === exp.availableWeight, `${s.ticker} availableWeight unchanged`);
      assert(!sc.dimensions.find((d) => d.key === 'regime')?.available, `${s.ticker} regime unavailable`);
    }
    // Stored fit of 80 lights up the dimension and adds its 5 points of weight.
    const with80 = scoreStock({ ...s, regime_fit_score: 80, regime_fit_drivers: ['test'] });
    const dim = with80.dimensions.find((d) => d.key === 'regime');
    assert(dim?.available === true && dim.score === 80, `${s.ticker} regime dimension 80`);
    assert(with80.availableWeight === exp.availableWeight + 5, `${s.ticker} availableWeight +5`);
  }

  // Insufficient data: < 200 SPY bars -> no label, no appetite.
  const short = computeRegimeSnapshot({ ...RISK_ON_SERIES, SPY: RISK_ON_SERIES.SPY.slice(-150) });
  assert(short.regime_label === 'insufficient_data' && short.risk_appetite === null, 'short SPY -> insufficient_data');
  const noVix = computeRegimeSnapshot({ ...RISK_ON_SERIES, '^VIX': [] });
  assert(noVix.regime_label === 'insufficient_data' && noVix.risk_appetite === null, 'missing VIX -> insufficient_data');
  assert(regimeFitForStock(FIXTURES[0], short).score === null, 'fit null on insufficient_data');
  assert(regimeFitForStock(FIXTURES[0], null).score === null, 'fit null on null snapshot');

  // No look-ahead: asOf at bar 210 equals a snapshot built from truncated series.
  const asOf = isoDay(210);
  const truncated: RegimeSeries = Object.fromEntries(
    Object.entries(RISK_ON_SERIES).map(([k, v]) => [k, v.filter((b) => b.d <= asOf)]),
  );
  const a = computeRegimeSnapshot(RISK_ON_SERIES, asOf);
  const b = computeRegimeSnapshot(truncated, asOf);
  assert(JSON.stringify(a) === JSON.stringify(b), 'asOf snapshot uses no future bars');
  const early = computeRegimeSnapshot(RISK_ON_SERIES, isoDay(150));
  assert(early.regime_label === 'insufficient_data', 'asOf before 200 bars -> insufficient_data');

  // ^TNX normalized to percent despite the legacy x10 half of the series.
  const on = computeRegimeSnapshot(RISK_ON_SERIES);
  const off = computeRegimeSnapshot(RISK_OFF_SERIES);
  assert(on.tnx !== null && on.tnx < 20, 'tnx normalized to percent');
  assert(on.regime_label === 'risk_on', `risk-on series labeled ${on.regime_label}`);
  assert(off.regime_label === 'risk_off', `risk-off series labeled ${off.regime_label}`);

  assert(sectorEtfFor('Biotech') === 'XBI' && sectorEtfFor('Fintech') === 'XLF' && sectorEtfFor('EdTech') === 'XLY', 'sector mapping');
  assert(sectorEtfFor('Tech', 'Semiconductors') === 'XLK' && sectorEtfFor('Unknown', 'Semiconductors') === 'SMH', 'industry fallback');

  const rows: RegimeCheckRow[] = [];
  for (const [name, snap] of [['risk_on', on], ['risk_off', off]] as const) {
    for (const s of FIXTURES) {
      const fit = regimeFitForStock(s, snap);
      const v21 = scoreStock({ ...s, regime_fit_score: fit.score, regime_fit_drivers: fit.drivers });
      rows.push({
        regime: name,
        riskAppetite: snap.risk_appetite,
        ticker: s.ticker,
        fit: fit.score,
        totalV20: BASE_EXPECTED[s.ticker].total,
        totalV21: v21.total,
        drivers: fit.drivers,
      });
    }
  }
  return rows;
}
