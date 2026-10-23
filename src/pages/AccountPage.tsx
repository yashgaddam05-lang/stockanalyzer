import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { VerifyByEmailCode } from '@/components/auth/VerifyByEmailCode';
import { FormError, errorMessage } from '@/components/auth/auth-ui';
import { useSignOutToHome } from '@/components/auth/use-sign-out';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AccountPage() {
  const { user, verifyPassword, updatePassword } = useAuth();
  const signOutToHome = useSignOutToHome();
  const [changed, setChanged] = useState(false);
  // Code sign-ups never set a password, so they verify with an email code instead of "current password".
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [codeVerified, setCodeVerified] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Account · 3x Hunter';
    return () => {
      document.title = previous;
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOutToHome();
    } catch (err) {
      setSignOutError(errorMessage(err, 'Could not sign out.'));
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your sign-in details.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Profile</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="truncate text-sm font-medium text-neutral-900" title={user?.email ?? undefined}>
              {user?.email ?? 'Unknown'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="text-sm font-medium text-neutral-900">{formatDate(user?.createdAt ?? null)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-neutral-900">{method === 'password' ? 'Change password' : 'Set a password'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {method === 'password'
            ? 'Enter your current password, then choose a new one.'
            : codeVerified
              ? 'Email verified. Choose your new password.'
              : 'We’ll email you a 6-digit code to confirm it’s you, then you can choose a password.'}
        </p>
        <div className="mt-4 max-w-md space-y-4">
          {changed && (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Password updated.
            </p>
          )}
          {method === 'password' ? (
            <NewPasswordForm
              requireCurrent
              submitLabel="Update password"
              submittingLabel="Updating password"
              onSubmit={async ({ current, password }) => {
                setChanged(false);
                await verifyPassword(current);
                await updatePassword(password);
              }}
              onSuccess={() => setChanged(true)}
            />
          ) : codeVerified ? (
            <NewPasswordForm
              submitLabel="Save password"
              submittingLabel="Saving password"
              onSubmit={async ({ password }) => {
                setChanged(false);
                await updatePassword(password);
              }}
              onSuccess={() => {
                setChanged(true);
                setCodeVerified(false);
                setMethod('password');
              }}
            />
          ) : (
            user?.email && <VerifyByEmailCode email={user.email} onVerified={() => setCodeVerified(true)} />
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-neutral-900 hover:underline"
            onClick={() => {
              setMethod(method === 'password' ? 'code' : 'password');
              setCodeVerified(false);
              setChanged(false);
            }}
          >
            {method === 'password'
              ? 'Signed up with an email code, or forgot your password? Verify with a code instead'
              : 'I know my current password'}
          </button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Sign out</h2>
          <p className="mt-1 text-sm text-muted-foreground">End your session on this device.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleSignOut()} disabled={signingOut}>
          {signingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Sign out
        </Button>
        {signOutError && <FormError>{signOutError}</FormError>}
      </Card>
    </div>
  );
}
