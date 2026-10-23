/**
 * Self-check for the holdings importer on one realistic export per brokerage layout.
 * Run: node_modules/.bin/esbuild src/lib/portfolio-import/selfcheck.ts --bundle --platform=node --format=esm
 *      --outfile=/tmp/import-check.mjs && node /tmp/import-check.mjs
 * Throws on the first failure; prints one line per case otherwise.
 */
import { cleanTicker, parseDate, parseHoldings, parseNumber } from './parse.js';
import type { ParseResult } from './parse.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`Import self-check failed: ${msg}`);
}

const pick = (r: ParseResult, t: string) => r.holdings.find((h) => h.ticker === t);

// Fidelity: title lines and a cash core position before data, $ and commas in values, totals footer.
const FIDELITY = `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Average Cost Basis,Type
Z12345678,Individual,SPAXX**,HELD IN MONEY MARKET,,,"$1,204.55",,,Cash
Z12345678,Individual,AAPL,APPLE INC,25,$231.10,"$5,777.50","$3,750.00",$150.00,Cash
Z12345678,Individual,NVDA,NVIDIA CORPORATION,40.5,$140.12,"$5,674.86","$2,025.00",$50.00,Margin
Z12345678,Individual, -AAPL251121C250,AAPL NOV 21 2025 250 CALL,1,$2.10,$210.00,$150.00,$1.50,Margin
,,,,,,,,,
"The data and information in this spreadsheet is provided to you solely for your use..."`;

// Schwab: two title lines, "Qty (Quantity)", "Cost Basis" total only, cash and total rows.
const SCHWAB = `"Positions for account Individual ...123 as of 03:15 PM ET, 2026/10/22"
""
"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Security Type"
"MSFT","MICROSOFT CORP","10","$420.00","$4,200.00","$3,000.00","Equity"
"BRK/B","BERKSHIRE HATHAWAY INC CLASS B","4","$470.00","$1,880.00","$1,600.00","Equity"
"Cash & Cash Investments","--","--","--","$512.10","--","Cash and Money Market"
"Account Total","--","--","--","$6,592.10","$4,600.00","--"`;

// Robinhood activity, newest first: buy 10 @100, buy 10 @120, sell 5, dividend, full round trip on TSLA.
const ROBINHOOD = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"10/20/2026","10/20/2026","10/21/2026","AMD","AMD Inc","Sell","5","$150.00","$750.00"
"10/15/2026","10/15/2026","10/15/2026","AMD","Cash Div: R/D 2026-10-10","CDIV","","","$1.20"
"9/10/2026","9/10/2026","9/11/2026","AMD","AMD Inc","Buy","10","$120.00","($1,200.00)"
"8/04/2026","8/04/2026","8/05/2026","TSLA","Tesla","Sell","2","$250.00","$500.00"
"8/01/2026","8/01/2026","8/02/2026","TSLA","Tesla","Buy","2","$240.00","($480.00)"
"7/01/2026","7/01/2026","7/02/2026","AMD","AMD Inc","Buy","10","$100.00","($1,000.00)"
"","","","","The data provided is for informational purposes only.","","","",""`;

const PASTED = `AAPL 10 150
googl, 3, 140.25
not a holding line
NVDA 5`;

const TAB = 'Ticker\tShares\tAvg Price\tPurchase Date\nVOO\t2\t480.00\t2026-01-15\nQQQ\t1.5\t\t';

export function runImportSelfCheck(): string[] {
  const out: string[] = [];

  assert(parseNumber('$1,234.50') === 1234.5, 'money with $ and commas');
  assert(parseNumber('(12.5)') === -12.5, 'parentheses are negative');
  assert(parseNumber('--') === null && parseNumber('') === null, 'placeholders are null');
  assert(parseDate('9/10/2026') === '2026-09-10' && parseDate('2026-01-15') === '2026-01-15', 'dates');
  assert(parseDate('2/30/2026') === null, 'impossible date rejected');
  assert(cleanTicker('BRK/B') === 'BRK.B' && cleanTicker(' nvda ') === 'NVDA', 'ticker cleanup');
  assert(cleanTicker('SPAXX**') === null && cleanTicker('-AAPL251121C250') === null, 'cash and options rejected');
  out.push('values: ok');

  const f = parseHoldings(FIDELITY);
  assert(f.format === 'positions', 'fidelity format');
  assert(f.holdings.length === 2, `fidelity holdings ${f.holdings.length}`);
  assert(pick(f, 'AAPL')?.cost_basis === 150 && pick(f, 'NVDA')?.shares === 40.5, 'fidelity values');
  assert(f.skipped.some((s) => /cash/i.test(s.reason)) && f.skipped.some((s) => /option/i.test(s.reason)), 'fidelity skips');
  out.push(`fidelity: ${f.holdings.length} holdings, ${f.skipped.length} skipped`);

  const s = parseHoldings(SCHWAB);
  assert(s.holdings.length === 2, `schwab holdings ${s.holdings.length}`);
  assert(pick(s, 'MSFT')?.cost_basis === 300, 'schwab cost from total / qty');
  assert(pick(s, 'BRK.B')?.cost_basis === 400, 'schwab BRK/B');
  assert(s.skipped.length === 2, `schwab skipped ${s.skipped.length}`);
  out.push(`schwab: ${s.holdings.length} holdings, ${s.skipped.length} skipped`);

  const r = parseHoldings(ROBINHOOD);
  assert(r.format === 'robinhood-activity', 'robinhood format');
  assert(r.holdings.length === 1, `robinhood holdings ${r.holdings.length} (TSLA fully sold)`);
  const amd = pick(r, 'AMD');
  // 10 @100 + 10 @120 = 20 sh, $2,200, avg 110; sell 5 at avg cost -> 15 sh @ 110.
  assert(amd?.shares === 15 && amd.cost_basis === 110, `robinhood AMD ${JSON.stringify(amd)}`);
  assert(amd?.opened_at === '2026-07-01', 'robinhood first buy date');
  out.push(`robinhood: AMD 15 sh @ $110 (avg cost), TSLA closed out`);

  const p = parseHoldings(PASTED);
  assert(p.format === 'pasted' && p.holdings.length === 3, `pasted ${p.holdings.length}`);
  assert(pick(p, 'GOOGL')?.cost_basis === 140.25 && pick(p, 'NVDA')?.cost_basis === null, 'pasted costs');
  assert(p.skipped.length === 1, 'pasted skip');
  out.push(`pasted: ${p.holdings.length} holdings, ${p.skipped.length} skipped`);

  const t = parseHoldings(TAB);
  assert(t.holdings.length === 2 && pick(t, 'VOO')?.opened_at === '2026-01-15', 'tab-separated');
  out.push(`tab-separated: ${t.holdings.length} holdings`);
  return out;
}

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('import-check')) {
  for (const line of runImportSelfCheck()) console.log(line);
  console.log('import self-check passed');
}
