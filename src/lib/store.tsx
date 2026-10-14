import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase, type Stock, type Watchlist, type WatchlistItem, type ScoreSnapshot } from '@/lib/supabase';
import { analyzeStock, type AnalyzedStock } from '@/lib/analysis';

type RefreshResult = { type: 'success' | 'error'; text: string };

interface DataContextValue {
  stocks: Stock[];
  analyzed: AnalyzedStock[];
  bySymbol: Map<string, AnalyzedStock>;
  history: Map<string, ScoreSnapshot[]>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<RefreshResult>;
  refreshing: boolean;
  lastRefreshed: Date | null;

  // Watchlists
  watchlistsReady: boolean; // false until the named-watchlist migration is applied
  watchlists: Watchlist[];
  items: WatchlistItem[];
  activeListId: string | null;
  setActiveListId: (id: string) => void;
  watchedTickers: Set<string>;
  isWatched: (ticker: string) => boolean;
  toggleWatch: (ticker: string) => Promise<void>;
  createList: (name: string) => Promise<void>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<Pick<WatchlistItem, 'note' | 'tags'>>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const today = () => new Date().toISOString().slice(0, 10);

export function DataProvider({ children }: { children: ReactNode }) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<ScoreSnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [watchlistsReady, setWatchlistsReady] = useState(true);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [legacyWatch, setLegacyWatch] = useState<Set<string>>(new Set());
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.from('stocks').select('*');
    if (fetchError) {
      setError('Could not load stock data. Please try again.');
      setLoading(false);
      return;
    }
    setStocks(data || []);
    setLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    const since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const { data, error: histError } = await supabase
      .from('score_history')
      .select('ticker, score, risk_score, snapshot_date')
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true })
      .limit(20000);
    if (!histError && data) setHistoryRows(data);
  }, []);

  const fetchWatchlists = useCallback(async () => {
    const [{ data: lists, error: listErr }, { data: rows }] = await Promise.all([
      supabase.from('watchlists').select('*').order('created_at'),
      supabase.from('watchlist_items').select('*').order('added_at', { ascending: false }),
    ]);
    if (listErr) {
      // Named watchlists not migrated yet: fall back to the legacy single list.
      setWatchlistsReady(false);
      const { data: legacy } = await supabase.from('watchlist').select('ticker');
      setLegacyWatch(new Set((legacy || []).map((w: { ticker: string }) => w.ticker)));
      return;
    }
    setWatchlistsReady(true);
    setWatchlists(lists || []);
    setItems(rows || []);
    setActiveListId((cur) => (cur && lists?.some((l) => l.id === cur) ? cur : lists?.[0]?.id ?? null));
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchHistory();
    fetchWatchlists();
  }, [fetchStocks, fetchHistory, fetchWatchlists]);

  const history = useMemo(() => {
    const map = new Map<string, ScoreSnapshot[]>();
    for (const row of historyRows) {
      const list = map.get(row.ticker) || [];
      list.push(row);
      map.set(row.ticker, list);
    }
    return map;
  }, [historyRows]);

  const analyzed = useMemo<AnalyzedStock[]>(() => {
    const d = today();
    return stocks
      .map((stock) => {
        const analysis = analyzeStock(stock);
        const prior = (history.get(stock.ticker) || []).filter((h) => h.snapshot_date < d);
        const last = prior[prior.length - 1];
        return { stock, analysis, delta: last ? analysis.totalScore - last.score : null };
      })
      .sort((a, b) => b.analysis.totalScore - a.analysis.totalScore);
  }, [stocks, history]);

  const bySymbol = useMemo(() => new Map(analyzed.map((a) => [a.stock.ticker, a])), [analyzed]);

  // Snapshot today's scores once per data load (one row per ticker per day).
  const snapshotKey = useRef<string>('');
  useEffect(() => {
    if (loading || analyzed.length === 0) return;
    const key = `${today()}:${analyzed.map((a) => `${a.stock.ticker}${a.analysis.totalScore}`).join(',')}`;
    if (snapshotKey.current === key) return;
    snapshotKey.current = key;
    const rows = analyzed.map((a) => ({
      ticker: a.stock.ticker,
      score: a.analysis.totalScore,
      risk_score: a.analysis.risk.score,
      snapshot_date: today(),
    }));
    supabase
      .from('score_history')
      .upsert(rows, { onConflict: 'ticker,snapshot_date' })
      .then(({ error: snapErr }) => {
        if (snapErr) return;
        setHistoryRows((prev) => [...prev.filter((h) => h.snapshot_date !== today()), ...rows]);
      });
  }, [analyzed, loading]);

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    setRefreshing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-stocks`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });
      if (!resp.ok) throw new Error(`Refresh failed (${resp.status})`);
      const data = await resp.json();
      const updated = data.updated ?? 0;
      const total = data.total ?? 0;
      if (updated === 0 && total > 0) {
        return { type: 'error', text: 'Yahoo Finance did not return any data. Try again later.' };
      }
      setLastRefreshed(new Date());
      await fetchStocks();
      return { type: 'success', text: `Updated ${updated} of ${total} stocks with live market data.` };
    } catch {
      return { type: 'error', text: 'Could not reach the refresh service. Please try again.' };
    } finally {
      setRefreshing(false);
    }
  }, [fetchStocks]);

  // ---------- Watchlists ----------

  const watchedTickers = useMemo(
    () => (watchlistsReady ? new Set(items.map((i) => i.ticker)) : legacyWatch),
    [watchlistsReady, items, legacyWatch]
  );

  const isWatched = useCallback(
    (ticker: string) =>
      watchlistsReady
        ? items.some((i) => i.ticker === ticker && i.watchlist_id === activeListId)
        : legacyWatch.has(ticker),
    [watchlistsReady, items, activeListId, legacyWatch]
  );

  const toggleWatch = useCallback(async (ticker: string) => {
    if (!watchlistsReady) {
      if (legacyWatch.has(ticker)) {
        setLegacyWatch((prev) => { const next = new Set(prev); next.delete(ticker); return next; });
        await supabase.from('watchlist').delete().eq('ticker', ticker);
      } else {
        setLegacyWatch((prev) => new Set(prev).add(ticker));
        await supabase.from('watchlist').insert({ ticker });
      }
      return;
    }
    if (!activeListId) return;
    const existing = items.find((i) => i.ticker === ticker && i.watchlist_id === activeListId);
    if (existing) {
      setItems((prev) => prev.filter((i) => i.id !== existing.id));
      await supabase.from('watchlist_items').delete().eq('id', existing.id);
    } else {
      const { data } = await supabase
        .from('watchlist_items')
        .insert({ watchlist_id: activeListId, ticker })
        .select()
        .single();
      if (data) setItems((prev) => [data, ...prev]);
    }
  }, [watchlistsReady, legacyWatch, activeListId, items]);

  const createList = useCallback(async (name: string) => {
    const { data } = await supabase.from('watchlists').insert({ name }).select().single();
    if (data) {
      setWatchlists((prev) => [...prev, data]);
      setActiveListId(data.id);
    }
  }, []);

  const renameList = useCallback(async (id: string, name: string) => {
    setWatchlists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    await supabase.from('watchlists').update({ name }).eq('id', id);
  }, []);

  const deleteList = useCallback(async (id: string) => {
    setWatchlists((prev) => {
      const next = prev.filter((l) => l.id !== id);
      setActiveListId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
    setItems((prev) => prev.filter((i) => i.watchlist_id !== id));
    await supabase.from('watchlists').delete().eq('id', id);
  }, []);

  const updateItem = useCallback(async (id: string, patch: Partial<Pick<WatchlistItem, 'note' | 'tags'>>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await supabase.from('watchlist_items').update(patch).eq('id', id);
  }, []);

  const removeItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from('watchlist_items').delete().eq('id', id);
  }, []);

  const value: DataContextValue = {
    stocks, analyzed, bySymbol, history, loading, error,
    reload: fetchStocks, refresh, refreshing, lastRefreshed,
    watchlistsReady, watchlists, items, activeListId, setActiveListId,
    watchedTickers, isWatched, toggleWatch, createList, renameList, deleteList, updateItem, removeItem,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
