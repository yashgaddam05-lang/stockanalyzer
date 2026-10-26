// Open-market insider purchases (Form 4, code P) for the app universe since 2015, from SEC's quarterly
// Insider Transactions Data Sets (~14 MB zip each). Output (gitignored): data/insider-buys.json
// rows: [ticker, filed, transDate, value, csuite(0/1), owner]. Needs `unzip` on PATH.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = new URL('./data/', import.meta.url).pathname;
const TR = new URL('../track-record/data/', import.meta.url).pathname;
const UA = '3xHunter research app yashgaddam05@gmail.com';
mkdirSync(DIR + 'form345', { recursive: true });
const universe = JSON.parse(readFileSync(TR + 'universe.json', 'utf8'));
const map = await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } })).json();
const cikToTicker = new Map();
const byTicker = new Map(Object.values(map).map((r) => [r.ticker.toUpperCase().replace('-', '.'), String(r.cik_str)]));
for (const u of universe) { const c = byTicker.get(u.ticker) ?? byTicker.get(u.ticker.replace('.', '-')); if (c) cikToTicker.set(c, u.ticker); }

// C-suite: chief officers, CEO/CFO/COO/CMO/CSO..., president, executive chair (CSUITE in src/lib/smart-money.ts).
export const CSUITE = /\bchief\b|\bc[a-z]o\b|president|exec(utive)? chair/i;

function tsv(zip, name) {
  const text = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30 }).toString('utf8');
  const lines = text.split('\n');
  const head = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).filter(Boolean).map((l) => { const c = l.split('\t'); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}

const rows = [];
for (let y = 2015; y <= 2026; y++) for (let q = 1; q <= 4; q++) {
  const zip = `${DIR}form345/${y}q${q}.zip`;
  if (!existsSync(zip)) {
    const r = await fetch(`https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/${y}q${q}_form345.zip`, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log('skip', y, q, r.status); continue; }
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    await new Promise((x) => setTimeout(x, 500));
  }
  const subs = new Map();
  for (const s of tsv(zip, 'SUBMISSION.tsv')) {
    const t = cikToTicker.get(String(Number(s.ISSUERCIK)));
    if (t && /^4/.test(s.DOCUMENT_TYPE)) subs.set(s.ACCESSION_NUMBER, { t, filed: s.FILING_DATE });
  }
  const owners = new Map();
  for (const o of tsv(zip, 'REPORTINGOWNER.tsv')) {
    if (!subs.has(o.ACCESSION_NUMBER)) continue;
    const prev = owners.get(o.ACCESSION_NUMBER);
    const cs = CSUITE.test(o.RPTOWNER_TITLE ?? '') ? 1 : 0;
    owners.set(o.ACCESSION_NUMBER, { name: prev ? prev.name : o.RPTOWNERNAME, cs: Math.max(prev?.cs ?? 0, cs) });
  }
  const iso = (d) => { const m = (d ?? '').match(/(\d{2})-([A-Z]{3})-(\d{4})/i); if (!m) return d; const mo = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.indexOf(m[2].toUpperCase()) / 3 + 1; return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1]}`; };
  let n = 0;
  for (const tr of tsv(zip, 'NONDERIV_TRANS.tsv')) {
    const s = subs.get(tr.ACCESSION_NUMBER);
    if (!s || tr.TRANS_CODE !== 'P' || tr.TRANS_ACQUIRED_DISP_CD !== 'A') continue;
    const value = Number(tr.TRANS_SHARES) * Number(tr.TRANS_PRICEPERSHARE);
    if (!(value > 0)) continue;
    const o = owners.get(tr.ACCESSION_NUMBER);
    rows.push([s.t, iso(s.filed), iso(tr.TRANS_DATE), Math.round(value), o?.cs ?? 0, o?.name ?? '']);
    n++;
  }
  console.log(y, q, 'buys', n);
}
writeFileSync(DIR + 'insider-buys.json', JSON.stringify(rows));
console.log('total', rows.length);
