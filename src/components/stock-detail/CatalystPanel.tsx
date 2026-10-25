import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { deleteCatalyst, getCatalysts } from '@/lib/api';
import type { Catalyst } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalystList } from '@/components/catalysts/CatalystList';
import { AddCatalystDialog } from '@/components/catalysts/AddCatalystDialog';
import { addDays, daysUntil, toISODate } from '@/components/catalysts/catalyst-format';
import { CatalystEdgeBadge } from '@/components/catalysts/CatalystEdgeBadge';
import { useStocks } from '@/components/data/StocksProvider';
import { scoreCatalyst } from '@/lib/scoring/catalyst-edge';

interface CatalystPanelProps {
  ticker: string;
  canEdit: boolean;
  currentUserId: string | null;
  onCatalystsLoaded?: (catalysts: Catalyst[]) => void;
}

const RECENT_DAYS = 90;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; rows: Catalyst[] };

export function CatalystPanel({ ticker, canEdit, currentUserId, onCatalystsLoaded }: CatalystPanelProps) {
  const location = useLocation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadedRef = useRef(onCatalystsLoaded);
  loadedRef.current = onCatalystsLoaded;
  const upper = ticker.toUpperCase();
  const stock = useStocks().getStock(upper);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getCatalysts({ ticker: upper, from: toISODate(addDays(new Date(), -RECENT_DAYS)) })
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
  }, [upper]);

  useEffect(() => load(), [load]);

  const rows = state.status === 'ready' ? state.rows : null;

  useEffect(() => {
    if (rows) loadedRef.current?.(rows);
  }, [rows]);

  const { upcoming, recent } = useMemo(() => {
    const list = rows ?? [];
    const up = list
      .filter((c) => daysUntil(c.event_date) >= 0)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    const past = list
      .filter((c) => {
        const d = daysUntil(c.event_date);
        return d < 0 && d >= -RECENT_DAYS;
      })
      .sort((a, b) => b.event_date.localeCompare(a.event_date));
    return { upcoming: up, recent: past };
  }, [rows]);

  const canDelete = useCallback(
    (row: Catalyst) => canEdit && currentUserId !== null && row.source === 'manual' && row.created_by === currentUserId,
    [canEdit, currentUserId]
  );

  const handleDelete = async (row: Catalyst) => {
    if (!canDelete(row)) return;
    setDeleteError(null);
    setDeletingId(row.id);
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', rows: prev.rows.filter((c) => c.id !== row.id) } : prev));
    try {
      await deleteCatalyst(row.id);
    } catch (err) {
      setState((prev) =>
        prev.status === 'ready' && !prev.rows.some((c) => c.id === row.id)
          ? { status: 'ready', rows: [...prev.rows, row] }
          : prev
      );
      setDeleteError(err instanceof Error ? err.message : 'Could not delete catalyst.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = (created: Catalyst) => {
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', rows: [...prev.rows, created] } : prev));
  };

  const next = `${location.pathname}${location.search}`;
  const showActions = state.status !== 'unavailable';

  return (
    <Card className="p-6" data-testid="catalyst-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Catalysts</h2>
        {showActions &&
          (canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Add catalyst
            </Button>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(next)}`}
              className="text-[12px] text-muted-foreground underline-offset-2 hover:text-neutral-900 hover:underline"
            >
              Sign in to add catalysts
            </Link>
          ))}
      </div>

      {state.status === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="space-y-2">
          <p className="text-[13px] text-red-700">{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'unavailable' && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Catalyst calendar coming soon
        </div>
      )}

      {state.status === 'ready' && (
        <div className="space-y-4">
          {deleteError && (
            <p className="text-[13px] text-red-700" role="alert">
              {deleteError}
            </p>
          )}
          <section aria-labelledby={`catalysts-upcoming-${upper}`}>
            <h3 id={`catalysts-upcoming-${upper}`} className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Upcoming
            </h3>
            {upcoming.length === 0 ? (
              <p className="py-2 text-[13px] text-muted-foreground">No upcoming catalysts on file.</p>
            ) : (
              <CatalystList
                rows={upcoming}
                renderAside={(row) => <CatalystEdgeBadge edge={scoreCatalyst(row, stock)} />}
                canDelete={canDelete} onDelete={(r) => void handleDelete(r)} deletingId={deletingId} />
            )}
          </section>
          <section aria-labelledby={`catalysts-recent-${upper}`}>
            <h3 id={`catalysts-recent-${upper}`} className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent (past {RECENT_DAYS} days)
            </h3>
            {recent.length === 0 ? (
              <p className="py-2 text-[13px] text-muted-foreground">No catalysts in the past {RECENT_DAYS} days.</p>
            ) : (
              <CatalystList rows={recent} canDelete={canDelete} onDelete={(r) => void handleDelete(r)} deletingId={deletingId} />
            )}
          </section>
        </div>
      )}

      {canEdit && <AddCatalystDialog open={dialogOpen} onOpenChange={setDialogOpen} ticker={upper} onCreated={handleCreated} />}
    </Card>
  );
}
