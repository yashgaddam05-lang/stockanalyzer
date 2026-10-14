import type { Stock } from './supabase';

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
}

export function analyzeStock(stock: Stock): AnalysisResult {
  const breakdown: ScoreBreakdown[] = [];

  // 1. Revenue Growth (0-25 pts)
  const revGrowthScore = Math.min(25, Math.max(0, (stock.revenue_growth_yoy / 100) * 20 + 5));
  breakdown.push({
    label: 'Revenue Growth',
    score: Math.round(revGrowthScore),
    maxScore: 25,
    description: `${stock.revenue_growth_yoy.toFixed(1)}% YoY revenue growth. ${stock.revenue_growth_yoy > 50 ? 'Exceptional top-line expansion.' : stock.revenue_growth_yoy > 20 ? 'Strong growth trajectory.' : stock.revenue_growth_yoy > 0 ? 'Moderate growth.' : 'Revenue declining — risky.'}`,
    icon: 'TrendingUp',
  });

  // 2. Earnings Growth (0-20 pts)
  const earnGrowthScore = Math.min(20, Math.max(0, (stock.earnings_growth_yoy / 100) * 15 + 5));
  breakdown.push({
    label: 'Earnings Growth',
    score: Math.round(earnGrowthScore),
    maxScore: 20,
    description: `${stock.earnings_growth_yoy.toFixed(1)}% YoY earnings growth. ${stock.earnings_growth_yoy > 50 ? 'Explosive profit growth.' : stock.earnings_growth_yoy > 0 ? 'Profitable and growing.' : 'Not yet profitable or earnings declining.'}`,
    icon: 'DollarSign',
  });

  // 3. Technical Momentum (0-15 pts)
  const momentumScore = Math.min(15, Math.max(0, (stock.momentum_score / 100) * 15));
  breakdown.push({
    label: 'Price Momentum',
    score: Math.round(momentumScore),
    maxScore: 15,
    description: `Momentum score of ${stock.momentum_score}/100. ${stock.momentum_score > 75 ? 'Strong bullish momentum.' : stock.momentum_score > 50 ? 'Positive but cooling.' : 'Weak or bearish momentum.'}`,
    icon: 'Activity',
  });

  // 4. Innovation / Pipeline (0-15 pts)
  const innovationScore = Math.min(15, Math.max(0, (stock.rd_ratio / 50) * 7.5 + Math.min(7.5, stock.pipeline_count * 1.5)));
  breakdown.push({
    label: 'Innovation & Pipeline',
    score: Math.round(innovationScore),
    maxScore: 15,
    description: `R&D intensity: ${stock.rd_ratio.toFixed(1)}% of revenue. ${stock.pipeline_count} pipeline candidate${stock.pipeline_count !== 1 ? 's' : ''}. ${stock.pipeline_count > 5 || stock.rd_ratio > 30 ? 'Deep innovation bench.' : stock.pipeline_count > 0 || stock.rd_ratio > 10 ? 'Moderate innovation pipeline.' : 'Limited innovation pipeline.'}`,
    icon: 'FlaskConical',
  });

  // 5. Financial Health (0-15 pts)
  const healthScore = Math.min(15, Math.max(0, 15 - (stock.debt_to_equity * 8) + Math.min(5, stock.cash_runway_months / 24)));
  breakdown.push({
    label: 'Financial Health',
    score: Math.round(healthScore),
    maxScore: 15,
    description: `Debt-to-equity: ${stock.debt_to_equity.toFixed(2)}. Cash runway: ${stock.cash_runway_months} months. ${stock.cash_runway_months > 60 ? 'Very well-funded.' : stock.cash_runway_months > 24 ? 'Adequate cash position.' : 'Cash burn is a concern.'}`,
    icon: 'ShieldCheck',
  });

  // 6. Volatility / Asymmetry (0-10 pts) — higher volatility = more potential for 3x (but more risk)
  const volScore = Math.min(10, Math.max(2, (stock.volatility / 100) * 12));
  breakdown.push({
    label: 'Volatility / Upside Potential',
    score: Math.round(volScore),
    maxScore: 10,
    description: `Annualized volatility: ${stock.volatility.toFixed(0)}%. Beta: ${stock.beta.toFixed(2)}. ${stock.volatility > 70 ? 'High volatility — large swings possible both ways.' : stock.volatility > 40 ? 'Moderate volatility.' : 'Relatively stable.'}`,
    icon: 'Zap',
  });

  const totalScore = Math.round(breakdown.reduce((sum, b) => sum + b.score, 0));

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
  if (stock.risk_level === 'extreme') keyRisks.push('Extreme risk profile — total loss possible');
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
