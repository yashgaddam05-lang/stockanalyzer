import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Info, Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDocumentTitle } from '@/components/auth/AuthLayout';
import { QuickSignIn } from '@/components/auth/QuickSignIn';
import { safeNext } from '@/components/auth/safe-next';
import {
  AuthChecking,
  useAuthWaitExpired,
  AuthHeading,
  AuthUnavailable,
  FieldHint,
  FormError,
  MIN_PASSWORD,
  errorMessage,
  isValidEmail,
} from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
}

export default function SignupPage() {
  useDocumentTitle('Sign up');
  const { enabled, loading, user, signUp } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawNext = params.get('next');
  const next = safeNext(rawNext);
  const proPlan = params.get('plan') === 'pro';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const waitExpired = useAuthWaitExpired(loading);

  if (!enabled) return <AuthUnavailable />;
  if (loading && !waitExpired) return <AuthChecking />;
  if (user) return <Navigate to={next} replace />;

  const nextQuery = rawNext ? `?next=${encodeURIComponent(next)}` : '';

  if (sentTo) {
    return (
      <>
        <AuthHeading title="Check your email" />
        <Card className="space-y-4 p-6 text-center" role="status">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-neutral-700">
            We sent a confirmation link to <span className="font-medium text-neutral-900">{sentTo}</span>. Open it to
            activate your account, then sign in.
          </p>
          <p className="text-xs text-muted-foreground">Did not get it? Check your spam folder, or wait a minute and try again.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/login${nextQuery}`}>Back to sign in</Link>
          </Button>
        </Card>
      </>
    );
  }

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!isValidEmail(email)) errs.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD) errs.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (!confirm) errs.confirm = 'Confirm your password.';
    else if (confirm !== password) errs.confirm = 'Passwords do not match.';
    if (!accepted) errs.terms = 'You must accept the Terms and Disclaimer to continue.';
    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const { needsConfirmation } = await signUp(email, password, {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      });
      if (needsConfirmation) {
        setSentTo(email.trim());
        setPassword('');
        setConfirm('');
        setSubmitting(false);
      } else {
        navigate(next, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const passwordHintId = 'signup-password-hint';

  return (
    <>
      <AuthHeading title="Create your account" subtitle="Free to start. Scores, screens and watchlists in one place." />
      <Card className="space-y-4 p-6">
        {proPlan && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Create your free account first. You can upgrade to Pro ($19/month or $149/year) right after.</span>
          </div>
        )}

        {usePassword ? (
          <>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate aria-busy={submitting}>
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium text-neutral-900">
                Email
              </label>
              <Input
                id="signup-email"
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
                aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
              />
              {fieldErrors.email && (
                <FieldHint id="signup-email-error" error>
                  {fieldErrors.email}
                </FieldHint>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-sm font-medium text-neutral-900">
                Password
              </label>
              <Input
                id="signup-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={passwordHintId}
              />
              <FieldHint id={passwordHintId} error={Boolean(fieldErrors.password)}>
                {fieldErrors.password ?? `At least ${MIN_PASSWORD} characters.`}
              </FieldHint>
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-confirm" className="text-sm font-medium text-neutral-900">
                Confirm password
              </label>
              <Input
                id="signup-confirm"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
                required
                aria-invalid={Boolean(fieldErrors.confirm)}
                aria-describedby={fieldErrors.confirm ? 'signup-confirm-error' : undefined}
              />
              {fieldErrors.confirm && (
                <FieldHint id="signup-confirm-error" error>
                  {fieldErrors.confirm}
                </FieldHint>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <input
                  id="signup-terms"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-neutral-900"
                  aria-invalid={Boolean(fieldErrors.terms)}
                  aria-describedby={fieldErrors.terms ? 'signup-terms-error' : undefined}
                />
                <label htmlFor="signup-terms" className="text-sm text-neutral-700">
                  I agree to the{' '}
                  <Link to="/legal/terms" target="_blank" rel="noopener" className="font-medium text-neutral-900 underline underline-offset-2">
                    Terms of Service
                  </Link>{' '}
                  and understand the{' '}
                  <Link
                    to="/legal/disclaimer"
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-neutral-900 underline underline-offset-2"
                  >
                    Disclaimer
                  </Link>
                  : 3x Hunter is an educational research tool, not investment advice.
                </label>
              </div>
              {fieldErrors.terms && (
                <FieldHint id="signup-terms-error" error>
                  {fieldErrors.terms}
                </FieldHint>
              )}
            </div>

            {error && <FormError>{error}</FormError>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Signing up' : 'Sign up'}
            </Button>
          </form>
          </>
        ) : (
          <QuickSignIn next={next} />
        )}
        <button
          type="button"
          className="block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-neutral-900 hover:underline"
          onClick={() => setUsePassword((v) => !v)}
        >
          {usePassword ? 'Use an email code instead' : 'Sign up with a password instead'}
        </button>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={`/login${nextQuery}`} className="font-medium text-neutral-900 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
