/**
 * Independent 0-100 risk score (higher = riskier). Not the inverse of the
 * opportunity score: a stock can be high-opportunity and high-risk at once.
 */
import type { Stock } from '../supabase.js';
import { clamp, formatCap, num, rangePosition, scale } from './model.js';

export type RiskLabel = 'low' | 'medium' | 'high' | 'extreme';

export interface RiskResult {
  /** 0-100 integer, higher = riskier */
  score: number;
  label: RiskLabel;
  drivers: string[];
  invalidationSignals: string[];
}

export function riskLabelFor(score: number): RiskLabel {
  if (score < 30) return 'low';
  if (score < 55) return 'medium';
  if (score < 75) return 'high';
  return 'extreme';
}

export function computeRiskScore(stock: Stock): RiskResult {
  const parts: { v: number; w: number }[] = [];
  const drivers: string[] = [];

  const vol = num(stock.volatility);
  if (vol !== null) {
    const v = scale(vol, 15, 100);
    parts.push({ v, w: 0.3 });
    if (v >= 50) drivers.push(`Annualized volatility ${Math.round(vol)}% — large drawdowns are common`);
  }
  const beta = num(stock.beta);
  if (beta !== null) {
    const v = scale(beta, 0.5, 3);
    parts.push({ v, w: 0.15 });
    if (beta >= 1.8) drivers.push(`Beta ${beta.toFixed(2)} — amplifies broad market moves`);
  }
  const de = num(stock.debt_to_equity);
  if (de !== null && de >= 0) {
    const v = scale(de, 0, 2);
    parts.push({ v, w: 0.15 });
    if (de >= 0.8) drivers.push(`Debt/equity ${de.toFixed(2)} — leverage raises refinancing risk`);
  }
  const rw = num(stock.cash_runway_months);
  if (rw !== null && rw > 0) {
    const v = scale(rw, 60, 12);
    parts.push({ v, w: 0.15 });
    if (rw < 24) drivers.push(`Cash runway ${Math.round(rw)} months — likely needs new capital (dilution)`);
  }
  const mc = num(stock.market_cap);
  if (mc !== null && mc > 0) {
    // log scale: $200B+ -> 0, $100M or less -> 100
    const v = clamp(((Math.log10(200e9) - Math.log10(mc)) / (Math.log10(200e9) - Math.log10(100e6))) * 100);
    parts.push({ v, w: 0.15 });
    if (mc < 2e9) drivers.push(`${formatCap(mc)} market cap — small companies carry higher business and liquidity risk`);
  }
  const nm = num(stock.profit_margin);
  const eg = num(stock.earnings_growth_yoy);
  if (nm !== null) {
    const v = scale(nm, 20, -50);
    parts.push({ v, w: 0.1 });
    if (nm < 0) drivers.push(`Net margin ${Math.round(nm)}% — not yet profitable`);
  } else if (eg !== null) {
    parts.push({ v: eg < 0 ? 70 : 30, w: 0.1 });
    if (eg < 0) drivers.push('Earnings declining or negative');
  }

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = wsum > 0 ? Math.round(clamp(parts.reduce((a, p) => a + p.v * p.w, 0) / wsum)) : 50;
  if (wsum === 0) drivers.push('No risk inputs available; defaulting to neutral 50');
  if (!drivers.length) drivers.push('No individual risk factor stands out');

  return { score, label: riskLabelFor(score), drivers, invalidationSignals: invalidationSignals(stock) };
}

/** Observable conditions that would weaken the opportunity thesis. */
function invalidationSignals(s: Stock): string[] {
  const out: string[] = [];
  const rev = num(s.revenue_growth_yoy);
  if (rev !== null) {
    out.push(
      rev > 20
        ? `Revenue growth decelerates below 20% YoY (currently ${rev.toFixed(0)}%)`
        : `Revenue growth stays at or below ${Math.max(0, Math.round(rev))}% YoY`,
    );
  }
  const ms = num(s.momentum_score);
  if (ms !== null && ms >= 40) out.push(`Momentum score falls below 40 (currently ${Math.round(ms)})`);
  const lo = num(s.fifty_two_week_low);
  if (lo !== null && rangePosition(s) !== null) out.push(`Price breaks below the 52-week low of $${lo.toFixed(2)}`);
  const rw = num(s.cash_runway_months);
  if (rw !== null && rw > 0 && rw < 120) out.push(`Cash runway drops under 12 months or a large equity raise is announced`);
  const de = num(s.debt_to_equity);
  if (de !== null && de > 0.5) out.push(`Debt/equity rises above ${Math.max(1, Math.ceil(de * 1.5 * 10) / 10).toFixed(1)}`);
  const om = num(s.operating_margin);
  if (om !== null && om > 0) out.push(`Operating margin turns negative (currently ${Math.round(om)}%)`);
  const pc = num(s.pipeline_count);
  if (pc !== null && pc > 0) out.push('A lead pipeline program fails or is delayed');
  return out;
}
