import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Bot, Check, Copy, Loader2 } from 'lucide-react';
import { BOTS, botPicks } from '@/lib/bots';
import type { BotCandidate, BotDef, BotId } from '@/lib/bots';
import { ApiError, createPortfolio, importPositions } from '@/lib/api';
import { useStocks } from '@/components/data/StocksProvider';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Stats { totalReturn: number; cagr: number; volatility: number; maxDrawdown: number; endValue: number; yearly: Record<string, number> }
interface Proj { low: number; mid: number; high: number; lossOdds: number }
interface BotsData {
  start: string;
  end: string;
  haircutPct: number;
  indexCoverage: { avg: number; first: number; last: number };
  spy: { summary: Stats; curve: { d: string; v: number }[]; projection: { y5: Proj; y10: Proj } };
  bots: { id: BotId; summary: Stats; curve: { d: string; v: number }[]; beatRate: number; avgHoldings: number; projection: { y5: Proj; y10: Proj } }[];
}

let cache: Promise<BotsData> | null = null;
const loadBots = () => {
  cache ??= fetch('/data/bots.json').then((r) => {
    if (!r.ok) throw new Error('unavailable');
    return r.json() as Promise<BotsData>;
  });
  cache.catch(() => (cache = null));
  return cache;
};

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
const year = (d: string) => d.slice(0, 4);
const SPY_COLOR = '#d97706';

function RangeBar({ label, p, max, color }: { label: string; p: Proj; max: number; color: string }) {
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-neutral-900">{label}</span>
        <span className="tabular-nums text-neutral-600">
          <strong className="text-neutral-900">{usd(p.mid)}</strong> likely · {usd(p.low)} to {usd(p.high)}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-neutral-100">
        <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: x(p.low), width: `calc(${x(p.high)} - ${x(p.low)})`, background: color }} />
        <div className="absolute inset-y-[-2px] w-1 rounded-full" style={{ left: x(p.mid), background: color }} />
        <div className="absolute inset-y-0 w-px bg-neutral-400" style={{ left: x(10000) }} title="$10,000 starting value" />
      </div>
      <p className="text-[11px] text-neutral-500">{p.lossOdds}% of simulated paths ended below $10,000</p>
    </div>
  );
}

