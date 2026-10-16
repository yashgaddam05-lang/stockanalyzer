import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Info, LogIn, Plus, RefreshCw } from 'lucide-react';
import {
  ApiError,
  createPortfolio,
  deletePortfolio,
  deletePosition,
  getPortfolios,
  renamePortfolio,
} from '@/lib/api';
import { valuePortfolio } from '@/lib/portfolio';
import { useStocks } from '@/components/data/StocksProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PortfolioDisclaimer } from '@/components/portfolio/PortfolioDisclaimer';
import { PortfolioTabs } from '@/components/portfolio/PortfolioTabs';
import { PortfolioSummary } from '@/components/portfolio/PortfolioSummary';
import { PositionsTable } from '@/components/portfolio/PositionsTable';
import type { PositionRowMeta } from '@/components/portfolio/PositionsTable';
import { ConcentrationFlags, RiskExposure, SectorExposure } from '@/components/portfolio/ExposurePanels';
import { PositionDialog } from '@/components/portfolio/PositionDialog';
import { MAX_PORTFOLIOS, buildQuotes } from '@/components/portfolio/portfolio-format';
import type { PortfolioPosition, PortfolioWithPositions } from '@/components/portfolio/portfolio-format';

const LOGIN_NEXT = '/login?next=%2Fapp%2Fportfolios';
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

function pickActive(list: PortfolioWithPositions[], current: string | null): string | null {
  if (current && list.some((p) => p.id === current)) return current;
  return list[0]?.id ?? null;
}

type DialogState = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; position: PortfolioPosition };

