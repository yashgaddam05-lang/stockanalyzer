import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase server configuration is missing.');
}

export const supabase = createClient(supabaseUrl, serviceRoleKey);

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
