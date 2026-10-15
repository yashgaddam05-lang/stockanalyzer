import type { Stock } from './supabase';
import {
  DIMENSIONS,
  MODEL_VERSION,
  buildCases,
  computeRiskScore,
  scoreStock,
} from './scoring/index.js';
import type { CaseKey, CaseSummary, DimensionKey, DimensionResult, RiskResult, ScoreResult } from './scoring/index.js';

export { MODEL_VERSION };

export interface ScoreBreakdown {
  label: string;
  score: number;
  maxScore: number;
  description: string;
  icon: string;
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
  dimensions: DimensionResult[];
  confidence: ScoreResult['confidence'];
  modelVersion: string;
  riskScore: number;
  riskLabel: RiskResult['label'];
  riskDrivers: string[];
  invalidationSignals: string[];
  cases: Record<CaseKey, CaseSummary>;
}

const DIMENSION_ICONS: Record<DimensionKey, string> = {
  growth: 'TrendingUp',
  valuation: 'DollarSign',
  momentum: 'Activity',
  quality: 'ShieldCheck',
  catalyst: 'FlaskConical',
  position: 'BarChart3',
  risk: 'Zap',
  regime: 'Clock',
};

export function analyzeStock(stock: Stock): AnalysisResult {
  const score = scoreStock(stock);
  const risk = computeRiskScore(stock);

  const breakdown: ScoreBreakdown[] = DIMENSIONS.map((def) => {
    const d = score.dimensions.find((x) => x.key === def.key);
    const dimScore = d?.score ?? null;
    return {
      label: def.label,
      score: dimScore === null ? 0 : Math.round((def.weight * dimScore) / 100),
      maxScore: def.weight,
      description: (dimScore === null ? 'Not scored — ' : '') + (d?.drivers.join('. ') ?? ''),
      icon: DIMENSION_ICONS[def.key],
    };
  });

  const totalScore = score.total;

  // Three-x probability estimate (rough heuristic)
  const threeXProbability = Math.min(85, Math.max(5, totalScore * 0.85 + (stock.volatility > 60 ? 5 : 0)));

  // Rating
  let rating: string;
  let ratingColor: string;
  if (totalScore >= 75) {
    rating = 'Strong 3x Candidate';
    ratingColor = 'emerald';
  } else if (totalScore >= 60) {
    rating = 'Promising';
    ratingColor = 'teal';
  } else if (totalScore >= 45) {
    rating = 'Speculative';
    ratingColor = 'amber';
  } else if (totalScore >= 30) {
    rating = 'Long Shot';
    ratingColor = 'orange';
  } else {
    rating = 'High Risk / Unlikely';
    ratingColor = 'red';
  }

  // Timeframe estimate
  const timeframe = totalScore >= 70 ? '1-2 years' : totalScore >= 50 ? '2-4 years' : totalScore >= 35 ? '3-5 years' : '5+ years (if ever)';

  // Key catalysts
  const keyCatalysts: string[] = [];
  if (stock.revenue_growth_yoy > 50) keyCatalysts.push('Hyper-growth revenue trajectory');
  if (stock.pipeline_count > 3) keyCatalysts.push(`${stock.pipeline_count} pipeline catalysts approaching readouts`);
  if (stock.momentum_score > 75) keyCatalysts.push('Strong technical momentum and institutional buying');
  if (stock.cash_runway_months > 48) keyCatalysts.push('Well-capitalized with long cash runway');
  if (stock.rd_ratio > 25) keyCatalysts.push('Heavy R&D investment driving innovation moat');
  if (stock.earnings_growth_yoy > 100) keyCatalysts.push('Explosive earnings growth');
  if (keyCatalysts.length === 0) keyCatalysts.push('Sector tailwinds and potential mean reversion');

  // Key risks
  const keyRisks: string[] = [];
  if (stock.earnings_growth_yoy < 0) keyRisks.push('Not yet profitable or earnings declining');
  if (stock.cash_runway_months < 24 && stock.cash_runway_months > 0) keyRisks.push('Limited cash runway — dilution risk');
  if (stock.debt_to_equity > 0.5) keyRisks.push('Elevated debt levels');
  if (stock.volatility > 70) keyRisks.push('Extreme volatility — sharp drawdowns possible');
  if (stock.beta > 2) keyRisks.push(`High beta (${stock.beta.toFixed(2)}) — amplified market sensitivity`);
  if (stock.revenue_growth_yoy < 0) keyRisks.push('Revenue is contracting');
  if (risk.label === 'extreme') keyRisks.push(`Extreme risk score (${risk.score}/100) — total loss possible`);
  if (keyRisks.length === 0) keyRisks.push('Standard market and sector risks apply');

  return {
    totalScore,
    rating,
    ratingColor,
    breakdown,
    threeXProbability: Math.round(threeXProbability),
    timeframe,
    keyCatalysts,
    keyRisks,
    dimensions: score.dimensions,
    confidence: score.confidence,
    modelVersion: score.modelVersion,
    riskScore: risk.score,
    riskLabel: risk.label,
    riskDrivers: risk.drivers,
    invalidationSignals: risk.invalidationSignals,
    cases: buildCases(stock, score, risk),
  };
}

export function formatMarketCap(mc: number): string {
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toLocaleString()}`;
}

export function getScoreColor(score: number): string {
  if (score >= 75) return 'text-neutral-900';
  if (score >= 60) return 'text-neutral-800';
  if (score >= 45) return 'text-neutral-600';
  if (score >= 30) return 'text-neutral-500';
  return 'text-neutral-400';
}

export function getScoreBg(score: number): string {
  if (score >= 75) return 'bg-neutral-900';
  if (score >= 60) return 'bg-neutral-700';
  if (score >= 45) return 'bg-neutral-500';
  if (score >= 30) return 'bg-neutral-400';
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
