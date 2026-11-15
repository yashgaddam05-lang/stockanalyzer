import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, Target, Wallet } from 'lucide-react';
import { BOTS } from '@/lib/bots';
import { requiredCagr, requiredCagrWithDeposits, simulate, yearsToMultiple, pct } from '@/lib/goal';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { loadAllocations } from '@/components/goal/allocations-data';
import type { AllocationsData } from '@/components/goal/allocations-data';
import { usd, year } from '@/components/bots/bots-data';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const MULTIPLES = [2, 3, 4, 5];
const WEAKER_DECADE = 0.03;

interface Row {
  key: string;
  group: 'Mix' | '3x Bot' | 'Index';
  name: string;
  detail: string;
  color?: string;
  drop: number;
  cagr: number;
  monthly: number[];
  botId?: string;
  /** Share in stocks, 0-1: the weaker-decade haircut applies to stocks only. */
  stockShare: number;
}

function Tag({ children }: { children: string }) {
  return <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{children}</span>;
}

export default function GoalPage() {
  useDocumentTitle('3x Goal Planner · 3x Hunter');
  const { prefs } = usePreferences();
  const temperament = prefs?.temperament ?? null;
  const tolerance = temperament?.tolerance ?? null;

  const [data, setData] = useState<AllocationsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState(100000);
  const [multiple, setMultiple] = useState(3);
  const [years, setYears] = useState(10);
  const [deposit, setDeposit] = useState(0);
  const [weaker, setWeaker] = useState(true);

  useEffect(() => {
    let active = true;
    loadAllocations()
      .then((d) => active && setData(d))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => track('goal_planned', { multiple, years }), 1500);
    return () => clearTimeout(t);
  }, [multiple, years]);

  const target = start * multiple;
  const need = requiredCagr(multiple, years);
  const needWithDeposits = deposit > 0 ? requiredCagrWithDeposits(start, target, years, deposit) : need;
  const deposited = deposit * years * 12;
  const drag = weaker ? WEAKER_DECADE : 0;

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const mixes: Row[] = data.ladder.map((l) => ({
      key: l.id,
      group: 'Mix',
      name: `${l.id} ${l.name}`,
      detail: `${l.stocks}% stocks · ${l.bonds}% bonds · ${l.cash}% cash`,
      drop: -l.summary.maxDrawdown,
      cagr: l.summary.cagr / 100,
      monthly: l.monthly,
      stockShare: l.stocks / 100,
    }));
    const bots: Row[] = BOTS.map((b) => {
      const s = data.bots.find((x) => x.id === b.id)!;
      return { key: b.id, group: '3x Bot', name: `${b.name} Bot`, detail: b.riskLabel, color: b.color, drop: -s.summary.maxDrawdown, cagr: s.summary.cagr / 100, monthly: s.monthly, botId: b.id, stockShare: 1 };
    });
    const spy: Row = { key: 'spy', group: 'Index', name: 'S&P 500 (SPY)', detail: 'Buy the whole market', drop: -data.spy.summary.maxDrawdown, cagr: data.spy.summary.cagr / 100, monthly: data.spy.monthly, stockShare: 1 };
    return [...mixes, ...bots, spy];
  }, [data]);

  const results = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        sim: simulate(r.monthly, { years, start, target, deposit, drag: drag * r.stockShare, paths: 1500 }),
        assumed: r.cagr - drag * r.stockShare,
      })),
    [rows, years, start, target, deposit, drag]
  );

  // Best fit: within the investor's drop limit (when known), the highest odds; ties go to the calmer one.
  const fits = results.filter((r) => tolerance === null || r.drop <= tolerance + 0.5);
  const best = [...fits].sort((a, b) => b.sim.odds - a.sim.odds || a.drop - b.drop)[0];
  const reliable = fits.filter((r) => r.sim.odds >= 50).sort((a, b) => a.drop - b.drop)[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2 pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          <Target className="h-7 w-7" aria-hidden="true" />
          3x Goal Planner
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What would it take to triple your money? Pick a target and a deadline, see the return it needs, and how often each strategy got
          there in thousands of simulations of its own history.
        </p>
      </div>

      <Card className="grid gap-5 p-6 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-600">Starting amount</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1000}
              step={1000}
              value={start}
              onChange={(e) => setStart(Math.max(1000, Math.min(100_000_000, Number(e.target.value) || 0)))}
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-600">Target</span>
            <div className="flex gap-2">
              {MULTIPLES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMultiple(m)}
                  className={cn('flex-1 rounded-lg border px-3 py-2 text-[14px] font-semibold', m === multiple ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border text-neutral-700 hover:border-neutral-400')}
                >
                  {m}x
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="flex justify-between text-[12px] font-medium text-neutral-600">
              <span>Deadline</span>
              <span className="text-neutral-900">{years} years</span>
            </span>
            <input type="range" min={3} max={15} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-neutral-900" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-600">Monthly deposit (optional)</span>
            <Input type="number" inputMode="numeric" min={0} step={100} value={deposit} onChange={(e) => setDeposit(Math.max(0, Math.min(1_000_000, Number(e.target.value) || 0)))} />
          </label>
          <label className="flex items-start gap-2 text-[13px] text-neutral-700">
            <input type="checkbox" checked={weaker} onChange={(e) => setWeaker(e.target.checked)} className="mt-0.5 accent-neutral-900" />
            <span>
              Assume the next decade is weaker than 2016–2026 (stocks earn 3% a year less).{' '}
              <span className="text-neutral-500">Recommended: that decade was unusually strong.</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col justify-center gap-3 rounded-2xl bg-neutral-50 p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Return you need</p>
          <p className="text-4xl font-semibold tracking-tight text-neutral-900 tabular-nums">
            {pct(needWithDeposits)}
            <span className="text-lg font-normal text-neutral-500"> a year</span>
          </p>
          <p className="text-[14px] text-neutral-700">
            {usd(start)} → <strong>{usd(target)}</strong> in {years} years. That&apos;s a {(multiple - 1) * 100}% gain
            {multiple === 3 && ' (tripling is +200%, not +300%)'}.
          </p>
          {deposit > 0 && (
            <p className="text-[13px] text-neutral-600">
              Your deposits add {usd(deposited)}, so your investments only need {pct(needWithDeposits)} a year instead of {pct(need)}. Reaching the
              target partly with new money is not the same as the investments tripling.
            </p>
          )}
          <p className="text-[12px] text-neutral-500">
            For scale: the S&amp;P 500 has averaged roughly 10% a year over the long run{data ? `, and ${data.spy.summary.cagr}% a year from ${year(data.start)} to ${year(data.end)}` : ''}.
          </p>
        </div>
      </Card>

      {/* Recommendation */}
      {data && best && (
        <Card className="space-y-3 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
            <Brain className="h-5 w-5" aria-hidden="true" /> What fits you
          </h2>
          {tolerance === null ? (
            <p className="text-[14px] text-neutral-700">
              The highest odds come from the riskiest strategies, and they only work if you can hold through their drops.{' '}
              <Link to="/app/temperament" className="font-medium underline underline-offset-2">
                Take the temperament quiz
              </Link>{' '}
              and this planner will only recommend what you can actually stick with.
            </p>
          ) : reliable ? (
            <p className="text-[14px] text-neutral-700">
              Within your limit of about {tolerance}% drops, <strong>{reliable.name}</strong> reached {usd(target)} in{' '}
              <strong>{reliable.sim.odds}%</strong> of simulations ({reliable.detail.toLowerCase()}, worst drop {reliable.drop.toFixed(0)}% since{' '}
              {year(data.start)}). It is the calmest option that gets there more often than not.
            </p>
          ) : (
            <p className="text-[14px] text-neutral-700">
              Nothing within your limit of about {tolerance}% drops reaches {multiple}x in {years} years more often than not. Your best shot is{' '}
              <strong>{best.name}</strong> at {best.sim.odds}% odds. At its pace ({pct(best.assumed)} a year{weaker ? ' after the weaker-decade haircut' : ''}),{' '}
              {multiple}x takes about <strong>{Math.ceil(yearsToMultiple(best.assumed, multiple))} years</strong>. Give it more time or aim lower
              rather than taking on drops you would likely sell in.
            </p>
          )}
          <Link to="/app/paper" className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-900 underline underline-offset-2">
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Track these strategies live with virtual $100,000 accounts
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Card>
      )}

      <Card className="space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Which strategies get there</h2>
          <Tag>Backtest</Tag>
          <Tag>Simulation</Tag>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Return and worst drop are month-end backtests from {data ? `${year(data.start)} to ${year(data.end)}` : '2016'}. Odds and outcomes come from
          1,500 simulated futures built from each strategy&apos;s own monthly history{weaker ? ', with stocks 3% a year weaker' : ''}. Hypothetical, before taxes.
        </p>
        {failed ? (
          <p className="text-[13px] text-red-600">Could not load strategy history. Refresh to try again.</p>
        ) : !data ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Strategy</th>
                  <th className="px-3 py-2 text-right font-medium">Return / yr</th>
                  <th className="px-3 py-2 text-right font-medium">Worst drop</th>
                  <th className="px-3 py-2 text-right font-medium">Years to {multiple}x</th>
                  <th className="px-3 py-2 text-right font-medium">Odds in {years} yrs</th>
                  <th className="px-3 py-2 text-right font-medium">Likely outcome</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const isMine = Boolean(r.botId) && temperament?.bot === r.botId;
                  const rough = tolerance !== null && r.drop > tolerance + 0.5;
                  const yrs = yearsToMultiple(r.assumed, multiple);
                  return (
                    <tr key={r.key} className={cn('border-b border-border last:border-0', isMine && 'bg-emerald-50/70', best?.key === r.key && !isMine && 'bg-sky-50/60')}>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-neutral-900">
                          {r.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />}
                          {r.name}
                          {isMine && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Your style</span>}
                        </span>
                        <span className="text-[11px] text-neutral-500">{r.detail}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {(r.cagr * 100).toFixed(1)}%
                        {weaker && <span className="block text-[11px] text-neutral-500">{pct(r.assumed)} assumed</span>}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', rough && 'text-red-600')}>
                        -{r.drop.toFixed(0)}%
                        {rough && <span className="block text-[11px]">past your limit</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{Number.isFinite(yrs) && yrs < 100 ? yrs.toFixed(1) : 'Never'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={cn('font-semibold tabular-nums', r.sim.odds >= 50 ? 'text-emerald-700' : r.sim.odds >= 20 ? 'text-amber-700' : 'text-neutral-500')}>{r.sim.odds}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <strong>{usd(r.sim.p50)}</strong>
                        <span className="block text-[11px] text-neutral-500">
                          {usd(r.sim.p10)} – {usd(r.sim.p90)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-neutral-500">
          Mixes: stocks are 40% VTI, 30% VXUS and 30% Balanced Bot picks; bonds split VGSH/BND; cash in Treasury bills; rebalanced quarterly. Likely
          outcome is the middle simulation, with the 10th to 90th percentile range below. A required return is a math fact, not a forecast. Educational
          only, not investment advice.
        </p>
      </Card>
    </div>
  );
}
