import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { StatsOverview } from '@/components/StatsOverview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getScoreColor } from '@/lib/analysis';

export default function DashboardPage() {
  const { stocks, analyses, loading, error, watchlist, reload } = useStocks();

  const top = useMemo(
    () =>
      [...stocks]
        .filter((s) => analyses[s.ticker])
        .sort((a, b) => analyses[b.ticker].totalScore - analyses[a.ticker].totalScore)
        .slice(0, 10),
    [stocks, analyses]
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Find stocks with 3x return potential
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          A heuristic scanner that evaluates growth, momentum, innovation, and financial health across biotech, tech,
          and emerging sectors.
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
          <StatsOverview stocks={stocks} watchlistCount={watchlist.size} />

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Top 10 by 3x score</h2>
              <Link to="/explore" className="flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900">
                Explore all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <Card className="divide-y divide-border">
              {top.map((stock, i) => {
                const a = analyses[stock.ticker];
                return (
                  <Link
                    key={stock.ticker}
                    to={`/stock/${encodeURIComponent(stock.ticker)}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50"
                  >
                    <span className="w-6 text-[12px] text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{stock.ticker}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{stock.company_name}</p>
                    </div>
                    <span className="hidden text-[12px] text-muted-foreground sm:inline">{a.rating}</span>
                    <span className={`w-12 text-right text-sm font-bold ${getScoreColor(a.totalScore)}`}>
                      {a.totalScore}
                    </span>
                  </Link>
                );
              })}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
