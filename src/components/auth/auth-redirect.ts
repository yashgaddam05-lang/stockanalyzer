/**
 * Snapshot of the auth-related URL state at page load, taken before supabase-js strips the
 * tokens from the hash (detectSessionInUrl). Imported eagerly by AuthProvider so it is evaluated
 * at startup, not when a lazy auth page chunk loads.
 */
export interface AuthRedirectSnapshot {
  /** Pathname the browser originally landed on. */
  pathname: string;
  /** `type` from the hash or query, e.g. 'recovery' or 'signup'. */
  type: string | null;
  /** Human-readable error from an expired or invalid email link. */
  error: string | null;
}

function read(): AuthRedirectSnapshot {
  if (typeof window === 'undefined') return { pathname: '/', type: null, error: null };
  const { pathname, hash, search } = window.location;
  const h = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const q = new URLSearchParams(search);
  const get = (k: string) => h.get(k) ?? q.get(k);
  const code = get('error_code');
  const description = get('error_description');
  let error: string | null = null;
  if (get('error') || code || description) {
    error =
      code === 'otp_expired'
        ? 'This link has expired or was already used. Request a new one.'
        : (description?.replace(/\+/g, ' ') ?? 'This link is invalid or has expired.');
  }
  return { pathname, type: get('type'), error };
}

export const initialAuthRedirect: AuthRedirectSnapshot = read();

/** True when the initial page load at `pathname` came from a password-recovery email link. */
export function landedFromRecoveryLink(pathname: string): boolean {
  return initialAuthRedirect.pathname === pathname && initialAuthRedirect.type === 'recovery';
}

/** The email-link error for the initial page load at `pathname`, if any. */
export function initialLinkError(pathname: string): string | null {
  return initialAuthRedirect.pathname === pathname ? initialAuthRedirect.error : null;
}
