import {
  getQueryValue,
  isMissingRelation,
  isUuid,
  readJsonBody,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import {
  ALERT_EVENT_COLUMNS,
  requireUser,
  sendAlertsUnavailable,
  type AlertKind,
  type UserScope,
} from '../_alerts.js';
import {
  evaluateAlerts,
  type AlertCatalystInput,
  type AlertRuleInput,
  type AlertSnapshotInput,
  type AlertStockInput,
  type RuleState,
} from '../../src/lib/alerts/index.js';

const ALLOWED = ['GET', 'PATCH'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_IDS = 100;
const EVAL_THROTTLE_MS = 60_000;
const CATALYST_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;
/** Snapshots fetched per rule ticker in the single score_history query (we only need the latest 2). */
const SNAPSHOTS_PER_TICKER_BUDGET = 12;
const MAX_SNAPSHOT_ROWS = 1000;
const MAX_THROTTLE_ENTRIES = 5000;

/** Per-instance memory of when each user's rules were last evaluated (epoch ms). */
const lastEvaluatedAt = new Map<string, number>();

type RuleRow = {
  id: string;
  ticker: string;
  kind: AlertKind;
  threshold: number | string;
  is_active: boolean;
  last_state: RuleState | null;
  last_triggered_at: string | null;
  updated_at: string;
};

type StockRow = { ticker: string; current_price: number | string | null; three_x_score: number | null; company_name: string | null };
type SnapshotRow = { id: string; ticker: string; three_x_score: number; model_version: string; captured_at: string };

type EvalOutcome = 'ok' | 'missing' | 'error';

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rememberEvaluation(userId: string, at: number): void {
  if (lastEvaluatedAt.size >= MAX_THROTTLE_ENTRIES && !lastEvaluatedAt.has(userId)) lastEvaluatedAt.clear();
  lastEvaluatedAt.set(userId, at);
}

/**
 * Evaluates the user's active rules and records new events. Throttled per user:
 * skipped when the last evaluation was < 60s ago, unless a rule changed since then.
 * Duplicate protection across concurrent instances: a triggered rule's update is
 * conditioned on its previous last_triggered_at, and only winners insert events.
 * If the event insert fails, winners' previous state is restored so they fire again.
 */
async function evaluateUserRules(scope: UserScope): Promise<EvalOutcome> {
  const startedAt = Date.now();
  const { data, error } = await scope.db
    .from('alerts')
    .select('id, ticker, kind, threshold, is_active, last_state, last_triggered_at, updated_at')
    .eq('is_active', true);
  if (error) return isMissingRelation(error) ? 'missing' : 'error';
  const rows = (data ?? []) as RuleRow[];

  const last = lastEvaluatedAt.get(scope.userId);
  if (last !== undefined && startedAt - last < EVAL_THROTTLE_MS) {
    const changedSince = rows.some((r) => Date.parse(r.updated_at) > last);
    if (!changedSince) return 'ok';
  }
  if (rows.length === 0) {
    rememberEvaluation(scope.userId, startedAt);
    return 'ok';
  }

  // Record the attempt even on failure so a persistently failing evaluation is still
  // throttled to once per 60s instead of retried on every poll.
  try {
    return await runEvaluation(scope, rows, startedAt);
  } finally {
    rememberEvaluation(scope.userId, startedAt);
  }
}

async function runEvaluation(scope: UserScope, rows: RuleRow[], startedAt: number): Promise<EvalOutcome> {
  const tickers = [...new Set(rows.map((r) => r.ticker))];
  const needSnapshots = rows.some((r) => r.kind === 'score_change');
  const needCatalysts = rows.some((r) => r.kind === 'catalyst_within');
  const now = new Date(startedAt);
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(startedAt + CATALYST_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);

  const [stocksRes, snapsRes, catalystsRes] = await Promise.all([
    scope.db.from('stocks').select('ticker, current_price, three_x_score, company_name').in('ticker', tickers),
    needSnapshots
      ? scope.db
          .from('score_history')
          .select('id, ticker, three_x_score, model_version, captured_at')
          .in('ticker', tickers)
          .order('captured_at', { ascending: false })
          .limit(Math.min(MAX_SNAPSHOT_ROWS, tickers.length * SNAPSHOTS_PER_TICKER_BUDGET))
      : Promise.resolve({ data: [] as SnapshotRow[], error: null }),
    needCatalysts
      ? scope.db
          .from('catalysts')
          .select('id, ticker, title, event_date')
          .in('ticker', tickers)
          .gte('event_date', today)
          .lte('event_date', horizon)
          .order('event_date', { ascending: true })
      : Promise.resolve({ data: [] as AlertCatalystInput[], error: null }),
  ]);
  if (stocksRes.error) return 'error';
  // Optional sources: a missing score_history/catalysts table just means those rules can't fire.
  if (snapsRes.error && !isMissingRelation(snapsRes.error)) return 'error';
  if (catalystsRes.error && !isMissingRelation(catalystsRes.error)) return 'error';

  const stocks: Record<string, AlertStockInput> = {};
  for (const s of (stocksRes.data ?? []) as StockRow[]) {
    stocks[s.ticker] = {
      current_price: toNum(s.current_price),
      three_x_score: toNum(s.three_x_score),
      company_name: s.company_name ?? undefined,
    };
  }
  const snapshots: Record<string, AlertSnapshotInput[]> = {};
  for (const s of (snapsRes.error ? [] : (snapsRes.data ?? [])) as SnapshotRow[]) {
    const list = (snapshots[s.ticker] ??= []);
    if (list.length < 2) {
      list.push({ id: s.id, three_x_score: s.three_x_score, model_version: s.model_version, captured_at: s.captured_at });
    }
  }
  const catalysts = (catalystsRes.error ? [] : (catalystsRes.data ?? [])) as AlertCatalystInput[];

  const rules: AlertRuleInput[] = rows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    kind: r.kind,
    threshold: Number(r.threshold),
    is_active: r.is_active,
    last_state: r.last_state,
  }));
  const nowIso = now.toISOString();
  const result = evaluateAlerts({ rules, stocks, snapshots, catalysts, now: nowIso });

  const byId = new Map(rows.map((r) => [r.id, r]));
  let failed = false;

  // 1) Non-triggered state changes (arming, snapshot cursor moves): one UPDATE per distinct
  //    state value, not per rule. Only last_state is written, so a concurrent PATCH/DELETE
  //    can't be reverted or resurrected (which a full-row upsert would risk). For price/score
  //    rules this is at most 2 requests ({armed:true} / {armed:false}) regardless of rule count.
  const quiet = new Map<string, { state: RuleState; ids: string[] }>();
  for (const u of result.updates) {
    if (u.triggered || !byId.has(u.id)) continue;
    const key = JSON.stringify(u.last_state);
    const group = quiet.get(key);
    if (group) group.ids.push(u.id);
    else quiet.set(key, { state: u.last_state, ids: [u.id] });
  }

  // 2) Triggered rules: race-guarded conditional update (dedupe across concurrent instances).
  //    A failure here leaves the rule untouched, so it simply fires on the next evaluation.
  const triggered = result.updates.filter((u) => u.triggered && byId.has(u.id));
  const winners = new Set<string>();

  await Promise.all([
    ...[...quiet.values()].map(async (g) => {
      const { error: updErr } = await scope.db.from('alerts').update({ last_state: g.state }).in('id', g.ids);
      if (updErr) {
        failed = true;
        console.error('[alert-events] state update failed', updErr.message);
      }
    }),
    ...triggered.map(async (u) => {
      const prev = byId.get(u.id) as RuleRow;
      let query = scope.db
        .from('alerts')
        .update({ last_state: u.last_state, last_triggered_at: nowIso })
        .eq('id', u.id);
      query = prev.last_triggered_at === null
        ? query.is('last_triggered_at', null)
        : query.eq('last_triggered_at', prev.last_triggered_at);
      const { data: updated, error: updErr } = await query.select('id');
      if (updErr) {
        failed = true;
        console.error('[alert-events] trigger update failed', updErr.message);
        return;
      }
      if (updated && updated.length > 0) winners.add(u.id);
    }),
  ]);

  // 3) Events for every winner, independent of unrelated update failures.
  const events = result.events
    .filter((e) => winners.has(e.alert_id))
    .map((e) => ({
      owner_id: scope.userId,
      alert_id: e.alert_id,
      ticker: e.ticker,
      kind: e.kind,
      message: e.message.slice(0, 500),
      payload: e.payload,
      triggered_at: nowIso,
    }));
  if (events.length > 0) {
    const { error: insErr } = await scope.db.from('alert_events').insert(events);
    if (insErr) {
      console.error('[alert-events] event insert failed', insErr.message);
      // 4) Undo the winners' claim so they fire again next evaluation instead of being lost.
      //    Guarded on our own last_triggered_at so we never clobber a newer claim.
      await Promise.all(
        [...winners].map(async (id) => {
          const prev = byId.get(id) as RuleRow;
          const { error: rbErr } = await scope.db
            .from('alerts')
            .update({ last_state: prev.last_state ?? {}, last_triggered_at: prev.last_triggered_at })
            .eq('id', id)
            .eq('last_triggered_at', nowIso);
          if (rbErr) console.error('[alert-events] rollback failed', id, rbErr.message);
        }),
      );
      return isMissingRelation(insErr) ? 'missing' : 'error';
    }
  }

  return failed ? 'error' : 'ok';
}

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_LIMIT ? n : null;
}

