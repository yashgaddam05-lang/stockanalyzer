import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export function ScoreDelta({ delta, className = '' }: { delta: number | null; className?: string }) {
  if (delta === null) return null;
  if (delta === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums ${className}`} title="No change since last snapshot">
        <Minus className="w-3 h-3" />0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-red-600'} ${className}`}
      title="Change since last score snapshot"
    >
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? '+' : ''}{delta}
    </span>
  );
}
