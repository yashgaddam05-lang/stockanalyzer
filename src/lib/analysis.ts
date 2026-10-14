import type { Stock } from './supabase';

/*
 * 3x Opportunity Score — 8 dimensions, weights from the scope document:
 * Growth 20, Valuation 18, Momentum 15, Quality 12, Catalysts 12,
 * Market Position 10, Risk & Volatility 8, Market Regime 5 (= 100).
 * Every input is a stored field, so the score is fully explainable.
 * Dimensions marked `proxy` use stand-in signals until richer data exists.
 */

export interface ScoreBreakdown {
  key: DimensionKey;
  label: string;
  score: number;
  maxScore: number;
  description: string;
  icon: string;
  proxy: boolean;
}

export type DimensionKey =
  | 'growth'
  | 'valuation'
  | 'momentum'
  | 'quality'
  | 'catalysts'
  | 'position'
  | 'risk'
  | 'regime';

export const DIMENSIONS: { key: DimensionKey; label: string; weight: number; icon: string; summary: string }[] = [
  { key: 'growth', label: 'Growth Potential', weight: 20, icon: 'TrendingUp', summary: 'Revenue growth, earnings growth, and R&D reinvestment.' },
  { key: 'valuation', label: 'Valuation Upside', weight: 18, icon: 'Scale', summary: 'Analyst target upside, growth-adjusted P/S and P/E, and size headroom.' },
  { key: 'momentum', label: 'Momentum', weight: 15, icon: 'Activity', summary: 'Short versus medium moving average trend and 20-day return.' },
  { key: 'quality', label: 'Fundamental Quality', weight: 12, icon: 'ShieldCheck', summary: 'Leverage, profitability, and cash runway.' },
  { key: 'catalysts', label: 'Catalyst Strength', weight: 12, icon: 'Rocket', summary: 'Pipeline depth, sector event intensity, and growth acceleration.' },
  { key: 'position', label: 'Market Position', weight: 10, icon: 'Crown', summary: 'Scale, profitability, and R&D moat.' },
  { key: 'risk', label: 'Risk & Volatility', weight: 8, icon: 'Zap', summary: 'Inverse of the independent 0-100 risk score.' },
  { key: 'regime', label: 'Market Regime Fit', weight: 5, icon: 'Globe', summary: 'Sector tailwind under the current macro regime.' },
];

// Editorial sector assumptions (0-1). Update as the macro regime shifts.
export const SECTOR_REGIME_FIT: Record<string, number> = {
  Semiconductor: 0.85,
  Tech: 0.8,
  Nuclear: 0.85,
  Cybersecurity: 0.75,
  Quantum: 0.7,
  Space: 0.7,
  Aerospace: 0.7,
  Fintech: 0.65,
  Medtech: 0.6,
  Biotech: 0.55,
  Consumer: 0.45,
  EdTech: 0.45,
  'Clean Energy': 0.4,
  EV: 0.4,
};

// How event-driven a sector tends to be (trial readouts, launches, contracts).
const SECTOR_CATALYST_INTENSITY: Record<string, number> = {
  Biotech: 0.9,
  Space: 0.85,
  Quantum: 0.8,
  Nuclear: 0.8,
  Aerospace: 0.75,
  Medtech: 0.6,
  Semiconductor: 0.6,
  Tech: 0.5,
  Cybersecurity: 0.45,
  Fintech: 0.45,
  EV: 0.55,
  'Clean Energy': 0.5,
  Consumer: 0.35,
  EdTech: 0.35,
};

const SELF_FUNDING_RUNWAY = 200; // seed convention: 200 months = cash-flow positive

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const norm = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;

export function isSelfFunding(stock: Stock) {
  return stock.cash_runway_months >= SELF_FUNDING_RUNWAY;
}

export function formatRunway(stock: Stock) {
  if (isSelfFunding(stock)) return 'Self-funding';
  if (stock.cash_runway_months <= 0) return 'N/A';
  return `${stock.cash_runway_months} months`;
}

