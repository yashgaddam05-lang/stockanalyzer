import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '@/lib/store';
import { PRESET_SCREENS, isSelfFunding, type AnalyzedStock } from '@/lib/analysis';
import { StockCard, StockCardSkeleton } from '@/components/StockCard';
import { RankTable } from '@/components/RankTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, ArrowUpDown, Activity, LayoutGrid, List, Star } from 'lucide-react';

type SortKey = 'score' | 'risk' | 'revenue' | 'momentum' | 'volatility' | 'market_cap' | 'change';
type SortDir = 'asc' | 'desc';

const SORTS: { key: SortKey; label: string; value: (a: AnalyzedStock) => number }[] = [
  { key: 'score', label: 'Score', value: (a) => a.analysis.totalScore },
  { key: 'risk', label: 'Risk', value: (a) => a.analysis.risk.score },
  { key: 'change', label: 'Score change', value: (a) => a.delta ?? 0 },
  { key: 'revenue', label: 'Revenue Growth', value: (a) => a.stock.revenue_growth_yoy },
  { key: 'momentum', label: 'Momentum', value: (a) => a.stock.momentum_score },
  { key: 'volatility', label: 'Volatility', value: (a) => a.stock.volatility },
  { key: 'market_cap', label: 'Market Cap', value: (a) => a.stock.market_cap },
];

const CAP_BUCKETS: Record<string, { label: string; test: (mc: number) => boolean }> = {
  all: { label: 'All Market Caps', test: () => true },
  micro: { label: 'Micro / Small (< $2B)', test: (mc) => mc < 2e9 },
  mid: { label: 'Mid ($2B - $10B)', test: (mc) => mc >= 2e9 && mc < 10e9 },
  large: { label: 'Large ($10B - $200B)', test: (mc) => mc >= 10e9 && mc < 200e9 },
  mega: { label: 'Mega (> $200B)', test: (mc) => mc >= 200e9 },
};

export default function Explore() {
  const { analyzed, loading, error, reload, isWatched, toggleWatch, watchedTickers } = useData();
  const [params, setParams] = useSearchParams();
  const screenId = params.get('screen') || '';
  const top = Number(params.get('top')) || 0;

  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [riskBand, setRiskBand] = useState('all');
  const [cap, setCap] = useState('all');
  const [profit, setProfit] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [watchOnly, setWatchOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'table'>('grid');

  const preset = PRESET_SCREENS.find((p) => p.id === screenId);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const sectors = useMemo(() => ['all', ...Array.from(new Set(analyzed.map((a) => a.stock.sector))).sort()], [analyzed]);

  const results = useMemo(() => {
    let r = [...analyzed];
    if (preset) r = r.filter(preset.filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((a) => a.stock.ticker.toLowerCase().includes(q) || a.stock.company_name.toLowerCase().includes(q));
    }
    if (sector !== 'all') r = r.filter((a) => a.stock.sector === sector);
    if (riskBand !== 'all') r = r.filter((a) => a.analysis.risk.band === riskBand);
    if (cap !== 'all') r = r.filter((a) => CAP_BUCKETS[cap].test(a.stock.market_cap));
    if (profit === 'profitable') r = r.filter((a) => isSelfFunding(a.stock) || a.stock.earnings_growth_yoy > 0);
    if (profit === 'unprofitable') r = r.filter((a) => !isSelfFunding(a.stock) && a.stock.earnings_growth_yoy <= 0);
    if (watchOnly) r = r.filter((a) => watchedTickers.has(a.stock.ticker));

    if (preset && sortKey === 'score' && sortDir === 'desc') {
      r.sort((a, b) => preset.rank(b) - preset.rank(a));
    } else {
      const s = SORTS.find((x) => x.key === sortKey)!;
      r.sort((a, b) => (sortDir === 'desc' ? s.value(b) - s.value(a) : s.value(a) - s.value(b)));
    }
    if (top > 0) r = r.slice(0, top);
    return r;
  }, [analyzed, preset, query, sector, riskBand, cap, profit, watchOnly, watchedTickers, sortKey, sortDir, top]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const chip = (active: boolean) =>
    `text-[12px] px-2.5 py-1 rounded-md font-medium transition-all border ${
      active ? 'bg-neutral-900 text-white border-neutral-900' : 'text-neutral-600 border-border hover:text-neutral-900 hover:border-neutral-400'
    }`;

  return (
    <div className="space-y-6">
      <div className="space-y-2 pt-2">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Explore</h2>
        <p className="text-sm text-muted-foreground">
          {preset ? preset.description : 'Screen the full universe with presets, filters, and sorting.'}
        </p>
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className={chip(!preset)} onClick={() => setParam('screen', null)}>All stocks</button>
        {PRESET_SCREENS.map((p) => (
          <button key={p.id} className={chip(preset?.id === p.id)} onClick={() => setParam('screen', p.id)} title={p.description}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ticker or company..." className="pl-10 pr-10 h-9 text-[13px]" />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="h-9 text-[13px] lg:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sectors.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All Sectors' : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={riskBand} onValueChange={setRiskBand}>
              <SelectTrigger className="h-9 text-[13px] lg:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="Low">Low Risk</SelectItem>
                <SelectItem value="Moderate">Moderate Risk</SelectItem>
                <SelectItem value="High">High Risk</SelectItem>
                <SelectItem value="Extreme">Extreme Risk</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cap} onValueChange={setCap}>
              <SelectTrigger className="h-9 text-[13px] lg:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CAP_BUCKETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={profit} onValueChange={setProfit}>
              <SelectTrigger className="h-9 text-[13px] lg:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Profitability</SelectItem>
                <SelectItem value="profitable">Profitable</SelectItem>
                <SelectItem value="unprofitable">Unprofitable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide mr-1">
              <ArrowUpDown className="w-3 h-3" /> Sort
            </span>
            {SORTS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSort(opt.key)}
                className={`text-[12px] px-2.5 py-1 rounded-md font-medium transition-all ${
                  sortKey === opt.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {opt.label}
                {sortKey === opt.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={String(top)} onValueChange={(v) => setParam('top', v === '0' ? null : v)}>
              <SelectTrigger className="h-8 text-[12px] w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Show all</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="25">Top 25</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={watchOnly ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => setWatchOnly((v) => !v)}>
              <Star className={`w-3.5 h-3.5 ${watchOnly ? 'fill-white' : ''}`} /> Watched
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setView((v) => (v === 'grid' ? 'table' : 'grid'))} aria-label={view === 'grid' ? 'Show table view' : 'Show grid view'}>
              {view === 'grid' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <StockCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center border-border">
          <p className="text-sm text-destructive mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={reload}>Try Again</Button>
        </Card>
      ) : results.length === 0 ? (
        <Card className="p-16 flex flex-col items-center justify-center text-center border-border">
          <Activity className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-sm font-medium text-neutral-900">No stocks match your filters</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different preset or loosen the filters</p>
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            {results.length} opportunit{results.length === 1 ? 'y' : 'ies'}
          </p>
          {view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((item) => (
                <StockCard key={item.stock.id} item={item} isWatched={isWatched(item.stock.ticker)} onToggleWatch={() => toggleWatch(item.stock.ticker)} />
              ))}
            </div>
          ) : (
            <Card className="p-5 border-border"><RankTable rows={results} /></Card>
          )}
        </>
      )}
    </div>
  );
}
