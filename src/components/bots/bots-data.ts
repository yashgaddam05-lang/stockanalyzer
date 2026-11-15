// Shared loader for public/data/bots.json (bot history, stats and projections).
import type { BotId } from '@/lib/bots';

export interface Stats { totalReturn: number; cagr: number; volatility: number; maxDrawdown: number; endValue: number; yearly: Record<string, number> }
export interface Proj { low: number; mid: number; high: number; lossOdds: number }
export interface BotsData {
  start: string;
  end: string;
  haircutPct: number;
  indexCoverage: { avg: number; first: number; last: number };
  spy: { summary: Stats; curve: { d: string; v: number }[]; projection: { y5: Proj; y10: Proj } };
  bots: { id: BotId; summary: Stats; curve: { d: string; v: number }[]; beatRate: number; avgHoldings: number; projection: { y5: Proj; y10: Proj } }[];
}

let cache: Promise<BotsData> | null = null;
export const loadBots = () => {
  cache ??= fetch('/data/bots.json').then((r) => {
    if (!r.ok) throw new Error('unavailable');
    return r.json() as Promise<BotsData>;
  });
  cache.catch(() => (cache = null));
  return cache;
};


export const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
export const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
export const year = (d: string) => d.slice(0, 4);
export const SPY_COLOR = '#d97706';
