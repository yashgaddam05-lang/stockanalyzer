/**
 * Turns a brokerage export (or pasted text) into holdings for POST /api/portfolio-import.
 * Pure and browser-safe: nothing leaves the device until the user confirms the preview.
 *
 * Understands
 *   positions CSVs   Fidelity, Schwab, Vanguard, E*TRADE, Webull and most others (header aliases below)
 *   Robinhood        "Account activity" CSV (Robinhood has no positions export): buys and sells are
 *                    replayed with the average-cost method into net shares and cost per share
 *   pasted text      one holding per line: TICKER SHARES [COST_PER_SHARE]
 * Cash, money-market, totals and option rows are skipped with a reason, never guessed.
 */

export type ImportFormat = 'positions' | 'robinhood-activity' | 'pasted';

export interface ParsedHolding {
  /** 1-based line in the source text, for the preview. */
  line: number;
  ticker: string;
  shares: number;
  /** Per-share cost; null when the export has none (the user fills it in). */
  cost_basis: number | null;
  opened_at: string | null;
}

export interface SkippedLine {
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  format: ImportFormat;
  /** Which brokerage layout was recognised, for the preview header. */
  source: string;
  holdings: ParsedHolding[];
  skipped: SkippedLine[];
}

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

const ALIASES = {
  symbol: ['symbol', 'ticker', 'instrument', 'security symbol', 'sym', 'stock symbol'],
  quantity: ['quantity', 'qty', 'shares', 'quantity held', 'share quantity', 'shares held', 'qty (quantity)'],
  costPerShare: [
    'average cost', 'avg cost', 'average cost basis', 'avg cost basis', 'cost basis per share', 'cost/share',
    'cost per share', 'price paid', 'avg price', 'average price', 'unit cost', 'purchase price', 'avg. cost',
  ],
  costTotal: ['cost basis total', 'total cost', 'cost basis', 'cost basis ($)', 'total cost basis', 'cost basis (cb)'],
  opened: ['acquired date', 'open date', 'date acquired', 'purchase date', 'trade date', 'acquired'],
} as const;

const CASH_RE = /(\*\*|^cash\b|money market|cash & cash|account total|pending activity|^total\b|core\b)/i;

