import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { getSmartMoney } from '@/lib/api';
import {
  isHealthcareSector,
  MIN_INSIDER_BUY_USD,
  quarterLabel,
  thirteenFDueDate,
  type HolderChange,
  type SmartMoneyResponse,
} from '@/lib/smart-money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate, formatPrice, formatShares } from '@/components/filings/filings-format';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SmartMoneyResponse };

const CHANGE_STYLE: Record<HolderChange, { label: string; cls: string }> = {
  new: { label: 'New position', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  added: { label: 'Added', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  held: { label: 'Held', cls: 'border-border bg-neutral-50 text-neutral-700' },
  trimmed: { label: 'Trimmed', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  exited: { label: 'Sold out', cls: 'border-red-200 bg-red-50 text-red-800' },
};

const compactUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function QoQ({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-neutral-600">
        <Minus className="h-4 w-4" aria-hidden="true" />
        No change
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5', up ? 'text-emerald-700' : 'text-red-700')}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {up ? '+' : ''}
      {delta}
    </span>
  );
}

export function SmartMoneyPanel({ ticker, sector }: { ticker: string; sector: string | null }) {
  // Keyed by ticker so a stale result is never rendered for a new ticker.
  const [result, setResult] = useState<{ ticker: string; state: State } | null>(null);
  const upper = ticker.toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setResult({ ticker: upper, state: { status: 'loading' } });
    getSmartMoney(upper)
      .then((data) => {
        if (!cancelled) setResult({ ticker: upper, state: { status: 'ready', data } });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            ticker: upper,
            state: { status: 'error', message: err instanceof Error ? err.message : 'Could not load smart money data.' },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [upper]);

  const state: State = result && result.ticker === upper ? result.state : { status: 'loading' };
  const data = state.status === 'ready' ? state.data : null;
  const healthcare = isHealthcareSector(sector);
  const holders = data?.holder_detail.filter((h) => h.shares > 0) ?? [];
  const exited = data?.holder_detail.filter((h) => h.change === 'exited') ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Smart money</CardTitle>
        <CardDescription className="text-[12px]">
          Specialist biotech and healthcare funds that own {upper}, and C-suite open-market buying.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.status === 'loading' ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading smart money data">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : state.status === 'error' ? (
          <p className="py-6 text-center text-[13px] text-red-700" role="alert">
            {state.message}
          </p>
        ) : !data ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Specialist holders"
                value={data.available ? data.holders : '-'}
                sub={`of ${data.managers_tracked} funds tracked${data.period ? `, ${quarterLabel(data.period)}` : ''}`}
              />
              <Stat
                label="Change vs prior quarter"
                value={data.available ? <QoQ delta={data.holders - data.holders_prev} /> : '-'}
                sub={data.available ? `${data.new_holders} new, ${data.exited_holders} sold out, ${data.added} added, ${data.trimmed} trimmed` : undefined}
              />
              <Stat
                label={`C-suite buys, ${data.insider_window_days}d`}
                value={data.csuite_buys.length}
                sub={data.csuite_buys.length ? `${compactUsd.format(data.csuite_buy_value)} bought on the open market` : `No open-market buys of ${compactUsd.format(MIN_INSIDER_BUY_USD)}+`}
              />
            </div>

            {!healthcare && (
              <p className="text-[12px] text-muted-foreground">
                The tracked funds invest only in health care, so few or no holders is expected outside the sector. Insider buys apply to every stock.
              </p>
            )}

            {holders.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Holders</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {holders.map((h) => {
                    const style = CHANGE_STYLE[h.change];
                    return (
                      <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                        <span className="truncate text-neutral-900">{h.name}</span>
                        <span className="flex flex-shrink-0 items-center gap-2">
                          <span className="tabular-nums text-neutral-600">{formatShares(h.shares)} sh</span>
                          <span className={cn('rounded-md border px-1.5 py-0.5 text-[11px] font-medium', style.cls)}>{style.label}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {exited.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                Sold out last quarter: {exited.map((h) => h.name).join(', ')}.
              </p>
            )}

            {data.csuite_buys.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">C-suite purchases</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.csuite_buys.map((b, i) => (
                    <li
                      key={`${b.owner_name}-${b.transaction_date}-${i}`}
                      className="flex flex-col gap-1 px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-neutral-900">{b.owner_name}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{b.owner_relationship}</span>
                      </span>
                      <span className="flex-shrink-0 tabular-nums sm:text-right">
                        <span className="block text-neutral-900">{b.value != null ? compactUsd.format(b.value) : '-'}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {formatShares(b.shares)} at {formatPrice(b.price)}, {formatDate(b.transaction_date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!data.available && (
              <p className="text-center text-[13px] text-muted-foreground">Fund holdings for this ticker have not been synced yet.</p>
            )}
          </>
        )}
        <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
          Source: SEC 13F-HR and Form 4. 13F holdings are reported up to 45 days after quarter end
          {data?.period ? ` (${quarterLabel(data.period)} was due ${formatDate(thirteenFDueDate(data.period))})` : ''}, so they can be
          45 to 135 days old and the fund may have traded since. Index funds are excluded on purpose. Informational only.
        </p>
      </CardContent>
    </Card>
  );
}
