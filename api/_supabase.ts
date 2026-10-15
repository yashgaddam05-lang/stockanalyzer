import { createClient } from '@supabase/supabase-js';

function firstHttpUrl(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.startsWith('https://') || value?.startsWith('http://'));
}

export const supabaseUrl = firstHttpUrl([
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  process.env.DATABASE_URL,
  process.env.database_url,
]);
const anonKey = process.env.SUPABASE_ANON_KEY
  ?? process.env.VITE_SUPABASE_ANON_KEY
  ?? process.env.DATABASE_ANON_KEY
  ?? process.env.database_anon_key;

if (!supabaseUrl || !anonKey) {
  throw new Error('Supabase server configuration is missing.');
}

export const supabase = createClient(supabaseUrl, anonKey);

export type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
};

export function getQueryValue(request: ApiRequest, name: string): string | null {
  const value = request.query?.[name];
  return typeof value === 'string' ? value : null;
}

export function sendServerError(response: ApiResponse): void {
  response.status(500).json({ error: 'The request could not be completed.' });
}
