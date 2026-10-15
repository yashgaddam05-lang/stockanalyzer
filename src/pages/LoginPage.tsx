import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Info, Loader2, LogOut, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Mode = 'signin' | 'signup';

const DEFAULT_NEXT = '/watchlists';
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only same-origin relative paths are allowed: must start with a single '/' (no '//' or '/\'). */
// eslint-disable-next-line react-refresh/only-export-components
export function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) < 0x20) return DEFAULT_NEXT;
  }
  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.origin !== window.location.origin) return DEFAULT_NEXT;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

export default function LoginPage() {
  const { enabled, loading, user, signIn, signUp, signOut, sendPasswordReset } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Sign in · 3x Hunter';
    return () => {
      document.title = previous;
    };
  }, []);

  const switchMode = (value: string) => {
    setMode(value === 'signup' ? 'signup' : 'signin');
    setError(null);
    setNotice(null);
    setConfirmSent(false);
  };

  const validate = (needPassword: boolean): string | null => {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (needPassword && password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const invalid = validate(true);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        navigate(next, { replace: true });
      } else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setConfirmSent(true);
          setPassword('');
        } else {
          navigate(next, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setNotice(null);
    const invalid = validate(false);
    if (invalid) {
      setError('Enter your email above, then choose Forgot password.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setNotice('If an account exists for that email, a password reset link is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  const header = (
    <div className="space-y-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
        {user ? 'Your account' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </h1>
      <p className="text-sm text-muted-foreground">
        Keep private watchlists, notes and tags synced across all your devices.
      </p>
    </div>
  );

  let body: JSX.Element;

  if (!enabled) {
    body = (
      <Card className="flex items-start gap-3 p-6 text-sm text-neutral-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <div className="space-y-2">
          <p className="font-medium text-neutral-900">Sign-in is unavailable</p>
          <p>Accounts are not enabled on this deployment. You can still use shared watchlists.</p>
          <Link to="/watchlists" className="inline-block underline underline-offset-2">
            Go to watchlists
          </Link>
        </div>
      </Card>
    );
  } else if (loading) {
    body = (
      <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your session
      </Card>
    );
  } else if (user) {
    body = (
      <Card className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium text-neutral-900">{user.email ?? 'your account'}</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to={next}>Continue</Link>
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => void handleSignOut()} disabled={signingOut}>
            {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            Sign out
          </Button>
        </div>
      </Card>
    );
  } else if (confirmSent) {
    body = (
      <Card className="space-y-4 p-6 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-900">Check your email to confirm your account</p>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-neutral-900">{email.trim()}</span>. Open it,
            then sign in here.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => switchMode('signin')}>
          Back to sign in
        </Button>
      </Card>
    );
  } else {
    body = (
      <Card className="space-y-6 p-6">
        <Tabs value={mode} onValueChange={switchMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
        </Tabs>

        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium text-neutral-900">
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium text-neutral-900">
                Password
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={submitting}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-neutral-900 hover:underline disabled:opacity-50"
                >
                  Forgot password
                </button>
              )}
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
            {mode === 'signup' && <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-emerald-700">
              {notice}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signin'
              ? submitting
                ? 'Signing in'
                : 'Sign in'
              : submitting
                ? 'Creating account'
                : 'Create account'}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-8">
      {header}
      {body}
    </div>
  );
}
