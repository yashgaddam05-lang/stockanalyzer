import type { BacktestBucket } from '@/lib/supabase';
import { formatCount, formatPct, returnTone } from '@/components/backtest/format';
import { cn } from '@/lib/utils';

export function BucketTable({ buckets, muted = false }: { buckets: BacktestBucket[]; muted?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 font-medium">Score band</th>
            <th scope="col" className="py-2 text-right font-medium">n</th>
            <th scope="col" className="py-2 text-right font-medium">Mean return</th>
            <th scope="col" className="py-2 text-right font-medium">Median</th>
            <th scope="col" className="py-2 text-right font-medium">Hit rate</th>
            <th scope="col" className="py-2 text-right font-medium">Excess vs SPY</th>
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-neutral-100', muted && 'text-neutral-500')}>
          {buckets.map((b) => (
            <tr key={b.label}>
              <th scope="row" className="py-2 font-medium text-neutral-900">
                {b.label}
                <span className="ml-2 font-normal text-muted-foreground">
                  {b.min_score}–{b.max_score}
                </span>
              </th>
              <td className="py-2 text-right tabular-nums">{formatCount(b.n)}</td>
              <td className={cn('py-2 text-right tabular-nums', !muted && returnTone(b.mean_return))}>{formatPct(b.mean_return)}</td>
              <td className={cn('py-2 text-right tabular-nums', !muted && returnTone(b.median_return))}>{formatPct(b.median_return)}</td>
              <td className="py-2 text-right tabular-nums">{formatPct(b.hit_rate, { signed: false, digits: 0 })}</td>
              <td className={cn('py-2 text-right tabular-nums', !muted && returnTone(b.mean_excess_vs_spy))}>
                {formatPct(b.mean_excess_vs_spy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
