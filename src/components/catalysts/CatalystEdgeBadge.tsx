import type { CatalystEdge } from '@/lib/scoring/catalyst-edge';
import { cn } from '@/lib/utils';

function evClass(ev: number): string {
  if (ev >= 3) return 'bg-emerald-600 text-white';
  if (ev >= 1) return 'bg-emerald-100 text-emerald-900';
  if (ev > -1) return 'bg-neutral-100 text-neutral-700';
  return 'bg-red-100 text-red-900';
}

const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

/** Expected value + win probability for one catalyst, with an expandable "why". */
export function CatalystEdgeBadge({ edge, rank }: { edge: CatalystEdge; rank?: number }) {
  const pct = Math.round(edge.pGood * 100);
  return (
    <div
      className="order-last basis-full space-y-1 pl-[108px] sm:order-none sm:w-44 sm:shrink-0 sm:basis-auto sm:pl-0 sm:text-right"
      data-testid="catalyst-edge"
    >
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {rank !== undefined && <span className="text-[11px] font-medium text-neutral-400 tabular-nums">#{rank}</span>}
        <span
          className={cn('rounded px-1.5 py-0.5 text-[12px] font-semibold tabular-nums', evClass(edge.ev))}
          aria-label={`Expected value ${signed(edge.ev)}`}
        >
          EV {signed(edge.ev)}
        </span>
        <span
          className="rounded border border-neutral-200 px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-neutral-800"
          aria-label={`${pct}% chance of a good outcome`}
        >
          {pct}% good
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        +{edge.upMove}% / −{edge.downMove}% · {edge.confidence} conf.
      </p>
      <details className="text-left text-[11px] text-muted-foreground">
        <summary className="cursor-pointer hover:text-neutral-900 sm:text-right">Why</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {edge.drivers.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
