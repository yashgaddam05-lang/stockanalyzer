// Paper accounts: virtual $100,000 accounts valued from adjusted daily closes (paper_prices).
// Buy and hold from the first market close after creation; nothing here is real money.
import { supabaseAdmin } from './_supabase.js';

export type Holding = { symbol: string; weight: number };
export type PaperRow = {
  id: string;
  user_id: string | null;
  code: string | null;
  name: string;
  stocks: number;
  bonds: number;
  cash: number;
  sleeve: string;
  holdings: Holding[];
  benchmark: Holding[];
  start_value: number | string;
  target_multiple: number | string;
  horizon_years: number;
  assumptions: Record<string, string>;
  version: number;
  created_at: string;
};

/** Series start for every symbol: launch of the feature. */
const EPOCH = '2026-11-01';
const ENTRY_COST = 0.001;
const BOND_FUNDS = new Set(['VGSH', 'BND']);
const CASH_FUNDS = new Set(['SGOV']);
const STOCK_FUNDS = new Set(['VTI', 'VXUS']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function fetchSeries(symbol: string): Promise<[string, number][] | null> {
  const p1 = Math.floor(Date.parse(`${EPOCH}T00:00:00Z`) / 1000);
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol.replace('.', '-'))}?period1=${p1}&period2=${p2}&interval=1d`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { adjclose?: { adjclose?: (number | null)[] }[]; quote?: { close?: (number | null)[] }[] } }[] };
      };
      const r = j.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const adj = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
      const out: [string, number][] = [];
      ts.forEach((t, i) => {
        const v = adj[i];
        // Yahoo stamps the session open; the date is what matters.
        if (typeof v === 'number' && v > 0) out.push([new Date(t * 1000).toISOString().slice(0, 10), v]);
      });
      // Drop today's bar until the market has closed (21:00 UTC covers EST and EDT).
      const today = new Date().toISOString().slice(0, 10);
      if (out.at(-1)?.[0] === today && new Date().getUTCHours() < 21) out.pop();
      return out;
    } catch {
      // try the other host
    }
  }
  return null;
}

/** Fetches and stores adjusted closes since EPOCH for the given symbols (all of them when omitted). */
export async function refreshPaperPrices(only?: string[]): Promise<{ symbols: number; failed: string[] }> {
  let symbols = only;
  if (!symbols) {
    const { data } = await supabaseAdmin.from('paper_accounts').select('holdings, benchmark');
    const set = new Set<string>();
    for (const row of (data ?? []) as Pick<PaperRow, 'holdings' | 'benchmark'>[]) {
      for (const h of [...row.holdings, ...row.benchmark]) set.add(h.symbol);
    }
    symbols = [...set];
  }
  const failed: string[] = [];
  const queue = [...symbols];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const series = await fetchSeries(s);
      if (!series?.length) {
        failed.push(s);
        continue;
      }
      const sym = s;
      const { error } = await supabaseAdmin.from('paper_prices').upsert(series.map(([d, adj]) => ({ symbol: sym, d, adj })), { onConflict: 'symbol,d' });
      if (error) failed.push(s);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { symbols: symbols.length, failed };
}

type PriceMap = Map<string, Map<string, number>>;

export async function loadPrices(symbols: string[]): Promise<PriceMap> {
  const map: PriceMap = new Map();
  if (!symbols.length) return map;
  // Paged: PostgREST caps a response at 1,000 rows.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('paper_prices')
      .select('symbol, d, adj')
      .in('symbol', symbols)
      .order('d', { ascending: true })
      .order('symbol', { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data as { symbol: string; d: string; adj: number | string }[]) {
      if (!map.has(r.symbol)) map.set(r.symbol, new Map());
      map.get(r.symbol)!.set(r.d, Number(r.adj));
    }
    if (data.length < 1000) break;
  }
  return map;
}

/** First trading day whose close (21:00 UTC) is after the account was created. */
function inceptionDay(createdAt: string, calendar: string[]): string | null {
  const created = Date.parse(createdAt);
  return calendar.find((d) => Date.parse(`${d}T21:00:00Z`) > created) ?? null;
}

function valueSeries(holdings: Holding[], prices: PriceMap, days: string[], start: number) {
  const base = holdings.map((h) => {
    const p = prices.get(h.symbol);
    return { ...h, p, p0: p?.get(days[0]) ?? null, last: p?.get(days[0]) ?? null };
  });
  const points: { d: string; v: number }[] = [];
  const parts = { stocks: 0, bonds: 0, cash: 0 };
  for (const d of days) {
    let v = 0;
    parts.stocks = parts.bonds = parts.cash = 0;
    for (const b of base) {
      const px = b.p?.get(d);
      if (px) b.last = px;
      // A holding without an entry price stays at its starting value (treated as cash).
      const ratio = b.p0 && b.last ? b.last / b.p0 : 1;
      const part = start * (1 - ENTRY_COST) * b.weight * ratio;
      v += part;
      if (BOND_FUNDS.has(b.symbol)) parts.bonds += part;
      else if (CASH_FUNDS.has(b.symbol) || !b.p0) parts.cash += part;
      else parts.stocks += part;
    }
    points.push({ d, v: Math.round(v * 100) / 100 });
  }
  const missing = base.filter((b) => !b.p0).map((b) => b.symbol);
  return { points, parts, missing };
}

function maxDrawdown(points: { v: number }[]): number {
  let peak = 0;
  let worst = 0;
  for (const p of points) {
    peak = Math.max(peak, p.v);
    if (peak > 0) worst = Math.min(worst, p.v / peak - 1);
  }
  return worst;
}

function volatility(points: { v: number }[]): number | null {
  if (points.length < 21) return null;
  const r: number[] = [];
  for (let i = 1; i < points.length; i++) r.push(points[i].v / points[i - 1].v - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(252);
}

export function valueAccounts(rows: PaperRow[], prices: PriceMap) {
  // Trading calendar from VTI (always held or benchmarked).
  const calendar = [...(prices.get('VTI')?.keys() ?? [])].sort();
  const latest = calendar.at(-1) ?? null;
  return rows.map((row) => {
    const start = Number(row.start_value);
    const multiple = Number(row.target_multiple);
    const target = start * multiple;
    const inception = inceptionDay(row.created_at, calendar);
    const base = {
      id: row.id,
      code: row.code,
      name: row.name,
      mine: row.user_id !== null,
      mix: { stocks: row.stocks, bonds: row.bonds, cash: row.cash },
      sleeve: row.sleeve,
      holdings: row.holdings,
      benchmarkHoldings: row.benchmark,
      startValue: start,
      target,
      targetMultiple: multiple,
      horizonYears: row.horizon_years,
      assumptions: row.assumptions,
      version: row.version,
      createdAt: row.created_at,
      inception,
      asOf: latest,
    };
    if (!inception) return { ...base, status: 'pending' as const };
    const days = calendar.filter((d) => d >= inception);
    const acct = valueSeries(row.holdings, prices, days, start);
    const bench = valueSeries(row.benchmark, prices, days, start);
    const value = acct.points.at(-1)!.v;
    const benchValue = bench.points.at(-1)!.v;
    const elapsedYears = (Date.parse(latest!) - Date.parse(inception)) / (365.25 * 864e5);
    const yearsLeft = row.horizon_years - elapsedYears;
    const total = acct.parts.stocks + acct.parts.bonds + acct.parts.cash || 1;
    const stale = row.holdings.filter((h) => !prices.get(h.symbol)?.has(latest!)).map((h) => h.symbol);
    return {
      ...base,
      status: 'live' as const,
      value,
      gain: value - start,
      totalReturn: value / start - 1,
      // Annualizing a few weeks exaggerates; only shown after a full year.
      annualized: elapsedYears >= 1 ? (value / start) ** (1 / elapsedYears) - 1 : null,
      maxDrawdown: maxDrawdown(acct.points),
      volatility: volatility(acct.points),
      benchmarkReturn: benchValue / start - 1,
      vsBenchmark: value / benchValue - 1,
      toTarget: Math.max(0, target - value),
      remainingRequired: yearsLeft > 0 ? (target / value) ** (1 / yearsLeft) - 1 : null,
      requiredAtStart: multiple ** (1 / row.horizon_years) - 1,
      drift: {
        stocks: (acct.parts.stocks / total) * 100,
        bonds: (acct.parts.bonds / total) * 100,
        cash: (acct.parts.cash / total) * 100,
      },
      daysTracked: days.length,
      stale,
      missing: acct.missing,
      series: acct.points,
      benchmarkSeries: bench.points,
    };
  });
}

export const PAPER_STOCK_FUNDS = STOCK_FUNDS;
