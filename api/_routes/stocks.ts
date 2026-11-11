import {
  getQueryValue,
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
    const fresh = getQueryValue(request, 't') !== undefined;
    const items = await cachedUniverse(fresh);
    if (!items) {
      sendServerError(response);
      return;
    }
    // Same data for every user and refreshed every 20 minutes: let the CDN serve it.
    response.setHeader?.('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=1800');
    response.status(200).json(items);
  } catch {
    sendServerError(response);
  }
}

async function buildUniverse(): Promise<unknown[] | null> {
  const [stocks, deltas] = await Promise.all([loadActiveStocks(), loadScoreDeltas()]);
  if (!stocks) return null;
  return stocks.map((stock) => {
    const delta = deltas.get(stock.ticker);
    return { ...stock, score_change: delta?.score_change ?? null, previous_score: delta?.previous_score ?? null };
  });
}

// Per-instance cache: when the CDN copy expires, a burst of requests shares one database rebuild
// instead of each running its own (the 100-user load test showed a 9s tail without this).
const INSTANCE_TTL_MS = 60_000;
let memo: { at: number; items: unknown[] } | null = null;
let inflight: Promise<unknown[] | null> | null = null;

async function cachedUniverse(fresh: boolean): Promise<unknown[] | null> {
  if (!fresh && memo && Date.now() - memo.at < INSTANCE_TTL_MS) return memo.items;
  inflight ??= buildUniverse()
    .then((items) => {
      if (items) memo = { at: Date.now(), items };
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
