/**
 * Bull / neutral / bear cases built only from available metrics.
 * Educational framing — describes scenarios, never recommends an action.
 */
import type { Stock } from '../supabase.js';
import type { DimensionResult, ScoreResult } from './model.js';
import { num } from './model.js';
import type { RiskResult } from './risk.js';

export type CaseKey = 'bull' | 'neutral' | 'bear';

export interface CaseSummary {
  key: CaseKey;
  title: string;
  summary: string;
  points: string[];
}

function scored(score: ScoreResult): (DimensionResult & { score: number })[] {
  return score.dimensions.filter((d): d is DimensionResult & { score: number } => d.score !== null);
}

export function buildCases(stock: Stock, score: ScoreResult, risk: RiskResult): Record<CaseKey, CaseSummary> {
  const dims = scored(score);
  const strong = dims.filter((d) => d.score >= 60).sort((a, b) => b.score - a.score);
  const weak = dims.filter((d) => d.score < 45).sort((a, b) => a.score - b.score);
  const mid = dims.filter((d) => d.score >= 45 && d.score < 60);
  const name = stock.ticker;

  // Bull
  const bullPoints = strong.slice(0, 4).map((d) => `${d.label} (${d.score}/100): ${d.drivers[0] ?? 'supportive'}`);
  const rev = num(stock.revenue_growth_yoy);
  if (rev !== null && rev > 30) bullPoints.push(`If ${rev.toFixed(0)}% revenue growth persists, sales roughly triple in about ${Math.max(1, Math.ceil(Math.log(3) / Math.log(1 + rev / 100)))} year(s)`);
  const tgt = num(stock.target_mean_price);
  const px = num(stock.current_price);
  if (tgt !== null && px !== null && px > 0 && tgt > px) bullPoints.push(`Analyst mean target sits ${(((tgt / px) - 1) * 100).toFixed(0)}% above the current price`);
  if (!bullPoints.length) bullPoints.push('No dimension currently scores strongly; an upside scenario would need a change in fundamentals');

  // Bear
  const bearPoints = weak.slice(0, 3).map((d) => `${d.label} (${d.score}/100): ${d.drivers[0] ?? 'weak'}`);
  bearPoints.push(...risk.drivers.filter((r) => !r.startsWith('No ')).slice(0, 3));
  if (!bearPoints.length) bearPoints.push('No major weakness in the available data; general market and sector risk still applies');

  // Neutral
  const neutralPoints = mid.slice(0, 3).map((d) => `${d.label} (${d.score}/100) is middling: ${d.drivers[0] ?? ''}`.trim());
  const missing = score.dimensions.filter((d) => !d.available).map((d) => d.label);
  if (missing.length) neutralPoints.push(`Not yet scored for lack of data: ${missing.join(', ')}`);
  neutralPoints.push(`Model confidence is ${score.confidence} (${score.availableWeight}% of weight has data)`);

  return {
    bull: {
      key: 'bull',
      title: 'Bull case',
      summary: strong.length
        ? `${name}'s strongest evidence is in ${strong.slice(0, 2).map((d) => d.label.toLowerCase()).join(' and ')}. In an upside scenario these strengths compound.`
        : `${name} shows few standout strengths in the current data.`,
      points: bullPoints,
    },
    neutral: {
      key: 'neutral',
      title: 'Neutral case',
      summary: `A base scenario where ${name} tracks its current ${score.total}/100 opportunity profile with ${risk.label} risk (${risk.score}/100) and no major surprises.`,
      points: neutralPoints,
    },
    bear: {
      key: 'bear',
      title: 'Bear case',
      summary: weak.length || risk.score >= 55
        ? `The downside scenario centers on ${weak.length ? weak.slice(0, 2).map((d) => d.label.toLowerCase()).join(' and ') : 'its risk profile'}${risk.score >= 55 ? ` and a ${risk.label} risk score of ${risk.score}` : ''}.`
        : `${name}'s data shows limited specific weaknesses; a downside scenario would most likely come from broader market or sector pressure.`,
      points: bearPoints,
    },
  };
}
