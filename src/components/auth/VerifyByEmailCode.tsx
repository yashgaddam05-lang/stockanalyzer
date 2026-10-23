import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { FormError, errorMessage } from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESEND_SECONDS = 30;

/**
 * Proves the signed-in user owns their email with a 6-digit code, for people who signed up with an
 * email code (or Google) and never had a password to type into "current password".
 */
export function VerifyByEmailCode({ email, onVerified }: { email: string; onVerified: () => void }) {
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setError(null);
    setBusy('send');
    try {
      await sendEmailCode(email);
      setSent(true);
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
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy('verify');
    try {
      await verifyEmailCode(email, code);
      onVerified();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  if (!sent) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="outline" onClick={() => void send()} disabled={busy !== null}>
          {busy === 'send' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Email me a code
        </Button>
        {error && <FormError>{error}</FormError>}
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void verify(e)} noValidate aria-busy={busy !== null}>
      <div className="flex items-start gap-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <p>
          We sent a 6-digit code to <span className="font-medium text-neutral-900">{email}</span>. Check spam if you
          don't see it in a minute.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="account-otp-code" className="text-sm font-medium text-neutral-900">
          6-digit code
        </label>
        <Input
          id="account-otp-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={busy !== null}
        />
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy !== null || code.length < 6}>
          {busy === 'verify' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy === 'verify' ? 'Verifying' : 'Verify code'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={cooldown > 0 || busy !== null}
          onClick={() => void send()}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}
