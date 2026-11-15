// Builds public/data/allocations.json: the 8 standard stock/bond/cash mixes (V01-V08) backtested
// month by month since 2016, rebalanced quarterly, plus monthly return series for the goal planner's
// simulation (ladders, the four 3x Bots and SPY). Run fetch.mjs first.
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = new URL('./data/', import.meta.url).pathname;
const OUT = new URL('../../public/data/allocations.json', import.meta.url).pathname;
const bots = JSON.parse(readFileSync(new URL('../../public/data/bots.json', import.meta.url).pathname, 'utf8'));
const load = (t) => new Map(JSON.parse(readFileSync(`${DIR}${t}.json`, 'utf8')));

export const LADDER = [
  { id: 'V01', name: 'Liquidity focused', stocks: 0, bonds: 20, cash: 80 },
  { id: 'V02', name: 'Conservative', stocks: 10, bonds: 70, cash: 20 },
  { id: 'V03', name: 'Conservative growth', stocks: 25, bonds: 65, cash: 10 },
  { id: 'V04', name: 'Moderate', stocks: 40, bonds: 55, cash: 5 },
  { id: 'V05', name: 'Balanced growth', stocks: 60, bonds: 35, cash: 5 },
  { id: 'V06', name: 'Growth', stocks: 75, bonds: 20, cash: 5 },
  { id: 'V07', name: 'Aggressive growth', stocks: 90, bonds: 5, cash: 5 },
  { id: 'V08', name: 'Maximum equity', stocks: 100, bonds: 0, cash: 0 },
];

const px = Object.fromEntries(['VTI', 'VXUS', 'BND', 'VGSH', 'BIL', 'SPY'].map((t) => [t, load(t)]));
// Month-end grid from SPY trading days, starting at the bots' start date, ending at the bots' end
// so every series covers the same months.
const days = [...px.SPY.keys()].filter((d) => d >= bots.start && d <= bots.end);
const grid = [days[0]];
for (let i = 1; i < days.length; i++) {
  if (days[i].slice(0, 7) !== days[i - 1].slice(0, 7)) grid.push(days[i - 1]);
}
if (grid.at(-1) !== days.at(-1)) grid.push(days.at(-1));
const uniq = [...new Set(grid)];

const botAt = (curve, d) => { let v = curve[0].v; for (const p of curve) { if (p.d <= d) v = p.v; else break; } return v; };
const BAL = bots.bots.find((b) => b.id === 'balanced').curve;
const assetVal = (a, d) => (a === 'BOT' ? botAt(BAL, d) : px[a].get(d));

function backtest(weights) {
  const assets = Object.keys(weights).filter((a) => weights[a] > 0);
  let hold = Object.fromEntries(assets.map((a) => [a, weights[a] / 100]));
  const curve = [{ d: uniq[0], v: 100 }];
  const monthly = [];
  for (let i = 1; i < uniq.length; i++) {
    const [p, d] = [uniq[i - 1], uniq[i]];
    let total = 0;
    for (const a of assets) { hold[a] *= assetVal(a, d) / assetVal(a, p); total += hold[a]; }
    const prev = curve.at(-1).v;
    const v = prev * total;
    monthly.push(+(total - 1).toFixed(5));
    curve.push({ d, v: +v.toFixed(2) });
    // Quarterly rebalance back to target.
    if (['03', '06', '09', '12'].includes(d.slice(5, 7))) hold = Object.fromEntries(assets.map((a) => [a, weights[a] / 100]));
    else hold = Object.fromEntries(assets.map((a) => [a, hold[a] / total]));
  }
  return { curve, monthly };
}

function summary(curve) {
  const years = (Date.parse(curve.at(-1).d) - Date.parse(curve[0].d)) / (365.25 * 864e5);
  const end = curve.at(-1).v / curve[0].v;
  let peak = 0, worst = 0;
  for (const p of curve) { peak = Math.max(peak, p.v); worst = Math.min(worst, p.v / peak - 1); }
  return { cagr: +((end ** (1 / years) - 1) * 100).toFixed(1), totalReturn: +((end - 1) * 100).toFixed(1), maxDrawdown: +(worst * 100).toFixed(1) };
}

const stockSleeve = (pct, threeX) => threeX
  ? { VTI: pct * 0.4, VXUS: pct * 0.3, BOT: pct * 0.3 }
  : { VTI: pct * 0.7, VXUS: pct * 0.3 };

const ladder = LADDER.map((l) => {
  const base = { VGSH: l.bonds / 2, BND: l.bonds / 2, BIL: l.cash };
  const threeX = backtest({ ...base, ...stockSleeve(l.stocks, true) });
  const market = backtest({ ...base, ...stockSleeve(l.stocks, false) });
  return { ...l, summary: summary(threeX.curve), benchmark: summary(market.curve), curve: threeX.curve, monthly: threeX.monthly, benchmarkMonthly: market.monthly };
});

const series = (curve) => { const out = []; for (let i = 1; i < uniq.length; i++) out.push(+(botAt(curve, uniq[i]) / botAt(curve, uniq[i - 1]) - 1).toFixed(5)); return out; };
const botSeries = bots.bots.map((b) => ({ id: b.id, summary: { cagr: b.summary.cagr, totalReturn: b.summary.totalReturn, maxDrawdown: b.summary.maxDrawdown }, monthly: series(b.curve) }));
const spyCurve = uniq.map((d) => ({ d, v: px.SPY.get(d) }));
const spy = { summary: summary(spyCurve), monthly: series(spyCurve) };

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), start: uniq[0], end: uniq.at(-1), months: uniq.length - 1, sleeve: '40% VTI, 30% VXUS, 30% Balanced Bot picks; bonds split VGSH/BND; cash BIL; rebalanced quarterly', ladder, bots: botSeries, spy }));
for (const l of ladder) console.log(l.id, l.name.padEnd(20), '3x', l.summary, 'mkt', l.benchmark);
for (const b of botSeries) console.log(b.id, b.summary);
console.log('spy', spy.summary, uniq.length);
