import { sendServerError, type ApiRequest, type ApiResponse } from './_supabase';

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    sendServerError(response);
    return;
  }

  try {
    const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/refresh-stocks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
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
