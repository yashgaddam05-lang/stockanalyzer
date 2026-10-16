import type { MarketRegimeResponse, MarketRegimeSnapshot } from '../../src/lib/supabase.js';
import {
  getQueryValue,
  isMissingRelation,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const COLUMNS =
  'as_of, vix, tnx, tnx_change_63d, spy_close, spy_above_200dma, spy_return_63d, risk_appetite, regime_label, sector_strength, drivers, model_version, created_at';

const EMPTY: MarketRegimeResponse = { available: false, latest: null, history: [] };

function parseDays(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_DAYS;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_DAYS ? value : null;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  const days = parseDays(getQueryValue(request, 'days'));
  if (days === null) {
    sendBadRequest(response, `days must be an integer between 1 and ${MAX_DAYS}.`);
    return;
  }

  try {
    // Most recent N snapshots, returned oldest-first for charting.
    const { data, error } = await supabase
      .from('market_regime_snapshots')
      .select(COLUMNS)
      .order('as_of', { ascending: false })
      .limit(days);

    if (error) {
      if (isMissingRelation(error)) {
        response.status(200).json(EMPTY);
        return;
      }
      sendServerError(response);
      return;
    }

    const history = [...((data as MarketRegimeSnapshot[] | null) ?? [])].reverse();
    if (history.length === 0) {
      response.status(200).json(EMPTY);
      return;
    }

    const body: MarketRegimeResponse = {
      available: true,
      latest: history[history.length - 1],
      history,
    };
    response.setHeader?.('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    response.status(200).json(body);
  } catch {
    sendServerError(response);
  }
}
