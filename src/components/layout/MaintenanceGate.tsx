import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { getSiteStatus } from '@/lib/api';
import { usePlan } from '@/components/billing/usePlan';

/** Staging and local builds never show the maintenance page, so changes can be tested while production is down. */
function isNonProductionHost(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('127.') || h.startsWith('staging.') || h.includes('-git-staging-') || h.endsWith('.localhost');
}

/** Shows "We'll be back soon" on production while maintenance is on. Admins and the sign-in page pass through. */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { plan } = usePlan();
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isNonProductionHost()) return;
    let active = true;
    const check = () => getSiteStatus().then((s) => active && setMaintenance(s.maintenance)).catch(() => undefined);
    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const bypass = plan?.isAdmin === true || pathname === '/login';
  if (!maintenance?.enabled || bypass) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-white">
          <Wrench className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">We&apos;ll be back soon</h1>
        <p className="text-sm leading-relaxed text-neutral-600">{maintenance.message}</p>
        <p className="text-[12px] text-neutral-400">Your watchlists, portfolios and settings are safe. Questions? customercare@3xhunter.com</p>
      </div>
    </main>
  );
}
