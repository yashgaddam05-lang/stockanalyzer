import { getProfile } from '../_yahoo.js';
import {
  getQueryValue,
  normalizeTicker,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// GET /api/leadership?ticker=NVDA
// Officers + pay + governance risk (Yahoo assetProfile), SEC Form 4 insiders, and
// "connections": other covered companies where the same person files Form 4s.

type InsiderRow = {
  ticker: string;
  owner_name: string;
  owner_relationship: string | null;
  transaction_date: string | null;
  transaction_code: string | null;
  acquired_disposed: 'A' | 'D' | null;
  value: number | string | null;
};

const tokens = (s: string) =>
  s.toLowerCase().replace(/^(mr|mrs|ms|dr)\.?\s+/, '').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((t) => t.length > 1);

/** Yahoo writes "Mr. Jen-Hsun Huang"; Form 4 writes "HUANG JEN HSUN". Match last name + one other token. */
function samePerson(officer: string, owner: string): boolean {
  const a = tokens(officer);
  const b = new Set(tokens(owner));
  if (a.length < 2) return false;
  const last = a[a.length - 1];
  return b.has(last) && a.slice(0, -1).some((t) => b.has(t));
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }
  const ticker = normalizeTicker(getQueryValue(request, 'ticker'));
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }
  try {
    const [profile, insiderRes] = await Promise.all([
      getProfile(ticker),
      supabase
        .from('insider_transactions')
        .select('ticker, owner_name, owner_relationship, transaction_date, transaction_code, acquired_disposed, value')
        .eq('ticker', ticker)
        .order('transaction_date', { ascending: false, nullsFirst: false })
        .limit(400),
    ]);

    const rows = (insiderRes.data ?? []) as InsiderRow[];
    const byOwner = new Map<string, { name: string; relationship: string | null; last_trade: string | null; buys: number; sells: number; net_value: number }>();
    for (const r of rows) {
      const cur = byOwner.get(r.owner_name) ?? { name: r.owner_name, relationship: r.owner_relationship, last_trade: r.transaction_date, buys: 0, sells: 0, net_value: 0 };
      if (r.transaction_code === 'P') cur.buys++;
      if (r.transaction_code === 'S') cur.sells++;
      if (r.transaction_code === 'P' || r.transaction_code === 'S') {
        const v = Number(r.value) || 0;
        cur.net_value += r.acquired_disposed === 'D' ? -v : v;
      }
      byOwner.set(r.owner_name, cur);
    }
    const insiders = [...byOwner.values()].slice(0, 25);

    // Connections: the same filer name showing up at another ticker we cover.
    const names = insiders.map((i) => i.name);
    const connections: Record<string, { ticker: string; relationship: string | null }[]> = {};
    if (names.length) {
      const { data } = await supabase
        .from('insider_transactions')
        .select('ticker, owner_name, owner_relationship')
        .in('owner_name', names)
        .neq('ticker', ticker)
        .limit(1000);
      for (const r of (data ?? []) as InsiderRow[]) {
        const list = (connections[r.owner_name] ??= []);
        if (!list.some((x) => x.ticker === r.ticker)) list.push({ ticker: r.ticker, relationship: r.owner_relationship });
      }
    }

    const officers = (profile?.officers ?? []).map((o) => {
      const match = insiders.find((i) => samePerson(o.name, i.name));
      return {
        ...o,
        insider_name: match?.name ?? null,
        insider: match ?? null,
        connections: match ? connections[match.name] ?? [] : [],
      };
    });

    response.setHeader?.('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    response.status(200).json({
      ticker,
      officers,
      governance: profile?.governance ?? null,
      employees: profile?.employees ?? null,
      insiders: insiders.map((i) => ({ ...i, connections: connections[i.name] ?? [] })),
      sources: { officers: 'Yahoo Finance company profile', insiders: 'SEC EDGAR Form 4' },
    });
  } catch {
    sendServerError(response);
  }
}
