import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ComplianceNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[12px] leading-relaxed text-neutral-500', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        3x Hunter is an educational research tool and does not provide investment advice. Scores are hypothetical
        model outputs, not recommendations to buy, sell or hold any security. Investing involves risk, including loss
        of principal.{' '}
        <Link to="/legal/disclaimer" className="underline underline-offset-2 hover:text-neutral-800">
          Read the full disclaimer
        </Link>
        .
      </span>
    </p>
  );
}
