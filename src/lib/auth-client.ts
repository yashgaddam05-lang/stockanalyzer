import { createClient, processLock } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client used ONLY for authentication.
 *
 * Only `authClient.auth` may be used. Never use the table query builder, RPC, storage or
 * realtime channel APIs from the browser: all data access goes through `/api/*`
 * (src/lib/api.ts) with the session JWT forwarded as a bearer token.
 *
 * Null when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing: auth is disabled and
 * the app keeps working with shared (anonymous) data.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authClient: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // processLock instead of the default navigator.locks lock, which can deadlock in Safari
        // (after sleep/backgrounding) and leave every signed-in request waiting forever.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, lock: processLock },
      })
    : null;

export const authEnabled: boolean = authClient !== null;

/** The saved session object straight from storage (may hold an expired access token). */
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Session | null;
      if (saved?.user?.id) return saved;
    }
  } catch {
    // Storage blocked or malformed.
  }
  return null;
}

/** The saved access token straight from storage, if it is still valid for at least 30 seconds. */
export function readStoredAccessToken(): string | null {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null') as { access_token?: string; expires_at?: number } | null;
      if (saved?.access_token && typeof saved.expires_at === 'number' && saved.expires_at * 1000 > Date.now() + 30_000) {
        return saved.access_token;
      }
    }
  } catch {
    // Storage blocked or malformed.
  }
  return null;
}

/** Resolves with `fallback` if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export interface AuthProviders {
  google: boolean;
}

let providersPromise: Promise<AuthProviders> | null = null;

/**
 * Which sign-in providers are switched on in Supabase (public /auth/v1/settings endpoint).
 * Lets the UI show the Google button only once it is configured, with no redeploy.
 */
export function fetchAuthProviders(): Promise<AuthProviders> {
  if (!url || !anonKey) return Promise.resolve({ google: false });
  providersPromise ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    .then((res) => (res.ok ? res.json() : null))
    .then((settings: { external?: Record<string, boolean> } | null) => ({ google: Boolean(settings?.external?.google) }))
    .catch(() => ({ google: false }));
  return providersPromise;
}
