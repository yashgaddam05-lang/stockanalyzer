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
} from '../_supabase.js';
import { CSUITE, MIN_INSIDER_BUY_USD, type SmartMoneyHolder, type SmartMoneyResponse } from '../../src/lib/smart-money.js';

const INSIDER_WINDOW_DAYS = 90;
const INSIDER_ROW_LIMIT = 200;

type SignalRow = {
  period: string | null;
  holders: number;
  holders_prev: number;
  new_holders: number;
  exited_holders: number;
  added: number;
  trimmed: number;
  holder_detail: SmartMoneyHolder[] | null;
  updated_at: string | null;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
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

  try {
    const [signal, managers, buys] = await Promise.all([
      supabase
        .from('smart_money_signals')
        .select('period, holders, holders_prev, new_holders, exited_holders, added, trimmed, holder_detail, updated_at')
        .eq('ticker', ticker)
        .limit(1),
      supabase.from('smart_money_managers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      // Live from Form 4 lines (refresh-filings), so a buy shows up the day it is synced.
      supabase
        .from('insider_transactions')
        .select('owner_name, owner_relationship, transaction_date, shares, price, value, filing_url')
        .eq('ticker', ticker)
        .eq('transaction_code', 'P')
        .eq('acquired_disposed', 'A')
        .gte('transaction_date', isoDateDaysAgo(INSIDER_WINDOW_DAYS))
        .order('transaction_date', { ascending: false })
        .limit(INSIDER_ROW_LIMIT),
    ]);

    const errors = [signal.error, managers.error, buys.error];
    if (errors.some((e) => e && !isMissingRelation(e))) {
      sendServerError(response);
      return;
    }

    const row = (signal.data as SignalRow[] | null)?.[0] ?? null;
    const csuite = ((buys.data ?? []) as Record<string, unknown>[])
      .filter((b) => CSUITE.test(String(b.owner_relationship ?? '')) && (toNumberOrNull(b.value) ?? 0) >= MIN_INSIDER_BUY_USD)
      .map((b) => ({
        owner_name: String(b.owner_name ?? ''),
        owner_relationship: (b.owner_relationship as string | null) ?? null,
        transaction_date: (b.transaction_date as string | null) ?? null,
        shares: toNumberOrNull(b.shares),
        price: toNumberOrNull(b.price),
        value: toNumberOrNull(b.value),
        filing_url: (b.filing_url as string | null) ?? null,
      }));

    const body: SmartMoneyResponse = {
      ticker,
      available: !!row,
      period: row?.period ?? null,
      holders: row?.holders ?? 0,
      holders_prev: row?.holders_prev ?? 0,
      new_holders: row?.new_holders ?? 0,
      exited_holders: row?.exited_holders ?? 0,
      added: row?.added ?? 0,
      trimmed: row?.trimmed ?? 0,
      holder_detail: (row?.holder_detail ?? []).map((h) => ({
        ...h,
        shares: Number(h.shares) || 0,
        prev_shares: h.prev_shares === null ? null : Number(h.prev_shares) || 0,
      })),
      managers_tracked: managers.count ?? 0,
      csuite_buys: csuite,
      csuite_buy_value: csuite.reduce((t, b) => t + (b.value ?? 0), 0),
      insider_window_days: INSIDER_WINDOW_DAYS,
      updated_at: row?.updated_at ?? null,
    };

    response.setHeader?.('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    response.status(200).json(body);
  } catch {
    sendServerError(response);
  }
}
