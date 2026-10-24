// One-off: download 10y daily prices (via temporary Supabase edge function) and SEC companyfacts.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const DIR = new URL('./data/', import.meta.url).pathname;
const SITE = 'https://stockanalyzer-bolot1.vercel.app';
const FN = 'https://irbwaucilrznbqynhtmr.supabase.co/functions/v1/history-backfill';
const SEC_UA = '3xHunter research app (contact: site owner)';
mkdirSync(DIR + 'prices', { recursive: true });
mkdirSync(DIR + 'facts', { recursive: true });

const stocks = await (await fetch(`${SITE}/api/stocks`)).json();
writeFileSync(DIR + 'universe.json', JSON.stringify(stocks.map((s) => ({ ticker: s.ticker, name: s.company_name, sector: s.sector, in_sp500: s.in_sp500 }))));
// Public anon key, read from the deployed bundle (same key every visitor's browser has).
const html = await (await fetch(SITE + '/login')).text();
const js = await (await fetch(SITE + html.match(/\/assets\/index-[\w-]+\.js/)[0])).text();
const anon = [...js.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)].map((m) => m[0]).find((k) => Buffer.from(k.split('.')[1], 'base64url').toString().includes('"anon"'));
if (!anon) throw new Error('anon key not found');

const tickers = [...stocks.map((s) => s.ticker), 'SPY'].filter((t) => !existsSync(`${DIR}prices/${t}.json`));
console.log('prices to fetch', tickers.length);
const batches = [];
for (let i = 0; i < tickers.length; i += 20) batches.push(tickers.slice(i, i + 20));
let done = 0, failed = [];
async function worker() {
  while (batches.length) {
    const b = batches.shift();
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon }, body: JSON.stringify({ tickers: b.map((t) => t.replace('.', '-')) }) });
      const rows = await r.json();
      for (const row of rows) {
        const t = b.find((x) => x.replace('.', '-') === row.ticker) ?? row.ticker;
        if (row.error || !row.d?.length) failed.push(`${t}:${row.error ?? 'empty'}`);
        else writeFileSync(`${DIR}prices/${t}.json`, JSON.stringify(row));
      }
    } catch (e) { failed.push(...b.map((t) => `${t}:${e}`)); }
    done += b.length; console.log(`prices ${done}/${tickers.length}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log('price failures', failed.length, failed.slice(0, 30).join(' '));

// SEC companyfacts, trimmed to the concepts the model needs.
const KEEP = new Set(['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax','NetIncomeLoss','GrossProfit','CostOfRevenue','CostOfGoodsAndServicesSold','OperatingIncomeLoss','ResearchAndDevelopmentExpense','StockholdersEquity','LongTermDebt','LongTermDebtNoncurrent','DebtCurrent','LongTermDebtCurrent','CashAndCashEquivalentsAtCarryingValue','EarningsPerShareDiluted','WeightedAverageNumberOfDilutedSharesOutstanding','EntityCommonStockSharesOutstanding','NetCashProvidedByUsedInOperatingActivities']);
const map = await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } })).json();
const cik = new Map(Object.values(map).map((r) => [r.ticker.toUpperCase(), String(r.cik_str).padStart(10, '0')]));
const secTodo = stocks.map((s) => s.ticker).filter((t) => !existsSync(`${DIR}facts/${t}.json`));
let secFail = [];
for (const [i, t] of secTodo.entries()) {
  const c = cik.get(t) ?? cik.get(t.replace('.', '-'));
  if (!c) { secFail.push(`${t}:nocik`); continue; }
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c}.json`, { headers: { 'User-Agent': SEC_UA } });
  if (!r.ok) { secFail.push(`${t}:${r.status}`); await new Promise((x) => setTimeout(x, 200)); continue; }
  const j = await r.json();
  const out = {};
  for (const ns of ['us-gaap', 'dei', 'ifrs-full']) for (const [k, v] of Object.entries(j.facts?.[ns] ?? {})) if (KEEP.has(k)) out[k] = v.units;
  writeFileSync(`${DIR}facts/${t}.json`, JSON.stringify(out));
  if (i % 50 === 0) console.log(`sec ${i}/${secTodo.length}`);
  await new Promise((x) => setTimeout(x, 140));
}
console.log('sec failures', secFail.length, secFail.slice(0, 40).join(' '));
