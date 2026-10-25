// Point-in-time reconstruction of the 3x score since 2016 and a quarterly-rebalanced backtest vs SPY.
// Inputs: prices/<T>.json (daily, from Yahoo), facts/<T>.json (SEC companyfacts), universe.json.
// Output: track-record.json (consumed by the app). Uses the app's real scoreStock().
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { scoreStock } from '../../src/lib/scoring/model';
import { MODEL_VERSION, computeRiskScore } from '../../src/lib/scoring';
import { BOTS, botPicks } from '../../src/lib/bots';
import type { BotCandidate } from '../../src/lib/bots';

const DIR = process.env.TR_DATA ?? new URL('./data/', import.meta.url).pathname;
const OUT = process.argv[2] ?? DIR + 'track-record.json';
const BOTS_OUT = process.argv[3] ?? DIR + 'bots.json';
type Px = { d: number[]; c: number[]; a: number[]; v: number[] };
type Fact = { start?: string; end: string; val: number; form?: string; filed: string; fy?: number; fp?: string };

const universe: { ticker: string; name: string; sector: string | null; in_sp500: boolean }[] = JSON.parse(readFileSync(DIR + 'universe.json', 'utf8'));
const loadPx = (t: string): Px | null => (existsSync(`${DIR}prices/${t}.json`) ? JSON.parse(readFileSync(`${DIR}prices/${t}.json`, 'utf8')) : null);
const loadFacts = (t: string): Record<string, Record<string, Fact[]>> | null =>
  existsSync(`${DIR}facts/${t}.json`) ? JSON.parse(readFileSync(`${DIR}facts/${t}.json`, 'utf8')) : null;

const day = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A', '10-KT']);

const spy = loadPx('SPY')!;

// Point-in-time S&P 500 membership (github.com/fja05680/sp500, sp500_ticker_start_end.csv), so bots only
// hold a stock while it was actually in the index, not because it joined later after a big run.
const membership = new Map<string, [number, number][]>();
if (existsSync(DIR + 'sp500_ticker_start_end.csv')) {
  for (const line of readFileSync(DIR + 'sp500_ticker_start_end.csv', 'utf8').trim().split('\n').slice(1)) {
    const [t, start, end] = line.split(',');
    const key = t.trim().replace('-', '.');
    const list = membership.get(key) ?? [];
    list.push([day(start), end?.trim() ? day(end.trim()) : Infinity]);
    membership.set(key, list);
  }
}
const memberAt = (ticker: string, d: number) =>
  (membership.get(ticker.replace('-', '.')) ?? []).some(([s, e]) => s <= d && d < e);
