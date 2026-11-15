export interface Stock {
  id: string;
  ticker: string;
  company_name: string;
  sector: string;
  market_cap: number;
  current_price: number;
  revenue_growth_yoy: number;
  earnings_growth_yoy: number;
  momentum_score: number;
  volatility: number;
  debt_to_equity: number;
  beta: number;
  rd_ratio: number;
  pipeline_count: number;
  cash_runway_months: number;
  three_x_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'extreme';
  /** Analyst consensus from Yahoo (null until refreshed). Not a score input. */
  target_high_price?: number | null;
  target_low_price?: number | null;
  recommendation_mean?: number | null;
  recommendation_key?: string | null;
  analyst_count?: number | null;
  thesis: string;
  updated_at: string;
  // Added by 20261015191519_scoring_inputs_and_score_history.sql.
  // Optional because the live DB may not have the migration applied yet.
  industry?: string | null;
  forward_pe?: number | null;
  price_to_sales?: number | null;
  peg_ratio?: number | null;
  target_mean_price?: number | null;
  /** Percent, e.g. 62.5 */
  gross_margin?: number | null;
  /** Percent */
  operating_margin?: number | null;
  /** Percent */
  profit_margin?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  avg_volume?: number | null;
  /** 0-100 */
  risk_score?: number | null;
  data_source?: 'seed' | 'yahoo';
  last_refreshed_at?: string | null;
  /** True for S&P 500 constituents. */
  in_sp500?: boolean;
  /** Set when a user added this stock to the tracked universe. */
  added_by?: string | null;
  added_at?: string | null;
  is_active?: boolean;
  regime_fit_score?: number | null;
  regime_fit_drivers?: string[] | null;
}

export interface WatchlistEntry {
  id: string;
  ticker: string;
  added_at: string;
}

export interface StockListItem extends Stock {
  score_change: number | null;
  previous_score: number | null;
}

export interface ScoreHistoryEntry {
  id: string;
  ticker: string;
  three_x_score: number;
  risk_score: number | null;
  model_version: string;
  dimension_scores: Record<string, number | null> | null;
  captured_at: string;
}

export interface ScoreHistoryResponse {
  ticker: string;
  available: boolean;
  entries: ScoreHistoryEntry[];
}

export interface Watchlist {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  owner_id?: string | null;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  ticker: string;
  notes: string;
  tags: string[];
  added_at: string;
  updated_at: string;
}

export interface WatchlistWithItems extends Watchlist {
  items: WatchlistItem[];
}

export interface WatchlistsResponse {
  legacy: boolean;
  lists: WatchlistWithItems[];
}

export type CatalystType = 'earnings' | 'product' | 'regulatory' | 'clinical' | 'conference' | 'corporate' | 'other';

