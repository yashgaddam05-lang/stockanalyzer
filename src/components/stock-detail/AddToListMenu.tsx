import { useEffect, useState } from 'react';
import { addWatchlistItem, getWatchlists } from '@/lib/api';
import type { WatchlistWithItems } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'legacy' }
  | { status: 'ready'; lists: WatchlistWithItems[] };

export function AddToListMenu({ ticker }: { ticker: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upper = ticker.toUpperCase();

  useEffect(() => {
    let cancelled = false;
    getWatchlists()
      .then((res) => {
        if (cancelled) return;
        if (res.legacy) setState({ status: 'legacy' });
        else setState({ status: 'ready', lists: res.lists ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return null;

  if (state.status === 'legacy' || state.status === 'error') {
    return (
      <p className="text-[12px] text-muted-foreground">
        {state.status === 'legacy'
          ? 'Named lists are unavailable until the watchlists database update is applied.'
          : 'Named lists could not be loaded.'}
      </p>
    );
  }

  const lists = state.lists;
  if (lists.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Create a list on the Watchlists page to add stocks to it.</p>;
  }

  const handleSelect = async (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    setBusy(true);
    setMessage(null);
    try {
      const item = await addWatchlistItem({ watchlist_id: listId, ticker: upper });
      setState({
        status: 'ready',
        lists: lists.map((l) => (l.id === listId ? { ...l, items: [...l.items, item] } : l)),
      });
      setMessage(`Added to ${list.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add to list.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Select value="" onValueChange={(v) => void handleSelect(v)} disabled={busy}>
        <SelectTrigger className="h-8 w-44 text-[13px]" aria-label={`Add ${upper} to a list`}>
          <SelectValue placeholder="Add to list" />
        </SelectTrigger>
        <SelectContent>
          {lists.map((l) => {
            const already = l.items.some((i) => i.ticker.toUpperCase() === upper);
            return (
              <SelectItem key={l.id} value={l.id} disabled={already}>
                {l.name}
                {already ? ' (added)' : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {message && (
        <p className="text-[12px] text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
