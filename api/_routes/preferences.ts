import {
  isMissingRelation,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// GET/PUT /api/preferences — the signed-in user's dashboard settings (RLS: own row only).

const SCOPES = ['mine', 'sp500', 'all'] as const;
type Scope = (typeof SCOPES)[number];
const COLUMNS = 'dashboard_scope, sectors, goal, experience, risk, onboarded_at, updated_at';
const DEFAULTS = {
  dashboard_scope: 'mine' as Scope,
  sectors: [] as string[],
  goal: null,
  experience: null,
  risk: null,
  onboarded_at: null,
  updated_at: null,
};
// Onboarding interview answers: field -> allowed values (null clears).
const PROFILE: Record<string, readonly string[]> = {
  goal: ['multibaggers', 'track', 'ideas', 'learn'],
  experience: ['new', 'some', 'experienced'],
  risk: ['conservative', 'balanced', 'aggressive'],
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    sendMethodNotAllowed(response, ['GET', 'PUT']);
    return;
  }
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response, auth.kind === 'invalid' ? 'Your session expired. Sign in again.' : undefined);
    return;
  }

  if (request.method === 'GET') {
    const { data, error } = await auth.db.from('user_preferences').select(COLUMNS).maybeSingle();
    if (error && !isMissingRelation(error)) {
      sendServerError(response);
      return;
    }
    response.status(200).json(data ?? DEFAULTS);
    return;
  }

  const body = readJsonBody(request) ?? {};
  const patch: Record<string, unknown> = { owner_id: auth.userId, updated_at: new Date().toISOString() };
  if (body.dashboard_scope !== undefined) {
    if (!SCOPES.includes(body.dashboard_scope as Scope)) {
      sendBadRequest(response, 'dashboard_scope must be mine, sp500 or all.');
      return;
    }
    patch.dashboard_scope = body.dashboard_scope;
  }
  if (body.sectors !== undefined) {
    const sectors = Array.isArray(body.sectors)
      ? body.sectors.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 60).slice(0, 20)
      : null;
    if (!sectors) {
      sendBadRequest(response, 'sectors must be a list of names.');
      return;
    }
    patch.sectors = sectors;
  }
  for (const [field, allowed] of Object.entries(PROFILE)) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && !allowed.includes(value as string)) {
      sendBadRequest(response, `${field} must be one of ${allowed.join(', ')}.`);
      return;
    }
    patch[field] = value;
  }
  if (body.onboarded === true) patch.onboarded_at = new Date().toISOString();

  const { data, error } = await auth.db
    .from('user_preferences')
    .upsert(patch, { onConflict: 'owner_id' })
    .select(COLUMNS)
    .single();
  if (error) {
    sendServerError(response);
    return;
  }
  response.status(200).json(data);
}
