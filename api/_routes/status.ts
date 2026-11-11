import { sendMethodNotAllowed, supabase, type ApiRequest, type ApiResponse } from '../_supabase.js';

// GET /api/status -> { maintenance: { enabled, message } }. Public, CDN-cached for 15 seconds.
export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
  const value = (data?.value ?? {}) as { enabled?: boolean; message?: string };
  response.setHeader?.('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');
  response.status(200).json({ maintenance: { enabled: value.enabled === true, message: value.message ?? '' } });
}
