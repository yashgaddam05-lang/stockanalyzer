import type { DimensionKey } from './model.js';

/**
 * Plain-language and technical explanation for every score dimension.
 * Single source for the Methodology page and the OKF knowledge bundle (scripts/okf).
 * Typed by DimensionKey, so a new dimension cannot ship without its explanation.
 */
export const DIMENSION_EXPLAINERS: Record<DimensionKey, { plain: string; how: string }> = {
  growth: {
    plain: 'Is the lemonade stand selling more cups every month?',
    how: 'Revenue growth year over year, earnings growth year over year and the R&D ratio. Faster, broader growth scores higher.',
  },
  valuation: {
    plain: 'Is the stand cheap to buy compared with how much lemonade it sells?',
    how: 'Forward P/E, price to sales, PEG ratio and the analyst mean target compared with the current price. Cheaper relative to growth scores higher.',
  },
  headroom: {
    plain:
      'How much bigger can the stand still get? A small stand can triple by adding a few customers; the biggest stand in town would need a whole new town.',
    how: 'Market cap on a log scale ($1B and below scores highest, $1T and up lowest), plus the analyst mean and high targets as multiples of the price (needs 3 or more analysts). A huge company needs far more new value to triple.',
  },
  momentum: {
    plain: 'Are more and more kids lining up lately?',
    how: 'The momentum score (recent trend) and where the price sits within its 52-week high/low range.',
  },
  quality: {
    plain: 'Does it keep money after paying for lemons and sugar, without big debts?',
    how: 'Gross, operating and net margin, debt to equity and cash runway.',
  },
  catalyst: {
    plain: 'Is something new coming soon, like a new flavor or a summer fair?',
    how: 'Pipeline count (upcoming products, trials and events) and the R&D ratio.',
  },
  position: {
    plain: 'Is it a stand people already know, not one hidden down an alley?',
    how: 'Market cap, gross margin and average trading volume.',
  },
  risk: {
    plain: 'Does business swing wildly from day to day? Calmer is better here.',
    how: 'Volatility and beta. A wider range of outcomes is scored as opportunity here; the downside is measured separately by the risk score.',
  },
  regime: {
    plain: 'Is it a sunny week for lemonade, or is everyone indoors?',
    how: "How well the stock's profile fits today's market backdrop, from a daily snapshot of VIX, the 10-year Treasury yield trend, SPY vs its 200-day average and 3-month return, small-cap and Nasdaq relative strength, and sector ETF strength.",
  },
};
