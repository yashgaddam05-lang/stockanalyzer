import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ListChecks } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { getRiskLabel, getScoreColor } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangeChip } from '@/components/dashboard/TopOpportunities';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';

type SortCol = 'ticker' | 'price' | 'score' | 'change' | 'risk' | 'sector';
type Dir = 'asc' | 'desc';

const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, extreme: 3 };

export interface MyStocksTableProps {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  /** Every ticker the user follows, including ones not in the tracked universe. */
  myTickers: Set<string>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const fmtPrice = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
    ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '--';

export function MyStocksTable({ stocks, analyses, myTickers, loading, error, onRetry }: MyStocksTableProps) {
  const [sort, setSort] = useState<{ col: SortCol; dir: Dir }>({ col: 'score', dir: 'desc' });

  const rows = useMemo(() => {
    const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : -Infinity);
    const key = (s: StockListItem): number | string => {
      const a = analyses[s.ticker];
      switch (sort.col) {
        case 'ticker':
          return s.ticker;
        case 'sector':
          return s.sector ?? '';
        case 'price':
          return num(s.current_price);
        case 'score':
          return num(a?.totalScore);
        case 'change':
          return num(s.score_change);
        case 'risk':
          return a ? RISK_RANK[a.riskLabel] ?? 0 : -Infinity;
      }
    };
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...stocks].sort((x, y) => {
      const a = key(x);
      const b = key(y);
      const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : (a as number) - (b as number);
      return c * sign || x.ticker.localeCompare(y.ticker);
    });
  }, [stocks, analyses, sort]);

  const untracked = useMemo(() => {
    const tracked = new Set(stocks.map((s) => s.ticker.toUpperCase()));
    return Array.from(myTickers).filter((t) => !tracked.has(t)).sort();
  }, [stocks, myTickers]);

  const toggleSort = (col: SortCol) =>
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'ticker' || col === 'sector' || col === 'risk' ? 'asc' : 'desc' }
    );

  const header = (col: SortCol, label: string, className?: string) => {
    const active = sort.col === col;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('px-3 py-2 font-medium', className)}
      >
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={cn(
            'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider transition-colors hover:text-neutral-900',
            active ? 'text-neutral-900' : 'text-muted-foreground'
          )}
        >
          {label}
          <Icon className="h-3 w-3" aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <section className="space-y-4" aria-labelledby="my-stocks-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          <h2 id="my-stocks-heading" className="text-lg font-semibold tracking-tight text-neutral-900">
            Your stocks
          </h2>
          <InfoTip topic="score" />
          {!loading && stocks.length > 0 && (
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700">
              {stocks.length}
            </span>
          )}
        </div>
        <Link to="/app/watchlists" className="flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900">
          Manage watchlists <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <Card className="space-y-2 p-4" aria-busy="true" aria-label="Loading your stocks">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center">
          <p className="mb-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </Card>
      ) : stocks.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-10 text-center">
          <ListChecks className="mb-3 h-8 w-8 text-neutral-300" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-900">You're not following any stocks yet</p>
          <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
            {untracked.length > 0
              ? `You follow ${untracked.join(', ')}, but ${untracked.length === 1 ? "it isn't" : "they aren't"} in the tracked universe yet.`
              : 'Pick the stocks you care about and this dashboard will be built around them.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="sm">
              <Link to="/app/welcome">Pick your stocks</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/app/explore">Browse stocks</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:min-w-[520px]" data-testid="my-stocks-table">
              <thead className="border-b border-border bg-neutral-50">
                <tr>
                  {header('ticker', 'Stock')}
                  {header('price', 'Price', 'text-right')}
                  {header('score', '3x score', 'text-right')}
                  {header('change', 'Change', 'text-right')}
                  {header('risk', 'Risk', 'hidden sm:table-cell')}
                  {header('sector', 'Sector', 'hidden md:table-cell')}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => {
                  const a = analyses[s.ticker];
                  return (
                    <tr key={s.ticker} className="transition-colors hover:bg-neutral-50">
                      <td className="max-w-[120px] px-3 py-2 sm:max-w-[220px]">
                        <Link
                          to={`/app/stock/${encodeURIComponent(s.ticker)}`}
                          className="font-semibold text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                        >
                          {s.ticker}
                        </Link>
                        <p className="truncate text-[12px] text-muted-foreground">{s.company_name}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{fmtPrice(s.current_price)}</td>
                      <td className={cn('px-3 py-2 text-right font-bold tabular-nums', a ? getScoreColor(a.totalScore) : 'text-neutral-400')}>
                        {a?.totalScore ?? '--'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <ChangeChip change={s.score_change} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-[12px] text-neutral-700 sm:table-cell">
                        {a ? getRiskLabel(a.riskLabel) : '--'}
                      </td>
                      <td className="hidden max-w-[180px] truncate px-3 py-2 text-[12px] text-muted-foreground md:table-cell">
                        {s.sector || '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {untracked.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Not tracked yet: {untracked.join(', ')}
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
