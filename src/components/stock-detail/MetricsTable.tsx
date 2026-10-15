import type { StockListItem } from '@/lib/supabase';
import { Card } from '@/components/ui/card';

const DASH = '—';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmt(v: number | null | undefined, digits = 2, suffix = '', prefix = ''): string {
  if (!isNum(v)) return DASH;
  return `${prefix}${v.toFixed(digits)}${suffix}`;
}

function signedPct(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return DASH;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

interface Row {
  label: string;
  value: string;
}

export function MetricsTable({ stock }: { stock: StockListItem }) {
  const target = stock.target_mean_price;
  const price = stock.current_price;
  const upside = isNum(target) && isNum(price) && price > 0 ? ((target - price) / price) * 100 : null;

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Valuation',
      rows: [
        { label: 'Forward P/E', value: fmt(stock.forward_pe, 1, 'x') },
        { label: 'Price / Sales', value: fmt(stock.price_to_sales, 1, 'x') },
        { label: 'PEG ratio', value: fmt(stock.peg_ratio, 2) },
        { label: 'Target mean price', value: fmt(target, 2, '', '$') },
        { label: 'Implied upside', value: signedPct(upside) },
      ],
    },
    {
      title: 'Profitability',
      rows: [
        { label: 'Gross margin', value: fmt(stock.gross_margin, 1, '%') },
        { label: 'Operating margin', value: fmt(stock.operating_margin, 1, '%') },
        { label: 'Profit margin', value: fmt(stock.profit_margin, 1, '%') },
        { label: 'R&D / revenue', value: fmt(stock.rd_ratio, 1, '%') },
      ],
    },
    {
      title: 'Growth & momentum',
      rows: [
        { label: 'Revenue growth (YoY)', value: signedPct(stock.revenue_growth_yoy) },
        { label: 'Earnings growth (YoY)', value: signedPct(stock.earnings_growth_yoy) },
        { label: 'Momentum score', value: fmt(stock.momentum_score, 0, ' / 100') },
        { label: 'Pipeline catalysts', value: fmt(stock.pipeline_count, 0) },
      ],
    },
    {
      title: 'Balance sheet & risk',
      rows: [
        { label: 'Debt / equity', value: fmt(stock.debt_to_equity, 2) },
        { label: 'Cash runway', value: fmt(stock.cash_runway_months, 0, ' mo') },
        { label: 'Beta', value: fmt(stock.beta, 2) },
        { label: 'Volatility', value: fmt(stock.volatility, 0, '%') },
      ],
    },
  ];

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-sm font-semibold text-neutral-900">Key metrics</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <dl className="divide-y divide-neutral-100">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-1.5 text-[13px]">
                  <dt className="text-neutral-600">{row.label}</dt>
                  <dd className="font-medium tabular-nums text-neutral-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}
