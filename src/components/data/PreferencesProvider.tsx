import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getPreferences, savePreferences } from '@/lib/api';
import type { UserPreferences } from '@/lib/supabase';
import type { savePreferences as SaveFn } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';

interface PreferencesContextValue {
  prefs: UserPreferences | null;
  loading: boolean;
  /** True once onboarding has been completed (or skipped). */
  onboarded: boolean;
  update: (patch: Parameters<typeof SaveFn>[0]) => Promise<void>;
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
      // Never block the app on preferences: treat as onboarded, but default to the user's own stocks.
      .catch(() => active && setPrefs({ dashboard_scope: 'mine', sectors: [], onboarded_at: 'unknown', updated_at: null }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback<PreferencesContextValue['update']>(async (patch) => {
    // Optimistic so scope toggles feel instant; reconciled with the server response.
    const { onboarded: _onboarded, ...fields } = patch; // eslint-disable-line @typescript-eslint/no-unused-vars
    setPrefs((prev) => (prev ? { ...prev, ...fields } : prev));
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