export default function PortfoliosPage() {
  const { stocks, analyses, loading: stocksLoading, getStock, lastRefreshed } = useStocks();
  const { loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;

  const [portfolios, setPortfolios] = useState<PortfolioWithPositions[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<string | null>(null);

  const guard = useCallback((err: unknown): never => {
    if (err instanceof ApiError && err.status === 401) {
      setSessionExpired(true);
      throw new Error(SESSION_EXPIRED);
    }
    throw err;
  }, []);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setLoadError(null);
    try {
      const data = await getPortfolios();
      setAvailable(data.available);
      setPortfolios(data.portfolios);
      setSessionExpired(false);
      setActiveId((current) => pickActive(data.portfolios, current));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSessionExpired(true);
        setLoadError(SESSION_EXPIRED);
      } else {
        setLoadError(err instanceof Error ? err.message : 'Could not load portfolios.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when the signed-in user changes so portfolios never leak across accounts.
  useEffect(() => {
    if (authLoading) return;
    setPortfolios([]);
    setActiveId(null);
    void load();
  }, [load, authLoading, userId]);

  const active = portfolios.find((p) => p.id === activeId) ?? null;

  const quotes = useMemo(() => buildQuotes(stocks, analyses), [stocks, analyses]);

  const valuation = useMemo(
    () =>
      active
        ? valuePortfolio(
            active.positions.map((p) => ({
              id: p.id,
              ticker: p.ticker.toUpperCase(),
              shares: Number(p.shares),
              cost_basis: Number(p.cost_basis),
            })),
            quotes
          )
        : null,
    [active, quotes]
  );

  const meta = useMemo(() => {
    const out: Record<string, PositionRowMeta> = {};
    for (const p of active?.positions ?? []) {
      const stock = getStock(p.ticker);
      const a = stock ? analyses[stock.ticker] : undefined;
      out[p.id] = {
        score: a?.totalScore ?? stock?.three_x_score ?? null,
        riskScore: a?.riskScore ?? stock?.risk_score ?? null,
        riskLabel: a?.riskLabel ?? stock?.risk_level ?? null,
        companyName: stock?.company_name ?? null,
      };
    }
    return out;
  }, [active, getStock, analyses]);

  const handleCreate = async (name: string) => {
    if (portfolios.length >= MAX_PORTFOLIOS) throw new Error(`You can have up to ${MAX_PORTFOLIOS} portfolios.`);
    const created = await createPortfolio(name).catch(guard);
    setPortfolios((prev) => [...prev, { ...created, positions: [] }]);
    setActiveId(created.id);
  };

  const handleRename = async (id: string, name: string) => {
    const updated = await renamePortfolio(id, name).catch(guard);
    setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated, positions: p.positions } : p)));
  };

  const handleDelete = async (id: string) => {
    await deletePortfolio(id).catch(guard);
    const next = portfolios.filter((p) => p.id !== id);
    setPortfolios(next);
    setActiveId(pickActive(next, null));
  };

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleRemove = async (positionId: string) => {
    if (!active) return;
    const position = active.positions.find((p) => p.id === positionId);
    if (!position) return;
    if (!window.confirm(`Remove ${position.ticker} from ${active.name}?`)) return;
    setRowError(null);
    setPending(positionId, true);
    try {
      await deletePosition(positionId).catch(guard);
      setPortfolios((prev) =>
        prev.map((p) => (p.id === active.id ? { ...p, positions: p.positions.filter((x) => x.id !== positionId) } : p))
      );
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not remove the position.');
    } finally {
      setPending(positionId, false);
    }
  };

  const handleEdit = (positionId: string) => {
    const position = active?.positions.find((p) => p.id === positionId);
    if (position) setDialog({ kind: 'edit', position });
  };

  const handleSaved = (saved: PortfolioPosition) => {
    if (dialog.kind === 'edit') {
      setPortfolios((prev) =>
        prev.map((p) => ({ ...p, positions: p.positions.map((x) => (x.id === saved.id ? saved : x)) }))
      );
    } else {
      // Added positions may land in another (or a newly created) portfolio; refetch and focus it.
      setActiveId(saved.portfolio_id);
      void load({ quiet: true });
    }
  };

  const showSkeleton = loading || authLoading || (stocksLoading && stocks.length === 0);
  const positions = valuation?.positions ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Portfolios</h1>
          <p className="text-sm text-muted-foreground">
            Track hypothetical positions, unrealized P/L and exposure against the 3x universe.
          </p>
        </div>
        {available && !loadError && !showSkeleton && (
          <Button type="button" onClick={() => setDialog({ kind: 'add' })} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add position
          </Button>
        )}
      </div>

      <PortfolioDisclaimer />

      {lastRefreshed && (
        <p className="text-xs text-muted-foreground">
          Prices last refreshed {lastRefreshed.toLocaleString()}. Not real-time.
        </p>
      )}

      {loadError ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
          {sessionExpired ? (
            <Button asChild variant="outline">
              <Link to={LOGIN_NEXT}>
                <LogIn className="mr-1 h-4 w-4" aria-hidden="true" />
                Sign in again
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          )}
        </Card>
      ) : showSkeleton ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !available ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <Info className="mb-3 h-10 w-10 text-neutral-300" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-900">Simulated portfolios are not available yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Portfolios activate after the database upgrade. Your watchlists keep working in the meantime.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/app/watchlists">Go to watchlists</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {sessionExpired && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            >
              <p>{SESSION_EXPIRED}</p>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to={LOGIN_NEXT}>Sign in again</Link>
              </Button>
            </div>
          )}

          <PortfolioTabs
            portfolios={portfolios}
            activeId={activeId}
            onSelect={setActiveId}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />

          {!active || positions.length === 0 ? (
            <Card className="flex flex-col items-center p-12 text-center">
              <Briefcase className="mb-3 h-10 w-10 text-neutral-300" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-900">
                {active ? `${active.name} has no positions` : 'No portfolios yet'}
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Add your first simulated position to see market value, unrealized P/L, sector and risk exposure.
                {!active && ' A portfolio named "My Portfolio" is created for you.'}
              </p>
              <Button type="button" className="mt-4" onClick={() => setDialog({ kind: 'add' })}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Add your first position
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Or browse candidates on the{' '}
                <Link to="/app/explore" className="underline underline-offset-2">
                  Explore
                </Link>{' '}
                page.
              </p>
            </Card>
          ) : (
            valuation && (
              <>
                <PortfolioSummary valuation={valuation} />

                {rowError && (
                  <p role="alert" className="text-sm text-red-600">
                    {rowError}
                  </p>
                )}

                <PositionsTable
                  positions={positions}
                  meta={meta}
                  pendingIds={pendingIds}
                  onEdit={handleEdit}
                  onRemove={(id) => void handleRemove(id)}
                />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <SectorExposure valuation={valuation} />
                  <RiskExposure valuation={valuation} />
                </div>

                <ConcentrationFlags valuation={valuation} />
              </>
            )
          )}
        </div>
      )}

      <PositionDialog
        mode={dialog.kind === 'edit' ? 'edit' : 'add'}
        open={dialog.kind !== 'closed'}
        onOpenChange={(o) => {
          if (!o) setDialog({ kind: 'closed' });
        }}
        position={dialog.kind === 'edit' ? dialog.position : null}
        defaultPortfolioId={activeId}
        onSaved={handleSaved}
      />
    </div>
  );
}
