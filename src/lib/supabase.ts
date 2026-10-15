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
  thesis: string;
  updated_at: string;
  // Added by 20261015120000_scoring_inputs_and_score_history.sql.
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
  is_active?: boolean;
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
