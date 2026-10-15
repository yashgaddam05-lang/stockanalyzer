import type { StockListItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { CAP_OPTIONS, capBucket } from '@/components/explore/filters';

export type HeatmapMetric = 'avgScore' | 'avgRisk' | 'count' | 'avgChange';
export const UNKNOWN_BUCKET = 'Unknown';

export interface HeatmapCell {
  sector: string;
  bucket: string;
  count: number;
  value: number | null;
  tickers: string[];
}

export interface Heatmap {
  sectors: string[];
  buckets: string[];
  cells: HeatmapCell[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function metricValue(
  group: StockListItem[],
  analyses: Record<string, AnalysisResult>,
  metric: HeatmapMetric,
): number | null {
  if (group.length === 0) return null;
  switch (metric) {
    case 'count':
      return group.length;
    case 'avgScore':
      return mean(
        group
          .map((s) => (finite(analyses[s.ticker]?.totalScore) ? analyses[s.ticker].totalScore : s.three_x_score))
          .filter(finite),
      );
    case 'avgRisk':
      return mean(group.map((s) => (finite(s.risk_score) ? s.risk_score : analyses[s.ticker]?.riskScore)).filter(finite));
    case 'avgChange':
      return mean(group.map((s) => s.score_change).filter(finite));
  }
}

/** Groups stocks into a sector x market-cap grid. Pure; safe to unit test. */
export function buildHeatmap(
  stocks: StockListItem[],
  analyses: Record<string, AnalysisResult>,
  metric: HeatmapMetric,
): Heatmap {
  const baseBuckets = CAP_OPTIONS.map((o) => o.value).filter((v) => v !== 'all') as string[];
  const groups = new Map<string, StockListItem[]>();
  const sectorCounts = new Map<string, number>();
  let hasUnknown = false;

  for (const s of stocks) {
    const sector = s.sector ?? '';
    const bucket = capBucket(s.market_cap) ?? UNKNOWN_BUCKET;
    if (bucket === UNKNOWN_BUCKET) hasUnknown = true;
    const key = `${sector}\u0000${bucket}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
    sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
  }

  const sectors = Array.from(sectorCounts.keys()).sort(
    (a, b) => (sectorCounts.get(b) ?? 0) - (sectorCounts.get(a) ?? 0) || a.localeCompare(b),
  );
  const buckets = hasUnknown ? [...baseBuckets, UNKNOWN_BUCKET] : baseBuckets;

  const cells: HeatmapCell[] = [];
  for (const sector of sectors) {
    for (const bucket of buckets) {
      const group = groups.get(`${sector}\u0000${bucket}`) ?? [];
      cells.push({
        sector,
        bucket,
        count: group.length,
        value: metricValue(group, analyses, metric),
        tickers: group.map((s) => s.ticker),
      });
    }
  }

  return { sectors, buckets, cells };
}
