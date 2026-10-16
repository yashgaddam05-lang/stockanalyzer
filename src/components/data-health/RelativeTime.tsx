import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAbsolute, formatRelative } from '@/components/data-health/format';
import { cn } from '@/lib/utils';

interface RelativeTimeProps {
  value: string | null | undefined;
  now: number;
  className?: string;
}

/** Relative time label with the absolute timestamp in a tooltip. Requires a TooltipProvider ancestor. */
export function RelativeTime({ value, now, className }: RelativeTimeProps) {
  const absolute = formatAbsolute(value);
  if (!value) return <span className={cn('text-muted-foreground', className)}>Never</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={value}
          tabIndex={0}
          aria-label={`${formatRelative(value, now)}, ${absolute}`}
          className={cn('cursor-default rounded underline decoration-dotted decoration-neutral-300 underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
        >
          {formatRelative(value, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{absolute}</TooltipContent>
    </Tooltip>
  );
}
