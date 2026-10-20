import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const authEnabled: boolean = authClient !== null;

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
