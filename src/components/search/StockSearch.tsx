import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Loader2, Plus, Search, X } from 'lucide-react';
import { addStock, ApiError, searchStocks } from '@/lib/api';
import type { StockListItem, StockSearchResult } from '@/lib/supabase';
import { useStocks } from '@/components/data/StocksProvider';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 250;
const MAX_RESULTS = 12;

export type StockSearchMode = 'navigate' | 'pick';

export interface StockSearchHandle {
  focus: () => void;
}

export interface StockSearchProps {
  /**
   * Called after a result is chosen. Untracked stocks are added to the tracked universe first, so the
   * result passed here always has `tracked: true` (with the fresh score when available).
   */
  onSelect?: (result: StockSearchResult) => void;
  /** navigate (default): open the stock page. pick: hand the result to onSelect and clear the box. */
  mode?: StockSearchMode;
  /** Tickers already chosen (pick mode): shown with a check mark. */
  selectedTickers?: ReadonlySet<string>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Smaller input for headers. */
  compact?: boolean;
  className?: string;
  /** Fired on Escape with an empty box (e.g. to close a mobile search panel). */
  onDismiss?: () => void;
}

function errorMessage(err: unknown, ticker: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Sign in to add new stocks.';
    if (err.status === 404) return err.message || `${ticker} is not a US-listed stock or ETF.`;
    if (err.status === 422) return err.message || `No market data is available for ${ticker} yet.`;
    if (err.status === 429) return err.message || 'You have reached the daily limit of 10 new stocks. Try again tomorrow.';
    return err.message || `Could not add ${ticker}. Please try again.`;
  }
  return `Could not add ${ticker}. Please try again.`;
}

/** Instant matches from the already-loaded tracked universe (used before/without the API). */
function localMatches(stocks: StockListItem[], query: string): StockSearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: { s: StockListItem; rank: number }[] = [];
  for (const s of stocks) {
    const ticker = s.ticker.toUpperCase();
    const name = (s.company_name ?? '').toUpperCase();
    let rank = -1;
    if (ticker === q) rank = 0;
    else if (ticker.startsWith(q)) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (name.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ s, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || (b.s.market_cap ?? 0) - (a.s.market_cap ?? 0));
  return scored.slice(0, MAX_RESULTS).map(({ s }) => ({
    ticker: s.ticker,
    name: s.company_name,
    sector: s.sector ?? null,
    tracked: true,
    in_sp500: Boolean(s.in_sp500),
    three_x_score: s.three_x_score ?? null,
  }));
}

/**
 * Debounced stock search combobox. Tracked stocks come back first (with a 3x score); other US
 * stocks/ETFs can be added to the tracked universe from the result list.
 */
