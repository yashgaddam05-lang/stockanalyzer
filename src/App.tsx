import { useState, useEffect, useMemo, useCallback } from 'react';
import { addToWatchlist, getStocks, getWatchlist, refreshStocks, removeFromWatchlist } from '@/lib/api';
import type { Stock, WatchlistEntry } from '@/lib/supabase';
import { analyzeStock, formatMarketCap, getScoreColor, getScoreBg, getRiskLabel } from '@/lib/analysis';
import { StockDetailModal } from '@/components/StockDetailModal';
import { StatsOverview } from '@/components/StatsOverview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search, Star, X, ArrowUpDown, Activity, TrendingUp, RefreshCw, Check, AlertCircle,
} from 'lucide-react';

type SortKey = 'three_x_score' | 'revenue_growth_yoy' | 'momentum_score' | 'volatility' | 'market_cap';
type SortDir = 'asc' | 'desc';

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('three_x_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStocks(await getStocks());
    } catch {
      setError('Could not load stock data. Please try again.');
    }
    setLoading(false);
  }, []);

  const fetchWatchlist = useCallback(async () => {
    try {
      const entries: WatchlistEntry[] = await getWatchlist();
      setWatchlist(new Set(entries.map((w) => w.ticker)));
    } catch {
      setError('Could not load your watchlist. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchWatchlist();
  }, [fetchStocks, fetchWatchlist]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const data = await refreshStocks();
      const updated = data.updated ?? 0;
      const total = data.total ?? 0;
      if (updated === 0 && total > 0) {
        setRefreshMsg({ type: 'error', text: 'Yahoo Finance did not return any data. Try again later.' });
      } else {
        setRefreshMsg({ type: 'success', text: `Updated ${updated} of ${total} stocks with live market data.` });
        setLastRefreshed(new Date());
        await fetchStocks();
      }
    } catch {
      setRefreshMsg({ type: 'error', text: 'Could not reach the refresh service. Please try again.' });
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 6000);
    }
  }, [fetchStocks]);

  const toggleWatchlist = useCallback(async (ticker: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (watchlist.has(ticker)) {
      setWatchlist((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
      await removeFromWatchlist(ticker);
    } else {
      setWatchlist((prev) => new Set(prev).add(ticker));
      await addToWatchlist(ticker);
    }
  }, [watchlist]);

  const sectors = useMemo(() => {
    const set = new Set(stocks.map((s) => s.sector));
    return ['all', ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    let result = [...stocks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) => s.ticker.toLowerCase().includes(q) || s.company_name.toLowerCase().includes(q)
      );
    }

    if (selectedSector !== 'all') result = result.filter((s) => s.sector === selectedSector);
    if (selectedRisk !== 'all') result = result.filter((s) => s.risk_level === selectedRisk);
    if (showWatchlistOnly) result = result.filter((s) => watchlist.has(s.ticker));

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'three_x_score': cmp = a.three_x_score - b.three_x_score; break;
        case 'revenue_growth_yoy': cmp = a.revenue_growth_yoy - b.revenue_growth_yoy; break;
        case 'momentum_score': cmp = a.momentum_score - b.momentum_score; break;
        case 'volatility': cmp = a.volatility - b.volatility; break;
        case 'market_cap': cmp = a.market_cap - b.market_cap; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [stocks, searchQuery, selectedSector, selectedRisk, sortKey, sortDir, showWatchlistOnly, watchlist]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'three_x_score', label: 'Score' },
    { key: 'revenue_growth_yoy', label: 'Revenue Growth' },
    { key: 'momentum_score', label: 'Momentum' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'market_cap', label: 'Market Cap' },
  ];

  const riskVariantMap: Record<string, 'success' | 'secondary' | 'warning' | 'danger'> = {
    low: 'success',
    medium: 'secondary',
    high: 'warning',
    extreme: 'danger',
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
          <div className="mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 max-w-6xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold tracking-tight">3x Hunter</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block -mt-0.5">Opportunity Scanner</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="gap-2 h-8 text-[13px]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pull live prices, momentum, and volatility from Yahoo Finance</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showWatchlistOnly ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowWatchlistOnly((v) => !v)}
                      className="gap-2 h-8 text-[13px]"
                    >
                      <Star className={`w-3.5 h-3.5 ${showWatchlistOnly ? 'fill-white' : ''}`} />
                      <span className="hidden sm:inline">Watchlist</span>
                      <span className="text-xs text-muted-foreground">{watchlist.size}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showWatchlistOnly ? 'Showing watchlist only' : 'Show all stocks'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </header>

        <main className="mx-auto px-6 sm:px-8 py-8 space-y-8 max-w-6xl">
          {/* Hero */}
          <div className="flex items-end justify-between gap-4 pt-4">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
                Find stocks with 3x return potential
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                A heuristic scanner that evaluates growth, momentum, innovation, and financial health across biotech, tech, and emerging sectors.
              </p>
            </div>
            {lastRefreshed && (
              <span className="text-[11px] text-muted-foreground/60 hidden sm:block whitespace-nowrap pb-1">
                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Refresh status */}
          {refreshMsg && (
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] animate-fade-in ${
                refreshMsg.type === 'success'
                  ? 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                  : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
              }`}
            >
              {refreshMsg.type === 'success'
                ? <Check className="w-4 h-4 text-neutral-900" />
                : <AlertCircle className="w-4 h-4 text-neutral-900" />
              }
              {refreshMsg.text}
            </div>
          )}

          {/* Stats Overview */}
          {!loading && !error && <StatsOverview stocks={stocks} watchlistCount={watchlist.size} />}

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ticker or company..."
                  className="pl-10 pr-10 h-9 text-[13px]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="w-full sm:w-[150px] h-9 text-[13px]">
                  <SelectValue placeholder="All Sectors" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Sectors' : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedRisk} onValueChange={setSelectedRisk}>
                <SelectTrigger className="w-full sm:w-[150px] h-9 text-[13px]">
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

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide">
                <ArrowUpDown className="w-3 h-3" /> Sort
              </span>
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleSort(opt.key)}
                  className={`text-[12px] px-2.5 py-1 rounded-md font-medium transition-all ${
                    sortKey === opt.key
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  {opt.label}
                  {sortKey === opt.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <StockCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center border-border">
              <p className="text-sm text-destructive mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchStocks}>Try Again</Button>
            </Card>
          ) : filteredStocks.length === 0 ? (
            <Card className="p-16 flex flex-col items-center justify-center text-center border-border">
              <Activity className="w-10 h-10 text-neutral-300 mb-3" />
              <p className="text-sm font-medium text-neutral-900">No stocks match your filters</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
            </Card>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">
                {filteredStocks.length} opportunit{filteredStocks.length === 1 ? 'y' : 'ies'}
                {showWatchlistOnly && ' on your watchlist'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStocks.map((stock) => {
                  const analysis = analyzeStock(stock);
                  return (
                    <StockCard
                      key={stock.id}
                      stock={stock}
                      analysis={analysis}
                      isWatched={watchlist.has(stock.ticker)}
                      onClick={() => setSelectedStock(stock)}
                      onToggleWatch={(e) => toggleWatchlist(stock.ticker, e)}
                      riskVariant={riskVariantMap[stock.risk_level]}
                    />
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="mx-auto px-6 sm:px-8 py-10 pb-16 max-w-6xl">
          <Separator className="mb-6" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
              For educational purposes only. Not financial advice. Scores are generated from stored metrics, not live market data. Always do your own research before investing.
            </p>
            <span className="text-[11px] text-muted-foreground/60 font-medium">3x Hunter</span>
          </div>
        </footer>
      </div>

      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          isWatched={watchlist.has(selectedStock.ticker)}
          onClose={() => setSelectedStock(null)}
          onToggleWatch={(e) => toggleWatchlist(selectedStock.ticker, e)}
        />
      )}
    </div>
  );
}

function StockCardSkeleton() {
  return (
    <Card className="p-5 space-y-4 border-border">
      <div className="flex items-start gap-3">
        <Skeleton className="h-5 w-16" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
    </Card>
  );
}

function StockCard({
  stock,
  analysis,
  isWatched,
  onClick,
  onToggleWatch,
  riskVariant,
}: {
  stock: Stock;
  analysis: ReturnType<typeof analyzeStock>;
  isWatched: boolean;
  onClick: () => void;
  onToggleWatch: (e: React.MouseEvent) => void;
  riskVariant: 'success' | 'secondary' | 'warning' | 'danger';
}) {
  return (
    <Card
      onClick={onClick}
      className="group p-5 cursor-pointer border-border transition-all duration-200 hover:border-neutral-400 hover:shadow-md animate-slide-up"
    >
      <button
        onClick={onToggleWatch}
        className={`absolute top-4 right-4 p-1 rounded transition-all z-10 ${
          isWatched ? 'text-neutral-900' : 'text-neutral-300 hover:text-neutral-600'
        }`}
        aria-label="Toggle watchlist"
      >
        <Star className={`w-4 h-4 ${isWatched ? 'fill-neutral-900' : ''}`} />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4 pr-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-neutral-900 tracking-tight">{stock.ticker}</h3>
            <Badge variant={riskVariant}>{getRiskLabel(stock.risk_level)}</Badge>
          </div>
          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{stock.company_name}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">{stock.sector} · {formatMarketCap(stock.market_cap)}</p>
        </div>
      </div>

      {/* Score Ring + Rating */}
      <div className="flex items-center gap-4 mb-4">
        <ScoreRing score={analysis.totalScore} />
        <div className="flex-1">
          <p className={`text-[13px] font-semibold ${getScoreColor(analysis.totalScore)}`}>{analysis.rating}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            ~{analysis.threeXProbability}% est. 3x probability
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{analysis.timeframe}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Metric label="Rev Growth" value={`${stock.revenue_growth_yoy > 0 ? '+' : ''}${stock.revenue_growth_yoy.toFixed(0)}%`} positive={stock.revenue_growth_yoy > 0} />
        <Metric label="Momentum" value={`${stock.momentum_score}`} positive={stock.momentum_score > 50} />
        <Metric label="Volatility" value={`${stock.volatility.toFixed(0)}%`} positive={false} />
      </div>

      {/* Score bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground uppercase tracking-wide">3x Score</span>
          <span className={`font-bold ${getScoreColor(analysis.totalScore)}`}>{analysis.totalScore}/100</span>
        </div>
        <Progress
          value={analysis.totalScore}
          className="h-1.5"
          indicatorClassName={getScoreBg(analysis.totalScore)}
        />
      </div>
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#171717' : score >= 60 ? '#404040' : score >= 45 ? '#737373' : score >= 30 ? '#a3a3a3' : '#d4d4d4';

  return (
    <div className="relative w-[56px] h-[56px] flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-bold text-neutral-900">{score}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-neutral-50 border border-border rounded-md px-2 py-1.5 text-center">
      <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">{label}</p>
      <p className={`text-[13px] font-semibold mt-0.5 ${positive ? 'text-neutral-900' : 'text-neutral-600'}`}>{value}</p>
    </div>
  );
}
