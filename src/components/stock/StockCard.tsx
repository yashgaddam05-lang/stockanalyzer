import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { formatMarketCap, getRiskLabel, getScoreBg, getScoreColor } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StockCardProps {
  stock: StockListItem;
  analysis: AnalysisResult;
  isWatched: boolean;
  onToggleWatch: (ticker: string) => void;
  /** Hide the score-change chip even when stock.score_change is set. */
  hideScoreChange?: boolean;
}

const RISK_VARIANT: Record<string, 'success' | 'secondary' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'secondary',
  high: 'warning',
  extreme: 'danger',
};

export function StockCard({ stock, analysis, isWatched, onToggleWatch, hideScoreChange = false }: StockCardProps) {
  const change = typeof stock.score_change === 'number' && Number.isFinite(stock.score_change) ? Math.round(stock.score_change) : 0;
  const riskLabel = analysis.riskLabel ?? stock.risk_level;

  const handleWatch = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleWatch(stock.ticker);
  };

  return (
    <Link
      to={`/app/stock/${encodeURIComponent(stock.ticker)}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      aria-label={`${stock.ticker} ${stock.company_name}, score ${analysis.totalScore}`}
    >
      <Card className="group relative h-full p-5 border-border transition-all duration-200 hover:border-neutral-400 hover:shadow-md animate-slide-up">
        <button
          type="button"
          onClick={handleWatch}
          className={cn(
            'absolute top-4 right-4 z-10 rounded p-1 transition-all',
            isWatched ? 'text-neutral-900' : 'text-neutral-300 hover:text-neutral-600'
          )}
          aria-label={isWatched ? `Remove ${stock.ticker} from watchlist` : `Add ${stock.ticker} to watchlist`}
          aria-pressed={isWatched}
        >
          <Star className={cn('h-4 w-4', isWatched && 'fill-neutral-900')} />
        </button>

        <div className="mb-4 flex items-start gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-neutral-900">{stock.ticker}</h3>
              <Badge
                variant={RISK_VARIANT[riskLabel] ?? 'secondary'}
                aria-label={`Risk score ${analysis.riskScore} of 100, ${getRiskLabel(riskLabel)}`}
              >
                {getRiskLabel(riskLabel)} · {analysis.riskScore}
              </Badge>
              {stock.data_source !== 'yahoo' && (
                <span
                  className="rounded border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800"
                  title="Approximate placeholder values until the next data refresh"
                >
                  Seed data
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{stock.company_name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              {stock.sector} · {formatMarketCap(stock.market_cap)}
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <ScoreRing score={analysis.totalScore} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-[13px] font-semibold', getScoreColor(analysis.totalScore))}>{analysis.rating}</p>
              {!hideScoreChange && change !== 0 && <ScoreChangeChip change={change} />}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">~{analysis.threeXProbability}% est. 3x probability</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">{analysis.timeframe}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Metric
            label="Rev Growth"
            value={`${stock.revenue_growth_yoy > 0 ? '+' : ''}${stock.revenue_growth_yoy.toFixed(0)}%`}
            positive={stock.revenue_growth_yoy > 0}
          />
          <Metric label="Momentum" value={`${stock.momentum_score}`} positive={stock.momentum_score > 50} />
          <Metric label="Volatility" value={`${stock.volatility.toFixed(0)}%`} positive={false} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wide text-muted-foreground">3x Score</span>
            <span className={cn('font-bold', getScoreColor(analysis.totalScore))}>{analysis.totalScore}/100</span>
          </div>
          <Progress value={analysis.totalScore} className="h-1.5" indicatorClassName={getScoreBg(analysis.totalScore)} />
        </div>
      </Card>
    </Link>
  );
}

export function StockCardSkeleton() {
  return (
    <Card className="space-y-4 border-border p-5">
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

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 75 ? '#171717' : score >= 60 ? '#404040' : score >= 45 ? '#737373' : score >= 30 ? '#a3a3a3' : '#d4d4d4';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 56 56">
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

export function Metric({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="rounded-md border border-border bg-neutral-50 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className={cn('mt-0.5 text-[13px] font-semibold', positive ? 'text-neutral-900' : 'text-neutral-600')}>{value}</p>
    </div>
  );
}

export function ScoreChangeChip({ change }: { change: number }) {
  const up = change > 0;
  const abs = Math.abs(change);
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[11px] font-semibold',
        up ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
      )}
      aria-label={`Score ${up ? 'up' : 'down'} ${abs} since last snapshot`}
      title={`Score ${up ? 'up' : 'down'} ${abs} since last snapshot`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? '+' : '-'}
      {abs}
    </span>
  );
}
