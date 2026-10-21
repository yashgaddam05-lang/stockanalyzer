import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { ScopeToggle } from '@/components/dashboard/ScopeToggle';
import { useScopedStocks } from '@/components/dashboard/useScopedStocks';
import { DEFAULT_SCOPE, isScope, scopePhrase } from '@/components/dashboard/scope';
import type { DashboardScope } from '@/lib/supabase';
import { StockCard, StockCardSkeleton } from '@/components/stock/StockCard';
import { PresetScreenBar } from '@/components/explore/PresetScreenBar';
import { FilterBar } from '@/components/explore/FilterBar';
import {
  CAP_OPTIONS,
  DEFAULT_FILTERS,
  RISK_OPTIONS,
  SOURCE_OPTIONS,
  applyFilters,
  applyPreset,
  buildRows,
  hasActiveFilters,
  isSortKey,
  pickOption,
  sortRows,
} from '@/components/explore/filters';
import type { ExploreFilters, SortKey } from '@/components/explore/filters';
import { getPresetScreen } from '@/lib/scoring';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const FILTER_PARAMS = ['q', 'sector', 'risk', 'cap', 'source', 'watch', 'sort'] as const;

export default function ExplorePage() {
  const { error, watchlist, toggleWatch, reload } = useStocks();
  const { prefs } = usePreferences();
  const [params, setParams] = useSearchParams();

  // Scope is local to this page (URL-synced, never persisted); defaults to the saved preference.
  const rawScope = params.get('scope');
  const defaultScope: DashboardScope = prefs?.dashboard_scope ?? DEFAULT_SCOPE;
  const scope: DashboardScope = isScope(rawScope) ? rawScope : defaultScope;
  const { stocks, analyses, loading, counts } = useScopedStocks(scope);

  const rawPreset = params.get('preset');
  const presetId = rawPreset && getPresetScreen(rawPreset) ? rawPreset : null;
  const rawSort = params.get('sort');
  const explicitSort: SortKey | null = isSortKey(rawSort) ? rawSort : null;
  const sortKey: SortKey = explicitSort ?? 'score';

  const filters = useMemo<ExploreFilters>(() => ({
    query: params.get('q') ?? DEFAULT_FILTERS.query,
    sector: params.get('sector') ?? DEFAULT_FILTERS.sector,
    risk: pickOption(params.get('risk'), RISK_OPTIONS, DEFAULT_FILTERS.risk),
    cap: pickOption(params.get('cap'), CAP_OPTIONS, DEFAULT_FILTERS.cap),
    source: pickOption(params.get('source'), SOURCE_OPTIONS, DEFAULT_FILTERS.source),
    watchOnly: params.get('watch') === '1',
  }), [params]);

  const update = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const setPreset = (id: string | null) =>
    update((p) => {
      if (id) p.set('preset', id);
      else p.delete('preset');
      // A preset brings its own ordering; drop an explicit sort so it shows.
      p.delete('sort');
    });

  const patchFilters = (patch: Partial<ExploreFilters>) =>
    update((p) => {
      const set = (key: string, value: string, def: string) => (value === def ? p.delete(key) : p.set(key, value));
      if (patch.query !== undefined) set('q', patch.query, '');
      if (patch.sector !== undefined) set('sector', patch.sector, 'all');
      if (patch.risk !== undefined) set('risk', patch.risk, 'all');
      if (patch.cap !== undefined) set('cap', patch.cap, 'all');
      if (patch.source !== undefined) set('source', patch.source, 'all');
      if (patch.watchOnly !== undefined) set('watch', patch.watchOnly ? '1' : '0', '0');
    });

  const setScope = (next: DashboardScope) => update((p) => (next === defaultScope ? p.delete('scope') : p.set('scope', next)));

  const setSort = (key: SortKey) => update((p) => (key === 'score' && !presetId ? p.delete('sort') : p.set('sort', key)));

  const clearFilters = () => update((p) => FILTER_PARAMS.forEach((k) => p.delete(k)));

  const sectors = useMemo(() => Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))).sort(), [stocks]);
  const rows = useMemo(() => buildRows(stocks, analyses), [stocks, analyses]);
  const presetRows = useMemo(() => applyPreset(rows, presetId), [rows, presetId]);

  const visible = useMemo(() => {
    const filtered = applyFilters(presetRows, filters, watchlist);
    // With a preset active and no explicit sort, keep the preset's own ordering.
    return presetId && !explicitSort ? filtered : sortRows(filtered, sortKey);
  }, [presetRows, filters, watchlist, presetId, explicitSort, sortKey]);

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Explore</h1>
        <p className="text-sm text-muted-foreground">
          Pick a universe, start from a preset screen, then search, filter, and sort.
        </p>
      </div>

      <ScopeToggle value={scope} onChange={setScope} counts={loading ? undefined : counts} />

      <PresetScreenBar value={presetId} onChange={setPreset} />

      <FilterBar
        filters={filters}
        onChange={patchFilters}
        sectors={sectors}
        sortKey={presetId && !explicitSort ? null : sortKey}
        onSortChange={setSort}
        watchCount={watchlist.size}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StockCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <p className="mb-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground" aria-live="polite" data-testid="explore-count">
            Showing {visible.length} of {rows.length} in {scopePhrase(scope)}
            {presetId && ` · ${getPresetScreen(presetId)?.label} preset`}
          </p>
          {visible.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-16 text-center">
              <Activity className="mb-3 h-10 w-10 text-neutral-300" />
              <p className="text-sm font-medium text-neutral-900">No stocks match these filters</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {scope === 'mine' && rows.length === 0
                  ? "You're not following any stocks yet. Switch to the S&P 500 or All tracked to browse."
                  : presetId
                    ? 'Try another preset or loosen the filters.'
                    : 'Try adjusting your search or filters.'}
              </p>
              {scope === 'mine' && rows.length === 0 && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setScope('sp500')}>
                  Browse the S&P 500
                </Button>
              )}
              {(hasActiveFilters(filters) || presetId) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => update((p) => [...FILTER_PARAMS, 'preset'].forEach((k) => p.delete(k)))}
                >
                  Clear filters
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map(({ stock, analysis }) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  analysis={analysis}
                  isWatched={watchlist.has(stock.ticker.toUpperCase())}
                  onToggleWatch={(t) => void toggleWatch(t)}
                />
              ))}
            </div>
          )}
          {hasActiveFilters(filters) && visible.length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
            >
              Clear filters
            </button>
          )}
        </>
      )}
    </div>
  );
}
