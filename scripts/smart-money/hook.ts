// TR_SCORE_HOOK for scripts/track-record/compute.ts: v2.2 plus a candidate Smart Money dimension.
// Adding a dimension of weight W with score x is a weighted average of the v2.2 total and x, since
// the model re-normalizes weights over dimensions with data. Stocks without the signal are unchanged.
// SM_VARIANT: holders | holders+delta (default) | full (also C-suite buys, every sector). SM_WEIGHT default 8.
import { HEALTH, smartAt, csuiteBuysAt, insiderDataEnd } from './signal';

const VARIANT = process.env.SM_VARIANT ?? 'holders+delta';
const W = Number(process.env.SM_WEIGHT ?? 8);
const scale = (x: number, lo: number, hi: number) => Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100));

type Result = { availableWeight: number; dimensions: { weight: number; score: number | null }[] };

export function smartMoneyScore(ticker: string, sector: string | null, D: number): number | null {
  const parts: { v: number; w: number }[] = [];
  if (HEALTH.has(sector ?? '')) {
    const s = smartAt(D).get(ticker);
    const holders = s?.holders ?? 0;
    parts.push({ v: scale(holders, 0, 6), w: 0.7 });
    if (VARIANT !== 'holders') parts.push({ v: scale(holders - (s?.prev ?? 0), -3, 3), w: 0.3 });
  }
  if (VARIANT === 'full' && D <= insiderDataEnd + 1) {
    parts.push({ v: csuiteBuysAt(ticker, D).n > 0 ? 100 : 40, w: parts.length ? 0.3 : 1 });
  }
  if (!parts.length) return null;
  return parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0);
}

export default function hook(ticker: string, sector: string | null, D: number, s: Result & { total: number }): number {
  const x = smartMoneyScore(ticker, sector, D);
  if (x === null) return s.total;
  const sum = s.dimensions.reduce((a, d) => a + (d.score === null ? 0 : d.weight * d.score), 0);
  return Math.round((sum + W * x) / (s.availableWeight + W));
}
