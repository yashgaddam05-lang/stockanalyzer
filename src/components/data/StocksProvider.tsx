import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  addToWatchlist,
  getStocks,
  getWatchlist,
  refreshStocks,
  removeFromWatchlist,
} from '@/lib/api';
import type { RefreshResponse } from '@/lib/api';
import type { StockListItem } from '@/lib/supabase';
import { analyzeStock } from '@/lib/analysis';
import { useAuth } from '@/components/auth/AuthProvider';
import type { AnalysisResult } from '@/lib/analysis';

export interface StocksContextValue {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  loading: boolean;
  error: string | null;
  watchlist: Set<string>;
  toggleWatch: (ticker: string) => Promise<void>;
  reloadWatchlist: () => Promise<void>;
  reload: () => Promise<void>;
  refresh: () => Promise<RefreshResponse>;
  refreshing: boolean;
  lastRefreshed: Date | null;
  getStock: (ticker: string) => StockListItem | undefined;
}

const StocksContext = createContext<StocksContextValue | null>(null);

export function StocksProvider({ children }: { children: ReactNode }) {
  const [stocks, setStocks] = useState<StockListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getStocks();
      setStocks(rows.map((row) => ({ ...row, score_change: row.score_change ?? null, previous_score: row.previous_score ?? null })));
    } catch {
      setError('Could not load stock data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadWatchlist = useCallback(async () => {
    try {
      const entries = await getWatchlist();
      setWatchlist(new Set(entries.map((w) => w.ticker.toUpperCase())));
    } catch {
      // Watchlist failures should not block the stock list.
    }
  }, []);

  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    void reload();
  }, [reload]);

  // Load the watchlist once auth has resolved, and again whenever the user signs in or out,
  // so the star state switches between the shared and the personal list.
  useEffect(() => {
    if (authLoading) return;
    if (userId === null) setWatchlist(new Set());
    void reloadWatchlist();
  }, [authLoading, userId, reloadWatchlist]);

  const toggleWatch = useCallback(async (rawTicker: string) => {
    const ticker = rawTicker.toUpperCase();
    const wasWatched = watchlistRef.current.has(ticker);
    const apply = (watched: boolean) =>
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (watched) next.add(ticker);
        else next.delete(ticker);
        return next;
      });

    apply(!wasWatched);
    try {
      if (wasWatched) await removeFromWatchlist(ticker);
      else await addToWatchlist(ticker);
    } catch {
      apply(wasWatched);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await refreshStocks();
      if ((data.updated ?? 0) > 0 || (data.total ?? 0) === 0) {
        setLastRefreshed(new Date());
      }
      await reload();
      return data;
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const analyses = useMemo(() => {
    const map: Record<string, AnalysisResult> = {};
    for (const stock of stocks) map[stock.ticker] = analyzeStock(stock);
    return map;
  }, [stocks]);

  const getStock = useCallback(
    (ticker: string) => {
      const t = ticker.toUpperCase();
      return stocks.find((s) => s.ticker.toUpperCase() === t);
    },
    [stocks]
  );

  const value = useMemo<StocksContextValue>(
    () => ({
      stocks,
      analyses,
      loading,
      error,
      watchlist,
      toggleWatch,
      reloadWatchlist,
      reload,
      refresh,
      refreshing,
      lastRefreshed,
      getStock,
    }),
    [stocks, analyses, loading, error, watchlist, toggleWatch, reloadWatchlist, reload, refresh, refreshing, lastRefreshed, getStock]
  );

  return <StocksContext.Provider value={value}>{children}</StocksContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStocks(): StocksContextValue {
  const ctx = useContext(StocksContext);
  if (!ctx) throw new Error('useStocks must be used inside <StocksProvider>.');
  return ctx;
}
