import type { DashboardScope } from '@/lib/supabase';
import { SCOPE_OPTIONS } from '@/components/dashboard/scope';
import { cn } from '@/lib/utils';

export interface ScopeToggleProps {
  value: DashboardScope;
  onChange: (scope: DashboardScope) => void;
  /** Optional stock counts shown next to each label. */
  counts?: Partial<Record<DashboardScope, number>>;
  className?: string;
}

/** Segmented control: My stocks | S&P 500 | All tracked. */
export function ScopeToggle({ value, onChange, counts, className }: ScopeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Stock universe"
      className={cn('inline-flex w-full rounded-lg border border-border bg-neutral-50 p-0.5 sm:w-auto', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = SCOPE_OPTIONS.findIndex((o) => o.value === value);
        const next = SCOPE_OPTIONS[(i + (e.key === 'ArrowRight' ? 1 : SCOPE_OPTIONS.length - 1)) % SCOPE_OPTIONS.length];
        onChange(next.value);
        const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-scope="${next.value}"]`);
        btn?.focus();
      }}
    >
      {SCOPE_OPTIONS.map((o) => {
        const active = o.value === value;
        const count = counts?.[o.value];
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-scope={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 sm:flex-none',
              active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
            )}
          >
            {o.label}
            {typeof count === 'number' && (
              <span className={cn('text-[11px] tabular-nums', active ? 'text-neutral-500' : 'text-neutral-400')}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
