/**
 * Portfolio report: a 0-100 portfolio score, a per-holding report (3x score + analyst view) and
 * prioritized tips. Pure and deterministic. Research output, not advice.
 */
import type { AnalysisResult } from '@/lib/analysis';
import type { StockListItem } from '@/lib/supabase';
import type { PortfolioValuation } from '@/lib/portfolio';
import { POSITION_WEIGHT_LIMIT, SECTOR_WEIGHT_LIMIT } from '@/lib/portfolio';

export interface AnalystView {
  consensus: string | null;
  /** 1 = strong buy ... 5 = sell */
  mean: number | null;
  count: number | null;
  target: number | null;
  low: number | null;
  high: number | null;
  /** % from current price to the mean target */
  upside: number | null;
}

export type Verdict = 'strong' | 'hold' | 'review' | 'unscored';

export interface HoldingReport {
  ticker: string;
  name: string;
  sector: string | null;
  weight: number;
  score: number | null;
  scoreLabel: string;
  valuationScore: number | null;
  riskScore: number | null;
  riskLabel: string | null;
  analyst: AnalystView;
  verdict: Verdict;
  note: string;
}

export interface ScorePart {
  key: 'upside' | 'risk' | 'diversification' | 'concentration' | 'analysts';
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}

export interface Tip {
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  href?: string;
}

export interface PortfolioReport {
  score: number | null;
  grade: string;
  summary: string;
  parts: ScorePart[];
  holdings: HoldingReport[];
  tips: Tip[];
}

const CONSENSUS: Record<string, string> = {
  strong_buy: 'Strong buy',
  buy: 'Buy',
  hold: 'Hold',
  underperform: 'Underperform',
  sell: 'Sell',
  strong_sell: 'Strong sell',
};

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const pct = (w: number) => `${Math.round(w * 100)}%`;

export function scoreLabel(score: number | null): string {
  if (score === null) return 'Not scored';
  if (score >= 70) return 'Strong potential';
  if (score >= 55) return 'Decent potential';
  if (score >= 40) return 'Middling';
  return 'Weak';
}

export function gradeFor(score: number | null): string {
  if (score === null) return '--';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 55) return 'C+';
  if (score >= 45) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function analystView(s: StockListItem | undefined): AnalystView {
  const price = s?.current_price ?? null;
  const target = s?.target_mean_price ?? null;
  return {
    consensus: s?.recommendation_key ? CONSENSUS[s.recommendation_key] ?? s.recommendation_key.replace(/_/g, ' ') : null,
    mean: s?.recommendation_mean ?? null,
    count: s?.analyst_count ?? null,
    target,
    low: s?.target_low_price ?? null,
    high: s?.target_high_price ?? null,
    upside: target !== null && price !== null && price > 0 ? Math.round((target / price - 1) * 1000) / 10 : null,
  };
}

/** 0-100 analyst score: consensus (1 best .. 5 worst) blended with upside to the mean target. */
function analystScore(a: AnalystView): number | null {
  const parts: number[] = [];
  if (a.mean !== null) parts.push(clamp(((5 - a.mean) / 4) * 100));
  if (a.upside !== null) parts.push(clamp(((a.upside + 10) / 50) * 100)); // -10% -> 0, +40% -> 100
  return parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : null;
}

