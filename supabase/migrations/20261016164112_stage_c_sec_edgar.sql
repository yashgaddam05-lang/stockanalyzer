/*
# Stage C: SEC EDGAR filings + Form 4 insider transactions

1. sec_sync_state: per-ticker CIK mapping and last sync status.
2. sec_filings: filing index per ticker (unique on ticker + accession).
3. insider_transactions: Form 4 non-derivative lines (unique on accession + line).

Read-only for anon/authenticated. No write policies: the refresh-filings edge
function writes with the service role. Idempotent and additive only.
*/

CREATE TABLE IF NOT EXISTS public.sec_sync_state (
  ticker text PRIMARY KEY,
  cik text,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sec_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_sec_sync_state" ON public.sec_sync_state;
CREATE POLICY "public_select_sec_sync_state" ON public.sec_sync_state
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.sec_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  cik text NOT NULL,
  accession_no text NOT NULL,
  form text NOT NULL,
  filed_at date NOT NULL,
  report_date date,
  primary_doc_url text,
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (ticker, accession_no)
);

CREATE INDEX IF NOT EXISTS sec_filings_ticker_filed_at_idx
  ON public.sec_filings (ticker, filed_at DESC);

ALTER TABLE public.sec_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_sec_filings" ON public.sec_filings;
CREATE POLICY "public_select_sec_filings" ON public.sec_filings
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.insider_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  accession_no text NOT NULL,
  line_no int NOT NULL,
  owner_name text NOT NULL,
  owner_relationship text,
  transaction_date date,
  transaction_code text,
  acquired_disposed text CHECK (acquired_disposed IN ('A', 'D')),
  shares numeric,
  price numeric,
  value numeric,
  shares_owned_after numeric,
  filing_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (accession_no, line_no)
);

CREATE INDEX IF NOT EXISTS insider_transactions_ticker_date_idx
  ON public.insider_transactions (ticker, transaction_date DESC);

ALTER TABLE public.insider_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_insider_transactions" ON public.insider_transactions;
CREATE POLICY "public_select_insider_transactions" ON public.insider_transactions
  FOR SELECT TO anon, authenticated USING (true);
