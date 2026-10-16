/*
# Stage C: backtest helper score_forward_returns(model_version, horizon)

For each ticker, the latest score_history snapshot per UTC day for the given
model_version is paired with forward price_daily bars:
- entry = first bar with d STRICTLY after the snapshot's UTC date (no look-ahead:
  a score captured on day D is only actionable from the next session)
- exit  = the bar p_horizon trading rows after entry (row_number over d)
- prices use coalesce(adj_close, close); rows without an exit bar are dropped
- SPY closes on the same entry/exit dates (NULL when missing)

SECURITY INVOKER, empty search_path. Idempotent (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION public.score_forward_returns(p_model_version text, p_horizon int)
RETURNS TABLE (
  ticker text,
  captured_at timestamptz,
  three_x_score numeric,
  risk_score numeric,
  entry_date date,
  entry_close numeric,
  exit_date date,
  exit_close numeric,
  spy_entry_close numeric,
  spy_exit_close numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH snaps AS (
    SELECT DISTINCT ON (sh.ticker, (sh.captured_at AT TIME ZONE 'UTC')::date)
      sh.ticker AS s_ticker,
      sh.captured_at AS s_captured_at,
      (sh.captured_at AT TIME ZONE 'UTC')::date AS s_day,
      sh.three_x_score::numeric AS s_score,
      sh.risk_score::numeric AS s_risk
    FROM public.score_history sh
    WHERE sh.model_version = p_model_version
    ORDER BY sh.ticker, (sh.captured_at AT TIME ZONE 'UTC')::date, sh.captured_at DESC
  ),
  bars AS (
    SELECT
      pd.ticker AS b_ticker,
      pd.d AS b_d,
      coalesce(pd.adj_close, pd.close) AS b_px,
      row_number() OVER (PARTITION BY pd.ticker ORDER BY pd.d) AS b_rn
    FROM public.price_daily pd
    WHERE pd.ticker IN (SELECT s.s_ticker FROM snaps s)
  ),
  entries AS (
    SELECT s.*, e.b_d AS e_d, e.b_px AS e_px, e.b_rn AS e_rn
    FROM snaps s
    CROSS JOIN LATERAL (
      SELECT b.b_d, b.b_px, b.b_rn
      FROM bars b
      WHERE b.b_ticker = s.s_ticker AND b.b_d > s.s_day
      ORDER BY b.b_d
      LIMIT 1
    ) e
  ),
  spy AS (
    SELECT p.d AS spy_d, coalesce(p.adj_close, p.close) AS spy_px
    FROM public.price_daily p
    WHERE p.ticker = 'SPY'
  )
  SELECT
    en.s_ticker,
    en.s_captured_at,
    en.s_score,
    en.s_risk,
    en.e_d,
    en.e_px,
    x.b_d,
    x.b_px,
    se.spy_px,
    sx.spy_px
  FROM entries en
  JOIN bars x
    ON x.b_ticker = en.s_ticker AND x.b_rn = en.e_rn + p_horizon
  LEFT JOIN spy se ON se.spy_d = en.e_d
  LEFT JOIN spy sx ON sx.spy_d = x.b_d
  WHERE p_horizon >= 1
  ORDER BY en.s_captured_at, en.s_ticker;
$$;

GRANT EXECUTE ON FUNCTION public.score_forward_returns(text, int) TO anon, authenticated;
