import {
  getOrCreateDefaultWatchlist,
  getQueryValue,
  isMissingRelation,
  isUuid,
  parseWatchlistName,
  readJsonBody,
  sendBadRequest,
  sendLegacyUnavailable,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  WATCHLIST_COLUMNS,
  WATCHLIST_ITEM_COLUMNS,
  type ApiRequest,
  type ApiResponse,
  type WatchlistRow,
} from './_supabase.js';

type ItemRow = {
  id: string;
  watchlist_id: string;
  ticker: string;
  notes: string | null;
  tags: string[] | null;
  added_at: string;
  updated_at: string;
};

type LegacyRow = { id: string; ticker: string; added_at: string | null };

const ALLOWED = ['GET', 'POST', 'PATCH', 'DELETE'];

/** Probe whether the named-watchlist tables exist. null = unexpected error. */
async function namedTablesExist(): Promise<boolean | null> {
  const { error } = await supabase.from('watchlists').select('id').limit(1);
  if (!error) return true;
  return isMissingRelation(error) ? false : null;
}

async function sendLegacyList(response: ApiResponse): Promise<void> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('id, ticker, added_at')
    .order('added_at', { ascending: false });
  if (error) {
    sendServerError(response);
    return;
  }
  const rows = (data as LegacyRow[] | null) ?? [];
  const now = new Date().toISOString();
  const createdAt = rows.reduce<string>((min, row) => (row.added_at && row.added_at < min ? row.added_at : min), now);
  const items = rows.map((row) => {
    const addedAt = row.added_at ?? now;
    return { id: row.id, watchlist_id: 'legacy', ticker: row.ticker, notes: '', tags: [], added_at: addedAt, updated_at: addedAt };
  });
  response.status(200).json({
    legacy: true,
    lists: [{ id: 'legacy', name: 'My Watchlist', is_default: true, created_at: createdAt, updated_at: now, items }],
  });
}

async function handleGet(response: ApiResponse): Promise<void> {
  const fallback = await getOrCreateDefaultWatchlist();
  if (fallback.kind === 'legacy') {
    await sendLegacyList(response);
    return;
  }
  if (fallback.kind === 'error') {
    sendServerError(response);
    return;
  }

  const [lists, items] = await Promise.all([
    supabase.from('watchlists').select(WATCHLIST_COLUMNS).order('created_at', { ascending: true }),
    supabase.from('watchlist_items').select(WATCHLIST_ITEM_COLUMNS).order('added_at', { ascending: false }),
  ]);
  if (lists.error || items.error) {
    sendServerError(response);
    return;
  }

  const byList = new Map<string, ItemRow[]>();
  for (const item of (items.data as ItemRow[] | null) ?? []) {
    const bucket = byList.get(item.watchlist_id) ?? [];
    bucket.push(item);
    byList.set(item.watchlist_id, bucket);
  }

  const rows = ((lists.data as WatchlistRow[] | null) ?? []).slice();
  rows.sort((a, b) => Number(b.is_default) - Number(a.is_default));
  response.status(200).json({
    legacy: false,
    lists: rows.map((list) => ({
      ...list,
      items: (byList.get(list.id) ?? []).map((item) => ({ ...item, notes: item.notes ?? '', tags: item.tags ?? [] })),
    })),
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const method = request.method ?? '';
  if (!ALLOWED.includes(method)) {
    sendMethodNotAllowed(response, ALLOWED);
    return;
  }

  try {
    if (method === 'GET') {
      await handleGet(response);
      return;
    }

    // Validate input before touching the DB.
    let id: string | null = null;
    if (method === 'PATCH' || method === 'DELETE') {
      id = getQueryValue(request, 'id');
      if (!isUuid(id)) {
        sendBadRequest(response, 'A valid watchlist id is required.');
        return;
      }
    }

    let name: string | null = null;
    if (method === 'POST' || method === 'PATCH') {
      const body = readJsonBody(request);
      if (!body) {
        sendBadRequest(response, 'Request body must be a JSON object.');
        return;
      }
      name = parseWatchlistName(body.name);
      if (!name) {
        sendBadRequest(response, 'Name must be 1-60 characters.');
        return;
      }
    }

    const exists = await namedTablesExist();
    if (exists === null) {
      sendServerError(response);
      return;
    }
    if (!exists) {
      sendLegacyUnavailable(response);
      return;
    }

    if (method === 'POST') {
      const { data, error } = await supabase
        .from('watchlists')
        .insert({ name, is_default: false })
        .select(WATCHLIST_COLUMNS)
        .single();
      if (error || !data) {
        sendServerError(response);
        return;
      }
      response.status(201).json(data);
      return;
    }

    if (method === 'PATCH') {
      const { data, error } = await supabase
        .from('watchlists')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id as string)
        .select(WATCHLIST_COLUMNS)
        .maybeSingle();
      if (error) {
        sendServerError(response);
        return;
      }
      if (!data) {
        response.status(404).json({ error: 'Watchlist not found.' });
        return;
      }
      response.status(200).json(data);
      return;
    }

    // DELETE
    const found = await supabase.from('watchlists').select('id, is_default').eq('id', id as string).maybeSingle();
    if (found.error) {
      sendServerError(response);
      return;
    }
    if (!found.data) {
      response.status(404).json({ error: 'Watchlist not found.' });
      return;
    }
    if ((found.data as { is_default: boolean }).is_default) {
      sendBadRequest(response, 'The default watchlist cannot be deleted.');
      return;
    }
    const removed = await supabase.from('watchlists').delete().eq('id', id as string);
    if (removed.error) {
      sendServerError(response);
      return;
    }
    response.status(204).end();
  } catch {
    sendServerError(response);
  }
}
