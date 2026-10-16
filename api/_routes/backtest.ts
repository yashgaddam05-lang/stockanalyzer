import {
  getQueryValue,
  isMissingRelation,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
  type DbError,
} from '../_supabase.js';
import { MODEL_VERSION } from '../../src/lib/scoring/index.js';
import {
  aggregateBacktest,
  BASE_CAVEATS,
  DEFAULT_MIN_OBSERVATIONS,
  type BacktestResult,
  type ForwardObservation,
  type HorizonDays,
} from '../../src/lib/backtest/index.js';

const HORIZONS: readonly HorizonDays[] = [5, 21, 63];
const DEFAULT_HORIZON: HorizonDays = 21;
const MODEL_VERSION_RE = /^v\d+(\.\d+)*$/;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const VERSION_SCAN_LIMIT = 5000;
const CACHE_CONTROL = 's-maxage=900, stale-while-revalidate=3600';

// PGRST202: function not found in schema cache; 42883: undefined_function.
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

function isMissingObject(error: DbError): boolean {
  if (!error) return false;
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return true;
  const message = error.message ?? '';
  return isMissingRelation(error) || message.includes('Could not find the function');
}

function parseHorizon(raw: string | null): HorizonDays | null {
  if (raw === null || raw === '') return DEFAULT_HORIZON;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return (HORIZONS as readonly number[]).includes(value) ? (value as HorizonDays) : null;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** PostgREST may serialise numeric columns as strings; coerce types only (no entry logic). */
function toObservation(row: Record<string, unknown>): ForwardObservation {
  return {
    ticker: String(row.ticker ?? ''),
    captured_at: String(row.captured_at ?? ''),
    three_x_score: toNum(row.three_x_score) as number,
    risk_score: toNum(row.risk_score),
    entry_date: String(row.entry_date ?? ''),
    entry_close: toNum(row.entry_close) as number,
    exit_date: String(row.exit_date ?? ''),
    exit_close: toNum(row.exit_close) as number,
    spy_entry_close: toNum(row.spy_entry_close),
    spy_exit_close: toNum(row.spy_exit_close),
  };
}

function unavailable(modelVersion: string, versions: string[], horizon: HorizonDays): BacktestResult {
  return {
    available: false,
    model_version: modelVersion,
    versions,
    horizon_days: horizon,
    generated_at: new Date().toISOString(),
    sample: { snapshots: 0, observations: 0, tickers: 0, first_date: null, last_date: null },
    buckets: [],
    top_vs_bottom: null,
    information_coefficient: null,
    sufficient: false,
    min_observations: DEFAULT_MIN_OBSERVATIONS,
    caveats: [
      'Backtesting needs stored score history and daily prices (score_history, price_daily and the ' +
        'score_forward_returns function). They are not available in this database yet.',
      ...BASE_CAVEATS,
    ],
  };
}

type VersionsResult = { kind: 'ok'; versions: string[] } | { kind: 'missing' } | { kind: 'error' };

async function loadVersions(): Promise<VersionsResult> {
  const { data, error } = await supabase
    .from('score_history')
    .select('model_version')
    .order('captured_at', { ascending: false })
    .limit(VERSION_SCAN_LIMIT);
  if (error) return isMissingObject(error) ? { kind: 'missing' } : { kind: 'error' };
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ model_version: unknown }>) {
    if (typeof row.model_version === 'string' && row.model_version) seen.add(row.model_version);
  }
  return { kind: 'ok', versions: [...seen].sort() };
}

type RowsResult = { kind: 'ok'; rows: ForwardObservation[] } | { kind: 'missing' } | { kind: 'error' };

async function loadRows(modelVersion: string, horizon: HorizonDays): Promise<RowsResult> {
  const rows: ForwardObservation[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .rpc('score_forward_returns', { p_model_version: modelVersion, p_horizon: horizon })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return isMissingObject(error) ? { kind: 'missing' } : { kind: 'error' };
    const batch = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    for (const row of batch) rows.push(toObservation(row));
    if (batch.length < PAGE_SIZE) break;
  }
  return { kind: 'ok', rows };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  const horizon = parseHorizon(getQueryValue(request, 'horizon'));
  if (horizon === null) {
    sendBadRequest(response, 'horizon must be one of 5, 21 or 63.');
    return;
  }

  const rawVersion = getQueryValue(request, 'model_version');
  let modelVersion = MODEL_VERSION;
  if (rawVersion !== null && rawVersion !== '') {
    if (!MODEL_VERSION_RE.test(rawVersion) || rawVersion.length > 32) {
      sendBadRequest(response, 'model_version must look like v1 or v1.2.');
      return;
    }
    modelVersion = rawVersion;
  }

  try {
    const versionsResult = await loadVersions();
    if (versionsResult.kind === 'error') {
      sendServerError(response);
      return;
    }
    if (versionsResult.kind === 'missing') {
      response.setHeader?.('Cache-Control', CACHE_CONTROL);
      response.status(200).json(unavailable(modelVersion, [], horizon));
      return;
    }

    const rowsResult = await loadRows(modelVersion, horizon);
    if (rowsResult.kind === 'error') {
      sendServerError(response);
      return;
    }
    if (rowsResult.kind === 'missing') {
      response.setHeader?.('Cache-Control', CACHE_CONTROL);
      response.status(200).json(unavailable(modelVersion, versionsResult.versions, horizon));
      return;
    }

    const result = aggregateBacktest(rowsResult.rows, {
      horizonDays: horizon,
      modelVersion,
      versions: versionsResult.versions,
    });
    response.setHeader?.('Cache-Control', CACHE_CONTROL);
    response.status(200).json(result);
  } catch {
    sendServerError(response);
  }
}
