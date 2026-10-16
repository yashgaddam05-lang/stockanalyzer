import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, RefreshCw } from 'lucide-react';
import { ApiError, getDataHealth } from '@/lib/api';
import type { DataHealthResponse } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverallBanner } from '@/components/data-health/OverallBanner';
import { CoverageTiles } from '@/components/data-health/CoverageTiles';
import { ChecksTable } from '@/components/data-health/ChecksTable';
import { RunsTable } from '@/components/data-health/RunsTable';
import { cn } from '@/lib/utils';

type State =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataHealthResponse };

export default function DataHealthPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Data health · 3x Hunter';
    return () => {
      document.title = previous;
    };
  }, []);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setRefreshing(true);
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    getDataHealth()
      .then((data) => {
        if (id !== requestId.current) return;
        setNow(Date.now());
        setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        if (err instanceof ApiError && err.status === 401) setState({ status: 'unauthorized' });
        else setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load data health.' });
      })
      .finally(() => {
        if (id === requestId.current) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  // Keep relative labels current without refetching.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Data health</h1>
            <p className="text-sm text-muted-foreground">
              Operational view of data freshness and quality. Checks run on demand from stored data.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={refreshing} className="self-start sm:self-auto">
            <RefreshCw className={cn('mr-1.5 h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
            {refreshing ? 'Checking' : 'Re-check'}
          </Button>
        </div>

        {state.status === 'loading' && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading data health">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {state.status === 'unauthorized' && (
          <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <Lock className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="text-sm text-neutral-700">Sign in to view data health.</p>
            <Button asChild size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          </Card>
        )}

        {state.status === 'error' && (
          <Card className="flex flex-col items-center justify-center p-12 text-center" role="alert">
            <p className="mb-3 text-sm text-red-700">{state.message}</p>
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
              Try again
            </Button>
          </Card>
        )}

        {state.status === 'ready' && (
          <div className="space-y-8" aria-busy={refreshing}>
            <OverallBanner overall={state.data.overall} checks={state.data.checks} generatedAt={state.data.generated_at} now={now} />

            <section aria-labelledby="dh-coverage" className="space-y-3">
              <h2 id="dh-coverage" className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Coverage
              </h2>
              <CoverageTiles coverage={state.data.coverage} now={now} />
            </section>

            <section aria-labelledby="dh-checks" className="space-y-3">
              <h2 id="dh-checks" className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Checks
                <span className="ml-2 normal-case tracking-normal text-neutral-400">{state.data.checks.length}</span>
              </h2>
              <ChecksTable checks={state.data.checks} />
            </section>

            <section aria-labelledby="dh-runs" className="space-y-3">
              <h2 id="dh-runs" className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent refresh runs
              </h2>
              <RunsTable runs={state.data.runs} now={now} />
            </section>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
