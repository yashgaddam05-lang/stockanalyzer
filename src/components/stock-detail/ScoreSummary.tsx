import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { AnalysisResult } from '@/lib/analysis';
import { getScoreColor } from '@/lib/analysis';
import type { StockListItem } from '@/lib/supabase';
import { ScoreRing } from '@/components/stock/StockCard';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const CONFIDENCE_STYLE: Record<AnalysisResult['confidence'], string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-red-200 bg-red-50 text-red-800',
};

function ScoreChange({ change, previous }: { change: number | null; previous: number | null }) {
  if (change === null || !Number.isFinite(change)) {
    return <span className="text-[12px] text-muted-foreground">No previous snapshot yet</span>;
  }
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = change > 0 ? 'text-emerald-700' : change < 0 ? 'text-red-700' : 'text-neutral-500';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium', tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {change > 0 ? '+' : ''}
      {change} vs previous snapshot
      {previous !== null && Number.isFinite(previous) && <span className="font-normal text-muted-foreground">({previous})</span>}
    </span>
  );
}

export function ScoreSummary({ stock, analysis }: { stock: StockListItem; analysis: AnalysisResult }) {
  return (
    <Card className="flex h-full flex-col gap-4 p-6">
      <h2 className="text-sm font-semibold text-neutral-900">3x Opportunity Score</h2>
      <div className="flex items-center gap-5">
        <ScoreRing score={analysis.totalScore} size={72} />
        <div className="min-w-0 space-y-1">
          <p className={cn('text-lg font-semibold', getScoreColor(analysis.totalScore))}>{analysis.rating}</p>
          <p className="text-[13px] text-muted-foreground">
            {analysis.totalScore}/100 · est. horizon {analysis.timeframe}
          </p>
          <ScoreChange change={stock.score_change} previous={stock.previous_score} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={cn('rounded-md border px-2 py-0.5 font-medium', CONFIDENCE_STYLE[analysis.confidence])}>
          {analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)} confidence
        </span>
        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-medium text-neutral-600">
          Model {analysis.modelVersion}
        </span>
      </div>
    </Card>
  );
}
