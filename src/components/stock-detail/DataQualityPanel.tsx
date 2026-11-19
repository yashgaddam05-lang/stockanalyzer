import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, ChevronDown, CircleCheck, CircleX, Database, ShieldAlert } from 'lucide-react';
import type { StockDataQuality, TrustGrade, CheckStatus } from '@/lib/data-provenance';
import { DATA_SOURCES, SOURCE_BY_ID } from '@/lib/data-provenance';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const GRADE_STYLE: Record<TrustGrade, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  good: 'border-sky-200 bg-sky-50 text-sky-800',
  check: 'border-amber-200 bg-amber-50 text-amber-900',
  unreliable: 'border-red-200 bg-red-50 text-red-800',
};

const GRADE_ICON: Record<TrustGrade, typeof BadgeCheck> = {
  verified: BadgeCheck,
  good: BadgeCheck,
  check: AlertTriangle,
  unreliable: ShieldAlert,
};

const STATUS_ICON: Record<CheckStatus, { Icon: typeof CircleCheck; cls: string; label: string }> = {
  pass: { Icon: CircleCheck, cls: 'text-emerald-600', label: 'Passed' },
  warn: { Icon: AlertTriangle, cls: 'text-amber-600', label: 'Warning' },
  fail: { Icon: CircleX, cls: 'text-red-600', label: 'Failed' },
};

/** Small header badge: "Data: Verified · 7/8 checks". Clicking scrolls to the panel. */
export function DataTrustBadge({ quality }: { quality: StockDataQuality }) {
  const Icon = GRADE_ICON[quality.grade];
  return (
    <a
      href="#data-quality"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('data-quality')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:opacity-80', GRADE_STYLE[quality.grade])}
      title={quality.summary}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      Data: {quality.gradeLabel} · {quality.passed}/{quality.checks.length} checks
    </a>
  );
}

/** Where this stock's data comes from and every check it passed or failed. */
export function DataQualityPanel({ quality }: { quality: StockDataQuality }) {
  const [showSources, setShowSources] = useState(false);
  const Icon = GRADE_ICON[quality.grade];
  const used = DATA_SOURCES.filter((s) => s.id !== 'community');

  return (
    <Card id="data-quality" className="scroll-mt-24 space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Database className="h-4 w-4" aria-hidden="true" />
            Where this data comes from, and can you trust it?
          </h2>
          <p className="text-[13px] text-neutral-600">
            Every figure on this page is fetched by our server from the sources below, then run through {quality.checks.length} automatic checks.
            Problems are shown here instead of being hidden in the score.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold', GRADE_STYLE[quality.grade])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {quality.gradeLabel}
        </span>
      </div>

      <p className={cn('rounded-lg border px-3 py-2 text-[13px]', GRADE_STYLE[quality.grade])}>{quality.summary}</p>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {quality.checks.map((c) => {
          const s = STATUS_ICON[c.status];
          return (
            <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
              <s.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.cls)} aria-label={s.label} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-neutral-900">{c.label}</p>
                <p className="text-[12px] text-neutral-600">{c.detail}</p>
              </div>
              <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-neutral-500 sm:inline">
                {SOURCE_BY_ID[c.source].name}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setShowSources((v) => !v)}
        className="flex items-center gap-1 text-[13px] font-medium text-neutral-900 underline-offset-4 hover:underline"
        aria-expanded={showSources}
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', showSources && 'rotate-180')} aria-hidden="true" />
        {showSources ? 'Hide' : 'Show'} the sources behind each number
      </button>

      {showSources && (
        <div className="grid gap-3 md:grid-cols-2">
          {used.map((s) => (
            <div key={s.id} className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-neutral-900">{s.name}</p>
                <span
                  className={cn(
                    'rounded border px-1.5 text-[10px] font-medium',
                    s.official ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                  )}
                >
                  {s.official ? 'Official source' : s.id === 'computed' ? 'Our calculation' : 'Market data vendor'}
                </span>
              </div>
              <p className="text-[12px] text-neutral-600">{s.publisher}</p>
              <p className="text-[12px] text-neutral-700">
                <span className="font-medium">Provides:</span> {s.fields.join(', ')}
              </p>
              <p className="text-[12px] text-neutral-700">
                <span className="font-medium">Updated:</span> {s.cadence}
              </p>
              <p className="text-[12px] text-neutral-700">
                <span className="font-medium">Why trust it:</span> {s.trust}
              </p>
              <p className="text-[12px] text-amber-800">
                <span className="font-medium">Limit:</span> {s.limit}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-neutral-500">
        Checks and thresholds are published in the{' '}
        <Link to="/methodology#sources" className="underline underline-offset-2">
          Methodology
        </Link>
        . Whole-pipeline health is on{' '}
        <Link to="/app/data-health" className="underline underline-offset-2">
          Data health
        </Link>
        .
      </p>
    </Card>
  );
}
