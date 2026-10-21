import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePreferences } from '@/components/data/PreferencesProvider';

const ONBOARDING_PATH = '/app/welcome';

/** How long to hold the page while preferences load before rendering it anyway. */
const MAX_HOLD_MS = 2500;

/**
 * Sends signed-in users who have not finished (or skipped) onboarding to /app/welcome.
 * Never redirects while preferences are loading; if they fail to load, the provider falls back to
 * "onboarded" so the app stays usable.
 */
export function OnboardingGate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { prefs, loading, onboarded } = usePreferences();
  const { pathname } = useLocation();
  const onWelcome = pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
  const [holdExpired, setHoldExpired] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setHoldExpired(true), MAX_HOLD_MS);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    // Avoid flashing the dashboard for a brand-new user, but never block the app on a slow request.
    if (!onWelcome && !holdExpired && fallback !== undefined) return <>{fallback}</>;
    return <>{children}</>;
  }
  if (prefs && !onboarded && !onWelcome) return <Navigate to={ONBOARDING_PATH} replace />;
  return <>{children}</>;
}
