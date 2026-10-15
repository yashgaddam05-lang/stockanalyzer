/**
 * Self-check for the 3x scenario engine. Pure — no I/O.
 *
 * Worked examples (expected values):
 *
 *   1. Scope example — $500M cap, price $10, target 3x, 36 months, no dilution:
 *        requiredMarketCap = 1.5e9, requiredPrice = 30
 *        requiredPriceCagrPct = 3^(1/3) - 1 = 44.22%  -> 'cagr_warn' flag
 *        revenue null -> revenue-derived fields null, confidence 'low'
 *
 *   2. Same, 5% dilution/yr for 3 years:
 *        shareFactor = 1.05^3 = 1.157625 -> requiredMarketCap = 1.736e9,
 *        netShareChangePct = 15.76
 *
 *   3. NVDA defaults (seed: cap $2.3T, price 935, P/S 25, margin 53%,
 *      growth 206% clamped to 80%), 3x / 36 months:
 *        revenue 9.2e10, requiredMarketCap 6.9e12 (-> market_cap_high)
 *        requiredRevenueAtConstantMultiple 2.76e11, requiredRevenueCagrPct 44.22
 *        projected revenue 5.365e11 (1.8^3 = 5.832x), price multiple 5.832, hitsTarget
 *        impliedFuturePriceToSales 12.86, impliedFuturePE 24.27 (margin 53%)
 *        flags: cagr_warn, margin_warn, market_cap_high -> confidence 'medium'
 *
 *   4. CRSP defaults (seed: cap $4.2B, price 52.1, P/S 90, no margin,
 *      growth 287.5% clamped to 80%), 3x / 36 months:
 *        revenue 4.667e7, requiredMarketCap 1.26e10
 *        projected price multiple 5.832, impliedFuturePriceToSales 46.30 (-> implied_ps_high)
 *        margin missing -> earnings / P/E null, confidence 'low'
 *
 * Run: compile with tsc (nodenext) and call runSelfCheck(); it returns a list
 * of failures (empty = pass).
 */
import { FIXTURES } from '../scoring/selfcheck.js';
import {
  computeScenario,
  buildScenarioSet,
  sensitivityTable,
  defaultInputsFromStock,
} from './calculator.js';
import type { ScenarioInputs, ScenarioResult } from './calculator.js';

export const SCOPE_EXAMPLE: ScenarioInputs = {
  currentPrice: 10,
  currentMarketCap: 500_000_000,
  currentRevenue: null,
  currentNetMarginPct: null,
  targetMultiple: 3,
  horizonMonths: 36,
  revenueGrowthPct: 0,
  marginChangePts: 0,
  multipleChangePct: 0,
  dilutionPctPerYear: 0,
  buybackPctPerYear: 0,
};

/** Walk any value and collect paths of numbers that are NaN/Infinity. */
function nonFinitePaths(v: unknown, path = '$', out: string[] = []): string[] {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(path);
  } else if (Array.isArray(v)) {
    v.forEach((x, idx) => nonFinitePaths(x, `${path}[${idx}]`, out));
  } else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) nonFinitePaths(x, `${path}.${k}`, out);
  }
  return out;
}

