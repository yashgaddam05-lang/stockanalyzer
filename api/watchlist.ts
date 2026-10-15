import { getQueryValue, sendServerError, supabase, type ApiRequest, type ApiResponse } from './_supabase';

function getTicker(request: ApiRequest): string | null {
  const body = request.body;
  if (body && typeof body === 'object' && 'ticker' in body && typeof body.ticker === 'string') {
    return body.ticker.trim().toUpperCase();
  }

  return getQueryValue(request, 'ticker')?.trim().toUpperCase() ?? null;
}

function isTicker(value: string | null): value is string {
  return value !== null && /^[A-Z][A-Z0-9.-]{0,9}$/.test(value);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method === 'GET') {
    const { data, error } = await supabase.from('watchlist').select('*');
    if (error) {
      sendServerError(response);
      return;
    }

    response.status(200).json(data ?? []);
    return;
  }

  const ticker = getTicker(request);
  if (!isTicker(ticker)) {
    response.status(400).json({ error: 'A valid ticker is required.' });
    return;
  }

  if (request.method === 'POST') {
    const { error } = await supabase.from('watchlist').insert({ ticker });
    if (error) {
      sendServerError(response);
      return;
    }

    response.status(201).json({ ticker });
    return;
  }

  if (request.method === 'DELETE') {
    const { error } = await supabase.from('watchlist').delete().eq('ticker', ticker);
    if (error) {
      sendServerError(response);
      return;
    }

    response.status(204).end();
    return;
  }

  response.status(405).json({ error: 'Method not allowed.' });
}
