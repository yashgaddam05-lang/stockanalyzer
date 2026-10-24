import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Trophy } from 'lucide-react';
import { SERIES, bestStrategy, loadTrackRecord, money, signedPct } from '@/lib/track-record';
import type { SeriesKey, TrackRecord } from '@/lib/track-record';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function useTrackRecord() {
  const [data, setData] = useState<TrackRecord | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    loadTrackRecord()
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);
  return { data, error };
}

const year = (d: string) => d.slice(0, 4);

function EquityChart({ data, visible, height = 360 }: { data: TrackRecord; visible: SeriesKey[]; height?: number }) {
  // One row per month-end date with each series' value.
  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of SERIES) {
      for (const p of data.curves[s.key]) {
        const row = byDate.get(p.d) ?? { d: p.d };
        row[s.key] = p.v * 100;
        byDate.set(p.d, row);
      }
    }
    return [...byDate.values()].sort((a, b) => (String(a.d) < String(b.d) ? -1 : 1));
  }, [data]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="d"
            tickFormatter={year}
            minTickGap={40}
            tick={{ fontSize: 11, fill: '#737373' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            scale="log"
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
            tick={{ fontSize: 11, fill: '#737373' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v: number, name: string) => [`$${Math.round(v).toLocaleString()}`, SERIES.find((s) => s.key === name)?.label ?? name]}
            labelFormatter={(d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend formatter={(name: string) => SERIES.find((s) => s.key === name)?.short ?? name} wrapperStyle={{ fontSize: 12 }} />
          {SERIES.filter((s) => visible.includes(s.key)).map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={s.key === 'spy' ? 2.5 : 2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Disclosure({ data }: { data: TrackRecord }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>Hypothetical, reconstructed results.</strong> No real money was invested. Scores were rebuilt for each quarter
        from data available at that time, but the stock list is today&apos;s ({data.universeSize} names), so companies that
        failed or left the index are missing. That survivorship bias inflates every line except the S&P 500, which is why the
        equal-weight line of the same stocks is shown. Returns include dividends but no fees, taxes or slippage. Past results do
        not predict future returns. Not investment advice.
      </p>
    </div>
  );
}

/** Compact version for the landing page. */
export function TrackRecordTeaser() {
  const { data } = useTrackRecord();
  if (!data) return <Skeleton className="h-[420px] w-full" />;
  const best = bestStrategy(data);
  const b = data.summary[best];
  const spy = data.summary.spy;
  return (
    <Card className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{SERIES.find((s) => s.key === best)?.label}</p>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">{signedPct(b.totalReturn, 0)}</p>
          <p className="text-[12px] text-neutral-500">{b.cagr.toFixed(1)}% a year</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">S&P 500</p>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">{signedPct(spy.totalReturn, 0)}</p>
          <p className="text-[12px] text-neutral-500">{spy.cagr.toFixed(1)}% a year</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">$10,000 in {year(data.start)}</p>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">{money(b.endValue)}</p>
          <p className="text-[12px] text-neutral-500">vs {money(spy.endValue)} in the S&P 500</p>
        </div>
      </div>
      <EquityChart data={data} visible={[best, 'universe', 'spy']} height={280} />
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Hypothetical, reconstructed point-in-time since {year(data.start)}; today&apos;s stock list, so survivorship bias applies.
        Not investment advice.{' '}
        <Link to="/track-record" className="font-medium text-neutral-900 underline underline-offset-2">
          Full results and method
        </Link>
      </p>
    </Card>
  );
}

export function TrackRecordView() {
  const { data, error } = useTrackRecord();
  const [visible, setVisible] = useState<SeriesKey[]>(['top10', 'top20', 'top50', 'universe', 'spy']);
  const [qIndex, setQIndex] = useState<number | null>(null);

  if (error) return <Card className="p-8 text-center text-sm text-muted-foreground">The track record could not be loaded. Please try again later.</Card>;
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[360px] w-full" />
      </div>
    );
  }

  const best = bestStrategy(data);
  const ranked = [...SERIES].sort((a, b) => data.summary[b.key].totalReturn - data.summary[a.key].totalReturn);
  const years = Object.keys(data.summary.spy.yearly);
  const quarter = data.quarters[qIndex ?? data.quarters.length - 1];
  const bestStats = data.summary[best];
  const spy = data.summary.spy;
  const beatSpy = bestStats.totalReturn > spy.totalReturn;
  const toggle = (k: SeriesKey) => setVisible((v) => (v.includes(k) ? (v.length > 1 ? v.filter((x) => x !== k) : v) : [...v, k]));

  return (
    <div className="space-y-8">
      {/* Headline */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white" aria-hidden="true">
          <Trophy className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-neutral-900">
            Best model: {SERIES.find((s) => s.key === best)?.label}, {signedPct(bestStats.totalReturn, 0)} since {year(data.start)}{' '}
            {beatSpy ? `vs ${signedPct(spy.totalReturn, 0)} for the S&P 500` : `, behind the S&P 500 at ${signedPct(spy.totalReturn, 0)}`}.
          </p>
          <p className="text-[13px] text-neutral-600">
            $10,000 would have grown to <strong>{money(bestStats.endValue)}</strong> vs {money(spy.endValue)} in the S&P 500 (
            {bestStats.cagr.toFixed(1)}% vs {spy.cagr.toFixed(1)}% a year), beating it in {data.beatRate[best]}% of quarters. Deepest
            drop: {bestStats.maxDrawdown.toFixed(0)}% vs {spy.maxDrawdown.toFixed(0)}%.
          </p>
        </div>
      </Card>

      {/* Chart */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Growth of $10,000</h2>
            <p className="text-[12px] text-muted-foreground">
              {year(data.start)} to {new Date(data.end + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}, log
              scale, rebalanced quarterly.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lines to show">
            {SERIES.map((s) => {
              const on = visible.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                    on ? 'border-neutral-900 text-neutral-900' : 'border-border text-neutral-400'
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? s.color : '#d4d4d4' }} aria-hidden="true" />
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>
        <EquityChart data={data} visible={visible} />
      </Card>

      {/* Model comparison */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Every model vs the S&P 500</h2>
          <p className="text-[12px] text-muted-foreground">Ranked by total return. Top N = the N highest 3x scores each quarter, equal weight.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 text-right font-medium">Total return</th>
                <th className="px-4 py-2 text-right font-medium">Per year</th>
                <th className="px-4 py-2 text-right font-medium">$10k became</th>
                <th className="px-4 py-2 text-right font-medium">Deepest drop</th>
                <th className="px-4 py-2 text-right font-medium">Volatility</th>
                <th className="px-4 py-2 text-right font-medium">Return / risk</th>
                <th className="px-4 py-2 text-right font-medium">Quarters beating S&P</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const st = data.summary[s.key];
                return (
                  <tr key={s.key} className={cn('border-b border-border last:border-0', s.key === best && 'bg-emerald-50/60')}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-neutral-900">
                        <span className="w-4 text-[11px] tabular-nums text-neutral-400">{i + 1}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        {s.label}
                        {s.key === best && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Best</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{signedPct(st.totalReturn, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{st.cagr.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(st.endValue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{st.maxDrawdown.toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{st.volatility.toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{st.sharpe?.toFixed(2) ?? '--'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.key in data.beatRate ? `${data.beatRate[s.key]}%` : '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Year by year */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Year by year</h2>
          <p className="text-[12px] text-muted-foreground">Green beat the S&P 500 that year. {year(data.end)} is year to date.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="border-y border-border bg-neutral-50 text-[11px] text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Model</th>
                {years.map((y) => (
                  <th key={y} className="px-3 py-2 text-right font-medium tabular-nums">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERIES.map((s) => (
                <tr key={s.key} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-900">{s.short}</td>
                  {years.map((y) => {
                    const v = data.summary[s.key].yearly[y];
                    const beat = s.key !== 'spy' && v > data.summary.spy.yearly[y];
                    return (
                      <td key={y} className={cn('px-3 py-2 text-right tabular-nums', v < 0 && 'text-red-700', beat && 'bg-emerald-50 font-medium text-emerald-800')}>
                        {v === undefined ? '--' : signedPct(v, 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Picks by quarter */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">What the model picked</h2>
            <p className="text-[12px] text-muted-foreground">
              The top 20 3x scores at the start of each quarter, using only data known that day.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-neutral-700">
            Quarter
            <select
              value={qIndex ?? data.quarters.length - 1}
              onChange={(e) => setQIndex(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
            >
              {data.quarters.map((q, i) => (
                <option key={q.date} value={i}>
                  {q.date}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-[12px]">
          {(['top10', 'top20', 'top50', 'universe', 'spy'] as SeriesKey[]).map((k) => (
            <span key={k} className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-700">
              {SERIES.find((s) => s.key === k)?.short}: <strong className={quarter.ret[k] < 0 ? 'text-red-700' : 'text-neutral-900'}>{signedPct(quarter.ret[k])}</strong>
            </span>
          ))}
          <span className="rounded-md px-2 py-1 text-neutral-500">{quarter.eligible} stocks scored</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {quarter.picks.map(([t, score], i) => (
            <Link
              key={t}
              to={`/app/stock/${encodeURIComponent(t)}`}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:border-neutral-400"
            >
              <span className="text-[13px] font-semibold text-neutral-900">
                <span className="mr-1.5 text-[11px] font-normal tabular-nums text-neutral-400">{i + 1}</span>
                {t}
              </span>
              <span className="text-[12px] tabular-nums text-neutral-600">{score}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Method */}
      <Card className="space-y-3 p-4 text-[13px] leading-relaxed text-neutral-700 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">How this was built</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            On the first trading day of every quarter since {year(data.start)}, each stock was scored with the live 3x model ({data.modelVersion}) using
            only data available that day.
          </li>
          <li>
            Fundamentals come from SEC filings, used only after their filing date: the latest annual report&apos;s revenue and
            earnings growth, margins, R&D and debt. Trailing P/E stands in for forward P/E. Momentum, volatility, beta and the 52-week
            range come from daily prices up to that day.
          </li>
          <li>Analyst price targets, pipeline counts and market regime fit have no reliable history, so those inputs are left out and their weight is re-spread, as the live model does.</li>
          <li>The top 10, 20 or 50 scores are held in equal weight until the next quarter. Returns use dividend-adjusted prices.</li>
          <li>
            The equal-weight line holds every scored stock. The gap between a Top N line and it shows what the score itself added; the
            gap between it and the S&P 500 is mostly survivorship bias.
          </li>
        </ul>
        <Link to="/methodology" className="inline-flex items-center gap-1 font-medium text-neutral-900 underline-offset-4 hover:underline">
          Full scoring methodology <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Card>

      <Disclosure data={data} />
    </div>
  );
}
