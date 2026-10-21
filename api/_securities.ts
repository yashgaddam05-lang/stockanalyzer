// Lookup over public.securities: every Nasdaq/NYSE/Cboe-listed company from the SEC's
// company_tickers_exchange.json. Local and unthrottled, unlike third-party search APIs.
import { supabase } from './_supabase.js';

export type SecurityMatch = { ticker: string; name: string; exchange: string };

/** SEC names are often ALL CAPS ("NVIDIA CORP"); make them readable. */
export function prettyName(name: string): string {
  // SEC appends a state of incorporation to some names ("Rivian Automotive, Inc. / DE").
  const trimmed = name.replace(/\s*\/\s*[A-Z]{2}\/?\s*$/i, '').trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bPlc\b/g, 'PLC');
}

export async function searchSecurities(query: string, limit = 8): Promise<SecurityMatch[]> {
  const q = query.replace(/[%,()*\\]/g, ' ').trim();
  if (!q) return [];
  const upper = q.toUpperCase();
  const { data, error } = await supabase
    .from('securities')
    .select('ticker, name, exchange')
    .or(`ticker.ilike.${upper}%,name.ilike.%${q}%`)
    .limit(limit * 3);
  if (error || !data) return [];
  return (data as SecurityMatch[])
    // Exact ticker first, then tickers starting with the query, then name matches.
    .sort((a, b) =>
      Number(b.ticker === upper) - Number(a.ticker === upper)
      || Number(b.ticker.startsWith(upper)) - Number(a.ticker.startsWith(upper))
      || a.ticker.length - b.ticker.length)
    .slice(0, limit)
    .map((m) => ({ ...m, name: prettyName(m.name) }));
}

export async function lookupSecurity(ticker: string): Promise<SecurityMatch | null> {
  const { data } = await supabase.from('securities').select('ticker, name, exchange').eq('ticker', ticker).maybeSingle();
  return data ? { ...(data as SecurityMatch), name: prettyName((data as SecurityMatch).name) } : null;
}
