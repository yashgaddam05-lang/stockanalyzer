import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { FormError, errorMessage, isValidEmail } from '@/components/auth/auth-ui';
import { fetchAuthProviders } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESEND_SECONDS = 60;

/** Official multi-color Google "G" mark, required by Google's sign-in branding rules. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28v-3.1H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

/**
 * Fastest paths in: "Continue with Google" (shown once Google is enabled in Supabase) and a
 * passwordless 6-digit email code. The same flow signs in existing users and creates new ones.
 */
export function QuickSignIn({ next }: { next: string }) {
  const { sendEmailCode, verifyEmailCode, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchAuthProviders().then((p) => active && setGoogleEnabled(p.google));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      // Return to /login, which forwards a signed-in user on to `next`.
      await signInWithGoogle(`${window.location.origin}/login?next=${encodeURIComponent(next)}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy('send');
    try {
      await sendEmailCode(email);
      setStep('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6,8}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy('verify');
    try {
      await verifyEmailCode(email, code);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  if (step === 'code') {
    return (
      <form className="space-y-4" onSubmit={(e) => void verify(e)} noValidate aria-busy={busy !== null}>
        <div className="flex items-start gap-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p>
            We sent a code to <span className="font-medium text-neutral-900">{email}</span>. It may take a minute; check spam
            if you don't see it.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="otp-code" className="text-sm font-medium text-neutral-900">
            Sign-in code
          </label>
          <Input
            id="otp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            autoFocus
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            disabled={busy !== null}
          />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" className="w-full" disabled={busy !== null || code.length < 6}>
          {busy === 'verify' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy === 'verify' ? 'Verifying' : 'Verify and continue'}
        </Button>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-neutral-900"
            onClick={() => {
              setStep('email');
              setError(null);
            }}
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Use a different email
          </button>
          <button
            type="button"
            className="hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={cooldown > 0 || busy !== null}
            onClick={() => void send()}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <Button type="button" variant="outline" className="w-full" disabled={busy !== null} onClick={() => void google()}>
            {busy === 'google' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <span className="mr-2">
                <GoogleMark />
              </span>
            )}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form className="space-y-3" onSubmit={(e) => void send(e)} noValidate aria-busy={busy !== null}>
        <div className="space-y-2">
          <label htmlFor="otp-email" className="text-sm font-medium text-neutral-900">
            Email
          </label>
          <Input
            id="otp-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy !== null}
          />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" className="w-full" disabled={busy !== null}>
          {busy === 'send' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy === 'send' ? 'Sending code' : 'Email me a code'}
        </Button>
      </form>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        No password needed. New here? This creates your free account. By continuing you agree to the{' '}
        <Link to="/legal/terms" className="underline underline-offset-2 hover:text-neutral-900">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/legal/disclaimer" className="underline underline-offset-2 hover:text-neutral-900">
          Disclaimer
        </Link>
        .
      </p>
    </div>
  );
}
