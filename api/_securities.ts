// Lookup over public.securities: every Nasdaq/NYSE/Cboe-listed company from the SEC's
// company_tickers_exchange.json. Local and unthrottled, unlike third-party search APIs.
import { supabase } from './_supabase.js';

export type SecurityMatch = { ticker: string; name: string; exchange: string };

/** SEC names are often ALL CAPS ("NVIDIA CORP"); make them readable. */
export function prettyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Inc|Corp|Co|Ltd|Plc|Llc|Lp|Nv|Sa|Ag)\b\.?/g, (m) => m.toUpperCase() === 'PLC' ? 'PLC' : m)
    .replace(/\s+\/\s*[A-Z]{2}\/?$/i, '');
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
