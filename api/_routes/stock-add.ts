import {
  normalizeTicker,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { lookupYahooSymbol } from '../_yahoo-search.js';
import { refreshAndScoreTickers } from '../_refresh-core.js';

// POST /api/stock-add { ticker } — signed-in users can start tracking any US stock or ETF.
// Added stocks join the shared universe (refreshed and scored for everyone); what each
// user sees on their dashboard still comes from their own watchlists and preferences.

const MAX_ADDS_PER_DAY = 10;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(response, ['POST']);
    return;
  }
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response, auth.kind === 'invalid' ? 'Your session expired. Sign in again.' : undefined);
    return;
  }
  const ticker = normalizeTicker(readJsonBody(request)?.ticker);
  if (!ticker) {
    sendBadRequest(response, 'Enter a valid ticker symbol.');
    return;
  }

  try {
    const existing = await supabase.from('stocks').select('*').eq('ticker', ticker).maybeSingle();
    if (existing.data && existing.data.is_active !== false) {
      response.status(200).json({ added: false, stock: existing.data });
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await supabase
      .from('stocks')
      .select('ticker', { count: 'exact', head: true })
      .eq('added_by', auth.userId)
      .gte('added_at', since);
    if ((recent.count ?? 0) >= MAX_ADDS_PER_DAY) {
      response.status(429).json({ error: `You can add up to ${MAX_ADDS_PER_DAY} new stocks per day.` });
      return;
    }

    const match = await lookupYahooSymbol(ticker);
    if (!match) {
      response.status(404).json({ error: `${ticker} isn't a US-listed stock or ETF we can track.` });
      return;
    }

    const now = new Date().toISOString();
    const write = existing.data
      ? await supabase.from('stocks').update({ is_active: true, added_by: auth.userId, added_at: now }).eq('ticker', ticker)
      : await supabase.from('stocks').insert({
        ticker,
        company_name: match.name,
        sector: match.sector ?? (match.type === 'ETF' ? 'ETF' : 'Other'),
        market_cap: 0,
        current_price: 0,
        data_source: 'seed',
        is_active: true,
        in_sp500: false,
        thesis: '',
        added_by: auth.userId,
        added_at: now,
      });
    if (write.error) {
      sendServerError(response);
      return;
    }

    await refreshAndScoreTickers([ticker]);
    const fresh = await supabase.from('stocks').select('*').eq('ticker', ticker).maybeSingle();
    const price = Number(fresh.data?.current_price ?? 0);
    if (!fresh.data || !(price > 0)) {
      // No usable market data: don't leave an empty $0 row in everyone's universe.
      await supabase.from('stocks').update({ is_active: false }).eq('ticker', ticker);
      response.status(422).json({ error: `No market data is available for ${ticker} right now. Try again later.` });
      return;
    }
    response.status(201).json({ added: true, stock: fresh.data });
  } catch {
    sendServerError(response);
  }
}
