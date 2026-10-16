import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PortfolioValuation } from '@/lib/portfolio';
import { POSITION_WEIGHT_LIMIT, SECTOR_WEIGHT_LIMIT } from '@/lib/portfolio';
import { getRiskColor, getScoreColor } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { formatMoney, formatPct } from '@/components/portfolio/portfolio-format';

function Bar({ weight, warn }: { weight: number; warn?: boolean }) {
  const width = Math.max(0, Math.min(1, weight)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
      <div
        className={cn('h-full rounded-full transition-all', warn ? 'bg-amber-500' : 'bg-neutral-800')}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function PanelTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SectorExposure({ valuation }: { valuation: PortfolioValuation }) {
  const rows = valuation.sector_exposure;
  return (
    <Card className="p-4 sm:p-6">
      <PanelTitle title="Sector exposure" sub={`Share of priced market value. Flag above ${formatPct(SECTOR_WEIGHT_LIMIT, false, 0)}.`} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No priced positions yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const warn = s.weight > SECTOR_WEIGHT_LIMIT;
            return (
              <li key={s.sector} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-neutral-800">{s.sector}</span>
                  <span className="shrink-0 tabular-nums text-neutral-600">
                    <span className={cn('font-medium', warn ? 'text-amber-700' : 'text-neutral-900')}>{formatPct(s.weight)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatMoney(s.market_value, true)}</span>
                  </span>
                </div>
                <Bar weight={s.weight} warn={warn} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function RiskExposure({ valuation }: { valuation: PortfolioValuation }) {
  const r = valuation.risk_exposure;
  return (
    <Card className="p-4 sm:p-6">
      <PanelTitle title="Risk exposure" sub="By risk level, weighted by priced market value." />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Weighted risk score</p>
          <p className="text-xl font-semibold tabular-nums text-neutral-900">
            {r.weighted_risk_score === null ? '-' : r.weighted_risk_score.toFixed(1)}
            {r.weighted_risk_score !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">/100</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Weighted 3x score</p>
          <p
            className={cn(
              'text-xl font-semibold tabular-nums',
              r.weighted_three_x_score === null ? 'text-neutral-900' : getScoreColor(r.weighted_three_x_score)
            )}
          >
            {r.weighted_three_x_score === null ? '-' : r.weighted_three_x_score.toFixed(1)}
          </p>
        </div>
      </div>
      {r.by_level.length === 0 ? (
        <p className="text-sm text-muted-foreground">No priced positions yet.</p>
      ) : (
        <ul className="space-y-3">
          {r.by_level.map((l) => (
            <li key={l.level} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={cn('rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize', getRiskColor(l.level))}
                >
                  {l.level}
                </span>
                <span className="tabular-nums font-medium text-neutral-900">{formatPct(l.weight)}</span>
              </div>
              <Bar weight={l.weight} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ConcentrationFlags({ valuation }: { valuation: PortfolioValuation }) {
  const { flags, concentration } = valuation;
  return (
    <Card className="p-4 sm:p-6">
      <PanelTitle
        title="Concentration checks"
        sub={`Flags positions above ${formatPct(POSITION_WEIGHT_LIMIT, false, 0)}, sectors above ${formatPct(SECTOR_WEIGHT_LIMIT, false, 0)} and unpriced tickers.`}
      />
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Largest position: <span className="tabular-nums text-neutral-900">{formatPct(concentration.top_position_weight)}</span>
        </span>
        <span>
          HHI: <span className="tabular-nums text-neutral-900">{concentration.hhi === null ? '-' : concentration.hhi.toFixed(3)}</span>
        </span>
      </div>
      {flags.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          No concentration flags.
        </p>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
