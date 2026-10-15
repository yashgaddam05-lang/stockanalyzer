import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { WatchlistRow } from '@/components/watchlists/WatchlistItemsTable';

const MAX_SECTORS = 6;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function WatchlistSummary({ rows }: { rows: WatchlistRow[] }) {
  const { avgScore, avgRisk, sectors } = useMemo(() => {
    const scored = rows.flatMap((r) => (r.analysis ? [r.analysis] : []));
    const counts = new Map<string, number>();
    for (const row of rows) {
      const sector = row.stock?.sector || 'Unknown';
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, MAX_SECTORS);
    const rest = sorted.slice(MAX_SECTORS).reduce((sum, [, n]) => sum + n, 0);
    if (rest > 0) top.push(['Other', rest]);
    return {
      avgScore: average(scored.map((a) => a.totalScore)),
      avgRisk: average(scored.map((a) => a.riskScore)),
      sectors: top,
    };
  }, [rows]);

  const total = rows.length;

  return (
    <Card className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-[auto_1fr] sm:p-6">
      <dl className="grid grid-cols-3 gap-4 sm:gap-8">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Items</dt>
          <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{total}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg 3x score</dt>
          <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{avgScore ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg risk</dt>
          <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{avgRisk ?? '-'}</dd>
        </div>
      </dl>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sector exposure</p>
        {total === 0 ? (
          <p className="text-xs text-muted-foreground">No items yet.</p>
        ) : (
          <ul className="space-y-1">
            {sectors.map(([sector, count]) => {
              const pct = Math.round((count / total) * 100);
              return (
                <li key={sector} className="grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-neutral-700">{sector}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                    <span className="block h-full rounded-full bg-neutral-700" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-neutral-500">{pct}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
