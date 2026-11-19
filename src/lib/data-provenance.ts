// Where every number on a stock page comes from, and per-stock checks that decide whether to trust it.
// Pure functions: no network. The same checks run for every stock, so a grade means the same thing everywhere.
import type { Stock } from '@/lib/supabase';

export type SourceId = 'yahoo_chart' | 'yahoo_summary' | 'sec_edgar' | 'computed' | 'community';

export interface DataSource {
  id: SourceId;
  name: string;
  /** Who publishes it and whether it is official. */
  publisher: string;
  official: boolean;
  endpoint: string;
  cadence: string;
  fields: string[];
  /** Plain-language reason it can be trusted, and its limit. */
  trust: string;
  limit: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'yahoo_chart',
    name: 'Yahoo Finance price chart',
    publisher: 'Yahoo Finance (exchange prices, unofficial API)',
    official: false,
    endpoint: 'query1.finance.yahoo.com/v8/finance/chart',
    cadence: 'Every 20 minutes the 120 least-recently updated stocks refresh, so each stock updates about every 1.5 hours.',
    fields: ['Price', 'Daily price history', 'Momentum (3-month return)', 'Volatility (63-day)'],
    trust: 'Prices come from exchange feeds that Yahoo redistributes. Each refresh is checked against the 52-week range and for zero or negative values.',
    limit: 'Delayed, not real-time. Undocumented API that can change or fail; failures leave the last good value with its timestamp.',
  },
  {
    id: 'yahoo_summary',
    name: 'Yahoo Finance fundamentals',
    publisher: 'Yahoo Finance, sourced from company filings via data vendors (unofficial API)',
    official: false,
    endpoint: 'query2.finance.yahoo.com/v10/finance/quoteSummary',
    cadence: 'Refreshed with the price, about every 1.5 hours. Underlying figures change when companies report each quarter.',
    fields: ['Market cap', 'Beta', 'Debt/equity', 'Revenue and earnings growth', 'Forward P/E, P/S, PEG', 'Margins', '52-week range', 'Average volume', 'Analyst targets and ratings'],
    trust: 'Figures trace back to quarterly 10-Q and annual 10-K filings. Values are checked for impossible results (negative market cap, margins over 100%) and extreme outliers.',
    limit: 'Vendor-processed, so a figure can lag a fresh filing by days. Analyst targets are a consensus snapshot, not a forecast we make.',
  },
  {
    id: 'sec_edgar',
    name: 'SEC EDGAR',
    publisher: 'U.S. Securities and Exchange Commission (official)',
    official: true,
    endpoint: 'data.sec.gov submissions and Form 4 filings',
    cadence: 'Daily.',
    fields: ['10-K, 10-Q, 8-K filings', 'Insider buys and sells (Form 4)'],
    trust: 'The primary legal record. Companies must file here; we link to the original document.',
    limit: 'Insider data is only as recent as the filing, which can be up to 2 business days after the trade.',
  },
  {
    id: 'computed',
    name: 'Calculated by 3x Hunter',
    publisher: '3x Hunter scoring model (open methodology)',
    official: false,
    endpoint: 'Calculated from the sources above',
    cadence: 'Recalculated every time the inputs refresh.',
    fields: ['3x Opportunity Score', 'Risk score', 'Bull, neutral and bear cases', 'Market regime fit'],
    trust: 'Every weight and formula is published on the Methodology page. A score shows its confidence: the share of model weight that had real data.',
    limit: 'A model estimate, not a prediction. Missing inputs lower confidence instead of being guessed.',
  },
  {
    id: 'community',
    name: 'Curated research inputs',
    publisher: '3x Hunter and users (catalysts, pipeline counts)',
    official: false,
    endpoint: 'Entered by hand',
    cadence: 'When added or edited.',
    fields: ['Catalysts', 'Pipeline count', 'R&D ratio', 'Cash runway', 'Thesis'],
    trust: 'Each catalyst shows who added it and when.',
    limit: 'Not machine-verified. Treat as a lead to check, not a fact.',
  },
];

export const SOURCE_BY_ID = Object.fromEntries(DATA_SOURCES.map((s) => [s.id, s])) as Record<SourceId, DataSource>;

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface StockCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  source: SourceId;
}

export type TrustGrade = 'verified' | 'good' | 'check' | 'unreliable';

export interface StockDataQuality {
  grade: TrustGrade;
  gradeLabel: string;
  summary: string;
  checks: StockCheck[];
  passed: number;
  /** Hours since the last successful refresh, or null when never refreshed. */
  ageHours: number | null;
  refreshedAt: string | null;
  isSeed: boolean;
}