function near(a: number | null, b: number, tol = 0.01): boolean {
  return a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

export function runSelfCheck(): string[] {
  const fail: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) fail.push(msg);
  };
  const finite = (name: string, r: unknown) => {
    const bad = nonFinitePaths(r);
    check(bad.length === 0, `${name}: non-finite values at ${bad.join(', ')}`);
  };

  // 1. Scope example
  const s = computeScenario(SCOPE_EXAMPLE);
  finite('scope', s);
  check(near(s.requiredMarketCap, 1.5e9, 1e-9), `scope requiredMarketCap ${s.requiredMarketCap} != 1.5e9`);
  check(near(s.requiredPrice, 30, 1e-9), `scope requiredPrice ${s.requiredPrice} != 30`);
  check(near(s.requiredPriceCagrPct, 44.22, 1e-3), `scope CAGR ${s.requiredPriceCagrPct} != 44.22`);
  check(s.flags.some((f) => f.id === 'cagr_warn' && f.severity === 'warn'), 'scope missing cagr_warn flag');
  check(s.confidence === 'low', `scope confidence ${s.confidence} != low`);
  const revFields: (keyof ScenarioResult)[] = [
    'requiredRevenueAtConstantMultiple',
    'requiredRevenueCagrPct',
    'requiredEarningsAtCurrentPE',
    'impliedFuturePriceToSales',
    'impliedFuturePE',
  ];
  for (const k of revFields) check(s[k] === null, `scope ${k} should be null`);
  check(
    s.projected.revenue === null && s.projected.marketCap === null && s.projected.price === null,
    'scope projected revenue-derived fields should be null',
  );

  // 2. Dilution
  const d = computeScenario({ ...SCOPE_EXAMPLE, dilutionPctPerYear: 5 });
  finite('dilution', d);
  check(near(d.requiredMarketCap, 1.5e9 * 1.157625, 1e-9), `dilution requiredMarketCap ${d.requiredMarketCap}`);
  check(near(d.netShareChangePct, 15.7625, 1e-6), `dilution netShareChangePct ${d.netShareChangePct}`);

  // 3. NVDA
  const nvda = FIXTURES.find((f) => f.ticker === 'NVDA');
  if (nvda) {
    const r = computeScenario(defaultInputsFromStock(nvda));
    finite('NVDA', r);
    check(near(r.requiredMarketCap, 6.9e12), `NVDA requiredMarketCap ${r.requiredMarketCap}`);
    check(near(r.requiredRevenueAtConstantMultiple, 2.76e11), `NVDA reqRev ${r.requiredRevenueAtConstantMultiple}`);
    check(near(r.requiredRevenueCagrPct, 44.22), `NVDA reqRevCagr ${r.requiredRevenueCagrPct}`);
    check(near(r.projected.priceMultiple, 5.832), `NVDA priceMultiple ${r.projected.priceMultiple}`);
    check(r.projected.hitsTarget, 'NVDA should hit target');
    check(near(r.impliedFuturePriceToSales, 12.86), `NVDA impliedPS ${r.impliedFuturePriceToSales}`);
    check(near(r.impliedFuturePE, 24.27), `NVDA impliedPE ${r.impliedFuturePE}`);
    check(r.flags.some((f) => f.id === 'market_cap_high'), 'NVDA missing market_cap_high');
    check(r.flags.some((f) => f.id === 'margin_warn'), 'NVDA missing margin_warn');
    check(r.confidence === 'medium', `NVDA confidence ${r.confidence}`);
    check(r.keyAssumptions.length > 0, 'NVDA keyAssumptions empty');
  } else fail.push('NVDA fixture missing');

  // 4. CRSP
  const crsp = FIXTURES.find((f) => f.ticker === 'CRSP');
  if (crsp) {
    const r = computeScenario(defaultInputsFromStock(crsp));
    finite('CRSP', r);
    check(near(r.requiredMarketCap, 1.26e10), `CRSP requiredMarketCap ${r.requiredMarketCap}`);
    check(near(r.projected.priceMultiple, 5.832), `CRSP priceMultiple ${r.projected.priceMultiple}`);
    check(near(r.impliedFuturePriceToSales, 46.3), `CRSP impliedPS ${r.impliedFuturePriceToSales}`);
    check(r.flags.some((f) => f.id === 'implied_ps_high'), 'CRSP missing implied_ps_high');
    check(r.impliedFuturePE === null && r.projected.earnings === null, 'CRSP earnings fields should be null');
    check(r.confidence === 'low', `CRSP confidence ${r.confidence}`);
  } else fail.push('CRSP fixture missing');

  // Scenario set ordering + sensitivity dimensions
  if (nvda) {
    const set = buildScenarioSet(defaultInputsFromStock(nvda));
    finite('set', set);
    const [b, m, u] = [set.bear, set.base, set.bull].map((x) => x.projected.priceMultiple ?? 0);
    check(b < m && m < u, `scenario set not ordered: ${b} ${m} ${u}`);
    const t = sensitivityTable(defaultInputsFromStock(nvda));
    finite('sensitivity', t);
    check(
      t.cells.length === t.rows.length && t.cells.every((row) => row.length === t.cols.length),
      'sensitivity cells dimension mismatch',
    );
    const t2 = sensitivityTable(SCOPE_EXAMPLE, { growthSteps: [0, 10, 20], multipleSteps: [-10, 0] });
    check(t2.cells.length === 3 && t2.cells.every((row) => row.length === 2), 'custom sensitivity dims');
    check(t2.cells.every((row) => row.every((c) => c === null)), 'sensitivity without revenue should be null');
  }

  // Degenerate inputs never produce NaN/Infinity
  const junk = computeScenario({
    ...SCOPE_EXAMPLE,
    currentPrice: 0,
    currentMarketCap: -5,
    currentRevenue: 0,
    currentNetMarginPct: Number.NaN,
    targetMultiple: Number.POSITIVE_INFINITY,
    horizonMonths: 0,
    revenueGrowthPct: -500,
    multipleChangePct: -500,
    buybackPctPerYear: 200,
  });
  finite('junk', junk);
  check(junk.confidence === 'low', 'junk confidence should be low');
  check(near(computeScenario({ ...SCOPE_EXAMPLE, horizonMonths: 12 }).requiredPriceCagrPct, 200, 1e-6), '12m 3x CAGR != 200');
  check(
    computeScenario({ ...SCOPE_EXAMPLE, horizonMonths: 12 }).flags.some((f) => f.id === 'short_horizon_big_target'),
    'missing short_horizon_big_target',
  );

  return fail;
}
