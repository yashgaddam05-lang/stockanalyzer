import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import { buildScenarioSet, computeScenario, defaultInputsFromStock, sensitivityTable } from '@/lib/scenario';
import type { ScenarioInputs as EngineInputs, ScenarioResult, SanityFlag, ScenarioWithInputs } from '@/lib/scenario';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScenarioInputs } from '@/components/scenario/ScenarioInputs';
import { SensitivityTable } from '@/components/scenario/SensitivityTable';
import { cn } from '@/lib/utils';

const DISCLAIMER = 'Hypothetical scenario math for education. Not a forecast or investment advice.';

// ---- formatting (never emits NaN / Infinity / undefined) ----
function ok(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number, signed = false): string {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return `${signed && v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtMult(n: number): string {
  return `${n.toFixed(n >= 100 ? 0 : 1)}x`;
}

function fmtTarget(t: number): string {
  return `${Number.isInteger(t) ? t : t.toFixed(1)}x`;
}

// ---- missing-data reasons ----
interface Missing {
  price: boolean;
  revenue: boolean;
  margin: boolean;
}

function missingFrom(i: EngineInputs): Missing {
  return {
    price: !(ok(i.currentPrice) && i.currentPrice > 0 && ok(i.currentMarketCap) && i.currentMarketCap > 0),
    revenue: !(ok(i.currentRevenue) && i.currentRevenue > 0),
    margin: !ok(i.currentNetMarginPct),
  };
}

const REASON = {
  price: 'Current price or market cap is missing for this stock.',
  revenue: 'Revenue is unavailable because price-to-sales is missing. Enter current revenue under advanced inputs.',
  margin: 'Net profit margin is missing for this stock, so earnings cannot be estimated.',
  earnings: 'Projected earnings are zero or negative, so a P/E is not meaningful.',
  generic: 'Not computable with the current inputs.',
};

function reason(m: Missing, needs: (keyof Missing)[], fallback = REASON.generic): string {
  for (const k of needs) if (m[k]) return REASON[k];
  return fallback;
}

function NotAvailable({ why }: { why: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          aria-label={`n/a: ${why}`}
        >
          n/a
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{why}</TooltipContent>
    </Tooltip>
  );
}

function val(n: number | null | undefined, fmt: (v: number) => string, why: string, positiveOnly = false): ReactNode {
  if (!ok(n) || (positiveOnly && n <= 0)) return <NotAvailable why={why} />;
  return fmt(n);
}

// ---- small presentational pieces ----
function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{children}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const CONFIDENCE_STYLE: Record<ScenarioResult['confidence'], string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-red-200 bg-red-50 text-red-800',
};

const CONFIDENCE_HINT: Record<ScenarioResult['confidence'], string> = {
  high: 'All inputs available and no extreme assumptions flagged.',
  medium: 'At least one assumption is flagged as extreme.',
  low: 'Price, revenue or margin data is missing, so parts of the scenario are unavailable.',
};

function ConfidenceBadge({ level }: { level: ScenarioResult['confidence'] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn('cursor-help rounded-md border px-2 py-0.5 text-[11px] font-medium', CONFIDENCE_STYLE[level])}
        >
          {level.charAt(0).toUpperCase() + level.slice(1)} confidence
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{CONFIDENCE_HINT[level]}</TooltipContent>
    </Tooltip>
  );
}

function FlagCallout({ flag }: { flag: SanityFlag }) {
  const style =
    flag.severity === 'high'
      ? { box: 'border-red-200 bg-red-50 text-red-900', Icon: AlertOctagon, icon: 'text-red-600' }
      : flag.severity === 'warn'
        ? { box: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle, icon: 'text-amber-600' }
        : { box: 'border-neutral-200 bg-neutral-50 text-neutral-700', Icon: Info, icon: 'text-neutral-500' };
  const { Icon } = style;
  return (
    <li className={cn('flex gap-2 rounded-lg border px-3 py-2 text-[13px]', style.box)}>
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', style.icon)} aria-hidden="true" />
      <span>
        <span className="sr-only">{flag.severity === 'high' ? 'Extreme: ' : flag.severity === 'warn' ? 'Warning: ' : 'Note: '}</span>
        {flag.message}
      </span>
    </li>
  );
}

function HitsTarget({ result, missing }: { result: ScenarioResult; missing: Missing }) {
  if (!ok(result.projected.priceMultiple)) {
    return <NotAvailable why={reason(missing, ['price', 'revenue'])} />;
  }
  return result.projected.hitsTarget ? (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-700">
      <XCircle className="h-4 w-4" aria-hidden="true" />
      No
    </span>
  );
}

function ScenarioColumns({ set, missing }: { set: { bear: ScenarioWithInputs; base: ScenarioWithInputs; bull: ScenarioWithInputs }; missing: Missing }) {
  const cols: { key: string; title: string; s: ScenarioWithInputs }[] = [
    { key: 'bear', title: 'Bear', s: set.bear },
    { key: 'base', title: 'Base', s: set.base },
    { key: 'bull', title: 'Bull', s: set.bull },
  ];
  const proj = reason(missing, ['price', 'revenue']);
  const rows: { label: string; render: (s: ScenarioWithInputs) => ReactNode }[] = [
    { label: 'Revenue growth', render: (s) => `${fmtPct(s.inputs.revenueGrowthPct, true)}/yr` },
    { label: 'P/S change', render: (s) => fmtPct(s.inputs.multipleChangePct, true) },
    { label: 'Margin change', render: (s) => `${fmtPct(s.inputs.marginChangePts, true).replace('%', '')} pts` },
    { label: 'Projected price', render: (s) => val(s.projected.price, fmtMoney, proj) },
    { label: 'Price multiple', render: (s) => val(s.projected.priceMultiple, (v) => `${v.toFixed(2)}x`, proj) },
    { label: 'Price CAGR', render: (s) => val(s.projected.priceCagrPct, (v) => fmtPct(v, true), proj) },
    { label: 'Hits target', render: (s) => <HitsTarget result={s} missing={missing} /> },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[420px] border-collapse text-[12px] tabular-nums">
        <caption className="sr-only">Bear, base and bull scenarios</caption>
        <thead>
          <tr className="border-b border-border bg-neutral-50">
            <th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">
              <span className="sr-only">Metric</span>
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium text-neutral-700">
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-neutral-600">
                {r.label}
              </th>
              {cols.map((c) => (
                <td key={c.key} className={cn('px-3 py-2 text-right text-neutral-800', c.key === 'base' && 'bg-neutral-50 font-medium')}>
                  {r.render(c.s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

// ---- main ----
function CalculatorBody({ stock }: { stock: StockListItem }) {
  const defaults = useMemo(() => defaultInputsFromStock(stock), [stock]);
  const [inputs, setInputs] = useState<EngineInputs>(defaults);
  const revenueDerived = defaults.currentRevenue !== null;

  const result = useMemo(() => computeScenario(inputs), [inputs]);
  const set = useMemo(() => buildScenarioSet(inputs), [inputs]);
  const table = useMemo(() => sensitivityTable(inputs), [inputs]);
  const missing = missingFrom(inputs);

  const target = Math.min(20, Math.max(1.1, inputs.targetMultiple));
  const years = inputs.horizonMonths / 12;
  const priceWhy = reason(missing, ['price']);
  const revWhy = reason(missing, ['price', 'revenue']);
  const peWhy = reason(missing, ['price', 'revenue', 'margin'], REASON.earnings);

  return (
    <Card className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">3x scenario calculator</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            What {stock.ticker} needs to reach {fmtTarget(target)} in {inputs.horizonMonths} months, and what your
            assumptions imply.
          </p>
        </div>
        <ConfidenceBadge level={result.confidence} />
      </div>

      <ScenarioInputs initial={defaults} defaults={defaults} revenueDerived={revenueDerived} onChange={setInputs} />

      <section aria-label="Required to hit target">
        <SectionTitle>Required to hit {fmtTarget(target)}</SectionTitle>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Market cap">{val(result.requiredMarketCap, fmtMoney, priceWhy, true)}</Stat>
          <Stat label="Price">{val(result.requiredPrice, fmtMoney, priceWhy, true)}</Stat>
          <Stat label="Price CAGR" hint={`over ${years % 1 === 0 ? years : years.toFixed(1)} yrs`}>
            {missing.price ? <NotAvailable why={priceWhy} /> : `${fmtPct(result.requiredPriceCagrPct)}/yr`}
          </Stat>
          <Stat label="Net share change" hint="dilution less buybacks">
            {fmtPct(result.netShareChangePct, true)}
          </Stat>
          <Stat label="Revenue at constant P/S">
            {val(result.requiredRevenueAtConstantMultiple, fmtMoney, revWhy)}
          </Stat>
          <Stat label="Revenue CAGR needed">
            {val(result.requiredRevenueCagrPct, (v) => `${fmtPct(v)}/yr`, revWhy)}
          </Stat>
          <Stat label="Implied future P/S" hint="on your projected revenue">
            {val(result.impliedFuturePriceToSales, fmtMult, revWhy)}
          </Stat>
          <Stat label="Implied future P/E" hint="on your projected earnings">
            {val(result.impliedFuturePE, fmtMult, peWhy)}
          </Stat>
        </dl>
      </section>

      <section aria-label="Projected outcome">
        <SectionTitle>Projected outcome from your inputs</SectionTitle>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Price">{val(result.projected.price, fmtMoney, revWhy)}</Stat>
          <Stat label="Price multiple">{val(result.projected.priceMultiple, (v) => `${v.toFixed(2)}x`, revWhy)}</Stat>
          <Stat label="Price CAGR">{val(result.projected.priceCagrPct, (v) => `${fmtPct(v, true)}/yr`, revWhy)}</Stat>
          <Stat label={`Hits ${fmtTarget(target)}`}>
            <HitsTarget result={result} missing={missing} />
          </Stat>
        </dl>
      </section>

      {result.flags.length > 0 && (
        <section aria-label="Sanity checks">
          <SectionTitle>Sanity checks</SectionTitle>
          <ul className="space-y-2">
            {result.flags.map((f) => (
              <FlagCallout key={f.id} flag={f} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Scenarios">
        <SectionTitle>Bear / base / bull</SectionTitle>
        <ScenarioColumns set={set} missing={missing} />
      </section>

      <section aria-label="Sensitivity">
        <SectionTitle>Sensitivity</SectionTitle>
        <SensitivityTable
          table={table}
          target={target}
          baseGrowthPct={inputs.revenueGrowthPct}
          baseMultipleChangePct={inputs.multipleChangePct}
        />
      </section>

      <section aria-label="Key assumptions">
        <SectionTitle>Key assumptions, most sensitive first</SectionTitle>
        {result.keyAssumptions.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Sensitivity ranking is unavailable: {revWhy.charAt(0).toLowerCase() + revWhy.slice(1)}
          </p>
        ) : (
          <ol className="space-y-1 text-[13px] text-neutral-700">
            {result.keyAssumptions.map((a, idx) => (
              <li key={a.input} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
                <span>
                  <span className="mr-2 tabular-nums text-muted-foreground">{idx + 1}.</span>
                  {a.label}
                </span>
                <span className="tabular-nums text-neutral-900">
                  {ok(a.elasticity) ? `${a.elasticity > 0 ? '+' : ''}${a.elasticity.toFixed(2)}% price per +1%` : 'n/a'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="border-t border-border pt-4 text-[11px] text-muted-foreground">{DISCLAIMER}</p>
    </Card>
  );
}

export function ScenarioCalculator({ stock }: { stock: StockListItem }) {
  return (
    <TooltipProvider delayDuration={150}>
      <CalculatorBody key={stock.id} stock={stock} />
    </TooltipProvider>
  );
}
