/*
# Stock Opportunity Scanner Database

1. New Tables
- `stocks`: Contains analyzed stocks across biotech, tech, and other sectors with growth/risk metrics and a composite "3x potential" score.
  - id (uuid, PK)
  - ticker (text, unique) - Stock symbol
  - company_name (text) - Full company name
  - sector (text) - Industry sector
  - market_cap (bigint) - Market cap in USD
  - current_price (numeric) - Current stock price
  - revenue_growth_yoy (numeric) - Year-over-year revenue growth %
  - earnings_growth_yoy (numeric) - Year-over-year earnings growth %
  - momentum_score (int) - 0-100 technical momentum score
  - volatility (numeric) - Annualized volatility %
  - debt_to_equity (numeric) - Debt-to-equity ratio
  - beta (numeric) - Beta vs market
  - rd_ratio (numeric) - R&D as % of revenue
  - pipeline_count (int) - Number of products/pipeline candidates
  - cash_runway_months (int) - Months of cash runway
  - three_x_score (int) - Composite 0-100 score for 3x potential
  - risk_level (text) - low/medium/high/extreme
  - thesis (text) - Investment thesis summary
  - updated_at (timestamptz)

- `watchlist`: Tracks stocks the user is watching
  - id (uuid, PK)
  - ticker (text) - Stock symbol being watched
  - added_at (timestamptz)

2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD (single-tenant app, no sign-in).

3. Seed Data
- Inserts ~24 realistic stocks across biotech, tech, AI, clean energy, and fintech sectors with full metrics and scores.
*/

CREATE TABLE IF NOT EXISTS stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text UNIQUE NOT NULL,
  company_name text NOT NULL,
  sector text NOT NULL,
  market_cap bigint NOT NULL,
  current_price numeric NOT NULL,
  revenue_growth_yoy numeric NOT NULL DEFAULT 0,
  earnings_growth_yoy numeric NOT NULL DEFAULT 0,
  momentum_score int NOT NULL DEFAULT 50,
  volatility numeric NOT NULL DEFAULT 50,
  debt_to_equity numeric NOT NULL DEFAULT 1.0,
  beta numeric NOT NULL DEFAULT 1.0,
  rd_ratio numeric NOT NULL DEFAULT 0,
  pipeline_count int NOT NULL DEFAULT 0,
  cash_runway_months int NOT NULL DEFAULT 0,
  three_x_score int NOT NULL DEFAULT 50,
  risk_level text NOT NULL DEFAULT 'medium',
  thesis text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_stocks" ON stocks;
CREATE POLICY "anon_select_stocks" ON stocks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_stocks" ON stocks;
CREATE POLICY "anon_insert_stocks" ON stocks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_stocks" ON stocks;
CREATE POLICY "anon_update_stocks" ON stocks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stocks" ON stocks;
CREATE POLICY "anon_delete_stocks" ON stocks FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(ticker)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_watchlist" ON watchlist;
CREATE POLICY "anon_select_watchlist" ON watchlist FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_watchlist" ON watchlist;
CREATE POLICY "anon_insert_watchlist" ON watchlist FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_watchlist" ON watchlist;
CREATE POLICY "anon_delete_watchlist" ON watchlist FOR DELETE
  TO anon, authenticated USING (true);

