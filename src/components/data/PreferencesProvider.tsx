import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getPreferences, savePreferences } from '@/lib/api';
import type { DashboardScope, UserPreferences } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';

interface PreferencesContextValue {
  prefs: UserPreferences | null;
  loading: boolean;
  /** True once onboarding has been completed (or skipped). */
  onboarded: boolean;
  update: (patch: { dashboard_scope?: DashboardScope; sectors?: string[]; onboarded?: boolean }) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Loads the signed-in user's dashboard preferences once per session; scoped inside /app. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getPreferences()
      .then((p) => active && setPrefs(p))
      // Never block the app on preferences: fall back to defaults and treat as onboarded.
      .catch(() => active && setPrefs({ dashboard_scope: 'sp500', sectors: [], onboarded_at: 'unknown', updated_at: null }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback<PreferencesContextValue['update']>(async (patch) => {
    // Optimistic so scope toggles feel instant; reconciled with the server response.
    setPrefs((prev) => (prev ? { ...prev, ...('dashboard_scope' in patch ? { dashboard_scope: patch.dashboard_scope! } : {}), ...(patch.sectors ? { sectors: patch.sectors } : {}) } : prev));
    const saved = await savePreferences(patch);
    setPrefs(saved);
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, loading, onboarded: Boolean(prefs?.onboarded_at), update }),
    [prefs, loading, update]
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return ctx;
}