// ---------- Risk score (independent 0-100, higher = riskier) ----------

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Extreme';

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  factors: { label: string; points: number; maxPoints: number }[];
}

export function assessRisk(stock: Stock): RiskAssessment {
  const runwayRisk = isSelfFunding(stock)
    ? 0
    : stock.cash_runway_months < 12
      ? 1
      : stock.cash_runway_months < 24
        ? 0.7
        : stock.cash_runway_months < 36
          ? 0.4
          : 0.15;
  const logCap = Math.log10(Math.max(stock.market_cap, 1));

  const factors = [
    { label: 'Volatility', points: norm(stock.volatility, 20, 100) * 30, maxPoints: 30 },
    { label: 'Beta', points: norm(stock.beta, 0.5, 3) * 15, maxPoints: 15 },
    { label: 'Leverage', points: norm(stock.debt_to_equity, 0, 1.5) * 15, maxPoints: 15 },
    { label: 'Cash runway', points: runwayRisk * 15, maxPoints: 15 },
    { label: 'Small size', points: (1 - norm(logCap, 8.3, 11.5)) * 15, maxPoints: 15 },
    { label: 'Unprofitable', points: stock.earnings_growth_yoy < 0 && !isSelfFunding(stock) ? 10 : stock.earnings_growth_yoy < 0 ? 5 : 0, maxPoints: 10 },
  ].map((f) => ({ ...f, points: Math.round(f.points) }));

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const band: RiskBand = score < 30 ? 'Low' : score < 50 ? 'Moderate' : score < 70 ? 'High' : 'Extreme';
  return { score, band, factors };
}

// ---------- Valuation signals ----------

interface ValuationSignal {
  label: string;
  value: number; // 0-1, higher = more upside
  text: string;
}

function valuationSignals(stock: Stock): { signals: ValuationSignal[]; proxy: boolean } {
  const signals: ValuationSignal[] = [];

  if (stock.target_price && stock.current_price > 0) {
    const upside = stock.target_price / stock.current_price - 1;
    signals.push({
      label: 'Analyst target',
      value: norm(upside, -0.2, 0.8),
      text: `Mean analyst target $${stock.target_price.toFixed(2)} (${pct(upside * 100)} vs price)`,
    });
  }
  if (stock.price_to_sales && stock.price_to_sales > 0) {
    const gaps = stock.price_to_sales / Math.max(stock.revenue_growth_yoy, 5);
    signals.push({
      label: 'Growth-adjusted P/S',
      value: 1 - norm(gaps, 0.05, 1.0),
      text: `P/S ${stock.price_to_sales.toFixed(1)}x on ${pct(stock.revenue_growth_yoy)} growth`,
    });
  }
  if (stock.forward_pe && stock.forward_pe > 0) {
    const peg = stock.forward_pe / Math.max(stock.earnings_growth_yoy, 5);
    signals.push({
      label: 'PEG',
      value: 1 - norm(peg, 0.3, 3),
      text: `Forward P/E ${stock.forward_pe.toFixed(1)} (PEG ~${peg.toFixed(2)})`,
    });
  }

  const proxy = signals.length === 0;
  // Size headroom: tripling a $1B company is easier than tripling a $1T one.
  const logCap = Math.log10(Math.max(stock.market_cap, 1));
  signals.push({
    label: 'Size headroom',
    value: 1 - norm(logCap, 8.5, 12.3),
    text: `${formatMarketCap(stock.market_cap)} market cap`,
  });
  return { signals, proxy };
}

// ---------- Main analysis ----------

export interface ScenarioCase {
  label: 'Bull' | 'Base' | 'Bear';
  price: number;
  changePct: number;
  narrative: string;
}

export interface ThreeXRequirements {
  targetPrice: number;
  targetMarketCap: number;
  requiredCagr: number; // over the stated horizon
  horizonYears: number;
  yearsToTripleRevenue: number | null;
}

