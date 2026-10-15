import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { deleteCatalyst, getCatalysts } from '@/lib/api';
import type { Catalyst } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CatalystList } from '@/components/catalysts/CatalystList';
import { AddCatalystDialog } from '@/components/catalysts/AddCatalystDialog';
import {
  CATALYST_TYPES,
  CATALYST_TYPE_LABELS,
  addDays,
  daysUntil,
  groupByWeek,
  isCatalystType,
  toISODate,
} from '@/components/catalysts/catalyst-format';
import { cn } from '@/lib/utils';

interface CatalystsPageProps {
  canEdit?: boolean;
  currentUserId?: string | null;
}

const WINDOWS = [30, 90, 180] as const;
type WindowDays = (typeof WINDOWS)[number];
const ALL = 'all';
const FETCH_LIMIT = 500;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; rows: Catalyst[] };

function pickWindow(raw: string | null): WindowDays {
  const n = Number(raw);
  return (WINDOWS as readonly number[]).includes(n) ? (n as WindowDays) : 90;
}

function scoreClass(score: number): string {
  if (score >= 75) return 'bg-neutral-900 text-white';
  if (score >= 60) return 'bg-neutral-700 text-white';
  if (score >= 45) return 'bg-neutral-300 text-neutral-900';
  return 'bg-neutral-100 text-neutral-700';
}

