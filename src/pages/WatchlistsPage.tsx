import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Lock, LogIn, RefreshCw, Star, Users } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistTabs } from '@/components/watchlists/WatchlistTabs';
import { WatchlistItemsTable } from '@/components/watchlists/WatchlistItemsTable';
import type { WatchlistRow } from '@/components/watchlists/WatchlistItemsTable';
import { WatchlistSummary } from '@/components/watchlists/WatchlistSummary';
import { AddTickerInput } from '@/components/watchlists/AddTickerInput';
import {
  ApiError,
  addWatchlistItem,
  createWatchlist,
  deleteWatchlist,
  getWatchlists,
  removeWatchlistItem,
  renameWatchlist,
  updateWatchlistItem,
} from '@/lib/api';
import type { WatchlistItem, WatchlistWithItems } from '@/lib/supabase';

const LEGACY_BANNER = 'Named lists, notes and tags activate after the database upgrade.';
const LOGIN_NEXT = '/login?next=%2Fwatchlists';

function pickActive(lists: WatchlistWithItems[], current: string | null): string | null {
  if (current && lists.some((l) => l.id === current)) return current;
  return (lists.find((l) => l.is_default) ?? lists[0])?.id ?? null;
}

export default function WatchlistsPage() {
  const { stocks, analyses, loading: stocksLoading, getStock, reloadWatchlist } = useStocks();
  const [lists, setLists] = useState<WatchlistWithItems[]>([]);
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { enabled: authEnabled, loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;

  /** Flags an expired session (401) so the page can prompt re-login; rethrows everything else. */
  const guard = useCallback((err: unknown): never => {
    if (err instanceof ApiError && err.status === 401) {
      setSessionExpired(true);
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw err;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getWatchlists();
      setLists(data.lists);
      setLegacy(data.legacy);
      setSessionExpired(false);
      setActiveId((current) => pickActive(data.lists, current));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSessionExpired(true);
        setLoadError('Your session has expired. Please sign in again.');
      } else {
        setLoadError(err instanceof Error ? err.message : 'Could not load watchlists.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever the signed-in user changes (sign in / sign out) so lists never leak across accounts.
  useEffect(() => {
    if (authLoading) return;
    setLists([]);
    setActiveId(null);
    void load();
  }, [load, authLoading, userId]);

  const active = lists.find((l) => l.id === activeId) ?? null;

  const setItems = useCallback((listId: string, fn: (items: WatchlistItem[]) => WatchlistItem[]) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: fn(l.items) } : l)));
  }, []);

  const syncDefault = useCallback(
    (listId: string) => {
      const list = lists.find((l) => l.id === listId);
      if (legacy || list?.is_default) void reloadWatchlist();
    },
    [lists, legacy, reloadWatchlist]
  );

  const handleCreate = async (name: string) => {
    const created = await createWatchlist(name).catch(guard);
    setLists((prev) => [...prev, { ...created, items: [] }]);
    setActiveId(created.id);
  };

  const handleRename = async (id: string, name: string) => {
    const previous = lists.find((l) => l.id === id)?.name;
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    try {
      const updated = await renameWatchlist(id, name).catch(guard);
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated, items: l.items } : l)));
    } catch (err) {
      if (previous !== undefined) setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: previous } : l)));
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    await deleteWatchlist(id).catch(guard);
    const next = lists.filter((l) => l.id !== id);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setActiveId(pickActive(next, null));
  };

  const handleAdd = async (ticker: string) => {
    if (!active) return;
    const listId = active.id;
    const now = new Date().toISOString();
    const tempId = `pending-${ticker}-${now}`;
    const temp: WatchlistItem = { id: tempId, watchlist_id: listId, ticker, notes: '', tags: [], added_at: now, updated_at: now };
    setItems(listId, (items) => [temp, ...items]);
    try {
      const created = await addWatchlistItem({ watchlist_id: listId, ticker }).catch(guard);
      setItems(listId, (items) => items.map((i) => (i.id === tempId ? created : i)));
      syncDefault(listId);
    } catch (err) {
      setItems(listId, (items) => items.filter((i) => i.id !== tempId));
      throw err;
    }
  };

  const handleRemove = async (item: WatchlistItem) => {
    if (!active) return;
    const listId = active.id;
    const index = active.items.findIndex((i) => i.id === item.id);
    setItems(listId, (items) => items.filter((i) => i.id !== item.id));
    try {
      await removeWatchlistItem(item.id).catch(guard);
      syncDefault(listId);
    } catch (err) {
      setItems(listId, (items) => {
        if (items.some((i) => i.id === item.id)) return items;
        const next = items.slice();
        next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
        return next;
      });
      throw err;
    }
  };

  const handleUpdate = async (item: WatchlistItem, patch: { notes?: string; tags?: string[] }) => {
    if (!active || legacy) return;
    const listId = active.id;
    const before = { notes: item.notes, tags: item.tags };
    setItems(listId, (items) => items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    try {
      const updated = await updateWatchlistItem(item.id, patch).catch(guard);
      setItems(listId, (items) => items.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setItems(listId, (items) => items.map((i) => (i.id === item.id ? { ...i, ...before } : i)));
      throw err;
    }
  };

  const rows = useMemo<WatchlistRow[]>(
    () =>
      (active?.items ?? []).map((item) => {
        const stock = getStock(item.ticker);
        return { item, stock, analysis: stock ? analyses[stock.ticker] : undefined };
      }),
    [active, getStock, analyses]
  );

  const existing = useMemo(() => new Set((active?.items ?? []).map((i) => i.ticker.toUpperCase())), [active]);

  const showSkeleton = loading || authLoading || (stocksLoading && stocks.length === 0);

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Watchlists</h1>
        <p className="text-sm text-muted-foreground">Track candidates, keep notes and watch score changes.</p>
      </div>

      {authEnabled && !authLoading && (
        sessionExpired ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Your session has expired. Sign in again to keep editing your private lists.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to={LOGIN_NEXT}>
                <LogIn className="mr-1 h-4 w-4" />
                Sign in again
              </Link>
            </Button>
          </div>
        ) : user ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 truncate">
              Private to <span className="font-medium text-neutral-900">{user.email ?? 'your account'}</span>
            </p>
          </div>
        ) : (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              <p>You are viewing shared watchlists. Sign in to keep private lists.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to={LOGIN_NEXT}>
                <LogIn className="mr-1 h-4 w-4" />
                Sign in
              </Link>
            </Button>
          </div>
        )
      )}

      {legacy && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{LEGACY_BANNER}</p>
        </div>
      )}

      {loadError ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
          {sessionExpired ? (
            <Button asChild variant="outline">
              <Link to={LOGIN_NEXT}>
                <LogIn className="mr-1 h-4 w-4" />
                Sign in again
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Retry
            </Button>
          )}
        </Card>
      ) : showSkeleton ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <WatchlistTabs
            lists={lists}
            activeId={activeId}
            legacy={legacy}
            onSelect={setActiveId}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />

          {active && (
            <>
              <WatchlistSummary rows={rows} />

              <AddTickerInput stocks={stocks} existing={existing} onAdd={handleAdd} />

              {rows.length === 0 ? (
                <Card className="flex flex-col items-center p-12 text-center">
                  <Star className="mb-3 h-10 w-10 text-neutral-300" />
                  <p className="text-sm font-medium text-neutral-900">This list is empty</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a ticker above or star stocks on the{' '}
                    <Link to="/explore" className="underline underline-offset-2">
                      Explore
                    </Link>{' '}
                    page.
                  </p>
                </Card>
              ) : (
                <WatchlistItemsTable rows={rows} legacy={legacy} onRemove={handleRemove} onUpdate={handleUpdate} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
