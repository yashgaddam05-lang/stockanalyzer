export {
  aggregateBacktest,
  spearman,
  SCORE_BANDS,
  BASE_CAVEATS,
  DEFAULT_MIN_OBSERVATIONS,
  MIN_CAPTURE_DATES,
  MIN_TICKERS_PER_DATE,
  MIN_PER_QUINTILE_SIDE,
  SCORE_HISTORY_START,
} from './engine.js';
export type {
  ForwardObservation,
  HorizonDays,
  BacktestOptions,
  BacktestBucket,
  BacktestSample,
  BacktestTopVsBottom,
  BacktestResult,
} from './engine.js';
