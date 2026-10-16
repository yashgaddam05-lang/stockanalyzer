import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SIMULATED_LABEL =
  'Simulated portfolio: hypothetical positions for research. No real trades, no brokerage connection. Not investment advice.';

export function PortfolioDisclaimer({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900',
        compact ? 'px-3 py-2 text-[12px]' : 'px-4 py-3 text-sm',
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-medium">{SIMULATED_LABEL}</p>
        <p className="text-amber-800">
          Prices are the last refreshed prices from the stock universe, not real-time quotes.
        </p>
      </div>
    </div>
  );
}
