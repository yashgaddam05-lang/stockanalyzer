import { cn } from '@/lib/utils';
import { isFiniteNumber } from '@/components/regime/regime-format';

/** Horizontal 0-100 gauge with risk-off (<=40) and risk-on (>=60) zones marked. */
export function RiskAppetiteGauge({ value, className }: { value: number | null; className?: string }) {
  const v = isFiniteNumber(value) ? Math.max(0, Math.min(100, value)) : null;
  const fill = v === null ? 'bg-neutral-300' : v >= 60 ? 'bg-emerald-500' : v <= 40 ? 'bg-amber-500' : 'bg-neutral-500';
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-semibold tabular-nums text-neutral-900">{v === null ? '—' : Math.round(v)}</span>
        <span className="text-[12px] text-muted-foreground">/ 100</span>
      </div>
      <div
        className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
        role="meter"
        aria-label="Risk appetite"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v ?? undefined}
        aria-valuetext={v === null ? 'Not available' : `${Math.round(v)} out of 100`}
      >
        <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${v ?? 0}%` }} />
        <span className="absolute inset-y-0 left-[40%] w-px bg-white" aria-hidden="true" />
        <span className="absolute inset-y-0 left-[60%] w-px bg-white" aria-hidden="true" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden="true">
        <span>Risk-off</span>
        <span>Neutral</span>
        <span>Risk-on</span>
      </div>
    </div>
  );
}