export interface AnalysisResult {
  totalScore: number;
  rating: string;
  ratingColor: string;
  breakdown: ScoreBreakdown[];
  threeXProbability: number;
  timeframe: string;
  keyCatalysts: string[];
  keyRisks: string[];
  risk: RiskAssessment;
  cases: ScenarioCase[];
  requirements: ThreeXRequirements;
  invalidation: string[];
  dimension: Record<DimensionKey, number>; // 0-1 normalized per dimension
}

export function analyzeStock(stock: Stock): AnalysisResult {
  const risk = assessRisk(stock);
  const selfFunding = isSelfFunding(stock);
  const sectorFit = SECTOR_REGIME_FIT[stock.sector] ?? 0.5;
  const sectorCatalyst = SECTOR_CATALYST_INTENSITY[stock.sector] ?? 0.5;
  const logCap = Math.log10(Math.max(stock.market_cap, 1));

  // 1. Growth Potential
  const growth =
    0.6 * norm(stock.revenue_growth_yoy, -10, 80) +
    0.25 * norm(stock.earnings_growth_yoy, -50, 150) +
    0.15 * norm(stock.rd_ratio, 0, 40);

  // 2. Valuation Upside
  const val = valuationSignals(stock);
  const valuation = val.signals.reduce((s, x) => s + x.value, 0) / val.signals.length;

  // 3. Momentum
  const momentum = clamp(stock.momentum_score / 100);

  // 4. Fundamental Quality
  const runwayQuality = selfFunding ? 1 : norm(stock.cash_runway_months, 6, 72);
  const quality =
    0.4 * (1 - norm(stock.debt_to_equity, 0, 1.5)) +
    0.3 * (stock.earnings_growth_yoy > 0 ? 0.5 + 0.5 * norm(stock.earnings_growth_yoy, 0, 100) : 0) +
    0.3 * runwayQuality;

  // 5. Catalyst Strength
  const catalysts =
    0.5 * norm(stock.pipeline_count, 0, 6) +
    0.3 * sectorCatalyst +
    0.2 * norm(stock.revenue_growth_yoy, 10, 100);

  // 6. Market Position
  const position =
    0.4 * norm(logCap, 8.5, 12) +
    0.3 * (selfFunding ? 1 : stock.earnings_growth_yoy > 0 ? 0.5 : 0) +
    0.3 * norm(stock.rd_ratio, 5, 35);

  // 7. Risk & Volatility (lower risk scores higher)
  const riskDim = 1 - risk.score / 100;

  // 8. Market Regime Fit
  const regime = sectorFit;

  const dimension: Record<DimensionKey, number> = {
    growth, valuation, momentum, quality, catalysts, position, risk: riskDim, regime,
  };

  const descriptions: Record<DimensionKey, string> = {
    growth: `${pct(stock.revenue_growth_yoy)} revenue, ${pct(stock.earnings_growth_yoy)} earnings YoY, R&D ${stock.rd_ratio.toFixed(0)}% of revenue. ${
      stock.revenue_growth_yoy > 50 ? 'Exceptional top-line expansion.' : stock.revenue_growth_yoy > 20 ? 'Strong growth trajectory.' : stock.revenue_growth_yoy > 0 ? 'Moderate growth.' : 'Revenue declining.'
    }`,
    valuation: `${val.signals.map((s) => s.text).join('; ')}.${val.proxy ? ' Refresh to pull analyst targets and multiples.' : ''}`,
    momentum: `Momentum ${stock.momentum_score}/100. ${stock.momentum_score > 75 ? 'Strong uptrend.' : stock.momentum_score > 50 ? 'Positive but cooling.' : 'Weak or bearish trend.'}`,
    quality: `Debt/equity ${stock.debt_to_equity.toFixed(2)}, ${stock.earnings_growth_yoy > 0 ? 'earnings growing' : 'earnings negative'}, runway ${formatRunway(stock).toLowerCase()}.`,
    catalysts: `${stock.pipeline_count} pipeline/launch event${stock.pipeline_count === 1 ? '' : 's'} tracked; ${stock.sector} is ${sectorCatalyst >= 0.75 ? 'highly' : sectorCatalyst >= 0.5 ? 'moderately' : 'lightly'} event-driven.`,
    position: `${formatMarketCap(stock.market_cap)} scale, ${selfFunding ? 'self-funding' : 'externally funded'}, R&D intensity ${stock.rd_ratio.toFixed(0)}%.`,
    risk: `Risk score ${risk.score}/100 (${risk.band}). Volatility ${stock.volatility.toFixed(0)}%, beta ${stock.beta.toFixed(2)}.`,
    regime: `${stock.sector} tailwind rated ${(sectorFit * 100).toFixed(0)}/100 under current editorial regime assumptions.`,
  };

  const proxies: Record<DimensionKey, boolean> = {
    growth: false, valuation: val.proxy, momentum: false, quality: false,
    catalysts: true, position: true, risk: false, regime: true,
  };

  const breakdown: ScoreBreakdown[] = DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    maxScore: d.weight,
    score: Math.round(dimension[d.key] * d.weight * 10) / 10,
    description: descriptions[d.key],
    icon: d.icon,
    proxy: proxies[d.key],
  }));

  const totalScore = Math.round(breakdown.reduce((sum, b) => sum + b.score, 0));
  breakdown.forEach((b) => { b.score = Math.round(b.score); });

  // Heuristic probability, capped. Not a statistical estimate until backtests exist.
  const threeXProbability = Math.round(clamp(totalScore * 0.7 + (stock.volatility > 60 ? 5 : 0) - (logCap > 11.5 ? 15 : 0), 3, 75));

  let rating: string;
  let ratingColor: string;
  if (totalScore >= 70) { rating = 'Strong 3x Candidate'; ratingColor = 'emerald'; }
  else if (totalScore >= 58) { rating = 'Promising'; ratingColor = 'teal'; }
  else if (totalScore >= 46) { rating = 'Speculative'; ratingColor = 'amber'; }
  else if (totalScore >= 35) { rating = 'Long Shot'; ratingColor = 'orange'; }
  else { rating = 'High Risk / Unlikely'; ratingColor = 'red'; }

  const horizonYears = totalScore >= 70 ? 2 : totalScore >= 55 ? 3 : totalScore >= 40 ? 4 : 5;
  const timeframe = totalScore >= 70 ? '1-2 years' : totalScore >= 55 ? '2-3 years' : totalScore >= 40 ? '3-5 years' : '5+ years (if ever)';

  // Catalysts / risks
  const keyCatalysts: string[] = [];
  if (stock.revenue_growth_yoy > 50) keyCatalysts.push('Hyper-growth revenue trajectory');
  if (stock.pipeline_count > 3) keyCatalysts.push(`${stock.pipeline_count} pipeline catalysts approaching readouts`);
  if (stock.momentum_score > 75) keyCatalysts.push('Strong technical momentum');
  if (stock.target_price && stock.target_price > stock.current_price * 1.3) keyCatalysts.push(`Analyst targets ${pct((stock.target_price / stock.current_price - 1) * 100)} above price`);
  if (selfFunding) keyCatalysts.push('Self-funding: no dilution needed to execute');
  else if (stock.cash_runway_months > 48) keyCatalysts.push('Well-capitalized with long cash runway');
  if (stock.rd_ratio > 25) keyCatalysts.push('Heavy R&D investment building a moat');
  if (stock.earnings_growth_yoy > 100) keyCatalysts.push('Explosive earnings growth');
  if (sectorFit >= 0.8) keyCatalysts.push(`${stock.sector} has a strong regime tailwind`);
  if (keyCatalysts.length === 0) keyCatalysts.push('Sector tailwinds and potential mean reversion');

  const keyRisks: string[] = [];
  if (stock.earnings_growth_yoy < 0) keyRisks.push('Not yet profitable or earnings declining');
  if (!selfFunding && stock.cash_runway_months > 0 && stock.cash_runway_months < 24) keyRisks.push('Limited cash runway: dilution risk');
  if (stock.debt_to_equity > 0.5) keyRisks.push('Elevated debt levels');
  if (stock.volatility > 70) keyRisks.push('Extreme volatility: sharp drawdowns possible');
  if (stock.beta > 2) keyRisks.push(`High beta (${stock.beta.toFixed(2)}): amplified market sensitivity`);
  if (stock.revenue_growth_yoy < 0) keyRisks.push('Revenue is contracting');
  if (logCap > 11.7) keyRisks.push('Mega-cap size makes a 3x mathematically harder');
  if (risk.band === 'Extreme') keyRisks.push('Extreme risk profile: total loss possible');
  if (keyRisks.length === 0) keyRisks.push('Standard market and sector risks apply');

  // Bull / base / bear
  const price = stock.current_price;
  const expectedAnnual = clamp(0.5 * (stock.revenue_growth_yoy / 100) + 0.3 * (valuation - 0.5) + 0.2 * (momentum - 0.5), -0.3, 0.35);
  const basePrice = price * Math.pow(1 + expectedAnnual, horizonYears);
  const bearDrawdown = clamp((risk.score / 100) * 0.8, 0.15, 0.85);
  const cases: ScenarioCase[] = [
    {
      label: 'Bull',
      price: price * 3,
      changePct: 200,
      narrative: `${keyCatalysts.slice(0, 2).join(' and ')} play out. Growth stays near ${pct(Math.max(stock.revenue_growth_yoy, 20))} and the market re-rates the stock within ${timeframe}.`,
    },
    {
      label: 'Base',
      price: basePrice,
      changePct: (basePrice / price - 1) * 100,
      narrative: `Growth decelerates gradually and multiples hold. Implied ~${pct(expectedAnnual * 100)} per year over ${horizonYears} years from current growth, valuation, and trend.`,
    },
    {
      label: 'Bear',
      price: price * (1 - bearDrawdown),
      changePct: -bearDrawdown * 100,
      narrative: `${keyRisks[0]}. With a ${risk.band.toLowerCase()} risk profile (${risk.score}/100), a ${(bearDrawdown * 100).toFixed(0)}% drawdown is plausible.`,
    },
  ];

  const g = stock.revenue_growth_yoy / 100;
  const requirements: ThreeXRequirements = {
    targetPrice: price * 3,
    targetMarketCap: stock.market_cap * 3,
    requiredCagr: Math.pow(3, 1 / horizonYears) - 1,
    horizonYears,
    yearsToTripleRevenue: g > 0.01 ? Math.log(3) / Math.log(1 + g) : null,
  };

  const invalidation: string[] = [];
  invalidation.push(`Revenue growth falls below ${Math.max(5, Math.round(stock.revenue_growth_yoy / 2))}% YoY`);
  invalidation.push('Momentum score drops below 35 (trend broken)');
  if (!selfFunding) invalidation.push('Cash runway drops below 12 months or a large dilutive raise');
  if (stock.debt_to_equity > 0.5) invalidation.push(`Debt/equity rises above ${(stock.debt_to_equity * 1.5).toFixed(2)}`);
  if (stock.pipeline_count > 0) invalidation.push('A lead pipeline program fails or is delayed by regulators');
  invalidation.push('3x score falls below 45 for two consecutive snapshots');

  return {
    totalScore,
    rating,
    ratingColor,
    breakdown,
    threeXProbability,
    timeframe,
    keyCatalysts,
    keyRisks,
    risk,
    cases,
    requirements,
    invalidation,
    dimension,
  };
}

