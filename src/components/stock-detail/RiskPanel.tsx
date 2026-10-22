import { AlertTriangle } from 'lucide-react';
import type { AnalysisResult } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';

const LABEL_STYLE: Record<AnalysisResult['riskLabel'], { bar: string; badge: string }> = {
  low: { bar: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  medium: { bar: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-800' },
  high: { bar: 'bg-red-500', badge: 'border-red-200 bg-red-50 text-red-800' },
  extreme: { bar: 'bg-red-700', badge: 'border-red-300 bg-red-100 text-red-900' },
};

export function RiskPanel({ analysis }: { analysis: AnalysisResult }) {
  const score = Math.max(0, Math.min(100, Math.round(analysis.riskScore)));
  const style = LABEL_STYLE[analysis.riskLabel];
  const label = analysis.riskLabel.charAt(0).toUpperCase() + analysis.riskLabel.slice(1);

  return (
    <Card className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          Risk score
          <InfoTip topic="risk" />
        </h2>
        <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', style.badge)}>{label} risk</span>
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums text-neutral-900">{score}</span>
          <span className="text-[13px] text-muted-foreground">/ 100</span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-100"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-label={`Risk score ${score} of 100, ${label} risk`}
        >
          <div className={cn('h-full rounded-full', style.bar)} style={{ width: `${score}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Lower risk</span>
          <span>Higher risk</span>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Scored independently of the 3x score. Higher means more ways to lose money.
        </p>
      </div>
      {analysis.riskDrivers.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Drivers</h3>
          <ul className="space-y-1 text-[13px] text-neutral-700">
            {analysis.riskDrivers.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-neutral-400" aria-hidden="true" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis.invalidationSignals.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Thesis invalidation signals
          </h3>
          <ul className="space-y-1 text-[13px] text-neutral-700">
            {analysis.invalidationSignals.map((s) => (
              <li key={s} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
