// Point-in-time Smart Money signal from the files fetch-13f.mjs and fetch-insiders.mjs write.
// A 13F holding counts only from its SEC filing date (not quarter end), so day D never sees a
// report that was not public before D. Same for Form 4 buys (filing date, not trade date).
import { readFileSync, existsSync } from 'node:fs';

const DIR = process.env.SM_DATA ?? new URL('./data/', import.meta.url).pathname;
const day = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);

/** A manager's latest report must be this recent at D (normal age is 45 to 135 days). */
const STALE_DAYS = 200;
const CHANGE = 0.1;
export const INSIDER_WINDOW = 90;
const MIN_BUY = 25_000; // MIN_INSIDER_BUY_USD in src/lib/smart-money.ts
export const HEALTH = new Set(['Health Care', 'Healthcare', 'Biotech']);

type Filing = { manager: string; cik: string; accession: string; filed: string; period: string; holdings: Record<string, number> };
type Report = { cik: string; period: number; filed: number; pos: Map<string, number> };

if (!existsSync(DIR + 'filings.json')) throw new Error('run scripts/smart-money/fetch-13f.mjs first');
const filings: Filing[] = JSON.parse(readFileSync(DIR + 'filings.json', 'utf8'));
const cusips: Record<string, string | null> = JSON.parse(readFileSync(DIR + 'cusips.json', 'utf8'));
const buys: [string, string, string, number, number, string][] = existsSync(DIR + 'insider-buys.json')
  ? JSON.parse(readFileSync(DIR + 'insider-buys.json', 'utf8')) : [];

// Earliest original 13F-HR per (cik, period); positions keyed by ticker (share classes summed).
const byManager = new Map<string, Report[]>();
const seen = new Set<string>();
for (const f of [...filings].sort((a, b) => a.filed.localeCompare(b.filed))) {
  const key = `${f.cik}|${f.period}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const pos = new Map<string, number>();
  for (const [c, n] of Object.entries(f.holdings)) {
    const t = cusips[c];
    if (t) pos.set(t, (pos.get(t) ?? 0) + n);
  }
  const list = byManager.get(f.manager) ?? [];
  list.push({ cik: f.cik, period: day(f.period), filed: day(f.filed), pos });
  byManager.set(f.manager, list);
}
export const managerCount = byManager.size;

export type Smart = { holders: number; prev: number; fresh: number; exited: number; added: number; trimmed: number; managers: number };
const cache = new Map<number, Map<string, Smart>>();

/** Specialist ownership of every ticker as known before day D. */
export function smartAt(D: number): Map<string, Smart> {
  const hit = cache.get(D);
  if (hit) return hit;
  const out = new Map<string, Smart>();
  const get = (t: string) => {
    let s = out.get(t);
    if (!s) out.set(t, (s = { holders: 0, prev: 0, fresh: 0, exited: 0, added: 0, trimmed: 0, managers: 0 }));
    return s;
  };
  let active = 0;
  for (const reports of byManager.values()) {
    const known = reports.filter((r) => r.filed < D);
    if (!known.length) continue;
    const periods = [...new Set(known.map((r) => r.period))].sort((a, b) => a - b);
    const p1 = periods[periods.length - 1];
    if (D - p1 > STALE_DAYS) continue;
    active++;
    const sum = (p: number) => {
      const m = new Map<string, number>();
      for (const r of known) if (r.period === p) for (const [t, n] of r.pos) m.set(t, (m.get(t) ?? 0) + n);
      return m;
    };
    const p0 = periods.length > 1 && p1 - periods[periods.length - 2] <= 100 ? periods[periods.length - 2] : null;
    const now = sum(p1);
    const before = p0 === null ? null : sum(p0);
    for (const t of new Set([...now.keys(), ...(before?.keys() ?? [])])) {
      const s1 = now.get(t) ?? 0, s0 = before ? before.get(t) ?? 0 : null;
      const s = get(t);
      if (s1 > 0) s.holders++;
      if (s0 !== null && s0 > 0) s.prev++;
      if (s1 === 0) s.exited++;
      else if (s0 === 0) s.fresh++;
      else if (s0 !== null && s1 > s0 * (1 + CHANGE)) s.added++;
      else if (s0 !== null && s1 < s0 * (1 - CHANGE)) s.trimmed++;
    }
  }
  for (const s of out.values()) s.managers = active;
  cache.set(D, out);
  return out;
}

const buysByTicker = new Map<string, { filed: number; trade: number; value: number; csuite: boolean }[]>();
for (const [t, filed, trade, value, cs] of buys) {
  const list = buysByTicker.get(t) ?? [];
  list.push({ filed: day(filed), trade: day(trade), value, csuite: cs === 1 });
  buysByTicker.set(t, list);
}
/** Last day covered by the insider data sets (later D has no insider information). */
export const insiderDataEnd = buys.reduce((m, b) => Math.max(m, day(b[1])), 0);

/** C-suite open-market buys filed before D with a trade date in the prior 90 days. */
export function csuiteBuysAt(ticker: string, D: number): { n: number; value: number } {
  let n = 0, value = 0;
  for (const b of buysByTicker.get(ticker) ?? []) {
    if (b.csuite && b.value >= MIN_BUY && b.filed < D && b.trade >= D - INSIDER_WINDOW) { n++; value += b.value; }
  }
  return { n, value };
}
