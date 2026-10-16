/**
 * Data-quality checks over the stock universe and pipeline freshness. Pure, no I/O.
 *
 * All thresholds are calendar-based (no trading calendar). They assume the refresh
 * job stamps last_refreshed_at on every run, including weekends, and leave a full
 * weekend of slack on market-data checks (bars 5d, regime 4d), so Monday morning
 * does not fail. Check ids are stable; the API and UI key off them.
 */

export type DqStatus = 'ok' | 'warn' | 'fail';

export interface DqStockInput {
  ticker: string;
  current_price: number | null;
  market_cap: number | null;
  volatility: number | null;
  last_refreshed_at?: string | null;
  updated_at?: string | null;
  three_x_score: number | null;
  revenue_growth_yoy: number | null;
  sector?: string | null;
}

export interface DqCoverageInput {
  ticker: string;
  bars: number;
  last_d: string | null;
}

export interface DqRunInput {
  job: string;
  started_at: string;
  status: string;
}

export interface DataQualityInput {
  now: string;
  stocks: DqStockInput[];
  coverage: DqCoverageInput[];
  regimeAsOf: string | null;
  lastSnapshotAt: string | null;
  filingsLastSyncedAt: string | null;
  runs: DqRunInput[];
}

export interface DqCheck {
  id: string;
  label: string;
  status: DqStatus;
  value: number | string | null;
  detail: string;
  affected?: string[];
}