if (!membership.size) throw new Error('sp500_ticker_start_end.csv missing: bots need point-in-time membership');
/** Index of the last bar on or before day d. */
function idxAt(p: Px, d: number): number {
  let lo = 0, hi = p.d.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (p.d[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

// ----- price-derived inputs (mirror refresh-stocks) -----
function calcMomentum(closes: number[]): number | null {
  if (closes.length < 20) return null;
  const recent = closes.slice(-20);
  const ma5 = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = recent.reduce((a, b) => a + b, 0) / recent.length;
  const base = closes[Math.max(0, closes.length - 20)];
  const raw = (ma5 / ma20 - 1) * 500 + ((closes[closes.length - 1] - base) / base) * 100;
  return Math.round(50 + 50 * Math.tanh(raw / 80));
}
function calcVolatility(closes: number[]): number | null {
  if (closes.length < 10) return null;
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0) r.push(closes[i] / closes[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.round(Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length) * Math.sqrt(252) * 100);
}
function calcBeta(p: Px, i: number): number | null {
  const si = idxAt(spy, p.d[i]);
  if (i < 252 || si < 252) return null;
  const spyByDay = new Map<number, number>();
  for (let k = si - 260; k <= si; k++) if (k >= 0) spyByDay.set(spy.d[k], spy.a[k]);
  const xs: number[] = [], ys: number[] = [];
  for (let k = i - 251; k <= i; k++) {
    const s0 = spyByDay.get(p.d[k - 1]), s1 = spyByDay.get(p.d[k]);
    if (s0 && s1 && p.a[k - 1] > 0) { xs.push(s1 / s0 - 1); ys.push(p.a[k] / p.a[k - 1] - 1); }
  }
  if (xs.length < 150) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0, vx = 0;
  for (let k = 0; k < xs.length; k++) { cov += (xs[k] - mx) * (ys[k] - my); vx += (xs[k] - mx) ** 2; }
  return vx > 0 ? Math.round((cov / vx) * 100) / 100 : null;
}

// ----- SEC point-in-time helpers -----
function units(f: Record<string, Record<string, Fact[]>>, concept: string, unit = 'USD'): Fact[] {
  return f[concept]?.[unit] ?? [];
}
/** Latest two annual values (FY0, FY1) of a flow concept known by day D. */
function annualPair(entries: Fact[], D: number): [Fact, Fact | null] | null {
  const known = entries.filter((e) => e.start && ANNUAL_FORMS.has(e.form ?? '') && day(e.filed) <= D);
  const byEnd = new Map<string, Fact>();
  for (const e of known) {
    const dur = day(e.end) - day(e.start!);
    if (dur < 330 || dur > 400) continue;
    const cur = byEnd.get(e.end);
    if (!cur || e.filed > cur.filed) byEnd.set(e.end, e);
  }
  const sorted = [...byEnd.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
  if (!sorted.length || day(sorted[0].end) < D - 550) return null; // stale: no annual report in ~18 months
  const fy0 = sorted[0];
  const fy1 = sorted.find((e) => Math.abs(day(fy0.end) - day(e.end) - 365) <= 40) ?? null;
  return [fy0, fy1];
}
/** Latest instant value (balance sheet / shares) known by day D, from any report. */
function latestInstant(entries: Fact[], D: number): number | null {
  let best: Fact | null = null;
  for (const e of entries) {
    if (day(e.filed) > D || day(e.end) < D - 550) continue;
    if (!best || e.end > best.end || (e.end === best.end && e.filed > best.filed)) best = e;
  }
  return best ? best.val : null;
}
const REVENUE = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'];

function fundamentals(f: Record<string, Record<string, Fact[]>>, D: number, price: number) {
  // Revenue: the concept with the most recent annual report.
  let rev: [Fact, Fact | null] | null = null;
  for (const c of REVENUE) {
    const p = annualPair(units(f, c), D);
    if (p && (!rev || p[0].end > rev[0].end)) rev = p;
  }
  const ni = annualPair(units(f, 'NetIncomeLoss'), D);
  const sameYear = (p: [Fact, Fact | null] | null) => (p && rev && p[0].end === rev[0].end ? p[0].val : null);
  const R = rev?.[0].val ?? null;
  const out: Record<string, number | null> = {};
  if (rev && rev[1] && rev[1].val > 0) out.revenue_growth_yoy = Math.round((rev[0].val / rev[1].val - 1) * 1000) / 10;
  if (ni && ni[1] && ni[1].val > 0) out.earnings_growth_yoy = Math.round((ni[0].val / ni[1].val - 1) * 1000) / 10;
  if (R && R > 0) {
    let gp = sameYear(annualPair(units(f, 'GrossProfit'), D));
    if (gp === null) {
      const cogs = sameYear(annualPair(units(f, 'CostOfRevenue'), D)) ?? sameYear(annualPair(units(f, 'CostOfGoodsAndServicesSold'), D));
      if (cogs !== null) gp = R - cogs;
    }
    if (gp !== null) out.gross_margin = Math.round((gp / R) * 10000) / 100;
    const oi = sameYear(annualPair(units(f, 'OperatingIncomeLoss'), D));
    if (oi !== null) out.operating_margin = Math.round((oi / R) * 10000) / 100;
    const n = sameYear(ni);
    if (n !== null) out.profit_margin = Math.round((n / R) * 10000) / 100;
    const rd = sameYear(annualPair(units(f, 'ResearchAndDevelopmentExpense'), D));
    out.rd_ratio = rd !== null ? Math.round((rd / R) * 1000) / 10 : 0;
  }
  const equity = latestInstant(units(f, 'StockholdersEquity'), D);
  const ltd = latestInstant(units(f, 'LongTermDebt'), D) ?? latestInstant(units(f, 'LongTermDebtNoncurrent'), D);
  const cur = latestInstant(units(f, 'DebtCurrent'), D) ?? latestInstant(units(f, 'LongTermDebtCurrent'), D) ?? 0;
  if (equity && equity > 0 && ltd !== null) out.debt_to_equity = Math.round(((ltd + cur) / equity) * 100) / 100;
  const shares = latestInstant(units(f, 'EntityCommonStockSharesOutstanding', 'shares'), D)
    ?? latestInstant(units(f, 'WeightedAverageNumberOfDilutedSharesOutstanding', 'shares'), D);
  if (shares && shares > 0) {
    const mcap = shares * price;
    out.market_cap = mcap;
    if (R && R > 0) out.price_to_sales = Math.round((mcap / R) * 100) / 100;
    const eps = annualPair(units(f, 'EarningsPerShareDiluted', 'USD/shares'), D);
    // Trailing P/E stands in for forward P/E (no historical analyst estimates).
    if (eps && eps[0].val !== 0) {
      const pe = price / eps[0].val;
      out.forward_pe = Math.round(pe * 100) / 100;
      const g = out.earnings_growth_yoy;
      if (pe > 0 && g != null && g > 0) out.peg_ratio = Math.round((pe / g) * 100) / 100;
    }
  }
  return out;
}

// ----- rebalance calendar -----
const lastDay = spy.d[spy.d.length - 1];
const rebal: number[] = [];
for (let y = 2016; ; y++) {
  for (const m of [0, 3, 6, 9]) {
    const target = Math.floor(Date.UTC(y, m, 1) / 86400000);
    if (target > lastDay) break;
    const i = spy.d.findIndex((d) => d >= target);
    if (i >= 0) rebal.push(spy.d[i]);
  }
  if (Math.floor(Date.UTC(y + 1, 0, 1) / 86400000) > lastDay) break;
}
const ends = [...rebal.slice(1), lastDay];

const pxCache = new Map<string, Px | null>();
const factCache = new Map<string, Record<string, Record<string, Fact[]>> | null>();
const px = (t: string) => { if (!pxCache.has(t)) pxCache.set(t, loadPx(t)); return pxCache.get(t)!; };
const facts = (t: string) => { if (!factCache.has(t)) factCache.set(t, loadFacts(t)); return factCache.get(t)!; };

type Pick = { ticker: string; score: number };
const SIZES = [10, 20, 50];
const quarters: { date: string; eligible: number; picks: Pick[]; ret: Record<string, number> }[] = [];
// Monthly marks for equity curves.
const curves: Record<string, { d: string; v: number }[]> = {
  spy: [], universe: [], sp500ew: [], ...Object.fromEntries(SIZES.map((n) => [`top${n}`, []])), ...Object.fromEntries(BOTS.map((b) => [`bot_${b.id}`, []])),
};
const coverage: number[] = [];
const botQuarters: Record<string, { date: string; picks: [string, number, number][]; ret: number; spy: number }[]> = Object.fromEntries(BOTS.map((b) => [b.id, []]));
const level: Record<string, number> = Object.fromEntries(Object.keys(curves).map((k) => [k, 100]));
for (const k of Object.keys(curves)) curves[k].push({ d: iso(rebal[0]), v: 100 });

function growthBetween(t: string, d0: number, d1: number): number | null {
  const p = t === 'SPY' ? spy : px(t);
  if (!p) return null;
  const i0 = idxAt(p, d0), i1 = idxAt(p, d1);
  if (i0 < 0 || i1 < 0 || p.d[i0] < d0 - 7 || !(p.a[i0] > 0)) return null;
  return p.a[i1] / p.a[i0];
}

for (let q = 0; q < rebal.length; q++) {
  const D = rebal[q], E = ends[q];
  const scored: Pick[] = [];
  const cands: BotCandidate[] = [];
  for (const u of universe) {
    const p = px(u.ticker); const f = facts(u.ticker);
    if (!p || !f) continue;
    // Score with information up to the prior session's close; the trade happens at D's close.
    const i = idxAt(p, D - 1);
    if (i < 252 || p.d[i] < D - 7 || idxAt(p, D) < 0 || p.d[idxAt(p, D)] !== D) continue; // year of history, trades on D
    const closes = p.c.slice(i - 62, i + 1);
    const yr = p.c.slice(i - 251, i + 1);
    const stock: Record<string, unknown> = {
      ticker: u.ticker, company_name: u.name, sector: u.sector,
      current_price: p.c[i],
      momentum_score: calcMomentum(closes),
      volatility: calcVolatility(closes),
      beta: calcBeta(p, i),
      fifty_two_week_high: Math.max(...yr), fifty_two_week_low: Math.min(...yr),
      avg_volume: Math.round(p.v.slice(i - 62, i + 1).reduce((a, b) => a + b, 0) / 63),
      target_mean_price: null, pipeline_count: null, cash_runway_months: null, regime_fit_score: null,
      ...fundamentals(f, D - 1, p.c[i]),
    };
    const s = scoreStock(stock as never);
    if (s.availableWeight < 60) continue;
    const inSp500 = memberAt(u.ticker, D);
    // Top N only picks index members on day D. Today's curated growth names (QUBT, IONQ...) are in the
    // universe because they already ran, so picking them before they joined is hindsight.
    if (inSp500) scored.push({ ticker: u.ticker, score: s.total });
    cands.push({ ticker: u.ticker, score: s.total, risk: computeRiskScore(stock as never).score, inSp500 });
  }
  scored.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));

  // Monthly marks inside the holding period.
  const marks: number[] = [];
  for (let m = 1; ; m++) {
    const dt = new Date(D * 86400000); const target = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + m, 1) / 86400000) - 1;
    if (target >= E) break;
    marks.push(spy.d[idxAt(spy, target)]);
  }
  marks.push(E);

  const basket = (tickers: string[], d1: number) => {
    const g = tickers.map((t) => growthBetween(t, D, d1)).filter((x): x is number => x !== null);
    return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 1;
  };
  const botSel = Object.fromEntries(BOTS.map((b) => [b.id, botPicks(b, cands)]));
  // Share of the index's actual members on day D that we could score (the rest later left the index).
  const membersAtD = [...membership.keys()].filter((t) => memberAt(t, D)).length;
  coverage.push(membersAtD ? cands.filter((c) => c.inSp500).length / membersAtD : 0);
  const baskets: Record<string, string[] | 'SPY'> = {
    spy: 'SPY', universe: scored.map((s) => s.ticker), ...Object.fromEntries(SIZES.map((n) => [`top${n}`, scored.slice(0, n).map((s) => s.ticker)])),
    sp500ew: cands.filter((c) => c.inSp500).map((c) => c.ticker),
    ...Object.fromEntries(BOTS.map((b) => [`bot_${b.id}`, botSel[b.id].map((c) => c.ticker)])),
  };
  const start = { ...level };
  const ret: Record<string, number> = {};
  for (const mk of marks) {
    for (const [k, b] of Object.entries(baskets)) {
      const g = b === 'SPY' ? growthBetween('SPY', D, mk) ?? 1 : basket(b, mk);
      level[k] = start[k] * g;
      curves[k].push({ d: iso(mk), v: Math.round(level[k] * 100) / 100 });
    }
  }
  for (const k of Object.keys(baskets)) ret[k] = Math.round((level[k] / start[k] - 1) * 10000) / 100;
  for (const b of BOTS) {
    botQuarters[b.id].push({ date: iso(D), picks: botSel[b.id].map((c) => [c.ticker, c.score, Math.round(c.risk)]), ret: ret[`bot_${b.id}`], spy: ret.spy });
  }
  quarters.push({ date: iso(D), eligible: scored.length, picks: scored.slice(0, 20), ret: Object.fromEntries(Object.entries(ret).filter(([k]) => !k.startsWith('bot_') && k !== 'sp500ew')) });
  console.log(iso(D), 'eligible', scored.length, 'top20', ret.top20, 'spy', ret.spy, 'univ', ret.universe);
}

