// Investor temperament quiz: behavior-first questions map to one of the four 3x Bots, plus the
// biggest drop the investor is likely to sit through. Pure and deterministic.
import type { BotId } from '@/lib/bots';

export interface QuizOption {
  label: string;
  hint?: string;
  points: number;
}

export interface QuizQuestion {
  id: string;
  title: string;
  subtitle?: string;
  options: QuizOption[];
}

// Each answer scores 0 (most cautious) to 4 (most aggressive). Behavioral questions (what you would
// actually do in a drop) count double, because people overstate risk tolerance in calm markets.
export const QUESTIONS: QuizQuestion[] = [
  {
    id: 'drop',
    title: 'Your portfolio falls 25% in two months. What do you most likely do?',
    subtitle: 'Be honest. This is the question that matters most.',
    options: [
      { label: 'Sell everything to stop the pain', points: 0 },
      { label: 'Sell some to feel safer', points: 1 },
      { label: 'Hold and wait it out', points: 3 },
      { label: 'Buy more while it is cheap', points: 4 },
    ],
  },
  {
    id: 'checking',
    title: 'How often do you check your investments?',
    options: [
      { label: 'Several times a day', hint: 'and swings stress me out', points: 0 },
      { label: 'Daily', points: 1 },
      { label: 'Weekly', points: 3 },
      { label: 'Monthly or less', points: 4 },
    ],
  },
  {
    id: 'horizon',
    title: 'When will you need this money?',
    options: [
      { label: 'Within 2 years', points: 0 },
      { label: '2 to 5 years', points: 1 },
      { label: '5 to 10 years', points: 3 },
      { label: '10+ years', points: 4 },
    ],
  },
  {
    id: 'goal',
    title: 'What matters more to you?',
    options: [
      { label: 'Not losing money', points: 0 },
      { label: 'Steady growth, small dips are fine', points: 2 },
      { label: 'Beating the market', points: 3 },
      { label: 'Finding the next 3x, whatever it takes', points: 4 },
    ],
  },
  {
    id: 'regret',
    title: 'Which would bother you more?',
    options: [
      { label: 'Losing $2,000 I already had', points: 0 },
      { label: 'Both about the same', points: 2 },
      { label: 'Missing a $2,000 gain I could have made', points: 4 },
    ],
  },
  {
    id: 'cushion',
    title: 'If this money went down 50%, how would your life change?',
    options: [
      { label: 'A lot: it is most of my savings', points: 0 },
      { label: 'Noticeably, but I would be fine', points: 2 },
      { label: 'Not much: it is money I can afford to risk', points: 4 },
    ],
  },
  {
    id: 'experience',
    title: 'Have you held a stock through a 30%+ drop before?',
    options: [
      { label: 'Never invested through a big drop', points: 1 },
      { label: 'Yes, and I sold', points: 0 },
      { label: 'Yes, and I held', points: 3 },
      { label: 'Yes, and I bought more', points: 4 },
    ],
  },
];

const WEIGHT: Record<string, number> = { drop: 2, experience: 2 };

export interface TemperamentResult {
  /** 0-100, higher = more aggressive temperament */
  score: number;
  bot: BotId;
  label: string;
  summary: string;
  /** Largest peak-to-trough drop (as a positive %) this investor is likely to hold through. */
  tolerance: number;
}

const BANDS: { max: number; bot: BotId; label: string; summary: string; tolerance: number }[] = [
  {
    max: 35,
    bot: 'steady',
    label: 'Steady',
    tolerance: 20,
    summary: 'You protect what you have. Big swings would push you to sell at the wrong time, so calm, established companies suit you best.',
  },
  {
    max: 55,
    bot: 'balanced',
    label: 'Balanced',
    tolerance: 30,
    summary: 'You want growth but not a roller coaster. A mix of strong scores with the riskiest names left out fits how you react to drops.',
  },
  {
    max: 78,
    bot: 'growth',
    label: 'Growth',
    tolerance: 40,
    summary: 'You can sit through real drops for higher long-run returns. Chasing the best scores across the market suits you.',
  },
  {
    max: 101,
    bot: 'moonshot',
    label: 'Moonshot',
    tolerance: 55,
    summary: 'You are comfortable with big swings and long horizons. You can hold high-risk names through deep drawdowns, which is what their upside requires.',
  },
];

export function scoreTemperament(answers: Record<string, number>): TemperamentResult {
  let got = 0;
  let max = 0;
  for (const q of QUESTIONS) {
    const w = WEIGHT[q.id] ?? 1;
    const top = Math.max(...q.options.map((o) => o.points));
    max += top * w;
    const idx = answers[q.id];
    const opt = typeof idx === 'number' ? q.options[idx] : undefined;
    got += (opt?.points ?? 0) * w;
  }
  const score = Math.round((got / max) * 100);
  // A near-term need for the money caps the style, whatever the other answers say.
  const horizonPts = QUESTIONS.find((q) => q.id === 'horizon')!.options[answers.horizon ?? 0]?.points ?? 0;
  let band = BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
  if (horizonPts === 0 && band.bot !== 'steady') band = BANDS[0];
  else if (horizonPts === 1 && (band.bot === 'growth' || band.bot === 'moonshot')) band = BANDS[1];
  return { score, bot: band.bot, label: band.label, summary: band.summary, tolerance: band.tolerance };
}

export interface Curve {
  d: string;
  v: number;
}

/**
 * Replays a strategy for an investor who sells everything once the drop from the peak passes their
 * tolerance, sits in cash for `waitMonths`, then buys back in. Returns the ending value of $10,000
 * and how many times they bailed out. Cash earns nothing (conservative).
 */
export function panicReplay(curve: Curve[], tolerancePct: number, waitMonths = 6): { endValue: number; bailouts: number } {
  if (curve.length < 2) return { endValue: 10000, bailouts: 0 };
  const months = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  let wealth = 10000;
  let invested = true;
  let peakWealth = wealth;
  let backInAt = 0;
  let bailouts = 0;
  for (let i = 1; i < curve.length; i++) {
    if (invested) {
      wealth *= curve[i].v / curve[i - 1].v;
      peakWealth = Math.max(peakWealth, wealth);
      if (wealth / peakWealth - 1 <= -tolerancePct / 100) {
        invested = false;
        bailouts++;
        backInAt = months(curve[i].d) + waitMonths;
      }
    } else if (months(curve[i].d) >= backInAt) {
      invested = true;
      peakWealth = wealth;
    }
  }
  return { endValue: Math.round(wealth), bailouts };
}

/** Worst peak-to-trough drop of a curve, as a positive percent. */
export function worstDrop(curve: Curve[]): number {
  let peak = curve[0]?.v ?? 0;
  let worst = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.v);
    worst = Math.min(worst, p.v / peak - 1);
  }
  return Math.round(-worst * 100);
}
