import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDocumentTitle } from '@/components/auth/AuthLayout';
import { AuthHeading, AuthUnavailable, FieldHint, FormError, errorMessage, isValidEmail } from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const { enabled, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!enabled) return <AuthUnavailable />;

  if (sentTo) {
    return (
      <>
        <AuthHeading title="Check your email" />
        <Card className="space-y-4 p-6 text-center" role="status">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-neutral-700">
            If an account exists for <span className="font-medium text-neutral-900">{sentTo}</span>, a password reset
            link is on its way. The link expires after a short time.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </Card>
      </>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSentTo(email.trim());
    } catch (err) {
      setError(errorMessage(err, 'Could not send the reset email.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AuthHeading title="Forgot your password?" subtitle="Enter your email and we will send you a reset link." />
      <Card className="p-6">
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate aria-busy={submitting}>
          <div className="space-y-2">
            <label htmlFor="forgot-email" className="text-sm font-medium text-neutral-900">
              Email
            </label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'forgot-email-error' : undefined}
            />
            {emailError && (
              <FieldHint id="forgot-email-error" error>
                {emailError}
              </FieldHint>
            )}
          </div>

          {error && <FormError>{error}</FormError>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Sending link' : 'Send reset link'}
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-neutral-900 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
