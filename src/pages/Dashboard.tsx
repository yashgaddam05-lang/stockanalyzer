import { Link } from 'react-router-dom';
import { useData } from '@/lib/store';
import { PRESET_SCREENS, type AnalyzedStock } from '@/lib/analysis';
import { RankTable } from '@/components/RankTable';
import { StatsOverview } from '@/components/StatsOverview';
import { ScoreDelta } from '@/components/ScoreDelta';
import { StockCardSkeleton } from '@/components/StockCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trophy, TrendingUp, TrendingDown, Filter } from 'lucide-react';

export default function Dashboard() {
  const { analyzed, loading, error, reload, watchedTickers } = useData();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <StockCardSkeleton key={i} />)}
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-12 flex flex-col items-center justify-center text-center border-border">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={reload}>Try Again</Button>
      </Card>
    );
  }
  if (analyzed.length === 0) {
    return <Card className="p-12 text-center text-sm text-muted-foreground">No stocks in the universe yet.</Card>;
  }

  const top10 = analyzed.slice(0, 10);
  const withDelta = analyzed.filter((a) => a.delta !== null && a.delta !== 0);
  const gainers = [...withDelta].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).filter((a) => (a.delta ?? 0) > 0).slice(0, 5);
  const losers = [...withDelta].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).filter((a) => (a.delta ?? 0) < 0).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">Find stocks with 3x return potential</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {analyzed.length} curated stocks ranked by a transparent 8-dimension 3x Opportunity Score, with an independent risk score for every name.
        </p>
      </div>

      <StatsOverview analyzed={analyzed} watchlistCount={watchedTickers.size} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 border-border lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Top 10 Opportunities</span>
            </div>
            <div className="flex gap-1">
              <Link to="/explore?top=25" className="text-[12px] px-2 py-1 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">Top 25</Link>
              <Link to="/explore?top=100" className="text-[12px] px-2 py-1 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">Top 100</Link>
            </div>
          </div>
          <RankTable rows={top10} />
        </Card>

        <div className="space-y-4">
          <MoversCard title="Score gainers" icon={TrendingUp} rows={gainers} />
          <MoversCard title="Score decliners" icon={TrendingDown} rows={losers} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Preset Screens</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_SCREENS.map((p) => {
            const count = analyzed.filter(p.filter).length;
            return (
              <Link key={p.id} to={`/explore?screen=${p.id}`}>
                <Card className="p-4 border-border h-full transition-all hover:border-neutral-400 hover:shadow-sm group">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-neutral-900">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-900 mt-2 transition-colors" />
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoversCard({ title, icon: Icon, rows }: { title: string; icon: typeof TrendingUp; rows: AnalyzedStock[] }) {
  return (
    <Card className="p-5 border-border">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-neutral-400" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          No changes yet. Scores are snapshotted daily; movers appear after the next refresh on a new day.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.stock.ticker} className="flex items-center justify-between">
              <Link to={`/stock/${r.stock.ticker}`} className="text-[13px] font-semibold text-neutral-900 hover:underline">{r.stock.ticker}</Link>
              <span className="flex items-center gap-3">
                <span className="text-[12px] text-muted-foreground tabular-nums">{r.analysis.totalScore}</span>
                <ScoreDelta delta={r.delta} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
