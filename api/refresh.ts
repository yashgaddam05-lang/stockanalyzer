import { sendServerError, supabaseUrl, type ApiRequest, type ApiResponse } from './_supabase.js';

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!supabaseUrl) {
    sendServerError(response);
    return;
  }

  try {
    const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/refresh-stocks`, {
      method: 'POST',
    });

    const payload: unknown = await refreshResponse.json();
    if (!refreshResponse.ok) {
      response.status(502).json({ error: 'The stock refresh service is unavailable.' });
      return;
    }

    response.status(200).json(payload);
  } catch {
    sendServerError(response);
  }
}
