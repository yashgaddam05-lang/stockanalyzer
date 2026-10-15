/*
# Catalyst calendar (catalysts table)

Upcoming events per ticker (earnings, FDA, product launches, ...).
- Yahoo rows: written by the refresh edge function with the service role
  (bypasses RLS), upserted on catalysts_dedupe_idx.
- Manual rows: inserted by signed-in users; only the creator may edit/delete.
- Everyone (anon + authenticated) can read.

Idempotent and additive only. No seed rows.
*/

CREATE TABLE IF NOT EXISTS public.catalysts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  event_type text NOT NULL CHECK (event_type IN
    ('earnings','product','regulatory','clinical','conference','corporate','other')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  event_date date NOT NULL,
  date_status text NOT NULL DEFAULT 'confirmed' CHECK (date_status IN ('confirmed','estimated')),
  source text NOT NULL CHECK (source IN ('yahoo','manual')),
  source_url text NULL CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_by uuid NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalysts_dedupe_idx
  ON public.catalysts (ticker, event_type, event_date, source);
CREATE INDEX IF NOT EXISTS catalysts_event_date_idx ON public.catalysts (event_date);
CREATE INDEX IF NOT EXISTS catalysts_ticker_event_date_idx ON public.catalysts (ticker, event_date);
CREATE INDEX IF NOT EXISTS catalysts_created_by_idx ON public.catalysts (created_by);

ALTER TABLE public.catalysts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalysts_select_all" ON public.catalysts;
CREATE POLICY "catalysts_select_all" ON public.catalysts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "catalysts_insert_own_manual" ON public.catalysts;
CREATE POLICY "catalysts_insert_own_manual" ON public.catalysts FOR INSERT
  TO authenticated
  WITH CHECK (source = 'manual' AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "catalysts_update_own_manual" ON public.catalysts;
CREATE POLICY "catalysts_update_own_manual" ON public.catalysts FOR UPDATE
  TO authenticated
  USING (source = 'manual' AND created_by = (select auth.uid()))
  WITH CHECK (source = 'manual' AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "catalysts_delete_own_manual" ON public.catalysts;
CREATE POLICY "catalysts_delete_own_manual" ON public.catalysts FOR DELETE
  TO authenticated
  USING (source = 'manual' AND created_by = (select auth.uid()));
