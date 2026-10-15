import {
  isMissingRelation,
  sendServerError,
  supabase,
  supabaseUrl,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';
import { MODEL_VERSION, computeRiskScore, scoreStock } from '../src/lib/scoring/index.js';

type ScoringInput = Parameters<typeof scoreStock>[0];

type UpstreamResult =
  | { kind: 'ok'; updated: number; total: number | null; failed: string[] }
  | { kind: 'timeout' }
  | { kind: 'failed' };

type Rescored = {
  ticker: string;
  threeX: number;
  riskScore: number;
  riskLabel: string;
  dimensionScores: Record<string, number | null>;
};

type SnapshotRow = {
  ticker: string;
  three_x_score: number;
  model_version: string;
  captured_at: string;
};

/** Leave headroom under maxDuration 120 for rescoring + history writes. */
const UPSTREAM_TIMEOUT_MS = 75_000;
const CHUNK_SIZE = 50;
const SNAPSHOT_DEDUPE_MS = 6 * 60 * 60 * 1000;

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

function rescore(stock: ScoringInput): Rescored {
  const score = scoreStock(stock);
  const risk = computeRiskScore(stock);
  const dimensionScores: Record<string, number | null> = {};
  for (const dim of score.dimensions) dimensionScores[dim.key] = dim.score;
  return {
    ticker: stock.ticker,
    threeX: score.total,
    riskScore: risk.score,
    riskLabel: risk.label,
    dimensionScores,
  };
}

function updateStock(row: Rescored, includeRiskScore: boolean) {
  const values: Record<string, unknown> = {
    three_x_score: row.threeX,
    risk_level: row.riskLabel,
  };
  if (includeRiskScore) values.risk_score = row.riskScore;
  return supabase.from('stocks').update(values).eq('ticker', row.ticker);
}

/** Writes scores back to stocks; falls back to omitting risk_score if that column is missing. */
async function persistScores(rows: Rescored[]): Promise<{ rescored: number; failed: string[] }> {
  const failed: string[] = [];
  let rescored = 0;
  let includeRiskScore = true;
  let pending = rows;

  // Probe with the first row so a missing risk_score column is detected once, not 50 times.
  const first = pending[0];
  if (first) {
    pending = pending.slice(1);
    let result = await updateStock(first, true);
    if (result.error && isMissingRelation(result.error)) {
      includeRiskScore = false;
      result = await updateStock(first, false);
    }
    if (result.error) failed.push(first.ticker);
    else rescored++;
  }

  for (const group of chunk(pending, CHUNK_SIZE)) {
    const results = await Promise.all(group.map((row) => updateStock(row, includeRiskScore)));
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

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!supabaseUrl) {
    sendServerError(response);
    return;
  }

  try {
    const upstream = await callUpstream(supabaseUrl);
    if (upstream.kind === 'failed') {
      response.status(502).json({ error: 'The stock refresh service is unavailable.' });
      return;
    }

    const { data, error } = await supabase.from('stocks').select('*');
    if (error) {
      sendServerError(response);
      return;
    }

    const stocks = ((data as ScoringInput[] | null) ?? []).filter(
      (s) => typeof s?.ticker === 'string' && s.ticker.length > 0,
    );

    const rescoredRows: Rescored[] = [];
    const scoringFailed: string[] = [];
    for (const stock of stocks) {
      try {
        rescoredRows.push(rescore(stock));
      } catch {
        scoringFailed.push(stock.ticker);
      }
    }

    const persisted = await persistScores(rescoredRows);
    const written = new Set(persisted.failed);
    const history = await writeSnapshots(rescoredRows.filter((row) => !written.has(row.ticker)));

    const upstreamFailed = upstream.kind === 'ok' ? upstream.failed : [];
    const failed = Array.from(new Set([...upstreamFailed, ...scoringFailed, ...persisted.failed]));

    response.status(200).json({
      updated: upstream.kind === 'ok' ? upstream.updated : 0,
      total: upstream.kind === 'ok' && upstream.total !== null ? upstream.total : stocks.length,
      failed,
      rescored: persisted.rescored,
      historyAvailable: history.historyAvailable,
      snapshots: history.snapshots,
      modelVersion: MODEL_VERSION,
      upstream: upstream.kind === 'ok' ? 'ok' : 'timeout',
    });
  } catch {
    sendServerError(response);
  }
}
