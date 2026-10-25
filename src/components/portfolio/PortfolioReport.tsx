import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Lightbulb, Users } from 'lucide-react';
import type { PortfolioValuation } from '@/lib/portfolio';
import { buildPortfolioReport } from '@/lib/portfolio-report';
import type { HoldingReport, Tip, Verdict } from '@/lib/portfolio-report';
import { getScoreColor } from '@/lib/analysis';
import { useStocks } from '@/components/data/StocksProvider';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  strong: { label: 'Strong', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  hold: { label: 'Hold steady', className: 'bg-neutral-50 text-neutral-700 border-neutral-200' },
  review: { label: 'Review', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  unscored: { label: 'Not scored', className: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
};

const CONSENSUS_STYLE: Record<string, string> = {
  'Strong buy': 'text-emerald-700',
  Buy: 'text-emerald-700',
  Hold: 'text-neutral-700',
  Underperform: 'text-red-700',
  Sell: 'text-red-700',
  'Strong sell': 'text-red-700',
};

const PRIORITY: Record<Tip['priority'], string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-neutral-50 text-neutral-600 border-neutral-200',
};

const money = (v: number | null) => (v === null ? '--' : `$${v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : 2 })}`);

function ScoreRing({ score, grade }: { score: number | null; grade: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const frac = score === null ? 0 : score / 100;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#f0f0f0" strokeWidth="10" />
        <circle cx="55" cy="55" r={r} fill="none" stroke="#171717" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-neutral-900">{score ?? '--'}</span>
        <span className="text-[12px] font-semibold text-neutral-500">Grade {grade}</span>
      </div>
    </div>
  );
}

function AnalystCell({ h }: { h: HoldingReport }) {
  const a = h.analyst;
  if (!a.consensus && a.target === null) return <span className="text-[12px] text-neutral-400">No coverage</span>;
  return (
    <div className="space-y-0.5">
      <p className="text-[12px]">
        <span className={cn('font-semibold', CONSENSUS_STYLE[a.consensus ?? ''] ?? 'text-neutral-700')}>{a.consensus ?? '--'}</span>
        {a.count !== null && <span className="text-neutral-500"> · {a.count} analysts</span>}
      </p>
      {a.target !== null && (
        <p className="text-[12px] text-neutral-600">
          Target {money(a.target)}
          {a.upside !== null && (
            <span className={cn('ml-1 font-medium', a.upside >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              ({a.upside >= 0 ? '+' : ''}
              {a.upside}%)
            </span>
          )}
        </p>
      )}
      {a.low !== null && a.high !== null && (
        <p className="text-[11px] text-neutral-400">
          Range {money(a.low)} to {money(a.high)}
        </p>
      )}
    </div>
  );
}

/** Portfolio score, per-holding 3x and analyst report, and tips. */
export function PortfolioReport({ valuation }: { valuation: PortfolioValuation }) {
  const { stocks, analyses, loading } = useStocks();
  const report = useMemo(() => buildPortfolioReport(valuation, stocks, analyses), [valuation, stocks, analyses]);
  if (loading && !stocks.length) return null;

  return (
    <div className="space-y-6" data-testid="portfolio-report">
      {/* Portfolio score */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <ScoreRing score={report.score} grade={report.grade} />
            <div className="space-y-1 md:max-w-xs">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                Portfolio score
              </h2>
              <p className="text-[13px] leading-relaxed text-neutral-600">{report.summary}</p>
            </div>
          </div>
          <ul className="flex-1 space-y-2.5">
            {report.parts.map((p) => (
              <li key={p.key}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium text-neutral-900">
                    {p.label} <span className="font-normal text-neutral-400">· {p.weight}%</span>
                  </span>
                  <span className="tabular-nums font-semibold text-neutral-900">{p.score ?? '--'}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-neutral-900" style={{ width: `${p.score ?? 0}%` }} />
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-500">{p.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Holding report */}
      <Card className="overflow-hidden">
        <div className="space-y-1 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
            <Users className="h-5 w-5" aria-hidden="true" />
            Holding report
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Each holding&apos;s 3x score (its potential, 0-100), valuation score, risk, and what Wall Street analysts say.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Holding</th>
                <th className="px-4 py-2 text-right font-medium">Weight</th>
                <th className="px-4 py-2 text-right font-medium">3x score</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Analysts</th>
                <th className="px-4 py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.holdings.map((h) => (
                <tr key={h.ticker} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/app/stock/${encodeURIComponent(h.ticker)}`} className="font-semibold text-neutral-900 hover:underline">
                      {h.ticker}
                    </Link>
                    <p className="max-w-[180px] truncate text-[11px] text-neutral-500">{h.name}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Math.round(h.weight * 100)}%</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('text-[15px] font-bold tabular-nums', h.score !== null ? getScoreColor(h.score) : 'text-neutral-400')}>{h.score ?? '--'}</span>
                    <p className="text-[11px] text-neutral-500">{h.scoreLabel}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" title="Valuation Upside dimension of the 3x score">
                    {h.valuationScore ?? '--'}
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-700">{h.riskLabel ? `${h.riskLabel} (${h.riskScore})` : '--'}</td>
                  <td className="px-4 py-3">
                    <AnalystCell h={h} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', VERDICT[h.verdict].className)}>
                      {VERDICT[h.verdict].label}
                    </span>
                    <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-neutral-500">{h.note}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tips */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
            <Lightbulb className="h-5 w-5 text-amber-500" aria-hidden="true" />
            How to make this portfolio better
          </h2>
          <p className="text-[12px] text-muted-foreground">Ranked by impact. Stock suggestions are in the ideas section below.</p>
        </div>
        <ol className="space-y-2">
          {report.tips.map((t) => {
            const body = (
              <>
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase', PRIORITY[t.priority])}>{t.priority}</span>
                  <span className="text-[14px] font-semibold text-neutral-900">{t.title}</span>
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-neutral-600">{t.body}</span>
                {t.href && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-900">
                    {t.href.startsWith('#') ? 'See ideas' : 'Open'} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
              </>
            );
            const cls = 'block rounded-xl border border-border p-4 transition-colors hover:border-neutral-400';
            return (
              <li key={t.title}>
                {!t.href ? (
                  <div className="rounded-xl border border-border p-4">{body}</div>
                ) : t.href.startsWith('#') ? (
                  <a
                    href={t.href}
                    className={cls}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(t.href!.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {body}
                  </a>
                ) : (
                  <Link to={t.href} className={cls}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-neutral-400">
          Scores and tips come from 3x Hunter&apos;s model and public analyst data. They are research aids, not personalized
          investment advice.
        </p>
      </Card>
    </div>
  );
}
