import { isMissingRelation, supabase, supabaseUrl } from './_supabase.js';
import {
  MODEL_VERSION,
  REGIME_SYMBOLS,
  computeRegimeSnapshot,
  computeRiskScore,
  regimeFitForStock,
  scoreStock,
  type Bar,
  type RegimeSeries,
  type RegimeSnapshotInput,
} from '../src/lib/scoring/index.js';

type ScoringInput = Parameters<typeof scoreStock>[0];

export type RefreshTrigger = 'manual' | 'cron';

export type RefreshSummary = {
  updated: number;
  total: number;
  failed: string[];
  rescored: number;
  historyAvailable: boolean;
  snapshots: number;
  modelVersion: string;
  upstream: 'ok' | 'timeout';
  regime: { as_of: string; regime_label: string } | null;
};

export type RefreshResult =
  | { ok: true; data: RefreshSummary }
  | { ok: false; status: 500 | 502; error: string };

type UpstreamResult =
  | { kind: 'ok'; updated: number; total: number | null; failed: string[] }
  | { kind: 'timeout' }
  | { kind: 'failed' };

type Rescored = {
  ticker: string;
  threeX: number;
  riskScore: number;
  riskLabel: string;
  regimeFitScore: number | null;
  regimeFitDrivers: string[];
  dimensionScores: Record<string, number | null>;
};

type SnapshotRow = {
  ticker: string;
  three_x_score: number;
  model_version: string;
  captured_at: string;
};

/** full = regime + risk_score columns, risk = risk_score only, base = pre-risk_score schema. */
type ColumnSet = 'full' | 'risk' | 'base';

/** Leave headroom under maxDuration 120 for regime, rescoring + history writes. */
const UPSTREAM_TIMEOUT_MS = 75_000;
const CHUNK_SIZE = 50;
const SNAPSHOT_DEDUPE_MS = 6 * 60 * 60 * 1000;
/** ~1.5 years of trading days: enough for the 200-day MA and 63-day windows. */
const MACRO_BAR_LIMIT = 400;

