import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDocumentTitle } from '@/components/auth/AuthLayout';
import { safeNext } from '@/components/auth/safe-next';
import { initialLinkError } from '@/components/auth/auth-redirect';
import {
  AuthChecking,
  AuthHeading,
  AuthUnavailable,
  FormError,
  FormNotice,
  errorMessage,
  isValidEmail,
} from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// Kept for backwards compatibility: safeNext now lives in components/auth/safe-next.
// eslint-disable-next-line react-refresh/only-export-components
export { safeNext };

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { enabled, loading, user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawNext = params.get('next');
  const next = safeNext(rawNext);
  const confirmed = params.get('confirmed') === '1';
  const reset = params.get('reset') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => initialLinkError('/login'));
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (!enabled) return <AuthUnavailable />;
  if (loading) return <AuthChecking />;
  // Already signed in (including right after an email-confirmation link signs the user in).
  if (user) return <Navigate to={next} replace />;

  const nextQuery = rawNext ? `?next=${encodeURIComponent(next)}` : '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    if (errs.email || errs.password) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <>
      <AuthHeading title="Sign in" subtitle="Welcome back. Sign in to open your dashboard." />
      <Card className="space-y-4 p-6">
        {confirmed && <FormNotice>Your email is confirmed. Sign in to continue.</FormNotice>}
        {reset && <FormNotice>Your password was updated. Sign in with your new password.</FormNotice>}

        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate aria-busy={submitting}>
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium text-neutral-900">
              Email
            </label>
            <Input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="text-xs text-red-700">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium text-neutral-900">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-neutral-900 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="login-password-error" className="text-xs text-red-700">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {error && <FormError>{error}</FormError>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to 3x Hunter?{' '}
        <Link to={`/signup${nextQuery}`} className="font-medium text-neutral-900 underline underline-offset-2">
          Sign up free
        </Link>
      </p>
    </>
  );
}
