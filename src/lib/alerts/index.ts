/**
 * Alert rule evaluation. Pure, deterministic, no I/O.
 *
 * Edge-triggered so users are not spammed:
 * - price_above / price_below / score_above / score_below fire when the condition is
 *   true and state.armed !== false, then disarm. They re-arm once the condition is false.
 * - score_change fires when the latest two snapshots share the same model_version,
 *   |delta| >= threshold, and the latest snapshot id was not already alerted on.
 * - catalyst_within fires once per catalyst id when 0 <= days until event <= threshold.
 */

/** Must stay identical to AlertKind in src/lib/supabase.ts. */
export type AlertKindLocal =
  | 'price_above'
  | 'price_below'
  | 'score_above'
  | 'score_below'
  | 'score_change'
  | 'catalyst_within';

export type RuleState = {
  armed?: boolean;
  last_snapshot_id?: string;
  fired_catalyst_ids?: string[];
};

export interface AlertRuleInput {
  id: string;
  ticker: string;
  kind: AlertKindLocal;
  threshold: number;
  is_active: boolean;
  last_state: RuleState | null | undefined;
}

export interface AlertStockInput {
  current_price: number | null;
  three_x_score: number | null;
  company_name?: string;
}

export interface AlertSnapshotInput {
  id: string;
  three_x_score: number;
  model_version: string;
  captured_at: string;
}

export interface AlertCatalystInput {
  id: string;
  ticker: string;
  title: string;
  event_date: string;
}

export interface EvaluateAlertsInput {
  rules: AlertRuleInput[];
  stocks: Record<string, AlertStockInput>;
  /** Latest first. */
  snapshots: Record<string, AlertSnapshotInput[]>;
  catalysts: AlertCatalystInput[];
  now: string;
}

export interface AlertEvent {
  alert_id: string;
  ticker: string;
  kind: AlertKindLocal;
  message: string;
  payload: Record<string, unknown>;
}

export interface AlertUpdate {
  id: string;
  last_state: RuleState;
  triggered: boolean;
}

export interface EvaluateAlertsResult {
  events: AlertEvent[];
  updates: AlertUpdate[];
}

export const FIRED_CATALYST_CAP = 50;
const DAY_MS = 86_400_000;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** UTC calendar-day index of an ISO date or timestamp (date-only strings parse as UTC). */
function dayIndex(iso: string): number | null {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / DAY_MS);
}

function sameState(a: RuleState, b: RuleState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function evaluateAlerts(input: EvaluateAlertsInput): EvaluateAlertsResult {
  const events: AlertEvent[] = [];
  const updates: AlertUpdate[] = [];
  const nowDay = dayIndex(input.now);

  for (const rule of input.rules) {
    if (!rule.is_active) continue;
    const prev: RuleState = { ...(rule.last_state ?? {}) };
    let next: RuleState = { ...prev };
    let event: AlertEvent | null = null;
    const catalystEvents: AlertEvent[] = [];
    const ticker = rule.ticker;
    const stock = input.stocks[ticker];

    switch (rule.kind) {
      case 'price_above':
      case 'price_below':
      case 'score_above':
      case 'score_below': {
        const isPrice = rule.kind === 'price_above' || rule.kind === 'price_below';
        const value = isPrice ? stock?.current_price : stock?.three_x_score;
        if (!isNum(value)) break;
        const above = rule.kind === 'price_above' || rule.kind === 'score_above';
        const condition = above ? value > rule.threshold : value < rule.threshold;
        if (condition) {
          if (prev.armed !== false) {
            const dir = above ? 'above' : 'below';
            const msg = isPrice
              ? `${ticker} price is ${fmtPrice(value)}, ${dir} your ${fmtPrice(rule.threshold)} level`
              : `${ticker} 3x score is ${fmtNum(value)}, ${dir} your threshold of ${fmtNum(rule.threshold)}`;
            event = {
              alert_id: rule.id,
              ticker,
              kind: rule.kind,
              message: msg,
              payload: { value, threshold: rule.threshold, metric: isPrice ? 'price' : 'three_x_score' },
            };
          }
          next = { ...next, armed: false };
        } else {
          next = { ...next, armed: true };
        }
        break;
      }

      case 'score_change': {
        const snaps = input.snapshots[ticker];
        if (!snaps || snaps.length < 2) break;
        const [latest, previous] = snaps;
        if (latest.model_version !== previous.model_version) break;
        if (latest.id === prev.last_snapshot_id) break;
        const delta = latest.three_x_score - previous.three_x_score;
        if (Math.abs(delta) < rule.threshold || delta === 0) break;
        const dir = delta > 0 ? 'rose' : 'fell';
        const pts = Math.abs(delta);
        event = {
          alert_id: rule.id,
          ticker,
          kind: rule.kind,
          message: `${ticker} 3x score ${dir} ${fmtNum(pts)} point${pts === 1 ? '' : 's'} to ${fmtNum(latest.three_x_score)} (model ${latest.model_version})`,
          payload: {
            delta,
            from: previous.three_x_score,
            to: latest.three_x_score,
            model_version: latest.model_version,
            snapshot_id: latest.id,
            previous_snapshot_id: previous.id,
          },
        };
        next = { ...next, last_snapshot_id: latest.id };
        break;
      }

      case 'catalyst_within': {
        if (nowDay === null) break;
        const fired = new Set(prev.fired_catalyst_ids ?? []);
        const due = input.catalysts
          .filter((c) => c.ticker === ticker && !fired.has(c.id))
          .map((c) => ({ c, d: dayIndex(c.event_date) }))
          .filter((x): x is { c: AlertCatalystInput; d: number } => x.d !== null)
          .map((x) => ({ c: x.c, days: x.d - nowDay }))
          .filter((x) => x.days >= 0 && x.days <= rule.threshold)
          .sort((a, b) => a.days - b.days || a.c.id.localeCompare(b.c.id));
        if (!due.length) break;
        for (const { c, days } of due) {
          const when = days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
          catalystEvents.push({
            alert_id: rule.id,
            ticker,
            kind: rule.kind,
            message: `${ticker} catalyst ${when}: ${c.title} (${c.event_date.slice(0, 10)})`,
            payload: { catalyst_id: c.id, title: c.title, event_date: c.event_date, days_until: days },
          });
        }
        const ids = [...(prev.fired_catalyst_ids ?? []), ...due.map((x) => x.c.id)];
        next = { ...next, fired_catalyst_ids: ids.slice(-FIRED_CATALYST_CAP) };
        break;
      }
    }

    if (event) events.push(event);
    events.push(...catalystEvents);
    const triggered = event !== null || catalystEvents.length > 0;
    if (triggered || !sameState(prev, next)) {
      updates.push({ id: rule.id, last_state: next, triggered });
    }
  }

  return { events, updates };
}