// ----- stats -----
function stats(series: { d: string; v: number }[]) {
  const v0 = series[0].v, v1 = series[series.length - 1].v;
  const years = (day(series[series.length - 1].d) - day(series[0].d)) / 365.25;
  const monthly: number[] = [];
  for (let i = 1; i < series.length; i++) monthly.push(series[i].v / series[i - 1].v - 1);
  const m = monthly.reduce((a, b) => a + b, 0) / monthly.length;
  const vol = Math.sqrt(monthly.reduce((a, b) => a + (b - m) ** 2, 0) / monthly.length) * Math.sqrt(12);
  let peak = v0, mdd = 0;
  for (const p of series) { peak = Math.max(peak, p.v); mdd = Math.min(mdd, p.v / peak - 1); }
  const cagr = (v1 / v0) ** (1 / years) - 1;
  const yearly: Record<string, number> = {};
  const byYear = new Map<string, number>();
  for (const p of series) byYear.set(p.d.slice(0, 4), p.v);
  let prev = v0;
  for (const [y, v] of byYear) { yearly[y] = Math.round((v / prev - 1) * 1000) / 10; prev = v; }
  return {
    totalReturn: Math.round((v1 / v0 - 1) * 1000) / 10,
    cagr: Math.round(cagr * 1000) / 10,
    volatility: Math.round(vol * 1000) / 10,
    maxDrawdown: Math.round(mdd * 1000) / 10,
    sharpe: vol > 0 ? Math.round((cagr / vol) * 100) / 100 : null,
    endValue: Math.round(v1 * 100) / 100,
    yearly,
  };
}
const allStats = Object.fromEntries(Object.entries(curves).map(([k, s]) => [k, stats(s)]));
const keepForTrackRecord = (k: string) => !k.startsWith('bot_') && k !== 'sp500ew';
const summary = Object.fromEntries(Object.entries(allStats).filter(([k]) => keepForTrackRecord(k)));
const trCurves = Object.fromEntries(Object.entries(curves).filter(([k]) => keepForTrackRecord(k)));
const beatRate = Object.fromEntries(SIZES.map((n) => [`top${n}`, Math.round((quarters.filter((q) => q.ret[`top${n}`] > q.ret.spy).length / quarters.length) * 100)]));

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  modelVersion: MODEL_VERSION,
  start: iso(rebal[0]), end: iso(lastDay),
  universeSize: universe.length,
  rebalance: 'quarterly',
  sizes: SIZES,
  summary, beatRate, curves: trCurves,
  quarters: quarters.map((q) => ({ ...q, picks: q.picks.map((p) => [p.ticker, p.score]) })),
}));
console.log(JSON.stringify({ summary: Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, { total: s.totalReturn, cagr: s.cagr, mdd: s.maxDrawdown, sharpe: s.sharpe }])), beatRate }, null, 1));

