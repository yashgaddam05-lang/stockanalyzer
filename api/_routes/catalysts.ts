import {
  getQueryValue,
  isMissingRelation,
  isUniqueViolation,
  isUuid,
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

const CATALYST_TYPES = [
  'earnings',
  'product',
  'regulatory',
  'clinical',
  'conference',
  'corporate',
  'other',
] as const;
type CatalystType = (typeof CATALYST_TYPES)[number];

const DATE_STATUSES = ['confirmed', 'estimated'] as const;
type DateStatus = (typeof DATE_STATUSES)[number];

const CATALYST_COLUMNS =
  'id, ticker, event_type, title, event_date, date_status, source, source_url, notes, created_by, created_at, updated_at';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCatalystType(value: unknown): value is CatalystType {
  return typeof value === 'string' && (CATALYST_TYPES as readonly string[]).includes(value);
}

function isDateStatus(value: unknown): value is DateStatus {
  return typeof value === 'string' && (DATE_STATUSES as readonly string[]).includes(value);
}

/** Valid calendar date in YYYY-MM-DD form -> UTC epoch ms, otherwise null. */
function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addYearsUtc(ms: number, years: number): number {
  const date = new Date(ms);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.getTime();
}

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? value : null;
}

/** Optional http(s) URL up to 500 chars. undefined = not provided / empty, null = invalid. */
function parseSourceUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (url === '') return undefined;
  if (url.length > 500 || !/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return url;
}

async function handleGet(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawTicker = getQueryValue(request, 'ticker');
  let ticker: string | null = null;
  if (rawTicker !== null && rawTicker !== '') {
    ticker = normalizeTicker(rawTicker);
    if (!ticker) {
      sendBadRequest(response, 'ticker is invalid.');
      return;
    }
  }

  const today = todayUtcMs();
  const defaultFrom = ticker ? today - 365 * DAY_MS : today;
  const defaultTo = ticker ? today + 365 * DAY_MS : today + 90 * DAY_MS;

  const rawFrom = getQueryValue(request, 'from');
  const rawTo = getQueryValue(request, 'to');
  const fromMs = rawFrom === null || rawFrom === '' ? defaultFrom : parseDate(rawFrom);
  const toMs = rawTo === null || rawTo === '' ? defaultTo : parseDate(rawTo);
  if (fromMs === null) {
    sendBadRequest(response, 'from must be a valid date (YYYY-MM-DD).');
    return;
  }
  if (toMs === null) {
    sendBadRequest(response, 'to must be a valid date (YYYY-MM-DD).');
    return;
  }
  if (fromMs > toMs) {
    sendBadRequest(response, 'from must be on or before to.');
    return;
  }

  const rawType = getQueryValue(request, 'type');
  let type: CatalystType | null = null;
  if (rawType !== null && rawType !== '') {
    if (!isCatalystType(rawType)) {
      sendBadRequest(response, `type must be one of: ${CATALYST_TYPES.join(', ')}.`);
      return;
    }
    type = rawType;
  }

  const limit = parseLimit(getQueryValue(request, 'limit'));
  if (limit === null) {
    sendBadRequest(response, `limit must be an integer between 1 and ${MAX_LIMIT}.`);
    return;
  }

  let query = supabase
    .from('catalysts')
    .select(CATALYST_COLUMNS)
    .gte('event_date', toIsoDate(fromMs))
    .lte('event_date', toIsoDate(toMs));
  if (ticker) query = query.eq('ticker', ticker);
  if (type) query = query.eq('event_type', type);

  const { data, error } = await query
    .order('event_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error)) {
      response.status(200).json({ available: false, catalysts: [] });
      return;
    }
    sendServerError(response);
    return;
  }

  response.setHeader?.('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  response.status(200).json({ available: true, catalysts: data ?? [] });
}