const UPSTREAM_FAILED_MESSAGE = 'The stock refresh service is unavailable.';
const SERVER_ERROR_MESSAGE = 'The request could not be completed.';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function callUpstream(baseUrl: string): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/functions/v1/refresh-stocks`, {
      method: 'POST',
      signal: controller.signal,
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok || !payload || typeof payload !== 'object') return { kind: 'failed' };
    const body = payload as Record<string, unknown>;
    const failed = Array.isArray(body.failed)
      ? body.failed.filter((t): t is string => typeof t === 'string')
      : [];
    return {
      kind: 'ok',
      updated: toNumber(body.updated) ?? 0,
      total: toNumber(body.total),
      failed,
    };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { kind: 'timeout' };
    }
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- market regime ----------

/**
 * One query per symbol (PostgREST caps responses at 1000 rows, so never fetch all
 * symbols at once). Takes the most recent MACRO_BAR_LIMIT bars and returns them
 * ascending by d. Missing table / errors yield an empty series for that symbol.
 */
async function loadMacroSeries(): Promise<RegimeSeries> {
  const results = await Promise.all(
    REGIME_SYMBOLS.map(async (symbol) => {
      try {
        const { data, error } = await supabase
          .from('price_daily')
          .select('d, close')
          .eq('ticker', symbol)
          .order('d', { ascending: false })
          .limit(MACRO_BAR_LIMIT);
        if (error || !Array.isArray(data)) return [symbol, []] as const;
        const bars: Bar[] = [];
        for (const row of data as Array<{ d: unknown; close: unknown }>) {
          const close = typeof row.close === 'string' ? Number(row.close) : row.close;
          if (typeof row.d === 'string' && typeof close === 'number' && Number.isFinite(close)) {
            bars.push({ d: row.d, close });
          }
        }
        bars.reverse();
        return [symbol, bars] as const;
      } catch {
        return [symbol, []] as const;
      }
    }),
  );
  const series: RegimeSeries = {};
  for (const [symbol, bars] of results) series[symbol] = [...bars];
  return series;
}

/** Builds today's regime snapshot and upserts it. Never throws. */
async function buildRegime(): Promise<RegimeSnapshotInput | null> {
  try {
    const snap = computeRegimeSnapshot(await loadMacroSeries());
    if (!snap.as_of) return null;
    try {
      await supabase
        .from('market_regime_snapshots')
        .upsert({ ...snap, updated_at: new Date().toISOString() }, { onConflict: 'as_of' });
    } catch {
      // Missing table or RLS window: the snapshot still drives this run's scoring.
    }
    return snap;
  } catch {
    return null;
  }
}

// ---------- scoring ----------

function rescore(stock: ScoringInput, snap: RegimeSnapshotInput | null): Rescored {
  let fit = regimeFitForStock(stock, snap);
  // Without a usable snapshot, keep the last known fit instead of wiping it.
  if (fit.score === null && typeof stock.regime_fit_score === 'number') {
    fit = {
      score: stock.regime_fit_score,
      drivers: Array.isArray(stock.regime_fit_drivers) ? stock.regime_fit_drivers : fit.drivers,
    };
  }
  const input: ScoringInput = { ...stock, regime_fit_score: fit.score, regime_fit_drivers: fit.drivers };
  const score = scoreStock(input);
  const risk = computeRiskScore(input);
  const dimensionScores: Record<string, number | null> = {};
  for (const dim of score.dimensions) dimensionScores[dim.key] = dim.score;
  return {
    ticker: stock.ticker,
    threeX: score.total,
    riskScore: risk.score,
    riskLabel: risk.label,
    regimeFitScore: fit.score,
    regimeFitDrivers: fit.drivers,
    dimensionScores,
  };
}

function updateStock(row: Rescored, columns: ColumnSet) {
  const values: Record<string, unknown> = {
    three_x_score: row.threeX,
    risk_level: row.riskLabel,
  };
  if (columns !== 'base') values.risk_score = row.riskScore;
  if (columns === 'full') {
    values.regime_fit_score = row.regimeFitScore;
    values.regime_fit_drivers = row.regimeFitDrivers;
  }
  return supabase.from('stocks').update(values).eq('ticker', row.ticker);
}

/** Writes scores back to stocks; probes once and falls back to older column sets if missing. */
async function persistScores(rows: Rescored[]): Promise<{ rescored: number; failed: string[] }> {
  const failed: string[] = [];
  let rescored = 0;
  let columns: ColumnSet = 'full';
  let pending = rows;

  // Probe with the first row so a missing column is detected once, not 50 times.
  const first = pending[0];
  if (first) {
    pending = pending.slice(1);
    let result = await updateStock(first, 'full');
    if (result.error && isMissingRelation(result.error)) {
      columns = 'risk';
      result = await updateStock(first, 'risk');
    }
    if (result.error && isMissingRelation(result.error)) {
      columns = 'base';
      result = await updateStock(first, 'base');
    }
    if (result.error) failed.push(first.ticker);
    else rescored++;
  }

  for (const group of chunk(pending, CHUNK_SIZE)) {
    const results = await Promise.all(group.map((row) => updateStock(row, columns)));
    results.forEach((result, i) => {
      if (result.error) failed.push(group[i].ticker);
      else rescored++;
    });
  }
  return { rescored, failed };
}

/** Appends score_history snapshots, skipping tickers with an identical snapshot < 6h old. */
async function writeSnapshots(rows: Rescored[]): Promise<{ historyAvailable: boolean; snapshots: number }> {
  if (rows.length === 0) return { historyAvailable: true, snapshots: 0 };

  const since = new Date(Date.now() - SNAPSHOT_DEDUPE_MS).toISOString();
  const recent = await supabase
    .from('score_history')
    .select('ticker, three_x_score, model_version, captured_at')
    .gte('captured_at', since)
    .order('captured_at', { ascending: false });

  if (recent.error) {
    if (isMissingRelation(recent.error)) return { historyAvailable: false, snapshots: 0 };
    // Unknown read error: insert anyway rather than lose history.
  }

  const latest = new Map<string, SnapshotRow>();
  for (const snap of (recent.data as SnapshotRow[] | null) ?? []) {
    if (!latest.has(snap.ticker)) latest.set(snap.ticker, snap);
  }

  const inserts = rows
    .filter((row) => {
      const prev = latest.get(row.ticker);
      return !(prev && prev.three_x_score === row.threeX && prev.model_version === MODEL_VERSION);
    })
    .map((row) => ({
      ticker: row.ticker,
      three_x_score: row.threeX,
      risk_score: row.riskScore,
      model_version: MODEL_VERSION,
      dimension_scores: row.dimensionScores,
    }));

  let snapshots = 0;
  for (const group of chunk(inserts, CHUNK_SIZE)) {
    const { error } = await supabase.from('score_history').insert(group);
    if (error) {
      if (isMissingRelation(error)) return { historyAvailable: false, snapshots };
      continue;
    }
    snapshots += group.length;
  }
  return { historyAvailable: true, snapshots };
}

// ---------- run log ----------

export type RunStatus = 'ok' | 'partial' | 'failed';

/** Appends a refresh_runs row. Never throws; a missing table is ignored. */
export async function logRefreshRun(
  job: string,
  startedAt: Date,
  status: RunStatus,
  stats: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('refresh_runs').insert({
      job: job.slice(0, 40),
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      status,
      stats,
    });
  } catch {
    // Logging must never fail the request.
  }
}

// ---------- pipeline ----------

export async function runStockRefresh(trigger: RefreshTrigger): Promise<RefreshResult> {
  const startedAt = new Date();
  const job = `rescore:${trigger}`;

  if (!supabaseUrl) {
    await logRefreshRun(job, startedAt, 'failed', { error: 'config' });
    return { ok: false, status: 500, error: SERVER_ERROR_MESSAGE };
  }

  try {
    const upstream = await callUpstream(supabaseUrl);
    if (upstream.kind === 'failed') {
      await logRefreshRun(job, startedAt, 'failed', { upstream: 'failed' });
      return { ok: false, status: 502, error: UPSTREAM_FAILED_MESSAGE };
    }

    const [stocksResult, snap] = await Promise.all([
      supabase.from('stocks').select('*'),
      buildRegime(),
    ]);
    if (stocksResult.error) {
      await logRefreshRun(job, startedAt, 'failed', { error: 'stocks_read' });
      return { ok: false, status: 500, error: SERVER_ERROR_MESSAGE };
    }

    const stocks = ((stocksResult.data as ScoringInput[] | null) ?? []).filter(
      (s) => typeof s?.ticker === 'string' && s.ticker.length > 0,
    );

    const rescoredRows: Rescored[] = [];
    const scoringFailed: string[] = [];
    for (const stock of stocks) {
      try {
        rescoredRows.push(rescore(stock, snap));
      } catch {
        scoringFailed.push(stock.ticker);
      }
    }

    const persisted = await persistScores(rescoredRows);
    const written = new Set(persisted.failed);
    const history = await writeSnapshots(rescoredRows.filter((row) => !written.has(row.ticker)));

    const upstreamFailed = upstream.kind === 'ok' ? upstream.failed : [];
    const failed = Array.from(new Set([...upstreamFailed, ...scoringFailed, ...persisted.failed]));

    const data: RefreshSummary = {
      updated: upstream.kind === 'ok' ? upstream.updated : 0,
      total: upstream.kind === 'ok' && upstream.total !== null ? upstream.total : stocks.length,
      failed,
      rescored: persisted.rescored,
      historyAvailable: history.historyAvailable,
      snapshots: history.snapshots,
      modelVersion: MODEL_VERSION,
      upstream: upstream.kind === 'ok' ? 'ok' : 'timeout',
      regime: snap ? { as_of: snap.as_of, regime_label: snap.regime_label } : null,
    };

    const regimeFitScored = rescoredRows.filter((row) => row.regimeFitScore !== null).length;
    const status: RunStatus =
      data.upstream === 'ok' && failed.length === 0 && snap !== null ? 'ok' : 'partial';
    await logRefreshRun(job, startedAt, status, {
      updated: data.updated,
      total: data.total,
      failed: failed.length,
      rescored: data.rescored,
      snapshots: data.snapshots,
      regimeFitScored,
      upstream: data.upstream,
      regime: data.regime,
      modelVersion: MODEL_VERSION,
    });

    return { ok: true, data };
  } catch {
    await logRefreshRun(job, startedAt, 'failed', { error: 'exception' });
    return { ok: false, status: 500, error: SERVER_ERROR_MESSAGE };
  }
}
