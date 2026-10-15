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
  sendBadRequest,
  sendLegacyUnavailable,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  WATCHLIST_ITEM_COLUMNS,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';

const ALLOWED = ['POST', 'PATCH', 'DELETE'];
const LEGACY_ID = 'legacy';

type LegacyRow = { id: string; ticker: string; added_at: string | null };

function legacyToItem(row: LegacyRow) {
  const addedAt = row.added_at ?? new Date().toISOString();
  return { id: row.id, watchlist_id: LEGACY_ID, ticker: row.ticker, notes: '', tags: [], added_at: addedAt, updated_at: addedAt };
}

/** Probe whether the named-watchlist tables exist. null = unexpected error. */
async function namedTablesExist(): Promise<boolean | null> {
  const { error } = await supabase.from('watchlist_items').select('id').limit(1);
  if (!error) return true;
  return isMissingRelation(error) ? false : null;
}

async function handlePost(request: ApiRequest, response: ApiResponse): Promise<void> {
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

  const exists = await namedTablesExist();
  if (exists === null) {
    sendServerError(response);
    return;
  }

  if (!exists) {
    if (watchlistId !== LEGACY_ID) {
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
    const fallback = await getOrCreateDefaultWatchlist();
    if (fallback.kind !== 'ok') {
      sendServerError(response);
      return;
    }
    targetId = fallback.list.id;
  }

  const { data, error } = await supabase
    .from('watchlist_items')
    .insert({ watchlist_id: targetId, ticker, notes: notes ?? '', tags: tags ?? [] })
    .select(WATCHLIST_ITEM_COLUMNS)
    .single();
  if (isUniqueViolation(error)) {
    response.status(409).json({ error: `${ticker} is already on this watchlist.` });
    return;
  }
  if (error?.code === '23503') {
    response.status(404).json({ error: 'Watchlist not found.' });
    return;
  }
  if (error || !data) {
    sendServerError(response);
    return;
  }
  response.status(201).json(data);
}

async function handlePatch(request: ApiRequest, response: ApiResponse, id: string): Promise<void> {
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

  const exists = await namedTablesExist();
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

  const { data, error } = await supabase
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

async function handleDelete(response: ApiResponse, id: string): Promise<void> {
  const exists = await namedTablesExist();
  if (exists === null) {
    sendServerError(response);
    return;
  }
  // Legacy mode: item ids returned by GET /api/watchlists are legacy watchlist row ids.
  const table = exists ? 'watchlist_items' : 'watchlist';
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    sendServerError(response);
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
    if (method === 'POST') {
      await handlePost(request, response);
      return;
    }

    const id = getQueryValue(request, 'id');
    if (!isUuid(id)) {
      sendBadRequest(response, 'A valid item id is required.');
      return;
    }

    if (method === 'PATCH') {
      await handlePatch(request, response, id);
      return;
    }
    await handleDelete(response, id);
  } catch {
    sendServerError(response);
  }
}
