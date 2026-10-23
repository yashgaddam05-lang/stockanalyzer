/**
 * Portfolio improvement ideas: which tracked stocks would strengthen a simulated portfolio,
 * based on 3x score, risk score and sector exposure. Pure and deterministic, no I/O.
 * Output is research ideas, never buy/sell instructions.
 */
import type { AnalysisResult } from '@/lib/analysis';
import type { StockListItem } from '@/lib/supabase';
import type { PortfolioValuation } from '@/lib/portfolio';
import { SECTOR_WEIGHT_LIMIT } from '@/lib/portfolio';

export type IdeaKind = 'upgrade' | 'diversify' | 'lower-risk' | 'upside';

export interface PortfolioIdea {
  kind: IdeaKind;
  ticker: string;
  name: string;
  sector: string | null;
  score: number;
  riskScore: number;
  riskLabel: string;
  reason: string;
}

export interface PortfolioInsight {
  tone: 'good' | 'warn' | 'info';
  text: string;
}

export interface PortfolioIdeasResult {
  insights: PortfolioInsight[];
  ideas: Record<IdeaKind, PortfolioIdea[]>;
  /** Weighted 3x and risk scores of the portfolio, from the app's own analysis. */
  portfolioScore: number | null;
  portfolioRisk: number | null;
}

export const IDEA_SECTIONS: { kind: IdeaKind; title: string; blurb: string }[] = [
  { kind: 'upgrade', title: 'Stronger alternatives', blurb: 'Same-sector stocks that score well above your weakest holdings with similar risk.' },
  { kind: 'diversify', title: 'Fill sector gaps', blurb: 'Strong, steadier names in sectors you hold little or none of.' },
  { kind: 'lower-risk', title: 'Lower your risk', blurb: 'High-scoring stocks with low or medium risk to balance volatile holdings.' },
  { kind: 'upside', title: 'Raise your upside', blurb: 'The best risk-adjusted scores we track that you do not own yet.' },
];

const PER_SECTION = 4;
const WEAK_SCORE = 55;
const STRONG_SCORE = 65;
const HIGH_RISK = 55;
const MIN_SECTORS = 4;

interface Candidate {
  stock: StockListItem;
  score: number;
  risk: number;
  riskLabel: string;
}

const pct = (w: number) => `${Math.round(w * 100)}%`;
const riskAdjusted = (c: Candidate) => c.score - 0.5 * c.risk;

