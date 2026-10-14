import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
}

export interface WatchlistEntry {
  id: string;
  ticker: string;
  added_at: string;
}
