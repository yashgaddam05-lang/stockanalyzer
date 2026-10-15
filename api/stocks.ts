import { sendServerError, supabase, type ApiRequest, type ApiResponse } from './_supabase.js';

export default async function handler(_request: ApiRequest, response: ApiResponse): Promise<void> {
  if (_request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const { data, error } = await supabase.from('stocks').select('*');
  if (error) {
    sendServerError(response);
    return;
  }

  response.status(200).json(data ?? []);
}
