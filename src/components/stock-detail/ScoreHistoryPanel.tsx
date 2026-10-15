import { useEffect, useState } from 'react';
import { getScoreHistory } from '@/lib/api';
import type { ScoreHistoryEntry } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; entries: ScoreHistoryEntry[] };

function Sparkline({ values }: { values: number[] }) {
  const w = 240;
  const h = 48;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full max-w-xs"
      role="img"
      aria-label={`Score trend from ${values[0]} to ${values[values.length - 1]} over ${values.length} snapshots`}
    >
      <path d={d} fill="none" stroke="#404040" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="#171717" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ScoreHistoryPanel({ ticker }: { ticker: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getScoreHistory(ticker, 30)
      .then((res) => {
        if (cancelled) return;
        const entries = [...(res.entries ?? [])]
          .filter((e) => Number.isFinite(e.three_x_score))
          .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
        if (!res.available || entries.length < 2) setState({ status: 'empty' });
        else setState({ status: 'ready', entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'empty' });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <Card className="p-6">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Score history</h2>
      {state.status === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full max-w-xs" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {state.status === 'empty' && (
        <p className="text-[13px] text-muted-foreground">History starts after the next data refresh</p>
      )}
      {state.status === 'ready' && (
        <>
          <Sparkline values={state.entries.map((e) => e.three_x_score)} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Date</th>
                  <th scope="col" className="py-1.5 text-right font-medium">3x score</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Risk</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {state.entries
                  .slice(-10)
                  .reverse()
                  .map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 text-neutral-700">{formatDate(e.captured_at)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-neutral-900">{Math.round(e.three_x_score)}</td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-700">
                        {e.risk_score === null || !Number.isFinite(e.risk_score) ? '—' : Math.round(e.risk_score)}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">{e.model_version || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
