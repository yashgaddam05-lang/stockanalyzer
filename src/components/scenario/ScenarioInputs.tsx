import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { TARGET_MAX, TARGET_MIN } from '@/lib/scenario';
import type { ScenarioInputs as EngineInputs } from '@/lib/scenario';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const TARGET_PRESETS = [2, 3, 5] as const;
const HORIZON_PRESETS = [12, 24, 36, 60] as const;
const DEBOUNCE_MS = 250;

type NumField =
  | 'customTarget'
  | 'revenueGrowthPct'
  | 'marginChangePts'
  | 'multipleChangePct'
  | 'dilutionPctPerYear'
  | 'buybackPctPerYear'
  | 'revenueMillions';

type Drafts = Record<NumField, string>;
type Errors = Partial<Record<NumField, string>>;

interface FieldRule {
  min: number;
  max: number;
  optional?: boolean;
  /** strictly greater than min */
  exclusiveMin?: boolean;
}

const RULES: Record<NumField, FieldRule> = {
  customTarget: { min: TARGET_MIN, max: TARGET_MAX },
  revenueGrowthPct: { min: -95, max: 500 },
  marginChangePts: { min: -100, max: 100 },
  multipleChangePct: { min: -95, max: 1000 },
  dilutionPctPerYear: { min: 0, max: 100 },
  buybackPctPerYear: { min: 0, max: 50 },
  revenueMillions: { min: 0, max: 10_000_000, optional: true, exclusiveMin: true },
};

