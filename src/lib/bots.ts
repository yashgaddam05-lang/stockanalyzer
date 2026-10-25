// 3x Bots: fixed, rule-based strategies at four risk levels. The same rules drive the
// historical backtest (scripts/track-record) and the live picks on the Bots page.
// Bots pick only from S&P 500 members: the extra growth names 3x Hunter tracks were chosen with
// hindsight (they became famous later), which would make any backtest on them meaningless.

export interface BotCandidate {
  ticker: string;
  score: number;
  risk: number;
  inSp500: boolean;
}

export type BotId = 'steady' | 'balanced' | 'growth' | 'moonshot';

export type RiskTier = 'calmest-third' | 'not-riskiest-third' | 'all' | 'riskiest-third';

export interface BotDef {
  id: BotId;
  name: string;
  level: 1 | 2 | 3 | 4;
  riskLabel: string;
  tagline: string;
  rules: string[];
  size: number;
  color: string;
  /** Risk tier relative to the index on each date, so bots stay distinct in calm and wild markets. */
  tier: RiskTier;
  rank: (c: BotCandidate) => number;
}

export const BOTS: BotDef[] = [
  {
    id: 'steady',
    name: 'Steady',
    level: 1,
    riskLabel: 'Low risk',
    tagline: 'The calmest third of the S&P 500, picking the best 3x scores among them.',
    rules: ['S&P 500 members', 'Calmest third of the index by risk score', 'Top 25 by 3x score, equal weight'],
    size: 25,
    color: '#0f766e',
    tier: 'calmest-third',
    rank: (c) => c.score,
  },
  {
    id: 'balanced',
    name: 'Balanced',
    level: 2,
    riskLabel: 'Medium risk',
    tagline: 'Skips the riskiest third of the index and rewards upside per unit of risk.',
    rules: ['S&P 500 members', 'Excludes the riskiest third', 'Ranked by 3x score minus half the risk score', 'Top 20, equal weight'],
    size: 20,
    color: '#2563eb',
    tier: 'not-riskiest-third',
    rank: (c) => c.score - 0.5 * c.risk,
  },
  {
    id: 'growth',
    name: 'Growth',
    level: 3,
    riskLabel: 'High risk',
    tagline: 'Chases the highest 3x scores in the whole index, whatever the risk.',
    rules: ['S&P 500 members', 'Any risk level', 'Top 15 by 3x score, equal weight'],
    size: 15,
    color: '#7c3aed',
    tier: 'all',
    rank: (c) => c.score,
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    level: 4,
    riskLabel: 'Very high risk',
    tagline: 'Only the riskiest third of the index, picked by top scores: the biggest swings, both ways.',
    rules: ['S&P 500 members', 'Riskiest third of the index by risk score', 'Top 10 by 3x score, equal weight'],
    size: 10,
    color: '#dc2626',
    tier: 'riskiest-third',
    rank: (c) => c.score,
  },
];

export function botPicks(bot: BotDef, candidates: BotCandidate[]): BotCandidate[] {
  let pool = candidates.filter((c) => c.inSp500);
  if (bot.tier !== 'all' && pool.length) {
    const risks = pool.map((c) => c.risk).sort((a, b) => a - b);
    const lowCut = risks[Math.floor(risks.length / 3)];
    const highCut = risks[Math.floor((risks.length * 2) / 3)];
    if (bot.tier === 'calmest-third') pool = pool.filter((c) => c.risk <= lowCut);
    else if (bot.tier === 'not-riskiest-third') pool = pool.filter((c) => c.risk < highCut);
    else pool = pool.filter((c) => c.risk >= highCut);
  }
  return pool
    .sort((a, b) => bot.rank(b) - bot.rank(a) || a.ticker.localeCompare(b.ticker))
    .slice(0, bot.size);
}
