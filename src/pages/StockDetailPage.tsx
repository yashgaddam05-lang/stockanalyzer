import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { ScoreRing } from '@/components/stock/StockCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMarketCap, getRiskLabel, getScoreColor } from '@/lib/analysis';
import { cn } from '@/lib/utils';

function BackLink() {
  return (
    <Link to="/explore" className="inline-flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
    </Link>
  );
}

export default function StockDetailPage() {
  const { ticker = '' } = useParams();
  const { getStock, analyses, loading, error, watchlist, toggleWatch, reload } = useStocks();
  const stock = getStock(ticker);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <BackLink />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

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

  if (!stock) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card className="p-12 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Ticker not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We do not track <span className="font-medium text-neutral-900">{ticker.toUpperCase()}</span> yet.
          </p>
        </Card>
      </div>
    );
  }

  const analysis = analyses[stock.ticker];
  const watched = watchlist.has(stock.ticker);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">{stock.ticker}</h1>
          <p className="text-sm text-muted-foreground">{stock.company_name}</p>
          <p className="mt-1 text-[12px] text-muted-foreground/80">
            {stock.sector} · {formatMarketCap(stock.market_cap)} · {getRiskLabel(stock.risk_level)}
          </p>
        </div>
        <Button
          variant={watched ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-2 text-[13px]"
          onClick={() => void toggleWatch(stock.ticker)}
          aria-pressed={watched}
          aria-label={watched ? `Remove ${stock.ticker} from watchlist` : `Add ${stock.ticker} to watchlist`}
        >
          <Star className={cn('h-3.5 w-3.5', watched && 'fill-white')} />
          <span className="hidden sm:inline">{watched ? 'Watching' : 'Watch'}</span>
        </Button>
      </div>

      <Card className="flex items-center gap-6 p-6">
        <ScoreRing score={analysis.totalScore} />
        <div>
          <p className={cn('text-lg font-semibold', getScoreColor(analysis.totalScore))}>{analysis.rating}</p>
          <p className="text-[13px] text-muted-foreground">
            3x Score {analysis.totalScore}/100 · ~{analysis.threeXProbability}% est. 3x probability · {analysis.timeframe}
          </p>
        </div>
      </Card>

      {stock.thesis && (
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Thesis</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{stock.thesis}</p>
        </Card>
      )}
    </div>
  );
}
