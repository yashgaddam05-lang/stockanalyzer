import { Hourglass } from 'lucide-react';
import type { BacktestResponse } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { MIN_CAPTURE_DATES, formatCount } from '@/components/backtest/format';

export function InsufficientHistory({ data }: { data: BacktestResponse }) {
  const { observations, dates } = data.sample;
  const needObs = Math.max(0, data.min_observations - observations);
  const needDates = Math.max(0, MIN_CAPTURE_DATES - dates);
  return (
    <Card className="border-amber-200 bg-amber-50/60 p-6" role="status">
      <div className="flex items-start gap-3">
        <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900">Not enough history yet</h2>
          <p className="text-[13px] leading-relaxed text-neutral-700">
            There are {formatCount(observations)} observations across {formatCount(dates)} score dates for the{' '}
            {data.horizon_days}-day horizon. Results become meaningful once there are at least{' '}
            {formatCount(data.min_observations)} observations and at least {MIN_CAPTURE_DATES} distinct score capture
            dates, each with a completed {data.horizon_days}-trading-day forward window.
          </p>
          <p className="text-[13px] leading-relaxed text-neutral-700">
            Still needed: {needObs > 0 ? `${formatCount(needObs)} more observations` : 'observation count met'}
            {', '}
            {needDates > 0 ? `${needDates} more score date${needDates === 1 ? '' : 's'}` : 'date count met'}. Scores are
            stored on each data refresh, so this fills in over time. Shorter horizons fill in first.
          </p>
        </div>
      </div>
    </Card>
  );
}