function trimNum(n: number, digits = 2): string {
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

function draftsFrom(v: EngineInputs): Drafts {
  const isPreset = (TARGET_PRESETS as readonly number[]).includes(v.targetMultiple);
  return {
    customTarget: isPreset ? '' : trimNum(v.targetMultiple),
    revenueGrowthPct: trimNum(v.revenueGrowthPct, 1),
    marginChangePts: trimNum(v.marginChangePts, 1),
    multipleChangePct: trimNum(v.multipleChangePct, 1),
    dilutionPctPerYear: trimNum(v.dilutionPctPerYear, 1),
    buybackPctPerYear: trimNum(v.buybackPctPerYear, 1),
    revenueMillions:
      v.currentRevenue !== null && Number.isFinite(v.currentRevenue) ? trimNum(v.currentRevenue / 1e6, 1) : '',
  };
}

function parseField(field: NumField, raw: string): { value: number | null; error?: string } {
  const rule = RULES[field];
  const s = raw.trim();
  if (s === '') {
    return rule.optional ? { value: null } : { value: null, error: 'Required' };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: 'Enter a number' };
  if (rule.exclusiveMin ? n <= rule.min : n < rule.min) {
    return { value: null, error: rule.exclusiveMin ? `Must be above ${rule.min}` : `Min ${rule.min}` };
  }
  if (n > rule.max) return { value: null, error: `Max ${rule.max}` };
  return { value: n };
}

interface Selection {
  target: number | 'custom';
  horizon: number;
}

function build(base: EngineInputs, d: Drafts, sel: Selection): { inputs: EngineInputs | null; errors: Errors } {
  const errors: Errors = {};
  const get = (f: NumField): number | null => {
    const r = parseField(f, d[f]);
    if (r.error) errors[f] = r.error;
    return r.value;
  };
  const customTarget = sel.target === 'custom' ? get('customTarget') : null;
  const growth = get('revenueGrowthPct');
  const margin = get('marginChangePts');
  const multiple = get('multipleChangePct');
  const dil = get('dilutionPctPerYear');
  const buy = get('buybackPctPerYear');
  const revM = get('revenueMillions');
  if (Object.keys(errors).length > 0) return { inputs: null, errors };
  return {
    inputs: {
      ...base,
      targetMultiple: sel.target === 'custom' ? (customTarget as number) : sel.target,
      horizonMonths: sel.horizon,
      revenueGrowthPct: growth as number,
      marginChangePts: margin as number,
      multipleChangePct: multiple as number,
      dilutionPctPerYear: dil as number,
      buybackPctPerYear: buy as number,
      // Keep the exact derived value while the user has not edited the (rounded) draft.
      currentRevenue:
        revM === null ? null : d.revenueMillions === draftsFrom(base).revenueMillions ? base.currentRevenue : revM * 1e6,
    },
    errors,
  };
}

export interface ScenarioInputsProps {
  /** Initial values (component keeps its own draft state afterwards). */
  initial: EngineInputs;
  /** Values restored by the reset button. */
  defaults: EngineInputs;
  /** True when the default revenue came from market cap / P/S. */
  revenueDerived: boolean;
  /** Called with validated inputs only (debounced for typed fields). */
  onChange: (inputs: EngineInputs) => void;
}

export function ScenarioInputs({ initial, defaults, revenueDerived, onChange }: ScenarioInputsProps) {
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(initial));
  const [sel, setSel] = useState<Selection>(() => ({
    target: (TARGET_PRESETS as readonly number[]).includes(initial.targetMultiple) ? initial.targetMultiple : 'custom',
    horizon: initial.horizonMonths,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const advancedId = useId();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const apply = (nextDrafts: Drafts, nextSel: Selection, immediate: boolean) => {
    setDrafts(nextDrafts);
    setSel(nextSel);
    const { inputs, errors: errs } = build(initial, nextDrafts, nextSel);
    setErrors(errs);
    if (timer.current) clearTimeout(timer.current);
    if (!inputs) return;
    if (immediate) {
      onChangeRef.current(inputs);
    } else {
      timer.current = setTimeout(() => onChangeRef.current(inputs), DEBOUNCE_MS);
    }
  };

  const setField = (f: NumField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    apply({ ...drafts, [f]: e.target.value }, sel, false);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    const d = draftsFrom(defaults);
    const s: Selection = {
      target: (TARGET_PRESETS as readonly number[]).includes(defaults.targetMultiple) ? defaults.targetMultiple : 'custom',
      horizon: defaults.horizonMonths,
    };
    setDrafts(d);
    setSel(s);
    setErrors({});
    onChangeRef.current(defaults);
  };

  const revenueUnchanged = drafts.revenueMillions === draftsFrom(defaults).revenueMillions;
  const showDerived = revenueDerived && revenueUnchanged && drafts.revenueMillions !== '';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-medium text-neutral-700">Target multiple</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Target multiple"
              options={[
                ...TARGET_PRESETS.map((t) => ({ value: t as number | 'custom', label: `${t}x` })),
                { value: 'custom', label: 'Custom' },
              ]}
              value={sel.target}
              onSelect={(v) => apply(drafts, { ...sel, target: v }, true)}
            />
            {sel.target === 'custom' && (
              <NumberField
                id="scenario-custom-target"
                label="Custom target multiple"
                srOnlyLabel
                suffix="x"
                value={drafts.customTarget}
                onChange={setField('customTarget')}
                error={errors.customTarget}
                step="0.1"
                className="w-28"
              />
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-medium text-neutral-700">Horizon</legend>
          <Segmented
            label="Horizon in months"
            options={HORIZON_PRESETS.map((h) => ({ value: h, label: `${h}m` }))}
            value={sel.horizon}
            onSelect={(v) => apply(drafts, { ...sel, horizon: v }, true)}
          />
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="scenario-growth"
          label="Revenue growth"
          suffix="%/yr"
          value={drafts.revenueGrowthPct}
          onChange={setField('revenueGrowthPct')}
          error={errors.revenueGrowthPct}
          step="1"
        />
        <div className="hidden md:block" aria-hidden="true" />
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 md:hidden"
        aria-expanded={advancedOpen}
        aria-controls={advancedId}
        onClick={() => setAdvancedOpen((o) => !o)}
      >
        Advanced inputs
        <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} aria-hidden="true" />
      </button>

      <div id={advancedId} className={cn('gap-4 sm:grid-cols-2', advancedOpen ? 'grid' : 'hidden md:grid')}>
        <NumberField
          id="scenario-margin"
          label="Net margin change"
          suffix="pts"
          value={drafts.marginChangePts}
          onChange={setField('marginChangePts')}
          error={errors.marginChangePts}
          step="0.5"
        />
        <NumberField
          id="scenario-multiple"
          label="P/S multiple change"
          suffix="%"
          value={drafts.multipleChangePct}
          onChange={setField('multipleChangePct')}
          error={errors.multipleChangePct}
          step="5"
        />
        <NumberField
          id="scenario-dilution"
          label="Dilution"
          suffix="%/yr"
          value={drafts.dilutionPctPerYear}
          onChange={setField('dilutionPctPerYear')}
          error={errors.dilutionPctPerYear}
          step="0.5"
        />
        <NumberField
          id="scenario-buybacks"
          label="Buybacks"
          suffix="%/yr"
          value={drafts.buybackPctPerYear}
          onChange={setField('buybackPctPerYear')}
          error={errors.buybackPctPerYear}
          step="0.5"
        />
        <NumberField
          id="scenario-revenue"
          label="Current revenue (TTM)"
          prefix="$"
          suffix="M"
          note={showDerived ? 'derived from P/S' : drafts.revenueMillions === '' ? 'not available, enter to enable' : undefined}
          placeholder="e.g. 250"
          value={drafts.revenueMillions}
          onChange={setField('revenueMillions')}
          error={errors.revenueMillions}
          step="1"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}

function Segmented<T extends string | number>({ label, options, value, onSelect }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-neutral-50 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(o.value)}
            className={cn(
              'rounded px-3 py-1 text-[12px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
              active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  srOnlyLabel?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  prefix?: string;
  suffix?: string;
  note?: string;
  placeholder?: string;
  step?: string;
  className?: string;
}

function NumberField({
  id,
  label,
  srOnlyLabel,
  value,
  onChange,
  error,
  prefix,
  suffix,
  note,
  placeholder,
  step,
  className,
}: NumberFieldProps) {
  const errId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('mb-1.5 flex items-baseline gap-2 text-[12px] font-medium text-neutral-700', srOnlyLabel && 'sr-only')}>
        {label}
        {note && <span className="text-[11px] font-normal text-muted-foreground">{note}</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={cn(
            'h-9 tabular-nums',
            prefix && 'pl-7',
            suffix && 'pr-12',
            error && 'border-red-400 focus-visible:ring-red-300',
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errId} className="mt-1 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
