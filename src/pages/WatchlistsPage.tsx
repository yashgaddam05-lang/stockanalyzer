import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { StockCard, StockCardSkeleton } from '@/components/stock/StockCard';
import { Card } from '@/components/ui/card';

export default function WatchlistsPage() {
  const { stocks, analyses, loading, watchlist, toggleWatch } = useStocks();
  const watched = stocks.filter((s) => watchlist.has(s.ticker));

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Watchlists</h1>
        <p className="text-sm text-muted-foreground">Stocks you are tracking.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StockCardSkeleton key={i} />
          ))}
        </div>
      ) : watched.length === 0 ? (
        <Card className="flex flex-col items-center p-16 text-center">
          <Star className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-900">Your watchlist is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Star stocks on the{' '}
            <Link to="/explore" className="underline underline-offset-2">
              Explore
            </Link>{' '}
            page to track them here.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {watched.map((stock) => (
            <StockCard
              key={stock.id}
              stock={stock}
              analysis={analyses[stock.ticker]}
              isWatched
              onToggleWatch={(t) => void toggleWatch(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
