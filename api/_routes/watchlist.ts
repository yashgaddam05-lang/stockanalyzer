// Legacy single-watchlist endpoint. Request/response shapes are frozen:
//   GET -> WatchlistEntry[]   POST {ticker} -> 201 {ticker}   DELETE ?ticker= -> 204
// When the named-watchlist tables exist it operates on the default named list.
import {
  getOrCreateDefaultWatchlist,
  getQueryValue,
  isUniqueViolation,
  normalizeTicker,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendLegacyUnavailable,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

const ALLOWED = ['GET', 'POST', 'DELETE'];

function getTicker(request: ApiRequest): string | null {
  const body = readJsonBody(request);
  if (body && typeof body.ticker === 'string') {
    return normalizeTicker(body.ticker);
  }
  return normalizeTicker(getQueryValue(request, 'ticker'));
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const method = request.method ?? '';
  if (!ALLOWED.includes(method)) {
    sendMethodNotAllowed(response, ALLOWED);
    return;
  }

  const auth = await resolveAuth(request);
  if (auth.kind === 'invalid') {
    sendUnauthorized(response, 'Your session expired. Sign in again.');
    return;
  }
  // Watchlists are per-user only; the pre-auth anonymous shared list is retired.
  if (auth.kind !== 'user') {
    sendUnauthorized(response);
    return;
  }
  // User-JWT client + the user's own default list.
  const db = auth.db;

  let ticker: string | null = null;
  if (method !== 'GET') {
    ticker = getTicker(request);
    if (!ticker) {
      sendBadRequest(response, 'A valid ticker is required.');
      return;
    }
  }

  try {
    const fallback = await getOrCreateDefaultWatchlist(db, auth.userId);
    if (fallback.kind === 'error') {
      sendServerError(response);
      return;
    }

    if (fallback.kind === 'ok') {
      const listId = fallback.list.id;
      if (method === 'GET') {
        const { data, error } = await db
          .from('watchlist_items')
          .select('id, ticker, added_at')
          .eq('watchlist_id', listId)
          .order('added_at', { ascending: false });
        if (error) {
          sendServerError(response);
          return;
        }
        response.status(200).json(data ?? []);
        return;
      }
      if (method === 'POST') {
        const { error } = await db.from('watchlist_items').insert({ watchlist_id: listId, ticker });
        if (error && !isUniqueViolation(error)) {
          sendServerError(response);
          return;
        }
        response.status(201).json({ ticker });
        return;
      }
      const { error } = await db
        .from('watchlist_items')
        .delete()
        .eq('watchlist_id', listId)
        .eq('ticker', ticker as string);
      if (error) {
        sendServerError(response);
        return;
      }
      response.status(204).end();
      return;
    }

    // Legacy table fallback (shared, anonymous only).
    if (auth.kind === 'user') {
      sendLegacyUnavailable(response);
      return;
    }
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('watchlist')
        .select('id, ticker, added_at')
        .order('added_at', { ascending: false });
      if (error) {
        sendServerError(response);
        return;
      }
      response.status(200).json(data ?? []);
      return;
    }
    if (method === 'POST') {
      const { error } = await supabase.from('watchlist').insert({ ticker });
      if (error && !isUniqueViolation(error)) {
        sendServerError(response);
        return;
      }
      response.status(201).json({ ticker });
      return;
    }
    const { error } = await supabase.from('watchlist').delete().eq('ticker', ticker as string);
    if (error) {
      sendServerError(response);
      return;
    }
    response.status(204).end();
  } catch {
    sendServerError(response);
  }
}
