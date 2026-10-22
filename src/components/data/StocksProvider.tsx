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

// Last stock list kept in the browser so pages render instantly while fresh data loads.
const CACHE_KEY = '3xh:stocks:v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function normalizeRows(rows: StockListItem[]): StockListItem[] {
  return rows.map((row) => ({ ...row, score_change: row.score_change ?? null, previous_score: row.previous_score ?? null }));
}

function readCachedStocks(): StockListItem[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; rows: StockListItem[] };
    if (!Array.isArray(parsed.rows) || !parsed.rows.length || Date.now() - parsed.at > CACHE_MAX_AGE_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function writeCachedStocks(rows: StockListItem[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows }));
  } catch {
    // Storage full or blocked: the in-memory list still works.
  }
}

export function StocksProvider({ children }: { children: ReactNode }) {
  const [initialRows] = useState(readCachedStocks);
  const [stocks, setStocks] = useState<StockListItem[]>(() => (initialRows ? normalizeRows(initialRows) : []));
  const [loading, setLoading] = useState(initialRows === null);
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

  /** Fetches the universe. With data already on screen it updates silently instead of showing a loading state. */
  const reload = useCallback(async (fresh = false) => {
    const silent = stocksRef.current.length > 0;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const rows = await getStocks(fresh);
      setStocks(normalizeRows(rows));
      writeCachedStocks(rows);
    } catch {
      if (!silent) setError('Could not load stock data. Please try again.');
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
      await reload(true);
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
