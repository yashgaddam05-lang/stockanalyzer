import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { ApiError, getPriceHistory } from '@/lib/api';
import type { PriceHistoryResponse, PriceRange } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PriceChartMarker {
  /** YYYY-MM-DD */
  date: string;
  label: string;
  kind: 'earnings' | 'catalyst';
}

export interface PriceChartProps {
  ticker: string;
  markers?: PriceChartMarker[];
}

const RANGES: { value: PriceRange; label: string; long: string }[] = [
  { value: '1mo', label: '1M', long: '1 month' },
  { value: '3mo', label: '3M', long: '3 months' },
  { value: '6mo', label: '6M', long: '6 months' },
  { value: '1y', label: '1Y', long: '1 year' },
  { value: '5y', label: '5Y', long: '5 years' },
];

const NEUTRAL_900 = '#171717';
const NEUTRAL_500 = '#737373';
const NEUTRAL_400 = '#a3a3a3';
const NEUTRAL_200 = '#e5e5e5';
const EMERALD_500 = '#10b981';
const RED_500 = '#ef4444';

interface ChartPoint {
  ts: number;
  t: string;
  close: number;
  volume: number | null;
  markers: PriceChartMarker[];
}

type FetchState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function toTs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function formatTick(ts: number, range: PriceRange): string {
  const d = new Date(ts);
  if (range === '5y') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatPrice(value: number, currency: string | null): string {
  try {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return value.toFixed(2);
  }
}

function formatVolume(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

function errorMessage(err: unknown, ticker: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return `No price history found for ${ticker}.`;
    if (err.status === 502) return 'The price data provider is unavailable right now. Try again shortly.';
    return err.message || 'Could not load price history.';
  }
  return 'Could not load price history.';
}

interface TooltipPayloadItem {
  payload?: ChartPoint;
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  currency: string | null;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-neutral-900">{formatFullDate(point.ts)}</p>
      <p className="tabular-nums text-neutral-700">Close {formatPrice(point.close, currency)}</p>
      <p className="tabular-nums text-neutral-500">Volume {formatVolume(point.volume)}</p>
      {point.markers.map((m) => (
        <p key={`${m.kind}-${m.date}-${m.label}`} className="mt-1 text-neutral-900">
          <span className="text-neutral-500">{m.kind === 'earnings' ? 'Earnings' : 'Catalyst'}:</span> {m.label}
        </p>
      ))}
    </div>
  );
}

