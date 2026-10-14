import { useEffect } from 'react';
import type { Stock } from '@/lib/supabase';
import { analyzeStock, formatMarketCap, getScoreColor, getScoreBg, getRiskLabel } from '@/lib/analysis';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  X, Star, TrendingUp, DollarSign, Activity, FlaskConical, ShieldCheck, Zap,
  Rocket, AlertTriangle, Clock, BarChart3,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  DollarSign,
  Activity,
  FlaskConical,
  ShieldCheck,
  Zap,
};

export function StockDetailModal({
  stock,
  isWatched,
  onClose,
  onToggleWatch,
}: {
  stock: Stock;
  isWatched: boolean;
  onClose: () => void;
  onToggleWatch: (e: React.MouseEvent) => void;
}) {
  const analysis = analyzeStock(stock);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const riskVariantMap: Record<string, 'success' | 'secondary' | 'warning' | 'danger'> = {
    low: 'success',
    medium: 'secondary',
    high: 'warning',
    extreme: 'danger',
  };
  const riskVariant = riskVariantMap[stock.risk_level];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl border-border bg-card shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-semibold tracking-tight text-neutral-900">{stock.ticker}</DialogTitle>
                <Badge variant={riskVariant}>{getRiskLabel(stock.risk_level)}</Badge>
              </div>
              <DialogDescription className="mt-1 text-[13px]">{stock.company_name}</DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={isWatched ? 'outline' : 'ghost'}
                size="icon"
                onClick={(e) => onToggleWatch(e as unknown as React.MouseEvent)}
                className={isWatched ? 'text-neutral-900 border-neutral-300' : 'text-neutral-400'}
              >
                <Star className={`w-4 h-4 ${isWatched ? 'fill-neutral-900' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Top stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center py-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">3x Score</p>
              <p className={`text-3xl font-bold tabular-nums ${getScoreColor(analysis.totalScore)}`}>{analysis.totalScore}</p>
              <Progress
                value={analysis.totalScore}
                className="mt-2.5 h-1"
                indicatorClassName={getScoreBg(analysis.totalScore)}
              />
            </div>
            <div className="text-center py-3 border-x border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Rating</p>
              <p className={`text-[15px] font-semibold ${getScoreColor(analysis.totalScore)}`}>{analysis.rating}</p>
              <div className="flex items-center justify-center gap-1 mt-1.5 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-[11px]">{analysis.timeframe}</span>
              </div>
            </div>
            <div className="text-center py-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Probability</p>
              <p className={`text-3xl font-bold tabular-nums ${analysis.threeXProbability >= 60 ? 'text-neutral-900' : analysis.threeXProbability >= 40 ? 'text-neutral-600' : 'text-neutral-400'}`}>
                {analysis.threeXProbability}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">est. to 3x</p>
            </div>
          </div>

          <Separator />

          {/* Company info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoTile label="Sector" value={stock.sector} />
            <InfoTile label="Market Cap" value={formatMarketCap(stock.market_cap)} />
            <InfoTile label="Price" value={`$${stock.current_price.toFixed(2)}`} />
            <InfoTile label="Beta" value={stock.beta.toFixed(2)} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="thesis" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-neutral-100 rounded-lg">
              <TabsTrigger value="thesis" className="text-[12px] rounded-md">Thesis</TabsTrigger>
              <TabsTrigger value="breakdown" className="text-[12px] rounded-md">Breakdown</TabsTrigger>
              <TabsTrigger value="metrics" className="text-[12px] rounded-md">Metrics</TabsTrigger>
            </TabsList>

            {/* Thesis Tab */}
            <TabsContent value="thesis" className="space-y-4 pt-3">
              <div>
                <h3 className="text-[13px] font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-neutral-400" />
                  Investment Thesis
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed bg-neutral-50 border border-border rounded-lg p-4">
                  {stock.thesis}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="p-4 border-border bg-neutral-50/50">
                  <h3 className="text-[13px] font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <Rocket className="w-3.5 h-3.5 text-neutral-500" />
                    Catalysts
                  </h3>
                  <ul className="space-y-2">
                    {analysis.keyCatalysts.map((catalyst, i) => (
                      <li key={i} className="text-[12px] text-muted-foreground flex items-start gap-2 leading-relaxed">
                        <span className="text-neutral-400 mt-0.5 flex-shrink-0">—</span>
                        <span>{catalyst}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-4 border-border bg-neutral-50/50">
                  <h3 className="text-[13px] font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-neutral-500" />
                    Risks
                  </h3>
                  <ul className="space-y-2">
                    {analysis.keyRisks.map((risk, i) => (
                      <li key={i} className="text-[12px] text-muted-foreground flex items-start gap-2 leading-relaxed">
                        <span className="text-neutral-400 mt-0.5 flex-shrink-0">—</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </TabsContent>

            {/* Breakdown Tab */}
            <TabsContent value="breakdown" className="space-y-2.5 pt-3">
              {analysis.breakdown.map((item) => {
                const Icon = iconMap[item.icon] || Activity;
                const pct = (item.score / item.maxScore) * 100;
                return (
                  <div key={item.label} className="bg-neutral-50 border border-border rounded-lg p-3.5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-7 h-7 rounded-md bg-white border border-border flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-neutral-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-neutral-900">{item.label}</span>
                          <span className="text-[13px] font-bold text-neutral-900 tabular-nums">
                            {item.score}<span className="text-muted-foreground font-normal">/{item.maxScore}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <Progress
                      value={pct}
                      className="ml-10 h-1"
                      indicatorClassName={
                        pct >= 75 ? 'bg-neutral-900' :
                        pct >= 50 ? 'bg-neutral-700' :
                        pct >= 30 ? 'bg-neutral-500' : 'bg-neutral-300'
                      }
                    />
                    <p className="text-[11px] text-muted-foreground mt-2 ml-10 leading-relaxed">{item.description}</p>
                  </div>
                );
              })}
            </TabsContent>

            {/* Metrics Tab */}
            <TabsContent value="metrics" className="pt-3">
              <Card className="border-border overflow-hidden">
                <table className="w-full">
                  <tbody>
                    <MetricRow label="Revenue Growth (YoY)" value={`${stock.revenue_growth_yoy > 0 ? '+' : ''}${stock.revenue_growth_yoy.toFixed(1)}%`} />
                    <MetricRow label="Earnings Growth (YoY)" value={`${stock.earnings_growth_yoy > 0 ? '+' : ''}${stock.earnings_growth_yoy.toFixed(1)}%`} />
                    <MetricRow label="Momentum Score" value={`${stock.momentum_score}/100`} />
                    <MetricRow label="Volatility (Annualized)" value={`${stock.volatility.toFixed(0)}%`} />
                    <MetricRow label="Debt to Equity" value={stock.debt_to_equity.toFixed(2)} />
                    <MetricRow label="Beta" value={stock.beta.toFixed(2)} />
                    <MetricRow label="R&D as % of Revenue" value={`${stock.rd_ratio.toFixed(1)}%`} />
                    <MetricRow label="Pipeline Candidates" value={`${stock.pipeline_count}`} />
                    <MetricRow label="Cash Runway" value={stock.cash_runway_months > 0 ? `${stock.cash_runway_months} months` : 'N/A (profitable)'} last />
                  </tbody>
                </table>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Disclaimer */}
          <Separator />
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Scores are generated by a heuristic model from stored metrics, not live market data. This is not financial advice. Always do your own research.
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-semibold text-neutral-900">{value}</p>
    </div>
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
