import { useEffect, useMemo, useState } from 'react';
import { getWatchlists } from '@/lib/api';
import type { DashboardScope, StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { useStocks } from '@/components/data/StocksProvider';

export interface MyTickersState {
  /** Upper-cased union of tickers across every one of the user's watchlists. */
  myTickers: Set<string>;
  loading: boolean;
}

/**
 * Loads the union of tickers across ALL of the user's watchlists. Re-fetches whenever the
 * default watchlist changes (star toggles) and always includes that set, so a failed request
 * degrades to the default list instead of an empty one.
 */
export function useMyTickers(): MyTickersState {
  const { watchlist } = useStocks();
  const [listTickers, setListTickers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getWatchlists()
      .then((res) => {
        if (!active) return;
        const next = new Set<string>();
        for (const list of res?.lists ?? []) {
          for (const item of list.items ?? []) if (item?.ticker) next.add(item.ticker.toUpperCase());
        }
        setListTickers(next);
      })
      .catch(() => {
        // Keep whatever we had; the default watchlist set below still applies.
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [watchlist]);

  const myTickers = useMemo(() => {
    const out = new Set(listTickers);
    for (const t of watchlist) out.add(t.toUpperCase());
    return out;
  }, [listTickers, watchlist]);

  return { myTickers, loading };
}

export function filterByScope(stocks: StockListItem[], scope: DashboardScope, myTickers: Set<string>): StockListItem[] {
  if (scope === 'all') return stocks;
  if (scope === 'sp500') return stocks.filter((s) => s.in_sp500 === true);
  return stocks.filter((s) => myTickers.has(s.ticker.toUpperCase()));
}

export interface ScopedStocks {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  /** Tracked stocks the user follows (independent of scope). */
  myStocks: StockListItem[];
  myTickers: Set<string>;
  /** True while stock data, or (for scope 'mine') the user's tickers, are loading. */
  loading: boolean;
  myTickersLoading: boolean;
  counts: Record<DashboardScope, number>;
}

/** Filters the tracked universe to a scope: mine = watchlist tickers ∩ tracked, sp500 = in_sp500, all = everything. */
export function useScopedStocks(scope: DashboardScope): ScopedStocks {
  const { stocks: all, analyses: allAnalyses, loading: stocksLoading } = useStocks();
  const { myTickers, loading: myTickersLoading } = useMyTickers();

  return useMemo(() => {
    const myStocks = filterByScope(all, 'mine', myTickers);
    const sp500 = filterByScope(all, 'sp500', myTickers);
    const stocks = scope === 'mine' ? myStocks : scope === 'sp500' ? sp500 : all;
    const analyses: Record<string, AnalysisResult> = {};
    for (const s of stocks) if (allAnalyses[s.ticker]) analyses[s.ticker] = allAnalyses[s.ticker];
    return {
      stocks,
      analyses,
      myStocks,
      myTickers,
      loading: stocksLoading || (scope === 'mine' && myTickersLoading),
      myTickersLoading,
      counts: { mine: myStocks.length, sp500: sp500.length, all: all.length },
    };
  }, [all, allAnalyses, myTickers, scope, stocksLoading, myTickersLoading]);
}
