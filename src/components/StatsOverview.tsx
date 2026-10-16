import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Database, PieChart, Target, TrendingUp } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const RISK_ORDER = ['low', 'medium', 'high', 'extreme'] as const;
const RISK_BAR: Record<(typeof RISK_ORDER)[number], string> = {
  low: 'bg-emerald-500',
  medium: 'bg-neutral-400',
  high: 'bg-amber-500',
  extreme: 'bg-red-500',
};

export interface StatsOverviewProps {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  watchlistCount?: number;
}

function Label({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{children}</span>
    </div>
  );
}

export function StatsOverview({ stocks, analyses, watchlistCount = 0 }: StatsOverviewProps) {
  const stats = useMemo(() => {
    const rows = stocks.filter((s) => analyses[s.ticker]).map((stock) => ({ stock, a: analyses[stock.ticker] }));
    const n = rows.length;
    const topPick = n ? rows.reduce((best, cur) => (cur.a.totalScore > best.a.totalScore ? cur : best)) : null;
    const avgScore = n ? Math.round(rows.reduce((sum, r) => sum + r.a.totalScore, 0) / n) : 0;
    const avgRisk = n ? Math.round(rows.reduce((sum, r) => sum + r.a.riskScore, 0) / n) : 0;
    const strong = rows.filter((r) => r.a.totalScore >= 75).length;
    const riskDist = { low: 0, medium: 0, high: 0, extreme: 0 } as Record<(typeof RISK_ORDER)[number], number>;
    for (const r of rows) riskDist[r.a.riskLabel] += 1;
    const live = stocks.filter((s) => s.data_source === 'yahoo').length;
    const seed = stocks.length - live;

    const sectorMap = new Map<string, { count: number; sum: number }>();
    for (const { stock, a } of rows) {
      const e = sectorMap.get(stock.sector) ?? { count: 0, sum: 0 };
      e.count += 1;
      e.sum += a.totalScore;
      sectorMap.set(stock.sector, e);
    }
    const sectors = Array.from(sectorMap.entries())
      .map(([name, d]) => ({ name, count: d.count, avgScore: Math.round(d.sum / d.count) }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return { n, topPick, avgScore, avgRisk, strong, riskDist, live, seed, sectors };
  }, [stocks, analyses]);

  return (
    <div className="space-y-4" data-testid="stats-overview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <Label icon={<TrendingUp className="h-3.5 w-3.5 text-neutral-400" />}>Top candidate</Label>
          {stats.topPick ? (
            <>
              <div className="flex items-baseline gap-2">
                <Link
                  to={`/app/stock/${encodeURIComponent(stats.topPick.stock.ticker)}`}
                  className="text-xl font-bold tracking-tight text-neutral-900 hover:underline"
                >
                  {stats.topPick.stock.ticker}
                </Link>
                <span className="text-lg font-bold text-neutral-600">{stats.topPick.a.totalScore}</span>
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">{stats.topPick.stock.company_name}</p>
              <Badge variant="default" className="mt-2.5">{stats.topPick.a.rating}</Badge>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No scored stocks</p>
          )}
        </Card>

        <Card className="p-5">
          <Label icon={<Target className="h-3.5 w-3.5 text-neutral-400" />}>Avg 3x score</Label>
          <p className="text-2xl font-bold tracking-tight text-neutral-900">
            {stats.avgScore}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {stats.n} tracked · {stats.strong} strong (75+)
          </p>
          <Progress value={stats.avgScore} className="mt-3 h-1" indicatorClassName="bg-neutral-900" />
        </Card>

        <Card className="p-5">
          <Label icon={<AlertTriangle className="h-3.5 w-3.5 text-neutral-400" />}>Avg risk score</Label>
          <p className="text-2xl font-bold tracking-tight text-neutral-900">
            {stats.avgRisk}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
            {RISK_ORDER.map((k) =>
              stats.riskDist[k] > 0 ? (
                <div key={k} className={RISK_BAR[k]} style={{ width: `${(stats.riskDist[k] / Math.max(stats.n, 1)) * 100}%` }} />
              ) : null
            )}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
            {RISK_ORDER.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', RISK_BAR[k])} />
                <span className="capitalize">{k}</span>
                <span className="ml-auto tabular-nums text-neutral-700">{stats.riskDist[k]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <Label icon={<Database className="h-3.5 w-3.5 text-neutral-400" />}>Data source</Label>
          <p className="text-2xl font-bold tracking-tight text-neutral-900" data-testid="data-source-count">
            {stats.live}
            <span className="text-sm font-normal text-muted-foreground"> live</span>
            <span className="mx-1.5 text-sm font-normal text-neutral-300">/</span>
            {stats.seed}
            <span className="text-sm font-normal text-muted-foreground"> seed</span>
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {stats.seed > 0 ? 'Seed rows use sample data until refreshed' : 'All rows from live market data'}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {watchlistCount > 0 ? `${watchlistCount} on watchlist` : 'Watchlist empty'}
          </p>
        </Card>
      </div>

      {stats.sectors.length > 0 && (
        <Card className="p-5">
          <Label icon={<PieChart className="h-3.5 w-3.5 text-neutral-400" />}>Sector average score</Label>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {stats.sectors.map((s) => (
              <div key={s.name} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-neutral-900">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground">{s.count}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold tabular-nums text-neutral-900">{s.avgScore}</span>
                  <span className="text-[11px] text-muted-foreground">avg</span>
                </div>
                <Progress
                  value={s.avgScore}
                  className="h-1"
                  indicatorClassName={
                    s.avgScore >= 65 ? 'bg-neutral-900' : s.avgScore >= 50 ? 'bg-neutral-700' : s.avgScore >= 35 ? 'bg-neutral-500' : 'bg-neutral-300'
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
