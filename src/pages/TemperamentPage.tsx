import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Brain, RotateCcw, ShieldAlert } from 'lucide-react';
import { BOTS, botPicks } from '@/lib/bots';
import type { BotCandidate, BotId } from '@/lib/bots';
import { QUESTIONS, panicReplay, scoreTemperament, worstDrop } from '@/lib/temperament';
import type { TemperamentResult } from '@/lib/temperament';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { loadBots, usd, year } from '@/components/bots/bots-data';
import type { BotsData } from '@/components/bots/bots-data';
import { CopyToPortfolio } from '@/components/bots/BotWidgets';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const RISK_FOR: Record<BotId, 'conservative' | 'balanced' | 'aggressive'> = {
  steady: 'conservative',
  balanced: 'balanced',
  growth: 'aggressive',
  moonshot: 'aggressive',
};

function Results({ result, onRetake }: { result: TemperamentResult; onRetake: () => void }) {
  const { stocks, analyses } = useStocks();
  const [data, setData] = useState<BotsData | null>(null);
  useEffect(() => {
    let active = true;
    loadBots().then((d) => active && setData(d)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const bot = BOTS.find((b) => b.id === result.bot)!;
  const picks = useMemo(() => {
    const cands: BotCandidate[] = stocks
      .filter((s) => analyses[s.ticker] && (s.current_price ?? 0) > 0)
      .map((s) => ({ ticker: s.ticker, score: analyses[s.ticker].totalScore, risk: analyses[s.ticker].riskScore, inSp500: s.in_sp500 === true }));
    const by = new Map(stocks.map((s) => [s.ticker, s]));
    return botPicks(bot, cands).map((c) => ({ ...c, stock: by.get(c.ticker)! }));
  }, [stocks, analyses, bot]);

  // Every style, replayed since 2016: held through everything vs sold at this investor's limit.
  const rows = useMemo(() => {
    if (!data) return [];
    return BOTS.map((b) => {
      const h = data.bots.find((x) => x.id === b.id)!;
      const panic = panicReplay(h.curve, result.tolerance);
      return {
        bot: b,
        drop: worstDrop(h.curve),
        held: Math.round(h.summary.endValue * 100),
        panic,
        y5: h.projection.y5,
        y10: h.projection.y10,
      };
    });
  }, [data, result.tolerance]);
  const mine = rows.find((r) => r.bot.id === result.bot);
  const bolder = rows.find((r) => r.bot.level === bot.level + 1);
  const safer = rows.find((r) => r.bot.level === bot.level - 1);

  return (
    <div className="space-y-8">
      {/* Profile */}
      <Card className="space-y-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: bot.color }} aria-hidden="true">
              <Brain className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Your investor temperament</p>
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">{result.label}</h2>
              <p className="text-[13px] text-neutral-600">
                Temperament score {result.score}/100 · you can likely sit through drops of about <strong>{result.tolerance}%</strong>
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRetake} className="gap-1.5">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retake
          </Button>
        </div>
        <p className="text-[14px] leading-relaxed text-neutral-700">{result.summary}</p>
      </Card>

      {/* What it means in dollars */}
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Safer or more aggressive: what $10,000 could become</h2>
          <p className="text-[12px] text-muted-foreground">
            Likely outcome (middle of 5,000 simulations of each style&apos;s own history) and the worst drop you would have had to sit through.
          </p>
        </div>
        {!data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Style</th>
                  <th className="px-3 py-2 text-right font-medium">In 5 years</th>
                  <th className="px-3 py-2 text-right font-medium">In 10 years</th>
                  <th className="px-3 py-2 text-right font-medium">Worst drop since {year(data.start)}</th>
                  <th className="px-3 py-2 text-right font-medium">Since {year(data.start)}, if held</th>
                  <th className="px-3 py-2 text-right font-medium">If you sold at -{result.tolerance}%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isMine = r.bot.id === result.bot;
                  const tooRough = r.drop > result.tolerance;
                  return (
                    <tr key={r.bot.id} className={cn('border-b border-border last:border-0', isMine && 'bg-emerald-50/70')}>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-neutral-900">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.bot.color }} aria-hidden="true" />
                          {r.bot.name}
                          {isMine && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">You</span>}
                        </span>
                        <span className="text-[11px] text-neutral-500">{r.bot.riskLabel}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <strong>{usd(r.y5.mid)}</strong>
                        <span className="block text-[11px] text-neutral-500">
                          {usd(r.y5.low)} to {usd(r.y5.high)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <strong>{usd(r.y10.mid)}</strong>
                        <span className="block text-[11px] text-neutral-500">
                          {usd(r.y10.low)} to {usd(r.y10.high)}
                        </span>
                      </td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', tooRough ? 'font-semibold text-red-700' : 'text-neutral-700')}>
                        -{r.drop}%{tooRough && <span className="block text-[11px] font-normal">beyond your limit</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{usd(r.held)}</td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', r.panic.bailouts > 0 && 'text-amber-800')}>
                        {usd(r.panic.endValue)}
                        <span className="block text-[11px] text-neutral-500">
                          {r.panic.bailouts === 0 ? 'never triggered' : `sold ${r.panic.bailouts}× then waited 6 months`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {mine && (
          <div className="grid gap-3 md:grid-cols-2">
            {bolder && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
                <p className="font-semibold">If you went more aggressive ({bolder.bot.name})</p>
                <p>
                  Likely {usd(bolder.y10.mid)} in 10 years instead of {usd(mine.y10.mid)}, but with drops of up to {bolder.drop}%.
                  {bolder.panic.bailouts > 0
                    ? ` Selling at your ${result.tolerance}% limit would have cut its result since ${year(data!.start)} from ${usd(bolder.held)} to ${usd(bolder.panic.endValue)}. The extra return only shows up if you hold through the drops.`
                    : ' Its drops stayed within your limit, so it may suit you if you want more upside.'}
                </p>
              </div>
            )}
            {safer && (
              <div className="rounded-xl border border-border bg-neutral-50 p-4 text-[13px] leading-relaxed text-neutral-700">
                <p className="font-semibold text-neutral-900">If you went safer ({safer.bot.name})</p>
                <p>
                  Likely {usd(safer.y10.mid)} in 10 years instead of {usd(mine.y10.mid)}, with drops of up to {safer.drop}%. Less upside,
                  but easier to stick with when markets fall.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Portfolio */}
      <Card className="space-y-4 p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Your recommended portfolio: the {bot.name} bot</h2>
          <Link to="/app/bots" className="text-[12px] font-medium text-neutral-600 underline-offset-4 hover:underline">
            See all bots and their history
          </Link>
        </div>
        <p className="text-[13px] text-neutral-600">{bot.tagline}</p>
        <ul className="flex flex-wrap gap-1.5">
          {bot.rules.map((r) => (
            <li key={r} className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700">
              {r}
            </li>
          ))}
        </ul>
        {picks.length === 0 ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {picks.map((p) => (
                <Link key={p.ticker} to={`/app/stock/${encodeURIComponent(p.ticker)}`} className="rounded-lg border border-border px-3 py-2 hover:border-neutral-400">
                  <span className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-neutral-900">{p.ticker}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-neutral-700">{Math.round(p.score)}</span>
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">{p.stock.company_name}</span>
                  <span className="text-[11px] text-neutral-500">
                    {Math.round(100 / picks.length)}% · risk {Math.round(p.risk)}
                  </span>
                </Link>
              ))}
            </div>
            <CopyToPortfolio bot={bot} picks={picks.map((p) => ({ ticker: p.ticker, price: p.stock.current_price as number }))} />
          </>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Educational, not investment advice. The quiz is a self-assessment, and dollar figures are hypothetical: they replay each bot&apos;s
          reconstructed history since {data ? year(data.start) : '2016'} (a mostly rising market, and somewhat flattered because companies that
          left the index are missing). The &ldquo;sold at your limit&rdquo; column assumes you sell after a drop of that size and buy back 6 months
          later; real investors who sell often wait longer. Past results do not predict future returns.
        </p>
      </div>
    </div>
  );
}

export default function TemperamentPage() {
  useDocumentTitle('Investor temperament · 3x Hunter');
  const { prefs, update } = usePreferences();
  const saved = prefs?.temperament ?? null;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<TemperamentResult | null>(null);

  // Returning users see their saved result first.
  useEffect(() => {
    if (!result && saved?.answers && Object.keys(saved.answers).length === QUESTIONS.length) {
      setAnswers(saved.answers);
      setResult(scoreTemperament(saved.answers));
    }
  }, [saved, result]);

  const q = QUESTIONS[step];

  function choose(idx: number) {
    const next = { ...answers, [q.id]: idx };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    const r = scoreTemperament(next);
    setResult(r);
    track('temperament_result', { style: r.bot, score: r.score });
    void update({
      temperament: { score: r.score, bot: r.bot, tolerance: r.tolerance, answers: next },
      risk: RISK_FOR[r.bot],
    }).catch(() => undefined);
    window.scrollTo(0, 0);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2 pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          <Brain className="h-7 w-7" aria-hidden="true" />
          Investor temperament
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {result
            ? 'Your style, the portfolio that fits it, and what going safer or more aggressive would really mean for you.'
            : 'Seven quick questions about how you actually react to money moving. We match you to a strategy, build the portfolio, and show what going more aggressive would really mean for you.'}
        </p>
      </div>

      {result ? (
        <Results
          result={result}
          onRetake={() => {
            setResult(null);
            setAnswers({});
            setStep(0);
          }}
        />
      ) : (
        <Card className="space-y-6 p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px] text-neutral-500">
              <span>
                Question {step + 1} of {QUESTIONS.length}
              </span>
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 font-medium hover:text-neutral-900">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
                </button>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">{q.title}</h2>
            {q.subtitle && <p className="text-[13px] text-neutral-500">{q.subtitle}</p>}
          </div>
          <div className="grid gap-2">
            {q.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                onClick={() => choose(i)}
                className={cn(
                  'group flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                  answers[q.id] === i ? 'border-neutral-900 bg-neutral-50' : 'border-border hover:border-neutral-400'
                )}
              >
                <span>
                  <span className="block text-[14px] font-medium text-neutral-900">{o.label}</span>
                  {o.hint && <span className="block text-[12px] text-neutral-500">{o.hint}</span>}
                </span>
                <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
