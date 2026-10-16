/**
 * Market regime model (v2.1): macro snapshot + per-stock regime fit.
 *
 * Pure, deterministic, no I/O. Portable to Node ESM (api/*): relative imports
 * only, explicit .js extensions, type-only import of Stock.
 *
 * Inputs are daily closes for REGIME_SYMBOLS (fetched by the refresh-market
 * edge function). Only bars with d <= asOf are used, so a snapshot can be
 * rebuilt for any historical date without look-ahead.
 */
import type { Stock } from '../supabase.js';
import { MODEL_VERSION, clamp, mean, num, scale } from './model.js';

/** Symbols the refresh-market edge function fetches. Order is part of the contract. */
export const REGIME_SYMBOLS: readonly string[] = [
  '^VIX', '^TNX', 'SPY', 'QQQ', 'IWM',
  'XLK', 'XLV', 'XBI', 'XLF', 'XLE', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'SMH', 'IGV', 'ITA', 'ICLN', 'TAN', 'ARKK',
];

const NON_SECTOR = new Set(['^VIX', '^TNX', 'SPY']);

export type Bar = { d: string; close: number };
/** Ascending by d (YYYY-MM-DD). */
export type RegimeSeries = Record<string, Bar[]>;

export type RegimeLabel = 'risk_on' | 'neutral' | 'risk_off' | 'insufficient_data';

export interface SectorStrength {
  etf: string;
  /** Percent */
  return_63d: number | null;
  /** Percentage points vs SPY over the same window */
  relative_63d: number | null;
}

/** Structurally identical to MarketRegimeSnapshot (supabase.ts) minus created_at. */
export interface RegimeSnapshotInput {
  as_of: string;
  vix: number | null;
  /** 10y yield, percent */
  tnx: number | null;
  /** Percentage points */
  tnx_change_63d: number | null;
  spy_close: number | null;
  spy_above_200dma: boolean | null;
  /** Percent */
  spy_return_63d: number | null;
  /** 0-100, null when insufficient data */
  risk_appetite: number | null;
  regime_label: RegimeLabel;
  sector_strength: Record<string, SectorStrength>;
  drivers: string[];
  model_version: string;
}

const WINDOW = 63;
const MA_LEN = 200;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const signed = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;

