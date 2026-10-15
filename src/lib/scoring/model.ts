/**
 * 3x Opportunity Score — model v2 (8 dimensions).
 *
 * Pure, deterministic, no I/O. Portable to Node ESM (api/refresh.ts):
 * relative imports only, explicit .js extensions, type-only import of Stock.
 *
 * Missing inputs are never fabricated: a dimension with no usable inputs
 * returns score null and its weight is re-normalized across the rest.
 */
import type { Stock } from '../supabase.js';

export const MODEL_VERSION = 'v2.0';

export type DimensionKey =
  | 'growth'
  | 'valuation'
  | 'momentum'
  | 'quality'
  | 'catalyst'
  | 'position'
  | 'risk'
  | 'regime';

export interface DimensionDef {
  key: DimensionKey;
  label: string;
  weight: number;
  inputs: string[];
}

export const DIMENSIONS: ReadonlyArray<DimensionDef> = [
  { key: 'growth', label: 'Growth Potential', weight: 20, inputs: ['revenue_growth_yoy', 'earnings_growth_yoy', 'rd_ratio'] },
  { key: 'valuation', label: 'Valuation Upside', weight: 18, inputs: ['forward_pe', 'price_to_sales', 'peg_ratio', 'target_mean_price', 'current_price'] },
  { key: 'momentum', label: 'Momentum', weight: 15, inputs: ['momentum_score', 'current_price', 'fifty_two_week_high', 'fifty_two_week_low'] },
  { key: 'quality', label: 'Fundamental Quality', weight: 12, inputs: ['gross_margin', 'operating_margin', 'profit_margin', 'debt_to_equity', 'cash_runway_months'] },
  { key: 'catalyst', label: 'Catalyst Strength', weight: 12, inputs: ['pipeline_count', 'rd_ratio'] },
  { key: 'position', label: 'Market Position', weight: 10, inputs: ['market_cap', 'gross_margin', 'avg_volume'] },
  { key: 'risk', label: 'Risk & Volatility', weight: 8, inputs: ['volatility', 'beta'] },
  { key: 'regime', label: 'Market Regime Fit', weight: 5, inputs: [] },
];

export interface DimensionResult {
  key: DimensionKey;
  label: string;
  weight: number;
  /** 0-100, null when no usable inputs */
  score: number | null;
  available: boolean;
  drivers: string[];
}

export interface ScoreResult {
  /** 0-100 integer */
  total: number;
  dimensions: DimensionResult[];
  confidence: 'high' | 'medium' | 'low';
  /** Sum of weights (out of 100) for dimensions with data */
  availableWeight: number;
  modelVersion: string;
}

// ---------- helpers ----------

