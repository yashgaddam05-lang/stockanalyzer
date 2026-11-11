import { useCallback, useEffect, useState } from 'react';
import { getBilling } from '@/lib/api';
import type { BillingState } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';

// One shared fetch per page load; invalidated after checkout or portal changes.
let cache: { userId: string; promise: Promise<BillingState> } | null = null;

export function invalidatePlan(): void {
  cache = null;
}

/** The signed-in user's plan. `isPro` is false while loading so paid features never flash open. */
export function usePlan() {
  const { user } = useAuth();
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }
    if (!cache || cache.userId !== user.id) cache = { userId: user.id, promise: getBilling() };
    const p = cache.promise;
    setLoading(true);
    p.then((s) => setState(s))
      .catch(() => {
        cache = null;
        setState(null);
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { plan: state, loading, isPro: state?.plan === 'pro', reload: () => { invalidatePlan(); load(); } };
}
