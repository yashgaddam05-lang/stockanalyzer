import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, Lightbulb, Star } from 'lucide-react';
import type { PortfolioValuation } from '@/lib/portfolio';
import { IDEA_SECTIONS, buildPortfolioIdeas } from '@/lib/portfolio-ideas';
import type { PortfolioIdea, PortfolioInsight } from '@/lib/portfolio-ideas';
import { getScoreColor } from '@/lib/analysis';
import { useStocks } from '@/components/data/StocksProvider';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const RISK_STYLE: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  extreme: 'bg-red-50 text-red-700 border-red-200',
};

function InsightRow({ insight }: { insight: PortfolioInsight }) {
  const Icon = insight.tone === 'good' ? CheckCircle2 : insight.tone === 'warn' ? AlertTriangle : Info;
  return (
    <li className="flex items-start gap-2 text-[13px] text-neutral-700">
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          insight.tone === 'good' ? 'text-emerald-600' : insight.tone === 'warn' ? 'text-amber-600' : 'text-neutral-400'
        )}
        aria-hidden="true"
      />
      {insight.text}
    </li>
  );
}

function IdeaCard({ idea, watched, onWatch }: { idea: PortfolioIdea; watched: boolean; onWatch: () => void }) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/app/stock/${encodeURIComponent(idea.ticker)}`} className="group min-w-0">
          <span className="flex items-center gap-1 text-[14px] font-semibold text-neutral-900 group-hover:underline">
            {idea.ticker}
            <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
          </span>
          <span className="block truncate text-[12px] text-neutral-500">{idea.name}</span>
        </Link>
        <span className={cn('shrink-0 text-lg font-bold tabular-nums', getScoreColor(idea.score))}>{idea.score}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {idea.sector && (
          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">{idea.sector}</span>
        )}
        <span className={cn('rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize', RISK_STYLE[idea.riskLabel] ?? RISK_STYLE.medium)}>
          {idea.riskLabel} risk
        </span>
      </div>
      <p className="flex-1 text-[12px] leading-relaxed text-neutral-600">{idea.reason}</p>
      <button
        type="button"
        onClick={onWatch}
        aria-pressed={watched}
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-md border px-2 py-1 text-[12px] font-medium transition-colors',
          watched ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border text-neutral-700 hover:border-neutral-400'
        )}
      >
        <Star className={cn('h-3.5 w-3.5', watched && 'fill-current')} aria-hidden="true" />
        {watched ? 'On your watchlist' : 'Add to watchlist'}
      </button>
    </div>
  );
}

/** "Ideas to improve this portfolio": 3x Hunter stocks that would strengthen the holdings, with reasons. */
export function PortfolioIdeas({ valuation }: { valuation: PortfolioValuation }) {
  const { stocks, analyses, loading, watchlist, toggleWatch } = useStocks();
  const result = useMemo(() => buildPortfolioIdeas(valuation, stocks, analyses), [valuation, stocks, analyses]);
  const sections = IDEA_SECTIONS.filter((s) => result.ideas[s.kind].length > 0);

  if (loading && !stocks.length) return null;

  return (
    <Card id="portfolio-ideas" className="scroll-mt-20 space-y-6 p-4 sm:p-6" data-testid="portfolio-ideas">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
          <Lightbulb className="h-5 w-5 text-amber-500" aria-hidden="true" />
          Ideas to improve this portfolio
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Based on your holdings&apos; 3x scores, risk and sector mix, these tracked stocks could strengthen it. Research them
          before acting.
        </p>
      </div>

      {result.insights.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-neutral-50 p-4" aria-label="Portfolio read">
          {result.insights.map((i) => (
            <InsightRow key={i.text} insight={i} />
          ))}
        </ul>
      )}

      {sections.length === 0 ? (
        <p className="text-[13px] text-neutral-600">
          Your portfolio already scores well against what we track: no stronger, steadier alternatives stand out right now.
          Check back after the next data refresh, or browse{' '}
          <Link to="/app/explore?preset=best-risk-adjusted" className="font-medium text-neutral-900 underline underline-offset-2">
            Best risk-adjusted
          </Link>
          .
        </p>
      ) : (
        sections.map((s) => (
          <section key={s.kind} className="space-y-3" aria-label={s.title}>
            <div>
              <h3 className="text-[14px] font-semibold text-neutral-900">{s.title}</h3>
              <p className="text-[12px] text-neutral-500">{s.blurb}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {result.ideas[s.kind].map((idea) => (
                <IdeaCard
                  key={idea.ticker}
                  idea={idea}
                  watched={watchlist.has(idea.ticker.toUpperCase())}
                  onWatch={() => void toggleWatch(idea.ticker)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="text-[11px] text-neutral-400">
        Ideas come from model scores and are for research only. They are not recommendations to buy or sell, and do not
        account for your goals, taxes or full financial situation.
      </p>
    </Card>
  );
}
