/**
 * Sanity flags for the 3x scenario calculator.
 *
 * Thresholds are heuristic judgement calls chosen to mark "this assumption is
 * aggressive, look again" — they are NOT derived from any cited statistic.
 * Tune them here; the UI only reads id / severity / message.
 */

export interface SanityFlag {
  id: string;
  severity: 'info' | 'warn' | 'high';
  message: string;
}

export const FLAG_THRESHOLDS = {
  /** Required annual price CAGR, percent. */
  cagrWarnPct: 40,
  cagrHighPct: 60,
  /** Revenue growth sustained above this for longer than `sustainedGrowthYears`. */
  sustainedGrowthPct: 40,
  sustainedGrowthYears: 3,
  /** P/S needed on projected revenue to hit the target. */
  impliedPsWarn: 20,
  impliedPsHigh: 40,
  /** Projected net margin, percent. */
  projectedMarginWarnPct: 40,
  /** Annual dilution, percent. */
  dilutionWarnPct: 8,
  /** Required market cap, USD. */
  marketCapWarn: 1e12,
  marketCapHigh: 3e12,
  /** Short horizon + big target. */
  shortHorizonMonths: 12,
  shortHorizonTarget: 3,
} as const;

export interface FlagContext {
  requiredPriceCagrPct: number;
  revenueGrowthPct: number;
  years: number;
  impliedFuturePriceToSales: number | null;
  projectedNetMarginPct: number | null;
  dilutionPctPerYear: number;
  requiredMarketCap: number | null;
  target: number;
  horizonMonths: number;
  missingRevenue: boolean;
  missingMargin: boolean;
  missingPrice: boolean;
}

const T = FLAG_THRESHOLDS;

function fmtUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export function buildFlags(c: FlagContext): SanityFlag[] {
  const f: SanityFlag[] = [];

  if (c.missingPrice) {
    f.push({ id: 'missing_price', severity: 'info', message: 'Price or market cap is missing; required values cannot be computed.' });
  }
  if (c.missingRevenue) {
    f.push({ id: 'missing_revenue', severity: 'info', message: 'Revenue is missing; revenue-based projections are unavailable.' });
  }
  if (c.missingMargin) {
    f.push({ id: 'missing_margin', severity: 'info', message: 'Net margin is missing; earnings and P/E views are unavailable.' });
  }

  if (c.horizonMonths <= T.shortHorizonMonths && c.target >= T.shortHorizonTarget) {
    f.push({
      id: 'short_horizon_big_target',
      severity: 'high',
      message: `A ${c.target}x move in ${c.horizonMonths} months or less is an extreme outcome for any stock.`,
    });
  }

  const cagr = c.requiredPriceCagrPct;
  if (cagr > T.cagrHighPct) {
    f.push({ id: 'cagr_high', severity: 'high', message: `Requires ${cagr.toFixed(1)}%/yr price growth — very few stocks sustain this.` });
  } else if (cagr > T.cagrWarnPct) {
    f.push({ id: 'cagr_warn', severity: 'warn', message: `Requires ${cagr.toFixed(1)}%/yr price growth — an aggressive compounding rate.` });
  }

  if (c.revenueGrowthPct > T.sustainedGrowthPct && c.years > T.sustainedGrowthYears) {
    f.push({
      id: 'sustained_growth',
      severity: 'warn',
      message: `Assumes ${c.revenueGrowthPct.toFixed(0)}%/yr revenue growth for ${c.years.toFixed(1)} years; growth usually decays at scale.`,
    });
  }

  const ps = c.impliedFuturePriceToSales;
  if (ps !== null) {
    if (ps > T.impliedPsHigh) {
      f.push({ id: 'implied_ps_high', severity: 'high', message: `Target needs a ${ps.toFixed(1)}x P/S on projected revenue — an extreme valuation.` });
    } else if (ps > T.impliedPsWarn) {
      f.push({ id: 'implied_ps_warn', severity: 'warn', message: `Target needs a ${ps.toFixed(1)}x P/S on projected revenue — a rich valuation.` });
    }
  }

  if (c.projectedNetMarginPct !== null && c.projectedNetMarginPct > T.projectedMarginWarnPct) {
    f.push({
      id: 'margin_warn',
      severity: 'warn',
      message: `Projected net margin of ${c.projectedNetMarginPct.toFixed(1)}% is unusually high.`,
    });
  }

  if (c.dilutionPctPerYear > T.dilutionWarnPct) {
    f.push({
      id: 'dilution_warn',
      severity: 'warn',
      message: `${c.dilutionPctPerYear.toFixed(1)}%/yr dilution meaningfully raises the market cap needed per share.`,
    });
  }

  const cap = c.requiredMarketCap;
  if (cap !== null) {
    if (cap > T.marketCapHigh) {
      f.push({ id: 'market_cap_high', severity: 'high', message: `Requires a ${fmtUsd(cap)} market cap — larger than almost any company today.` });
    } else if (cap > T.marketCapWarn) {
      f.push({ id: 'market_cap_warn', severity: 'warn', message: `Requires a ${fmtUsd(cap)} market cap — mega-cap territory.` });
    }
  }

  return f;
}
