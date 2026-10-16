/**
 * Synthetic self-check for evaluateAlerts. Pure; throws on the first failed assertion.
 * Run: compile with tsc (nodenext) and call runSelfCheck().
 */
import { evaluateAlerts } from './index.js';
import type { AlertRuleInput, AlertSnapshotInput, EvaluateAlertsInput, RuleState } from './index.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`alerts selfcheck failed: ${msg}`);
}

const NOW = '2026-10-16T14:00:00Z';

function run(rule: AlertRuleInput, over: Partial<EvaluateAlertsInput>) {
  return evaluateAlerts({ rules: [rule], stocks: {}, snapshots: {}, catalysts: [], now: NOW, ...over });
}

export function runSelfCheck(): string[] {
  const passed: string[] = [];

  // price_above: fire once, stay quiet while above, re-fire after dip + recross
  {
    let state: RuleState = {};
    const rule = (): AlertRuleInput => ({
      id: 'r1', ticker: 'NVDA', kind: 'price_above', threshold: 100, is_active: true, last_state: state,
    });
    const step = (price: number) => {
      const r = run(rule(), { stocks: { NVDA: { current_price: price, three_x_score: 70 } } });
      const u = r.updates.find((x) => x.id === 'r1');
      if (u) state = u.last_state;
      return r.events.length;
    };
    assert(step(110) === 1, 'fires on first cross');
    assert(state.armed === false, 'disarmed after firing');
    assert(step(115) === 0, 'no refire while above');
    assert(step(90) === 0, 'no fire below');
    assert(state.armed === true, 're-armed below');
    assert(step(105) === 1, 'fires again on recross');
    passed.push('price_above edge-triggered');
  }

  // score_change: never across model versions
  {
    const snaps = (v1: string, v2: string): AlertSnapshotInput[] => [
      { id: 's2', three_x_score: 78, model_version: v1, captured_at: '2026-10-16T00:00:00Z' },
      { id: 's1', three_x_score: 60, model_version: v2, captured_at: '2026-10-15T00:00:00Z' },
    ];
    const rule: AlertRuleInput = {
      id: 'r2', ticker: 'NVDA', kind: 'score_change', threshold: 5, is_active: true, last_state: {},
    };
    const cross = run(rule, { snapshots: { NVDA: snaps('v2.1', 'v1') } });
    assert(cross.events.length === 0, 'no fire across model versions');
    const same = run(rule, { snapshots: { NVDA: snaps('v2.1', 'v2.1') } });
    assert(same.events.length === 1, 'fires within same version');
    assert(same.events[0].message === 'NVDA 3x score rose 18 points to 78 (model v2.1)', 'message format');
    const st = same.updates[0].last_state;
    assert(st.last_snapshot_id === 's2', 'stores snapshot id');
    const again = run({ ...rule, last_state: st }, { snapshots: { NVDA: snaps('v2.1', 'v2.1') } });
    assert(again.events.length === 0, 'no refire on same snapshot');
    const small = run({ ...rule, threshold: 20 }, { snapshots: { NVDA: snaps('v2.1', 'v2.1') } });
    assert(small.events.length === 0, 'below threshold');
    passed.push('score_change version-gated and deduped');
  }

  // catalyst_within: once per catalyst id, window bounds
  {
    const catalysts = [
      { id: 'c1', ticker: 'CRSP', title: 'PDUFA date', event_date: '2026-10-20' },
      { id: 'c2', ticker: 'CRSP', title: 'Past readout', event_date: '2026-10-10' },
      { id: 'c3', ticker: 'CRSP', title: 'Far conference', event_date: '2026-12-01' },
    ];
    const rule: AlertRuleInput = {
      id: 'r3', ticker: 'CRSP', kind: 'catalyst_within', threshold: 7, is_active: true, last_state: {},
    };
    const a = run(rule, { catalysts });
    assert(a.events.length === 1 && a.events[0].payload.catalyst_id === 'c1', 'only in-window catalyst');
    const b = run({ ...rule, last_state: a.updates[0].last_state }, { catalysts });
    assert(b.events.length === 0, 'fires once per catalyst');
    const many = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const c = run({ ...rule, last_state: { fired_catalyst_ids: many } }, { catalysts });
    assert((c.updates[0].last_state.fired_catalyst_ids ?? []).length === 50, 'cap at 50');
    passed.push('catalyst_within once per id');
  }

  // inactive rules / missing data
  {
    const r = run(
      { id: 'r4', ticker: 'ZZZ', kind: 'price_below', threshold: 10, is_active: true, last_state: {} },
      {},
    );
    assert(r.events.length === 0 && r.updates.length === 0, 'no data -> nothing');
    const i = run(
      { id: 'r5', ticker: 'NVDA', kind: 'price_below', threshold: 1000, is_active: false, last_state: {} },
      { stocks: { NVDA: { current_price: 10, three_x_score: 50 } } },
    );
    assert(i.events.length === 0 && i.updates.length === 0, 'inactive -> nothing');
    passed.push('inactive and missing data');
  }

  return passed;
}