async function handlePost(request: ApiRequest, response: ApiResponse): Promise<void> {
  const auth = await resolveAuth(request);
  if (auth.kind === 'anonymous') {
    sendUnauthorized(response, 'Sign in to add catalysts.');
    return;
  }
  if (auth.kind === 'invalid') {
    sendUnauthorized(response, 'Your session is invalid or expired. Sign in again.');
    return;
  }

  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }

  const ticker = normalizeTicker(body.ticker);
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }

  if (!isCatalystType(body.event_type)) {
    sendBadRequest(response, `event_type must be one of: ${CATALYST_TYPES.join(', ')}.`);
    return;
  }
  const eventType = body.event_type;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 200) {
    sendBadRequest(response, 'title must be 1-200 characters.');
    return;
  }

  const eventMs = parseDate(body.event_date);
  if (eventMs === null) {
    sendBadRequest(response, 'event_date must be a valid date (YYYY-MM-DD).');
    return;
  }
  const today = todayUtcMs();
  if (eventMs < today - 365 * DAY_MS || eventMs > addYearsUtc(today, 3)) {
    sendBadRequest(response, 'event_date must be within the past year and the next 3 years.');
    return;
  }

  let dateStatus: DateStatus | undefined;
  if (body.date_status !== undefined && body.date_status !== null) {
    if (!isDateStatus(body.date_status)) {
      sendBadRequest(response, 'date_status must be confirmed or estimated.');
      return;
    }
    dateStatus = body.date_status;
  }

  const sourceUrl = parseSourceUrl(body.source_url);
  if (sourceUrl === null) {
    sendBadRequest(response, 'source_url must be an http(s) URL of at most 500 characters.');
    return;
  }

  let notes: string | undefined;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string' || body.notes.length > 1000) {
      sendBadRequest(response, 'notes must be a string of at most 1000 characters.');
      return;
    }
    notes = body.notes;
  }

  const stock = await supabase.from('stocks').select('ticker').eq('ticker', ticker).limit(1);
  if (stock.error) {
    sendServerError(response);
    return;
  }
  if (!stock.data || stock.data.length === 0) {
    sendBadRequest(response, `Unknown ticker ${ticker}.`);
    return;
  }

  const row: Record<string, unknown> = {
    ticker,
    event_type: eventType,
    title,
    event_date: toIsoDate(eventMs),
    source: 'manual',
  };
  if (dateStatus !== undefined) row.date_status = dateStatus;
  if (sourceUrl !== undefined) row.source_url = sourceUrl;
  if (notes !== undefined) row.notes = notes;

  // created_by defaults to auth.uid(); RLS requires source = 'manual' and created_by = auth.uid().
  const { data, error } = await auth.db.from('catalysts').insert(row).select(CATALYST_COLUMNS).single();
  if (error) {
    if (isUniqueViolation(error)) {
      response.status(409).json({ error: 'That catalyst already exists.' });
      return;
    }
    if (isMissingRelation(error)) {
      response.status(503).json({ error: 'Catalysts require the latest database migration.' });
      return;
    }
    sendServerError(response);
    return;
  }

  response.status(201).json(data);
}

async function handleDelete(request: ApiRequest, response: ApiResponse): Promise<void> {
  const auth = await resolveAuth(request);
  if (auth.kind === 'anonymous') {
    sendUnauthorized(response, 'Sign in to delete catalysts.');
    return;
  }
  if (auth.kind === 'invalid') {
    sendUnauthorized(response, 'Your session is invalid or expired. Sign in again.');
    return;
  }

  const id = getQueryValue(request, 'id');
  if (!isUuid(id)) {
    sendBadRequest(response, 'A valid catalyst id is required.');
    return;
  }

  const { data, error } = await auth.db
    .from('catalysts')
    .delete()
    .eq('id', id)
    .eq('source', 'manual')
    .select('id');
  if (error) {
    if (isMissingRelation(error)) {
      response.status(404).json({ error: 'Catalyst not found.' });
      return;
    }
    sendServerError(response);
    return;
  }
  if (!data || data.length === 0) {
    response.status(404).json({ error: 'Catalyst not found.' });
    return;
  }

  response.status(204).end();
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  try {
    switch (request.method) {
      case 'GET':
        await handleGet(request, response);
        return;
      case 'POST':
        await handlePost(request, response);
        return;
      case 'DELETE':
        await handleDelete(request, response);
        return;
      default:
        sendMethodNotAllowed(response, ['GET', 'POST', 'DELETE']);
    }
  } catch {
    sendServerError(response);
  }
}
