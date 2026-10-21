import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Compass, Gauge, Landmark, Loader2, Search } from 'lucide-react';
import { addWatchlistItem, ApiError, createWatchlist, getWatchlists } from '@/lib/api';
import type { StockSearchResult } from '@/lib/supabase';
import { useStocks } from '@/components/data/StocksProvider';
import { StockSearch } from '@/components/search/StockSearch';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: Search,
    title: 'Add the stocks you care about',
    body: 'Holdings, ideas, anything on Nasdaq, NYSE or Cboe. Each one gets a 0-100 3x score and a risk rating.',
  },
  {
    icon: Gauge,
    title: 'Read the score, not twenty tabs',
    body: 'Growth, valuation, momentum, quality, catalysts and more in one number. 70+ is strong, under 40 is weak.',
  },
  {
    icon: Bell,
    title: 'Let it watch for you',
    body: 'Score movers, alerts and upcoming earnings for your stocks appear here as soon as you add them.',
  },
  {
    icon: Compass,
    title: 'Find what is next',
    body: 'Use Explore to screen by sector, score and risk, then add new ideas with one click.',
  },
];

/** Shown instead of market data while the user follows no stocks: explains the product and how to start. */
export function GetStartedGuide({ onFollowSp500 }: { onFollowSp500: () => void }) {
  const { reloadWatchlist } = useStocks();
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addFirst(result: StockSearchResult) {
    const ticker = result.ticker.toUpperCase();
    setAdding(ticker);
    setError(null);
    try {
      const { lists } = await getWatchlists();
      const target = lists.find((l) => l.is_default) ?? lists[0] ?? (await createWatchlist('My Stocks'));
      await addWatchlistItem({ watchlist_id: target.id, ticker }).catch((err) => {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      });
      await reloadWatchlist();
    } catch {
      setError(`Could not add ${ticker}. Please try again.`);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Card className="space-y-8 p-6 sm:p-8" data-testid="get-started">
      <div className="space-y-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Get started</p>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
          Your dashboard is empty until you make it yours
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          3x Hunter ranks stocks by their potential to triple and tells you what is changing. Add a stock below, or take
          the one-minute setup to get suggestions that match your goals and risk.
        </p>
      </div>

      <div className="space-y-2">
        <StockSearch mode="pick" onSelect={(r) => void addFirst(r)} placeholder="Add your first stock, e.g. NVDA, Costco, Palantir" />
        {adding && (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Adding {adding}...
          </p>
        )}
        {error && <p className="text-[12px] text-red-700">{error}</p>}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-border p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
              <s.icon className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-neutral-900">
                {i + 1}. {s.title}
              </p>
              <p className="text-[13px] leading-relaxed text-neutral-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild size="lg" className="gap-2">
          <Link to="/app/welcome">
            Take the 1-minute setup
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onFollowSp500} className="gap-1.5 text-neutral-600">
          <Landmark className="h-4 w-4" aria-hidden="true" />
          Or just follow the S&P 500
        </Button>
      </div>
    </Card>
  );
}
