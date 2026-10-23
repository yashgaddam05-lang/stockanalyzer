import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getQueryValue,
  isMissingRelation,
  isUuid,
  normalizeTicker,
  parseNotes,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// Simulated, educational positions only. No brokerage or payment integration.

const ALLOWED = ['POST', 'PATCH', 'DELETE'];
export const MAX_POSITIONS_PER_PORTFOLIO = 100;
const MAX_SHARES = 1e9;
const MAX_COST_BASIS = 1e7;
export const POSITION_COLUMNS = 'id, portfolio_id, ticker, shares, cost_basis, opened_at, notes, created_at, updated_at';
const UNAVAILABLE_MESSAGE = 'Portfolios require the latest database migration.';
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type PositionRow = {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number | string;
  cost_basis: number | string;
  opened_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function toPosition(row: PositionRow) {
  return {
    id: row.id,
    portfolio_id: row.portfolio_id,
    ticker: row.ticker,
    shares: Number(row.shares),
    cost_basis: Number(row.cost_basis),
    opened_at: row.opened_at,
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sendUnavailable(response: ApiResponse): void {
  response.status(503).json({ error: UNAVAILABLE_MESSAGE });
}

function sendDbError(response: ApiResponse, error: { code?: string | null; message?: string | null } | null): void {
  if (isMissingRelation(error)) sendUnavailable(response);
  else sendServerError(response);
}

/** undefined = not provided, null = invalid. */
function parseShares(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_SHARES) return null;
  return value;
}

/** undefined = not provided, null = invalid. Per-share cost. */
function parseCostBasis(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_COST_BASIS) return null;
  return value;
}

/**
 * undefined = not provided, null = invalid. Real calendar date, YYYY-MM-DD, not in the future.
 * "Today" is evaluated in the furthest-ahead time zone (UTC+14) so no user's local today is rejected.
 */
function parseOpenedAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900) return null;
  const latestToday = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return value > latestToday ? null : value;
}

type Fields = { shares?: number; cost_basis?: number; opened_at?: string; notes?: string };

/** Validates the shared numeric/date/notes fields; returns an error message or the parsed fields. */
export function parseFields(body: Record<string, unknown>): { error: string } | { fields: Fields } {
  const shares = parseShares(body.shares);
  if (shares === null) return { error: `Shares must be a number greater than 0 and at most ${MAX_SHARES}.` };
  const costBasis = parseCostBasis(body.cost_basis);
  if (costBasis === null) return { error: `Cost basis must be a per-share number from 0 to ${MAX_COST_BASIS}.` };
  const openedAt = parseOpenedAt(body.opened_at);
  if (openedAt === null) return { error: 'Opened date must be a valid YYYY-MM-DD date that is not in the future.' };
  const notes = parseNotes(body.notes);
  if (notes === null) return { error: 'Notes must be a string of at most 2000 characters.' };
  const fields: Fields = {};
  if (shares !== undefined) fields.shares = shares;
  if (costBasis !== undefined) fields.cost_basis = costBasis;
  if (openedAt !== undefined) fields.opened_at = openedAt;
  if (notes !== undefined) fields.notes = notes;
  return { fields };
}

async function handlePost(request: ApiRequest, response: ApiResponse, db: SupabaseClient, userId: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  if (!isUuid(body.portfolio_id)) {
    sendBadRequest(response, 'A valid portfolio_id is required.');
    return;
  }
  const portfolioId = body.portfolio_id;
  const ticker = normalizeTicker(body.ticker);
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }
  const parsed = parseFields(body);
  if ('error' in parsed) {
    sendBadRequest(response, parsed.error);
    return;
  }
  const { fields } = parsed;
  if (fields.shares === undefined || fields.cost_basis === undefined) {
    sendBadRequest(response, 'Shares and cost_basis are required.');
    return;
  }

  // RLS hides other users' portfolios, so not-owned and missing both read as 404.
  const portfolio = await db.from('portfolios').select('id').eq('id', portfolioId).maybeSingle();
  if (portfolio.error) {
    sendDbError(response, portfolio.error);
    return;
  }
  if (!portfolio.data) {
    response.status(404).json({ error: 'Portfolio not found.' });
    return;
  }

  const stock = await db.from('stocks').select('ticker').eq('ticker', ticker).limit(1);
  if (stock.error) {
    sendServerError(response);
    return;
  }
  if (!stock.data || stock.data.length === 0) {
    sendBadRequest(response, `${ticker} is not a tracked stock.`);
    return;
  }

  const count = await db
    .from('positions')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolioId);
  if (count.error) {
    sendDbError(response, count.error);
    return;
  }
  if ((count.count ?? 0) >= MAX_POSITIONS_PER_PORTFOLIO) {
    response.status(409).json({ error: `A portfolio can hold at most ${MAX_POSITIONS_PER_PORTFOLIO} positions.` });
    return;
  }

  const { data, error } = await db
    .from('positions')
    .insert({ ...fields, portfolio_id: portfolioId, ticker, owner_id: userId })
    .select(POSITION_COLUMNS)
    .single();
  if (error || !data) {
    sendDbError(response, error);
    return;
  }
  response.status(201).json(toPosition(data as PositionRow));
}

async function handlePatch(request: ApiRequest, response: ApiResponse, db: SupabaseClient, id: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const parsed = parseFields(body);
  if ('error' in parsed) {
    sendBadRequest(response, parsed.error);
    return;
  }
  if (Object.keys(parsed.fields).length === 0) {
    sendBadRequest(response, 'Provide shares, cost_basis, opened_at and/or notes to update.');
    return;
  }

  // RLS limits the update to the caller's positions; zero rows => 404.
  const { data, error } = await db
    .from('positions')
    .update({ ...parsed.fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(POSITION_COLUMNS)
    .maybeSingle();
  if (error) {
    sendDbError(response, error);
    return;
  }
  if (!data) {
    response.status(404).json({ error: 'Position not found.' });
    return;
  }
  response.status(200).json(toPosition(data as PositionRow));
}

async function handleDelete(response: ApiResponse, db: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await db.from('positions').delete().eq('id', id).select('id');
  if (error) {
    sendDbError(response, error);
    return;
  }
  if (!data || data.length === 0) {
    response.status(404).json({ error: 'Position not found.' });
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
    if (auth.kind === 'anonymous') {
      sendUnauthorized(response);
      return;
    }

    if (method === 'POST') {
      await handlePost(request, response, auth.db, auth.userId);
      return;
    }

    const id = getQueryValue(request, 'id');
    if (!isUuid(id)) {
      sendBadRequest(response, 'A valid position id is required.');
      return;
    }
    if (method === 'PATCH') {
      await handlePatch(request, response, auth.db, id);
      return;
    }
    await handleDelete(response, auth.db, id);
  } catch {
    sendServerError(response);
  }
}
