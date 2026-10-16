import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthLayoutFrame } from '@/components/auth/AuthLayout';
import { AuthUnavailable } from '@/components/auth/auth-ui';
import { Skeleton } from '@/components/ui/skeleton';

function AppSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading your account">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

/**
 * Gate for the signed-in app. While auth resolves it shows a skeleton; with no user it redirects to
 * /login with a `next` back to the requested page; if auth is not configured it shows an error
 * card instead of redirecting forever.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { enabled, loading, user } = useAuth();
  const location = useLocation();

  if (!enabled) {
    return (
      <AuthLayoutFrame>
        <AuthUnavailable />
      </AuthLayoutFrame>
    );
  }
  if (loading) return <AppSkeleton />;
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}