async function handleGet(request: ApiRequest, response: ApiResponse, scope: UserScope): Promise<void> {
  const limit = parseLimit(getQueryValue(request, 'limit'));
  if (limit === null) {
    sendBadRequest(response, `limit must be an integer between 1 and ${MAX_LIMIT}.`);
    return;
  }
  const unreadRaw = getQueryValue(request, 'unread');
  const unreadOnly = unreadRaw === '1' || unreadRaw === 'true';

  // Evaluation is best-effort: a failure is logged but must not hide existing events.
  let outcome: EvalOutcome;
  try {
    outcome = await evaluateUserRules(scope);
  } catch (evalErr) {
    console.error('[alert-events] evaluation threw', evalErr instanceof Error ? evalErr.message : evalErr);
    outcome = 'error';
  }
  if (outcome === 'missing') {
    response.status(200).json({ available: false, events: [], unread_count: 0 });
    return;
  }
  if (outcome === 'error') console.error('[alert-events] evaluation incomplete; serving stored events');

  let eventsQuery = scope.db
    .from('alert_events')
    .select(ALERT_EVENT_COLUMNS)
    .order('triggered_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (unreadOnly) eventsQuery = eventsQuery.is('read_at', null);

  const [eventsRes, countRes] = await Promise.all([
    eventsQuery,
    scope.db.from('alert_events').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);
  const err = eventsRes.error ?? countRes.error;
  if (err) {
    if (isMissingRelation(err)) {
      response.status(200).json({ available: false, events: [], unread_count: 0 });
      return;
    }
    sendServerError(response);
    return;
  }
  response.status(200).json({
    available: true,
    events: eventsRes.data ?? [],
    unread_count: countRes.count ?? 0,
  });
}

async function handlePatch(request: ApiRequest, response: ApiResponse, scope: UserScope): Promise<void> {
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Request body must be a JSON object.');
    return;
  }
  let ids: string[] | null = null;
  if (body.all === true) {
    ids = null;
  } else if (Array.isArray(body.ids)) {
    if (body.ids.length < 1 || body.ids.length > MAX_IDS || !body.ids.every(isUuid)) {
      sendBadRequest(response, `ids must be 1-${MAX_IDS} event ids.`);
      return;
    }
    ids = [...new Set(body.ids as string[])];
  } else {
    sendBadRequest(response, 'Provide ids (array of event ids) or all: true.');
    return;
  }

  let query = scope.db
    .from('alert_events')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.select('id');
  if (error) {
    if (isMissingRelation(error)) {
      sendAlertsUnavailable(response);
      return;
    }
    sendServerError(response);
    return;
  }
  response.status(200).json({ updated: data?.length ?? 0 });
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
      await handleGet(request, response, scope);
      return;
    }
    await handlePatch(request, response, scope);
  } catch {
    sendServerError(response);
  }
}
