/*
# Stage C: market data (price bars, regime snapshots, refresh runs)

1. price_daily: daily OHLCV bars per symbol (stocks + macro symbols like ^VIX,
   ^TNX, SPY, XLK). No FK to stocks. Read-only for anon/authenticated; written
   by edge functions with the service role.
2. price_daily_coverage: security_invoker view of bar counts/date range per ticker.
3. market_regime_snapshots: one row per day, written by the Vercel API (anon key).
4. refresh_runs: append-only job run log.
5. stocks.regime_fit_score / regime_fit_drivers.

Idempotent and additive only.
*/

CREATE TABLE IF NOT EXISTS public.price_daily (
  ticker text NOT NULL,
  d date NOT NULL,
  open numeric,
  high numeric,
  low numeric,
  close numeric NOT NULL,
  adj_close numeric,
  volume bigint,
  source text NOT NULL DEFAULT 'yahoo',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, d)
);

CREATE INDEX IF NOT EXISTS price_daily_d_idx ON public.price_daily (d);

ALTER TABLE public.price_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_price_daily" ON public.price_daily;
CREATE POLICY "public_select_price_daily" ON public.price_daily FOR SELECT
  TO anon, authenticated USING (true);

CREATE OR REPLACE VIEW public.price_daily_coverage
  WITH (security_invoker = true) AS
  SELECT ticker, count(*)::int AS bars, min(d) AS first_d, max(d) AS last_d
  FROM public.price_daily
  GROUP BY ticker;

GRANT SELECT ON public.price_daily_coverage TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.market_regime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of date NOT NULL UNIQUE,
  vix numeric,
  tnx numeric,
  tnx_change_63d numeric,
  spy_close numeric,
  spy_above_200dma boolean,
  spy_return_63d numeric,
  risk_appetite numeric,
  regime_label text NOT NULL
    CHECK (regime_label IN ('risk_on', 'neutral', 'risk_off', 'insufficient_data')),
  sector_strength jsonb NOT NULL DEFAULT '{}'::jsonb,
  drivers text[] NOT NULL DEFAULT '{}',
  model_version text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.market_regime_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_market_regime_snapshots" ON public.market_regime_snapshots;
CREATE POLICY "public_select_market_regime_snapshots" ON public.market_regime_snapshots
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_market_regime_snapshots" ON public.market_regime_snapshots;
CREATE POLICY "public_insert_market_regime_snapshots" ON public.market_regime_snapshots
  FOR INSERT TO anon, authenticated
  WITH CHECK (as_of >= current_date - 7 AND as_of <= current_date + 1);

DROP POLICY IF EXISTS "public_update_market_regime_snapshots" ON public.market_regime_snapshots;
CREATE POLICY "public_update_market_regime_snapshots" ON public.market_regime_snapshots
  FOR UPDATE TO anon, authenticated
  USING (as_of >= current_date - 7 AND as_of <= current_date + 1)
  WITH CHECK (as_of >= current_date - 7 AND as_of <= current_date + 1);

CREATE TABLE IF NOT EXISTS public.refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL CHECK (char_length(job) <= 40),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  stats jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS refresh_runs_job_started_at_idx
  ON public.refresh_runs (job, started_at DESC);

ALTER TABLE public.refresh_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_refresh_runs" ON public.refresh_runs;
CREATE POLICY "public_select_refresh_runs" ON public.refresh_runs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_refresh_runs" ON public.refresh_runs;
CREATE POLICY "public_insert_refresh_runs" ON public.refresh_runs
  FOR INSERT TO anon, authenticated
  WITH CHECK (started_at > now() - interval '1 day');

ALTER TABLE public.stocks ADD COLUMN IF NOT EXISTS regime_fit_score numeric;
ALTER TABLE public.stocks ADD COLUMN IF NOT EXISTS regime_fit_drivers text[];