/** Thresholds, exported so the Methodology page states the real numbers. */
export const STOCK_CHECK_LIMITS = {
  freshHours: 6,
  staleHours: 36,
  brokenHours: 24 * 7,
  rangeTolerance: 0.1,
  maxGrowthPct: 1000,
  maxForwardPe: 500,
  maxVolatility: 300,
  minKeyFields: 6,
} as const;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function ageText(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const KEY_FIELDS: (keyof Stock)[] = [
  'current_price',
  'market_cap',
  'revenue_growth_yoy',
  'earnings_growth_yoy',
  'beta',
  'debt_to_equity',
  'forward_pe',
  'gross_margin',
  'fifty_two_week_high',
  'fifty_two_week_low',
];

/** Runs the per-stock checks. `confidence` is the score model's own confidence when available. */
export function checkStock(stock: Stock, confidence?: 'high' | 'medium' | 'low', now = Date.now()): StockDataQuality {
  const L = STOCK_CHECK_LIMITS;
  const checks: StockCheck[] = [];
  const isSeed = stock.data_source !== 'yahoo';
  const refreshedAt = stock.last_refreshed_at ?? null;
  const t = refreshedAt ? Date.parse(refreshedAt) : NaN;
  const ageHours = Number.isNaN(t) ? null : Math.max(0, (now - t) / 3_600_000);

  // 1. Live source, not placeholder.
  checks.push(
    isSeed
      ? { id: 'source', label: 'Live source', status: 'fail', detail: 'Placeholder values entered at setup, not yet confirmed by a live fetch. Do not rely on them.', source: 'yahoo_summary' }
      : { id: 'source', label: 'Live source', status: 'pass', detail: 'Fetched from Yahoo Finance by our server, not typed in by hand.', source: 'yahoo_summary' }
  );

  // 2. Freshness.
  if (ageHours === null) {
    checks.push({ id: 'fresh', label: 'Freshness', status: 'fail', detail: 'No successful refresh on record.', source: 'yahoo_chart' });
  } else {
    const status: CheckStatus = ageHours <= L.staleHours ? 'pass' : ageHours <= L.brokenHours ? 'warn' : 'fail';
    const note = ageHours <= L.freshHours ? 'Up to date.' : ageHours <= L.staleHours ? 'Within the normal refresh window (markets may be closed).' : 'Older than expected; the refresh may be failing for this stock.';
    checks.push({ id: 'fresh', label: 'Freshness', status, detail: `Last refreshed ${ageText(ageHours)}. ${note}`, source: 'yahoo_chart' });
  }

  // 3. Price is a real positive number.
  const price = stock.current_price;
  checks.push(
    num(price) && price > 0
      ? { id: 'price', label: 'Valid price', status: 'pass', detail: `$${price.toFixed(2)} is a positive, finite value.`, source: 'yahoo_chart' }
      : { id: 'price', label: 'Valid price', status: 'fail', detail: 'Price is missing, zero or negative.', source: 'yahoo_chart' }
  );

  // 4. Price agrees with the 52-week range (two fields from different endpoints cross-checking each other).
  const lo = stock.fifty_two_week_low;
  const hi = stock.fifty_two_week_high;
  if (num(price) && price > 0 && num(lo) && num(hi) && hi >= lo && lo > 0) {
    const inside = price >= lo * (1 - L.rangeTolerance) && price <= hi * (1 + L.rangeTolerance);
    checks.push({
      id: 'range',
      label: 'Cross-check: 52-week range',
      status: inside ? 'pass' : 'warn',
      detail: inside
        ? `Price sits inside its 52-week range ($${lo.toFixed(2)}–$${hi.toFixed(2)}), so the price and fundamentals feeds agree.`
        : `Price is outside its 52-week range ($${lo.toFixed(2)}–$${hi.toFixed(2)}) by more than ${L.rangeTolerance * 100}%. Possible split, a big move today, or a bad value.`,
      source: 'yahoo_summary',
    });
  } else {
    checks.push({ id: 'range', label: 'Cross-check: 52-week range', status: 'warn', detail: 'No 52-week range to compare the price against.', source: 'yahoo_summary' });
  }

  // 5. Analyst targets are internally consistent.
  const tl = stock.target_low_price;
  const tm = stock.target_mean_price;
  const th = stock.target_high_price;
  if (num(tl) && num(tm) && num(th)) {
    const ok = tl > 0 && tl <= tm && tm <= th;
    checks.push({
      id: 'targets',
      label: 'Analyst targets consistent',
      status: ok ? 'pass' : 'warn',
      detail: ok
        ? `Low $${tl.toFixed(0)} ≤ average $${tm.toFixed(0)} ≤ high $${th.toFixed(0)}${num(stock.analyst_count) ? ` from ${stock.analyst_count} analysts` : ''}.`
        : 'Low, average and high targets are out of order, so the consensus data is suspect.',
      source: 'yahoo_summary',
    });
  }

  // 6. Impossible or extreme values.
  const odd: string[] = [];
  if (num(stock.market_cap) && stock.market_cap <= 0) odd.push('market cap ≤ 0');
  for (const [k, label] of [['gross_margin', 'gross margin'], ['operating_margin', 'operating margin'], ['profit_margin', 'profit margin']] as const) {
    const v = stock[k];
    if (num(v) && v > 100) odd.push(`${label} over 100%`);
  }
  if (num(stock.revenue_growth_yoy) && Math.abs(stock.revenue_growth_yoy) > L.maxGrowthPct) odd.push(`revenue growth ${Math.round(stock.revenue_growth_yoy)}%`);
  if (num(stock.earnings_growth_yoy) && Math.abs(stock.earnings_growth_yoy) > L.maxGrowthPct) odd.push(`earnings growth ${Math.round(stock.earnings_growth_yoy)}%`);
  if (num(stock.forward_pe) && stock.forward_pe > L.maxForwardPe) odd.push(`forward P/E ${Math.round(stock.forward_pe)}`);
  if (num(stock.volatility) && stock.volatility > L.maxVolatility) odd.push(`volatility ${Math.round(stock.volatility)}%`);
  if (num(stock.debt_to_equity) && stock.debt_to_equity < 0) odd.push('negative debt/equity (negative equity)');
  checks.push(
    odd.length
      ? { id: 'outliers', label: 'No impossible values', status: 'warn', detail: `Unusual: ${odd.join(', ')}. Can be real (tiny base year, losses) but verify before relying on it.`, source: 'yahoo_summary' }
      : { id: 'outliers', label: 'No impossible values', status: 'pass', detail: 'Margins, growth, valuation and volatility are all within plausible bounds.', source: 'yahoo_summary' }
  );

  // 7. Coverage of key fields.
  const present = KEY_FIELDS.filter((k) => num(stock[k])).length;
  checks.push({
    id: 'coverage',
    label: 'Key fields present',
    status: present >= 9 ? 'pass' : present >= L.minKeyFields ? 'warn' : 'fail',
    detail: `${present} of ${KEY_FIELDS.length} key figures are available.${present < KEY_FIELDS.length ? ' Missing figures are left blank, never estimated.' : ''}`,
    source: 'yahoo_summary',
  });

  // 8. Score confidence (how much of the model had real inputs).
  if (confidence) {
    checks.push({
      id: 'confidence',
      label: 'Score confidence',
      status: confidence === 'high' ? 'pass' : confidence === 'medium' ? 'warn' : 'fail',
      detail:
        confidence === 'high'
          ? 'At least 85% of the score weight is backed by real data.'
          : confidence === 'medium'
            ? '65–84% of the score weight has data; the rest is left out, not guessed.'
            : 'Under 65% of the score weight has data. Treat the score as rough.',
      source: 'computed',
    });
  }

  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const passed = checks.length - fails - warns;
  const fresh = ageHours !== null && ageHours <= L.freshHours;

  let grade: TrustGrade;
  if (isSeed || fails >= 2 || checks.find((c) => c.id === 'fresh')?.status === 'fail') grade = 'unreliable';
  else if (fails === 1 || warns >= 3) grade = 'check';
  else if (warns === 0 && fresh) grade = 'verified';
  else grade = 'good';

  const LABELS: Record<TrustGrade, [string, string]> = {
    verified: ['Verified', 'Every check passed and the data is fresh.'],
    good: ['Good', 'Data is live and passes the core checks. Minor notes below.'],
    check: ['Check before using', 'Some checks flagged problems. Confirm the flagged figures elsewhere.'],
    unreliable: ['Unreliable', 'Data is placeholder or too old to trust. Do not act on it.'],
  };

  return { grade, gradeLabel: LABELS[grade][0], summary: LABELS[grade][1], checks, passed, ageHours, refreshedAt, isSeed };
}
