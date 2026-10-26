/*
# Smart Money: specialist biotech/healthcare fund ownership (SEC 13F) + insider buying

1. smart_money_managers: fixed list of specialist healthcare managers (13F filer CIKs).
   Index/generalist holders (BlackRock, Vanguard, multi-strategy funds) are excluded on purpose:
   their ownership carries no signal. Source list: scripts/smart-money/managers.json.
2. smart_money_filings: 13F-HR filings already processed (one row per accession).
3. smart_money_holdings: share positions per manager filer CIK, report period and CUSIP (no options,
   no bonds). A manager with several filer CIKs (Foresite, Venrock) is summed across them.
4. cusip_tickers: CUSIP to ticker map (OpenFIGI), null ticker = looked up, no US listing.
5. smart_money_signals: per-ticker summary written by refresh-smart-money: specialist holders in the
   latest 13F period, quarter-over-quarter change, and C-suite open-market buys (Form 4, last 90 days).

13F reports are due 45 days after quarter end, so holdings are always 45 to 135 days old.
Read-only for anon/authenticated; the edge function writes with the service role. Additive only.
*/

CREATE TABLE IF NOT EXISTS public.smart_money_managers (
  id text PRIMARY KEY,
  name text NOT NULL,
  ciks text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.smart_money_managers (id, name, ciks) VALUES
  ('baker-bros', 'Baker Bros. Advisors', array['1263508']::text[]),
  ('ra-capital', 'RA Capital Management', array['1346824']::text[]),
  ('perceptive', 'Perceptive Advisors', array['1224962']::text[]),
  ('deerfield', 'Deerfield Management', array['1009258']::text[]),
  ('ecor1', 'EcoR1 Capital', array['1587114']::text[]),
  ('avoro', 'Avoro Capital Advisors', array['1633313']::text[]),
  ('cormorant', 'Cormorant Asset Management', array['1583977']::text[]),
  ('bvf', 'BVF (Biotechnology Value Fund)', array['1056807']::text[]),
  ('orbimed', 'OrbiMed Advisors', array['1055951']::text[]),
  ('redmile', 'Redmile Group', array['1425738']::text[]),
  ('casdin', 'Casdin Capital', array['1534261']::text[]),
  ('vivo', 'Vivo Capital', array['1674712']::text[]),
  ('rock-springs', 'Rock Springs Capital', array['1595725']::text[]),
  ('boxer', 'Boxer Capital', array['1465837', '2018299']::text[]),
  ('commodore', 'Commodore Capital', array['1831942']::text[]),
  ('paradigm', 'Paradigm BioCapital', array['1855655']::text[]),
  ('logos', 'Logos Global Management', array['1792126']::text[]),
  ('great-point', 'Great Point Partners', array['1281446']::text[]),
  ('opaleye', 'Opaleye Management', array['1595855']::text[]),
  ('tang', 'Tang Capital Management', array['1232621']::text[]),
  ('palo-alto', 'Palo Alto Investors', array['1306923']::text[]),
  ('rtw', 'RTW Investments', array['1493215']::text[]),
  ('armistice', 'Armistice Capital', array['1601086']::text[]),
  ('bain-life-sciences', 'Bain Capital Life Sciences', array['1703031']::text[]),
  ('ally-bridge', 'Ally Bridge Group', array['1822947']::text[]),
  ('vestal-point', 'Vestal Point Capital', array['1974915']::text[]),
  ('soleus', 'Soleus Capital', array['1802630']::text[]),
  ('affinity', 'Affinity Asset Advisors', array['1773195']::text[]),
  ('kynam', 'Kynam Capital', array['1907884']::text[]),
  ('octagon', 'Octagon Capital Advisors', array['1839435']::text[]),
  ('avidity', 'Avidity Partners', array['1791827']::text[]),
  ('ikarian', 'Ikarian Capital', array['1778253']::text[]),
  ('caligan', 'Caligan Partners', array['1727492']::text[]),
  ('sofinnova', 'Sofinnova Investments', array['1631134']::text[]),
  ('samsara', 'Samsara BioCapital', array['1744967']::text[]),
  ('fairmount', 'Fairmount Funds', array['1802528']::text[]),
  ('deep-track', 'Deep Track Capital', array['1856083']::text[]),
  ('tcg-crossover', 'TCG Crossover', array['1839948']::text[]),
  ('sphera', 'Sphera Funds Management', array['1496201']::text[]),
  ('venrock-hcp', 'Venrock Healthcare Capital Partners', array['1479355', '1602263', '1738053', '1615982']::text[]),
  ('foresite', 'Foresite Capital', array['1581219', '1594912', '1645157', '1704132', '1792206', '2013341']::text[])
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, ciks = EXCLUDED.ciks;

CREATE TABLE IF NOT EXISTS public.smart_money_filings (
  accession_no text PRIMARY KEY,
  manager_id text NOT NULL REFERENCES public.smart_money_managers (id),
  cik text NOT NULL,
  period date NOT NULL,
  filed_at date NOT NULL,
  positions int NOT NULL DEFAULT 0,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smart_money_filings_manager_period_idx
  ON public.smart_money_filings (manager_id, period DESC);

CREATE TABLE IF NOT EXISTS public.smart_money_holdings (
  manager_id text NOT NULL REFERENCES public.smart_money_managers (id),
  cik text NOT NULL,
  period date NOT NULL,
  cusip text NOT NULL,
  shares numeric NOT NULL,
  filed_at date NOT NULL,
  PRIMARY KEY (manager_id, cik, period, cusip)
);

CREATE INDEX IF NOT EXISTS smart_money_holdings_cusip_idx ON public.smart_money_holdings (cusip);
CREATE INDEX IF NOT EXISTS smart_money_holdings_period_idx ON public.smart_money_holdings (period DESC);

CREATE TABLE IF NOT EXISTS public.cusip_tickers (
  cusip text PRIMARY KEY,
  ticker text,
  issuer_name text,
  mapped_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cusip_tickers_ticker_idx ON public.cusip_tickers (ticker);

CREATE TABLE IF NOT EXISTS public.smart_money_signals (
  ticker text PRIMARY KEY,
  period date,
  holders int NOT NULL DEFAULT 0,
  holders_prev int NOT NULL DEFAULT 0,
  new_holders int NOT NULL DEFAULT 0,
  exited_holders int NOT NULL DEFAULT 0,
  added int NOT NULL DEFAULT 0,
  trimmed int NOT NULL DEFAULT 0,
  holder_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  csuite_buys_90d int NOT NULL DEFAULT 0,
  csuite_buy_value_90d numeric NOT NULL DEFAULT 0,
  csuite_buyers text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.smart_money_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_money_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_money_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cusip_tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_money_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_smart_money_managers" ON public.smart_money_managers;
CREATE POLICY "public_select_smart_money_managers" ON public.smart_money_managers
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_select_smart_money_filings" ON public.smart_money_filings;
CREATE POLICY "public_select_smart_money_filings" ON public.smart_money_filings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_select_smart_money_holdings" ON public.smart_money_holdings;
CREATE POLICY "public_select_smart_money_holdings" ON public.smart_money_holdings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_select_cusip_tickers" ON public.cusip_tickers;
CREATE POLICY "public_select_cusip_tickers" ON public.cusip_tickers
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_select_smart_money_signals" ON public.smart_money_signals;
CREATE POLICY "public_select_smart_money_signals" ON public.smart_money_signals
  FOR SELECT TO anon, authenticated USING (true);