export function PriceChart({ ticker, markers }: PriceChartProps) {
  const [range, setRange] = useState<PriceRange>('3mo');
  const [cache, setCache] = useState<Partial<Record<PriceRange, PriceHistoryResponse>>>({});
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = useState(0);

  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const tickerRef = useRef(ticker);

  // Reset the per-range cache when the ticker changes.
  if (tickerRef.current !== ticker) {
    tickerRef.current = ticker;
    cacheRef.current = {};
    setCache({});
  }

  useEffect(() => {
    if (cacheRef.current[range]) {
      setFetchState({ status: 'ready' });
      return;
    }
    let cancelled = false;
    setFetchState({ status: 'loading' });
    getPriceHistory(ticker, range)
      .then((res) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [range]: res }));
        setFetchState({ status: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchState({ status: 'error', message: errorMessage(err, ticker) });
      });
    return () => {
      // Invalidate in-flight responses when range/ticker changes or on unmount.
      cancelled = true;
    };
  }, [ticker, range, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const data = cache[range];

  const { points, inRangeMarkers } = useMemo(() => {
    const raw = (data?.points ?? [])
      .filter((p) => typeof p.close === 'number' && Number.isFinite(p.close) && Number.isFinite(toTs(p.t)))
      .map<ChartPoint>((p) => ({ ts: toTs(p.t), t: p.t, close: p.close, volume: p.volume, markers: [] }))
      .sort((a, b) => a.ts - b.ts);
    if (raw.length === 0) return { points: raw, inRangeMarkers: [] as (PriceChartMarker & { ts: number })[] };
    const first = raw[0].ts;
    const last = raw[raw.length - 1].ts;
    const visible = (markers ?? [])
      .map((m) => ({ ...m, ts: toTs(m.date) }))
      .filter((m) => Number.isFinite(m.ts) && m.ts >= first && m.ts <= last)
      .sort((a, b) => a.ts - b.ts);
    // Attach each marker to the first point on/after its date so the tooltip can show it.
    for (const m of visible) {
      const idx = raw.findIndex((p) => p.ts >= m.ts);
      if (idx >= 0) raw[idx].markers.push(m);
    }
    return { points: raw, inRangeMarkers: visible };
  }, [data, markers]);

  const rangeMeta = RANGES.find((r) => r.value === range) ?? RANGES[1];
  const firstClose = points[0]?.close;
  const lastClose = points[points.length - 1]?.close;
  const change = points.length > 1 ? lastClose - firstClose : 0;
  const changePct = points.length > 1 && firstClose !== 0 ? (change / firstClose) * 100 : 0;
  const positive = change >= 0;
  const tint = positive ? EMERALD_500 : RED_500;
  const currency = data?.currency ?? null;
  const gradientId = `price-fill-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;

  const isReady = fetchState.status === 'ready' && data !== undefined;
  const isEmpty = isReady && points.length < 2;

  const ariaLabel = isReady && !isEmpty
    ? `${ticker} price over ${rangeMeta.long}: ${positive ? 'up' : 'down'} ${Math.abs(changePct).toFixed(2)}% from ${formatPrice(firstClose, currency)} to ${formatPrice(lastClose, currency)}`
    : `${ticker} price chart`;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Price</h2>
          {isReady && !isEmpty ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold tabular-nums text-neutral-900">{formatPrice(lastClose, currency)}</span>
              <span className={cn('text-sm font-medium tabular-nums', positive ? 'text-emerald-600' : 'text-red-600')}>
                {positive ? '+' : '-'}
                {formatPrice(Math.abs(change), currency)} ({positive ? '+' : '-'}
                {Math.abs(changePct).toFixed(2)}%)
              </span>
              <span className="text-[12px] text-muted-foreground">{rangeMeta.long}</span>
            </div>
          ) : fetchState.status === 'loading' ? (
            <Skeleton className="mt-2 h-7 w-40" />
          ) : null}
        </div>
        <div role="group" aria-label="Price chart range" className="inline-flex self-start rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              aria-label={`Show ${r.long} of price history`}
              className={cn(
                'rounded px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
                range === r.value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[220px] sm:h-[280px]">
        {fetchState.status === 'loading' && <Skeleton className="h-full w-full" aria-busy="true" aria-label="Loading price chart" />}

        {fetchState.status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <p className="max-w-xs text-[13px] text-neutral-700">{fetchState.message}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {isEmpty && (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-[13px] text-muted-foreground">No price data for this range yet.</p>
          </div>
        )}

        {isReady && !isEmpty && (
          <div role="img" aria-label={ariaLabel} className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tint} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={tint} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={NEUTRAL_200} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) => formatTick(v, range)}
                  tick={{ fontSize: 11, fill: NEUTRAL_500 }}
                  tickLine={false}
                  axisLine={{ stroke: NEUTRAL_200 }}
                  minTickGap={32}
                />
                <YAxis
                  dataKey="close"
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => v.toFixed(v >= 100 ? 0 : 2)}
                  tick={{ fontSize: 11, fill: NEUTRAL_500 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: NEUTRAL_400, strokeWidth: 1 }}
                />
                {inRangeMarkers.map((m) => (
                  <ReferenceLine
                    key={`${m.kind}-${m.date}-${m.label}`}
                    x={m.ts}
                    stroke={NEUTRAL_400}
                    strokeDasharray={m.kind === 'earnings' ? '4 3' : '1 3'}
                    strokeWidth={1}
                    ifOverflow="hidden"
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={NEUTRAL_900}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  activeDot={{ r: 3, fill: NEUTRAL_900, stroke: '#ffffff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {isReady && inRangeMarkers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Events in range</h3>
          <ul className="space-y-1 text-[13px]">
            {inRangeMarkers.map((m) => (
              <li key={`${m.kind}-${m.date}-${m.label}`} className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block w-4 border-t border-neutral-400',
                    m.kind === 'earnings' ? 'border-dashed' : 'border-dotted'
                  )}
                />
                <span className="tabular-nums text-neutral-500">{formatFullDate(m.ts)}</span>
                <span className="text-neutral-500">{m.kind === 'earnings' ? 'Earnings' : 'Catalyst'}</span>
                <span className="text-neutral-900">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">Price data: Yahoo Finance, delayed. Not investment advice.</p>
    </Card>
  );
}

export default PriceChart;