export default function CatalystsPage({ canEdit = false, currentUserId = null }: CatalystsPageProps) {
  const { stocks, getStock } = useStocks();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const windowDays = pickWindow(params.get('window'));
  const rawType = params.get('type');
  const typeFilter = isCatalystType(rawType) ? rawType : ALL;
  const sectorFilter = params.get('sector') ?? ALL;

  useEffect(() => {
    const previous = document.title;
    document.title = 'Catalysts · 3x Hunter';
    return () => {
      document.title = previous;
    };
  }, []);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const today = new Date();
    getCatalysts({ from: toISODate(today), to: toISODate(addDays(today, windowDays)), limit: FETCH_LIMIT })
      .then((res) => {
        if (cancelled) return;
        if (!res.available) setState({ status: 'unavailable' });
        else setState({ status: 'ready', rows: res.catalysts ?? [] });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load catalysts.' });
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  useEffect(() => load(), [load]);

  const sectors = useMemo(
    () => [...new Set(stocks.map((s) => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [stocks]
  );

  const allRows = useMemo(() => (state.status === 'ready' ? state.rows : []), [state]);

  const filtered = useMemo(
    () =>
      allRows.filter((row) => {
        if (typeFilter !== ALL && row.event_type !== typeFilter) return false;
        if (sectorFilter !== ALL && getStock(row.ticker)?.sector !== sectorFilter) return false;
        return true;
      }),
    [allRows, typeFilter, sectorFilter, getStock]
  );

  const groups = useMemo(() => groupByWeek(filtered), [filtered]);
  const tickerCount = useMemo(() => new Set(filtered.map((r) => r.ticker)).size, [filtered]);
  const hasFilters = typeFilter !== ALL || sectorFilter !== ALL;

  const handleCreated = (created: Catalyst) => {
    const d = daysUntil(created.event_date);
    if (d < 0 || d > windowDays) return;
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', rows: [...prev.rows, created] } : prev));
  };

  const renderLead = (row: Catalyst) => {
    const stock = getStock(row.ticker);
    return (
      <Link
        to={`/stock/${encodeURIComponent(row.ticker)}`}
        className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-neutral-900 hover:underline underline-offset-2"
      >
        {row.ticker}
        {stock && <span className="hidden font-normal text-muted-foreground sm:inline">{stock.company_name}</span>}
        {stock && Number.isFinite(stock.three_x_score) && (
          <span
            className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums', scoreClass(stock.three_x_score))}
            aria-label={`3x score ${Math.round(stock.three_x_score)}`}
          >
            {Math.round(stock.three_x_score)}
          </span>
        )}
      </Link>
    );
  };

  const canDelete = useCallback(
    (row: Catalyst) => canEdit && currentUserId !== null && row.source === 'manual' && row.created_by === currentUserId,
    [canEdit, currentUserId]
  );

  const handleDelete = async (row: Catalyst) => {
    if (!canDelete(row)) return;
    setDeleteError(null);
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', rows: prev.rows.filter((c) => c.id !== row.id) } : prev));
    try {
      await deleteCatalyst(row.id);
    } catch (err) {
      setState((prev) =>
        prev.status === 'ready' && !prev.rows.some((c) => c.id === row.id) ? { status: 'ready', rows: [...prev.rows, row] } : prev
      );
      setDeleteError(err instanceof Error ? err.message : 'Could not delete catalyst.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Catalyst calendar</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming earnings, regulatory, clinical and product events across the tracked universe.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setDialogOpen(true)} className="self-start sm:self-auto">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add catalyst
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex rounded-md border border-neutral-200 p-0.5" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setParam('window', w === 90 ? null : String(w))}
              aria-pressed={windowDays === w}
              className={cn(
                'rounded px-3 py-1.5 text-[13px] transition-colors',
                windowDays === w ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              )}
            >
              Next {w} days
            </button>
          ))}
        </div>
        <Select value={typeFilter} onValueChange={(v) => setParam('type', v === ALL ? null : v)}>
          <SelectTrigger className="h-9 sm:w-44" aria-label="Filter by event type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All event types</SelectItem>
            {CATALYST_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CATALYST_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sectorFilter} onValueChange={(v) => setParam('sector', v === ALL ? null : v)}>
          <SelectTrigger className="h-9 sm:w-52" aria-label="Filter by sector">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // One navigation: setSearchParams' updater sees render-time params, so two
              // back-to-back setParam calls would overwrite each other.
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('type');
                  next.delete('sector');
                  return next;
                },
                { replace: true }
              );
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <p className="mb-3 text-sm text-red-700">{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Try again
          </Button>
        </Card>
      )}

      {state.status === 'unavailable' && (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <CalendarDays className="h-6 w-6 text-neutral-400" aria-hidden="true" />
          <p className="text-sm text-neutral-700">Catalyst calendar coming soon</p>
        </Card>
      )}

      {state.status === 'ready' && (
        <>
          <p className="text-[13px] text-muted-foreground" aria-live="polite" data-testid="catalyst-count">
            {filtered.length} {filtered.length === 1 ? 'event' : 'events'} across {tickerCount}{' '}
            {tickerCount === 1 ? 'ticker' : 'tickers'} in the next {windowDays} days
            {hasFilters && ` (of ${allRows.length} total)`}
          </p>
          {deleteError && (
            <p className="text-[13px] text-red-700" role="alert">
              {deleteError}
            </p>
          )}
          {groups.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <CalendarDays className="h-6 w-6 text-neutral-400" aria-hidden="true" />
              <p className="text-sm text-neutral-700">
                {hasFilters ? 'No catalysts match these filters.' : `No catalysts in the next ${windowDays} days.`}
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`week-${group.key}`} data-testid="catalyst-week">
                  <h2
                    id={`week-${group.key}`}
                    className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {group.label}
                    <span className="ml-2 normal-case tracking-normal text-neutral-400">{group.items.length}</span>
                  </h2>
                  <Card className="px-4 sm:px-6">
                    <CatalystList
                      rows={group.items}
                      renderLead={renderLead}
                      canDelete={canDelete}
                      onDelete={(r) => void handleDelete(r)}
                    />
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-[12px] text-muted-foreground">
        Dates come from public sources and user submissions and may change. Estimated dates are unconfirmed. Educational
        research only, not investment advice.
      </p>

      {canEdit && <AddCatalystDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />}
    </div>
  );
}
