import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { authClient } from '@/lib/auth-client';
import { setAuthTokenProvider } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthContextValue {
  enabled: boolean;
  loading: boolean;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DISABLED_MESSAGE = 'Sign-in is not available right now.';

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
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
  if (code === 'over_email_send_rate_limit' || raw.includes('rate limit')) {
    return new Error('Too many attempts. Please wait a minute and try again.');
  }
  if (raw.includes('invalid email') || code === 'email_address_invalid') {
    return new Error('Please enter a valid email address.');
  }
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return new Error('Network error. Check your connection and try again.');
  }
  return new Error(error.message || 'Something went wrong. Please try again.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(authClient !== null);

  useEffect(() => {
    const client = authClient;
    if (!client) return;
    let active = true;

    setAuthTokenProvider(async () => (await client.auth.getSession()).data.session?.access_token ?? null);

    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUser(toUser(data.session));
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const next = toUser(session);
      // Keep identity stable when only the token refreshes, so dependents do not refetch.
      setUser((prev) => (prev?.id === next?.id && prev?.email === next?.email ? prev : next));
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      setAuthTokenProvider(null);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { error } = await authClient.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!authClient) throw new Error(DISABLED_MESSAGE);
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
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
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw friendlyError(error);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ enabled: authClient !== null, loading, user, signIn, signUp, signOut, sendPasswordReset }),
    [loading, user, signIn, signUp, signOut, sendPasswordReset]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
