import { useEffect, useState } from 'react';
import { getFilings } from '@/lib/api';
import type { FilingsResponse } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilingsList } from '@/components/filings/FilingsList';
import { InsiderActivity } from '@/components/filings/InsiderActivity';
import { formatDateTime } from '@/components/filings/filings-format';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: FilingsResponse };

const EMPTY_MESSAGE = 'SEC data for this ticker has not been synced yet.';

function EmptyState({ message = EMPTY_MESSAGE }: { message?: string }) {
  return <p className="py-6 text-center text-[13px] text-muted-foreground">{message}</p>;
}

export function SecActivityPanel({ ticker }: { ticker: string }) {
  // Keyed by ticker so a stale result is never rendered for a new ticker.
  const [result, setResult] = useState<{ ticker: string; state: State } | null>(null);
  const upper = ticker.toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setResult({ ticker: upper, state: { status: 'loading' } });
    getFilings(upper)
      .then((data) => {
        if (!cancelled) setResult({ ticker: upper, state: { status: 'ready', data } });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            ticker: upper,
            state: { status: 'error', message: err instanceof Error ? err.message : 'Could not load SEC data.' },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [upper]);

  const state: State = result && result.ticker === upper ? result.state : { status: 'loading' };
  const data = state.status === 'ready' ? state.data : null;
  const hasRows = !!data && data.available && (data.filings.length > 0 || data.insider.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SEC activity</CardTitle>
        <CardDescription className="text-[12px]">
          Last synced: {data ? formatDateTime(data.last_synced_at) : '-'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading SEC activity">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : state.status === 'error' ? (
          <p className="py-6 text-center text-[13px] text-red-700" role="alert">
            {state.message}
          </p>
        ) : !hasRows || !data ? (
          <EmptyState />
        ) : (
          <Tabs defaultValue="filings">
            <TabsList>
              <TabsTrigger value="filings">Filings</TabsTrigger>
              <TabsTrigger value="insider">Insider activity</TabsTrigger>
            </TabsList>
            <TabsContent value="filings" className="mt-3">
              {data.filings.length > 0 ? <FilingsList filings={data.filings} /> : <EmptyState message="No recent filings on record." />}
            </TabsContent>
            <TabsContent value="insider" className="mt-3">
              <InsiderActivity summary={data.insider_summary} transactions={data.insider} />
            </TabsContent>
          </Tabs>
        )}
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Source: SEC EDGAR. Informational only.
        </p>
      </CardContent>
    </Card>
  );
}
