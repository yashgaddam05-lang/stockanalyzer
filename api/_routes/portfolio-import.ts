import {
  isMissingRelation,
  isUuid,
  normalizeTicker,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { MAX_POSITIONS_PER_PORTFOLIO, POSITION_COLUMNS, parseFields, toPosition, type PositionRow } from './positions.js';

// Bulk import of holdings parsed client-side from a brokerage CSV or pasted text. Simulated positions
// only: nothing here talks to a brokerage. Each row is validated exactly like a single POST /api/positions;
// bad or untracked rows are skipped with a reason instead of failing the whole import.

type Skipped = { row: number; ticker: string; reason: string };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(response, ['POST']);
    return;
  }

  try {
    const auth = await resolveAuth(request);
    if (auth.kind !== 'user') {
      sendUnauthorized(response, auth.kind === 'invalid' ? 'Your session expired. Sign in again.' : undefined);
      return;
    }
    const body = readJsonBody(request);
    if (!body || !isUuid(body.portfolio_id) || !Array.isArray(body.positions)) {
      sendBadRequest(response, 'Send portfolio_id and a positions array.');
      return;
    }
    const portfolioId = body.portfolio_id;
    const input = body.positions as unknown[];
    if (input.length === 0 || input.length > MAX_POSITIONS_PER_PORTFOLIO) {
      sendBadRequest(response, `Import between 1 and ${MAX_POSITIONS_PER_PORTFOLIO} positions at a time.`);
      return;
    }

    // RLS hides other users' portfolios, so not-owned and missing both read as 404.
    const portfolio = await auth.db.from('portfolios').select('id').eq('id', portfolioId).maybeSingle();
    if (portfolio.error) {
      if (isMissingRelation(portfolio.error)) response.status(503).json({ error: 'Portfolios require the latest database migration.' });
      else sendServerError(response);
      return;
    }
    if (!portfolio.data) {
      response.status(404).json({ error: 'Portfolio not found.' });
      return;
    }

    const skipped: Skipped[] = [];
    const valid: { row: number; ticker: string; fields: Record<string, unknown> }[] = [];
    input.forEach((raw, i) => {
      const row = i + 1;
      const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const ticker = normalizeTicker(item.ticker);
      if (!ticker) {
        skipped.push({ row, ticker: String(item.ticker ?? ''), reason: 'Not a valid ticker.' });
        return;
      }
      const parsed = parseFields(item);
      if ('error' in parsed) {
        skipped.push({ row, ticker, reason: parsed.error });
        return;
      }
      if (parsed.fields.shares === undefined || parsed.fields.cost_basis === undefined) {
        skipped.push({ row, ticker, reason: 'Shares and cost per share are required.' });
        return;
      }
      valid.push({ row, ticker, fields: parsed.fields });
    });

    const tickers = [...new Set(valid.map((v) => v.ticker))];
    const tracked = new Set<string>();
    if (tickers.length > 0) {
      const stocks = await auth.db.from('stocks').select('ticker').in('ticker', tickers).neq('is_active', false);
      if (stocks.error) {
        sendServerError(response);
        return;
      }
      for (const s of (stocks.data ?? []) as { ticker: string }[]) tracked.add(s.ticker);
    }
    const toInsert = valid.filter((v) => {
      if (tracked.has(v.ticker)) return true;
      skipped.push({ row: v.row, ticker: v.ticker, reason: `${v.ticker} isn't tracked yet. Add it from search, then import again.` });
      return false;
    });

    const count = await auth.db.from('positions').select('id', { count: 'exact', head: true }).eq('portfolio_id', portfolioId);
    if (count.error) {
      sendServerError(response);
      return;
    }
    const room = MAX_POSITIONS_PER_PORTFOLIO - (count.count ?? 0);
    if (toInsert.length > room) {
      response.status(409).json({
        error: `This portfolio has room for ${Math.max(room, 0)} more positions (limit ${MAX_POSITIONS_PER_PORTFOLIO}). Import into a new portfolio instead.`,
      });
      return;
    }

    let positions: ReturnType<typeof toPosition>[] = [];
    if (toInsert.length > 0) {
      const { data, error } = await auth.db
        .from('positions')
        .insert(toInsert.map((v) => ({ ...v.fields, portfolio_id: portfolioId, ticker: v.ticker, owner_id: auth.userId })))
        .select(POSITION_COLUMNS);
      if (error) {
        sendServerError(response);
        return;
      }
      positions = ((data ?? []) as PositionRow[]).map(toPosition);
    }
    skipped.sort((a, b) => a.row - b.row);
    response.status(positions.length > 0 ? 201 : 200).json({ imported: positions.length, skipped, positions });
  } catch {
    sendServerError(response);
  }
}