export const StockSearch = forwardRef<StockSearchHandle, StockSearchProps>(function StockSearch(
  {
    onSelect,
    mode = 'navigate',
    selectedTickers,
    placeholder = 'Search any US stock or ETF',
    autoFocus,
    compact,
    className,
    onDismiss,
  },
  ref
) {
  const navigate = useNavigate();
  const { stocks, reload } = useStocks();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);

  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<StockSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [adding, setAdding] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const trimmed = query.trim();
  const local = useMemo(() => localMatches(stocks, trimmed), [stocks, trimmed]);
  // Prefer server results (they include untracked listings); fall back to local while typing or on error.
  const results = remote ?? local;

  useEffect(() => {
    if (!trimmed) {
      setRemote(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const seq = ++requestSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchStocks(trimmed)
        .then((data) => {
          if (seq !== requestSeq.current) return;
          const seen = new Set<string>();
          const unique = (data.results ?? []).filter((r) => {
            const key = r.ticker.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setRemote(unique.slice(0, MAX_RESULTS));
          setSearchError(false);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setRemote(null);
          setSearchError(true);
        })
        .finally(() => {
          if (seq === requestSeq.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Remote results are stale once the query changes; drop them until the new response lands.
  useEffect(() => {
    setRemote(null);
    setActiveIndex(-1);
  }, [trimmed]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  const choose = useCallback(
    async (result: StockSearchResult) => {
      if (adding) return;
      setActionError(null);
      let chosen = result;
      if (!result.tracked) {
        setAdding(result.ticker);
        try {
          const { stock } = await addStock(result.ticker);
          chosen = {
            ...result,
            ticker: stock?.ticker ?? result.ticker,
            name: stock?.company_name || result.name,
            sector: stock?.sector ?? result.sector,
            tracked: true,
            three_x_score: stock?.three_x_score ?? null,
            in_sp500: Boolean(stock?.in_sp500 ?? result.in_sp500),
          };
          await reload();
        } catch (err) {
          setActionError(errorMessage(err, result.ticker));
          setAdding(null);
          return;
        }
        setAdding(null);
      }

      onSelect?.(chosen);
      if (mode === 'navigate') {
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
        navigate(`/app/stock/${encodeURIComponent(chosen.ticker)}`);
      } else {
        setQuery('');
        setOpen(false);
        inputRef.current?.focus();
      }
    },
    [adding, mode, navigate, onSelect, reload]
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length ? (i <= 0 ? results.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter') {
      if (!open || !results.length) return;
      e.preventDefault();
      const target = results[activeIndex >= 0 ? activeIndex : 0];
      if (target) void choose(target);
    } else if (e.key === 'Escape') {
      if (open && trimmed) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        e.preventDefault();
        setQuery('');
      } else {
        onDismiss?.();
      }
    }
  };

  const showPanel = open && (trimmed.length > 0 || actionError !== null);
  const activeId = activeIndex >= 0 && results[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400',
            compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
          )}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search stocks"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActionError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-md border border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 transition-colors',
            'focus:border-neutral-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300',
            compact ? 'h-8 pl-8 pr-8 text-[13px]' : 'h-11 pl-10 pr-10 text-sm'
          )}
        />
        {searching || adding ? (
          <Loader2
            className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-neutral-400"
            aria-hidden="true"
          />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setActionError(null);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 min-w-[280px] overflow-hidden rounded-lg border border-border bg-background shadow-lg animate-scale-in">
          {adding && (
            <div className="flex items-center gap-2 border-b border-border bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Adding {adding}... fetching live data
            </div>
          )}
          {actionError && (
            <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-800" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {actionError}
            </div>
          )}

          <ul id={listboxId} role="listbox" aria-label="Stock search results" className="max-h-[60vh] overflow-y-auto py-1">
            {results.map((r, i) => {
              const selected = selectedTickers?.has(r.ticker.toUpperCase()) ?? false;
              const isAdding = adding === r.ticker;
              return (
                <li
                  key={r.ticker}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => void choose(r)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2 text-left',
                    i === activeIndex ? 'bg-neutral-100' : 'hover:bg-neutral-50',
                    adding && !isAdding && 'opacity-50'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-neutral-900">{r.ticker}</span>
                      {r.in_sp500 && (
                        <span className="rounded border border-neutral-200 px-1.5 py-px text-[10px] font-medium text-neutral-500">
                          S&amp;P 500
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-neutral-500">
                      {r.name}
                      {r.sector ? <span className="text-neutral-400"> · {r.sector}</span> : null}
                    </p>
                  </div>
                  {r.tracked ? (
                    <div className="flex shrink-0 items-center gap-2">
                      {r.three_x_score != null && (
                        <span
                          className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                          title="3x Opportunity Score"
                        >
                          {Math.round(r.three_x_score)}
                        </span>
                      )}
                      {mode === 'pick' &&
                        (selected ? (
                          <Check className="h-4 w-4 text-emerald-600" aria-label="Selected" />
                        ) : (
                          <Plus className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                        ))}
                    </div>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                      {isAdding ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
                      {isAdding ? 'Adding' : 'Add'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {trimmed && !results.length && (
            <p className="px-3 py-3 text-[12px] text-neutral-500">
              {searching ? 'Searching...' : searchError ? 'Search is unavailable right now. Please try again.' : `No US stocks or ETFs match "${trimmed}".`}
            </p>
          )}
          {searchError && results.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-neutral-500">
              Showing tracked stocks only. Full search is unavailable right now.
            </p>
          )}
        </div>
      )}
    </div>
  );
});
