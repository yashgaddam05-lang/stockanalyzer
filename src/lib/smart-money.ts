/**
 * Smart Money: specialist healthcare fund ownership (SEC 13F) and C-suite insider buying.
 *
 * Research (Verdad Capital, 2026 biotech paper) finds biotech stocks most owned by specialist
 * funds beat the least-owned by about 20 points a year. Index holders carry no signal, so only
 * a fixed list of specialist managers counts (smart_money_managers, refresh-smart-money).
 *
 * Pure, no I/O. Imported by api/ (Node ESM), so relative imports only.
 */

/** 13F reports are due 45 days after quarter end. */
export const THIRTEEN_F_LAG_DAYS = 45;

/** C-suite officer titles: chief officers (CEO, CFO, COO, CMO, CSO...), president, executive chair.
 *  Keep in sync with CSUITE in supabase/functions/refresh-smart-money and scripts/smart-money. */
export const CSUITE = /\bchief\b|\bc[a-z]o\b|president|exec(utive)? chair/i;

/** Smaller purchases are mostly routine plan buys (e.g. monthly ESPP-style lots), not conviction. */
export const MIN_INSIDER_BUY_USD = 25_000;

export type HolderChange = 'new' | 'added' | 'trimmed' | 'held' | 'exited';

export interface SmartMoneyHolder {
  id: string;
  name: string;
  shares: number;
  /** null when the manager has no earlier report to compare with */
  prev_shares: number | null;
  change: HolderChange;
}

export interface InsiderBuy {
  owner_name: string;
  owner_relationship: string | null;
  transaction_date: string | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  filing_url: string | null;
}

export interface SmartMoneyResponse {
  ticker: string;
  available: boolean;
  /** Quarter-end date of the latest 13F holdings used */
  period: string | null;
  holders: number;
  holders_prev: number;
  new_holders: number;
  exited_holders: number;
  added: number;
  trimmed: number;
  holder_detail: SmartMoneyHolder[];
  /** Specialist managers tracked */
  managers_tracked: number;
  csuite_buys: InsiderBuy[];
  csuite_buy_value: number;
  insider_window_days: number;
  updated_at: string | null;
}

const HEALTH_SECTORS = new Set(['health care', 'healthcare', 'biotech', 'biotechnology', 'pharmaceuticals', 'medical devices']);

/** Specialist healthcare funds only cover health care; elsewhere zero holders means nothing. */
export function isHealthcareSector(sector: string | null | undefined): boolean {
  return !!sector && HEALTH_SECTORS.has(sector.trim().toLowerCase());
}

/** Date the 13F holdings for a quarter end were due (quarter end + 45 days). */
export function thirteenFDueDate(period: string): string {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + THIRTEEN_F_LAG_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Quarter label for a 13F period end, e.g. 2026-06-30 -> "Q2 2026". */
export function quarterLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}
