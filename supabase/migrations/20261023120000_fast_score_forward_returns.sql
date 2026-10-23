/*
# Fast score_forward_returns (fixes the Backtest page 500)

The old version found each snapshot's entry bar with a LATERAL scan over a `bars` CTE. CTEs aren't
indexed, so that was snapshots x price rows (2,124 x ~69k): 20.7 s on 2026-10-23, far past the API
role's statement timeout, so /api/backtest returned 500 for every horizon.

Entry and exit bars now come straight from price_daily through its (ticker, d) primary key:
  entry = first bar after the snapshot day
  exit  = the bar p_horizon trading bars after entry (same as the old e_rn + p_horizon)
Same columns, same rows (checked with EXCEPT both ways on 5 tickers), 36.7 ms.
*/
CREATE OR REPLACE FUNCTION public.score_forward_returns(p_model_version text, p_horizon integer)
RETURNS TABLE(ticker text, captured_at timestamptz, three_x_score numeric, risk_score numeric,
              entry_date date, entry_close numeric, exit_date date, exit_close numeric,
              spy_entry_close numeric, spy_exit_close numeric)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
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
  )
  SELECT
    s.s_ticker,
    s.s_captured_at,
    s.s_score,
    s.s_risk,
    e.e_d,
    e.e_px,
    x.x_d,
    x.x_px,
    coalesce(se.adj_close, se.close),
    coalesce(sx.adj_close, sx.close)
  FROM snaps s
  CROSS JOIN LATERAL (
    SELECT b.d AS e_d, coalesce(b.adj_close, b.close) AS e_px
    FROM public.price_daily b
    WHERE b.ticker = s.s_ticker AND b.d > s.s_day
    ORDER BY b.d
    LIMIT 1
  ) e
  CROSS JOIN LATERAL (
    SELECT b.d AS x_d, coalesce(b.adj_close, b.close) AS x_px
    FROM public.price_daily b
    WHERE b.ticker = s.s_ticker AND b.d >= e.e_d
    ORDER BY b.d
    OFFSET p_horizon
    LIMIT 1
  ) x
  LEFT JOIN public.price_daily se ON se.ticker = 'SPY' AND se.d = e.e_d
  LEFT JOIN public.price_daily sx ON sx.ticker = 'SPY' AND sx.d = x.x_d
  WHERE p_horizon >= 1
  ORDER BY s.s_captured_at, s.s_ticker;
$function$;
