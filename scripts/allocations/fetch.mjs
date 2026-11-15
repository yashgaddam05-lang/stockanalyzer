// Fetches adjusted daily closes for the allocation-ladder ETFs from Yahoo into data/ (gitignored).
import { mkdirSync, writeFileSync } from 'node:fs';
const DIR = new URL('./data/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const TICKERS = ['VTI', 'VXUS', 'BND', 'VGSH', 'BIL', 'SGOV', 'SPY'];
const P1 = Math.floor(Date.UTC(2015, 11, 1) / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const t of TICKERS) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?period1=${P1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const j = await r.json();
  const res = j.chart.result[0];
  const adj = res.indicators.adjclose[0].adjclose;
  const out = [];
  res.timestamp.forEach((ts, k) => { if (adj[k] != null) out.push([new Date(ts * 1000).toISOString().slice(0, 10), adj[k]]); });
  writeFileSync(`${DIR}${t}.json`, JSON.stringify(out));
  console.log(t, out.length, out[0], out.at(-1));
  await sleep(800);
}
