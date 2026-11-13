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

const FILINGS_LIMIT = 25;
const INSIDER_LIMIT = 50;
const SUMMARY_WINDOW_DAYS = 90;
const SUMMARY_ROW_LIMIT = 2000;

const FILING_COLUMNS = 'id, ticker, cik, accession_no, form, filed_at, report_date, primary_doc_url, description';
type FilingRow = { filed_at: string | null; accession_no: string };

/** Newest first; ties keep a stable order by accession number. */
function mergeFilings(a: FilingRow[] | null, b: FilingRow[] | null): FilingRow[] {
  return [...(a ?? []), ...(b ?? [])].sort(
    (x, y) => (y.filed_at ?? '').localeCompare(x.filed_at ?? '') || y.accession_no.localeCompare(x.accession_no),
  );
}

const INSIDER_COLUMNS =
  'id, ticker, accession_no, line_no, owner_name, owner_relationship, transaction_date, transaction_code, '
  + 'acquired_disposed, shares, price, value, shares_owned_after, filing_url';

type SummaryRow = {
  transaction_code: string | null;
  acquired_disposed: 'A' | 'D' | null;
  shares: number | string | null;
  value: number | string | null;
};

type InsiderSummary = {
  window_days: number;
  buys: number;
  sells: number;
  net_shares: number;
  net_value: number;
};

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** P = open-market buy, S = open-market sell. Net = acquired minus disposed over P/S lines only. */
function summarize(rows: SummaryRow[]): InsiderSummary | null {
  if (rows.length === 0) return null;
  let buys = 0;
  let sells = 0;
  let netShares = 0;
  let netValue = 0;
  for (const row of rows) {
    const code = row.transaction_code;
    if (code !== 'P' && code !== 'S') continue;
    if (code === 'P') buys++;
    else sells++;
    const sign = row.acquired_disposed === 'A' ? 1 : row.acquired_disposed === 'D' ? -1 : 0;
    netShares += sign * toNumber(row.shares);
    netValue += sign * toNumber(row.value);
  }
  return { window_days: SUMMARY_WINDOW_DAYS, buys, sells, net_shares: netShares, net_value: netValue };
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
    // Banks file dozens of 424B notes a week; fetched apart so they cannot crowd
    // 10-K/10-Q/8-K/Form 4 off the list. Merged newest-first below.
    const [mainFilings, noteFilings, insider, summaryRows, sync] = await Promise.all([
      supabase
        .from('sec_filings')
        .select(FILING_COLUMNS)
        .eq('ticker', ticker)
        .not('form', 'like', '424B%')
        .order('filed_at', { ascending: false })
        .limit(FILINGS_LIMIT),
      supabase
        .from('sec_filings')
        .select(FILING_COLUMNS)
        .eq('ticker', ticker)
        .like('form', '424B%')
        .order('filed_at', { ascending: false })
        .limit(FILINGS_LIMIT),
      supabase
        .from('insider_transactions')
        .select(INSIDER_COLUMNS)
        .eq('ticker', ticker)
        .order('transaction_date', { ascending: false, nullsFirst: false })
        .limit(INSIDER_LIMIT),
      supabase
        .from('insider_transactions')
        .select('transaction_code, acquired_disposed, shares, value')
        .eq('ticker', ticker)
        .in('transaction_code', ['P', 'S'])
        .gte('transaction_date', isoDateDaysAgo(SUMMARY_WINDOW_DAYS))
        .limit(SUMMARY_ROW_LIMIT),
      supabase.from('sec_sync_state').select('last_synced_at').eq('ticker', ticker).limit(1),
    ]);

    const errors = [mainFilings.error, noteFilings.error, insider.error, summaryRows.error, sync.error];
    if (errors.some((e) => e && !isMissingRelation(e))) {
      sendServerError(response);
      return;
    }
    const available = !errors.some((e) => isMissingRelation(e));

    response.setHeader?.('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

    if (!available) {
      response.status(200).json({
        ticker,
        available: false,
        filings: [],
        insider: [],
        insider_summary: null,
        last_synced_at: null,
      });
      return;
    }

    const insiderRows = ((insider.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      ...row,
      shares: toNumberOrNull(row.shares),
      price: toNumberOrNull(row.price),
      value: toNumberOrNull(row.value),
      shares_owned_after: toNumberOrNull(row.shares_owned_after),
    }));
    const syncRow = (sync.data as { last_synced_at: string | null }[] | null)?.[0];

    response.status(200).json({
      ticker,
      available: true,
      filings: mergeFilings(mainFilings.data, noteFilings.data),
      insider: insiderRows,
      insider_summary: summarize((summaryRows.data ?? []) as SummaryRow[]),
      last_synced_at: syncRow?.last_synced_at ?? null,
    });
  } catch {
    sendServerError(response);
  }
}