// ---------- Preset screens ----------

export interface AnalyzedStock {
  stock: Stock;
  analysis: AnalysisResult;
  delta: number | null; // score change vs last snapshot
}

export interface PresetScreen {
  id: string;
  label: string;
  description: string;
  filter: (a: AnalyzedStock) => boolean;
  rank: (a: AnalyzedStock) => number; // higher first
}

export const PRESET_SCREENS: PresetScreen[] = [
  {
    id: 'highest-3x',
    label: 'Highest 3x',
    description: 'Top composite 3x Opportunity Scores.',
    filter: () => true,
    rank: (a) => a.analysis.totalScore,
  },
  {
    id: 'risk-adjusted',
    label: 'Best risk-adjusted',
    description: 'Score per unit of risk: high score, risk score under 60.',
    filter: (a) => a.analysis.risk.score < 60,
    rank: (a) => a.analysis.totalScore - a.analysis.risk.score * 0.5,
  },
  {
    id: 'momentum',
    label: 'Highest momentum',
    description: 'Momentum score of 70 or more.',
    filter: (a) => a.stock.momentum_score >= 70,
    rank: (a) => a.stock.momentum_score,
  },
  {
    id: 'undervalued',
    label: 'Most undervalued',
    description: 'Strongest Valuation Upside dimension.',
    filter: (a) => a.analysis.dimension.valuation >= 0.5,
    rank: (a) => a.analysis.dimension.valuation,
  },
  {
    id: 'catalysts',
    label: 'Catalyst-rich',
    description: 'Strongest Catalyst Strength dimension.',
    filter: (a) => a.analysis.dimension.catalysts >= 0.55,
    rank: (a) => a.analysis.dimension.catalysts,
  },
  {
    id: 'breakouts',
    label: 'Score breakouts',
    description: 'Score rose since the previous snapshot.',
    filter: (a) => (a.delta ?? 0) > 0,
    rank: (a) => a.delta ?? 0,
  },
  {
    id: 'compounders',
    label: 'Profitable compounders',
    description: 'Self-funding, earnings growing, revenue growth above 20%.',
    filter: (a) => isSelfFunding(a.stock) && a.stock.earnings_growth_yoy > 0 && a.stock.revenue_growth_yoy > 20,
    rank: (a) => a.analysis.totalScore,
  },
  {
    id: 'oversold-quality',
    label: 'Oversold quality',
    description: 'Fundamental Quality 60%+ with momentum under 45.',
    filter: (a) => a.analysis.dimension.quality >= 0.6 && a.stock.momentum_score < 45,
    rank: (a) => a.analysis.dimension.quality,
  },
];

