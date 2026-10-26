import { lazy, Suspense } from 'react';

// Charts the assistant draws inside its replies. The model writes a ```chart block holding one JSON spec; this
// renders it. Specs are validated and capped; anything malformed shows a small note instead of breaking the reply.
//   bar        {"type":"bar","title":"...","unit":"$"|"%","data":[{"label":"NVDA","value":24.8}]}
//   donut      {"type":"donut","title":"...","unit":"$"|"%","data":[{"label":"Tech","value":49}]}
//   scenarios  {"type":"scenarios","title":"...","amount":500,"data":[{"label":"Bull","low":609,"high":635,"odds":25}]}
//   price      {"type":"price","ticker":"NVDA"}

const PriceChart = lazy(() => import('@/components/stock-detail/PriceChart').then((m) => ({ default: m.PriceChart })));

// Categorical slots in fixed order (validated palette); gains/losses use the green/red pair with a sign, never color alone.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GAIN = '#008300';
const LOSS = '#e34948';
const MAX_ROWS = 20;

type Row = { label: string; value: number };
type ScenarioRow = { label: string; low: number; high: number; odds: number };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');

function fmt(value: number, unit: string): string {
  const abs = Math.abs(value);
  if (unit === '%') return `${value.toFixed(abs >= 100 ? 0 : 1)}%`;
  if (unit === '$') return `${value < 0 ? '-' : ''}$${abs.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 0 : 2 })}`;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

function Frame({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <figure className="my-1 rounded-xl border border-neutral-200 bg-white p-3">
      {title && <figcaption className="mb-2 text-[12px] font-semibold text-neutral-900">{title}</figcaption>}
      {children}
    </figure>
  );
}

function BarChart({ title, unit, rows }: { title?: string; unit: string; rows: Row[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  const signed = rows.some((r) => r.value < 0);
  return (
    <Frame title={title}>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const width = `${(Math.abs(r.value) / max) * (signed ? 50 : 100)}%`;
          const color = signed ? (r.value < 0 ? LOSS : GAIN) : SERIES[0];
          return (
            <div key={r.label} className="grid grid-cols-[minmax(56px,30%)_1fr_auto] items-center gap-2 text-[12px]" title={`${r.label}: ${fmt(r.value, unit)}`}>
              <span className="truncate text-neutral-700">{r.label}</span>
              <div className="relative h-3.5">
                {signed && <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-300" />}
                <div
                  className="absolute inset-y-0 rounded"
                  style={{
                    width,
                    background: color,
                    ...(signed ? (r.value < 0 ? { right: '50%' } : { left: '50%' }) : { left: 0 }),
                  }}
                />
              </div>
              <span className="text-right font-medium tabular-nums text-neutral-900">
                {signed && r.value > 0 ? '+' : ''}
                {fmt(r.value, unit)}
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function DonutChart({ title, unit, rows }: { title?: string; unit: string; rows: Row[] }) {
  const positive = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const slices = positive.length > 8 ? [...positive.slice(0, 7), { label: 'Other', value: positive.slice(7).reduce((s, r) => s + r.value, 0) }] : positive;
  const total = slices.reduce((s, r) => s + r.value, 0) || 1;
  const radius = 15.9155; // circumference 100
  let offset = 25;
  return (
    <Frame title={title}>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0" role="img" aria-label={title ?? 'Breakdown'}>
          {slices.map((s, i) => {
            const share = (s.value / total) * 100;
            const gap = slices.length > 1 ? 0.6 : 0;
            const el = (
              <circle
                key={s.label}
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                stroke={SERIES[i]}
                strokeWidth="6"
                strokeDasharray={`${Math.max(share - gap, 0)} ${100 - Math.max(share - gap, 0)}`}
                strokeDashoffset={offset}
              >
                <title>{`${s.label}: ${fmt(s.value, unit)} (${share.toFixed(0)}%)`}</title>
              </circle>
            );
            offset -= share;
            return el;
          })}
        </svg>
        <ul className="min-w-[160px] flex-1 space-y-1 text-[12px]">
          {slices.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden="true" />
              <span className="flex-1 truncate text-neutral-700">{s.label}</span>
              <span className="font-medium tabular-nums text-neutral-900">{fmt(s.value, unit)}</span>
              {unit !== '%' && <span className="w-9 text-right tabular-nums text-neutral-500">{((s.value / total) * 100).toFixed(0)}%</span>}
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

function ScenarioChart({ title, amount, rows }: { title?: string; amount: number | null; rows: ScenarioRow[] }) {
  const values = rows.flatMap((r) => [r.low, r.high]).concat(amount ?? []);
  const lo = Math.min(...values);
  // A long-shot outcome far beyond the rest would squash every other bar; cap the axis and mark it as off-scale.
  const highs = rows.map((r) => r.high).concat(amount ?? []).sort((a, b) => b - a);
  const cap = highs.length > 1 && highs[0] > highs[1] * 2 ? highs[1] * 1.25 : highs[0];
  const pad = (cap - lo) * 0.06 || 1;
  const min = lo - pad;
  const span = cap + pad - min;
  const pos = (v: number) => `${((Math.min(v, cap + pad) - min) / span) * 100}%`;
  return (
    <Frame title={title}>
      <div className="space-y-2">
        {rows.map((r) => {
          const mid = (r.low + r.high) / 2;
          const color = amount === null ? SERIES[0] : mid >= amount ? GAIN : LOSS;
          return (
            <div key={r.label} className="grid grid-cols-[minmax(64px,22%)_1fr_auto] items-center gap-2 text-[12px]" title={`${r.label}: ${fmt(r.low, '$')} to ${fmt(r.high, '$')}, ${r.odds}% odds`}>
              <span className="truncate text-neutral-700">
                {r.label} <span className="text-neutral-500">{r.odds}%</span>
              </span>
              <div className="relative h-4">
                <div className="absolute inset-y-[7px] left-0 right-0 rounded bg-neutral-100" />
                {amount !== null && <div className="absolute inset-y-0 w-px border-l border-dashed border-neutral-500" style={{ left: pos(amount) }} />}
                <div
                  className="absolute inset-y-[3px] rounded"
                  style={{ left: pos(r.low), width: `max(6px, calc(${pos(r.high)} - ${pos(r.low)}))`, background: color, opacity: 0.35 + Math.min(r.odds, 60) / 100 }}
                />
              </div>
              <span className="text-right font-medium tabular-nums text-neutral-900">
                {r.high > cap && <span className="mr-1 text-neutral-500" title="Off the chart's scale">→</span>}
                {r.low === r.high ? fmt(r.low, '$') : `${fmt(r.low, '$')}–${fmt(r.high, '$')}`}
              </span>
            </div>
          );
        })}
      </div>
      {amount !== null && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Dashed line: today ({fmt(amount, '$')}). Darker bars are more likely.
        </p>
      )}
    </Frame>
  );
}

export function ChatChart({ raw }: { raw: string }) {
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return <p className="text-[11px] text-neutral-500">Chart could not be drawn.</p>;
  }
  const title = str(spec.title, 120) || undefined;
  const unit = str(spec.unit, 8);
  const data = Array.isArray(spec.data) ? spec.data.slice(0, MAX_ROWS) : [];

  if (spec.type === 'price' && typeof spec.ticker === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(spec.ticker.toUpperCase())) {
    return (
      <Frame title={title ?? `${spec.ticker.toUpperCase()} price`}>
        <Suspense fallback={<div className="h-48 animate-pulse rounded bg-neutral-100" />}>
          <PriceChart ticker={spec.ticker.toUpperCase()} />
        </Suspense>
      </Frame>
    );
  }
  if (spec.type === 'scenarios') {
    const rows = data
      .map((d) => d as Record<string, unknown>)
      .filter((d) => isNum(d.low) && isNum(d.high) && isNum(d.odds))
      .map((d) => ({ label: str(d.label) || '?', low: Math.min(d.low as number, d.high as number), high: Math.max(d.low as number, d.high as number), odds: d.odds as number }));
    if (rows.length) return <ScenarioChart title={title} amount={isNum(spec.amount) ? spec.amount : null} rows={rows} />;
  }
  const rows = data
    .map((d) => d as Record<string, unknown>)
    .filter((d) => isNum(d.value))
    .map((d) => ({ label: str(d.label) || '?', value: d.value as number }));
  if (rows.length && spec.type === 'bar') return <BarChart title={title} unit={unit} rows={rows} />;
  if (rows.length && spec.type === 'donut') return <DonutChart title={title} unit={unit} rows={rows} />;
  return <p className="text-[11px] text-neutral-500">Chart could not be drawn.</p>;
}
