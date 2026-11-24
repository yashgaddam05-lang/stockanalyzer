import { useEffect, useState } from 'react';
import { getCompanyNews, type CompanyNewsResponse } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewsList } from './NewsList';

export function StockNewsPanel({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const [data, setData] = useState<{ ticker: string; res: CompanyNewsResponse | null; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getCompanyNews(upper)
      .then((res) => !cancelled && setData({ ticker: upper, res, error: false }))
      .catch(() => !cancelled && setData({ ticker: upper, res: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [upper]);

  const ready = data && data.ticker === upper ? data : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between panel-head px-5 py-3 text-white">
        <h2 className="font-display text-lg uppercase tracking-[0.08em]">Latest on {upper}</h2>
        <span className="live-pill">Live</span>
      </div>
      <div className="px-5 pb-2">
        {!ready ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : ready.error || !ready.res ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">Headlines are unavailable right now.</p>
        ) : (
          <Tabs defaultValue="news" className="pt-3">
            <TabsList>
              <TabsTrigger value="news">Headlines ({ready.res.items.length})</TabsTrigger>
              <TabsTrigger value="official">8-K filings ({ready.res.filings.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="news">
              {ready.res.items.length ? (
                <NewsList items={ready.res.items.slice(0, 8)} />
              ) : (
                <p className="py-6 text-center text-[13px] text-muted-foreground">No recent headlines for {upper}.</p>
              )}
            </TabsContent>
            <TabsContent value="official">
              {ready.res.filings.length ? (
                <NewsList items={ready.res.filings} showThumb={false} />
              ) : (
                <p className="py-6 text-center text-[13px] text-muted-foreground">No recent 8-K filings synced.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        Headlines via Yahoo Finance; filings via SEC EDGAR. Links open the original source.
      </p>
    </Card>
  );
}
