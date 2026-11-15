// Shared loader for public/data/allocations.json (the V01-V08 mixes and monthly return series).
import type { BotId } from '@/lib/bots';

export interface MiniStats { cagr: number; totalReturn: number; maxDrawdown: number }
export interface LadderRow {
  id: string;
  name: string;
  stocks: number;
  bonds: number;
  cash: number;
  summary: MiniStats;
  benchmark: MiniStats;
  curve: { d: string; v: number }[];
  monthly: number[];
  benchmarkMonthly: number[];
}
export interface AllocationsData {
  start: string;
  end: string;
  months: number;
  sleeve: string;
  ladder: LadderRow[];
  bots: { id: BotId; summary: MiniStats; monthly: number[] }[];
  spy: { summary: MiniStats; monthly: number[] };
}

let cache: Promise<AllocationsData> | null = null;
export const loadAllocations = () => {
  cache ??= fetch('/data/allocations.json').then((r) => {
    if (!r.ok) throw new Error('unavailable');
    return r.json() as Promise<AllocationsData>;
  });
  cache.catch(() => (cache = null));
  return cache;
};
