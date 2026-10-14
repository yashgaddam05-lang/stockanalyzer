import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '@/lib/store';
import {
  formatMarketCap, formatPrice, formatRunway, getScoreColor, RISK_BAND_VARIANT, getRiskLabel,
} from '@/lib/analysis';
import { ScoreRing } from '@/components/StockCard';
import { ScoreDelta } from '@/components/ScoreDelta';
import { Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft, Star, TrendingUp, Scale, Activity, ShieldCheck, Rocket, Crown, Zap, Globe,
  AlertTriangle, Clock, BarChart3, Target, XCircle, LineChart,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, Scale, Activity, ShieldCheck, Rocket, Crown, Zap, Globe,
};

export default function StockDetail() {
  const { ticker = '' } = useParams();
  const { bySymbol, loading, history, isWatched, toggleWatch, watchlistsReady, watchlists, activeListId } = useData();
  const item = bySymbol.get(ticker.toUpperCase());

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = item ? `${item.stock.ticker} · 3x Hunter` : '3x Hunter';
    return () => { document.title = '3x Hunter'; };
  }, [item]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <Card className="p-12 text-center border-border">
        <p className="text-sm font-medium text-neutral-900">No stock found for "{ticker.toUpperCase()}"</p>
        <Link to="/explore" className="text-[13px] text-muted-foreground underline underline-offset-2 mt-2 inline-block">Back to Explore</Link>
      </Card>
    );
  }

  const { stock, analysis, delta } = item;
  const snapshots = history.get(stock.ticker) || [];
  const watched = isWatched(stock.ticker);
  const activeList = watchlists.find((l) => l.id === activeListId);
  const req = analysis.requirements;

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-neutral-900 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Explore
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900">{stock.ticker}</h2>
            <Badge variant={RISK_BAND_VARIANT[analysis.risk.band]}>{analysis.risk.band} risk · {analysis.risk.score}/100</Badge>
            <Badge variant="outline">{stock.sector}</Badge>
          </div>
          <p className="text-[15px] text-muted-foreground mt-1">{stock.company_name}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Data updated {new Date(stock.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <Button
          variant={watched ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() => toggleWatch(stock.ticker)}
        >
          <Star className={`w-3.5 h-3.5 ${watched ? 'fill-white' : ''}`} />
          {watched ? 'Watching' : 'Add to watchlist'}
          {watchlistsReady && activeList && <span className="text-[11px] opacity-70 hidden sm:inline">· {activeList.name}</span>}
        </Button>
      </div>

      {/* Summary */}
      <Card className="p-5 border-border">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 items-center">
          <div className="flex items-center gap-4 col-span-2 lg:col-span-1">
            <ScoreRing score={analysis.totalScore} size={80} />
            <div>
              <p className={`text-[14px] font-semibold ${getScoreColor(analysis.totalScore)}`}>{analysis.rating}</p>
              <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-[11px]">{analysis.timeframe}</span>
              </div>
              <div className="mt-1"><ScoreDelta delta={delta} /></div>
            </div>
          </div>
          <SummaryTile label="Price" value={formatPrice(stock.current_price)} sub={stock.target_price ? `Target ${formatPrice(stock.target_price)}` : 'No analyst target yet'} />
          <SummaryTile label="Market Cap" value={formatMarketCap(stock.market_cap)} sub={`3x = ${formatMarketCap(req.targetMarketCap)}`} />
          <SummaryTile label="Heuristic 3x odds" value={`${analysis.threeXProbability}%`} sub="Not a statistical estimate" />
          <SummaryTile label="Risk score" value={`${analysis.risk.score}/100`} sub={getRiskLabel(stock.risk_level) + ' (editorial)'} />
        </div>
        {snapshots.length >= 2 && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 mb-2">
              <LineChart className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Score history ({snapshots.length} snapshots)</span>
            </div>
            <Sparkline values={snapshots.map((s) => s.score)} />
          </>
        )}
      </Card>

      {/* Thesis */}
      <div>
        <h3 className="text-[13px] font-semibold text-neutral-900 mb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-neutral-400" /> Investment Thesis
        </h3>
        <p className="text-[14px] text-muted-foreground leading-relaxed bg-neutral-50 border border-border rounded-lg p-4">{stock.thesis}</p>
      </div>

      <Tabs defaultValue="cases" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-neutral-100 rounded-lg">
          <TabsTrigger value="cases" className="text-[12px] rounded-md">Cases</TabsTrigger>
          <TabsTrigger value="breakdown" className="text-[12px] rounded-md">Score</TabsTrigger>
          <TabsTrigger value="risk" className="text-[12px] rounded-md">Risk</TabsTrigger>
          <TabsTrigger value="metrics" className="text-[12px] rounded-md">Metrics</TabsTrigger>
        </TabsList>

        {/* Cases */}
        <TabsContent value="cases" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {analysis.cases.map((c) => (
              <Card key={c.label} className={`p-4 border-border ${c.label === 'Bull' ? 'border-neutral-900' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-neutral-900">{c.label} case</span>
                  <span className={`text-[12px] font-semibold tabular-nums ${c.changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(0)}%
                  </span>
                </div>
                <p className="text-xl font-bold text-neutral-900 tabular-nums">{formatPrice(c.price)}</p>
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">{c.narrative}</p>
              </Card>
            ))}
          </div>

          <Card className="p-4 border-border">
            <h3 className="text-[13px] font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-neutral-500" /> What must happen for 3x
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryTile label="Target price" value={formatPrice(req.targetPrice)} />
              <SummaryTile label="Target market cap" value={formatMarketCap(req.targetMarketCap)} />
              <SummaryTile label={`Required CAGR (${req.horizonYears}y)`} value={`${(req.requiredCagr * 100).toFixed(0)}%/yr`} />
              <SummaryTile
                label="Years to 3x revenue"
                value={req.yearsToTripleRevenue ? `${req.yearsToTripleRevenue.toFixed(1)} yrs` : 'n/a'}
                sub="At current growth, constant multiple"
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ListCard title="Catalysts" icon={Rocket} items={analysis.keyCatalysts} />
            <ListCard title="Risks" icon={AlertTriangle} items={analysis.keyRisks} />
            <ListCard title="Thesis invalidation signals" icon={XCircle} items={analysis.invalidation} />
          </div>
        </TabsContent>

        {/* Breakdown */}
        <TabsContent value="breakdown" className="space-y-2.5 pt-4">
          {analysis.breakdown.map((b) => {
            const Icon = iconMap[b.icon] || Activity;
            const pctVal = (b.score / b.maxScore) * 100;
            return (
              <div key={b.key} className="bg-neutral-50 border border-border rounded-lg p-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-7 h-7 rounded-md bg-white border border-border flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-neutral-500" />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-neutral-900 flex items-center gap-2">
                      {b.label}
                      <span className="text-[11px] text-muted-foreground font-normal">{b.maxScore}%</span>
                      {b.proxy && <Badge variant="outline" className="text-[10px] py-0">proxy</Badge>}
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 tabular-nums">
                      {b.score}<span className="text-muted-foreground font-normal">/{b.maxScore}</span>
                    </span>
                  </div>
                </div>
                <Progress
                  value={pctVal}
                  className="ml-10 h-1"
                  indicatorClassName={pctVal >= 75 ? 'bg-neutral-900' : pctVal >= 50 ? 'bg-neutral-700' : pctVal >= 30 ? 'bg-neutral-500' : 'bg-neutral-300'}
                />
                <p className="text-[11px] text-muted-foreground mt-2 ml-10 leading-relaxed">{b.description}</p>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground pt-1">
            Proxy dimensions use stand-in signals until dedicated data feeds are added. <Link to="/methodology" className="underline underline-offset-2">How scoring works</Link>
          </p>
        </TabsContent>

        {/* Risk */}
        <TabsContent value="risk" className="pt-4">
          <Card className="p-4 border-border space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-neutral-900">Independent risk score</span>
              <span className="text-xl font-bold tabular-nums text-neutral-900">{analysis.risk.score}<span className="text-sm text-muted-foreground font-normal">/100 · {analysis.risk.band}</span></span>
            </div>
            {analysis.risk.factors.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-semibold tabular-nums text-neutral-900">{f.points}/{f.maxPoints}</span>
                </div>
                <Progress value={(f.points / f.maxPoints) * 100} className="h-1" indicatorClassName="bg-neutral-700" />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              Higher means riskier. Computed from volatility, beta, leverage, cash runway, company size, and profitability. Separate from the 3x score.
            </p>
          </Card>
        </TabsContent>

        {/* Metrics */}
        <TabsContent value="metrics" className="pt-4">
          <Card className="border-border overflow-hidden">
            <table className="w-full">
              <tbody>
                <MetricRow label="Revenue Growth (YoY)" value={`${stock.revenue_growth_yoy > 0 ? '+' : ''}${stock.revenue_growth_yoy.toFixed(1)}%`} />
                <MetricRow label="Earnings Growth (YoY)" value={`${stock.earnings_growth_yoy > 0 ? '+' : ''}${stock.earnings_growth_yoy.toFixed(1)}%`} />
                <MetricRow label="Forward P/E" value={stock.forward_pe ? stock.forward_pe.toFixed(1) : 'n/a'} />
                <MetricRow label="Price / Sales" value={stock.price_to_sales ? `${stock.price_to_sales.toFixed(1)}x` : 'n/a'} />
                <MetricRow label="Analyst Target (mean)" value={stock.target_price ? formatPrice(stock.target_price) : 'n/a'} />
                <MetricRow label="Momentum Score" value={`${stock.momentum_score}/100`} />
                <MetricRow label="Volatility (Annualized)" value={`${stock.volatility.toFixed(0)}%`} />
                <MetricRow label="Debt to Equity" value={stock.debt_to_equity.toFixed(2)} />
                <MetricRow label="Beta" value={stock.beta.toFixed(2)} />
                <MetricRow label="R&D as % of Revenue" value={`${stock.rd_ratio.toFixed(1)}%`} />
                <MetricRow label="Pipeline / Launch Events" value={`${stock.pipeline_count}`} />
                <MetricRow label="Cash Runway" value={formatRunway(stock)} last />
              </tbody>
            </table>
          </Card>
          <p className="text-[11px] text-muted-foreground mt-2">n/a fields fill in after the next Refresh pulls them from Yahoo Finance.</p>
        </TabsContent>
      </Tabs>

      <Separator />
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Scenario prices are mechanical illustrations derived from stored metrics, not forecasts or price targets. This page is for education and research only and is not investment advice.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{label}</p>
      <p className="text-[15px] font-semibold text-neutral-900 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ListCard({ title, icon: Icon, items }: { title: string; icon: React.ComponentType<{ className?: string }>; items: string[] }) {
  return (
    <Card className="p-4 border-border bg-neutral-50/50">
      <h3 className="text-[13px] font-semibold text-neutral-900 mb-3 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-neutral-500" /> {title}
      </h3>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="text-[12px] text-muted-foreground flex items-start gap-2 leading-relaxed">
            <span className="text-neutral-400 mt-0.5 flex-shrink-0">—</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MetricRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <tr className={last ? '' : 'border-b border-border'}>
      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{label}</td>
      <td className="px-4 py-2.5 text-right text-[12px] font-semibold text-neutral-900 tabular-nums">{value}</td>
    </tr>
  );
}