// ---------- Formatting helpers ----------

export function formatMarketCap(mc: number): string {
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toLocaleString()}`;
}

export function formatPrice(p: number): string {
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-neutral-900';
  if (score >= 58) return 'text-neutral-800';
  if (score >= 46) return 'text-neutral-600';
  if (score >= 35) return 'text-neutral-500';
  return 'text-neutral-400';
}

export function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-neutral-900';
  if (score >= 58) return 'bg-neutral-700';
  if (score >= 46) return 'bg-neutral-500';
  if (score >= 35) return 'bg-neutral-400';
  return 'bg-neutral-300';
}

export function getRiskColor(risk: string): string {
  switch (risk) {
    case 'low': return 'text-neutral-700 bg-neutral-100 border-neutral-200';
    case 'medium': return 'text-neutral-600 bg-neutral-50 border-neutral-200';
    case 'high': return 'text-neutral-700 bg-neutral-100 border-neutral-300';
    case 'extreme': return 'text-neutral-900 bg-neutral-200 border-neutral-300';
    default: return 'text-neutral-500 bg-neutral-50 border-neutral-200';
  }
}

export function getRiskLabel(risk: string): string {
  return risk.charAt(0).toUpperCase() + risk.slice(1) + ' Risk';
}

export const RISK_BAND_VARIANT: Record<RiskBand, 'success' | 'secondary' | 'warning' | 'danger'> = {
  Low: 'success',
  Moderate: 'secondary',
  High: 'warning',
  Extreme: 'danger',
};
