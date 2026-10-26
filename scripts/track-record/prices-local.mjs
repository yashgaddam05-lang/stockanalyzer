// Fallback for backfill.mjs step 1 when the history-backfill edge function is retired:
// fetches daily prices straight from Yahoo, gently (Yahoo rate-limits bursts from one machine).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const DIR = new URL('./data/', import.meta.url).pathname;
mkdirSync(DIR + 'prices', { recursive: true });
const universe = JSON.parse(readFileSync(DIR + 'universe.json', 'utf8'));
const tickers = [...universe.map((s) => s.ticker), 'SPY'].filter((t) => !existsSync(`${DIR}prices/${t}.json`));
const P1 = Math.floor(Date.UTC(2014, 5, 1) / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failed = [];
for (const [i, t] of tickers.entries()) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.replace('.', '-'))}?period1=${P1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  let row = null;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status === 429) { await sleep(30_000); continue; }
    const j = await r.json().catch(() => null);
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp) break;
    const q = res.indicators.quote[0], adj = res.indicators.adjclose?.[0]?.adjclose ?? q.close;
    const out = { ticker: t, d: [], c: [], a: [], v: [] };
    res.timestamp.forEach((ts, k) => {
      if (q.close[k] == null || adj[k] == null) return;
      out.d.push(Math.floor(ts / 86400)); out.c.push(q.close[k]); out.a.push(adj[k]); out.v.push(q.volume[k] ?? 0);
    });
    row = out;
  }
  if (row?.d.length) writeFileSync(`${DIR}prices/${t}.json`, JSON.stringify(row));
  else failed.push(t);
  if (i % 50 === 0) console.log(`prices ${i}/${tickers.length}`);
  await sleep(400);
}
console.log('price failures', failed.length, failed.join(' '));