-- Seed data
INSERT INTO stocks (ticker, company_name, sector, market_cap, current_price, revenue_growth_yoy, earnings_growth_yoy, momentum_score, volatility, debt_to_equity, beta, rd_ratio, pipeline_count, cash_runway_months, three_x_score, risk_level, thesis) VALUES
('VERV', 'Veracyte Inc.', 'Biotech', 1800000000, 25.30, 35.2, 42.1, 78, 45, 0.15, 1.35, 22.0, 4, 48, 72, 'medium', 'Diagnostics leader with expanding test menu and strong revenue growth. Path to profitability is clear with 35%+ top-line growth and low debt.'),
('CRSP', 'Crispr Therapeutics AG', 'Biotech', 4200000000, 52.10, 287.5, 156.3, 82, 68, 0.05, 2.15, 45.0, 6, 60, 81, 'high', 'Gene editing pioneer with first approved CRISPR therapy. Multiple pipeline readouts could be catalyst-rich. High burn rate but well-funded with 5yr runway.'),
('RXRX', 'Recursion Pharmaceuticals', 'Biotech', 1200000000, 5.80, 92.3, -15.0, 65, 72, 0.08, 1.85, 38.0, 8, 36, 68, 'high', 'AI-driven drug discovery platform. Massive pipeline of 8+ clinical candidates. Revenue growing 90%+ but profitability is far off. Speculative but asymmetric.'),
('NBIX', 'Neurocrine Biosciences', 'Biotech', 9500000000, 387.50, 32.0, 48.5, 75, 38, 0.12, 0.78, 24.0, 5, 72, 69, 'medium', 'Neuroscience specialist with approved products and deep pipeline. Steady revenue growth, strong margins, and reasonable valuation for biotech.'),
('BNTX', 'BioNTech SE', 'Biotech', 18500000000, 75.20, -12.0, -18.0, 58, 55, 0.02, 1.45, 30.0, 7, 120, 61, 'medium', 'COVID vaccine cash cow funding a deep oncology pipeline. Revenue declining post-pandemic but massive cash reserves and mRNA platform optionality.'),
('ARWR', 'Arrowhead Pharmaceuticals', 'Biotech', 5500000000, 43.80, 22.0, -8.0, 71, 58, 0.18, 1.92, 35.0, 5, 42, 64, 'high', 'RNAi platform with multiple late-stage candidates. Partnership revenue growing. Pipeline diversification reduces single-drug risk but still binary.'),
('SDGR', 'Schrödinger Inc.', 'Biotech', 1100000000, 13.40, 18.0, -22.0, 54, 65, 0.22, 1.78, 40.0, 3, 30, 59, 'high', 'Physics-based computational drug discovery with dual software/therapeutics model. Software revenue is recurring and growing. Therapeutics pipeline is early stage.'),
('NVDA', 'NVIDIA Corporation', 'Tech', 2300000000000, 935.00, 206.0, 286.0, 92, 52, 0.04, 1.68, 7.2, 0, 200, 85, 'medium', 'AI chip monopoly with 200%+ revenue growth. Data center demand is insatiable. Valuation is stretched but growth justifies premium. Cyclical risk remains.'),
('PLTR', 'Palantir Technologies', 'Tech', 85000000000, 37.25, 27.8, 162.0, 86, 58, 0.06, 1.55, 18.0, 0, 200, 76, 'medium', 'AI platform with accelerating government and commercial adoption. AIP bootcamps driving expansion. Profitable now with strong cash generation.'),
('SOFI', 'SoFi Technologies', 'Fintech', 12000000000, 11.30, 44.0, 185.0, 80, 62, 0.32, 1.88, 12.0, 0, 200, 70, 'medium', 'Fintech with banking charter, lending growth, and platform expansion. Just achieved profitability. Diversified revenue streams reduce single-product risk.'),
('RKLB', 'Rocket Lab USA', 'Aerospace', 7500000000, 15.80, 71.0, -25.0, 77, 70, 0.14, 2.25, 18.0, 0, 48, 74, 'high', 'Second most frequent US launch provider. Neutron rocket debut in 2025 could be transformational. Space systems revenue growing faster than launch. Pure space play.'),
('MSTR', 'MicroStrategy Inc.', 'Tech', 42000000000, 2240.00, 5.0, 12.0, 73, 82, 1.25, 3.15, 8.0, 0, 200, 66, 'extreme', 'Bitcoin treasury proxy. Stock trades as leveraged BTC exposure. Extreme volatility and debt make this a high-risk bet on crypto prices.'),
('ACHR', 'Archer Aviation', 'Aerospace', 3500000000, 11.90, 0.0, -100.0, 68, 78, 0.08, 2.45, 25.0, 0, 30, 63, 'high', 'eVTOL developer targeting 2025 FAA certification. Pre-revenue but partnerships with United, Southwest. Winner-take-all market potential but regulatory risk.'),
('QMCO', 'Quantum Corporation', 'Tech', 400000000, 6.20, 8.0, -12.0, 48, 72, 0.45, 1.95, 20.0, 0, 24, 52, 'extreme', 'Data storage and quantum-adjacent plays. Small cap with turnaround story. Revenue growth modest but quantum computing hype could drive multiple expansion.'),
('IONS', 'Ionis Pharmaceuticals', 'Biotech', 6500000000, 44.50, 15.0, -5.0, 62, 48, 0.28, 1.05, 33.0, 6, 54, 58, 'medium', 'RNA therapeutics pioneer with broad antisense platform. Multiple partnered programs provide milestone revenue. Independent pipeline maturing toward approvals.'),
('AVPT', 'AvePoint Inc.', 'Tech', 900000000, 5.10, 21.0, 35.0, 67, 55, 0.08, 1.45, 15.0, 0, 60, 63, 'medium', 'SaaS data management for Microsoft ecosystem. 20%+ growth, improving margins, small cap with room to scale. Microsoft partnership provides distribution channel.'),
('RGTI', 'Rigetti Computing', 'Quantum', 350000000, 1.85, 15.0, -20.0, 55, 85, 0.12, 2.80, 40.0, 0, 28, 57, 'extreme', 'Pure-play quantum computing hardware. Pre-revenue, extremely speculative. Could 3x on any breakthrough but could also dilute heavily. Lottery ticket.'),
('QNRX', 'Quantum Research', 'Quantum', 180000000, 2.40, 0.0, -100.0, 52, 88, 0.18, 2.95, 35.0, 0, 18, 49, 'extreme', 'Quantum photonics research. Micro-cap, pre-revenue, maximum speculation. Potential for massive upside on any commercial breakthrough but high dilution risk.'),
('ATOM', 'Atomera Inc.', 'Semiconductor', 300000000, 3.10, 40.0, -50.0, 51, 75, 0.02, 1.92, 30.0, 0, 36, 54, 'extreme', 'Semiconductor materials IP licensing. Pre-revenue licensing model with large potential TAM. Each design win could be worth tens of millions. Very speculative.'),
('PL', 'Planet Labs PBC', 'Space', 1400000000, 2.85, 15.0, -30.0, 59, 68, 0.05, 1.75, 22.0, 0, 42, 55, 'high', 'Daily Earth imaging satellite constellation. Government and defense revenue growing. Path to profitability narrowing but cash runway is adequate. Space data play.'),
('FSLR', 'First Solar Inc.', 'Clean Energy', 18000000000, 153.20, 30.0, 45.0, 74, 48, 0.07, 1.25, 8.0, 0, 200, 65, 'medium', 'US solar manufacturer benefiting from IRA incentives and domestic content requirements. Order book through 2030. Differentiated thin-film tech.'),
('CHPT', 'ChargePoint Holdings', 'Clean Energy', 800000000, 2.10, 28.0, -15.0, 47, 80, 0.35, 2.10, 10.0, 0, 30, 51, 'high', 'EV charging network operator. Revenue growing but losses widening. Infrastructure play on EV adoption. Needs capital raises likely. High dilution risk.'),
('INST', 'Instructure Holdings', 'EdTech', 3000000000, 18.40, 12.0, 18.0, 60, 42, 0.15, 0.85, 14.0, 0, 200, 57, 'low', 'Learning management system (Canvas) with dominant K-12 and higher ed market share. Steady SaaS growth, reasonable valuation. Lower upside but lower risk.'),
('TOST', 'Toast Inc.', 'Fintech', 20000000000, 32.50, 39.0, 55.0, 78, 62, 0.18, 1.72, 16.0, 0, 200, 67, 'medium', 'Restaurant tech platform with rapidly growing locations and payment volume. Approaching profitability. Platform stickiness and TAM expansion into broader SMB.')
ON CONFLICT (ticker) DO NOTHING;