// ----- Bots: history + survivorship-adjusted projections -----
// Survivorship haircut: an equal-weight portfolio of point-in-time S&P 500 members (that we still have
// prices for) beat SPY by this much a year; the gap is mostly companies that later left the index and
// are missing from our data. Projections subtract it from bot returns.
const haircut = Math.max(0, Math.log(1 + allStats.sp500ew.cagr / 100) - Math.log(1 + allStats.spy.cagr / 100)); // per year, log
function monthlyLogReturns(series: { d: string; v: number }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) out.push(Math.log(series[i].v / series[i - 1].v));
  return out;
}
// Deterministic PRNG so the published numbers are reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function project(rets: number[], adjust: number) {
  const PATHS = 5000, BLOCK = 3;
  const at = { 60: [] as number[], 120: [] as number[] };
  for (let p = 0; p < PATHS; p++) {
    let lv = 0;
    for (let m = 1; m <= 120; ) {
      const start = Math.floor(rand() * (rets.length - BLOCK));
      for (let k = 0; k < BLOCK && m <= 120; k++, m++) {
        lv += rets[start + k] - adjust / 12;
        if (m === 60) at[60].push(lv);
        if (m === 120) at[120].push(lv);
      }
    }
  }
  const pctl = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return Math.round(10000 * Math.exp(s[Math.floor(q * (s.length - 1))])); };
  const lossOdds = (xs: number[]) => Math.round((xs.filter((x) => x < 0).length / xs.length) * 100);
  return Object.fromEntries(([60, 120] as const).map((m) => [m === 60 ? 'y5' : 'y10', { low: pctl(at[m], 0.1), mid: pctl(at[m], 0.5), high: pctl(at[m], 0.9), lossOdds: lossOdds(at[m]) }]));
}
const spyRets = monthlyLogReturns(curves.spy);
writeFileSync(BOTS_OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  modelVersion: MODEL_VERSION,
  start: iso(rebal[0]), end: iso(lastDay),
  haircutPct: Math.round((Math.exp(haircut) - 1) * 1000) / 10,
  sp500ew: allStats.sp500ew,
  indexCoverage: { avg: Math.round((coverage.reduce((a, b) => a + b, 0) / coverage.length) * 100), first: Math.round(coverage[0] * 100), last: Math.round(coverage[coverage.length - 1] * 100) },
  spy: { summary: allStats.spy, curve: curves.spy, projection: project(spyRets, 0) },
  bots: BOTS.map((b) => ({
    id: b.id,
    summary: allStats[`bot_${b.id}`],
    curve: curves[`bot_${b.id}`],
    beatRate: Math.round((botQuarters[b.id].filter((q) => q.ret > q.spy).length / botQuarters[b.id].length) * 100),
    avgHoldings: Math.round(botQuarters[b.id].reduce((t, q) => t + q.picks.length, 0) / botQuarters[b.id].length),
    projection: project(monthlyLogReturns(curves[`bot_${b.id}`]), haircut),
    quarters: botQuarters[b.id],
  })),
}));
for (const b of BOTS) {
  const st = allStats[`bot_${b.id}`];
  console.log(`BOT ${b.id}: total ${st.totalReturn}% cagr ${st.cagr}% mdd ${st.maxDrawdown}% vol ${st.volatility}% | avg picks ${Math.round(botQuarters[b.id].reduce((t, q) => t + q.picks.length, 0) / botQuarters[b.id].length)}`);
}