export interface Catalyst {
  id: string;
  ticker: string;
  event_type: CatalystType;
  title: string;
  /** YYYY-MM-DD */
  event_date: string;
  date_status: 'confirmed' | 'estimated';
  source: 'yahoo' | 'manual';
  source_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalystsResponse {
  available: boolean;
  catalysts: Catalyst[];
}

export interface CatalystInput {
  ticker: string;
  event_type: CatalystType;
  title: string;
  event_date: string;
  date_status?: 'confirmed' | 'estimated';
  source_url?: string | null;
  notes?: string;
}

export type PriceRange = '1mo' | '3mo' | '6mo' | '1y' | '5y';

export interface PricePoint {
  /** ISO 8601 date YYYY-MM-DD */
  t: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface PriceHistoryResponse {
  ticker: string;
  range: PriceRange;
  interval: '1d' | '1wk';
  currency: string | null;
  points: PricePoint[];
}

export interface PriceDailyRow {
  ticker: string;
  /** YYYY-MM-DD */
  d: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adj_close: number | null;
  volume: number | null;
  source: string;
}

export type RegimeLabel = 'risk_on' | 'neutral' | 'risk_off' | 'insufficient_data';

export interface SectorStrength {
  etf: string;
  return_63d: number | null;
  relative_63d: number | null;
}

export interface MarketRegimeSnapshot {
  as_of: string;
  vix: number | null;
  tnx: number | null;
  tnx_change_63d: number | null;
  spy_close: number | null;
  spy_above_200dma: boolean | null;
  spy_return_63d: number | null;
  risk_appetite: number | null;
  regime_label: RegimeLabel;
  sector_strength: Record<string, SectorStrength>;
  drivers: string[];
  model_version: string;
  created_at?: string;
}

export interface MarketRegimeResponse {
  available: boolean;
  latest: MarketRegimeSnapshot | null;
  history: MarketRegimeSnapshot[];
}

export type AlertKind = 'score_above' | 'score_below' | 'score_change' | 'price_above' | 'price_below' | 'catalyst_within';

export interface AlertRule {
  id: string;
  ticker: string;
  kind: AlertKind;
  threshold: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleInput {
  ticker: string;
  kind: AlertKind;
  threshold: number;
  is_active?: boolean;
}

export interface AlertRulePatch {
  threshold?: number;
  is_active?: boolean;
}

export interface AlertEvent {
  id: string;
  alert_id: string | null;
  ticker: string;
  kind: AlertKind;
  message: string;
  payload: Record<string, unknown>;
  triggered_at: string;
  read_at: string | null;
}

export interface AlertsResponse {
  available: boolean;
  rules: AlertRule[];
}

export interface AlertEventsResponse {
  available: boolean;
  events: AlertEvent[];
  unread_count: number;
}

export interface Portfolio {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  opened_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioWithPositions extends Portfolio {
  positions: Position[];
}

export interface PortfoliosResponse {
  available: boolean;
  portfolios: PortfolioWithPositions[];
}

export interface PositionInput {
  portfolio_id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  opened_at?: string;
  notes?: string;
}

export interface PositionPatch {
  shares?: number;
  cost_basis?: number;
  opened_at?: string;
  notes?: string;
}

export interface SecFiling {
  id: string;
  ticker: string;
  cik: string;
  accession_no: string;
  form: string;
  filed_at: string;
  report_date: string | null;
  primary_doc_url: string | null;
  description: string | null;
}

export interface InsiderTransaction {
  id: string;
  ticker: string;
  accession_no: string;
  /** 0-based line within the Form 4. Legacy rows with -1 were "processed" sentinels
   *  (now in sec_form4_processed); readers should still filter line_no >= 0. */
  line_no: number;
  owner_name: string;
  owner_relationship: string | null;
  transaction_date: string | null;
  transaction_code: string | null;
  acquired_disposed: 'A' | 'D' | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  shares_owned_after: number | null;
  filing_url: string | null;
}

/** Form 4 accession processed with no non-derivative lines (refresh-filings bookkeeping). */
export interface SecForm4Processed {
  accession_no: string;
  ticker: string;
  /** no_lines | no_owner | not_found | parse_error | legacy_sentinel */
  reason: string;
  owner_name: string | null;
  filing_url: string | null;
  processed_at: string;
}

export interface InsiderSummary {
  window_days: number;
  buys: number;
  sells: number;
  net_shares: number;
  net_value: number;
}

export interface FilingsResponse {
  ticker: string;
  available: boolean;
  filings: SecFiling[];
  insider: InsiderTransaction[];
  insider_summary: InsiderSummary | null;
  last_synced_at: string | null;
}

export type BacktestHorizon = 5 | 21 | 63;

/** Returns are decimals (0.05 = 5%). */
export interface BacktestBucket {
  label: string;
  min_score: number;
  max_score: number;
  n: number;
  mean_return: number | null;
  median_return: number | null;
  hit_rate: number | null;
  mean_excess_vs_spy: number | null;
}

/** Returns are decimals (0.05 = 5%). */
export interface BacktestResponse {
  available: boolean;
  model_version: string;
  versions: string[];
  horizon_days: BacktestHorizon;
  generated_at: string;
  sample: {
    snapshots: number;
    observations: number;
    tickers: number;
    first_date: string | null;
    last_date: string | null;
  };
  buckets: BacktestBucket[];
  top_vs_bottom: { spread: number; n_top: number; n_bottom: number } | null;
  information_coefficient: number | null;
  sufficient: boolean;
  min_observations: number;
  caveats: string[];
}

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DataQualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  value: string;
  detail: string;
  affected?: string[];
}

export interface RefreshRun {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'ok' | 'partial' | 'failed';
  stats: Record<string, unknown>;
}

export interface DataHealthResponse {
  generated_at: string;
  overall: CheckStatus;
  checks: DataQualityCheck[];
  coverage: {
    stocks_total: number;
    stocks_refreshed_24h: number;
    price_daily_tickers: number;
    latest_bar_date: string | null;
    regime_as_of: string | null;
    filings_last_synced_at: string | null;
    last_snapshot_at: string | null;
  };
  runs: RefreshRun[];
}

export type DashboardScope = 'mine' | 'sp500' | 'all';

export type InvestGoal = 'multibaggers' | 'track' | 'ideas' | 'learn';
export type Experience = 'new' | 'some' | 'experienced';
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive';

export interface UserPreferences {
  dashboard_scope: DashboardScope;
  sectors: string[];
  goal?: InvestGoal | null;
  experience?: Experience | null;
  risk?: RiskAppetite | null;
  temperament?: { score: number; bot: string; tolerance: number; answers: Record<string, number>; at?: string } | null;
  weekly_email?: boolean;
  /** Null until the user finishes first-login onboarding. */
  onboarded_at: string | null;
  updated_at: string | null;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  sector: string | null;
  /** True when the stock is already tracked (scored and refreshed). */
  tracked: boolean;
  in_sp500: boolean;
  three_x_score: number | null;
}
