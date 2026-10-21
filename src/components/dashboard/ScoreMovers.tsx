import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { ChangeChip } from '@/components/dashboard/TopOpportunities';

const LIMIT = 5;

export interface ScoreMoversProps {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  title?: string;
}

export function ScoreMovers({ stocks, analyses, title = 'Score movers' }: ScoreMoversProps) {
  const { gainers, decliners } = useMemo(() => {
    const withChange = stocks.filter(
      (s): s is StockListItem & { score_change: number } =>
        typeof s.score_change === 'number' && Number.isFinite(s.score_change)
    );
    return {
      gainers: withChange.filter((s) => s.score_change > 0).sort((a, b) => b.score_change - a.score_change).slice(0, LIMIT),
      decliners: withChange.filter((s) => s.score_change < 0).sort((a, b) => a.score_change - b.score_change).slice(0, LIMIT),
    };
  }, [stocks]);

  const empty = gainers.length === 0 && decliners.length === 0;

  return (
    <section className="space-y-4" aria-labelledby="score-movers-heading">
      <h2 id="score-movers-heading" className="text-lg font-semibold tracking-tight text-neutral-900">
        {title}
      </h2>
      {empty ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Score changes appear after two data refreshes</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MoverList title="Biggest gainers" icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />} rows={gainers} analyses={analyses} />
          <MoverList title="Biggest decliners" icon={<TrendingDown className="h-3.5 w-3.5 text-red-600" />} rows={decliners} analyses={analyses} />
        </div>
      )}
    </section>
  );
}

function MoverList({
  title,
  icon,
  rows,
  analyses,
}: {
  title: string;
  icon: ReactNode;
  rows: StockListItem[];
  analyses: Record<string, AnalysisResult>;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">None this refresh.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((s) => (
            <li key={s.ticker} className="flex items-center gap-3 py-2">
              <Link to={`/app/stock/${encodeURIComponent(s.ticker)}`} className="text-sm font-semibold text-neutral-900 hover:underline">
                {s.ticker}
              </Link>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{s.company_name}</span>
              <span className="text-[12px] tabular-nums text-neutral-600">{analyses[s.ticker]?.totalScore ?? '--'}</span>
              <ChangeChip change={s.score_change} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
