import type { ReactNode } from 'react';
import type { DataHealthResponse } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { RelativeTime } from '@/components/data-health/RelativeTime';

interface CoverageTilesProps {
  coverage: DataHealthResponse['coverage'];
  now: number;
}

function Tile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 text-xl font-semibold tabular-nums text-neutral-900">{children}</div>
      {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function CoverageTiles({ coverage, now }: CoverageTilesProps) {
  const { stocks_total, stocks_refreshed_24h } = coverage;
  const pct = stocks_total > 0 ? Math.round((stocks_refreshed_24h / stocks_total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" data-testid="coverage-tiles">
      <Tile label="Refreshed in 24h" hint={`${pct}% of tracked stocks`}>
        {stocks_refreshed_24h.toLocaleString()}
        <span className="text-sm font-normal text-muted-foreground"> / {stocks_total.toLocaleString()}</span>
      </Tile>
      <Tile label="Price history tickers" hint="Tickers with daily bars">
        {coverage.price_daily_tickers.toLocaleString()}
      </Tile>
      <Tile label="Latest bar date" hint={coverage.latest_bar_date ?? undefined}>
        <RelativeTime value={coverage.latest_bar_date} now={now} />
      </Tile>
      <Tile label="Regime as of" hint={coverage.regime_as_of ?? undefined}>
        <RelativeTime value={coverage.regime_as_of} now={now} />
      </Tile>
      <Tile label="Last score snapshot">
        <RelativeTime value={coverage.last_snapshot_at} now={now} />
      </Tile>
      <Tile label="Filings last synced">
        <RelativeTime value={coverage.filings_last_synced_at} now={now} />
      </Tile>
    </div>
  );
}