/** Bars with d <= asOf and a finite positive close, ascending. */
function upTo(bars: Bar[] | undefined, asOf: string | undefined): Bar[] {
  if (!bars) return [];
  return bars
    .filter((b) => (asOf === undefined || b.d <= asOf) && typeof b.close === 'number' && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

function last(bars: Bar[]): number | null {
  return bars.length ? bars[bars.length - 1].close : null;
}

/** Percent return over the trailing n bars, or null without enough history. */
function ret(bars: Bar[], n = WINDOW): number | null {
  if (bars.length < n + 1) return null;
  const a = bars[bars.length - 1 - n].close;
  const b = bars[bars.length - 1].close;
  return (b / a - 1) * 100;
}

/** ^TNX is quoted as yield x10 on older Yahoo data; normalize to percent. */
function tnxPct(v: number): number {
  return v > 20 ? v / 10 : v;
}

export function computeRegimeSnapshot(series: RegimeSeries, asOf?: string): RegimeSnapshotInput {
  const spy = upTo(series['SPY'], asOf);
  const vixBars = upTo(series['^VIX'], asOf);
  const tnxBars = upTo(series['^TNX'], asOf).map((b) => ({ d: b.d, close: tnxPct(b.close) }));

  const latestDate = [spy, vixBars, tnxBars]
    .map((b) => (b.length ? b[b.length - 1].d : ''))
    .reduce((a, b) => (b > a ? b : a), '');
  const as_of = asOf ?? latestDate;

  const vix = last(vixBars);
  const tnx = last(tnxBars);
  const tnxPrev = tnxBars.length >= WINDOW + 1 ? tnxBars[tnxBars.length - 1 - WINDOW].close : null;
  const tnx_change_63d = tnx !== null && tnxPrev !== null ? r2(tnx - tnxPrev) : null;
  const spy_close = last(spy);
  const spyRet = ret(spy);
  const spy_return_63d = spyRet === null ? null : r2(spyRet);

  let ma200: number | null = null;
  if (spy.length >= MA_LEN) {
    ma200 = spy.slice(-MA_LEN).reduce((a, b) => a + b.close, 0) / MA_LEN;
  }
  const spy_above_200dma = spy_close !== null && ma200 !== null ? spy_close > ma200 : null;

  const sector_strength: Record<string, SectorStrength> = {};
  for (const sym of REGIME_SYMBOLS) {
    if (NON_SECTOR.has(sym)) continue;
    const bars = upTo(series[sym], asOf);
    if (!bars.length) continue;
    const r = ret(bars);
    sector_strength[sym] = {
      etf: sym,
      return_63d: r === null ? null : r2(r),
      relative_63d: r !== null && spyRet !== null ? r2(r - spyRet) : null,
    };
  }

  const base = {
    as_of,
    vix: vix === null ? null : r2(vix),
    tnx: tnx === null ? null : r2(tnx),
    tnx_change_63d,
    spy_close: spy_close === null ? null : r2(spy_close),
    spy_above_200dma,
    spy_return_63d,
    sector_strength,
    model_version: MODEL_VERSION,
  };

  if (spy.length < MA_LEN || vix === null || ma200 === null || spy_close === null) {
    const why: string[] = [];
    if (spy.length < MA_LEN) why.push(`SPY has ${spy.length} of ${MA_LEN} daily bars needed for the 200-day MA`);
    if (vix === null) why.push('VIX data missing');
    return { ...base, risk_appetite: null, regime_label: 'insufficient_data', drivers: [`Insufficient data: ${why.join('; ')}`] };
  }

  const parts: { v: number; w: number }[] = [];
  const drivers: string[] = [];

  parts.push({ v: scale(vix, 35, 12), w: 0.3 });
  drivers.push(`VIX ${r1(vix)}${vix < 15 ? ' — calm, risk-on' : vix < 20 ? ' — normal' : vix < 28 ? ' — elevated' : ' — fear, risk-off'}`);

  const maGap = (spy_close / ma200 - 1) * 100;
  parts.push({ v: scale(maGap, -10, 10), w: 0.2 });
  drivers.push(`SPY ${spy_close > ma200 ? 'above' : 'below'} its 200-day MA (${signed(maGap)}%)`);

  if (spyRet !== null) {
    parts.push({ v: scale(spyRet, -15, 15), w: 0.2 });
    drivers.push(`SPY ${signed(spyRet)}% over 3 months`);
  }

  const iwmRet = ret(upTo(series['IWM'], asOf));
  if (iwmRet !== null && spyRet !== null) {
    const rel = iwmRet - spyRet;
    parts.push({ v: scale(rel, -8, 8), w: 0.1 });
    drivers.push(`Small caps (IWM) ${signed(rel)} pts vs SPY over 3 months`);
  }
  const qqqRet = ret(upTo(series['QQQ'], asOf));
  if (qqqRet !== null && spyRet !== null) {
    const rel = qqqRet - spyRet;
    parts.push({ v: scale(rel, -8, 8), w: 0.1 });
    drivers.push(`Nasdaq-100 (QQQ) ${signed(rel)} pts vs SPY over 3 months`);
  }
  if (tnx !== null && tnx_change_63d !== null) {
    parts.push({ v: scale(tnx_change_63d, 0.75, -0.75), w: 0.1 });
    drivers.push(
      `10-year yield ${tnx.toFixed(2)}% (${signed(tnx_change_63d, 2)} pts over 3 months)${tnx_change_63d < 0 ? ' — falling rates support long-duration growth' : tnx_change_63d > 0.25 ? ' — rising rates pressure long-duration growth' : ''}`,
    );
  }

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const risk_appetite = Math.round(clamp(parts.reduce((a, p) => a + p.v * p.w, 0) / wsum));
  const regime_label: RegimeLabel = risk_appetite >= 60 ? 'risk_on' : risk_appetite <= 40 ? 'risk_off' : 'neutral';
  drivers.unshift(`Risk appetite ${risk_appetite}/100 — ${regime_label.replace('_', '-')} regime`);

  return { ...base, risk_appetite, regime_label, drivers };
}

// ---------- sector mapping ----------

const SECTOR_RULES: ReadonlyArray<[RegExp, string]> = [
  [/biotech/, 'XBI'],
  [/semiconductor/, 'SMH'],
  [/solar/, 'TAN'],
  [/clean energy|renewable/, 'ICLN'],
  [/aerospace|defen[cs]e|\bspace\b/, 'ITA'],
  [/quantum/, 'XLK'],
  [/fintech|credit services|financial|bank|insurance|capital markets/, 'XLF'],
  [/edtech|education|consumer|restaurant|auto manufacturer|retail|leisure/, 'XLY'],
  [/discount stores|grocery|household|beverage|staples/, 'XLP'],
  [/health|drug manufacturer|pharma|medical/, 'XLV'],
  [/software/, 'IGV'],
  [/communication|internet content|telecom|entertainment|media/, 'XLC'],
  [/computer hardware|information technology|\btech\b|technology/, 'XLK'],
  [/energy|oil|gas/, 'XLE'],
  [/industrial|machinery|electrical equipment/, 'XLI'],
  [/utilit/, 'XLU'],
  [/real estate|reit/, 'XLRE'],
  [/materials|chemical|mining/, 'XLB'],
];

function matchSector(s: string): string | null {
  const t = s.toLowerCase();
  for (const [re, etf] of SECTOR_RULES) if (re.test(t)) return etf;
  return null;
}

/** Maps the messy sector / industry strings in the DB to a benchmark ETF. */
export function sectorEtfFor(sector: string, industry?: string | null): string | null {
  return matchSector(sector ?? '') ?? (industry ? matchSector(industry) : null);
}

// ---------- per-stock fit ----------

/**
 * 0-100 regime fit. 60% sector relative strength (mapped ETF vs SPY, 63d),
 * 40% style fit (aggressive names favored when risk appetite is high,
 * defensive names when it is low). Null when the snapshot is unusable.
 */
export function regimeFitForStock(
  stock: Stock & { regime_fit_score?: number | null },
  snap: RegimeSnapshotInput | null,
): { score: number | null; drivers: string[] } {
  if (!snap || snap.regime_label === 'insufficient_data' || snap.risk_appetite === null) {
    return { score: null, drivers: ['Not scored yet: waiting for market regime data from the daily refresh'] };
  }
  const ra = snap.risk_appetite;
  const parts: { v: number; w: number }[] = [];
  const drivers: string[] = [];

  const etf = sectorEtfFor(stock.sector, stock.industry);
  const rel = etf ? num(snap.sector_strength[etf]?.relative_63d) : null;
  if (etf && rel !== null) {
    parts.push({ v: scale(rel, -10, 10), w: 0.6 });
    drivers.push(`Sector ETF ${etf} ${signed(rel)}% vs SPY over 3 months`);
  } else if (etf) {
    drivers.push(`Sector ETF ${etf} has no 3-month relative strength data`);
  } else {
    drivers.push(`No sector ETF mapped for "${stock.sector}"`);
  }

  const beta = num(stock.beta);
  const rev = num(stock.revenue_growth_yoy);
  const nm = num(stock.profit_margin);
  const earn = num(stock.earnings_growth_yoy);
  const vol = num(stock.volatility);
  const style: number[] = [];
  if (beta !== null) style.push(scale(beta, 0.6, 2.0));
  if (rev !== null) style.push(scale(rev, 0, 50));
  if (nm !== null) style.push(scale(nm, 15, -10));
  else if (earn !== null) style.push(earn < 0 ? 75 : 35);
  if (vol !== null) style.push(scale(vol, 20, 70));
  const aggr = mean(style);
  if (aggr !== null) {
    // Neutral (50) at risk_appetite 50; full swing when both are at extremes.
    const fit = clamp(50 + ((aggr - 50) / 50) * ((ra - 50) / 50) * 50);
    parts.push({ v: fit, w: 0.4 });
    const profile = aggr >= 60 ? 'high-beta growth' : aggr <= 40 ? 'defensive / low-beta' : 'balanced';
    const ctx = `VIX ${snap.vix !== null ? r1(snap.vix) : 'n/a'}, SPY ${snap.spy_above_200dma ? 'above' : 'below'} 200-day MA`;
    const regimeName = snap.regime_label === 'risk_on' ? 'Risk-on' : snap.regime_label === 'risk_off' ? 'Risk-off' : 'Neutral';
    const verdict =
      profile === 'balanced' || snap.regime_label === 'neutral'
        ? `is roughly neutral for a ${profile} profile`
        : (profile === 'high-beta growth') === (snap.regime_label === 'risk_on')
          ? `favors ${profile}`
          : `is a headwind for ${profile}`;
    drivers.push(`${regimeName} regime (${ctx}) ${verdict}`);
  } else {
    drivers.push('No beta, growth, profitability or volatility data for style fit');
  }

  if (!parts.length) return { score: null, drivers };
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  return { score: Math.round(clamp(parts.reduce((a, p) => a + p.v * p.w, 0) / wsum)), drivers };
}
