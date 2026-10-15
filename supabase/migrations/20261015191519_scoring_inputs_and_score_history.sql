/*
# Scoring inputs + score history (roadmap items 3, 4, 7, 8)

1. stocks: new nullable scoring-input columns (valuation, margins, 52w range,
   liquidity), risk_score, data provenance, refresh timestamp, active flag.
   Margins are stored as percent (e.g. 62.5 = 62.5%).
2. score_history: append-only log of 3x scores per ticker (SELECT + INSERT only).

Idempotent and additive only.
*/

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS forward_pe numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS price_to_sales numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS peg_ratio numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS target_mean_price numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS gross_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS operating_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS profit_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS fifty_two_week_high numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS fifty_two_week_low numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS avg_volume bigint;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS risk_score int;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'seed';
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocks_risk_score_range') THEN
    ALTER TABLE stocks ADD CONSTRAINT stocks_risk_score_range
      CHECK (risk_score IS NULL OR (risk_score BETWEEN 0 AND 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocks_data_source_check') THEN
    ALTER TABLE stocks ADD CONSTRAINT stocks_data_source_check
      CHECK (data_source IN ('seed', 'yahoo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  three_x_score int NOT NULL CHECK (three_x_score BETWEEN 0 AND 100),
  risk_score int NULL CHECK (risk_score IS NULL OR (risk_score BETWEEN 0 AND 100)),
  model_version text NOT NULL,
  dimension_scores jsonb NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS score_history_ticker_captured_at_idx
  ON score_history (ticker, captured_at DESC);

ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_score_history" ON score_history;
CREATE POLICY "anon_select_score_history" ON score_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_score_history" ON score_history;
CREATE POLICY "anon_insert_score_history" ON score_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);
