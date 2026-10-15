/**
 * 3x scenario calculator — pure, deterministic, no I/O.
 *
 * Units: every *Pct / *Pts input is in percent (12.5 means 12.5%), money in USD.
 *
 * Math (years = horizonMonths / 12):
 *   requiredPrice        = price * target
 *   shareFactor          = (1 + dil)^y * (1 - buy)^y
 *   sharesNow            = marketCap / price
 *   requiredMarketCap    = requiredPrice * sharesNow * shareFactor
 *   requiredPriceCagr    = target^(1/y) - 1
 *   currentPS            = marketCap / revenue
 *   projected revenue    = revenue * (1 + g)^y
 *   projected margin     = margin + marginChangePts
 *   projected market cap = projected revenue * currentPS * (1 + multipleChange)
 *   projected price      = projected market cap / (sharesNow * shareFactor)
 *
 * Note: under a P/S framework the projected price does not depend on the
 * absolute revenue level or the margin (revenue cancels against currentPS).
 * Margin only drives the earnings / P/E views. Revenue is still required for
 * the projection so nothing is computed from an invented sales figure.
 *
 * Every numeric output is either a finite number or null — never NaN/Infinity.
 */
import type { Stock } from '../supabase.js';
import { buildFlags } from './flags.js';
import type { SanityFlag } from './flags.js';

export type { SanityFlag } from './flags.js';

export interface ScenarioInputs {
  currentPrice: number;
  currentMarketCap: number;
  /** TTM USD; default market_cap / price_to_sales */
  currentRevenue: number | null;
  /** e.g. 12.5 */
  currentNetMarginPct: number | null;
  /** 2, 3, 5 or custom; clamped to 1.1..20 */
  targetMultiple: number;
  /** presets 12, 24, 36, 60; clamped to 6..120 */
  horizonMonths: number;
  /** expected annual revenue growth, percent */
  revenueGrowthPct: number;
  /** net-margin change in pct points by horizon end */
  marginChangePts: number;
  /** expected % change in P/S multiple over the horizon */
  multipleChangePct: number;
  dilutionPctPerYear: number;
  buybackPctPerYear: number;
}

export interface ProjectedOutcome {
  revenue: number | null;
  netMarginPct: number | null;
  earnings: number | null;
  marketCap: number | null;
  price: number | null;
  priceMultiple: number | null;
  priceCagrPct: number | null;
  hitsTarget: boolean;
}

export interface KeyAssumption {
  input: keyof ScenarioInputs;
  label: string;
  /** % change in projected price per 1% relative change in the input */
  elasticity: number;
}

export interface ScenarioResult {
  requiredMarketCap: number;
  requiredPrice: number;
  requiredPriceCagrPct: number;
  /** compounded dilution - buybacks over horizon, percent */
  netShareChangePct: number;
  requiredRevenueAtConstantMultiple: number | null;
  requiredRevenueCagrPct: number | null;
  requiredEarningsAtCurrentPE: number | null;
  /** P/S needed on the user's projected revenue to hit target */
  impliedFuturePriceToSales: number | null;
  /** P/E needed on projected earnings to hit target */
  impliedFuturePE: number | null;
  projected: ProjectedOutcome;
  flags: SanityFlag[];
  /** ranked by |effect on projected price| of a +10% relative bump */
  keyAssumptions: KeyAssumption[];
  /** low when revenue/margin/price missing; medium when any 'high' flag; else high */
  confidence: 'high' | 'medium' | 'low';
}

export type ScenarioWithInputs = ScenarioResult & { inputs: ScenarioInputs };

export interface ScenarioSet {
  bear: ScenarioWithInputs;
  base: ScenarioWithInputs;
  bull: ScenarioWithInputs;
}

export interface SensitivityTable {
  rowLabel: 'revenueGrowthPct';
  colLabel: 'multipleChangePct';
  rows: number[];
  cols: number[];
  /** projected price multiple (projected price / current price) */
  cells: (number | null)[][];
}

