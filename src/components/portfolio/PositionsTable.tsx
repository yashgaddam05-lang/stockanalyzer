import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import type { ValuedPosition } from '@/lib/portfolio';
import { getRiskColor, getScoreColor } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  formatMoney,
  formatPct,
  formatShares,
  formatSignedMoney,
  plColor,
} from '@/components/portfolio/portfolio-format';

export interface PositionRowMeta {
  score: number | null;
  riskScore: number | null;
  riskLabel: string | null;
  companyName: string | null;
}

interface PositionsTableProps {
  positions: ValuedPosition[];
  meta: Record<string, PositionRowMeta>;
  pendingIds: Set<string>;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

const TH = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
const THR = `${TH} text-right`;

export function PositionsTable({ positions, meta, pendingIds, onEdit, onRemove }: PositionsTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">Simulated positions valued at last refreshed prices</caption>
          <thead className="border-b border-border bg-neutral-50">
            <tr>
              <th scope="col" className={TH}>Ticker</th>
              <th scope="col" className={THR}>Shares</th>
              <th scope="col" className={THR}>Cost basis</th>
              <th scope="col" className={THR}>Price</th>
              <th scope="col" className={THR}>Market value</th>
              <th scope="col" className={THR}>P/L</th>
              <th scope="col" className={THR}>P/L %</th>
              <th scope="col" className={THR}>Weight</th>
              <th scope="col" className={THR}>3x score</th>
              <th scope="col" className={TH}>Risk</th>
              <th scope="col" className={THR}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions.map((p) => {
              const m = meta[p.id];
              const pending = pendingIds.has(p.id);
              return (
                <tr key={p.id} className={cn('transition-colors hover:bg-neutral-50', pending && 'opacity-50')}>
                  <td className="px-3 py-3">
                    <Link
                      to={`/app/stock/${encodeURIComponent(p.ticker)}`}
                      className="font-semibold text-neutral-900 underline-offset-2 hover:underline"
                    >
                      {p.ticker}
                    </Link>
                    <p className="max-w-[12rem] truncate text-xs text-muted-foreground">
                      {m?.companyName ?? 'Not in universe'}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-800">{formatShares(p.shares)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-800">{formatMoney(p.cost_basis)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-800">
                    {p.price === null ? <span className="text-xs text-amber-700">Unpriced</span> : formatMoney(p.price)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{formatMoney(p.market_value)}</td>
                  <td className={cn('px-3 py-3 text-right tabular-nums', plColor(p.unrealized_pl))}>
                    {formatSignedMoney(p.unrealized_pl)}
                  </td>
                  <td className={cn('px-3 py-3 text-right tabular-nums', plColor(p.unrealized_pl_pct))}>
                    {formatPct(p.unrealized_pl_pct, true)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-800">{formatPct(p.weight)}</td>
                  <td className="px-3 py-3 text-right">
                    {m?.score !== null && m?.score !== undefined ? (
                      <span className={cn('font-semibold tabular-nums', getScoreColor(m.score))}>{Math.round(m.score)}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {m?.riskLabel ? (
                      <div className="flex items-center gap-1.5">
                        {m.riskScore !== null && <span className="tabular-nums text-neutral-800">{m.riskScore}</span>}
                        <span
                          className={cn(
                            'rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize',
                            getRiskColor(m.riskLabel)
                          )}
                        >
                          {m.riskLabel}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={pending}
                        aria-label={`Edit ${p.ticker} position`}
                        onClick={() => onEdit(p.id)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={pending}
                        aria-label={`Remove ${p.ticker} position`}
                        onClick={() => onRemove(p.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
