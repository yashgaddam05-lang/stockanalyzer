import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketRegimeSnapshot } from '@/lib/supabase';
import { fmtDate, isFiniteNumber } from '@/components/regime/regime-format';

export function RiskAppetiteChart({ history }: { history: MarketRegimeSnapshot[] }) {
  const data = useMemo(
    () =>
      [...history]
        .filter((h) => h && typeof h.as_of === 'string')
        .sort((a, b) => (a.as_of < b.as_of ? -1 : a.as_of > b.as_of ? 1 : 0))
        .map((h) => ({ as_of: h.as_of, risk_appetite: isFiniteNumber(h.risk_appetite) ? h.risk_appetite : null })),
    [history]
  );
  const points = data.filter((d) => d.risk_appetite !== null).length;

  if (points < 2) {
    return <p className="text-[13px] text-muted-foreground">History builds up as daily snapshots accumulate.</p>;
  }

  return (
    <div className="h-56 w-full" role="img" aria-label={`Risk appetite history over ${points} daily snapshots`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#f5f5f5" vertical={false} />
          <XAxis
            dataKey="as_of"
            tickFormatter={(v: string) => fmtDate(v).replace(/, \d{4}$/, '')}
            tick={{ fontSize: 11, fill: '#737373' }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis domain={[0, 100]} ticks={[0, 40, 60, 100]} tick={{ fontSize: 11, fill: '#737373' }} tickLine={false} axisLine={false} />
          <ReferenceLine y={60} stroke="#a7f3d0" strokeDasharray="4 4" />
          <ReferenceLine y={40} stroke="#fde68a" strokeDasharray="4 4" />
          <Tooltip
            formatter={(value: number) => [Math.round(value), 'Risk appetite']}
            labelFormatter={(label: string) => fmtDate(label)}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e5e5' }}
          />
          <Line type="monotone" dataKey="risk_appetite" stroke="#262626" strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
