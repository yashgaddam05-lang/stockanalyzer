import type { BacktestResponse } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { formatNumber, formatPct, returnTone } from '@/components/backtest/format';
import { cn } from '@/lib/utils';

/** Recombines per-band means into an overall mean, weighting each band by the count its mean was taken over. */
function weightedMean(
  buckets: BacktestResponse['buckets'],
  key: 'hit_rate' | 'mean_excess_vs_spy',
  weight: (b: BacktestResponse['buckets'][number]) => number,
): number | null {
  let sum = 0;
  let n = 0;
  for (const b of buckets) {
    const v = b[key];
    const w = weight(b);
    if (v === null || !Number.isFinite(v) || !(w > 0)) continue;
    sum += v * w;
    n += w;
  }
  return n > 0 ? sum / n : null;
}

export function SummaryStats({ data }: { data: BacktestResponse }) {
  const h = data.horizon_days;
  const hit = weightedMean(data.buckets, 'hit_rate', (b) => b.n);
  const excess = weightedMean(data.buckets, 'mean_excess_vs_spy', (b) => b.n_excess);
  const tvb = data.top_vs_bottom;
  const ic = data.information_coefficient;

  const stats = [
    {
      label: 'Hit rate',
      value: formatPct(hit, { signed: false, digits: 0 }),
      tone: 'text-neutral-900',
      explain: `Share of all observations with a positive return ${h} trading days after the score was recorded. Per-band rates are in the table.`,
    },
    {
      label: 'Mean excess vs SPY',
      value: formatPct(excess),
      tone: returnTone(excess),
      explain: `Average ${h}-day return minus SPY's return over the same window, across observations with SPY data. Positive means scored stocks beat the index on average.`,
    },
    {
      label: 'Top vs bottom spread',
      value: tvb ? formatPct(tvb.spread) : '—',
      tone: returnTone(tvb?.spread),
      explain: tvb
        ? `Mean return of the top-scored fifth (n=${tvb.n_top}) minus the bottom fifth (n=${tvb.n_bottom}). Positive means higher scores were followed by higher returns.`
        : 'Not computed: each side needs enough observations. Positive values would mean higher scores were followed by higher returns.',
    },
    {
      label: 'Information coefficient',
      value: formatNumber(ic),
      tone: 'text-neutral-900',
      explain:
        'Average rank correlation between score and forward return on each date, from -1 to 1. Around 0 means no relationship; 0.05 or more is often considered meaningful.',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="space-y-1.5 p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className={cn('text-2xl font-semibold tabular-nums', s.tone)}>{s.value}</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{s.explain}</p>
        </Card>
      ))}
    </div>
  );
}
