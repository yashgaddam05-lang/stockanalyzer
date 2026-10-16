/*
# Stage C: per-user alerts + portfolios (authenticated only)

1. alerts: user-defined score/price/catalyst alert rules.
2. alert_events: fired alerts (inbox), optional link back to the rule.
3. portfolios / positions: user paper portfolios and lots.

All tables: RLS, policies TO authenticated with owner_id = (select auth.uid()).
No anon policies at all (anon sees 0 rows, writes rejected).
Idempotent and additive only.
*/

CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('score_above', 'score_below', 'score_change',
                                     'price_above', 'price_below', 'catalyst_within')),
  threshold numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_owner_id_idx ON public.alerts (owner_id);
CREATE INDEX IF NOT EXISTS alerts_ticker_idx ON public.alerts (ticker);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_alerts" ON public.alerts;
CREATE POLICY "user_own_alerts" ON public.alerts FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.alerts(id) ON DELETE SET NULL,
  ticker text NOT NULL,
  kind text NOT NULL,
  message text NOT NULL CHECK (char_length(message) <= 500),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS alert_events_owner_triggered_idx
  ON public.alert_events (owner_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_alert_id_idx ON public.alert_events (alert_id);

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_alert_events" ON public.alert_events;
CREATE POLICY "user_own_alert_events" ON public.alert_events FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (
    owner_id = (select auth.uid())
    AND (
      alert_id IS NULL
      OR EXISTS (SELECT 1 FROM public.alerts a
                 WHERE a.id = alert_events.alert_id AND a.owner_id = (select auth.uid()))
    )
  );

CREATE TABLE IF NOT EXISTS public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolios_owner_id_idx ON public.portfolios (owner_id);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_portfolios" ON public.portfolios;
CREATE POLICY "user_own_portfolios" ON public.portfolios FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  shares numeric NOT NULL CHECK (shares > 0),
  cost_basis numeric NOT NULL CHECK (cost_basis >= 0),
  opened_at date NOT NULL DEFAULT current_date,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_portfolio_id_idx ON public.positions (portfolio_id);
CREATE INDEX IF NOT EXISTS positions_owner_id_idx ON public.positions (owner_id);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_positions" ON public.positions;
CREATE POLICY "user_own_positions" ON public.positions FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (
    owner_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.portfolios p
                WHERE p.id = positions.portfolio_id AND p.owner_id = (select auth.uid()))
  );
