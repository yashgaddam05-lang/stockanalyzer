import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function firstHttpUrl(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.startsWith('https://') || value?.startsWith('http://'));
}

export const supabaseUrl = firstHttpUrl([
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  process.env.DATABASE_URL,
  process.env.database_url,
]);
const anonKey = process.env.SUPABASE_ANON_KEY
  ?? process.env.VITE_SUPABASE_ANON_KEY
  ?? process.env.DATABASE_ANON_KEY
  ?? process.env.database_anon_key;

if (!supabaseUrl || !anonKey) {
  throw new Error('Supabase server configuration is missing.');
}

const resolvedUrl: string = supabaseUrl;
const resolvedAnonKey: string = anonKey;

export const supabase = createClient(resolvedUrl, resolvedAnonKey);

export type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader?: (name: string, value: string) => void;
};

// ---------- Auth helpers ----------

const BEARER_RE = /^Bearer\s+(\S+)\s*$/i;

/** Extracts the JWT from a case-insensitive `Authorization: Bearer <jwt>` header. */
export function getBearerToken(request: ApiRequest): string | null {
  const headers = request.headers;
  if (!headers) return null;
  let raw: string | string[] | undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'authorization') {
      raw = headers[key];
      break;
    }
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const match = BEARER_RE.exec(value.trim());
  return match ? match[1] : null;
}

/** Supabase client that runs queries as the given user (RLS applies). */
export function createUserClient(token: string): SupabaseClient {
  return createClient(resolvedUrl, resolvedAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthContext =
  | { kind: 'anonymous'; db: SupabaseClient; userId: null }
  | { kind: 'user'; db: SupabaseClient; userId: string }
  | { kind: 'invalid' };

// Per-instance cache of tokens Supabase has already verified, so a page's burst of API calls
// costs one auth round trip instead of one per request.
const VERIFY_CACHE_MS = 60_000;
const verifiedTokens = new Map<string, { userId: string; until: number }>();

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** No Authorization header => anonymous; valid JWT => user-scoped client; anything else => invalid. */
export async function resolveAuth(request: ApiRequest): Promise<AuthContext> {
  const headers = request.headers;
  const hasHeader = Boolean(headers && Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization' && headers[key] !== undefined && headers[key] !== '',
  ));
  if (!hasHeader) return { kind: 'anonymous', db: supabase, userId: null };

  const token = getBearerToken(request);
  if (!token) return { kind: 'invalid' };
  const cached = verifiedTokens.get(token);
  if (cached && cached.until > Date.now()) return { kind: 'user', db: createUserClient(token), userId: cached.userId };
  try {
    const { data, error } = await supabase.auth.getUser(token);
    const userId = data?.user?.id;
    if (error || !userId) return { kind: 'invalid' };
    if (verifiedTokens.size >= 500) verifiedTokens.clear();
    // Never trust a cached verification past the token's own expiry.
    const exp = tokenExpiryMs(token);
    verifiedTokens.set(token, { userId, until: Math.min(Date.now() + VERIFY_CACHE_MS, exp ?? Date.now() + VERIFY_CACHE_MS) });
    return { kind: 'user', db: createUserClient(token), userId };
  } catch {
    return { kind: 'invalid' };
  }
}

export function sendUnauthorized(response: ApiResponse, message = 'Sign in required.'): void {
  response.status(401).json({ error: message });
}

export function getQueryValue(request: ApiRequest, name: string): string | null {
  const value = request.query?.[name];
  return typeof value === 'string' ? value : null;
}

export function sendServerError(response: ApiResponse): void {
  response.status(500).json({ error: 'The request could not be completed.' });
}

export type DbError = { code?: string | null; message?: string | null } | null | undefined;

const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);

/** True when the error means a table/column from a newer migration is not present yet. */
export function isMissingRelation(error: DbError): boolean {
  if (!error) return false;
  if (error.code && MISSING_RELATION_CODES.has(error.code)) return true;
  const message = error.message ?? '';
  return message.includes('does not exist') || message.includes('Could not find the table');
}

/** True for Postgres unique_violation. */
export function isUniqueViolation(error: DbError): boolean {
  return Boolean(error && error.code === '23505');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeTicker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ticker = value.trim().toUpperCase();
  return TICKER_RE.test(ticker) ? ticker : null;
}

