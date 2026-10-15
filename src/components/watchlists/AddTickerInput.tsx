import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AddTickerInputProps {
  stocks: StockListItem[];
  existing: Set<string>;
  onAdd: (ticker: string) => Promise<void>;
}

const MAX_OPTIONS = 8;

export function AddTickerInput({ stocks, existing, onAdd }: AddTickerInputProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const available = stocks.filter((s) => !existing.has(s.ticker.toUpperCase()));
    const starts = available.filter((s) => s.ticker.toUpperCase().startsWith(q));
    const named = available.filter(
      (s) => !s.ticker.toUpperCase().startsWith(q) && s.company_name.toUpperCase().includes(q)
    );
    return [...starts, ...named].slice(0, MAX_OPTIONS);
  }, [query, stocks, existing]);

  const submit = async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (!stocks.some((s) => s.ticker.toUpperCase() === t)) {
      setError(`${t} is not in the tracked universe.`);
      return;
    }
    if (existing.has(t)) {
      setError(`${t} is already on this watchlist.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(t);
      setQuery('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add ticker.');
    } finally {
      setBusy(false);
    }
  };

  const pick = () => {
    const choice = matches[active];
    void submit(choice ? choice.ticker : query);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && matches.length > 0;

  return (
    <div className="w-full space-y-1 sm:w-80">
      <div className="relative flex gap-2">
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-label="Add ticker to watchlist"
          placeholder="Add ticker or company"
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="flex h-10 w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button type="button" variant="outline" disabled={busy || !query.trim()} onClick={pick}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl"
          >
            {matches.map((stock, i) => (
              <li
                key={stock.ticker}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void submit(stock.ticker);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
                  i === active ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-700'
                )}
              >
                <span className="font-semibold">{stock.ticker}</span>
                <span className="truncate text-xs text-muted-foreground">{stock.company_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
