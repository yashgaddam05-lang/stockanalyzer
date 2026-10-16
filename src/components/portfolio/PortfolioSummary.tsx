import type { PortfolioValuation } from '@/lib/portfolio';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatMoney, formatPct, formatSignedMoney, plColor } from '@/components/portfolio/portfolio-format';

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums text-neutral-900 sm:text-2xl', valueClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export function PortfolioSummary({ valuation }: { valuation: PortfolioValuation }) {
  const t = valuation.totals;
  const total = valuation.positions.length;
  const unpriced = total - t.priced_positions;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Market value" value={formatMoney(t.market_value, true)} sub="Priced positions, last refresh" />
      <Stat
        label="Cost"
        value={formatMoney(t.cost_value, true)}
        sub={unpriced > 0 ? 'Includes unpriced positions at cost' : 'All positions'}
      />
      <Stat
        label="Unrealized P/L"
        value={formatSignedMoney(t.unrealized_pl)}
        sub={t.unrealized_pl_pct === null ? 'No priced cost' : `${formatPct(t.unrealized_pl_pct, true)} on priced cost`}
        valueClass={plColor(t.unrealized_pl)}
      />
      <Stat
        label="Priced"
        value={`${t.priced_positions}/${total}`}
        sub={unpriced > 0 ? `${unpriced} unpriced: ${t.unpriced_tickers.join(', ')}` : 'All positions priced'}
      />
    </div>
  );
}
