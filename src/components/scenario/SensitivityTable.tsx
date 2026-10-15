import type { SensitivityTable as SensitivityData } from '@/lib/scenario';
import { cn } from '@/lib/utils';

export interface SensitivityTableProps {
  table: SensitivityData;
  target: number;
  /** Highlights the cell matching the user's current inputs. */
  baseGrowthPct?: number;
  baseMultipleChangePct?: number;
}

function signedPct(n: number): string {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtTarget(t: number): string {
  return `${Number.isInteger(t) ? t : t.toFixed(1)}x`;
}

export function SensitivityTable({ table, target, baseGrowthPct, baseMultipleChangePct }: SensitivityTableProps) {
  const isBase = (r: number, c: number) =>
    baseGrowthPct !== undefined &&
    baseMultipleChangePct !== undefined &&
    Math.abs(r - baseGrowthPct) < 1e-9 &&
    Math.abs(c - baseMultipleChangePct) < 1e-9;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px] border-collapse text-[12px] tabular-nums">
        <caption className="caption-top px-3 py-2 text-left text-[12px] text-muted-foreground">
          Projected price multiple by annual revenue growth (rows) and P/S multiple change (columns). Green cells reach
          the {fmtTarget(target)} target; red cells lose money.
        </caption>
        <thead>
          <tr className="border-y border-border bg-neutral-50">
            <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">
              Growth / P/S change
            </th>
            {table.cols.map((c, ci) => (
              <th key={ci} scope="col" className="px-3 py-2 text-right font-medium text-neutral-600">
                {signedPct(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border last:border-b-0">
              <th scope="row" className="whitespace-nowrap bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">
                {signedPct(r)}/yr
              </th>
              {table.cols.map((c, ci) => {
                const v = table.cells[ri]?.[ci] ?? null;
                const hit = v !== null && v >= target;
                const loss = v !== null && v < 1;
                const base = isBase(r, c);
                return (
                  <td
                    key={ci}
                    className={cn(
                      'px-3 py-2 text-right',
                      hit && 'bg-emerald-50 font-medium text-emerald-800',
                      loss && 'bg-red-50 text-red-800',
                      !hit && !loss && 'text-neutral-800',
                      base && 'outline outline-2 -outline-offset-2 outline-neutral-900',
                    )}
                    aria-label={base ? `${v === null ? 'n/a' : `${v.toFixed(2)}x`}, current inputs` : undefined}
                  >
                    {v === null ? <span className="text-muted-foreground">n/a</span> : `${v.toFixed(2)}x`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
