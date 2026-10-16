import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDocumentTitle } from '@/components/auth/AuthLayout';
import { initialLinkError } from '@/components/auth/auth-redirect';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { AuthChecking, AuthHeading, AuthUnavailable } from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function InvalidLink({ message }: { message: string }) {
  return (
    <>
      <AuthHeading title="Reset link not valid" />
      <Card className="space-y-4 p-6" role="alert">
        <div className="flex items-start gap-3 text-sm text-neutral-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>{message}</p>
        </div>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </Card>
    </>
  );
}

/**
 * Landing page for the password-recovery email link (redirectTo: /reset-password). supabase-js
 * turns the link into a recovery session (PASSWORD_RECOVERY event); the user then sets a new
 * password via auth.updateUser.
 */
export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password');
  const { enabled, loading, user, recovery, updatePassword } = useAuth();
  const [linkError] = useState(() => initialLinkError('/reset-password'));
  const [done, setDone] = useState(false);

  if (!enabled) return <AuthUnavailable />;
  if (done) {
    return (
      <>
        <AuthHeading title="Password updated" />
        <Card className="space-y-4 p-6 text-center" role="status">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-neutral-700">Your password has been changed. You are signed in.</p>
          <Button asChild className="w-full">
            <Link to="/app">Continue to dashboard</Link>
          </Button>
        </Card>
      </>
    );
  }
  if (loading) return <AuthChecking />;
  if (!user) {
    return <InvalidLink message={linkError ?? 'This reset link is invalid or has expired. Request a new one.'} />;
  }

  return (
    <>
      <AuthHeading
        title="Set a new password"
        subtitle={
          recovery ? (
            <>
              Choose a new password for <span className="font-medium text-neutral-900">{user.email}</span>.
            </>
          ) : (
            'Choose a new password for your account.'
          )
        }
      />
      <Card className="p-6">
        <NewPasswordForm
          submitLabel="Update password"
          submittingLabel="Updating password"
          onSubmit={({ password }) => updatePassword(password)}
          onSuccess={() => setDone(true)}
        />
      </Card>
    </>
  );
}
