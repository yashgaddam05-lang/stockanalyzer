/** Shared helpers for /api/alerts and /api/alert-events only. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAuth, sendUnauthorized, type ApiRequest, type ApiResponse } from './_supabase.js';

export const ALERT_KINDS = [
  'score_above',
  'score_below',
  'score_change',
  'price_above',
  'price_below',
  'catalyst_within',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Public columns of public.alerts. Never select owner_id or last_state into a response. */
export const ALERT_COLUMNS = 'id, ticker, kind, threshold, is_active, last_triggered_at, created_at, updated_at';
/** Public columns of public.alert_events (no owner_id). */
export const ALERT_EVENT_COLUMNS = 'id, alert_id, ticker, kind, message, payload, triggered_at, read_at';

export const MAX_RULES_PER_USER = 50;
export const ALERTS_UNAVAILABLE_MESSAGE = 'Alerts require the latest database migration.';

export type AlertRuleRow = {
  id: string;
  ticker: string;
  kind: AlertKind;
  threshold: number | string;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === 'string' && (ALERT_KINDS as readonly string[]).includes(value);
}

/** Validated threshold for the kind, or an error message. */
export function validateThreshold(kind: AlertKind, value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: 'threshold must be a finite number.' };
  }
  switch (kind) {
    case 'score_above':
    case 'score_below':
      return value >= 0 && value <= 100
        ? { ok: true, value }
        : { ok: false, error: 'Score thresholds must be between 0 and 100.' };
    case 'score_change':
      return value >= 1 && value <= 50
        ? { ok: true, value }
        : { ok: false, error: 'Score change thresholds must be between 1 and 50 points.' };
    case 'price_above':
    case 'price_below':
      return value > 0 && value < 1e7
        ? { ok: true, value }
        : { ok: false, error: 'Price thresholds must be greater than 0 and less than 10,000,000.' };
    case 'catalyst_within':
      return Number.isInteger(value) && value >= 1 && value <= 90
        ? { ok: true, value }
        : { ok: false, error: 'Catalyst windows must be a whole number of days between 1 and 90.' };
  }
}

/** Strips anything beyond the public AlertRule shape and coerces numeric threshold. */
export function toAlertRule(row: AlertRuleRow) {
  return {
    id: row.id,
    ticker: row.ticker,
    kind: row.kind,
    threshold: Number(row.threshold),
    is_active: row.is_active,
    last_triggered_at: row.last_triggered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type UserScope = { db: SupabaseClient; userId: string };

/** Signed-in user's RLS-scoped client, or sends 401 and returns null. */
export async function requireUser(request: ApiRequest, response: ApiResponse): Promise<UserScope | null> {
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response, 'Sign in required.');
    return null;
  }
  return { db: auth.db, userId: auth.userId };
}

export function sendAlertsUnavailable(response: ApiResponse): void {
  response.status(503).json({ error: ALERTS_UNAVAILABLE_MESSAGE });
}
