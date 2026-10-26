// Downloads every 13F-HR info table filed by the specialist managers in managers.json since 2015,
// then maps CUSIPs to tickers with OpenFIGI. Output (gitignored): data/filings.json, data/cusips.json.
// Usage: node scripts/smart-money/fetch-13f.mjs   (resumable: cached filings are skipped)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const DIR = new URL('./data/', import.meta.url).pathname;
const UA = '3xHunter research app yashgaddam05@gmail.com';
const SINCE = '2015-01-01';
mkdirSync(DIR + 'infotables', { recursive: true });
const managers = JSON.parse(readFileSync(new URL('./managers.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = 0;
async function sec(url, asJson = true) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + 140 - Date.now(); // ~7 req/s, under SEC's 10/s
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
    if (r.status === 404) return null;
    if (r.ok) return asJson ? r.json() : r.text();
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`SEC failed: ${url}`);
}

function parseInfoTable(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const t = m[1];
    const get = (name) => t.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</`))?.[1]?.trim() ?? null;
    if (get('putCall')) continue; // options are not ownership
    const type = get('sshPrnamtType');
    if (type && type.toUpperCase() !== 'SH') continue; // bonds (PRN)
    // Some filers write CUSIPs as numbers and drop leading zeros (031162100 -> 31162100).
    const cusip = get('cusip')?.toUpperCase().padStart(9, '0');
    const shares = Number(get('sshPrnamt')?.replace(/,/g, ''));
    if (!cusip || !Number.isFinite(shares) || shares <= 0) continue;
    rows.push([cusip, shares, get('nameOfIssuer') ?? '']);
  }
  return rows;
}

// ---- 1. filing list per CIK ----
const filings = [];
for (const mgr of managers) {
  for (const cik of mgr.ciks) {
    const pad = cik.padStart(10, '0');
    const sub = await sec(`https://data.sec.gov/submissions/CIK${pad}.json`);
    const pages = [sub.filings.recent];
    for (const f of sub.filings.files ?? []) pages.push(await sec(`https://data.sec.gov/submissions/${f.name}`));
    for (const p of pages) {
      p.form.forEach((form, i) => {
        if (form !== '13F-HR' || p.filingDate[i] < SINCE) return;
        filings.push({ manager: mgr.id, cik, accession: p.accessionNumber[i], filed: p.filingDate[i], period: p.reportDate[i] });
      });
    }
  }
  console.log(mgr.id, filings.filter((f) => f.manager === mgr.id).length);
}

// ---- 2. info tables ----
const names = {};
let n = 0;
for (const f of filings) {
  const cache = `${DIR}infotables/${f.accession}.json`;
  if (!existsSync(cache)) {
    const base = `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, '')}`;
    const idx = await sec(`${base}/index.json`);
    const xmls = (idx?.directory?.item ?? []).filter((it) => /\.xml$/i.test(it.name) && !/primary_doc/i.test(it.name));
    xmls.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
    let rows = [];
    for (const x of xmls) {
      const text = await sec(`${base}/${x.name}`, false);
      if (text && /infoTable/i.test(text)) { rows = parseInfoTable(text); break; }
    }
    writeFileSync(cache, JSON.stringify(rows));
  }
  const rows = JSON.parse(readFileSync(cache, 'utf8')).map(([c, s, nm]) => [c.padStart(9, '0'), s, nm]);
  f.holdings = {};
  for (const [c, s] of rows) f.holdings[c] = (f.holdings[c] ?? 0) + s;
  for (const [c, , nm] of rows) names[c] ??= nm;
  if (++n % 100 === 0) console.log(`infotables ${n}/${filings.length}`);
}
writeFileSync(DIR + 'filings.json', JSON.stringify(filings));

// ---- 3. CUSIP -> ticker (OpenFIGI, US composite listing, common/ADR) ----
const mapFile = DIR + 'cusips.json';
const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
const todo = Object.keys(names).filter((c) => !(c in map));
console.log('cusips to map', todo.length);
for (let i = 0; i < todo.length; i += 10) {
  const batch = todo.slice(i, i + 10);
  let res;
  for (;;) {
    const r = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((c) => ({ idType: 'ID_CUSIP', idValue: c, exchCode: 'US' }))),
    });
    if (r.status === 429) { await sleep(15_000); continue; }
    res = await r.json();
    break;
  }
  batch.forEach((c, k) => {
    const hit = res[k]?.data?.[0];
    map[c] = hit?.ticker ? hit.ticker.replace('/', '.').toUpperCase() : null;
  });
  writeFileSync(mapFile, JSON.stringify(map));
  await sleep(2500); // 25 requests/min without an API key
  if ((i / 10) % 25 === 0) console.log(`openfigi ${i}/${todo.length}`);
}
console.log('done', filings.length, 'filings', Object.keys(map).length, 'cusips');
