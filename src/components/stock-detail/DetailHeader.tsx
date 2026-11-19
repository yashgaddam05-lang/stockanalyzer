import { Star } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import { formatMarketCap } from '@/lib/analysis';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AddToListMenu } from '@/components/stock-detail/AddToListMenu';
import { cn } from '@/lib/utils';
import type { StockDataQuality } from '@/lib/data-provenance';
import { DataTrustBadge } from '@/components/stock-detail/DataQualityPanel';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function formatVolume(v: number | null | undefined): string {
  if (!isNum(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function RangeBar({ low, high, price }: { low: number; high: number; price: number | null }) {
  const pct = price === null ? null : Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  return (
    <div className="w-full max-w-xs">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">52-week range</p>
      <div className="relative h-1.5 rounded-full bg-neutral-200" aria-hidden="true">
        {pct !== null && (
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-900 shadow"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-neutral-600">
        <span>${low.toFixed(2)}</span>
        <span>${high.toFixed(2)}</span>
      </div>
      <span className="sr-only">
        52-week low ${low.toFixed(2)}, high ${high.toFixed(2)}
        {pct !== null ? `, current price at ${Math.round(pct)}% of range` : ''}
      </span>
    </div>
  );
}

export interface DetailHeaderProps {
  stock: StockListItem;
  quality?: StockDataQuality | null;
  watched: boolean;
  onToggleWatch: () => void;
}

export function DetailHeader({ stock, quality, watched, onToggleWatch }: DetailHeaderProps) {
  const price = isNum(stock.current_price) ? stock.current_price : null;
  const low = stock.fifty_two_week_low;
  const high = stock.fifty_two_week_high;
  const isLive = stock.data_source === 'yahoo';
  const refreshed = formatDateTime(stock.last_refreshed_at);
  const sectorLine = [stock.sector, stock.industry].filter(Boolean).join(' · ');

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">{stock.ticker}</h1>
            <span
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] font-medium',
                isLive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
              )}
            >
              {isLive ? 'Live' : 'Seed data'}
            </span>
            {quality && <DataTrustBadge quality={quality} />}
            {refreshed && <span className="text-[11px] text-muted-foreground">Updated {refreshed}</span>}
          </div>
          <p className="text-sm text-neutral-700">{stock.company_name}</p>
          {sectorLine && <p className="mt-0.5 text-[12px] text-muted-foreground">{sectorLine}</p>}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            variant={watched ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-2 text-[13px]"
            onClick={onToggleWatch}
            aria-pressed={watched}
            aria-label={watched ? `Remove ${stock.ticker} from watchlist` : `Add ${stock.ticker} to watchlist`}
          >
            <Star className={cn('h-3.5 w-3.5', watched && 'fill-white')} aria-hidden="true" />
            {watched ? 'Watching' : 'Watch'}
          </Button>
          <AddToListMenu ticker={stock.ticker} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">{price === null ? '—' : `$${price.toFixed(2)}`}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Market cap</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">
            {isNum(stock.market_cap) ? formatMarketCap(stock.market_cap) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Avg volume</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">{formatVolume(stock.avg_volume)}</p>
        </div>
        {isNum(low) && isNum(high) && high > low && (
          <div className="col-span-2 sm:col-span-1">
            <RangeBar low={low} high={high} price={price} />
          </div>
        )}
      </div>
    </Card>
  );
}
