/**
 * Simulated portfolio valuation and exposure analysis. Pure, deterministic, no I/O.
 *
 * Weights are decimals (0-1) over the market value of PRICED positions only.
 * Unpriced positions keep their cost value but get null price/market fields and
 * are listed in totals.unpriced_tickers and flags.
 */

export interface PortfolioPositionInput {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
}

export interface PortfolioQuote {
  current_price: number | null;
  sector?: string | null;
  risk_level?: string | null;
  risk_score?: number | null;
  three_x_score?: number | null;
}

export interface ValuedPosition {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  cost_value: number;
  price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
  weight: number | null;
}

export interface PortfolioTotals {
  cost_value: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_pl_pct: number | null;
  priced_positions: number;
  unpriced_tickers: string[];
}

export interface SectorExposure {
  sector: string;
  market_value: number;
  weight: number;
}

export interface RiskExposure {
  by_level: { level: string; weight: number }[];
  weighted_risk_score: number | null;
  weighted_three_x_score: number | null;
}

export interface PortfolioValuation {
  positions: ValuedPosition[];
  totals: PortfolioTotals;
  sector_exposure: SectorExposure[];
  risk_exposure: RiskExposure;
  concentration: { top_position_weight: number | null; hhi: number | null };
  flags: string[];
}

export const POSITION_WEIGHT_LIMIT = 0.25;
export const SECTOR_WEIGHT_LIMIT = 0.4;
const UNCLASSIFIED = 'Unclassified';
const UNKNOWN_RISK = 'unknown';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round(v: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function valuePortfolio(
  positions: PortfolioPositionInput[],
  quotes: Record<string, PortfolioQuote>,
): PortfolioValuation {
  const valued: ValuedPosition[] = positions.map((p) => {
    const q = quotes[p.ticker] ?? quotes[p.ticker.toUpperCase()];
    const price = q && isNum(q.current_price) && q.current_price > 0 ? q.current_price : null;
    const cost_value = round(p.shares * p.cost_basis, 4);
    const market_value = price === null ? null : round(p.shares * price, 4);
    const unrealized_pl = market_value === null ? null : round(market_value - cost_value, 4);
    const unrealized_pl_pct =
      unrealized_pl === null || cost_value === 0 ? null : round(unrealized_pl / cost_value);
    return {
      id: p.id,
      ticker: p.ticker,
      shares: p.shares,
      cost_basis: p.cost_basis,
      cost_value,
      price,
      market_value,
      unrealized_pl,
      unrealized_pl_pct,
      weight: null,
    };
  });

  const priced = valued.filter((v) => v.market_value !== null);
  const pricedMv = priced.reduce((s, v) => s + (v.market_value ?? 0), 0);
  const pricedCost = priced.reduce((s, v) => s + v.cost_value, 0);
  const totalCost = valued.reduce((s, v) => s + v.cost_value, 0);

  if (pricedMv > 0) {
    for (const v of priced) v.weight = round((v.market_value ?? 0) / pricedMv);
  }

  const unpriced_tickers = Array.from(
    new Set(valued.filter((v) => v.market_value === null).map((v) => v.ticker)),
  );

  const unrealized_pl = round(pricedMv - pricedCost, 4);
  const totals: PortfolioTotals = {
    cost_value: round(totalCost, 4),
    market_value: round(pricedMv, 4),
    unrealized_pl,
    unrealized_pl_pct: pricedCost > 0 ? round(unrealized_pl / pricedCost) : null,
    priced_positions: priced.length,
    unpriced_tickers,
  };

  // Sector exposure
  const sectorMap = new Map<string, number>();
  for (const v of priced) {
    const raw = quotes[v.ticker]?.sector;
    const sector = typeof raw === 'string' && raw.trim() ? raw.trim() : UNCLASSIFIED;
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + (v.market_value ?? 0));
  }
  const sector_exposure: SectorExposure[] = Array.from(sectorMap.entries())
    .map(([sector, mv]) => ({
      sector,
      market_value: round(mv, 4),
      weight: pricedMv > 0 ? round(mv / pricedMv) : 0,
    }))
    .sort((a, b) => b.market_value - a.market_value || a.sector.localeCompare(b.sector));

  // Risk exposure
  const levelMap = new Map<string, number>();
  let riskW = 0;
  let riskSum = 0;
  let scoreW = 0;
  let scoreSum = 0;
  for (const v of priced) {
    const q = quotes[v.ticker];
    const w = v.weight ?? 0;
    const lvl = typeof q?.risk_level === 'string' && q.risk_level ? q.risk_level : UNKNOWN_RISK;
    levelMap.set(lvl, (levelMap.get(lvl) ?? 0) + w);
    if (isNum(q?.risk_score)) {
      riskW += w;
      riskSum += w * q.risk_score;
    }
    if (isNum(q?.three_x_score)) {
      scoreW += w;
      scoreSum += w * q.three_x_score;
    }
  }
  const risk_exposure: RiskExposure = {
    by_level: Array.from(levelMap.entries())
      .map(([level, weight]) => ({ level, weight: round(weight) }))
      .sort((a, b) => b.weight - a.weight || a.level.localeCompare(b.level)),
    weighted_risk_score: riskW > 0 ? round(riskSum / riskW, 2) : null,
    weighted_three_x_score: scoreW > 0 ? round(scoreSum / scoreW, 2) : null,
  };

  // Concentration
  const weights = priced.map((v) => v.weight ?? 0);
  const concentration = {
    top_position_weight: weights.length && pricedMv > 0 ? Math.max(...weights) : null,
    hhi: weights.length && pricedMv > 0 ? round(weights.reduce((s, w) => s + w * w, 0)) : null,
  };

  // Flags
  const flags: string[] = [];
  for (const v of priced) {
    if ((v.weight ?? 0) > POSITION_WEIGHT_LIMIT) {
      flags.push(`${v.ticker} is ${pct(v.weight ?? 0)} of priced market value (above 25%)`);
    }
  }
  for (const s of sector_exposure) {
    if (s.weight > SECTOR_WEIGHT_LIMIT) {
      flags.push(`${s.sector} sector is ${pct(s.weight)} of priced market value (above 40%)`);
    }
  }
  if (unpriced_tickers.length) {
    flags.push(`No current price for: ${unpriced_tickers.join(', ')}`);
  }

  return { positions: valued, totals, sector_exposure, risk_exposure, concentration, flags };
}
