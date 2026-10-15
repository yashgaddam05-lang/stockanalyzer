/*
# Named watchlists with notes and tags (roadmap item 9)

1. watchlists: named lists, at most one default (partial unique index).
2. watchlist_items: tickers per list with notes + tags, unique per list.
3. Backfill: create default 'My Watchlist' if no default exists, copy legacy
   `watchlist` tickers into it. Legacy `watchlist` table is left untouched.

Idempotent and additive only.
*/

CREATE TABLE IF NOT EXISTS watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS watchlists_single_default_idx
  ON watchlists (is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  tags text[] NOT NULL DEFAULT '{}',
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, ticker)
);

CREATE INDEX IF NOT EXISTS watchlist_items_watchlist_id_idx
  ON watchlist_items (watchlist_id);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_watchlists" ON watchlists;
CREATE POLICY "anon_select_watchlists" ON watchlists FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_watchlists" ON watchlists;
CREATE POLICY "anon_insert_watchlists" ON watchlists FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_watchlists" ON watchlists;
CREATE POLICY "anon_update_watchlists" ON watchlists FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_watchlists" ON watchlists;
CREATE POLICY "anon_delete_watchlists" ON watchlists FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_watchlist_items" ON watchlist_items;
CREATE POLICY "anon_select_watchlist_items" ON watchlist_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_watchlist_items" ON watchlist_items;
CREATE POLICY "anon_insert_watchlist_items" ON watchlist_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_watchlist_items" ON watchlist_items;
CREATE POLICY "anon_update_watchlist_items" ON watchlist_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_watchlist_items" ON watchlist_items;
CREATE POLICY "anon_delete_watchlist_items" ON watchlist_items FOR DELETE
  TO anon, authenticated USING (true);

-- Backfill default list from legacy watchlist
INSERT INTO watchlists (name, is_default)
SELECT 'My Watchlist', true
WHERE NOT EXISTS (SELECT 1 FROM watchlists WHERE is_default);

INSERT INTO watchlist_items (watchlist_id, ticker, added_at)
SELECT d.id, w.ticker, COALESCE(w.added_at, now())
FROM watchlist w
CROSS JOIN (SELECT id FROM watchlists WHERE is_default LIMIT 1) d
ON CONFLICT (watchlist_id, ticker) DO NOTHING;
