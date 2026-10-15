/** Preset screens over scored stocks (roadmap item 6). Pure filter/sort pairs. */
import type { Stock } from '../supabase.js';
import type { DimensionKey, ScoreResult } from './model.js';
import { num, rangePosition } from './model.js';
import type { RiskResult } from './risk.js';

export interface ScoredStock {
  stock: Stock & { score_change?: number | null };
  score: ScoreResult;
  risk: RiskResult;
}

export interface PresetScreen {
  id: string;
  label: string;
  description: string;
  filter: (s: ScoredStock) => boolean;
  sort: (a: ScoredStock, b: ScoredStock) => number;
}

function dim(s: ScoredStock, key: DimensionKey): number | null {
  return s.score.dimensions.find((d) => d.key === key)?.score ?? null;
}

const byTotal = (a: ScoredStock, b: ScoredStock) => b.score.total - a.score.total;
const riskAdjusted = (s: ScoredStock) => s.score.total * (1 - s.risk.score / 200);

export const PRESET_SCREENS: ReadonlyArray<PresetScreen> = [
  {
    id: 'highest-3x',
    label: 'Highest 3x',
    description: 'Every stock ranked by 3x Opportunity Score.',
    filter: () => true,
    sort: byTotal,
  },
  {
    id: 'best-risk-adjusted',
    label: 'Best risk-adjusted',
    description: 'Opportunity score discounted by risk score; excludes extreme risk.',
    filter: (s) => s.risk.label !== 'extreme',
    sort: (a, b) => riskAdjusted(b) - riskAdjusted(a),
  },
  {
    id: 'highest-momentum',
    label: 'Highest momentum',
    description: 'Momentum dimension 60+, strongest trend first.',
    filter: (s) => (dim(s, 'momentum') ?? -1) >= 60,
    sort: (a, b) => (dim(b, 'momentum') ?? 0) - (dim(a, 'momentum') ?? 0),
  },
  {
    id: 'most-undervalued',
    label: 'Most undervalued',
    description: 'Valuation Upside 50+ (requires valuation data).',
    filter: (s) => (dim(s, 'valuation') ?? -1) >= 50,
    sort: (a, b) => (dim(b, 'valuation') ?? 0) - (dim(a, 'valuation') ?? 0),
  },
  {
    id: 'profitable-compounders',
    label: 'Profitable compounders',
    description: 'Positive net (or operating) margin with 10%+ revenue growth.',
    filter: (s) => {
      const m = num(s.stock.profit_margin) ?? num(s.stock.operating_margin);
      const g = num(s.stock.revenue_growth_yoy);
      return m !== null && m > 0 && g !== null && g >= 10;
    },
    sort: byTotal,
  },
  {
    id: 'oversold-quality',
    label: 'Oversold quality',
    description: 'Fundamental Quality 60+ trading in the lower third of its 52-week range or with weak momentum.',
    filter: (s) => {
      if ((dim(s, 'quality') ?? -1) < 60) return false;
      const pos = rangePosition(s.stock);
      const ms = num(s.stock.momentum_score);
      return (pos !== null && pos <= 0.35) || (ms !== null && ms <= 40);
    },
    sort: (a, b) => (dim(b, 'quality') ?? 0) - (dim(a, 'quality') ?? 0),
  },
  {
    id: 'new-score-breakouts',
    label: 'New score breakouts',
    description: 'Score up 5+ points since the previous snapshot.',
    filter: (s) => {
      const c = num(s.stock.score_change ?? null);
      return c !== null && c >= 5;
    },
    sort: (a, b) => (num(b.stock.score_change ?? null) ?? 0) - (num(a.stock.score_change ?? null) ?? 0),
  },
  {
    id: 'lower-risk',
    label: 'Lower risk',
    description: 'Low or medium risk score, safest first.',
    filter: (s) => s.risk.label === 'low' || s.risk.label === 'medium',
    sort: (a, b) => a.risk.score - b.risk.score || byTotal(a, b),
  },
];

export function getPresetScreen(id: string): PresetScreen | undefined {
  return PRESET_SCREENS.find((p) => p.id === id);
}

export function applyPresetScreen(id: string, items: ScoredStock[]): ScoredStock[] {
  const p = getPresetScreen(id);
  return p ? items.filter(p.filter).sort(p.sort) : items;
}
