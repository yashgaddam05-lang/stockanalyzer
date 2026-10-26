// Does Smart Money predict next-quarter returns? Signal-only test, before any model change.
// Same rules as scripts/track-record: quarterly rebalance on the first trading day of Jan/Apr/Jul/Oct,
// point-in-time S&P 500 members only (the fair test), signal known strictly before the rebalance day.
// The "all health care" rows include today's curated biotech names and carry hindsight bias.
// Usage: npx tsx --tsconfig tsconfig.app.json scripts/smart-money/backtest.ts [out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { HEALTH, smartAt, csuiteBuysAt, insiderDataEnd } from './signal';

const TR = process.env.TR_DATA ?? new URL('../track-record/data/', import.meta.url).pathname;
type Px = { d: number[]; a: number[] };
const day = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const universe: { ticker: string; sector: string | null }[] = JSON.parse(readFileSync(TR + 'universe.json', 'utf8'));
const px = new Map<string, Px>();
for (const u of [...universe, { ticker: 'SPY' }]) {
  const f = `${TR}prices/${u.ticker}.json`;
  if (existsSync(f)) px.set(u.ticker, JSON.parse(readFileSync(f, 'utf8')));
}
const membership = new Map<string, [number, number][]>();
for (const line of readFileSync(TR + 'sp500_ticker_start_end.csv', 'utf8').trim().split('\n').slice(1)) {
  const [t, start, end] = line.split(',');
  const key = t.trim().replace('-', '.');
  membership.set(key, [...(membership.get(key) ?? []), [day(start), end?.trim() ? day(end.trim()) : Infinity]]);
}
const memberAt = (t: string, d: number) => (membership.get(t.replace('-', '.')) ?? []).some(([s, e]) => s <= d && d < e);
function idxAt(p: Px, d: number): number {
  let lo = 0, hi = p.d.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (p.d[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function ret(t: string, d0: number, d1: number): number | null {
  const p = px.get(t);
  if (!p) return null;
  const i0 = idxAt(p, d0), i1 = idxAt(p, d1);
  if (i0 < 0 || p.d[i0] !== d0 || i1 <= i0 || !(p.a[i0] > 0)) return null;
  return p.a[i1] / p.a[i0] - 1;
}

const spy = px.get('SPY')!;
const lastDay = spy.d[spy.d.length - 1];
const rebal: number[] = [];
for (let y = 2016; y <= 2026; y++) for (const m of [0, 3, 6, 9]) {
  const target = Math.floor(Date.UTC(y, m, 1) / 86400000);
  const i = spy.d.findIndex((d) => d >= target);
  if (i >= 0 && target <= lastDay) rebal.push(spy.d[i]);
}
const ends = [...rebal.slice(1), lastDay];

type Obs = { t: string; q: number; r: number; holders: number; delta: number; buy: boolean; sp: boolean; health: boolean };
const obs: Obs[] = [];
rebal.forEach((D, q) => {
  const sm = smartAt(D);
  for (const u of universe) {
    const r = ret(u.ticker, D, ends[q]);
    if (r === null) continue;
    const s = sm.get(u.ticker);
    obs.push({
      t: u.ticker, q, r,
      holders: s?.holders ?? 0,
      delta: (s?.holders ?? 0) - (s?.prev ?? 0),
      buy: D <= insiderDataEnd + 1 && csuiteBuysAt(u.ticker, D).n > 0,
      sp: memberAt(u.ticker, D),
      health: HEALTH.has(u.sector ?? ''),
    });
  }
});

/** Equal-weight quarterly return of group A minus group B, quarters where both are non-empty. */
function spread(rows: Obs[], a: (o: Obs) => boolean, b: (o: Obs) => boolean) {
  const diffs: number[] = [], ra: number[] = [], rb: number[] = [];
  let na = 0, nb = 0;
  for (let q = 0; q < rebal.length; q++) {
    const A = rows.filter((o) => o.q === q && a(o)), B = rows.filter((o) => o.q === q && b(o));
    if (!A.length || !B.length) continue;
    const ma = A.reduce((s, o) => s + o.r, 0) / A.length, mb = B.reduce((s, o) => s + o.r, 0) / B.length;
    diffs.push(ma - mb); ra.push(ma); rb.push(mb); na += A.length; nb += B.length;
  }
  const n = diffs.length;
  const m = diffs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  const ann = (xs: number[]) => Math.round(((xs.reduce((p, x) => p * (1 + x), 1)) ** (4 / xs.length) - 1) * 1000) / 10;
  return {
    quarters: n,
    avgNamesA: n ? Math.round((na / n) * 10) / 10 : 0,
    avgNamesB: n ? Math.round((nb / n) * 10) / 10 : 0,
    annA: n ? ann(ra) : null,
    annB: n ? ann(rb) : null,
    spreadPerQuarter: Math.round(m * 10000) / 100,
    tStat: sd > 0 ? Math.round((m / (sd / Math.sqrt(n))) * 100) / 100 : null,
    hitRate: Math.round((diffs.filter((x) => x > 0).length / n) * 100),
  };
}

/** Per-quarter tercile split by holders (ties broken by ticker), returns top vs bottom tercile. */
function terciles(rows: Obs[]) {
  const tag = new Map<Obs, 'top' | 'bottom' | 'mid'>();
  for (let q = 0; q < rebal.length; q++) {
    const qs = rows.filter((o) => o.q === q).sort((a, b) => a.holders - b.holders || a.t.localeCompare(b.t));
    const k = Math.floor(qs.length / 3);
    qs.forEach((o, i) => tag.set(o, i < k ? 'bottom' : i >= qs.length - k ? 'top' : 'mid'));
  }
  return spread(rows, (o) => tag.get(o) === 'top', (o) => tag.get(o) === 'bottom');
}

const hcSp = obs.filter((o) => o.health && o.sp);
const hcAll = obs.filter((o) => o.health);
const spAll = obs.filter((o) => o.sp);
const result = {
  generatedAt: new Date().toISOString(),
  start: iso(rebal[0]), end: iso(lastDay), quarters: rebal.length,
  insiderDataEnd: iso(insiderDataEnd),
  fair: {
    'health care S&P members: most-owned third vs least-owned third': terciles(hcSp),
    'health care S&P members: 3+ specialist holders vs 0': spread(hcSp, (o) => o.holders >= 3, (o) => o.holders === 0),
    'health care S&P members: holders rose vs fell q/q': spread(hcSp, (o) => o.delta > 0, (o) => o.delta < 0),
    'all S&P members: C-suite buy in last 90d vs none': spread(spAll, (o) => o.buy, (o) => !o.buy),
    'health care S&P members: C-suite buy vs none': spread(hcSp, (o) => o.buy, (o) => !o.buy),
  },
  hindsightBiased: {
    'all health care incl. curated biotech: most-owned third vs least-owned third': terciles(hcAll),
    'all health care incl. curated biotech: 3+ holders vs 0': spread(hcAll, (o) => o.holders >= 3, (o) => o.holders === 0),
  },
};
console.log(JSON.stringify(result, null, 1));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