// ---- Limits (documented constants) ----
export const TARGET_MIN = 1.1;
export const TARGET_MAX = 20;
export const HORIZON_MIN_MONTHS = 6;
export const HORIZON_MAX_MONTHS = 120;
/** Growth / multiple change below -95% would imply a ~zero business; floor it. */
const RATE_FLOOR_PCT = -95;
/** Buybacks cannot retire >= 100% of shares per year. */
const BUYBACK_MAX_PCT = 50;
/** defaultInputsFromStock clamps trailing revenue growth to this band. */
export const DEFAULT_GROWTH_MIN = -20;
export const DEFAULT_GROWTH_MAX = 80;
export const DEFAULT_TARGET = 3;
export const DEFAULT_HORIZON_MONTHS = 36;

// ---- Scenario set deltas (documented constants) ----
/** Bear: growth x0.5, P/S change -25 pts, margin change -2 pts. */
export const BEAR = { growthFactor: 0.5, multipleDeltaPts: -25, marginDeltaPts: -2 } as const;
/** Bull: growth x1.5, P/S change +25 pts, margin change +3 pts. */
export const BULL = { growthFactor: 1.5, multipleDeltaPts: 25, marginDeltaPts: 3 } as const;

// ---- helpers ----
function fin(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function pos(n: unknown): number | null {
  const v = fin(n);
  return v !== null && v > 0 ? v : null;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
/** Return n if finite, else null. Guards every division / power. */
function safe(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

interface Normalized {
  price: number | null;
  marketCap: number | null;
  revenue: number | null;
  margin: number | null;
  target: number;
  years: number;
  g: number;
  marginChange: number;
  multipleChange: number;
  dil: number;
  buy: number;
}

function normalize(i: ScenarioInputs): Normalized {
  return {
    price: pos(i.currentPrice),
    marketCap: pos(i.currentMarketCap),
    revenue: pos(i.currentRevenue),
    margin: fin(i.currentNetMarginPct),
    target: clamp(fin(i.targetMultiple) ?? DEFAULT_TARGET, TARGET_MIN, TARGET_MAX),
    years: clamp(fin(i.horizonMonths) ?? DEFAULT_HORIZON_MONTHS, HORIZON_MIN_MONTHS, HORIZON_MAX_MONTHS) / 12,
    g: Math.max(RATE_FLOOR_PCT, fin(i.revenueGrowthPct) ?? 0) / 100,
    marginChange: fin(i.marginChangePts) ?? 0,
    multipleChange: Math.max(RATE_FLOOR_PCT, fin(i.multipleChangePct) ?? 0) / 100,
    dil: Math.max(0, fin(i.dilutionPctPerYear) ?? 0) / 100,
    buy: clamp(fin(i.buybackPctPerYear) ?? 0, 0, BUYBACK_MAX_PCT) / 100,
  };
}

/** Projected price only — used by elasticity and sensitivity. */
function projectedPrice(n: Normalized): number | null {
  if (n.price === null || n.marketCap === null || n.revenue === null) return null;
  const shareFactor = Math.pow(1 + n.dil, n.years) * Math.pow(1 - n.buy, n.years);
  const sharesNow = n.marketCap / n.price;
  const ps = n.marketCap / n.revenue;
  const rev = n.revenue * Math.pow(1 + n.g, n.years);
  const cap = rev * ps * (1 + n.multipleChange);
  return safe(cap / (sharesNow * shareFactor));
}

const ASSUMPTION_LABELS: Partial<Record<keyof ScenarioInputs, string>> = {
  revenueGrowthPct: 'Revenue growth',
  multipleChangePct: 'P/S multiple change',
  horizonMonths: 'Time horizon',
  dilutionPctPerYear: 'Annual dilution',
  buybackPctPerYear: 'Annual buybacks',
};

/**
 * Elasticity = (% change in projected price) / 10 for a +10% relative bump of
 * one input. Inputs currently at 0 get an absolute +1 pt bump instead (a
 * relative bump of zero is zero). Revenue level and margin are excluded: they
 * do not move projected price under the P/S framework (see header).
 */
function keyAssumptions(i: ScenarioInputs, basePrice: number | null): KeyAssumption[] {
  if (basePrice === null || basePrice <= 0) return [];
  const out: KeyAssumption[] = [];
  for (const key of Object.keys(ASSUMPTION_LABELS) as (keyof ScenarioInputs)[]) {
    const v = fin(i[key]) ?? 0;
    const bumped = { ...i, [key]: v === 0 ? 1 : v * 1.1 };
    const p = projectedPrice(normalize(bumped));
    if (p === null) continue;
    const e = safe(((p / basePrice - 1) * 100) / 10);
    if (e === null) continue;
    out.push({ input: key, label: ASSUMPTION_LABELS[key] ?? key, elasticity: Math.round(e * 1000) / 1000 });
  }
  return out.sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));
}

export function computeScenario(i: ScenarioInputs): ScenarioResult {
  const n = normalize(i);
  const { price, marketCap, revenue, margin, target, years } = n;

  const shareFactor = Math.pow(1 + n.dil, years) * Math.pow(1 - n.buy, years);
  const netShareChangePct = safe((shareFactor - 1) * 100) ?? 0;
  const requiredPriceCagrPct = safe((Math.pow(target, 1 / years) - 1) * 100) ?? 0;

  const sharesNow = price !== null && marketCap !== null ? marketCap / price : null;
  const requiredPrice = price !== null ? price * target : 0;
  const requiredMarketCap = sharesNow !== null ? safe(requiredPrice * sharesNow * shareFactor) ?? 0 : 0;
  const hasRequired = requiredMarketCap > 0;

  const currentPS = marketCap !== null && revenue !== null ? marketCap / revenue : null;
  const currentEarnings = revenue !== null && margin !== null ? revenue * (margin / 100) : null;
  const currentPE = marketCap !== null && currentEarnings !== null && currentEarnings > 0 ? marketCap / currentEarnings : null;

  const requiredRevenueAtConstantMultiple =
    hasRequired && currentPS !== null ? safe(requiredMarketCap / currentPS) : null;
  const requiredRevenueCagrPct =
    requiredRevenueAtConstantMultiple !== null && revenue !== null
      ? safe((Math.pow(requiredRevenueAtConstantMultiple / revenue, 1 / years) - 1) * 100)
      : null;
  const requiredEarningsAtCurrentPE = hasRequired && currentPE !== null ? safe(requiredMarketCap / currentPE) : null;

  // Projection
  const projRevenue = revenue !== null ? safe(revenue * Math.pow(1 + n.g, years)) : null;
  const projMargin = margin !== null ? safe(margin + n.marginChange) : null;
  const projEarnings = projRevenue !== null && projMargin !== null ? safe(projRevenue * (projMargin / 100)) : null;
  const projMarketCap =
    projRevenue !== null && currentPS !== null ? safe(projRevenue * currentPS * (1 + n.multipleChange)) : null;
  const projPrice =
    projMarketCap !== null && sharesNow !== null ? safe(projMarketCap / (sharesNow * shareFactor)) : null;
  const priceMultiple = projPrice !== null && price !== null ? safe(projPrice / price) : null;
  const priceCagrPct =
    priceMultiple !== null && priceMultiple > 0 ? safe((Math.pow(priceMultiple, 1 / years) - 1) * 100) : null;

  const impliedFuturePriceToSales =
    hasRequired && projRevenue !== null && projRevenue > 0 ? safe(requiredMarketCap / projRevenue) : null;
  const impliedFuturePE =
    hasRequired && projEarnings !== null && projEarnings > 0 ? safe(requiredMarketCap / projEarnings) : null;

  const flags = buildFlags({
    requiredPriceCagrPct,
    revenueGrowthPct: n.g * 100,
    years,
    impliedFuturePriceToSales,
    projectedNetMarginPct: projMargin,
    dilutionPctPerYear: n.dil * 100,
    requiredMarketCap: hasRequired ? requiredMarketCap : null,
    target,
    horizonMonths: years * 12,
    missingRevenue: revenue === null,
    missingMargin: margin === null,
    missingPrice: price === null || marketCap === null,
  });

  const missing = revenue === null || margin === null || price === null || marketCap === null;
  const confidence: ScenarioResult['confidence'] = missing
    ? 'low'
    : flags.some((f) => f.severity === 'high')
      ? 'medium'
      : 'high';

  return {
    requiredMarketCap,
    requiredPrice,
    requiredPriceCagrPct,
    netShareChangePct,
    requiredRevenueAtConstantMultiple,
    requiredRevenueCagrPct,
    requiredEarningsAtCurrentPE,
    impliedFuturePriceToSales,
    impliedFuturePE,
    projected: {
      revenue: projRevenue,
      netMarginPct: projMargin,
      earnings: projEarnings,
      marketCap: projMarketCap,
      price: projPrice,
      priceMultiple,
      priceCagrPct,
      hitsTarget: priceMultiple !== null && priceMultiple >= target,
    },
    flags,
    keyAssumptions: keyAssumptions(i, projPrice),
    confidence,
  };
}

/**
 * Bear / base / bull around the user's inputs (constants BEAR / BULL above).
 * For negative growth the factors swap (bear x1.5, bull x0.5) so bear is always
 * the worse case.
 */
export function buildScenarioSet(i: ScenarioInputs): ScenarioSet {
  const g = fin(i.revenueGrowthPct) ?? 0;
  const mc = fin(i.multipleChangePct) ?? 0;
  const m = fin(i.marginChangePts) ?? 0;
  const bearInputs: ScenarioInputs = {
    ...i,
    revenueGrowthPct: g >= 0 ? g * BEAR.growthFactor : g * BULL.growthFactor,
    multipleChangePct: mc + BEAR.multipleDeltaPts,
    marginChangePts: m + BEAR.marginDeltaPts,
  };
  const bullInputs: ScenarioInputs = {
    ...i,
    revenueGrowthPct: g >= 0 ? g * BULL.growthFactor : g * BEAR.growthFactor,
    multipleChangePct: mc + BULL.multipleDeltaPts,
    marginChangePts: m + BULL.marginDeltaPts,
  };
  const baseInputs: ScenarioInputs = { ...i };
  return {
    bear: { ...computeScenario(bearInputs), inputs: bearInputs },
    base: { ...computeScenario(baseInputs), inputs: baseInputs },
    bull: { ...computeScenario(bullInputs), inputs: bullInputs },
  };
}

/** Default grid: base +/- 10/20 pts growth, base +/- 25/50 pts multiple change. */
const DEFAULT_GROWTH_OFFSETS = [-20, -10, 0, 10, 20];
const DEFAULT_MULTIPLE_OFFSETS = [-50, -25, 0, 25, 50];

export function sensitivityTable(
  i: ScenarioInputs,
  opts?: { growthSteps?: number[]; multipleSteps?: number[] },
): SensitivityTable {
  const g = fin(i.revenueGrowthPct) ?? 0;
  const mc = fin(i.multipleChangePct) ?? 0;
  const rows = (opts?.growthSteps?.length ? opts.growthSteps : DEFAULT_GROWTH_OFFSETS.map((o) => g + o))
    .map((v) => fin(v) ?? 0)
    .map((v) => Math.max(RATE_FLOOR_PCT, v));
  const cols = (opts?.multipleSteps?.length ? opts.multipleSteps : DEFAULT_MULTIPLE_OFFSETS.map((o) => mc + o))
    .map((v) => fin(v) ?? 0)
    .map((v) => Math.max(RATE_FLOOR_PCT, v));
  const price = pos(i.currentPrice);
  const cells = rows.map((rg) =>
    cols.map((cm) => {
      const p = projectedPrice(normalize({ ...i, revenueGrowthPct: rg, multipleChangePct: cm }));
      return p !== null && price !== null ? safe(p / price) : null;
    }),
  );
  return { rowLabel: 'revenueGrowthPct', colLabel: 'multipleChangePct', rows, cols, cells };
}

export function defaultInputsFromStock(stock: Stock): ScenarioInputs {
  const cap = pos(stock.market_cap);
  const ps = pos(stock.price_to_sales);
  const growth = fin(stock.revenue_growth_yoy);
  return {
    currentPrice: fin(stock.current_price) ?? 0,
    currentMarketCap: cap ?? 0,
    currentRevenue: cap !== null && ps !== null ? cap / ps : null,
    currentNetMarginPct: fin(stock.profit_margin),
    targetMultiple: DEFAULT_TARGET,
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    revenueGrowthPct: growth !== null ? clamp(growth, DEFAULT_GROWTH_MIN, DEFAULT_GROWTH_MAX) : 0,
    marginChangePts: 0,
    multipleChangePct: 0,
    dilutionPctPerYear: 0,
    buybackPctPerYear: 0,
  };
}
