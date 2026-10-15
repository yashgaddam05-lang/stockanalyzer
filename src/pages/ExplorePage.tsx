import { useMemo, useState } from 'react';
import { Activity, ArrowUpDown, Search, Star, X } from 'lucide-react';
import { useStocks } from '@/components/data/StocksProvider';
import { StockCard, StockCardSkeleton } from '@/components/stock/StockCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SortKey = 'three_x_score' | 'revenue_growth_yoy' | 'momentum_score' | 'volatility' | 'market_cap';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'three_x_score', label: 'Score' },
  { key: 'revenue_growth_yoy', label: 'Revenue Growth' },
  { key: 'momentum_score', label: 'Momentum' },
  { key: 'volatility', label: 'Volatility' },
  { key: 'market_cap', label: 'Market Cap' },
];

export default function ExplorePage() {
  const { stocks, analyses, loading, error, watchlist, toggleWatch, reload } = useStocks();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('three_x_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const sectors = useMemo(() => ['all', ...Array.from(new Set(stocks.map((s) => s.sector))).sort()], [stocks]);

  const filtered = useMemo(() => {
    let result = [...stocks];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => s.ticker.toLowerCase().includes(q) || s.company_name.toLowerCase().includes(q));
    }
    if (selectedSector !== 'all') result = result.filter((s) => s.sector === selectedSector);
    if (selectedRisk !== 'all') result = result.filter((s) => s.risk_level === selectedRisk);
    if (showWatchlistOnly) result = result.filter((s) => watchlist.has(s.ticker));
    result.sort((a, b) => {
      const cmp = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [stocks, searchQuery, selectedSector, selectedRisk, showWatchlistOnly, watchlist, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Explore</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and sort every stock in the scanner.</p>
        </div>
        <Button
          variant={showWatchlistOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowWatchlistOnly((v) => !v)}
          className="h-8 gap-2 self-start text-[13px] sm:self-auto"
          aria-pressed={showWatchlistOnly}
        >
          <Star className={cn('h-3.5 w-3.5', showWatchlistOnly && 'fill-white')} />
          Watchlist only
          <span className="text-xs opacity-70">{watchlist.size}</span>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker or company..."
              className="h-9 pl-10 pr-10 text-[13px]"
              aria-label="Search ticker or company"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={selectedSector} onValueChange={setSelectedSector}>
            <SelectTrigger className="h-9 w-full text-[13px] sm:w-[160px]" aria-label="Sector">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'all' ? 'All Sectors' : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedRisk} onValueChange={setSelectedRisk}>
            <SelectTrigger className="h-9 w-full text-[13px] sm:w-[160px]" aria-label="Risk level">
              <SelectValue placeholder="All Risk Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="extreme">Extreme Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ArrowUpDown className="h-3 w-3" /> Sort
          </span>
          {SORT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-all',
                sortKey === opt.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
              )}
            >
              {opt.label}
              {sortKey === opt.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StockCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <p className="mb-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <Activity className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-900">No stocks match your filters</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters</p>
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            {filtered.length} opportunit{filtered.length === 1 ? 'y' : 'ies'}
            {showWatchlistOnly && ' on your watchlist'}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((stock) => (
              <StockCard
                key={stock.id}
                stock={stock}
                analysis={analyses[stock.ticker]}
                isWatched={watchlist.has(stock.ticker)}
                onToggleWatch={(t) => void toggleWatch(t)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
