import {
  getQueryValue,
  isMissingRelation,
  normalizeTicker,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';

const DEFAULT_LIMIT = 90;
const MAX_LIMIT = 365;

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (value < 1) return null;
  return Math.min(value, MAX_LIMIT);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  const ticker = normalizeTicker(getQueryValue(request, 'ticker'));
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }

  const limit = parseLimit(getQueryValue(request, 'limit'));
  if (limit === null) {
    sendBadRequest(response, `limit must be an integer between 1 and ${MAX_LIMIT}.`);
    return;
  }

  try {
    // Take the most recent N, then return them oldest-first for charting.
    const { data, error } = await supabase
      .from('score_history')
      .select('id, ticker, three_x_score, risk_score, model_version, dimension_scores, captured_at')
      .eq('ticker', ticker)
      .order('captured_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error)) {
        response.status(200).json({ ticker, available: false, entries: [] });
        return;
      }
      sendServerError(response);
      return;
    }

    const entries = [...(data ?? [])].reverse();
    response.status(200).json({ ticker, available: true, entries });
  } catch {
    sendServerError(response);
  }
}
