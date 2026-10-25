/**
 * Catalyst Edge — expected value and win probability per dated catalyst.
 *
 * Pure, deterministic, no I/O. Same portability rules as model.ts.
 *
 * For each event:
 *   pGood  = probability the stock has a meaningful positive reaction
 *            (base rate for the event type, adjusted by the stock's own data)
 *   upMove / downMove = typical % reaction if it goes well / badly, scaled by
 *            company size, volatility and (for binary biotech events) asset concentration
 *   ev     = pGood * upMove - (1 - pGood) * downMove   (% expected move)
 *
 * Base rates (reference large-cap, size multiplier 1.0):
 *   earnings    ~53% positive reaction; ~75% beat EPS but beats are mostly priced in.
 *               Avg absolute move ~5%, misses hit slightly harder than beats lift.
 *   regulatory  ~70% good: ~85-90% of PDUFA dates end in approval, haircut for sell-the-news.
 *               Rejection (CRL) moves are 2x approval moves.
 *   clinical    Phase 1 ~60%, Phase 2 ~40%, Phase 3 ~58% positive readouts
 *               (BIO/Informa 2011-2020 phase transition rates, adjusted for topline-positive framing).
 *   product, conference, corporate, other: small, near-symmetric moves.
 * These are estimates, not guarantees.
 */
import type { Catalyst, CatalystType, Stock } from '../supabase.js';
import { clamp, num, rangePosition } from './model.js';

export const CATALYST_EDGE_VERSION = 'ce-1.0';

export interface CatalystEdge {
  /** 0..1 probability of a meaningful positive reaction */
  pGood: number;
  /** % move if good */
  upMove: number;
  /** % move if bad (positive number) */
  downMove: number;
  /** Expected % move, after timing discount for estimated dates */
  ev: number;
  /** ev / downMove — reward per unit of downside */
  rewardRisk: number;
  confidence: 'high' | 'medium' | 'low';
  drivers: string[];
}

interface Base {
  p: number;
  up: number;
  down: number;
  label: string;
}

const BASE: Record<CatalystType, Base> = {
  earnings: { p: 0.53, up: 5, down: 5.5, label: 'Earnings: ~53% of reports get a positive reaction' },
  regulatory: { p: 0.7, up: 8, down: 16, label: 'Regulatory: ~85-90% approval rate, less sell-the-news' },
  clinical: { p: 0.5, up: 12, down: 16, label: 'Clinical readout: ~50% positive (phase unknown)' },
  product: { p: 0.58, up: 3, down: 2.5, label: 'Product launch: ~58% positive, small moves' },
  conference: { p: 0.52, up: 2, down: 2, label: 'Conference: ~52% positive, small moves' },
  corporate: { p: 0.55, up: 4, down: 4, label: 'Corporate event: ~55% positive' },
  other: { p: 0.5, up: 3, down: 3, label: 'Other event: coin flip, small moves' },
};

/** Refines the base from the event title (trial phase, buybacks, offerings...). */
function refineFromTitle(type: CatalystType, title: string, base: Base): Base {
  const t = title.toLowerCase();
  if (type === 'clinical' || type === 'regulatory') {
    if (/phase\s*(3|iii)\b/.test(t)) return { p: 0.58, up: 15, down: 22, label: 'Phase 3 readout: ~58% positive' };
    if (/phase\s*(2|ii)\b/.test(t)) return { p: 0.4, up: 18, down: 20, label: 'Phase 2 readout: ~40% positive' };
    if (/phase\s*(1|i)\b/.test(t)) return { p: 0.6, up: 8, down: 10, label: 'Phase 1 readout: ~60% positive (mostly safety)' };
    if (/pdufa|approval|nda|bla|adcom|advisory committee/.test(t))
      return { p: 0.72, up: 9, down: 18, label: 'FDA decision: ~85-90% approval rate, less sell-the-news' };
  }
  if (/offering|dilut|convertible|atm program/.test(t)) return { p: 0.25, up: 3, down: 8, label: 'Share offering: dilutive, usually negative' };
  if (/buyback|repurchase/.test(t)) return { p: 0.65, up: 3, down: 1.5, label: 'Buyback: usually supportive' };
  if (/split/.test(t)) return { p: 0.6, up: 4, down: 2, label: 'Stock split: modestly positive on average' };
  if (/dividend (increase|hike|raise)/.test(t)) return { p: 0.62, up: 2, down: 1.5, label: 'Dividend raise: modestly positive' };
  return base;
}