/** Finite number or null. Guards against null/undefined/NaN from the DB. */
export function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Linear map of x from [lo, hi] to [0, 100], clamped. lo > hi inverts. */
export function scale(x: number, lo: number, hi: number): number {
  if (lo === hi) return x >= hi ? 100 : 0;
  return clamp(((x - lo) / (hi - lo)) * 100);
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Position of current price within 52-week range, 0..1, or null. */
export function rangePosition(s: Stock): number | null {
  const hi = num(s.fifty_two_week_high);
  const lo = num(s.fifty_two_week_low);
  const px = num(s.current_price);
  if (hi === null || lo === null || px === null || hi <= lo) return null;
  return clamp((px - lo) / (hi - lo), 0, 1);
}

export function formatCap(mc: number): string {
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${Math.round(mc)}`;
}

type DimPartial = { score: number | null; drivers: string[] };

// ---------- dimensions ----------

function growth(s: Stock): DimPartial {
  const rev = num(s.revenue_growth_yoy);
  const earn = num(s.earnings_growth_yoy);
  const rd = num(s.rd_ratio);
  const drivers: string[] = [];
  const parts: { v: number; w: number }[] = [];
  if (rev !== null) {
    parts.push({ v: scale(rev, -20, 100), w: 0.6 });
    drivers.push(`Revenue growth ${pct(rev)} YoY${rev >= 50 ? ' — hyper-growth' : rev >= 20 ? ' — strong' : rev >= 0 ? ' — modest' : ' — contracting'}`);
  }
  if (earn !== null) {
    parts.push({ v: scale(earn, -50, 150), w: 0.4 });
    drivers.push(`Earnings growth ${pct(earn)} YoY${earn < 0 ? ' — declining or unprofitable' : ''}`);
  }
  if (!parts.length) return { score: null, drivers: ['No revenue or earnings growth data'] };
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  let score = parts.reduce((a, p) => a + p.v * p.w, 0) / wsum;
  if (rd !== null && rd > 0) {
    const bonus = scale(rd, 0, 40) * 0.1; // up to +10
    score += bonus;
    drivers.push(`R&D intensity ${pct(rd)} of revenue adds +${bonus.toFixed(0)} (reinvestment in future growth)`);
  }
  return { score: clamp(score), drivers };
}

function valuation(s: Stock): DimPartial {
  const comps: number[] = [];
  const drivers: string[] = [];
  const fpe = num(s.forward_pe);
  const ps = num(s.price_to_sales);
  const peg = num(s.peg_ratio);
  const target = num(s.target_mean_price);
  const px = num(s.current_price);
  const rev = num(s.revenue_growth_yoy);

  if (fpe !== null) {
    if (fpe > 0) {
      comps.push(scale(fpe, 80, 10));
      drivers.push(`Forward P/E ${r1(fpe)}${fpe <= 20 ? ' — inexpensive' : fpe <= 45 ? ' — growth premium' : ' — rich multiple'}`);
    } else {
      comps.push(15);
      drivers.push('Negative forward P/E — earnings not expected to be positive');
    }
  }
  if (ps !== null && ps > 0) {
    // Growth-adjusted P/S: a 3x grower deserves a higher sales multiple.
    const g = rev !== null ? Math.max(0, rev) : 0;
    const adj = ps / (1 + g / 100);
    const v = clamp(100 * (1 - Math.log10(Math.max(1, adj)) / Math.log10(40)));
    comps.push(v);
    drivers.push(`Price/Sales ${r1(ps)}${rev !== null ? ` (${r1(adj)} growth-adjusted)` : ''}`);
  }
  if (peg !== null && peg > 0) {
    comps.push(scale(peg, 3, 0.5));
    drivers.push(`PEG ${r1(peg)}${peg < 1 ? ' — growth priced cheaply' : peg > 2 ? ' — growth fully priced' : ''}`);
  }
  if (target !== null && px !== null && px > 0) {
    const up = (target / px - 1) * 100;
    comps.push(scale(up, -10, 60));
    drivers.push(`Analyst mean target implies ${up >= 0 ? '+' : ''}${pct(up, 0)} vs current price`);
  }
  const m = mean(comps);
  if (m === null) return { score: null, drivers: ['No valuation inputs (forward P/E, P/S, PEG, price target) available yet'] };
  return { score: m, drivers };
}

function momentum(s: Stock): DimPartial {
  const ms = num(s.momentum_score);
  const pos = rangePosition(s);
  const drivers: string[] = [];
  const parts: { v: number; w: number }[] = [];
  if (ms !== null) {
    parts.push({ v: clamp(ms), w: 0.7 });
    drivers.push(`Momentum score ${Math.round(ms)}/100${ms >= 75 ? ' — strong trend' : ms >= 50 ? ' — positive' : ' — weak'}`);
  }
  if (pos !== null) {
    parts.push({ v: pos * 100, w: 0.3 });
    drivers.push(`Trading at ${Math.round(pos * 100)}% of 52-week range`);
  }
  if (!parts.length) return { score: null, drivers: ['No momentum data'] };
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  return { score: parts.reduce((a, p) => a + p.v * p.w, 0) / wsum, drivers };
}

function quality(s: Stock): DimPartial {
  const drivers: string[] = [];
  const comps: number[] = [];
  const gm = num(s.gross_margin);
  const om = num(s.operating_margin);
  const nm = num(s.profit_margin);
  const margins: number[] = [];
  if (gm !== null) margins.push(scale(gm, 10, 80));
  if (om !== null) margins.push(scale(om, -30, 30));
  if (nm !== null) margins.push(scale(nm, -30, 25));
  const mm = mean(margins);
  if (mm !== null) {
    comps.push(mm);
    const bits = [
      gm !== null ? `gross ${pct(gm, 0)}` : null,
      om !== null ? `operating ${pct(om, 0)}` : null,
      nm !== null ? `net ${pct(nm, 0)}` : null,
    ].filter(Boolean);
    drivers.push(`Margins: ${bits.join(', ')}`);
  }
  const de = num(s.debt_to_equity);
  if (de !== null && de >= 0) {
    comps.push(scale(de, 2, 0));
    drivers.push(`Debt/equity ${de.toFixed(2)}${de < 0.3 ? ' — clean balance sheet' : de > 1 ? ' — leveraged' : ''}`);
  }
  const rw = num(s.cash_runway_months);
  if (rw !== null && rw > 0) {
    comps.push(scale(rw, 6, 60));
    drivers.push(`Cash runway ${Math.round(rw)} months${rw >= 60 ? ' — well funded' : rw < 24 ? ' — dilution risk' : ''}`);
  }
  const m = mean(comps);
  if (m === null) return { score: null, drivers: ['No margin, leverage or cash data'] };
  return { score: m, drivers };
}

function catalyst(s: Stock): DimPartial {
  const pc = num(s.pipeline_count);
  const rd = num(s.rd_ratio);
  const parts: { v: number; w: number }[] = [];
  const drivers: string[] = [];
  if (pc !== null) {
    parts.push({ v: scale(pc, 0, 8), w: 0.6 });
    drivers.push(`${Math.round(pc)} pipeline candidate${pc === 1 ? '' : 's'}`);
  }
  if (rd !== null) {
    parts.push({ v: scale(rd, 0, 40), w: 0.4 });
    drivers.push(`R&D ${pct(rd)} of revenue`);
  }
  if (!parts.length) return { score: null, drivers: ['No pipeline or R&D data'] };
  drivers.push('Proxy from pipeline count + R&D intensity until the catalyst calendar ships (no dated events yet)');
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  return { score: parts.reduce((a, p) => a + p.v * p.w, 0) / wsum, drivers };
}

function position(s: Stock): DimPartial {
  const comps: number[] = [];
  const drivers: string[] = [];
  const mc = num(s.market_cap);
  if (mc !== null && mc > 0) {
    const tier =
      mc >= 200e9 ? { v: 100, t: 'mega-cap' } :
      mc >= 10e9 ? { v: 80, t: 'large-cap' } :
      mc >= 2e9 ? { v: 60, t: 'mid-cap' } :
      mc >= 300e6 ? { v: 40, t: 'small-cap' } :
      { v: 20, t: 'micro-cap' };
    comps.push(tier.v);
    drivers.push(`${formatCap(mc)} ${tier.t} scale`);
  }
  const gm = num(s.gross_margin);
  if (gm !== null) {
    comps.push(scale(gm, 20, 80));
    drivers.push(`Gross margin ${pct(gm, 0)} as pricing-power indicator`);
  }
  const vol = num(s.avg_volume);
  if (vol !== null && vol > 0) {
    comps.push(clamp(((Math.log10(vol) - 5) / (Math.log10(2e7) - 5)) * 100));
    drivers.push(`Avg volume ${vol >= 1e6 ? `${(vol / 1e6).toFixed(1)}M` : `${Math.round(vol / 1e3)}K`} shares/day liquidity`);
  }
  const m = mean(comps);
  if (m === null) return { score: null, drivers: ['No market cap, margin or liquidity data'] };
  return { score: m, drivers };
}

function asymmetry(s: Stock): DimPartial {
  const v = num(s.volatility);
  const b = num(s.beta);
  const parts: { v: number; w: number }[] = [];
  const drivers: string[] = [];
  if (v !== null) {
    // More volatility = more room for a 3x move, but beyond ~90% it is mostly noise.
    const vs = v <= 90 ? scale(v, 15, 90) : clamp(100 - (v - 90) * 1.5, 40, 100);
    parts.push({ v: vs, w: 0.7 });
    drivers.push(`Volatility ${pct(v, 0)} — ${v > 90 ? 'extreme, upside diluted by noise' : v > 50 ? 'wide range of outcomes' : 'limited swing potential'}`);
  }
  if (b !== null) {
    parts.push({ v: scale(b, 0.5, 2.5), w: 0.3 });
    drivers.push(`Beta ${b.toFixed(2)}`);
  }
  if (!parts.length) return { score: null, drivers: ['No volatility or beta data'] };
  drivers.push('Opportunity view of asymmetry; see the separate risk score for downside');
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  return { score: parts.reduce((a, p) => a + p.v * p.w, 0) / wsum, drivers };
}

function regime(): DimPartial {
  return {
    score: null,
    drivers: ['Not scored: requires macro data (rates, sector rotation, growth vs value) from roadmap item 21; weight re-normalized'],
  };
}

const SCORERS: Record<DimensionKey, (s: Stock) => DimPartial> = {
  growth,
  valuation,
  momentum,
  quality,
  catalyst,
  position,
  risk: asymmetry,
  regime,
};

export function scoreStock(stock: Stock): ScoreResult {
  const dimensions: DimensionResult[] = DIMENSIONS.map((d) => {
    const { score, drivers } = SCORERS[d.key](stock);
    const sc = score === null ? null : Math.round(clamp(score));
    return { key: d.key, label: d.label, weight: d.weight, score: sc, available: sc !== null, drivers };
  });
  const avail = dimensions.filter((d) => d.available);
  const availableWeight = avail.reduce((a, d) => a + d.weight, 0);
  const total =
    availableWeight > 0
      ? Math.round(clamp(avail.reduce((a, d) => a + d.weight * (d.score as number), 0) / availableWeight))
      : 0;
  const confidence = availableWeight >= 85 ? 'high' : availableWeight >= 65 ? 'medium' : 'low';
  return { total, dimensions, confidence, availableWeight, modelVersion: MODEL_VERSION };
}

export function getDimension(score: ScoreResult, key: DimensionKey): DimensionResult | undefined {
  return score.dimensions.find((d) => d.key === key);
}
