import { useStocks } from '@/components/data/StocksProvider';
import { StatsOverview } from '@/components/StatsOverview';
import { TopOpportunities } from '@/components/dashboard/TopOpportunities';
import { ScoreMovers } from '@/components/dashboard/ScoreMovers';
import { SectorCapHeatmap } from '@/components/dashboard/SectorCapHeatmap';
import { PresetShortcuts } from '@/components/dashboard/PresetShortcuts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { stocks, analyses, loading, error, watchlist, reload } = useStocks();

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">3x opportunity research dashboard</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          An educational research tool that ranks stocks with a transparent 0-100 heuristic score across growth,
          valuation, momentum, quality, catalysts, and risk. Scores are a starting point for your own research, not
          investment advice.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <p className="mb-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      ) : stocks.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No stocks available yet.</Card>
      ) : (
        <>
          <StatsOverview stocks={stocks} analyses={analyses} watchlistCount={watchlist.size} />
          <TopOpportunities stocks={stocks} analyses={analyses} />
          <ScoreMovers stocks={stocks} analyses={analyses} />
          <SectorCapHeatmap stocks={stocks} analyses={analyses} />
          <PresetShortcuts stocks={stocks} />
        </>
      )}
    </div>
  );
}
