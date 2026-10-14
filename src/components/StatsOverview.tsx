import { useMemo } from 'react';
import type { Stock } from '@/lib/supabase';
import { analyzeStock } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, Target, AlertTriangle, PieChart } from 'lucide-react';

export function StatsOverview({ stocks, watchlistCount }: { stocks: Stock[]; watchlistCount: number }) {
  const stats = useMemo(() => {
    const analyses = stocks.map((s) => ({ stock: s, analysis: analyzeStock(s) }));
    const topPick = analyses.reduce((best, curr) => (curr.analysis.totalScore > best.analysis.totalScore ? curr : best));
    const avgScore = Math.round(analyses.reduce((sum, a) => sum + a.analysis.totalScore, 0) / analyses.length);
    const strongCandidates = analyses.filter((a) => a.analysis.totalScore >= 75).length;
    const extremeRiskCount = stocks.filter((s) => s.risk_level === 'extreme').length;

    const sectorMap = new Map<string, { count: number; avgScore: number }>();
    for (const { stock, analysis } of analyses) {
      const existing = sectorMap.get(stock.sector) || { count: 0, avgScore: 0 };
      existing.count += 1;
      existing.avgScore += analysis.totalScore;
      sectorMap.set(stock.sector, existing);
    }
    const sectors = Array.from(sectorMap.entries())
      .map(([name, data]) => ({ name, count: data.count, avgScore: Math.round(data.avgScore / data.count) }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return { topPick, avgScore, strongCandidates, extremeRiskCount, sectors };
  }, [stocks]);

  return (
    <div className="space-y-4">
      {/* Top stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Top Pick */}
        <Card className="p-5 border-border animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Top Candidate</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-neutral-900 tracking-tight">{stats.topPick.stock.ticker}</span>
            <span className="text-lg font-bold text-neutral-600">{stats.topPick.analysis.totalScore}</span>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1 truncate">{stats.topPick.stock.company_name}</p>
          <Badge variant="default" className="mt-2.5">{stats.topPick.analysis.rating}</Badge>
        </Card>

        {/* Average Score */}
        <Card className="p-5 border-border animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Avg Score</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 tracking-tight">{stats.avgScore}<span className="text-sm text-muted-foreground font-normal">/100</span></p>
          <p className="text-[12px] text-muted-foreground mt-1">Across {stocks.length} stocks</p>
          <Progress value={stats.avgScore} className="mt-3 h-1" indicatorClassName="bg-neutral-900" />
        </Card>

        {/* Strong Candidates */}
        <Card className="p-5 border-border animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Strong 3x</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 tracking-tight">{stats.strongCandidates}</p>
          <p className="text-[12px] text-muted-foreground mt-1">Scored 75 or above</p>
        </Card>

        {/* Extreme Risk */}
        <Card className="p-5 border-border animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">High Risk</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 tracking-tight">{stats.extremeRiskCount}</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {watchlistCount > 0 ? `${watchlistCount} on watchlist` : 'Start your watchlist'}
          </p>
        </Card>
      </div>

      {/* Sector breakdown */}
      <Card className="p-5 border-border animate-slide-up">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sector Breakdown</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.sectors.map((sector) => (
            <div key={sector.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-neutral-900">{sector.name}</span>
                <span className="text-[11px] text-muted-foreground">{sector.count}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-neutral-900 tabular-nums">{sector.avgScore}</span>
                <span className="text-[11px] text-muted-foreground">avg</span>
              </div>
              <Progress
                value={sector.avgScore}
                className="h-1"
                indicatorClassName={
                  sector.avgScore >= 65 ? 'bg-neutral-900' :
                  sector.avgScore >= 50 ? 'bg-neutral-700' :
                  sector.avgScore >= 35 ? 'bg-neutral-500' : 'bg-neutral-300'
                }
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
