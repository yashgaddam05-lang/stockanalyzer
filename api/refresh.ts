import { sendMethodNotAllowed, sendServerError, type ApiRequest, type ApiResponse } from './_supabase.js';
import { runStockRefresh } from './_refresh-core.js';

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(response, ['POST']);
    return;
  }

  try {
    const result = await runStockRefresh('manual');
    if (result.ok) {
      response.status(200).json(result.data);
      return;
    }
    response.status(result.status).json({ error: result.error });
  } catch {
    sendServerError(response);
  }
}
