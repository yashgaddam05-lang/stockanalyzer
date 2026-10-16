import type { InsiderSummary, InsiderTransaction } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  describeCode,
  formatDate,
  formatPrice,
  formatShares,
  formatSignedShares,
  formatSignedValue,
  formatValue,
} from '@/components/filings/filings-format';

function signClass(n: number): string {
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-red-700';
  return 'text-foreground';
}

function SummaryStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-[15px] font-semibold tabular-nums', className)}>{value}</p>
    </div>
  );
}

export function InsiderActivity({
  summary,
  transactions,
}: {
  summary: InsiderSummary | null;
  transactions: InsiderTransaction[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {summary ? (
        <div>
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Last {summary.window_days} days</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryStat label="Buys" value={String(summary.buys)} />
            <SummaryStat label="Sells" value={String(summary.sells)} />
            <SummaryStat label="Net shares" value={formatSignedShares(summary.net_shares)} className={signClass(summary.net_shares)} />
            <SummaryStat label="Net value" value={formatSignedValue(summary.net_value)} className={signClass(summary.net_value)} />
          </div>
        </div>
      ) : null}

      <p className="text-[12px] text-muted-foreground">
        Open-market purchases (P) are the most informative signal. Awards and tax withholding are routine compensation
        events.
      </p>

      {transactions.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No insider transactions on record.</p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-2 py-2 font-medium">Date</th>
                <th scope="col" className="px-2 py-2 font-medium">Insider</th>
                <th scope="col" className="px-2 py-2 font-medium">Relationship</th>
                <th scope="col" className="px-2 py-2 font-medium">Type</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Shares</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Price</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((t) => {
                const ad = t.acquired_disposed;
                const adClass = ad === 'A' ? 'text-emerald-700' : ad === 'D' ? 'text-red-700' : 'text-foreground';
                const isPurchase = t.transaction_code?.toUpperCase() === 'P';
                return (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">
                      {formatDate(t.transaction_date)}
                    </td>
                    <td className="px-2 py-2 font-medium text-foreground">{t.owner_name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{t.owner_relationship ?? '-'}</td>
                    <td className={cn('whitespace-nowrap px-2 py-2', isPurchase && 'font-semibold')}>
                      {describeCode(t.transaction_code)}
                      {t.transaction_code ? (
                        <span className="ml-1 font-mono text-[11px] text-muted-foreground">({t.transaction_code})</span>
                      ) : null}
                    </td>
                    <td className={cn('whitespace-nowrap px-2 py-2 text-right tabular-nums', adClass)}>
                      {ad ? (
                        <span className="sr-only">{ad === 'A' ? 'Acquired ' : 'Disposed '}</span>
                      ) : null}
                      {ad === 'A' ? '+' : ad === 'D' ? '-' : ''}
                      {formatShares(t.shares)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatPrice(t.price)}</td>
                    <td className={cn('whitespace-nowrap px-2 py-2 text-right tabular-nums', adClass)}>
                      {formatValue(t.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
