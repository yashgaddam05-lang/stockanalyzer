/*
# Low-hanging fruit: named watchlists, score history, valuation fields

1. Stocks (additive columns only, nothing dropped or renamed)
- forward_pe (numeric, nullable) - Forward P/E from Yahoo Finance
- price_to_sales (numeric, nullable) - Market cap / trailing revenue
- target_price (numeric, nullable) - Mean analyst price target

2. New tables
- `watchlists`: named watchlists
  - id (uuid, PK), name (text), created_at (timestamptz)
- `watchlist_items`: stocks inside a watchlist, with notes and tags
  - id (uuid, PK), watchlist_id (uuid FK -> watchlists, cascade), ticker (text),
    note (text), tags (text[]), added_at (timestamptz)
  - UNIQUE (watchlist_id, ticker)
- `score_history`: one score snapshot per ticker per day
  - id (uuid, PK), ticker (text), score (int), risk_score (int),
    snapshot_date (date), created_at (timestamptz)
  - UNIQUE (ticker, snapshot_date)

3. Data
- Creates a default "My Watchlist" and copies every row from the legacy
  `watchlist` table into it. The legacy table is kept untouched.

4. Security
- RLS enabled on every new table. No-auth app pattern: anon + authenticated.
*/

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS forward_pe numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS price_to_sales numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS target_price numeric;

-- Named watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

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

CREATE TABLE IF NOT EXISTS watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  note text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  added_at timestamptz DEFAULT now(),
  UNIQUE (watchlist_id, ticker)
);

CREATE INDEX IF NOT EXISTS watchlist_items_watchlist_id_idx ON watchlist_items (watchlist_id);

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

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

-- Default list + migrate legacy single watchlist
INSERT INTO watchlists (name)
SELECT 'My Watchlist'
WHERE NOT EXISTS (SELECT 1 FROM watchlists);

INSERT INTO watchlist_items (watchlist_id, ticker, added_at)
SELECT (SELECT id FROM watchlists ORDER BY created_at LIMIT 1), w.ticker, w.added_at
FROM watchlist w
ON CONFLICT (watchlist_id, ticker) DO NOTHING;

-- Score history
CREATE TABLE IF NOT EXISTS score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  score int NOT NULL,
  risk_score int NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (ticker, snapshot_date)
);

CREATE INDEX IF NOT EXISTS score_history_ticker_date_idx ON score_history (ticker, snapshot_date DESC);

ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_score_history" ON score_history;
CREATE POLICY "anon_select_score_history" ON score_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_score_history" ON score_history;
CREATE POLICY "anon_insert_score_history" ON score_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_score_history" ON score_history;
CREATE POLICY "anon_update_score_history" ON score_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
