import {
  isMissingRelation,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

type StockRow = { ticker: string; [key: string]: unknown };
type SnapshotRow = { ticker: string; three_x_score: number; model_version: string; captured_at: string };
type ScoreDelta = { score_change: number | null; previous_score: number | null };

const SNAPSHOT_LIMIT = 5000;

async function loadActiveStocks(): Promise<StockRow[] | null> {
  const filtered = await supabase.from('stocks').select('*').not('is_active', 'is', false);
  if (!filtered.error) return (filtered.data as StockRow[] | null) ?? [];
  if (!isMissingRelation(filtered.error)) return null;

  // is_active column not migrated yet: fall back to every row.
  const all = await supabase.from('stocks').select('*');
  if (all.error) return null;
  return (all.data as StockRow[] | null) ?? [];
}

/** Map of ticker -> delta between latest snapshot and the previous one with the same model_version. */
async function loadScoreDeltas(): Promise<Map<string, ScoreDelta>> {
  const deltas = new Map<string, ScoreDelta>();
  const { data, error } = await supabase
    .from('score_history')
    .select('ticker, three_x_score, model_version, captured_at')
    .order('captured_at', { ascending: false })
    .limit(SNAPSHOT_LIMIT);
  // Missing table or any other failure degrades to null deltas, never a 500.
  if (error || !data) return deltas;

  const latest = new Map<string, SnapshotRow>();
  for (const row of data as SnapshotRow[]) {
    if (deltas.has(row.ticker)) continue;
    const head = latest.get(row.ticker);
    if (!head) {
      latest.set(row.ticker, row);
      continue;
    }
    if (row.model_version === head.model_version && row.captured_at < head.captured_at) {
      deltas.set(row.ticker, {
        previous_score: row.three_x_score,
        score_change: head.three_x_score - row.three_x_score,
      });
    }
  }
  return deltas;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  try {
    const [stocks, deltas] = await Promise.all([loadActiveStocks(), loadScoreDeltas()]);
    if (!stocks) {
      sendServerError(response);
      return;
    }

    const items = stocks.map((stock) => {
      const delta = deltas.get(stock.ticker);
      return {
        ...stock,
        score_change: delta?.score_change ?? null,
        previous_score: delta?.previous_score ?? null,
      };
    });
    response.status(200).json(items);
  } catch {
    sendServerError(response);
  }
}
