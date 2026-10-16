import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingRelation,
  resolveAuth,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';
import {
  runDataQualityChecks,
  type DqCoverageInput,
  type DqRunInput,
  type DqStockInput,
} from '../src/lib/data-quality/index.js';
import { REGIME_SYMBOLS } from '../src/lib/scoring/regime.js';

const RUNS_LIMIT = 20;
const DAY_MS = 86_400_000;

type RunRow = DqRunInput & {
  id: string;
  finished_at: string | null;
  stats: Record<string, unknown>;
};

type StockRow = Record<string, unknown> & { ticker: string };

/** Thrown for unexpected DB errors (missing relations degrade instead). */
class DbFailure extends Error {}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toStockInput(row: StockRow): DqStockInput {
  return {
    ticker: row.ticker,
    current_price: numOrNull(row.current_price),
    market_cap: numOrNull(row.market_cap),
    volatility: numOrNull(row.volatility),
    last_refreshed_at: strOrNull(row.last_refreshed_at),
    updated_at: strOrNull(row.updated_at),
    three_x_score: numOrNull(row.three_x_score),
    revenue_growth_yoy: numOrNull(row.revenue_growth_yoy),
    sector: strOrNull(row.sector),
  };
}

async function loadStocks(db: SupabaseClient): Promise<DqStockInput[]> {
  const columns =
    'ticker, current_price, market_cap, volatility, last_refreshed_at, updated_at, three_x_score, revenue_growth_yoy, sector';
  const filtered = await db.from('stocks').select(columns).not('is_active', 'is', false);
  if (!filtered.error) return ((filtered.data ?? []) as unknown as StockRow[]).map(toStockInput);
  if (!isMissingRelation(filtered.error)) throw new DbFailure();

  // Older schema (no is_active / last_refreshed_at): take every row with whatever columns exist.
  const all = await db.from('stocks').select('*');
  if (all.error) {
    if (isMissingRelation(all.error)) return [];
    throw new DbFailure();
  }
  return ((all.data ?? []) as StockRow[]).map(toStockInput);
}

async function loadCoverage(db: SupabaseClient): Promise<DqCoverageInput[]> {
  const { data, error } = await db.from('price_daily_coverage').select('ticker, bars, last_d');
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new DbFailure();
  }
  return ((data ?? []) as { ticker: string; bars: unknown; last_d: string | null }[]).map((row) => ({
    ticker: row.ticker,
    bars: numOrNull(row.bars) ?? 0,
    last_d: row.last_d,
  }));
}

/** Latest value of one column, or null when the table is missing/empty. */
async function loadLatest(db: SupabaseClient, table: string, column: string): Promise<string | null> {
  const { data, error } = await db
    .from(table)
    .select(column)
    .not(column, 'is', null)
    .order(column, { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new DbFailure();
  }
  const row = (data as unknown as Record<string, unknown>[] | null)?.[0];
  return row ? strOrNull(row[column]) : null;
}

async function loadRuns(db: SupabaseClient): Promise<RunRow[]> {
  const { data, error } = await db
    .from('refresh_runs')
    .select('id, job, started_at, finished_at, status, stats')
    .order('started_at', { ascending: false })
    .limit(RUNS_LIMIT);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new DbFailure();
  }
  return (data ?? []) as RunRow[];
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response);
    return;
  }

  response.setHeader?.('Cache-Control', 'no-store');

  try {
    const db = auth.db;
    const [stocks, coverage, regimeAsOf, lastSnapshotAt, filingsLastSyncedAt, runs] = await Promise.all([
      loadStocks(db),
      loadCoverage(db),
      loadLatest(db, 'market_regime_snapshots', 'as_of'),
      loadLatest(db, 'score_history', 'captured_at'),
      loadLatest(db, 'sec_sync_state', 'last_synced_at'),
      loadRuns(db),
    ]);

    const now = new Date();
    const generatedAt = now.toISOString();

    // Coverage view includes regime ETFs/indices; data-quality only cares about the stock universe.
    const regimeSet = new Set(REGIME_SYMBOLS);
    const stockCoverage = coverage.filter((c) => !regimeSet.has(c.ticker));

    const result = runDataQualityChecks({
      now: generatedAt,
      stocks,
      coverage: stockCoverage,
      regimeAsOf,
      lastSnapshotAt,
      filingsLastSyncedAt,
      runs,
    });

    const cutoff = now.getTime() - DAY_MS;
    const refreshed24h = stocks.filter((s) => {
      const stamp = s.last_refreshed_at ?? s.updated_at ?? null;
      const t = stamp ? Date.parse(stamp) : Number.NaN;
      return !Number.isNaN(t) && t >= cutoff;
    }).length;

    const latestBarDate = stockCoverage.reduce<string | null>(
      (max, c) => (c.last_d && (max === null || c.last_d > max) ? c.last_d : max),
      null,
    );

    response.status(200).json({
      generated_at: generatedAt,
      overall: result.overall,
      checks: result.checks.map((check) => ({
        ...check,
        value: check.value === null ? '' : String(check.value),
      })),
      coverage: {
        stocks_total: stocks.length,
        stocks_refreshed_24h: refreshed24h,
        price_daily_tickers: stockCoverage.length,
        latest_bar_date: latestBarDate,
        regime_as_of: regimeAsOf,
        filings_last_synced_at: filingsLastSyncedAt,
        last_snapshot_at: lastSnapshotAt,
      },
      runs,
    });
  } catch {
    sendServerError(response);
  }
}
