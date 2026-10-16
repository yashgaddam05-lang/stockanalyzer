import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DataQualityCheck } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/data-health/StatusBadge';
import { CHECK_LABELS } from '@/components/data-health/format';

interface ChecksTableProps {
  checks: DataQualityCheck[];
}

const ORDER = { fail: 0, warn: 1, ok: 2 } as const;

export function ChecksTable({ checks }: ChecksTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sorted = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (sorted.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No checks were returned.</Card>;
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="checks-table">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-3 sm:px-6">Check</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Value</th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">Detail</th>
            <th scope="col" className="px-4 py-3 text-right sm:pr-6">Affected</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((check) => {
            const affected = check.affected ?? [];
            const isOpen = expanded.has(check.id);
            const panelId = `affected-${check.id}`;
            return (
              <Fragment key={check.id}>
                <tr className="border-b border-neutral-100 align-top last:border-0" data-testid="check-row">
                  <td className="px-4 py-3 font-medium text-neutral-900 sm:px-6">
                    {check.label}
                    <p className="mt-1 text-[12px] font-normal text-muted-foreground md:hidden">{check.detail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={check.status} label={CHECK_LABELS[check.status]} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-neutral-700">{check.value}</td>
                  <td className="hidden px-4 py-3 text-[13px] text-muted-foreground md:table-cell">{check.detail}</td>
                  <td className="px-4 py-3 text-right sm:pr-6">
                    {affected.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggle(check.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-neutral-700 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                        {affected.length} {affected.length === 1 ? 'ticker' : 'tickers'}
                      </button>
                    ) : (
                      <span className="text-[13px] text-neutral-400">None</span>
                    )}
                  </td>
                </tr>
                {isOpen && affected.length > 0 && (
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <td colSpan={5} className="px-4 py-3 sm:px-6">
                      <ul id={panelId} className="flex flex-wrap gap-2" aria-label={`Tickers affected by ${check.label}`}>
                        {affected.map((ticker) => (
                          <li key={ticker}>
                            <Link
                              to={`/app/stock/${encodeURIComponent(ticker)}`}
                              className="inline-block rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[12px] font-medium text-neutral-800 hover:border-neutral-400"
                            >
                              {ticker}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