export function buildPortfolioReport(
  valuation: PortfolioValuation,
  stocks: StockListItem[],
  analyses: Record<string, AnalysisResult>
): PortfolioReport {
  const bySymbol = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));

  const holdings: HoldingReport[] = valuation.positions
    .map((p) => {
      const s = bySymbol.get(p.ticker.toUpperCase());
      const a = s ? analyses[s.ticker] : undefined;
      const score = a ? Math.round(a.totalScore) : null;
      const analyst = analystView(s);
      const valuationScore = a?.dimensions.find((d) => d.key === 'valuation')?.score ?? null;
      let verdict: Verdict = 'unscored';
      let note = 'Not tracked yet. Search the ticker to add and score it.';
      if (score !== null) {
        const bearish = (analyst.upside !== null && analyst.upside < 0) || (analyst.mean !== null && analyst.mean >= 3.5);
        const bullish = analyst.upside !== null && analyst.upside >= 10;
        if (score >= 65 && !bearish) {
          verdict = 'strong';
          note = bullish ? `Strong score and analysts see ${analyst.upside}% upside.` : 'Strong score; a holding with room to run.';
        } else if (score < 45 || (bearish && score < 60)) {
          verdict = 'review';
          note = bearish
            ? analyst.upside !== null && analyst.upside < 0
              ? `Trades above the average analyst target (${analyst.upside}%) with a ${score} score.`
              : `Analysts lean negative and the 3x score is ${score}.`
            : `Weak 3x score (${score}); check whether the reason you own it still holds.`;
        } else {
          verdict = 'hold';
          note = bullish ? `Middling score, but analysts see ${analyst.upside}% upside.` : 'Decent fundamentals; nothing urgent.';
        }
      }
      return {
        ticker: p.ticker,
        name: s?.company_name ?? p.ticker,
        sector: s?.sector ?? null,
        weight: p.weight ?? 0,
        score,
        scoreLabel: scoreLabel(score),
        valuationScore: valuationScore === null ? null : Math.round(valuationScore),
        riskScore: a ? Math.round(a.riskScore) : null,
        riskLabel: a?.riskLabel ?? null,
        analyst,
        verdict,
        note,
      };
    })
    .sort((x, y) => y.weight - x.weight);

  const scored = holdings.filter((h) => h.score !== null);
  const wsum = scored.reduce((t, h) => t + h.weight, 0);
  const wavg = (f: (h: HoldingReport) => number | null) => {
    let t = 0, w = 0;
    for (const h of scored) {
      const v = f(h);
      if (v !== null) { t += v * h.weight; w += h.weight; }
    }
    return w > 0 ? t / w : null;
  };

  const upside = wavg((h) => h.score);
  const risk = wavg((h) => h.riskScore);
  const analystsAvg = wavg((h) => analystScore(h.analyst));
  const sectors = valuation.sector_exposure.filter((e) => e.weight > 0.02);
  const topSector = valuation.sector_exposure[0];
  const top = valuation.concentration.top_position_weight;
  const hhi = valuation.concentration.hhi;
  const effectiveN = hhi && hhi > 0 ? 1 / hhi : null;

  // Diversification: more sectors and more effective positions, penalize sector concentration.
  const divScore = wsum > 0
    ? clamp(Math.min(sectors.length, 6) / 6 * 50 + Math.min(effectiveN ?? 0, 12) / 12 * 30 + (topSector ? clamp((1 - topSector.weight) / (1 - SECTOR_WEIGHT_LIMIT) * 20, 0, 20) : 0))
    : null;
  const concScore = top !== null ? clamp(100 - Math.max(0, top - 0.1) / (0.5 - 0.1) * 100) : null;

  const parts: ScorePart[] = [
    { key: 'upside', label: 'Upside potential', weight: 35, score: upside, detail: upside === null ? 'No scored holdings yet' : `Weighted 3x score ${Math.round(upside)}` },
    { key: 'risk', label: 'Risk balance', weight: 20, score: risk === null ? null : clamp(100 - risk), detail: risk === null ? 'No risk data' : `Weighted risk score ${Math.round(risk)} (lower is safer)` },
    { key: 'diversification', label: 'Diversification', weight: 20, score: divScore, detail: `${sectors.length} ${sectors.length === 1 ? 'sector' : 'sectors'}${effectiveN ? `, behaves like ${effectiveN.toFixed(1)} equal positions` : ''}` },
    { key: 'concentration', label: 'Position sizing', weight: 10, score: concScore, detail: top === null ? 'No priced positions' : `Largest position ${pct(top)} of the portfolio` },
    { key: 'analysts', label: 'Analyst outlook', weight: 15, score: analystsAvg, detail: analystsAvg === null ? 'No analyst coverage yet' : 'Consensus rating and upside to average target, weighted by position' },
  ];
  const avail = parts.filter((p) => p.score !== null);
  const aw = avail.reduce((t, p) => t + p.weight, 0);
  const score = aw >= 50 ? Math.round(avail.reduce((t, p) => t + (p.score as number) * p.weight, 0) / aw) : null;
  for (const p of parts) if (p.score !== null) p.score = Math.round(p.score);

  // ---- Tips, most important first ----
  const tips: Tip[] = [];
  const oversized = new Set<string>();
  for (const h of holdings.filter((x) => x.weight > POSITION_WEIGHT_LIMIT)) {
    oversized.add(h.ticker);
    tips.push({
      priority: 'high',
      title: h.verdict === 'review' ? `Trim and re-check ${h.ticker}` : `Trim or balance ${h.ticker}`,
      body: `${h.ticker} is ${pct(h.weight)} of your portfolio, above the ${pct(POSITION_WEIGHT_LIMIT)} guide. One bad quarter there moves your whole result.${h.verdict === 'review' ? ` ${h.note}` : ''}`,
      href: `/app/stock/${encodeURIComponent(h.ticker)}`,
    });
  }
  for (const e of valuation.sector_exposure.filter((x) => x.weight > SECTOR_WEIGHT_LIMIT)) {
    tips.push({
      priority: 'high',
      title: `Spread beyond ${e.sector}`,
      body: `${e.sector} makes up ${pct(e.weight)} of your money. Adding strong names from other sectors cuts the risk of one industry dragging everything down.`,
      href: '#portfolio-ideas',
    });
  }
  const review = holdings.filter((h) => h.verdict === 'review' && !oversized.has(h.ticker)).sort((a, b) => b.weight - a.weight);
  for (const h of review.slice(0, 3)) {
    tips.push({
      priority: h.weight >= 0.1 ? 'high' : 'medium',
      title: `Re-check ${h.ticker}`,
      body: h.note + (h.weight >= 0.1 ? ` It is ${pct(h.weight)} of your portfolio.` : ''),
      href: `/app/stock/${encodeURIComponent(h.ticker)}`,
    });
  }
  if (risk !== null && risk >= 55) {
    tips.push({ priority: 'medium', title: 'Dial down overall risk', body: `Your weighted risk score is ${Math.round(risk)} (high). Balancing with low or medium-risk high scorers smooths the ride.`, href: '#portfolio-ideas' });
  }
  if (upside !== null && upside < 55) {
    tips.push({ priority: 'medium', title: 'Raise the upside', body: `Your weighted 3x score is ${Math.round(upside)}. Swapping your weakest holdings for higher scorers in the same sectors lifts it without changing your style.`, href: '#portfolio-ideas' });
  }
  if (sectors.length > 0 && sectors.length < 4) {
    tips.push({ priority: 'medium', title: 'Add another sector or two', body: `You hold ${sectors.length} ${sectors.length === 1 ? 'sector' : 'sectors'}. Four or more makes the portfolio sturdier.`, href: '#portfolio-ideas' });
  }
  const strong = holdings.filter((h) => h.verdict === 'strong' && h.weight < 0.05);
  if (strong.length) {
    tips.push({ priority: 'low', title: 'Your best ideas are small positions', body: `${strong.map((h) => h.ticker).slice(0, 3).join(', ')} score strongly but are under 5% each. If you still like them, they may deserve more weight.` });
  }
  const unscored = holdings.filter((h) => h.verdict === 'unscored');
  if (unscored.length) {
    const one = unscored.length === 1;
    tips.push({ priority: 'low', title: 'Score the rest of your holdings', body: `${unscored.map((h) => h.ticker).slice(0, 4).join(', ')}${unscored.length > 4 ? ' and more' : ''} ${one ? 'is' : 'are'} not tracked yet. Search ${one ? 'it' : 'them'} in the top bar to add ${one ? 'it' : 'them'}, then this report covers your whole portfolio.` });
  }
  tips.push({ priority: 'low', title: 'Set alerts on your holdings', body: 'Get notified when a holding’s 3x score drops or its price crosses a level, instead of checking every day.', href: '/app/alerts' });

  const grade = gradeFor(score);
  const summary = score === null
    ? 'Add scored holdings to get a portfolio score.'
    : score >= 75
      ? 'A strong portfolio by 3x Hunter’s measures. Keep an eye on position sizes and score changes.'
      : score >= 55
        ? 'A solid base with clear room to improve. Start with the high-priority tips below.'
        : 'Several weak spots. The tips below show the biggest improvements first.';

  return { score, grade, summary, parts, holdings, tips };
}
