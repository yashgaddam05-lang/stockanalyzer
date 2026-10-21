import {
  getQueryValue,
  sendBadRequest,
  sendMethodNotAllowed,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { searchYahoo } from '../_yahoo-search.js';

// GET /api/stock-search?q=apple
// Tracked stocks first (instant, already scored), then other US listings from Yahoo
// that a signed-in user can add with POST /api/stock-add.

type Result = {
  ticker: string;
  name: string;
  sector: string | null;
  tracked: boolean;
  in_sp500: boolean;
  three_x_score: number | null;
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }
  const raw = (getQueryValue(request, 'q') ?? '').trim();
  if (raw.length < 1 || raw.length > 40) {
    sendBadRequest(response, 'Enter 1 to 40 characters to search.');
    return;
  }
  // Strip PostgREST filter metacharacters before building the or() filter.
  const q = raw.replace(/[%,()*\\]/g, ' ').trim();
  const upper = q.toUpperCase();

  const { data } = await supabase
    .from('stocks')
    .select('ticker, company_name, sector, in_sp500, three_x_score')
    .eq('is_active', true)
    .or(`ticker.ilike.${upper}%,company_name.ilike.%${q}%`)
    .limit(8);

  const tracked: Result[] = ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      ticker: String(r.ticker),
      name: String(r.company_name ?? r.ticker),
      sector: typeof r.sector === 'string' ? r.sector : null,
      tracked: true,
      in_sp500: r.in_sp500 === true,
      three_x_score: typeof r.three_x_score === 'number' ? r.three_x_score : null,
    }))
    // Exact ticker match first, then tickers that start with the query.
    .sort((a, b) => Number(b.ticker === upper) - Number(a.ticker === upper) || a.ticker.localeCompare(b.ticker));

  const seen = new Set(tracked.map((r) => r.ticker));
  const external: Result[] = tracked.length >= 8
    ? []
    : (await searchYahoo(q, 8))
      .filter((m) => !seen.has(m.ticker))
      .map((m) => ({
        ticker: m.ticker,
        name: m.name,
        sector: m.sector,
        tracked: false,
        in_sp500: false,
        three_x_score: null,
      }));

  response.status(200).json({ query: raw, results: [...tracked, ...external].slice(0, 10) });
}