/** Returns the request body as a plain object (parses string bodies), or null if not an object. */
export function readJsonBody(request: ApiRequest): Record<string, unknown> | null {
  let body = request.body;
  if (typeof body === 'string') {
    if (body.trim() === '') return {};
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function sendMethodNotAllowed(response: ApiResponse, allowed: string[]): void {
  response.status(405).json({ error: `Method not allowed. Use ${allowed.join(', ')}.` });
}

export function sendBadRequest(response: ApiResponse, message: string): void {
  response.status(400).json({ error: message });
}

export const LEGACY_MODE_MESSAGE = 'Named watchlists require the latest database migration.';

export function sendLegacyUnavailable(response: ApiResponse): void {
  response.status(503).json({ error: LEGACY_MODE_MESSAGE });
}

// ---------- Watchlist shared helpers ----------

export type WatchlistRow = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const WATCHLIST_COLUMNS = 'id, name, is_default, created_at, updated_at';
export const WATCHLIST_ITEM_COLUMNS = 'id, watchlist_id, ticker, notes, tags, added_at, updated_at';

/** Trimmed name of 1-60 chars, or null. */
export function parseWatchlistName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

/** undefined = not provided, null = invalid. */
export function parseNotes(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 2000) return null;
  return value;
}

const TAG_RE = /^[a-z0-9][a-z0-9 -]*$/;

/** undefined = not provided, null = invalid. Trims, lowercases, dedupes. */
export function parseTags(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) return null;
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const tag = raw.trim().toLowerCase();
    if (tag.length < 1 || tag.length > 24 || !TAG_RE.test(tag)) return null;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export type DefaultWatchlistResult =
  | { kind: 'legacy' }
  | { kind: 'ok'; list: WatchlistRow }
  | { kind: 'error' };

/**
 * Resolves the default named watchlist for an owner (null = anonymous/shared),
 * creating 'My Watchlist' when the tables exist but no default does.
 * Returns legacy when tables are missing. Falls back to the unscoped lookup
 * when the owner_id column has not been migrated yet.
 */
export async function getOrCreateDefaultWatchlist(
  db: SupabaseClient = supabase,
  ownerId: string | null = null,
): Promise<DefaultWatchlistResult> {
  const findDefault = () => {
    const query = db.from('watchlists').select(WATCHLIST_COLUMNS).eq('is_default', true);
    return (ownerId === null ? query.is('owner_id', null) : query.eq('owner_id', ownerId)).limit(1);
  };

  const { data, error } = await findDefault();
  if (error) {
    return isMissingRelation(error) ? getOrCreateUnscopedDefault(db) : { kind: 'error' };
  }
  const existing = (data as WatchlistRow[] | null)?.[0];
  if (existing) return { kind: 'ok', list: existing };

  const created = await db
    .from('watchlists')
    .insert({ name: 'My Watchlist', is_default: true, owner_id: ownerId })
    .select(WATCHLIST_COLUMNS)
    .single();
  if (!created.error && created.data) return { kind: 'ok', list: created.data as WatchlistRow };
  if (isMissingRelation(created.error)) return getOrCreateUnscopedDefault(db);

  // A concurrent request may have created the default (partial unique index).
  if (isUniqueViolation(created.error)) {
    const retry = await findDefault();
    const row = (retry.data as WatchlistRow[] | null)?.[0];
    if (!retry.error && row) return { kind: 'ok', list: row };
  }
  return { kind: 'error' };
}

/** Pre-owner_id behavior: a single global default watchlist. */
async function getOrCreateUnscopedDefault(db: SupabaseClient): Promise<DefaultWatchlistResult> {
  const { data, error } = await db
    .from('watchlists')
    .select(WATCHLIST_COLUMNS)
    .eq('is_default', true)
    .limit(1);
  if (error) return isMissingRelation(error) ? { kind: 'legacy' } : { kind: 'error' };
  const existing = (data as WatchlistRow[] | null)?.[0];
  if (existing) return { kind: 'ok', list: existing };

  const created = await db
    .from('watchlists')
    .insert({ name: 'My Watchlist', is_default: true })
    .select(WATCHLIST_COLUMNS)
    .single();
  if (!created.error && created.data) return { kind: 'ok', list: created.data as WatchlistRow };

  // A concurrent request may have created the default (partial unique index).
  if (isUniqueViolation(created.error)) {
    const retry = await db
      .from('watchlists')
      .select(WATCHLIST_COLUMNS)
      .eq('is_default', true)
      .limit(1);
    const row = (retry.data as WatchlistRow[] | null)?.[0];
    if (!retry.error && row) return { kind: 'ok', list: row };
  }
  return { kind: 'error' };
}
