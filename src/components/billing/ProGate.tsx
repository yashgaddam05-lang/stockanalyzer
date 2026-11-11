import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { usePlan } from '@/components/billing/usePlan';
import { Button } from '@/components/ui/button';

/** Shows children to Pro members; others see a blurred preview with an upgrade prompt. */
export function ProGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { isPro, loading } = usePlan();
  if (isPro) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px]" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-sm rounded-xl border border-border bg-background/95 p-5 text-center shadow-lg">
          <Lock className="mx-auto mb-2 h-5 w-5 text-neutral-700" aria-hidden="true" />
          <p className="text-[14px] font-semibold text-neutral-900">{feature} is part of 3x Hunter Pro</p>
          <p className="mt-1 text-[12px] text-neutral-600">$19/month or $149/year. Cancel anytime.</p>
          <Button asChild size="sm" className="mt-3" disabled={loading}>
            <Link to="/app/billing">See Pro</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
