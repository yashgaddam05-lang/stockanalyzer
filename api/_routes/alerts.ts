import {
  getQueryValue,
  isMissingRelation,
  isUuid,
  normalizeTicker,
  readJsonBody,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import {
  ALERT_COLUMNS,
  MAX_RULES_PER_USER,
  isAlertKind,
  requireUser,
  sendAlertsUnavailable,
  toAlertRule,
  validateThreshold,
  type AlertKind,
  type AlertRuleRow,
  type UserScope,
} from '../_alerts.js';

const ALLOWED = ['GET', 'POST', 'PATCH', 'DELETE'];

async function handleGet(response: ApiResponse, scope: UserScope): Promise<void> {
  const { data, error } = await scope.db
    .from('alerts')
    .select(ALERT_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingRelation(error)) {
      response.status(200).json({ available: false, rules: [] });
      return;
    }
    sendServerError(response);
    return;
  }
  const rules = ((data ?? []) as AlertRuleRow[]).map(toAlertRule);
  response.status(200).json({ available: true, rules });
}

async function handlePost(request: ApiRequest, response: ApiResponse, scope: UserScope): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  const ticker = normalizeTicker(body.ticker);
  if (!ticker) {
    sendBadRequest(response, 'A valid ticker is required.');
    return;
  }
  if (!isAlertKind(body.kind)) {
    sendBadRequest(response, 'kind must be one of score_above, score_below, score_change, price_above, price_below, catalyst_within.');
    return;
  }
  const kind: AlertKind = body.kind;
  const threshold = validateThreshold(kind, body.threshold);
  if (!threshold.ok) {
    sendBadRequest(response, threshold.error);
    return;
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    sendBadRequest(response, 'is_active must be a boolean.');
    return;
  }
  const isActive = body.is_active ?? true;

  const [stockResult, countResult] = await Promise.all([
    scope.db.from('stocks').select('ticker').eq('ticker', ticker).limit(1),
    scope.db.from('alerts').select('id', { count: 'exact', head: true }),
  ]);
  if (countResult.error) {
    if (isMissingRelation(countResult.error)) {
      sendAlertsUnavailable(response);
      return;
    }
    sendServerError(response);
    return;
  }
  if (stockResult.error) {
    sendServerError(response);
    return;
  }
  if (!stockResult.data || stockResult.data.length === 0) {
    sendBadRequest(response, `Unknown ticker ${ticker}.`);
    return;
  }
  // Soft cap: count-then-insert can overshoot by a few under concurrent POSTs. Enforce in the DB if it matters.
  if ((countResult.count ?? 0) >= MAX_RULES_PER_USER) {
    response.status(409).json({ error: `You can have at most ${MAX_RULES_PER_USER} alert rules.` });
    return;
  }

  const { data, error } = await scope.db
    .from('alerts')
    .insert({ owner_id: scope.userId, ticker, kind, threshold: threshold.value, is_active: isActive })
    .select(ALERT_COLUMNS)
    .single();
  if (error || !data) {
    if (isMissingRelation(error)) {
      sendAlertsUnavailable(response);
      return;
    }
    sendServerError(response);
    return;
  }
  response.status(201).json(toAlertRule(data as AlertRuleRow));
}

async function handlePatch(request: ApiRequest, response: ApiResponse, scope: UserScope, id: string): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    sendBadRequest(response, 'is_active must be a boolean.');
    return;
  }
  if (body.threshold === undefined && body.is_active === undefined) {
    sendBadRequest(response, 'Provide threshold and/or is_active to update.');
    return;
  }

  const existing = await scope.db.from('alerts').select('id, kind, threshold').eq('id', id).maybeSingle();
  if (existing.error) {
    if (isMissingRelation(existing.error)) {
      sendAlertsUnavailable(response);
      return;
    }
    sendServerError(response);
    return;
  }
  const current = existing.data as { id: string; kind: AlertKind; threshold: number | string } | null;
  if (!current) {
    response.status(404).json({ error: 'Alert not found.' });
    return;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.threshold !== undefined) {
    const threshold = validateThreshold(current.kind, body.threshold);
    if (!threshold.ok) {
      sendBadRequest(response, threshold.error);
      return;
    }
    patch.threshold = threshold.value;
    if (threshold.value !== Number(current.threshold)) patch.last_state = {};
  }
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

  const { data, error } = await scope.db
    .from('alerts')
    .update(patch)
    .eq('id', id)
    .select(ALERT_COLUMNS)
    .maybeSingle();
  if (error) {
    sendServerError(response);
    return;
  }
  if (!data) {
    response.status(404).json({ error: 'Alert not found.' });
    return;
  }
  response.status(200).json(toAlertRule(data as AlertRuleRow));
}

async function handleDelete(response: ApiResponse, scope: UserScope, id: string): Promise<void> {
  const { data, error } = await scope.db.from('alerts').delete().eq('id', id).select('id');
  if (error) {
    if (isMissingRelation(error)) {
      sendAlertsUnavailable(response);
      return;
    }
    sendServerError(response);
    return;
  }
  if (!data || data.length === 0) {
    response.status(404).json({ error: 'Alert not found.' });
    return;
  }
  response.status(204).end();
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const method = request.method ?? '';
  if (!ALLOWED.includes(method)) {
    sendMethodNotAllowed(response, ALLOWED);
    return;
  }

  try {
    const scope = await requireUser(request, response);
    if (!scope) return;

    if (method === 'GET') {
      await handleGet(response, scope);
      return;
    }
    if (method === 'POST') {
      await handlePost(request, response, scope);
      return;
    }

    const id = getQueryValue(request, 'id');
    if (!isUuid(id)) {
      sendBadRequest(response, 'A valid alert id is required.');
      return;
    }
    if (method === 'PATCH') {
      await handlePatch(request, response, scope, id);
      return;
    }
    await handleDelete(response, scope, id);
  } catch {
    sendServerError(response);
  }
}
