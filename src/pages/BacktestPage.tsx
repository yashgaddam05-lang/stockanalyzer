import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { getBacktest } from '@/lib/api';
import type { BacktestHorizon, BacktestResponse } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SampleSizePanel } from '@/components/backtest/SampleSizePanel';
import { CaveatsList } from '@/components/backtest/CaveatsList';
import { BucketTable } from '@/components/backtest/BucketTable';
import { SummaryStats } from '@/components/backtest/SummaryStats';
import { InsufficientHistory } from '@/components/backtest/InsufficientHistory';
import { formatDate } from '@/components/backtest/format';
import { cn } from '@/lib/utils';

// Lazy so recharts stays out of the main bundle.
const BucketChart = lazy(() => import('@/components/backtest/BucketChart'));

const HORIZONS: { value: BacktestHorizon; label: string }[] = [
  { value: 5, label: '5 days' },
  { value: 21, label: '21 days' },
  { value: 63, label: '63 days' },
];

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BacktestResponse };

export default function BacktestPage() {
  const [horizon, setHorizon] = useState<BacktestHorizon>(21);
  const [modelVersion, setModelVersion] = useState<string | undefined>(undefined);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Backtest · 3x Hunter';
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getBacktest({ horizon, modelVersion })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load backtest.' });
      });
    return () => {
      cancelled = true;
    };
  }, [horizon, modelVersion, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const data = state.status === 'ready' ? state.data : null;
  const versions = data?.versions ?? [];
  const selectedVersion = modelVersion ?? data?.model_version;

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Score backtest</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          How past 3x scores related to subsequent returns, using only stored data. Educational, not a prediction or
          investment advice.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex self-start rounded-md border border-neutral-200 p-0.5" role="group" aria-label="Forward return horizon">
          {HORIZONS.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() => setHorizon(h.value)}
              aria-pressed={horizon === h.value}
              className={cn(
                'rounded px-3 py-1.5 text-[13px] transition-colors',
                horizon === h.value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <Select
          value={selectedVersion}
          onValueChange={(v) => setModelVersion(v)}
          disabled={versions.length === 0}
        >
          <SelectTrigger className="h-9 sm:w-56" aria-label="Model version">
            <SelectValue placeholder="Model version" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v} value={v}>
                Model {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground">Trading days after each score date</span>
      </div>

      {state.status === 'loading' && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading backtest">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <Card className="flex flex-col items-start gap-3 p-6" role="alert">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
            Could not load the backtest
          </div>
          <p className="text-[13px] text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </Card>
      )}

      {data && (
        <>
          <SampleSizePanel sample={data.sample} horizon={data.horizon_days} />

          {!data.available ? (
            <Card className="p-6" role="status">
              <h2 className="text-base font-semibold text-neutral-900">Backtest unavailable</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Stored score history could not be read for this model version and horizon. Try another selection or check
                back after the next data refresh.
              </p>
            </Card>
          ) : !data.sufficient ? (
            <>
              <InsufficientHistory data={data} />
              {data.buckets.some((b) => b.n > 0) && (
                <Card className="p-6">
                  <h2 className="text-sm font-semibold text-neutral-900">Preliminary counts by score band</h2>
                  <p className="mb-4 mt-1 text-[12px] text-muted-foreground">
                    Shown for transparency only. With this little history the numbers are noise, not evidence.
                  </p>
                  <BucketTable buckets={data.buckets} muted />
                </Card>
              )}
            </>
          ) : (
            <>
              <Card className="p-6">
                <h2 className="text-sm font-semibold text-neutral-900">Mean {data.horizon_days}-day forward return by score band</h2>
                <p className="mb-4 mt-1 text-[12px] text-muted-foreground">
                  Each bar averages the return that followed scores in that band. n is the number of observations behind it;
                  small n means a less reliable bar.
                </p>
                <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                  <BucketChart buckets={data.buckets} horizon={data.horizon_days} />
                </Suspense>
                <div className="mt-6">
                  <BucketTable buckets={data.buckets} />
                </div>
              </Card>
              <SummaryStats data={data} />
            </>
          )}

          <CaveatsList caveats={data.caveats} />

          <p className="text-[12px] text-muted-foreground">
            Model {data.model_version} · generated {formatDate(data.generated_at)}
          </p>
        </>
      )}
    </div>
  );
}
