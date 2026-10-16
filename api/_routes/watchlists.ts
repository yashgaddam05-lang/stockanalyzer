import {
  getOrCreateDefaultWatchlist,
  getQueryValue,
  isMissingRelation,
  isUuid,
  parseWatchlistName,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendLegacyUnavailable,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  supabase,
  WATCHLIST_COLUMNS,
  WATCHLIST_ITEM_COLUMNS,
  type ApiRequest,
  type ApiResponse,
  type WatchlistRow,
} from '../_supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

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

/** Who the request runs as: db is the shared anon client (ownerId null) or the user-JWT client. */
type Scope = { db: SupabaseClient; ownerId: string | null };

/** Selects watchlists visible to the scope: shared rows for anonymous, own rows for users (RLS enforces both). */
function watchlistsQuery(scope: Scope, columns: string) {
  const query = scope.db.from('watchlists').select(columns);
  return scope.ownerId === null ? query.is('owner_id', null) : query.eq('owner_id', scope.ownerId);
}

/** Probe whether the named-watchlist tables exist. null = unexpected error. */
async function namedTablesExist(db: SupabaseClient): Promise<boolean | null> {
  const { error } = await db.from('watchlists').select('id').limit(1);
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

async function handleGet(response: ApiResponse, scope: Scope): Promise<void> {
  const fallback = await getOrCreateDefaultWatchlist(scope.db, scope.ownerId);
  if (fallback.kind === 'legacy') {
    if (scope.ownerId !== null) {
      sendLegacyUnavailable(response);
      return;
    }
    await sendLegacyList(response);
    return;
  }
  if (fallback.kind === 'error') {
    sendServerError(response);
    return;
  }

  const lists = await watchlistsQuery(scope, WATCHLIST_COLUMNS).order('created_at', { ascending: true });
  if (lists.error) {
    sendServerError(response);
    return;
  }
  const listIds = ((lists.data as unknown as WatchlistRow[] | null) ?? []).map((list) => list.id);
  const items = listIds.length === 0
    ? { data: [] as ItemRow[], error: null }
    : await scope.db
      .from('watchlist_items')
      .select(WATCHLIST_ITEM_COLUMNS)
      .in('watchlist_id', listIds)
      .order('added_at', { ascending: false });
  if (items.error) {
    sendServerError(response);
    return;
  }

  const byList = new Map<string, ItemRow[]>();
  for (const item of (items.data as ItemRow[] | null) ?? []) {
    const bucket = byList.get(item.watchlist_id) ?? [];
    bucket.push(item);
    byList.set(item.watchlist_id, bucket);
  }

  const rows = ((lists.data as unknown as WatchlistRow[] | null) ?? []).slice();
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
    const auth = await resolveAuth(request);
    if (auth.kind === 'invalid') {
      sendUnauthorized(response, 'Your session expired. Sign in again.');
      return;
    }
    const scope: Scope = { db: auth.db, ownerId: auth.userId };
    const { db } = scope;

    if (method === 'GET') {
      await handleGet(response, scope);
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

    const exists = await namedTablesExist(db);
    if (exists === null) {
      sendServerError(response);
      return;
    }
    if (!exists) {
      sendLegacyUnavailable(response);
      return;
    }

    if (method === 'POST') {
      // Anonymous inserts rely on the column default (auth.uid() = NULL) so pre-ownership schemas keep working.
      const row = scope.ownerId === null
        ? { name, is_default: false }
        : { name, is_default: false, owner_id: scope.ownerId };
      const { data, error } = await db
        .from('watchlists')
        .insert(row)
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
      const update = db
        .from('watchlists')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id as string);
      const { data, error } = await (scope.ownerId === null ? update.is('owner_id', null) : update.eq('owner_id', scope.ownerId))
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
    const found = await watchlistsQuery(scope, 'id, is_default').eq('id', id as string).maybeSingle();
    if (found.error) {
      sendServerError(response);
      return;
    }
    if (!found.data) {
      response.status(404).json({ error: 'Watchlist not found.' });
      return;
    }
    if ((found.data as unknown as { is_default: boolean }).is_default) {
      sendBadRequest(response, 'The default watchlist cannot be deleted.');
      return;
    }
    const del = db.from('watchlists').delete().eq('id', id as string);
    const removed = await (scope.ownerId === null ? del.is('owner_id', null) : del.eq('owner_id', scope.ownerId)).select('id');
    if (removed.error) {
      sendServerError(response);
      return;
    }
    if (!removed.data || removed.data.length === 0) {
      response.status(404).json({ error: 'Watchlist not found.' });
      return;
    }
    response.status(204).end();
  } catch {
    sendServerError(response);
  }
}