function sizeMultiplier(mc: number | null): { m: number; label: string | null } {
  if (mc === null || mc <= 0) return { m: 1, label: null };
  if (mc >= 200e9) return { m: 0.6, label: 'mega-cap: moves damped' };
  if (mc >= 10e9) return { m: 1, label: null };
  if (mc >= 2e9) return { m: 1.5, label: 'mid-cap: moves 1.5x larger' };
  if (mc >= 300e6) return { m: 2.2, label: 'small-cap: moves ~2x larger' };
  return { m: 3, label: 'micro-cap: moves ~3x larger' };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function scoreCatalyst(catalyst: Pick<Catalyst, 'event_type' | 'title' | 'date_status'>, stock: Stock | null | undefined): CatalystEdge {
  const type = catalyst.event_type in BASE ? catalyst.event_type : 'other';
  const base = refineFromTitle(type, catalyst.title ?? '', BASE[type]);
  const drivers: string[] = [base.label];
  let p = base.p;
  let up = base.up;
  let down = base.down;
  let inputs = 0;
  const binary = type === 'clinical' || type === 'regulatory';

  if (stock) {
    // ---- magnitude ----
    const size = sizeMultiplier(num(stock.market_cap));
    if (size.label) drivers.push(`${size.label[0].toUpperCase()}${size.label.slice(1)}`);
    let mult = size.m;
    const vol = num(stock.volatility);
    if (vol !== null && vol > 0) {
      inputs++;
      mult *= clamp(Math.sqrt(vol / 40), 0.7, 1.6);
    }
    const pipeline = num(stock.pipeline_count);
    const mc = num(stock.market_cap);
    if (binary && pipeline !== null && pipeline <= 2 && mc !== null && mc < 10e9) {
      mult *= 1.4;
      drivers.push('Few pipeline assets: this event carries more of the company');
    }
    // Even failed single-asset biotechs rarely lose more than ~70% on the day.
    up = Math.min(up * mult, 120);
    down = Math.min(down * mult, 70);

    // ---- probability ----
    const rec = num(stock.recommendation_mean);
    const analysts = num(stock.analyst_count) ?? 0;
    if (rec !== null && analysts >= 3) {
      inputs++;
      if (rec <= 2) {
        p += 0.03;
        drivers.push(`Analysts lean buy (${rec.toFixed(1)}/5)`);
      } else if (rec >= 3) {
        p -= 0.03;
        drivers.push(`Analysts lean hold/sell (${rec.toFixed(1)}/5)`);
      }
    }
    const target = num(stock.target_mean_price);
    const px = num(stock.current_price);
    if (target !== null && px !== null && px > 0) {
      inputs++;
      const upside = (target / px - 1) * 100;
      if (upside >= 30) {
        p += 0.03;
        drivers.push(`${Math.round(upside)}% upside to analyst target`);
      } else if (upside < 0) {
        p -= 0.03;
        drivers.push(`Trading above analyst target (${Math.round(upside)}%)`);
      }
    }

    if (type === 'earnings') {
      const eg = num(stock.earnings_growth_yoy);
      const rg = num(stock.revenue_growth_yoy);
      const mom = num(stock.momentum_score);
      if (eg !== null) {
        inputs++;
        if (eg >= 25) {
          p += 0.04;
          drivers.push(`Earnings growing ${Math.round(eg)}% YoY`);
        } else if (eg <= -10) {
          p -= 0.04;
          drivers.push(`Earnings shrinking ${Math.round(eg)}% YoY`);
        }
      }
      if (rg !== null && rg >= 20) {
        p += 0.02;
        drivers.push(`Revenue growing ${Math.round(rg)}% YoY`);
      }
      if (mom !== null) {
        inputs++;
        if (mom >= 70) {
          p += 0.03;
          drivers.push('Strong momentum into the print');
        } else if (mom <= 30) {
          p -= 0.03;
          drivers.push('Weak momentum into the print');
        }
      }
      const pos = rangePosition(stock);
      if (pos !== null && pos >= 0.9) {
        p -= 0.02;
        drivers.push('Near 52-week high: good news partly priced in');
      }
    }

    if (binary) {
      const runway = num(stock.cash_runway_months);
      if (runway !== null) {
        inputs++;
        if (runway < 12) {
          p -= 0.06;
          drivers.push(`Only ${Math.round(runway)} months of cash: likely raise after the news`);
        } else if (runway < 24) {
          p -= 0.03;
          drivers.push(`${Math.round(runway)} months of cash: dilution risk`);
        }
      }
    }
  } else {
    drivers.push('No stock data: base rates only');
  }

  p = clamp(p, 0.12, 0.9);
  let ev = p * up - (1 - p) * down;
  if (catalyst.date_status === 'estimated') {
    ev *= 0.85;
    drivers.push('Estimated date: value discounted 15%');
  }

  const confidence: CatalystEdge['confidence'] =
    !stock || inputs <= 1 ? 'low' : inputs >= 4 && catalyst.date_status === 'confirmed' ? 'high' : 'medium';

  return {
    pGood: p,
    upMove: r1(up),
    downMove: r1(down),
    ev: r1(ev),
    rewardRisk: down > 0 ? r1(ev / down) : 0,
    confidence,
    drivers,
  };
}

export type CatalystRankKey = 'value' | 'odds' | 'date';

/** Sorts scored rows: value = EV desc, odds = pGood desc, date = soonest first. Ties fall back to the other metric then date. */
export function rankCatalysts<T extends { catalyst: Catalyst; edge: CatalystEdge }>(rows: T[], key: CatalystRankKey): T[] {
  const byDate = (a: T, b: T) => a.catalyst.event_date.localeCompare(b.catalyst.event_date);
  return [...rows].sort((a, b) => {
    if (key === 'value') return b.edge.ev - a.edge.ev || b.edge.pGood - a.edge.pGood || byDate(a, b);
    if (key === 'odds') return b.edge.pGood - a.edge.pGood || b.edge.ev - a.edge.ev || byDate(a, b);
    return byDate(a, b) || b.edge.ev - a.edge.ev;
  });
}
