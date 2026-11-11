import {
  readJsonBody,
  resolveAuth,
  sendMethodNotAllowed,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// GET  /api/admin                                           -> headline stats (admins only)
// POST /api/admin { action: 'maintenance', enabled, message } -> flip the production maintenance page
// Authorization is enforced inside the database functions (app_admins membership), not just here.
export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return;
  }
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response, auth.kind === 'invalid' ? 'Your session expired. Sign in again.' : undefined);
    return;
  }
  const forbidden = () => response.status(403).json({ error: 'Admins only.' });

  if (request.method === 'GET') {
    const { data, error } = await auth.db.rpc('admin_stats');
    if (error) return forbidden();
    response.status(200).json(data);
    return;
  }
  const body = readJsonBody(request) ?? {};
  if (body.action !== 'maintenance') {
    response.status(400).json({ error: 'Unknown admin action.' });
    return;
  }
  const { data, error } = await auth.db.rpc('admin_set_maintenance', {
    p_enabled: body.enabled === true,
    p_message: typeof body.message === 'string' ? body.message : '',
  });
  if (error) return forbidden();
  response.status(200).json({ maintenance: data });
}