export function buildPortfolioIdeas(
  valuation: PortfolioValuation,
  stocks: StockListItem[],
  analyses: Record<string, AnalysisResult>
): PortfolioIdeasResult {
  const held = new Set(valuation.positions.map((p) => p.ticker.toUpperCase()));
  const bySymbol = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));

  const toCandidate = (s: StockListItem): Candidate | null => {
    const a = analyses[s.ticker];
    if (!a || !((s.current_price ?? 0) > 0)) return null;
    return { stock: s, score: a.totalScore, risk: a.riskScore, riskLabel: a.riskLabel };
  };

  // Holdings with their weights and scores.
  const holdings = valuation.positions
    .map((p) => {
      const s = bySymbol.get(p.ticker.toUpperCase());
      const c = s ? toCandidate(s) : null;
      return c ? { ...c, weight: p.weight ?? 0 } : null;
    })
    .filter((h): h is Candidate & { weight: number } => h !== null);

  const weightSum = holdings.reduce((t, h) => t + h.weight, 0);
  const avg = (f: (h: Candidate) => number) =>
    weightSum > 0 ? holdings.reduce((t, h) => t + f(h) * h.weight, 0) / weightSum : null;
  const portfolioScore = avg((h) => h.score);
  const portfolioRisk = avg((h) => h.risk);

  const pool = stocks
    .filter((s) => !held.has(s.ticker.toUpperCase()))
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null);

  const used = new Set<string>();
  const idea = (kind: IdeaKind, c: Candidate, reason: string): PortfolioIdea => {
    used.add(c.stock.ticker);
    return {
      kind,
      ticker: c.stock.ticker,
      name: c.stock.company_name,
      sector: c.stock.sector ?? null,
      score: Math.round(c.score),
      riskScore: Math.round(c.risk),
      riskLabel: c.riskLabel,
      reason,
    };
  };
  const fresh = (c: Candidate) => !used.has(c.stock.ticker);

  const sectorWeights = new Map(valuation.sector_exposure.map((e) => [e.sector, e.weight]));
  const ideas: Record<IdeaKind, PortfolioIdea[]> = { upgrade: [], diversify: [], 'lower-risk': [], upside: [] };

  // 1. Stronger alternatives for weak holdings, same sector.
  const weakest = holdings.filter((h) => h.score < WEAK_SCORE).sort((a, b) => a.score - b.score);
  for (const h of weakest) {
    if (ideas.upgrade.length >= PER_SECTION) break;
    const best = pool
      .filter((c) => fresh(c) && c.stock.sector && c.stock.sector === h.stock.sector && c.score >= h.score + 15 && c.risk <= h.risk + 10)
      .sort((a, b) => riskAdjusted(b) - riskAdjusted(a))[0];
    if (best) {
      ideas.upgrade.push(
        idea('upgrade', best, `Scores ${Math.round(best.score)} vs ${Math.round(h.score)} for your ${h.stock.ticker} in ${h.stock.sector}, with ${best.risk <= h.risk ? 'lower' : 'similar'} risk (${Math.round(best.risk)} vs ${Math.round(h.risk)}).`)
      );
    }
  }

  // 2. Sector gaps: missing sectors first, when concentrated or holding few sectors.
  const overweight = valuation.sector_exposure.filter((e) => e.weight > SECTOR_WEIGHT_LIMIT);
  const heldSectors = valuation.sector_exposure.filter((e) => e.weight > 0.02).length;
  if (overweight.length || heldSectors < MIN_SECTORS) {
    const bestPerSector = new Map<string, Candidate>();
    for (const c of pool) {
      const sector = c.stock.sector;
      if (!sector || sector === 'Other' || !fresh(c) || c.score < STRONG_SCORE || c.risk >= HIGH_RISK) continue;
      if ((sectorWeights.get(sector) ?? 0) >= 0.1) continue;
      const cur = bestPerSector.get(sector);
      if (!cur || riskAdjusted(c) > riskAdjusted(cur)) bestPerSector.set(sector, c);
    }
    [...bestPerSector.entries()]
      .sort((a, b) => (sectorWeights.get(a[0]) ?? 0) - (sectorWeights.get(b[0]) ?? 0) || riskAdjusted(b[1]) - riskAdjusted(a[1]))
      .slice(0, PER_SECTION)
      .forEach(([sector, c]) => {
        const w = sectorWeights.get(sector) ?? 0;
        ideas.diversify.push(idea('diversify', c, `Adds ${sector}, ${w > 0 ? `only ${pct(w)}` : 'none'} of your portfolio today. Scores ${Math.round(c.score)} with ${c.riskLabel} risk.`));
      });
  }

  // 3. Lower risk: when the portfolio leans risky.
  if (portfolioRisk !== null && portfolioRisk >= HIGH_RISK - 5) {
    pool
      .filter((c) => fresh(c) && c.score >= STRONG_SCORE && (c.riskLabel === 'low' || c.riskLabel === 'medium'))
      .sort((a, b) => a.risk - b.risk || b.score - a.score)
      .slice(0, PER_SECTION)
      .forEach((c) =>
        ideas['lower-risk'].push(idea('lower-risk', c, `Risk ${Math.round(c.risk)} (${c.riskLabel}) vs your portfolio's ${Math.round(portfolioRisk)}, while still scoring ${Math.round(c.score)}.`))
      );
  }

  // 4. Upside: best risk-adjusted names not held, always shown as a fallback.
  pool
    .filter((c) => fresh(c) && c.riskLabel !== 'extreme' && c.score >= Math.max(STRONG_SCORE, (portfolioScore ?? 0) + 5))
    .sort((a, b) => riskAdjusted(b) - riskAdjusted(a))
    .slice(0, PER_SECTION)
    .forEach((c) =>
      ideas.upside.push(
        idea('upside', c, `Scores ${Math.round(c.score)}${portfolioScore !== null ? `, above your portfolio's ${Math.round(portfolioScore)}` : ''}, with ${c.riskLabel} risk (${Math.round(c.risk)}).`)
      )
    );

  // Plain-language read of the portfolio.
  const insights: PortfolioInsight[] = [];
  if (portfolioScore !== null) {
    const band = portfolioScore >= 70 ? 'strong' : portfolioScore >= 55 ? 'decent' : portfolioScore >= 40 ? 'middling' : 'weak';
    insights.push({ tone: portfolioScore >= 55 ? 'good' : 'warn', text: `Your weighted 3x score is ${Math.round(portfolioScore)} (${band}).` });
  }
  if (portfolioRisk !== null) {
    const band = portfolioRisk >= 75 ? 'extreme' : portfolioRisk >= 55 ? 'high' : portfolioRisk >= 30 ? 'medium' : 'low';
    insights.push({ tone: portfolioRisk >= HIGH_RISK ? 'warn' : 'good', text: `Weighted risk score is ${Math.round(portfolioRisk)} (${band}).` });
  }
  for (const e of overweight) {
    insights.push({ tone: 'warn', text: `${e.sector} is ${pct(e.weight)} of your portfolio, above the ${pct(SECTOR_WEIGHT_LIMIT)} concentration guide.` });
  }
  if (heldSectors > 0 && heldSectors < MIN_SECTORS) {
    insights.push({ tone: 'info', text: `You hold ${heldSectors} ${heldSectors === 1 ? 'sector' : 'sectors'}; spreading across ${MIN_SECTORS}+ reduces single-sector risk.` });
  }
  if (weakest[0]) {
    insights.push({ tone: 'warn', text: `Weakest holding: ${weakest[0].stock.ticker} with a 3x score of ${Math.round(weakest[0].score)}.` });
  }
  const untracked = valuation.positions.length - holdings.length;
  if (untracked > 0) {
    insights.push({ tone: 'info', text: `${untracked} ${untracked === 1 ? 'holding is' : 'holdings are'} not scored yet, so ${untracked === 1 ? 'it is' : 'they are'} left out. Search ${untracked === 1 ? 'it' : 'them'} to add to 3x Hunter.` });
  }

  return { insights, ideas, portfolioScore, portfolioRisk };
}