// ---------------------------------------------------------------- CSV
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n');
  const counts: [string, number][] = [',', '\t', ';'].map((d) => [d, sample.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** RFC-4180-ish: quoted fields, doubled quotes, newlines inside quotes. Returns rows with their start line. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      cells.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cells.push(field);
      rows.push({ line: rowLine, cells });
      cells = [];
      field = '';
      line++;
      rowLine = line;
    } else field += c;
  }
  if (field !== '' || cells.length > 0) {
    cells.push(field);
    rows.push({ line: rowLine, cells });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------- values
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[“”"]/g, '');

/** "$1,234.50" -> 1234.5, "(12.5)" -> -12.5, "--" / "n/a" / "" -> null. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s || /^(--|n\/?a|-)$/i.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()$,%\s+-]/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** M/D/YYYY, MM/DD/YY, YYYY-MM-DD -> YYYY-MM-DD; anything else -> null. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[2]) ? null : iso;
}

/** "BRK/B" and "brk b" -> "BRK.B"; returns null for options, cash and anything the API would reject. */
export function cleanTicker(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s || CASH_RE.test(s)) return null;
  if (/\d{6}[CP]\d/.test(s.replace(/\s/g, '')) || /\b(CALL|PUT)\b/.test(s)) return null; // option contract
  const t = s.replace(/[/ ]/g, '.').replace(/\.+$/, '');
  return TICKER_RE.test(t) ? t : null;
}

function findColumn(header: string[], names: readonly string[]): number {
  const h = header.map(norm);
  for (const name of names) {
    const i = h.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

// ---------------------------------------------------------------- formats
function robinhoodActivity(rows: { line: number; cells: string[] }[], headerIdx: number): ParseResult {
  const header = rows[headerIdx].cells;
  const col = {
    date: findColumn(header, ['activity date']),
    instrument: findColumn(header, ['instrument']),
    code: findColumn(header, ['trans code']),
    qty: findColumn(header, ['quantity']),
    price: findColumn(header, ['price']),
  };
  const skipped: SkippedLine[] = [];
  type Lot = { line: number; shares: number; cost: number; opened: string | null };
  const book = new Map<string, Lot>();
  // Robinhood lists newest first; replay oldest first so sells reduce the right running cost.
  const body = rows.slice(headerIdx + 1).reverse();
  for (const r of body) {
    const code = (r.cells[col.code] ?? '').trim().toUpperCase();
    if (code !== 'BUY' && code !== 'SELL') continue; // dividends, transfers, fees: not holdings
    const ticker = cleanTicker(r.cells[col.instrument] ?? '');
    const qty = parseNumber(r.cells[col.qty]);
    const price = parseNumber(r.cells[col.price]);
    if (!ticker || qty === null || qty <= 0 || price === null) {
      skipped.push({ line: r.line, text: r.cells.join(', ').slice(0, 120), reason: 'Unreadable buy or sell row.' });
      continue;
    }
    const lot = book.get(ticker) ?? { line: r.line, shares: 0, cost: 0, opened: null };
    if (code === 'BUY') {
      lot.cost += qty * price;
      lot.shares += qty;
      lot.opened ??= parseDate(r.cells[col.date]);
    } else if (lot.shares > 0) {
      const sold = Math.min(qty, lot.shares);
      lot.cost -= (lot.cost / lot.shares) * sold;
      lot.shares -= sold;
      if (lot.shares <= 1e-9) {
        lot.shares = 0;
        lot.cost = 0;
        lot.opened = null;
      }
    }
    book.set(ticker, lot);
  }
  const holdings: ParsedHolding[] = [];
  for (const [ticker, lot] of book) {
    if (lot.shares <= 1e-9) continue; // fully sold
    holdings.push({
      line: lot.line,
      ticker,
      shares: round(lot.shares, 6),
      cost_basis: round(lot.cost / lot.shares, 4),
      opened_at: lot.opened,
    });
  }
  holdings.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { format: 'robinhood-activity', source: 'Robinhood account activity', holdings, skipped };
}

function positionsCsv(rows: { line: number; cells: string[] }[], headerIdx: number): ParseResult {
  const header = rows[headerIdx].cells;
  const col = {
    symbol: findColumn(header, ALIASES.symbol),
    qty: findColumn(header, ALIASES.quantity),
    perShare: findColumn(header, ALIASES.costPerShare),
    total: findColumn(header, ALIASES.costTotal),
    opened: findColumn(header, ALIASES.opened),
  };
  const holdings: ParsedHolding[] = [];
  const skipped: SkippedLine[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const text = r.cells.join(', ').slice(0, 120);
    const rawSymbol = r.cells[col.symbol] ?? '';
    if (!rawSymbol.trim()) continue; // blank and footer lines
    const ticker = cleanTicker(rawSymbol);
    if (!ticker) {
      skipped.push({ line: r.line, text, reason: CASH_RE.test(rawSymbol) ? 'Cash or total row.' : 'Not a stock ticker (option, fund code or note).' });
      continue;
    }
    const shares = col.qty >= 0 ? parseNumber(r.cells[col.qty]) : null;
    if (shares === null || shares <= 0) {
      skipped.push({ line: r.line, text, reason: 'No share quantity.' });
      continue;
    }
    let cost = col.perShare >= 0 ? parseNumber(r.cells[col.perShare]) : null;
    if (cost === null && col.total >= 0) {
      const total = parseNumber(r.cells[col.total]);
      cost = total !== null ? total / shares : null;
    }
    holdings.push({
      line: r.line,
      ticker,
      shares: round(shares, 6),
      cost_basis: cost !== null && cost >= 0 ? round(cost, 4) : null,
      opened_at: col.opened >= 0 ? parseDate(r.cells[col.opened]) : null,
    });
  }
  return { format: 'positions', source: 'Positions export', holdings, skipped };
}

function pasted(text: string): ParseResult {
  const holdings: ParsedHolding[] = [];
  const skipped: SkippedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[\s,;\t]+/);
    const ticker = cleanTicker(parts[0] ?? '');
    const shares = parseNumber(parts[1]);
    const cost = parseNumber(parts[2]);
    if (!ticker || shares === null || shares <= 0) {
      skipped.push({ line: i + 1, text: line.slice(0, 120), reason: 'Expected: TICKER SHARES [COST PER SHARE].' });
      return;
    }
    holdings.push({ line: i + 1, ticker, shares, cost_basis: cost !== null && cost >= 0 ? cost : null, opened_at: null });
  });
  return { format: 'pasted', source: 'Pasted list', holdings, skipped };
}

export function parseHoldings(text: string): ParseResult {
  const rows = parseCsv(text);
  // Exports often start with title lines ("Positions for account ... as of"); find the real header.
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const h = rows[i].cells.map(norm);
    if (h.includes('trans code') && h.includes('instrument')) return robinhoodActivity(rows, i);
    if (findColumn(rows[i].cells, ALIASES.symbol) >= 0 && findColumn(rows[i].cells, ALIASES.quantity) >= 0) {
      return positionsCsv(rows, i);
    }
  }
  return pasted(text);
}