function CopyToPortfolio({ bot, picks }: { bot: BotDef; picks: { ticker: string; price: number }[] }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('10000');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(/[$,]/g, ''));
  const valid = Number.isFinite(value) && value >= 100 && value <= 10_000_000 && picks.length > 0;

  async function copy() {
    setState('saving');
    setError(null);
    try {
      const portfolio = await createPortfolio(`${bot.name} bot`);
      const each = value / picks.length;
      await importPositions(
        portfolio.id,
        picks.map((p) => ({ ticker: p.ticker, shares: Math.round((each / p.price) * 10000) / 10000, cost_basis: Math.round(p.price * 100) / 100 }))
      );
      setState('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the portfolio. Please try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] text-emerald-800">
          <Check className="h-4 w-4" aria-hidden="true" /> Created a simulated &ldquo;{bot.name} bot&rdquo; portfolio with {picks.length} positions.
        </p>
        <Button size="sm" onClick={() => navigate('/app/portfolios')}>
          Open portfolio
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-neutral-50 p-4">
      <p className="text-[13px] font-semibold text-neutral-900">Follow this bot in a simulated portfolio</p>
      <p className="text-[12px] text-neutral-600">
        Splits a pretend amount equally across today&apos;s picks at current prices so you can track how the bot does from here. No real money,
        no brokerage, no orders.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-[13px] text-neutral-700">
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-[13px] tabular-nums"
            aria-label="Simulated amount in dollars"
          />
        </label>
        <Button size="sm" onClick={() => void copy()} disabled={!valid || state === 'saving'} className="gap-1.5">
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          Copy {picks.length} picks to a new portfolio
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
}

export default function BotsPage() {
  useDocumentTitle('3x Bots · 3x Hunter');
  const { stocks, analyses, loading } = useStocks();
  const [data, setData] = useState<BotsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<BotId>('balanced');

  useEffect(() => {
    let active = true;
    loadBots().then((d) => active && setData(d)).catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const bot = BOTS.find((b) => b.id === selected)!;
  const hist = data?.bots.find((b) => b.id === selected);

  // Live picks: same rules as the backtest, on today's scores.
  const picks = useMemo(() => {
    const cands: BotCandidate[] = stocks
      .filter((s) => analyses[s.ticker] && (s.current_price ?? 0) > 0)
      .map((s) => ({ ticker: s.ticker, score: analyses[s.ticker].totalScore, risk: analyses[s.ticker].riskScore, inSp500: s.in_sp500 === true }));
    const bySymbol = new Map(stocks.map((s) => [s.ticker, s]));
    return botPicks(bot, cands).map((c) => ({ ...c, stock: bySymbol.get(c.ticker)! }));
  }, [stocks, analyses, bot]);

  const chartRows = useMemo(() => {
    if (!data || !hist) return [];
    const spy = new Map(data.spy.curve.map((p) => [p.d, p.v]));
    return hist.curve.map((p) => ({ d: p.d, bot: p.v * 100, spy: (spy.get(p.d) ?? NaN) * 100 }));
  }, [data, hist]);

  const projMax = data && hist ? Math.max(hist.projection.y10.high, data.spy.projection.y10.high) * 1.05 : 1;

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          <Bot className="h-7 w-7" aria-hidden="true" />
          3x Bots
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Four rule-based bots, from calm to wild. Pick how much risk you want, see how that bot would have done since 2016 against the S&P
          500, what it projects for the next 5 and 10 years, and which stocks it picks today.
        </p>
      </div>

      {/* Risk dial */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">How much risk do you want?</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="radiogroup" aria-label="Bot risk level">
          {BOTS.map((b) => {
            const h = data?.bots.find((x) => x.id === b.id);
            const on = b.id === selected;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(b.id)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                  on ? 'border-neutral-900 shadow-md' : 'border-border hover:border-neutral-400'
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="text-[15px] font-semibold text-neutral-900">{b.name}</span>
                  <span className="flex gap-0.5" aria-label={`Risk level ${b.level} of 4`}>
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className="h-3 w-1.5 rounded-sm" style={{ background: i <= b.level ? b.color : '#e5e5e5' }} />
                    ))}
                  </span>
                </span>
                <span className="text-[12px] font-medium" style={{ color: b.color }}>
                  {b.riskLabel}
                </span>
                {h ? (
                  <span className="text-[12px] text-neutral-600">
                    <strong className="tabular-nums text-neutral-900">{h.summary.cagr.toFixed(1)}%</strong>/yr since {year(data!.start)} · worst{' '}
                    {h.summary.maxDrawdown.toFixed(0)}%
                  </span>
                ) : (
                  <Skeleton className="h-4 w-32" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {failed && <Card className="p-6 text-sm text-muted-foreground">Bot history could not be loaded. Live picks below still work.</Card>}

      {/* Selected bot */}
      <Card className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
              {bot.name} bot <span className="text-[13px] font-medium" style={{ color: bot.color }}>· {bot.riskLabel}</span>
            </h2>
            <p className="max-w-xl text-[13px] text-neutral-600">{bot.tagline}</p>
            <ul className="flex flex-wrap gap-1.5">
              {bot.rules.map((r) => (
                <li key={r} className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700">
                  {r}
                </li>
              ))}
              <li className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700">Rebalanced quarterly</li>
            </ul>
          </div>
          {hist && data && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4 lg:w-[460px]">
              {[
                ['Since ' + year(data.start), signed(hist.summary.totalReturn), `S&P ${signed(data.spy.summary.totalReturn)}`],
                ['Per year', `${hist.summary.cagr.toFixed(1)}%`, `S&P ${data.spy.summary.cagr.toFixed(1)}%`],
                ['Worst drop', `${hist.summary.maxDrawdown.toFixed(0)}%`, `S&P ${data.spy.summary.maxDrawdown.toFixed(0)}%`],
                ['Beat the S&P', `${hist.beatRate}%`, 'of quarters'],
              ].map(([k, v, sub]) => (
                <div key={k}>
                  <dt className="text-neutral-500">{k}</dt>
                  <dd className="text-[17px] font-bold tabular-nums text-neutral-900">{v}</dd>
                  <dd className="text-[11px] text-neutral-500">{sub}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* History */}
        <div>
          <h3 className="text-[14px] font-semibold text-neutral-900">$10,000 since {data ? year(data.start) : '2016'}: bot vs S&P 500</h3>
          <div className="mt-2 h-[300px] w-full">
            {data && hist ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="d" tickFormatter={year} minTickGap={40} tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
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
                    formatter={(v: number, n: string) => [usd(v), n === 'bot' ? `${bot.name} bot` : 'S&P 500']}
                    labelFormatter={(d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend formatter={(n: string) => (n === 'bot' ? `${bot.name} bot` : 'S&P 500')} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="bot" stroke={bot.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="spy" stroke={SPY_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </div>

        {/* Projections */}
        {data && hist && (
          <div className="grid gap-6 md:grid-cols-2">
            {(['y5', 'y10'] as const).map((k) => (
              <div key={k} className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-[14px] font-semibold text-neutral-900">$10,000 in {k === 'y5' ? '5' : '10'} years (projected)</h3>
                <RangeBar label={`${bot.name} bot`} p={hist.projection[k]} max={projMax} color={bot.color} />
                <RangeBar label="S&P 500" p={data.spy.projection[k]} max={projMax} color={SPY_COLOR} />
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-neutral-500 md:col-span-2">
              Projections replay the bot&apos;s own monthly history in random 3-month blocks, 5,000 times. &ldquo;Likely&rdquo; is the middle
              outcome; the range covers the middle 80%. They assume the next decade looks like the last one, which it may not. This is a
              simulation, not a forecast.
            </p>
          </div>
        )}

        {/* Today's picks */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-neutral-900">What the {bot.name} bot picks today</h3>
            <span className="text-[12px] text-neutral-500">{picks.length} stocks, equal weight</span>
          </div>
          {loading && !stocks.length ? (
            <Skeleton className="h-40 w-full" />
          ) : picks.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No stocks meet this bot&apos;s rules right now.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {picks.map((p, i) => (
                <Link
                  key={p.ticker}
                  to={`/app/stock/${encodeURIComponent(p.ticker)}`}
                  className="rounded-lg border border-border px-3 py-2 hover:border-neutral-400"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-neutral-900">
                      <span className="mr-1 text-[11px] font-normal text-neutral-400">{i + 1}</span>
                      {p.ticker}
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums text-neutral-700">{Math.round(p.score)}</span>
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">{p.stock.company_name}</span>
                  <span className="text-[11px] text-neutral-500">Risk {Math.round(p.risk)}</span>
                </Link>
              ))}
            </div>
          )}
          {picks.length > 0 && (
            <CopyToPortfolio bot={bot} picks={picks.map((p) => ({ ticker: p.ticker, price: p.stock.current_price as number }))} />
          )}
        </div>
      </Card>

      {data && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Hypothetical results.</strong> Each quarter since {year(data.start)}, bots were rebuilt from data available at the time and
            could only hold stocks that were in the S&P 500 on that date. Our price history covers {data.indexCoverage.first}% of the index&apos;s
            members in {year(data.start)} rising to {data.indexCoverage.last}% today; the missing names mostly left the index after falling, so
            history is likely flattered, most of all for higher-risk bots. Returns include dividends but no fees or taxes. Past results and
            projections do not predict the future. Not investment advice; bots never place real trades.{' '}
            <Link to="/track-record" className="font-medium underline underline-offset-2">
              See the full track record
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
