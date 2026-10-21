import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { getPortfolios } from '@/lib/api';
import type { StockListItem } from '@/lib/supabase';
import { valuePortfolio } from '@/lib/portfolio';
import type { PortfolioQuote, ValuedPosition } from '@/lib/portfolio';
import { useLoad } from '@/components/dashboard/useLoad';
import { CardEmpty, CardError, CardSkeleton, PersonalCard } from '@/components/dashboard/PersonalCard';
import { cn } from '@/lib/utils';

const usd = (v: number, signed = false) =>
  `${signed && v > 0 ? '+' : v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 })}`;
const pct = (v: number | null) => (v === null ? '--' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const tone = (v: number | null) => (v === null || v === 0 ? 'text-neutral-600' : v > 0 ? 'text-emerald-700' : 'text-red-700');

export function PortfolioSnapshot({ stocks, stocksLoading }: { stocks: StockListItem[]; stocksLoading: boolean }) {
  const [state, retry] = useLoad(getPortfolios);

  const summary = useMemo(() => {
    if (state.status !== 'ready' || !state.data?.available) return null;
    const portfolios = state.data.portfolios ?? [];
    const positions = portfolios.flatMap((p) => p.positions ?? []);
    if (positions.length === 0) return null;
    const quotes: Record<string, PortfolioQuote> = {};
    for (const s of stocks) quotes[s.ticker.toUpperCase()] = { current_price: s.current_price, sector: s.sector };
    const v = valuePortfolio(
      positions.map((p) => ({ id: p.id, ticker: p.ticker.toUpperCase(), shares: p.shares, cost_basis: p.cost_basis })),
      quotes
    );
    const priced = v.positions.filter((p): p is ValuedPosition & { unrealized_pl_pct: number } => p.unrealized_pl_pct !== null);
    const byPct = [...priced].sort((a, b) => b.unrealized_pl_pct - a.unrealized_pl_pct);
    return {
      totals: v.totals,
      portfolioCount: portfolios.length,
      positionCount: positions.length,
      best: byPct[0] ?? null,
      worst: byPct.length > 1 ? byPct[byPct.length - 1] : null,
    };
  }, [state, stocks]);

  return (
    <PersonalCard
      icon={<Briefcase className="h-4 w-4 text-neutral-500" aria-hidden="true" />}
      title="Portfolio snapshot"
      href="/app/portfolios"
      linkLabel="View all portfolios"
    >
      {state.status === 'loading' || stocksLoading ? (
        <CardSkeleton />
      ) : state.status === 'error' ? (
        <CardError what="portfolios" onRetry={retry} />
      ) : !summary ? (
        <CardEmpty
          message="Track a simulated portfolio to see its value and P/L here."
          ctaLabel="Create a portfolio"
          ctaHref="/app/portfolios"
        />
      ) : (
        <div className="space-y-3" data-testid="portfolio-snapshot">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total value</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-neutral-900">{usd(summary.totals.market_value)}</p>
            <p className={cn('text-[13px] font-medium tabular-nums', tone(summary.totals.unrealized_pl))}>
              {usd(summary.totals.unrealized_pl, true)} ({pct(summary.totals.unrealized_pl_pct)})
              <span className="ml-1 font-normal text-muted-foreground">unrealized</span>
            </p>
          </div>
          {(summary.best || summary.worst) && (
            <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px]">
              {summary.best && <PositionStat label="Best" position={summary.best} />}
              {summary.worst && <PositionStat label="Worst" position={summary.worst} />}
            </dl>
          )}
          <p className="text-[11px] text-muted-foreground">
            {summary.positionCount} {summary.positionCount === 1 ? 'position' : 'positions'} across {summary.portfolioCount}{' '}
            {summary.portfolioCount === 1 ? 'portfolio' : 'portfolios'}
            {summary.totals.unpriced_tickers.length > 0 && ` · ${summary.totals.unpriced_tickers.length} unpriced`}
            . Simulated, not real holdings.
          </p>
        </div>
      )}
    </PersonalCard>
  );
}

function PositionStat({ label, position }: { label: string; position: ValuedPosition }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <Link to={`/app/stock/${encodeURIComponent(position.ticker)}`} className="font-semibold text-neutral-900 hover:underline">
          {position.ticker}
        </Link>
        <span className={cn('tabular-nums', tone(position.unrealized_pl_pct))}>{pct(position.unrealized_pl_pct)}</span>
      </dd>
    </div>
  );
}
