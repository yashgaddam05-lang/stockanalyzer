import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, FlaskConical, Info, Plus, Trash2, Wallet } from 'lucide-react';
import { BOTS, botPicks } from '@/lib/bots';
import type { BotCandidate, BotId } from '@/lib/bots';
import { createPaperAccount, deletePaperAccount, getPaperAccounts } from '@/lib/api';
import type { NewPaperAccount, PaperAccount, PaperResponse } from '@/lib/api';
import { pct } from '@/lib/goal';
import { usd } from '@/components/bots/bots-data';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const COLORS = ['#0f172a', '#059669', '#d97706'];
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const signedPct = (x: number | null | undefined) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`);

function Notice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong>Virtual portfolios: simulated money.</strong> No real funds are invested. Results are forward paper tracking from each account&apos;s
        start date, valued at adjusted market closes each weekday evening. Not investment advice.
      </span>
    </div>
  );
}

function NewAccount({ onCreated, disabled }: { onCreated: () => void; disabled: string | null }) {
  const { stocks: universe, analyses } = useStocks();
  const { prefs } = usePreferences();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('My 3x experiment');
  const [stocks, setStocks] = useState(80);
  const [bonds, setBonds] = useState(15);
  const [sleeve, setSleeve] = useState<NewPaperAccount['sleeve']>('mix');
  const [bot, setBot] = useState<BotId>((prefs?.temperament?.bot as BotId) ?? 'balanced');
  const [multiple, setMultiple] = useState(3);
  const [horizon, setHorizon] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cash = Math.max(0, 100 - stocks - bonds);

  const picks = useMemo(() => {
    const def = BOTS.find((b) => b.id === bot)!;
    const cands: BotCandidate[] = universe
      .filter((s) => analyses[s.ticker] && (s.current_price ?? 0) > 0)
      .map((s) => ({ ticker: s.ticker, score: analyses[s.ticker].totalScore, risk: analyses[s.ticker].riskScore, inSp500: s.in_sp500 === true }));
    return botPicks(def, cands).map((c) => c.ticker);
  }, [universe, analyses, bot]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createPaperAccount({ name, stocks, bonds, cash, sleeve, bot: sleeve === 'market' ? undefined : bot, picks: sleeve === 'market' ? [] : picks, targetMultiple: multiple, horizonYears: horizon });
      track('paper_account_created', { sleeve, bot, stocks });
      setOpen(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setOpen(true)} disabled={Boolean(disabled)} className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> New $100,000 experiment
        </Button>
        {disabled && (
          <span className="text-[13px] text-neutral-600">
            {disabled}{' '}
            <Link to="/app/billing" className="font-medium text-neutral-900 underline underline-offset-2">
              See Pro
            </Link>
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
        <FlaskConical className="h-5 w-5" aria-hidden="true" /> New experiment
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-neutral-600">Name</span>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="space-y-1.5">
          <span className="text-[12px] font-medium text-neutral-600">Stock part</span>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['market', 'Whole market'],
              ['mix', 'Market + 3x picks'],
              ['picks', '3x picks only'],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSleeve(k)} className={cn('rounded-lg border px-2 py-2 text-[12px] font-medium', sleeve === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border text-neutral-700')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-[12px] font-medium text-neutral-600">
            <span>Stocks</span>
            <span className="text-neutral-900">{stocks}%</span>
          </span>
          <input type="range" min={0} max={100} step={5} value={stocks} onChange={(e) => { const v = Number(e.target.value); setStocks(v); if (v + bonds > 100) setBonds(100 - v); }} className="w-full accent-neutral-900" />
        </label>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-[12px] font-medium text-neutral-600">
            <span>Bonds</span>
            <span className="text-neutral-900">{bonds}% · cash {cash}%</span>
          </span>
          <input type="range" min={0} max={100 - stocks} step={5} value={bonds} onChange={(e) => setBonds(Number(e.target.value))} className="w-full accent-neutral-900" />
        </label>
        {sleeve !== 'market' && (
          <div className="space-y-1.5 md:col-span-2">
            <span className="text-[12px] font-medium text-neutral-600">Which 3x Bot picks</span>
            <div className="flex flex-wrap gap-2">
              {BOTS.map((b) => (
                <button key={b.id} type="button" onClick={() => setBot(b.id)} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium', bot === b.id ? 'border-neutral-900 bg-neutral-50' : 'border-border')}>
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden="true" /> {b.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">
              {picks.length ? `${picks.length} picks today: ${picks.slice(0, 8).join(', ')}${picks.length > 8 ? '…' : ''}. Frozen at the start, like a real buy.` : 'Loading picks…'}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <span className="text-[12px] font-medium text-neutral-600">Target</span>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((m) => (
              <button key={m} type="button" onClick={() => setMultiple(m)} className={cn('flex-1 rounded-lg border px-2 py-1.5 text-[13px] font-semibold', m === multiple ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border')}>
                {m}x
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-[12px] font-medium text-neutral-600">
            <span>Deadline</span>
            <span className="text-neutral-900">{horizon} years · needs {pct(multiple ** (1 / horizon) - 1)}/yr</span>
          </span>
          <input type="range" min={3} max={15} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="w-full accent-neutral-900" />
        </label>
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy || !name.trim() || (sleeve !== 'market' && stocks > 0 && picks.length < 5)}>
          {busy ? 'Creating…' : 'Start tracking'}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-neutral-500">Accounts can&apos;t be edited once started, so the original plan stays honest. Start a new one to try a change.</p>
    </Card>
  );
}

function Detail({ a, onDelete }: { a: PaperAccount; onDelete?: () => void }) {
  return (
    <div className="grid gap-4 bg-neutral-50/60 px-3 py-4 text-[12px] md:grid-cols-3">
      <div className="space-y-1">
        <p className="font-semibold text-neutral-900">Holdings</p>
        <ul className="max-h-40 space-y-0.5 overflow-auto text-neutral-700">
          {a.holdings.map((h) => (
            <li key={h.symbol} className="flex justify-between gap-3 tabular-nums">
              <span>{h.symbol}</span>
              <span>{(h.weight * 100).toFixed(2)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-neutral-900">Now vs target mix</p>
        {a.drift ? (
          <p className="text-neutral-700">
            Stocks {a.drift.stocks.toFixed(1)}% (target {a.mix.stocks}%) · Bonds {a.drift.bonds.toFixed(1)}% ({a.mix.bonds}%) · Cash {a.drift.cash.toFixed(1)}% ({a.mix.cash}%)
          </p>
        ) : (
          <p className="text-neutral-500">Shown once tracking starts.</p>
        )}
        <p className="pt-2 font-semibold text-neutral-900">Goal</p>
        <p className="text-neutral-700">
          {usd(a.startValue)} → {usd(a.target)} ({a.targetMultiple}x) in {a.horizonYears} years: needed {pct(a.targetMultiple ** (1 / a.horizonYears) - 1)}/yr at the start.
        </p>
        {a.stale && a.stale.length > 0 && <p className="text-amber-700">No price yet today for: {a.stale.join(', ')}.</p>}
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-neutral-900">Assumptions (v{a.version}, locked {fmtDate(a.createdAt.slice(0, 10))})</p>
        <ul className="space-y-0.5 text-neutral-700">
          {Object.entries(a.assumptions).map(([k, v]) => (
            <li key={k}>
              <span className="capitalize text-neutral-500">{k}:</span> {v}
            </li>
          ))}
        </ul>
        {onDelete && (
          <button type="button" onClick={onDelete} className="mt-2 inline-flex items-center gap-1 text-red-600 hover:underline">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete experiment
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaperPage() {
  useDocumentTitle('Paper accounts · 3x Hunter');
  const [data, setData] = useState<PaperResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    getPaperAccounts()
      .then((d) => {
        setData(d);
        setCompare((c) => (c.length ? c : d.accounts.filter((a) => ['V04', 'V06', 'V08'].includes(a.code ?? '')).map((a) => a.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load paper accounts.'));
  }, []);
  useEffect(load, [load]);

  const mine = data?.accounts.filter((a) => a.mine) ?? [];
  const limitMsg = data && mine.length >= data.limit ? (data.plan === 'pro' ? `You are running ${data.limit} of ${data.limit} experiments.` : 'Free includes 1 experiment; Pro runs 10.') : null;

  const chart = useMemo(() => {
    if (!data) return [];
    const picked = data.accounts.filter((a) => compare.includes(a.id) && a.series?.length);
    const byDate = new Map<string, Record<string, number | string>>();
    for (const a of picked) for (const p of a.series!) {
      const row = byDate.get(p.d) ?? { d: p.d };
      row[a.id] = p.v;
      byDate.set(p.d, row);
    }
    return [...byDate.values()].sort((x, y) => String(x.d).localeCompare(String(y.d)));
  }, [data, compare]);
  const picked = data?.accounts.filter((a) => compare.includes(a.id)) ?? [];

  async function remove(id: string) {
    if (!window.confirm('Delete this experiment? Its tracking history is lost.')) return;
    await deletePaperAccount(id).catch(() => undefined);
    load();
  }

  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id]));
  const pendingStart = data?.accounts.find((a) => a.status === 'pending');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2 pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          <Wallet className="h-7 w-7" aria-hidden="true" />
          Paper accounts
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Eight virtual $100,000 accounts, from all cash to all stocks, started on the same day and chasing the same goal: $300,000. Watch how each
          one really behaves, then run your own experiment.{' '}
          <Link to="/app/goal" className="font-medium text-neutral-900 underline underline-offset-2">
            Plan your goal
          </Link>
        </p>
      </div>
      <Notice />

      {error ? (
        <p className="text-[13px] text-red-600">{error}</p>
      ) : !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {pendingStart && (
            <p className="rounded-xl border border-border bg-white px-3 py-2 text-[13px] text-neutral-700">
              Some accounts start at the next market close after they were created. Values appear after that close is recorded (weekday evenings).
            </p>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="border-b border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Compare</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-3 py-2 text-right font-medium">Return</th>
                    <th className="px-3 py-2 text-right font-medium">vs benchmark</th>
                    <th className="px-3 py-2 text-right font-medium">Worst drop</th>
                    <th className="px-3 py-2 text-right font-medium">Left to target</th>
                    <th className="px-3 py-2 text-right font-medium">Needed / yr now</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => {
                    const live = a.status === 'live';
                    const idx = compare.indexOf(a.id);
                    return (
                      <FragmentRow key={a.id}>
                        <tr className={cn('border-b border-border', a.mine && 'bg-emerald-50/40')}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={idx >= 0} onChange={() => toggle(a.id)} aria-label={`Compare ${a.name}`} className="accent-neutral-900" />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2 font-medium text-neutral-900">
                              {idx >= 0 && <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[idx] }} aria-hidden="true" />}
                              {a.code ? `${a.code} ${a.name}` : a.name}
                              {a.mine && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Yours</span>}
                            </span>
                            <span className="text-[11px] text-neutral-500">
                              {a.mix.stocks}% stocks · {a.mix.bonds}% bonds · {a.mix.cash}% cash · since {a.inception ? fmtDate(a.inception) : 'next close'}
                            </span>
                          </td>
                          {live ? (
                            <>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{usd(a.value!)}</td>
                              <td className={cn('px-3 py-2.5 text-right tabular-nums', (a.totalReturn ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                                {signedPct(a.totalReturn)}
                                {a.annualized != null && <span className="block text-[11px] text-neutral-500">{pct(a.annualized)}/yr</span>}
                              </td>
                              <td className={cn('px-3 py-2.5 text-right tabular-nums', (a.vsBenchmark ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>{signedPct(a.vsBenchmark)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.maxDrawdown ?? 0)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{usd(a.toTarget ?? 0)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {a.remainingRequired == null ? '–' : pct(a.remainingRequired)}
                                {a.requiredAtStart != null && <span className="block text-[11px] text-neutral-500">was {pct(a.requiredAtStart)}</span>}
                              </td>
                            </>
                          ) : (
                            <td colSpan={6} className="px-3 py-2.5 text-right text-[12px] text-neutral-500">
                              Starts tracking at the next market close
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right">
                            <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-600 hover:text-neutral-900" aria-expanded={open === a.id}>
                              Details <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open === a.id && 'rotate-180')} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {open === a.id && (
                          <tr className="border-b border-border">
                            <td colSpan={9}>
                              <Detail a={a} onDelete={a.mine ? () => void remove(a.id) : undefined} />
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="space-y-3 p-6">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Side by side</h2>
            <p className="text-[12px] text-muted-foreground">Pick up to 3 accounts above. The highest recent return is not automatically the best: check the drops too.</p>
            {chart.length < 2 ? (
              <p className="text-[13px] text-neutral-500">The chart fills in after two trading days of tracking.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#eee" vertical={false} />
                    <XAxis dataKey="d" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
                    <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} fontSize={11} domain={['auto', 'auto']} width={48} />
                    <Tooltip formatter={(v: number) => usd(v)} />
                    <Legend />
                    {picked.map((a, i) => (
                      <Line key={a.id} dataKey={a.id} name={a.code ?? a.name} stroke={COLORS[i]} dot={false} strokeWidth={2} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <NewAccount onCreated={load} disabled={limitMsg} />
          <Updates plan={data.plan} hasExperiment={mine.length > 0} />

          <p className="text-[11px] text-neutral-500">
            Benchmark: the same bond and cash mix with the stock part in 70% VTI / 30% VXUS, so &quot;vs benchmark&quot; shows whether 3x picks added
            anything. Returns are not annualized until an account is a year old. A few months of results cannot prove or disprove a 15-year plan.
          </p>
        </>
      )}
    </div>
  );
}

function Updates({ plan, hasExperiment }: { plan: 'free' | 'pro'; hasExperiment: boolean }) {
  const { prefs, update } = usePreferences();
  const on = prefs?.weekly_email !== false;
  if (!hasExperiment) return null;
  return (
    <Card className="flex flex-col gap-3 p-4 text-[13px] sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-2 text-neutral-800">
        <input type="checkbox" checked={on} onChange={(e) => void update({ weekly_email: e.target.checked }).catch(() => undefined)} className="accent-neutral-900" />
        Send me a weekly progress update on my experiments (Saturday morning)
      </label>
      {plan === 'pro' ? (
        <span className="text-neutral-500">Pro alerts are on: drift, behind plan, and trailing the benchmark.</span>
      ) : (
        <span className="text-neutral-600">
          Get alerted when an experiment drifts, falls behind plan or trails its benchmark.{' '}
          <Link to="/app/billing" className="font-medium text-neutral-900 underline underline-offset-2">Pro</Link>
        </span>
      )}
    </Card>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
