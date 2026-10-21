import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Grid3x3 } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { CAP_OPTIONS } from '@/components/explore/filters';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildHeatmap, UNKNOWN_BUCKET } from '@/components/dashboard/heatmap';
import type { HeatmapCell, HeatmapMetric } from '@/components/dashboard/heatmap';
import { cn } from '@/lib/utils';
import { withScope } from '@/components/dashboard/scope';
import type { DashboardScope } from '@/lib/supabase';

export interface SectorCapHeatmapProps {
  stocks: StockListItem[];
  analyses: Record<string, AnalysisResult>;
  title?: string;
  /** When set, cell links carry the scope so Explore shows the same universe. */
  scope?: DashboardScope;
}

const METRICS: { value: HeatmapMetric; label: string; aria: string }[] = [
  { value: 'avgScore', label: 'Avg score', aria: 'average score' },
  { value: 'avgRisk', label: 'Avg risk', aria: 'average risk' },
  { value: 'count', label: 'Count', aria: 'stock count' },
  { value: 'avgChange', label: 'Score change', aria: 'average score change' },
];

/** Literal class strings so Tailwind keeps them. Index 0 = lightest. */
const NEUTRAL_RAMP = [
  'bg-neutral-100 text-neutral-900',
  'bg-neutral-200 text-neutral-900',
  'bg-neutral-300 text-neutral-900',
  'bg-neutral-400 text-neutral-900',
  'bg-neutral-500 text-white',
  'bg-neutral-600 text-white',
  'bg-neutral-700 text-white',
  'bg-neutral-800 text-white',
  'bg-neutral-900 text-white',
];
const POS_RAMP = ['bg-emerald-50 text-emerald-900', 'bg-emerald-100 text-emerald-900', 'bg-emerald-200 text-emerald-900'];
const NEG_RAMP = ['bg-red-50 text-red-900', 'bg-red-100 text-red-900', 'bg-red-200 text-red-900'];

const BUCKET_LABEL: Record<string, string> = Object.fromEntries(
  CAP_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label]),
);

function formatValue(metric: HeatmapMetric, v: number): string {
  if (metric === 'count') return String(v);
  if (metric === 'avgChange') return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  return String(Math.round(v));
}

export function SectorCapHeatmap({
  stocks,
  analyses,
  title = 'Sector and market-cap heat map',
  scope,
}: SectorCapHeatmapProps) {
  const [metric, setMetric] = useState<HeatmapMetric>('avgScore');
  const heatmap = useMemo(() => buildHeatmap(stocks, analyses, metric), [stocks, analyses, metric]);

  const { min, max, maxAbs } = useMemo(() => {
    const vals = heatmap.cells.filter((c) => c.count > 0 && c.value !== null).map((c) => c.value as number);
    return {
      min: vals.length ? Math.min(...vals) : 0,
      max: vals.length ? Math.max(...vals) : 0,
      maxAbs: vals.length ? Math.max(...vals.map(Math.abs)) : 0,
    };
  }, [heatmap]);

  const cellTone = (v: number): string => {
    if (metric === 'avgChange') {
      if (v === 0 || maxAbs === 0) return 'bg-neutral-50 text-neutral-700';
      const tier = Math.min(2, Math.floor((Math.abs(v) / maxAbs) * 3));
      return v > 0 ? POS_RAMP[tier] : NEG_RAMP[tier];
    }
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return NEUTRAL_RAMP[Math.round(t * (NEUTRAL_RAMP.length - 1))];
  };

  const metricAria = METRICS.find((m) => m.value === metric)?.aria ?? '';
  const describe = (c: HeatmapCell): string => {
    const cap = c.bucket === UNKNOWN_BUCKET ? 'unknown market cap' : `${c.bucket} cap`;
    const base = `${c.sector || 'Unspecified sector'}, ${cap}: ${c.count} ${c.count === 1 ? 'stock' : 'stocks'}`;
    if (metric === 'count' || c.value === null) return base;
    return `${base}, ${metricAria} ${formatValue(metric, c.value)}`;
  };

  return (
    <section className="space-y-4" aria-labelledby="sector-cap-heatmap-heading">
      <Card className="min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            <h2 id="sector-cap-heatmap-heading" className="text-lg font-semibold tracking-tight text-neutral-900">
              {title}
            </h2>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as HeatmapMetric)}>
            <TabsList aria-label="Heat map metric" className="h-auto flex-wrap justify-start">
              {METRICS.map((m) => (
                <TabsTrigger key={m.value} value={m.value} className="px-2.5 py-1 text-[12px]">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-left">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Sector
                </th>
                {heatmap.buckets.map((b) => (
                  <th
                    key={b}
                    scope="col"
                    className="px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {BUCKET_LABEL[b] ?? b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.sectors.map((sector) => (
                <tr key={sector}>
                  <th scope="row" className="whitespace-nowrap px-2 py-1 text-[12px] font-medium text-neutral-700">
                    {sector || 'Unspecified'}
                  </th>
                  {heatmap.buckets.map((bucket) => {
                    const c = heatmap.cells.find((x) => x.sector === sector && x.bucket === bucket) as HeatmapCell;
                    if (c.count === 0) {
                      return (
                        <td key={bucket} className="h-14 rounded-md bg-neutral-50 text-center text-sm text-neutral-400">
                          <span aria-hidden="true">-</span>
                          <span className="sr-only">{describe(c)}</span>
                        </td>
                      );
                    }
                    const tone = c.value === null ? 'bg-neutral-50 text-neutral-500' : cellTone(c.value);
                    const content = (
                      <>
                        <span className="text-sm font-semibold tabular-nums">
                          {c.value === null ? '-' : formatValue(metric, c.value)}
                        </span>
                        {metric !== 'count' && <span className="text-[10px] tabular-nums opacity-80">n={c.count}</span>}
                      </>
                    );
                    return (
                      <td key={bucket} className="h-14 p-0">
                        {bucket === UNKNOWN_BUCKET ? (
                          <div
                            role="img"
                            aria-label={describe(c)}
                            title={c.tickers.join(', ')}
                            className={cn('flex h-14 flex-col items-center justify-center rounded-md', tone)}
                          >
                            {content}
                          </div>
                        ) : (
                          <Link
                            to={withScope(`/app/explore?sector=${encodeURIComponent(sector)}&cap=${bucket}`, scope)}
                            aria-label={describe(c)}
                            title={c.tickers.join(', ')}
                            className={cn(
                              'flex h-14 flex-col items-center justify-center rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2',
                              tone,
                            )}
                          >
                            {content}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {metric === 'avgChange' ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-label="Legend">
              <span className="h-3 w-6 rounded-sm bg-red-200" aria-hidden="true" />
              <span>Falling</span>
              <span className="h-3 w-6 rounded-sm bg-neutral-50 ring-1 ring-border" aria-hidden="true" />
              <span>Flat</span>
              <span className="h-3 w-6 rounded-sm bg-emerald-200" aria-hidden="true" />
              <span>Rising</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-label="Legend">
              <span className="tabular-nums">{formatValue(metric, min)}</span>
              <span className="flex overflow-hidden rounded-sm" aria-hidden="true">
                {NEUTRAL_RAMP.map((cls) => (
                  <span key={cls} className={cn('h-3 w-4', cls.split(' ')[0])} />
                ))}
              </span>
              <span className="tabular-nums">{formatValue(metric, max)}</span>
              <span>Darker = higher {metricAria}</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Cell shows the {metricAria} and stock count. Click a cell to explore those stocks. Educational, not investment advice.
          </p>
        </div>
      </Card>
    </section>
  );
}
