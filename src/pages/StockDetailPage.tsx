import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailHeader } from '@/components/stock-detail/DetailHeader';
import { ScoreSummary } from '@/components/stock-detail/ScoreSummary';
import { RiskPanel } from '@/components/stock-detail/RiskPanel';
import { DimensionBreakdown } from '@/components/stock-detail/DimensionBreakdown';
import { CaseTabs } from '@/components/stock-detail/CaseTabs';
import { ScoreHistoryPanel } from '@/components/stock-detail/ScoreHistoryPanel';
import { MetricsTable } from '@/components/stock-detail/MetricsTable';
import { CatalystPanel } from '@/components/stock-detail/CatalystPanel';
import { ScenarioCalculator } from '@/components/stock-detail/ScenarioCalculator';
import type { PriceChartMarker } from '@/components/stock-detail/PriceChart';
import { useAuth } from '@/components/auth/AuthProvider';
import type { Catalyst } from '@/lib/supabase';

// Lazy so recharts stays out of the main bundle.
const PriceChart = lazy(() => import('@/components/stock-detail/PriceChart'));

const linkClass = 'inline-flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900';

function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();
  // location.key is 'default' on a direct landing (no in-app history to go back to).
  if (location.key !== 'default') {
    return (
      <button type="button" onClick={() => navigate(-1)} className={linkClass}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
      </button>
    );
  }
  return (
    <Link to="/explore" className={linkClass}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Explore
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading stock">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export default function StockDetailPage() {
  const { ticker = '' } = useParams();
  const upper = ticker.toUpperCase();
  const { getStock, analyses, loading, error, watchlist, toggleWatch, reload } = useStocks();
  const stock = getStock(ticker);
  const { user } = useAuth();
  const [catalysts, setCatalysts] = useState<Catalyst[]>([]);

  const markers = useMemo<PriceChartMarker[]>(
    () =>
      catalysts
        .filter((c) => c.ticker.toUpperCase() === upper)
        .map((c) => ({
          date: c.event_date,
          label: c.title,
          kind: c.event_type === 'earnings' ? 'earnings' : 'catalyst',
        })),
    [catalysts, upper]
  );

  useEffect(() => {
    const previous = document.title;
    document.title = `${upper} · 3x Hunter`;
    return () => {
      document.title = previous;
    };
  }, [upper]);

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card className="flex flex-col items-center p-12 text-center">
          <p className="mb-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const analysis = stock ? analyses[stock.ticker] : undefined;

  if (!stock || !analysis) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card className="p-12 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Ticker not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We do not track <span className="font-medium text-neutral-900">{upper}</span> yet.
          </p>
          <Link
            to="/explore"
            className="mt-4 inline-flex text-[13px] font-medium text-neutral-900 underline underline-offset-4 hover:text-neutral-600"
          >
            Browse all stocks in Explore
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <DetailHeader stock={stock} watched={watchlist.has(stock.ticker.toUpperCase())} onToggleWatch={() => void toggleWatch(stock.ticker)} />

      <Suspense fallback={<Skeleton className="h-[280px] w-full" aria-label="Loading price chart" />}>
        <PriceChart ticker={stock.ticker} markers={markers} />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2">
        <ScoreSummary stock={stock} analysis={analysis} />
        <RiskPanel analysis={analysis} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <DimensionBreakdown analysis={analysis} />
        <div className="space-y-6">
          <CatalystPanel
            ticker={stock.ticker}
            canEdit={!!user}
            currentUserId={user?.id ?? null}
            onCatalystsLoaded={setCatalysts}
          />
          <CaseTabs analysis={analysis} />
          <ScoreHistoryPanel ticker={stock.ticker} />
        </div>
      </div>

      <MetricsTable stock={stock} />

      <ScenarioCalculator stock={stock} />

      {stock.thesis && (
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Thesis</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{stock.thesis}</p>
        </Card>
      )}

      <p className="text-[12px] text-muted-foreground">
        Educational research only, not investment advice. Scores are model estimates and can be wrong.
      </p>
    </div>
  );
}
