import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Info, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// eslint-disable-next-line react-refresh/only-export-components
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// eslint-disable-next-line react-refresh/only-export-components
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6 space-y-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function FieldHint({ id, error, children }: { id: string; error?: boolean; children: ReactNode }) {
  return (
    <p id={id} className={error ? 'text-xs text-red-700' : 'text-xs text-muted-foreground'}>
      {children}
    </p>
  );
}

/**
 * Sign-in pages wait on the session check at most this long, then show the form anyway;
 * if a session resolves afterwards the page still redirects.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthWaitExpired(loading: boolean, ms = 1200): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setExpired(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return expired;
}

export function AuthChecking() {
  return (
    <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Checking your session
    </Card>
  );
}

export function AuthUnavailable() {
  return (
    <Card className="flex items-start gap-3 p-6 text-sm text-neutral-700" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="space-y-2">
        <p className="font-medium text-neutral-900">Accounts are unavailable</p>
        <p>Sign-in is not configured on this deployment. Please try again later.</p>
        <Link to="/" className="inline-block font-medium text-neutral-900 underline underline-offset-2">
          Back to home
        </Link>
      </div>
    </Card>
  );
}
