import {
  getQueryValue,
  normalizeTicker,
  sendBadRequest,
  sendMethodNotAllowed,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// Mirrors PriceRange / PricePoint / PriceHistoryResponse in src/lib/supabase.ts.
type PriceRange = '1mo' | '3mo' | '6mo' | '1y' | '5y';
type PriceInterval = '1d' | '1wk';

type PricePoint = {
  t: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

type PriceHistoryResponse = {
  ticker: string;
  range: PriceRange;
  interval: PriceInterval;
  currency: string | null;
  points: PricePoint[];
};

const RANGES: readonly PriceRange[] = ['1mo', '3mo', '6mo', '1y', '5y'];
const DEFAULT_RANGE: PriceRange = '3mo';
const TIMEOUT_MS = 8000;
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
// Browser-like but short: the full Chrome UA string gets 429'd by the chart endpoint without a crumb.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const CACHE_CONTROL = 'public, s-maxage=900, stale-while-revalidate=3600';

type YahooQuote = {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
};

type YahooResult = {
  meta?: { currency?: string | null; exchangeTimezoneName?: string | null };
  timestamp?: number[];
  indicators?: { quote?: YahooQuote[] };
};

type YahooChart = {
  chart?: { result?: YahooResult[] | null; error?: { code?: string; description?: string } | null };
};

type FetchOutcome =
  | { kind: 'ok'; result: YahooResult | null }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

function parseRange(raw: string | null): PriceRange | null {
  if (raw === null || raw === '') return DEFAULT_RANGE;
  return (RANGES as readonly string[]).includes(raw) ? (raw as PriceRange) : null;
}

async function fetchChart(host: string, ticker: string, range: PriceRange, interval: PriceInterval): Promise<FetchOutcome> {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}`
    + `?range=${range}&interval=${interval}&includePrePost=false&events=div,splits`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return { kind: 'not_found' };
    if (!res.ok) return { kind: 'error', message: `Upstream returned ${res.status}.` };
    const body = (await res.json()) as YahooChart;
    if (body.chart?.error?.code === 'Not Found') return { kind: 'not_found' };
    return { kind: 'ok', result: body.chart?.result?.[0] ?? null };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { kind: 'error', message: aborted ? 'Upstream request timed out.' : 'Upstream request failed.' };
  } finally {
    clearTimeout(timer);
  }
}

function makeDateFormatter(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { ...options, timeZone });
    } catch {
      // Unknown timezone: fall through to UTC.
    }
  }
  return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapPoints(result: YahooResult): PricePoint[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const formatter = makeDateFormatter(result.meta?.exchangeTimezoneName);
  const order = timestamps
    .map((ts, i) => ({ ts, i }))
    .filter(({ ts }) => Number.isFinite(ts))
    .sort((a, b) => a.ts - b.ts);
  const points: PricePoint[] = [];

  for (const { ts, i } of order) {
    const close = finiteOrNull(quote.close?.[i]);
    if (close === null) continue;
    points.push({
      t: formatter.format(new Date(ts * 1000)),
      open: finiteOrNull(quote.open?.[i]),
      high: finiteOrNull(quote.high?.[i]),
      low: finiteOrNull(quote.low?.[i]),
      close,
      volume: finiteOrNull(quote.volume?.[i]),
    });
  }
  return points;
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

  const range = parseRange(getQueryValue(request, 'range'));
  if (!range) {
    sendBadRequest(response, `range must be one of ${RANGES.join(', ')}.`);
    return;
  }
  const interval: PriceInterval = range === '5y' ? '1wk' : '1d';

  let outcome = await fetchChart(HOSTS[0], ticker, range, interval);
  if (outcome.kind === 'error') outcome = await fetchChart(HOSTS[1], ticker, range, interval);

  if (outcome.kind === 'error') {
    response.status(502).json({ error: outcome.message });
    return;
  }

  const points = outcome.kind === 'ok' && outcome.result ? mapPoints(outcome.result) : [];
  if (points.length === 0) {
    response.status(404).json({ error: `No price history for ${ticker}.` });
    return;
  }

  const result = outcome.kind === 'ok' ? outcome.result : null;
  const body: PriceHistoryResponse = {
    ticker,
    range,
    interval,
    currency: result?.meta?.currency ?? null,
    points,
  };
  response.setHeader?.('Cache-Control', CACHE_CONTROL);
  response.status(200).json(body);
}
