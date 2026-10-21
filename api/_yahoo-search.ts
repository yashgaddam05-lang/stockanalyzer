// Yahoo Finance symbol search (no key required). Used to find stocks users want to add.

export type SymbolMatch = {
  ticker: string;
  name: string;
  exchange: string;
  type: 'EQUITY' | 'ETF';
  sector: string | null;
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// US listings only: Nasdaq tiers, NYSE, NYSE American/Arca, Cboe BZX.
const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NAS', 'NYQ', 'NYS', 'ASE', 'PCX', 'BTS', 'NIM']);

type YahooQuote = {
  symbol?: unknown;
  shortname?: unknown;
  longname?: unknown;
  exchange?: unknown;
  quoteType?: unknown;
  sector?: unknown;
  sectorDisp?: unknown;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export async function searchYahoo(query: string, limit = 8): Promise<SymbolMatch[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit * 2}&newsCount=0&listsCount=0`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as { quotes?: YahooQuote[] };
    const out: SymbolMatch[] = [];
    for (const q of body.quotes ?? []) {
      const ticker = str(q.symbol);
      const type = q.quoteType === 'EQUITY' || q.quoteType === 'ETF' ? q.quoteType : null;
      const exchange = str(q.exchange);
      if (!ticker || !type || !exchange || !US_EXCHANGES.has(exchange)) continue;
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
      out.push({
        ticker,
        name: str(q.longname) ?? str(q.shortname) ?? ticker,
        exchange,
        type,
        sector: str(q.sectorDisp) ?? str(q.sector),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Exact-symbol lookup: returns the match only if Yahoo lists this exact US ticker. */
export async function lookupYahooSymbol(ticker: string): Promise<SymbolMatch | null> {
  const matches = await searchYahoo(ticker, 10);
  return matches.find((m) => m.ticker === ticker) ?? null;
}
