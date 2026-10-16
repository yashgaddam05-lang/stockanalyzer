import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getQueryValue,
  isMissingRelation,
  isUuid,
  parseWatchlistName,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';

// Simulated, educational portfolios only. No brokerage or payment integration.

const ALLOWED = ['GET', 'POST', 'PATCH', 'DELETE'];
const MAX_PORTFOLIOS = 10;
const PORTFOLIO_COLUMNS = 'id, name, created_at, updated_at';
const POSITION_COLUMNS = 'id, portfolio_id, ticker, shares, cost_basis, opened_at, notes, created_at, updated_at';
const UNAVAILABLE_MESSAGE = 'Portfolios require the latest database migration.';

type PortfolioRow = { id: string; name: string; created_at: string; updated_at: string };
type PositionRow = {
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

function toPortfolio(row: PortfolioRow) {
  return { id: row.id, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
}

function toPosition(row: PositionRow) {
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

async function handleGet(response: ApiResponse, db: SupabaseClient): Promise<void> {
  const portfolios = await db
    .from('portfolios')
    .select(PORTFOLIO_COLUMNS)
    .order('created_at', { ascending: true });
  if (portfolios.error) {
    if (isMissingRelation(portfolios.error)) {
      response.status(200).json({ available: false, portfolios: [] });
      return;
    }
    sendServerError(response);
    return;
  }
  const rows = (portfolios.data ?? []) as PortfolioRow[];
  if (rows.length === 0) {
    response.status(200).json({ available: true, portfolios: [] });
    return;
  }

  // Single query for all positions (RLS scopes to the caller); grouped in memory.
  const positions = await db
    .from('positions')
    .select(POSITION_COLUMNS)
    .in('portfolio_id', rows.map((row) => row.id))
    .order('ticker', { ascending: true });
  if (positions.error) {
    if (isMissingRelation(positions.error)) {
      response.status(200).json({ available: false, portfolios: [] });
      return;
    }
    sendServerError(response);
    return;
  }

  const byPortfolio = new Map<string, ReturnType<typeof toPosition>[]>();
  for (const row of (positions.data ?? []) as PositionRow[]) {
    const list = byPortfolio.get(row.portfolio_id) ?? [];
    list.push(toPosition(row));
    byPortfolio.set(row.portfolio_id, list);
  }
  response.status(200).json({
    available: true,
    portfolios: rows.map((row) => ({ ...toPortfolio(row), positions: byPortfolio.get(row.id) ?? [] })),
  });
}

async function handlePost(request: ApiRequest, response: ApiResponse, db: SupabaseClient, userId: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const name = parseWatchlistName(body.name);
  if (name === null) {
    sendBadRequest(response, 'Name must be 1-60 characters.');
    return;
  }

  const count = await db.from('portfolios').select('id', { count: 'exact', head: true });
  if (count.error) {
    if (isMissingRelation(count.error)) sendUnavailable(response);
    else sendServerError(response);
    return;
  }
  if ((count.count ?? 0) >= MAX_PORTFOLIOS) {
    response.status(409).json({ error: `You can have at most ${MAX_PORTFOLIOS} portfolios.` });
    return;
  }

  const { data, error } = await db
    .from('portfolios')
    .insert({ name, owner_id: userId })
    .select(PORTFOLIO_COLUMNS)
    .single();
  if (error || !data) {
    if (isMissingRelation(error)) sendUnavailable(response);
    else sendServerError(response);
    return;
  }
  response.status(201).json(toPortfolio(data as PortfolioRow));
}

async function handlePatch(request: ApiRequest, response: ApiResponse, db: SupabaseClient, id: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const name = parseWatchlistName(body.name);
  if (name === null) {
    sendBadRequest(response, 'Name must be 1-60 characters.');
    return;
  }
  // RLS limits the update to the caller's portfolios; zero rows => 404.
  const { data, error } = await db
    .from('portfolios')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PORTFOLIO_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) sendUnavailable(response);
    else sendServerError(response);
    return;
  }
  if (!data) {
    response.status(404).json({ error: 'Portfolio not found.' });
    return;
  }
  response.status(200).json(toPortfolio(data as PortfolioRow));
}

async function handleDelete(response: ApiResponse, db: SupabaseClient, id: string): Promise<void> {
  // Positions cascade via FK. RLS limits the delete to the caller's portfolios.
  const { data, error } = await db.from('portfolios').delete().eq('id', id).select('id');
  if (error) {
    if (isMissingRelation(error)) sendUnavailable(response);
    else sendServerError(response);
    return;
  }
  if (!data || data.length === 0) {
    response.status(404).json({ error: 'Portfolio not found.' });
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

    if (method === 'GET') {
      await handleGet(response, auth.db);
      return;
    }
    if (method === 'POST') {
      await handlePost(request, response, auth.db, auth.userId);
      return;
    }

    const id = getQueryValue(request, 'id');
    if (!isUuid(id)) {
      sendBadRequest(response, 'A valid portfolio id is required.');
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
