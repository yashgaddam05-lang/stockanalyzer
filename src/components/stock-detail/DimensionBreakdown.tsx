import type { AnalysisResult } from '@/lib/analysis';
import { getScoreBg } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function DimensionBreakdown({ analysis }: { analysis: AnalysisResult }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Score breakdown</h2>
        <span className="text-[11px] text-muted-foreground">{analysis.dimensions.length} dimensions</span>
      </div>
      <ul className="divide-y divide-neutral-100">
        {analysis.dimensions.map((d) => {
          const score = d.score === null || !Number.isFinite(d.score) ? null : Math.round(d.score);
          return (
            <li key={d.key} className="py-3 first:pt-0 last:pb-0" data-dimension={d.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="font-medium text-neutral-900">
                  {d.label}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">weight {d.weight}%</span>
                </span>
                <span className="tabular-nums text-neutral-700">{score === null ? '—' : `${score}/100`}</span>
              </div>
              {score === null ? (
                <p className="rounded-md border border-dashed border-neutral-200 px-2 py-1 text-[12px] text-muted-foreground">
                  Data unavailable — weight re-distributed
                </p>
              ) : (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={score}
                  aria-label={`${d.label} ${score} of 100`}
                >
                  <div className={cn('h-full rounded-full', getScoreBg(score))} style={{ width: `${score}%` }} />
                </div>
              )}
              {d.drivers.length > 0 && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{d.drivers.join(' · ')}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
