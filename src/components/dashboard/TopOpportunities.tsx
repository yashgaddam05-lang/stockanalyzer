import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { getRiskLabel, getScoreColor } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';

const SIZES = [10, 25, 100] as const;
type Size = (typeof SIZES)[number];

const RISK_VARIANT: Record<string, 'success' | 'secondary' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'secondary',
  high: 'warning',
  extreme: 'danger',
};

export function ChangeChip({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="w-12 text-right text-[11px] text-muted-foreground">--</span>;
  }
  const up = change > 0;
  const flat = change === 0;
  return (
    <span
      className={cn(
        'w-12 rounded-md border px-1.5 py-0.5 text-center text-[11px] font-medium tabular-nums',
        flat
          ? 'border-neutral-200 bg-neutral-50 text-neutral-500'
          : up
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
      )}
      aria-label={`Score change ${up ? '+' : ''}${change}`}
    >
      {up ? '+' : ''}
      {change}
    </span>
  );
}

export interface TopOpportunitiesProps {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  title?: string;
  /** Noun for the footer note, e.g. "S&P 500 stocks". */
  noun?: string;
  /** Explore link target (scope-aware). */
  exploreHref?: string;
}

export function TopOpportunities({
  stocks,
  analyses,
  title = 'Top opportunities by 3x score',
  noun = 'tracked stocks',
  exploreHref = '/app/explore',
}: TopOpportunitiesProps) {
  const [size, setSize] = useState<Size>(10);

  const ranked = useMemo(
    () =>
      stocks
        .filter((s) => analyses[s.ticker])
        .sort((a, b) => analyses[b.ticker].totalScore - analyses[a.ticker].totalScore),
    [stocks, analyses]
  );
  const rows = ranked.slice(0, size);

  return (
    <section className="space-y-4" aria-labelledby="top-opportunities-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="top-opportunities-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-neutral-900">
          {title}
          <InfoTip topic="topOpportunities" />
        </h2>
        <div className="flex items-center gap-3">
          <div role="group" aria-label="Number of stocks to show" className="inline-flex rounded-lg border border-border bg-neutral-50 p-0.5">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                className={cn(
                  'rounded-md px-3 py-1 text-[12px] font-medium transition-colors',
                  size === n ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                )}
              >
                Top {n}
              </button>
            ))}
          </div>
          <Link to={exploreHref} className="hidden items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900 sm:flex">
            Explore all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <Card className="divide-y divide-border" data-testid="top-opportunities-list">
        {rows.map((stock, i) => {
          const a = analyses[stock.ticker];
          return (
            <div key={stock.ticker} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50 sm:gap-4">
              <span className="w-6 text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/app/stock/${encodeURIComponent(stock.ticker)}`}
                  className="text-sm font-semibold text-neutral-900 hover:underline"
                >
                  {stock.ticker}
                </Link>
                <p className="truncate text-[12px] text-muted-foreground">{stock.company_name}</p>
              </div>
              <Badge variant={RISK_VARIANT[a.riskLabel] ?? 'secondary'} className="hidden sm:inline-flex">
                {getRiskLabel(a.riskLabel)}
              </Badge>
              <ChangeChip change={stock.score_change} />
              <span className={cn('w-10 text-right text-sm font-bold tabular-nums', getScoreColor(a.totalScore))}>
                {a.totalScore}
              </span>
            </div>
          );
        })}
      </Card>
      {ranked.length < size && (
        <p className="text-[12px] text-muted-foreground">Showing all {ranked.length} {noun}.</p>
      )}
    </section>
  );
}
