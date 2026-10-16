/**
 * Synthetic self-check for valuePortfolio. Pure; throws on the first failed assertion.
 * Run: compile with tsc (nodenext) and call runSelfCheck().
 */
import { valuePortfolio } from './index.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`portfolio selfcheck failed: ${msg}`);
}

export function runSelfCheck(): string[] {
  const passed: string[] = [];

  // 10 @ 100 cost, price 150; 5 @ 50 cost, price null
  const r = valuePortfolio(
    [
      { id: 'p1', ticker: 'NVDA', shares: 10, cost_basis: 100 },
      { id: 'p2', ticker: 'RGTI', shares: 5, cost_basis: 50 },
    ],
    {
      NVDA: { current_price: 150, sector: 'Technology', risk_level: 'low', risk_score: 20, three_x_score: 75 },
      RGTI: { current_price: null, sector: 'Technology' },
    },
  );
  const nvda = r.positions.find((p) => p.ticker === 'NVDA');
  const rgti = r.positions.find((p) => p.ticker === 'RGTI');
  assert(nvda?.market_value === 1500, 'NVDA market_value 1500');
  assert(nvda?.unrealized_pl === 500, 'NVDA unrealized_pl 500');
  assert(nvda?.unrealized_pl_pct === 0.5, 'NVDA unrealized_pl_pct 0.5');
  assert(nvda?.weight === 1, 'NVDA weight 1 over priced value');
  assert(rgti?.market_value === null && rgti.price === null && rgti.weight === null, 'RGTI unpriced');
  assert(rgti?.cost_value === 250, 'RGTI cost_value 250');
  assert(r.totals.unpriced_tickers.length === 1 && r.totals.unpriced_tickers[0] === 'RGTI', 'unpriced list');
  assert(r.totals.market_value === 1500 && r.totals.cost_value === 1250, 'totals');
  assert(r.totals.priced_positions === 1, 'priced_positions');
  assert(r.flags.some((f) => f.includes('RGTI')), 'unpriced flag');
  assert(r.flags.some((f) => f.startsWith('NVDA')), 'position concentration flag');
  assert(r.flags.some((f) => f.startsWith('Technology')), 'sector concentration flag');
  assert(r.risk_exposure.weighted_risk_score === 20, 'weighted risk');
  assert(r.concentration.hhi === 1, 'hhi');
  passed.push('two-position mixed priced/unpriced');

  // Diversified: 4 equal positions across 3 sectors, one unknown sector
  const d = valuePortfolio(
    [
      { id: 'a', ticker: 'A', shares: 1, cost_basis: 100 },
      { id: 'b', ticker: 'B', shares: 1, cost_basis: 100 },
      { id: 'c', ticker: 'C', shares: 1, cost_basis: 100 },
      { id: 'e', ticker: 'E', shares: 1, cost_basis: 100 },
    ],
    {
      A: { current_price: 100, sector: 'Tech', risk_score: 40, risk_level: 'medium' },
      B: { current_price: 100, sector: 'Health', risk_score: 60, risk_level: 'high' },
      C: { current_price: 100, sector: 'Energy' },
      E: { current_price: 100, sector: null },
    },
  );
  assert(d.flags.length === 0, 'no flags at 25% each');
  assert(d.sector_exposure.some((s) => s.sector === 'Unclassified' && s.weight === 0.25), 'Unclassified sector');
  assert(d.concentration.hhi === 0.25, 'hhi 0.25');
  assert(d.risk_exposure.weighted_risk_score === 50, 'weighted risk over known only');
  assert(d.risk_exposure.by_level.some((l) => l.level === 'unknown' && l.weight === 0.5), 'unknown risk level');
  passed.push('diversified, unclassified sector');

  // Empty
  const e = valuePortfolio([], {});
  assert(e.totals.market_value === 0 && e.concentration.hhi === null && e.flags.length === 0, 'empty');
  passed.push('empty portfolio');

  return passed;
}
