// 3x goal math: the return a target needs, how long a rate takes, and a block-bootstrap simulation
// of a strategy's own monthly history. Pure and deterministic (seeded), so numbers never jump.

/** Annual compounded return needed to turn 1 into `multiple` in `years`, with no deposits. */
export function requiredCagr(multiple: number, years: number): number {
  return multiple ** (1 / years) - 1;
}

/**
 * Annual return needed when `monthly` is also deposited each month. The target stays a multiple of
 * the original amount, so deposits do part of the work; this is the rate the investments still need.
 */
export function requiredCagrWithDeposits(start: number, target: number, years: number, monthly: number): number {
  const months = Math.round(years * 12);
  const end = (r: number) => {
    const m = (1 + r) ** (1 / 12) - 1;
    const g = (1 + m) ** months;
    return start * g + (m === 0 ? monthly * months : (monthly * (g - 1)) / m);
  };
  if (end(0) >= target) return 0;
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (end(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Years to reach `multiple` at a steady annual rate; Infinity if the rate cannot get there. */
export function yearsToMultiple(cagr: number, multiple: number): number {
  return cagr <= 0 ? Infinity : Math.log(multiple) / Math.log(1 + cagr);
}

/** Return still needed per year from the current value (the blueprint's "remaining required return"). */
export function remainingRequired(current: number, target: number, yearsLeft: number): number | null {
  if (current <= 0 || yearsLeft <= 0) return null;
  return (target / current) ** (1 / yearsLeft) - 1;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimResult {
  /** Share of paths that reached the target at the end of the horizon, 0-100. */
  odds: number;
  p10: number;
  p50: number;
  p90: number;
}

/**
 * Resamples 6-month blocks of the strategy's real monthly returns (keeps streaks and crashes
 * together) to build `paths` futures. `drag` is subtracted from every year to model a weaker decade.
 */
export function simulate(
  monthly: number[],
  opts: { years: number; start: number; target: number; deposit: number; drag: number; paths?: number; seed?: number }
): SimResult {
  const { years, start, target, deposit, drag } = opts;
  const paths = opts.paths ?? 2000;
  const months = Math.round(years * 12);
  const block = 6;
  const monthlyDrag = (1 + drag) ** (1 / 12) - 1;
  const rand = rng(opts.seed ?? 7);
  const ends: number[] = [];
  const n = monthly.length;
  if (n < block) return { odds: 0, p10: start, p50: start, p90: start };
  for (let p = 0; p < paths; p++) {
    let v = start;
    let m = 0;
    while (m < months) {
      const from = Math.floor(rand() * (n - block + 1));
      for (let k = 0; k < block && m < months; k++, m++) {
        v = v * (1 + monthly[from + k] - monthlyDrag) + deposit;
      }
    }
    ends.push(v);
  }
  ends.sort((a, b) => a - b);
  const q = (x: number) => ends[Math.min(ends.length - 1, Math.floor(x * ends.length))];
  return {
    odds: Math.round((ends.filter((v) => v >= target).length / paths) * 100),
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
  };
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
