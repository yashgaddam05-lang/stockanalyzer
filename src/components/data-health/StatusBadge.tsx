import { cn } from '@/lib/utils';
import { TONE_STYLES, type Tone } from '@/components/data-health/format';

interface StatusBadgeProps {
  tone: Tone;
  label: string;
  className?: string;
}

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium',
        TONE_STYLES[tone].badge,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', TONE_STYLES[tone].dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
