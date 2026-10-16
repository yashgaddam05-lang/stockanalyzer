import type { BacktestResponse } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { formatCount, formatDate, sampleDates } from '@/components/backtest/format';

export function SampleSizePanel({ sample, horizon }: { sample: BacktestResponse['sample']; horizon: number }) {
  const items = [
    { label: 'Observations', value: formatCount(sample.observations), hint: `Score + ${horizon}-day forward return pairs` },
    { label: 'Score dates', value: formatCount(sampleDates(sample)), hint: 'Distinct days scores were stored' },
    { label: 'Tickers', value: formatCount(sample.tickers), hint: 'Unique stocks in the sample' },
    {
      label: 'Date range',
      value: sample.first_date ? `${formatDate(sample.first_date)} – ${formatDate(sample.last_date)}` : '—',
      hint: 'First to last score date used',
    },
  ];
  return (
    <Card className="p-6" aria-labelledby="backtest-sample-heading">
      <h2 id="backtest-sample-heading" className="mb-4 text-sm font-semibold text-neutral-900">
        Sample size
      </h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-neutral-900">{item.value}</dd>
            <dd className="text-[12px] text-muted-foreground">{item.hint}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
