import {
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { getPlan } from '../_plan.js';
import { brokerageConfigured, connectUrl, disconnect, getLink, syncHoldings } from '../_brokerage.js';

// GET  /api/brokerage                         -> connection status (never exposes SnapTrade secrets)
// POST /api/brokerage { action: 'connect' }    -> SnapTrade Connection Portal URL (read-only)
// POST /api/brokerage { action: 'sync' }       -> pull current holdings into the synced portfolio(s)
// POST /api/brokerage { action: 'disconnect' } -> revoke at SnapTrade and delete synced portfolios

const MIN_SYNC_GAP_MS = 60_000;

function origin(request: ApiRequest): string {
  const h = request.headers ?? {};
  const host = (h['x-forwarded-host'] ?? h.host) as string | undefined;
  const proto = (h['x-forwarded-proto'] as string | undefined) ?? 'https';
  return host ? `${proto}://${host}` : 'https://3xhunter.com';
}

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
  const configured = brokerageConfigured();

  if (request.method === 'GET') {
    const link = configured ? await getLink(auth.userId) : null;
    const plan = await getPlan(auth.userId, auth.db);
    response.status(200).json({
      available: configured,
      allowed: plan.plan === 'pro',
      connected: Boolean(link && link.status !== 'pending'),
      status: link?.status ?? 'none',
      lastSyncedAt: link?.last_synced_at ?? null,
      lastError: link?.status === 'error' ? 'The last sync failed. Try Sync now, or reconnect your brokerage.' : null,
    });
    return;
  }

  if (!configured) {
    response.status(503).json({ error: 'Brokerage connections are not switched on yet.' });
    return;
  }
  const body = readJsonBody(request) ?? {};
  try {
    if (body.action === 'connect') {
      const plan = await getPlan(auth.userId, auth.db);
      if (plan.plan !== 'pro') {
        response.status(402).json({ error: 'Connecting a brokerage is part of 3x Hunter Pro.', upgrade: true });
        return;
      }
      const url = await connectUrl(auth.userId, `${origin(request)}/app/portfolios?brokerage=connected`);
      response.status(200).json({ url });
      return;
    }
    if (body.action === 'sync') {
      const link = await getLink(auth.userId);
      if (!link) {
        response.status(409).json({ error: 'Connect a brokerage first.' });
        return;
      }
      if (link.last_synced_at && Date.now() - Date.parse(link.last_synced_at) < MIN_SYNC_GAP_MS) {
        response.status(200).json({ skipped: true, lastSyncedAt: link.last_synced_at });
        return;
      }
      const result = await syncHoldings(auth.userId);
      response.status(200).json({ ...result, lastSyncedAt: new Date().toISOString() });
      return;
    }
    if (body.action === 'disconnect') {
      await disconnect(auth.userId);
      response.status(200).json({ disconnected: true });
      return;
    }
    sendBadRequest(response, 'Unknown brokerage action.');
  } catch (error) {
    console.error('brokerage error', (error as Error)?.message ?? error);
    response.status(502).json({ error: 'The brokerage connection could not complete that request. Please try again.' });
  }
}
