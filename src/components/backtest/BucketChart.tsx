import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BacktestBucket } from '@/lib/supabase';
import { formatPct } from '@/components/backtest/format';

const POSITIVE = '#171717';
const NEGATIVE = '#b91c1c';

interface Datum {
  label: string;
  mean: number;
  n: number;
}

export default function BucketChart({ buckets, horizon }: { buckets: BacktestBucket[]; horizon: number }) {
  const data: Datum[] = buckets
    .filter((b) => b.mean_return !== null && Number.isFinite(b.mean_return))
    .map((b) => ({ label: b.label, mean: b.mean_return as number, n: b.n }));

  if (data.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No score band has enough observations to chart.</p>;
  }

  const summary = data.map((d) => `${d.label}: ${formatPct(d.mean)} (n=${d.n})`).join('; ');

  return (
    <div className="h-72 w-full" role="img" aria-label={`Mean ${horizon}-day forward return by score band. ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e5e5" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#525252' }} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} />
          <YAxis
            tickFormatter={(v: number) => formatPct(v, { digits: 0 })}
            tick={{ fontSize: 12, fill: '#525252' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <ReferenceLine y={0} stroke="#a3a3a3" />
          <Tooltip
            cursor={{ fill: '#f5f5f5' }}
            formatter={(value: number) => [formatPct(value), 'Mean return']}
            labelFormatter={(label: string) => {
              const d = data.find((x) => x.label === label);
              return d ? `${label} (n=${d.n})` : label;
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e5e5' }}
          />
          <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.mean < 0 ? NEGATIVE : POSITIVE} />
            ))}
            <LabelList dataKey="n" position="top" formatter={(n: number) => `n=${n}`} style={{ fontSize: 11, fill: '#525252' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
