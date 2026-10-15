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
