import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { authClient, readStoredAccessToken, readStoredSession, withTimeout } from '@/lib/auth-client';
import { setAuthRefresher, setAuthTokenProvider } from '@/lib/api';
import { landedFromRecoveryLink } from '@/components/auth/auth-redirect';
import { track } from '@/lib/analytics';

export interface AuthUser {
  id: string;
  email: string | null;
  /** ISO timestamp the account was created. */
  createdAt: string | null;
}

export interface SignUpOptions {
  /** Where the confirmation email link lands. Defaults to `/login?confirmed=1`. */
  emailRedirectTo?: string;
}

export interface AuthContextValue {
  enabled: boolean;
  loading: boolean;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, options?: SignUpOptions) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the signed-in (or recovery-session) user. */
  updatePassword: (password: string) => Promise<void>;
  /** Re-checks the current password without changing session identity. */
  verifyPassword: (password: string) => Promise<void>;
  /** True while a password-recovery session from an email link is active. */
  recovery: boolean;
  /** Emails a one-time sign-in code. Creates the account if the email is new. */
  sendEmailCode: (email: string) => Promise<void>;
  /** Verifies the emailed code and signs the user in. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  /** Redirects to Google; the user returns to `redirectTo` signed in. */
  signInWithGoogle: (redirectTo: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DISABLED_MESSAGE = 'Sign-in is not available right now.';

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  return u ? { id: u.id, email: u.email ?? null, createdAt: u.created_at ?? null } : null;
}

/** Maps Supabase auth errors to human-readable messages. */
function friendlyError(error: AuthError | Error): Error {
  const raw = (error.message || '').toLowerCase();
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
    return new Error('Incorrect email or password.');
  }
  if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) {
    return new Error('Please confirm your email first. Check your inbox for the confirmation link.');
  }
  if (code === 'user_already_exists' || raw.includes('already registered')) {
    return new Error('An account with this email already exists. Try signing in instead.');
  }
  if (code === 'weak_password' || raw.includes('password should be')) {
    return new Error('Password is too weak. Use at least 8 characters.');
  }
  if (code === 'same_password' || raw.includes('different from the old password')) {
    return new Error('Your new password must be different from your current password.');
  }
  if (code === 'reauthentication_needed' || raw.includes('reauthentication')) {
    return new Error('For security, sign out and sign back in, then change your password.');
  }
  if (code === 'session_not_found' || raw.includes('auth session missing')) {
    return new Error('Your reset link has expired. Request a new one.');
  }
  if (code === 'over_email_send_rate_limit' || raw.includes('rate limit')) {
    return new Error('Too many attempts. Please wait a minute and try again.');
  }
  if (code === 'otp_expired' || raw.includes('token has expired') || raw.includes('otp has expired')) {
    return new Error('That code is wrong or has expired. Check the latest email or request a new code.');
  }
  if (code === 'otp_disabled' || raw.includes('signups not allowed for otp')) {
    return new Error('Email codes are not enabled yet. Use your password for now.');
  }
  if (code === 'provider_disabled' || raw.includes('provider is not enabled')) {
    return new Error('Google sign-in is not enabled yet. Use an email code instead.');
  }
  if (raw.includes('invalid email') || code === 'email_address_invalid') {
    return new Error('Please enter a valid email address.');
  }
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return new Error('Network error. Check your connection and try again.');
  }
  return new Error(error.message || 'Something went wrong. Please try again.');
}

/**
 * True when this browser may hold a session: a saved Supabase token, or auth params in the URL
 * (email link / OAuth return). When false we know synchronously that the user is signed out,
 * so sign-in pages render instantly instead of waiting on getSession().
 */
function mayHaveSession(): boolean {
  try {
    if (/[#&?](access_token|refresh_token|code|token_hash|error_description)=/.test(window.location.href)) return true;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => authClient !== null && mayHaveSession());
  const [recovery, setRecovery] = useState<boolean>(() => landedFromRecoveryLink('/reset-password'));

  useEffect(() => {
    const client = authClient;
    if (!client) return;
    let active = true;

    // Never let a slow or stuck session lookup hold up API calls: fall back to the stored token.
    setAuthTokenProvider(async () => {
      const token = await withTimeout(
        client.auth.getSession().then(({ data }) => data.session?.access_token ?? null),
        2500,
        null
      ).catch(() => null);
      return token ?? readStoredAccessToken();
    });
    // Called once when the API rejects a token: refresh it so the request can be retried.
    setAuthRefresher(async () => {
      const { data } = await withTimeout(client.auth.refreshSession(), 5000, { data: { session: null, user: null }, error: null });
      return data.session?.access_token ?? null;
    });

    // If the lookup stalls, trust the saved session for identity; token refresh continues in the background.
    withTimeout(client.auth.getSession(), 4000, null)
      .then((result) => {
        if (active) setUser(toUser(result ? result.data.session : readStoredSession()));
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      const next = toUser(session);
      // Keep identity stable when only the token refreshes, so dependents do not refetch.
      setUser((prev) =>
        prev?.id === next?.id && prev?.email === next?.email && prev?.createdAt === next?.createdAt ? prev : next
      );
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      setAuthTokenProvider(null);
      setAuthRefresher(null);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string, options?: SignUpOptions) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: options?.emailRedirectTo ?? `${window.location.origin}/login?confirmed=1` },
    });
    if (error) throw friendlyError(error);
    // Supabase returns a user with an empty identities array when the email is already registered.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Try signing in instead.');
    }
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!authClient) return;
    const { error } = await authClient.auth.signOut();
    if (error) throw friendlyError(error);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw friendlyError(error);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.updateUser({ password });
    if (error) throw friendlyError(error);
    setRecovery(false);
  }, []);

  const verifyPassword = useCallback(
    async (password: string) => {
      if (!authClient) throw new Error(DISABLED_MESSAGE);
      const email = user?.email;
      if (!email) throw new Error('Your session has expired. Please sign in again.');
      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) {
        const friendly = friendlyError(error);
        throw friendly.message === 'Incorrect email or password.' ? new Error('Current password is incorrect.') : friendly;
      }
    },
    [user?.email]
  );

  const sendEmailCode = useCallback(async (email: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
    });
    if (error) throw friendlyError(error);
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { data, error } = await authClient.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw friendlyError(error);
    // New accounts are created on first code verification; count them as sign-ups in GA4.
    const created = data.user?.created_at ? Date.parse(data.user.created_at) : 0;
    track(Date.now() - created < 5 * 60 * 1000 ? 'sign_up' : 'login', { method: 'email_code' });
  }, []);

  const signInWithGoogle = useCallback(async (redirectTo: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw friendlyError(error);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: authClient !== null,
      loading,
      user,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      verifyPassword,
      recovery,
      sendEmailCode,
      verifyEmailCode,
      signInWithGoogle,
    }),
    [loading, user, signIn, signUp, signOut, sendPasswordReset, updatePassword, verifyPassword, recovery, sendEmailCode, verifyEmailCode, signInWithGoogle]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
