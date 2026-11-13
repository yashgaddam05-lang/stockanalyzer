import {
  readJsonBody,
  resolveAuth,
  sendMethodNotAllowed,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { runScheduledResearch, activeSlots, coverage } from '../_research.js';
import { dailyLimitUsd } from '../_ai.js';

// GET  /api/admin                                           -> headline stats (admins only)
// POST /api/admin { action: 'maintenance', enabled, message } -> flip the production maintenance page
// POST /api/admin { action: 'research', limit? }             -> run a research batch now (admins; checked in the DB)
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
    const { data: ai } = await auth.db.rpc('admin_ai_stats');
    const paying = Number((data as { paying?: number })?.paying ?? 0);
    response.status(200).json({ ...(data as object), ai: ai ? { ...(ai as object), daily_limit_usd: dailyLimitUsd(), slots: activeSlots(paying), coverage: coverage(paying) } : null });
    return;
  }
  const body = readJsonBody(request) ?? {};
  if (body.action === 'research') {
    // Admin check through the database before spending anything.
    const { error } = await auth.db.rpc('admin_ai_stats');
    if (error) return forbidden();
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 5));
    const result = await runScheduledResearch('admin', { force: true, limit, deadlineMs: 240_000 });
    response.status(200).json({ result });
    return;
  }
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
