import type { RegimeLabel } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { REGIME_LABEL_CLASS, REGIME_LABEL_TEXT } from '@/components/regime/regime-format';

export function RegimeBadge({ label, className }: { label: RegimeLabel; className?: string }) {
  const known = label in REGIME_LABEL_TEXT ? label : 'insufficient_data';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium',
        REGIME_LABEL_CLASS[known],
        className
      )}
    >
      {REGIME_LABEL_TEXT[known]}
    </span>
  );
}