export interface DataQualityResult {
  overall: DqStatus;
  checks: DqCheck[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const AFFECTED_CAP = 25;

export const DQ_THRESHOLDS = {
  stalePriceHours: 36,
  staleWarnShare: 0.1,
  staleFailShare: 0.5,
  maxVolatility: 300,
  minBars: 60,
  maxBarAgeDays: 5,
  regimeMaxAgeDays: 4,
  snapshotWarnHours: 48,
  snapshotFailDays: 7,
  filingsMaxAgeDays: 3,
  runFailureWindowHours: 48,
} as const;

const RANK: Record<DqStatus, number> = { ok: 0, warn: 1, fail: 2 };

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? null : t;
}

function cap(list: string[]): string[] {
  return Array.from(new Set(list)).sort().slice(0, AFFECTED_CAP);
}

function share(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function ageText(ms: number): string {
  const h = ms / HOUR;
  return h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
}

function withAffected(check: Omit<DqCheck, 'affected'>, affected: string[]): DqCheck {
  return affected.length ? { ...check, affected: cap(affected) } : check;
}

export function runDataQualityChecks(input: DataQualityInput): DataQualityResult {
  const T = DQ_THRESHOLDS;
  const now = parse(input.now) ?? Date.now();
  const stocks = input.stocks;
  const n = stocks.length;
  const checks: DqCheck[] = [];

  // stale_prices
  {
    const stale = stocks
      .filter((s) => {
        const t = parse(s.last_refreshed_at ?? s.updated_at ?? null);
        return t === null || now - t > T.stalePriceHours * HOUR;
      })
      .map((s) => s.ticker);
    const sh = share(stale.length, n);
    const status: DqStatus = sh > T.staleFailShare ? 'fail' : sh > T.staleWarnShare ? 'warn' : 'ok';
    checks.push(
      withAffected(
        {
          id: 'stale_prices',
          label: 'Stale prices',
          status,
          value: stale.length,
          detail: `${stale.length} of ${n} tickers (${pct(sh)}) not refreshed in ${T.stalePriceHours}h`,
        },
        stale,
      ),
    );
  }

  // invalid_values
  {
    const bad: string[] = [];
    const reasons: Record<string, number> = { price: 0, market_cap: 0, volatility: 0 };
    for (const s of stocks) {
      let hit = false;
      if (s.current_price !== null && s.current_price <= 0) {
        reasons.price++;
        hit = true;
      }
      if (s.market_cap !== null && s.market_cap <= 0) {
        reasons.market_cap++;
        hit = true;
      }
      if (s.volatility !== null && (s.volatility > T.maxVolatility || s.volatility < 0)) {
        reasons.volatility++;
        hit = true;
      }
      if (hit) bad.push(s.ticker);
    }
    checks.push(
      withAffected(
        {
          id: 'invalid_values',
          label: 'Invalid values',
          status: bad.length ? 'warn' : 'ok',
          value: bad.length,
          detail: `price<=0: ${reasons.price}, market_cap<=0: ${reasons.market_cap}, volatility out of 0-${T.maxVolatility}: ${reasons.volatility}`,
        },
        bad,
      ),
    );
  }

  // missing_inputs
  {
    const miss: string[] = [];
    const counts = { price: 0, score: 0, revenue_growth: 0 };
    for (const s of stocks) {
      let hit = false;
      if (s.current_price === null) {
        counts.price++;
        hit = true;
      }
      if (s.three_x_score === null) {
        counts.score++;
        hit = true;
      }
      if (s.revenue_growth_yoy === null) {
        counts.revenue_growth++;
        hit = true;
      }
      if (hit) miss.push(s.ticker);
    }
    checks.push(
      withAffected(
        {
          id: 'missing_inputs',
          label: 'Missing inputs',
          status: miss.length ? 'warn' : 'ok',
          value: miss.length,
          detail: `null price: ${counts.price}, null score: ${counts.score}, null revenue growth: ${counts.revenue_growth}`,
        },
        miss,
      ),
    );
  }

  // price_daily_coverage
  {
    const thin: string[] = [];
    let short = 0;
    let old = 0;
    for (const c of input.coverage) {
      const last = parse(c.last_d);
      const isShort = c.bars < T.minBars;
      const isOld = last === null || now - last > T.maxBarAgeDays * DAY;
      if (isShort) short++;
      if (isOld) old++;
      if (isShort || isOld) thin.push(c.ticker);
    }
    checks.push(
      withAffected(
        {
          id: 'price_daily_coverage',
          label: 'Daily price history coverage',
          status: thin.length ? 'warn' : 'ok',
          value: thin.length,
          detail: `${short} with < ${T.minBars} bars, ${old} with last bar older than ${T.maxBarAgeDays} days`,
        },
        thin,
      ),
    );
  }

  // price_daily_missing
  {
    const covered = new Set(input.coverage.map((c) => c.ticker));
    const missing = stocks.filter((s) => !covered.has(s.ticker)).map((s) => s.ticker);
    checks.push(
      withAffected(
        {
          id: 'price_daily_missing',
          label: 'Tickers without daily price history',
          status: missing.length ? 'warn' : 'ok',
          value: missing.length,
          detail: `${missing.length} of ${n} universe tickers have no price_daily rows`,
        },
        missing,
      ),
    );
  }

  // regime_freshness
  {
    const t = parse(input.regimeAsOf);
    const age = t === null ? null : now - t;
    const status: DqStatus = age === null || age > T.regimeMaxAgeDays * DAY ? 'warn' : 'ok';
    checks.push({
      id: 'regime_freshness',
      label: 'Market regime freshness',
      status,
      value: input.regimeAsOf,
      detail: age === null ? 'No market regime snapshot' : `Regime as of ${ageText(age)} ago`,
    });
  }

  // score_history_freshness
  {
    const t = parse(input.lastSnapshotAt);
    const age = t === null ? null : now - t;
    const status: DqStatus =
      age === null
        ? 'warn'
        : age > T.snapshotFailDays * DAY
          ? 'fail'
          : age > T.snapshotWarnHours * HOUR
          ? 'warn'
          : 'ok';
    checks.push({
      id: 'score_history_freshness',
      label: 'Score history freshness',
      status,
      value: input.lastSnapshotAt,
      detail: age === null ? 'No score snapshots recorded' : `Last snapshot ${ageText(age)} ago`,
    });
  }

  // filings_freshness
  {
    const t = parse(input.filingsLastSyncedAt);
    const age = t === null ? null : now - t;
    const status: DqStatus = age === null || age > T.filingsMaxAgeDays * DAY ? 'warn' : 'ok';
    checks.push({
      id: 'filings_freshness',
      label: 'Filings sync freshness',
      status,
      value: input.filingsLastSyncedAt,
      detail: age === null ? 'Filings never synced' : `Last filings sync ${ageText(age)} ago`,
    });
  }

  // recent_run_failures
  {
    const failed = input.runs.filter((r) => {
      const t = parse(r.started_at);
      return (
        t !== null &&
        now - t <= T.runFailureWindowHours * HOUR &&
        /^(fail|failed|error|errored)$/i.test(r.status)
      );
    });
    const jobs = Array.from(new Set(failed.map((r) => r.job))).sort();
    checks.push({
      id: 'recent_run_failures',
      label: 'Recent job failures',
      status: failed.length ? 'warn' : 'ok',
      value: failed.length,
      detail: failed.length
        ? `${failed.length} failed run(s) in last ${T.runFailureWindowHours}h: ${jobs.join(', ')}`
        : `No failed runs in last ${T.runFailureWindowHours}h`,
    });
  }

  const overall = checks.reduce<DqStatus>((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), 'ok');
  return { overall, checks };
}
