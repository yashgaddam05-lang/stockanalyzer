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
const COLUMNS = 'dashboard_scope, sectors, goal, experience, risk, temperament, weekly_email, onboarded_at, updated_at';
const DEFAULTS = {
  dashboard_scope: 'mine' as Scope,
  sectors: [] as string[],
  goal: null,
  experience: null,
  risk: null,
  temperament: null,
  weekly_email: true,
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
  if (body.temperament !== undefined) {
    // Quiz result only; validated so the column cannot be used as free-form storage.
    const t = body.temperament as Record<string, unknown> | null;
    const BOTS = ['steady', 'balanced', 'growth', 'moonshot'];
    const answers = t && typeof t.answers === 'object' && t.answers !== null ? (t.answers as Record<string, unknown>) : null;
    const valid = t === null || (
      typeof t.score === 'number' && t.score >= 0 && t.score <= 100
      && typeof t.bot === 'string' && BOTS.includes(t.bot)
      && typeof t.tolerance === 'number' && t.tolerance > 0 && t.tolerance <= 100
      && answers !== null && Object.keys(answers).length <= 20
      && Object.entries(answers).every(([k, v]) => /^[a-z_]{1,20}$/.test(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) < 10)
    );
    if (!valid) {
      sendBadRequest(response, 'temperament must be a quiz result.');
      return;
    }
    patch.temperament = t === null ? null : { score: t!.score, bot: t!.bot, tolerance: t!.tolerance, answers, at: new Date().toISOString() };
  }
  if (typeof body.weekly_email === 'boolean') patch.weekly_email = body.weekly_email;
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
