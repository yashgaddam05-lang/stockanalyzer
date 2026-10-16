/*
# Form 4 "already processed" markers

refresh-filings used to write a sentinel row (line_no = -1, all transaction
fields null) into insider_transactions for every Form 4 with no non-derivative
lines. Readers that do not filter line_no showed them as empty insider rows.
Markers now live here, so insider_transactions holds real lines only.

1. sec_form4_processed: one row per Form 4 accession that produced no lines.
2. Backfill from the legacy sentinels. Cleanup of those rows is a separate
   migration (20261016180100_drop_insider_sentinels.sql, on swarm/edge-sec-filings; not applied, pending review).

Read-only for anon/authenticated; the edge function writes with the service role.
Idempotent and additive only.
*/

CREATE TABLE IF NOT EXISTS public.sec_form4_processed (
  accession_no text PRIMARY KEY,
  ticker text NOT NULL,
  reason text NOT NULL,
  owner_name text,
  filing_url text,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.sec_form4_processed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_sec_form4_processed" ON public.sec_form4_processed;
CREATE POLICY "public_select_sec_form4_processed" ON public.sec_form4_processed
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sec_form4_processed (accession_no, ticker, reason, owner_name, filing_url, processed_at)
SELECT accession_no, ticker, 'legacy_sentinel', NULLIF(owner_name, 'n/a'), filing_url, COALESCE(created_at, now())
FROM public.insider_transactions
WHERE line_no < 0
ON CONFLICT (accession_no) DO NOTHING;
