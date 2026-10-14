import { useNavigate } from 'react-router-dom';
import type { AnalyzedStock } from '@/lib/analysis';
import { formatMarketCap, getScoreColor, getScoreBg, RISK_BAND_VARIANT } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreDelta } from '@/components/ScoreDelta';
import { Star } from 'lucide-react';

export function StockCard({
  item,
  isWatched,
  onToggleWatch,
}: {
  item: AnalyzedStock;
  isWatched: boolean;
  onToggleWatch: () => void;
}) {
  const navigate = useNavigate();
  const { stock, analysis, delta } = item;

  return (
    <Card
      onClick={() => navigate(`/stock/${stock.ticker}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/stock/${stock.ticker}`); }}
      tabIndex={0}
      role="link"
      aria-label={`${stock.ticker} details`}
      className="relative group p-5 cursor-pointer border-border transition-all duration-200 hover:border-neutral-400 hover:shadow-md animate-slide-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleWatch(); }}
        className={`absolute top-4 right-4 p-1 rounded transition-all z-10 ${
          isWatched ? 'text-neutral-900' : 'text-neutral-300 hover:text-neutral-600'
        }`}
        aria-label={isWatched ? `Remove ${stock.ticker} from watchlist` : `Add ${stock.ticker} to watchlist`}
      >
        <Star className={`w-4 h-4 ${isWatched ? 'fill-neutral-900' : ''}`} />
      </button>

      <div className="flex items-start gap-3 mb-4 pr-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-neutral-900 tracking-tight">{stock.ticker}</h3>
            <Badge variant={RISK_BAND_VARIANT[analysis.risk.band]}>
              {analysis.risk.band} risk · {analysis.risk.score}
            </Badge>
          </div>
          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{stock.company_name}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">{stock.sector} · {formatMarketCap(stock.market_cap)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <ScoreRing score={analysis.totalScore} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-[13px] font-semibold ${getScoreColor(analysis.totalScore)}`}>{analysis.rating}</p>
            <ScoreDelta delta={delta} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">~{analysis.threeXProbability}% heuristic 3x odds</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{analysis.timeframe}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Metric label="Rev Growth" value={`${stock.revenue_growth_yoy > 0 ? '+' : ''}${stock.revenue_growth_yoy.toFixed(0)}%`} positive={stock.revenue_growth_yoy > 0} />
        <Metric label="Momentum" value={`${stock.momentum_score}`} positive={stock.momentum_score > 50} />
        <Metric label="Volatility" value={`${stock.volatility.toFixed(0)}%`} positive={false} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground uppercase tracking-wide">3x Score</span>
          <span className={`font-bold ${getScoreColor(analysis.totalScore)}`}>{analysis.totalScore}/100</span>
        </div>
        <Progress value={analysis.totalScore} className="h-1.5" indicatorClassName={getScoreBg(analysis.totalScore)} />
      </div>
    </Card>
  );
}

export function StockCardSkeleton() {
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

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#171717' : score >= 58 ? '#404040' : score >= 46 ? '#737373' : score >= 35 ? '#a3a3a3' : '#d4d4d4';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
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
        <span className={`${size > 70 ? 'text-2xl' : 'text-base'} font-bold text-neutral-900`}>{score}</span>
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
