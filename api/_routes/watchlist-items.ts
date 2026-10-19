import {
  getOrCreateDefaultWatchlist,
  getQueryValue,
  isMissingRelation,
  isUniqueViolation,
  isUuid,
  normalizeTicker,
  parseNotes,
  parseTags,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendLegacyUnavailable,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  supabase,
  WATCHLIST_ITEM_COLUMNS,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ALLOWED = ['POST', 'PATCH', 'DELETE'];
const LEGACY_ID = 'legacy';
/** Postgres codes meaning the target watchlist is missing or not visible to this caller (FK / RLS WITH CHECK). */
const NOT_FOUND_CODES = new Set(['23503', '42501']);

/** Who the request runs as: db is the shared anon client (ownerId null) or the user-JWT client. */
type Scope = { db: SupabaseClient; ownerId: string | null };

type LegacyRow = { id: string; ticker: string; added_at: string | null };

function legacyToItem(row: LegacyRow) {
  const addedAt = row.added_at ?? new Date().toISOString();
  return { id: row.id, watchlist_id: LEGACY_ID, ticker: row.ticker, notes: '', tags: [], added_at: addedAt, updated_at: addedAt };
}

/** Probe whether the named-watchlist tables exist. null = unexpected error. */
async function namedTablesExist(db: SupabaseClient): Promise<boolean | null> {
  const { error } = await db.from('watchlist_items').select('id').limit(1);
  if (!error) return true;
  return isMissingRelation(error) ? false : null;
}

async function handlePost(request: ApiRequest, response: ApiResponse, scope: Scope): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const watchlistId = body.watchlist_id;
  if (watchlistId !== LEGACY_ID && !isUuid(watchlistId)) {
    sendBadRequest(response, 'A valid watchlist_id is required.');
    return;
  }
  const ticker = normalizeTicker(body.ticker);
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }
  const notes = parseNotes(body.notes);
  if (notes === null) {
    sendBadRequest(response, 'Notes must be a string of at most 2000 characters.');
    return;
  }
  const tags = parseTags(body.tags);
  if (tags === null) {
    sendBadRequest(response, 'Tags must be up to 10 strings of 1-24 characters (a-z, 0-9, space, hyphen).');
    return;
  }

  const exists = await namedTablesExist(scope.db);
  if (exists === null) {
    sendServerError(response);
    return;
  }

  if (!exists) {
    if (watchlistId !== LEGACY_ID || scope.ownerId !== null) {
      sendLegacyUnavailable(response);
      return;
    }
    const { data, error } = await supabase.from('watchlist').insert({ ticker }).select('id, ticker, added_at').single();
    if (isUniqueViolation(error)) {
      response.status(409).json({ error: `${ticker} is already on this watchlist.` });
      return;
    }
    if (error || !data) {
      sendServerError(response);
      return;
    }
    response.status(201).json(legacyToItem(data as LegacyRow));
    return;
  }

  let targetId = watchlistId as string;
  if (watchlistId === LEGACY_ID) {
    // Client still holds the legacy id after the migration landed: use the default list.
    const fallback = await getOrCreateDefaultWatchlist(scope.db, scope.ownerId);
    if (fallback.kind === 'legacy' && scope.ownerId !== null) {
      sendLegacyUnavailable(response);
      return;
    }
    if (fallback.kind !== 'ok') {
      sendServerError(response);
      return;
    }
    targetId = fallback.list.id;
  }

  const { data, error } = await scope.db
    .from('watchlist_items')
    .insert({ watchlist_id: targetId, ticker, notes: notes ?? '', tags: tags ?? [] })
    .select(WATCHLIST_ITEM_COLUMNS)
    .single();
  if (isUniqueViolation(error)) {
    response.status(409).json({ error: `${ticker} is already on this watchlist.` });
    return;
  }
  if (error?.code && NOT_FOUND_CODES.has(error.code)) {
    response.status(404).json({ error: 'Watchlist not found.' });
    return;
  }
  if (error || !data) {
    sendServerError(response);
    return;
  }
  response.status(201).json(data);
}

async function handlePatch(request: ApiRequest, response: ApiResponse, scope: Scope, id: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const notes = parseNotes(body.notes);
  if (notes === null) {
    sendBadRequest(response, 'Notes must be a string of at most 2000 characters.');
    return;
  }
  const tags = parseTags(body.tags);
  if (tags === null) {
    sendBadRequest(response, 'Tags must be up to 10 strings of 1-24 characters (a-z, 0-9, space, hyphen).');
    return;
  }
  if (notes === undefined && tags === undefined) {
    sendBadRequest(response, 'Provide notes and/or tags to update.');
    return;
  }

  const exists = await namedTablesExist(scope.db);
  if (exists === null) {
    sendServerError(response);
    return;
  }
  if (!exists) {
    sendLegacyUnavailable(response);
    return;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (notes !== undefined) patch.notes = notes;
  if (tags !== undefined) patch.tags = tags;

  // RLS limits the update to items in watchlists this caller can see; zero rows => 404.
  const { data, error } = await scope.db
    .from('watchlist_items')
    .update(patch)
    .eq('id', id)
    .select(WATCHLIST_ITEM_COLUMNS)
    .maybeSingle();
  if (error) {
    sendServerError(response);
    return;
  }
  if (!data) {
    response.status(404).json({ error: 'Watchlist item not found.' });
    return;
  }
  response.status(200).json(data);
}

async function handleDelete(response: ApiResponse, scope: Scope, id: string): Promise<void> {
  const exists = await namedTablesExist(scope.db);
  if (exists === null) {
    sendServerError(response);
    return;
  }
  if (!exists) {
    if (scope.ownerId !== null) {
      sendLegacyUnavailable(response);
      return;
    }
    // Legacy mode: item ids returned by GET /api/watchlists are legacy watchlist row ids.
    const { error } = await supabase.from('watchlist').delete().eq('id', id);
    if (error) {
      sendServerError(response);
      return;
    }
    response.status(204).end();
    return;
  }
  // RLS limits the delete to items in watchlists this caller can see; zero rows => 404.
  const { data, error } = await scope.db.from('watchlist_items').delete().eq('id', id).select('id');
  if (error) {
    sendServerError(response);
    return;
  }
  if (!data || data.length === 0) {
    response.status(404).json({ error: 'Watchlist item not found.' });
    return;
  }
  response.status(204).end();
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
    // Watchlists are per-user only; the pre-auth anonymous shared list is retired.
    if (auth.kind !== 'user') {
      sendUnauthorized(response);
      return;
    }
    const scope: Scope = { db: auth.db, ownerId: auth.userId };

    if (method === 'POST') {
      await handlePost(request, response, scope);
      return;
    }

    const id = getQueryValue(request, 'id');
    if (!isUuid(id)) {
      sendBadRequest(response, 'A valid item id is required.');
      return;
    }

    if (method === 'PATCH') {
      await handlePatch(request, response, scope, id);
      return;
    }
    await handleDelete(response, scope, id);
  } catch {
    sendServerError(response);
  }
}
