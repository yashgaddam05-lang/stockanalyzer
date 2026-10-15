/*
# Expand stock universe seed (roadmap item 9)

APPROXIMATE SEED DATA - NOT LIVE MARKET DATA.
All prices, market caps, growth rates, margins, multiples, 52-week ranges and
volumes below are rough, order-of-magnitude approximations entered by hand so
the screener, presets and filters have a meaningful universe before the first
refresh. They are overwritten by the `refresh-stocks` Yahoo Finance edge
function (data_source flips from 'seed' to 'yahoo'). three_x_score and
risk_level are placeholders that are rescored on refresh. Theses are neutral,
factual company descriptions for education only - not investment advice.

Units follow the existing schema: growth rates and margins are percent
(62.5 = 62.5%), debt_to_equity is a ratio, market_cap is USD,
cash_runway_months = 200 means cash-flow positive / not runway constrained.

1. Idempotent ADD COLUMN IF NOT EXISTS for every new column written here
   (definitions identical to 20261015120000_scoring_inputs_and_score_history;
   that migration owns the CHECK constraints).
2. INSERT 113 new US-traded tickers, ON CONFLICT (ticker) DO NOTHING.
3. Fill NULL new columns on the original 24 rows (never overwrites non-NULL).
4. Data fixes: VERV name + inactive (acquired by Eli Lilly, 2025);
   QNRX name/sector; INST inactive (taken private, 2024).

Inserts and NULL-only updates; no rows or columns are removed.
*/

-- 1. Columns (idempotent; identical to the schema-contracts migration)
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS forward_pe numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS price_to_sales numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS peg_ratio numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS target_mean_price numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS gross_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS operating_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS profit_margin numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS fifty_two_week_high numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS fifty_two_week_low numeric;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS avg_volume bigint;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'seed';
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. New tickers (approximate seed values; data_source = 'seed')
INSERT INTO stocks (ticker, company_name, sector, industry, market_cap, current_price, revenue_growth_yoy, earnings_growth_yoy, momentum_score, volatility, debt_to_equity, beta, rd_ratio, pipeline_count, cash_runway_months, three_x_score, risk_level, forward_pe, price_to_sales, peg_ratio, target_mean_price, gross_margin, operating_margin, profit_margin, fifty_two_week_high, fifty_two_week_low, avg_volume, data_source, is_active, thesis) VALUES
('AAPL', 'Apple Inc.', 'Tech', 'Consumer Electronics', 3500000000000, 235, 5, 8, 51, 42, 1.5, 1.2, 8, 0, 200, 56, 'medium', 30, 8.7, 3.75, 253.8, 46, 31, 24, 287.88, 166.85, 55000000, 'seed', true, 'Designs iPhone, Mac and wearables hardware with a growing high-margin services segment built on a large installed base.'),
('MSFT', 'Microsoft Corporation', 'Software', 'Software - Infrastructure', 3700000000000, 500, 15, 14, 55, 37, 0.2, 0.95, 12, 0, 200, 60, 'low', 33, 13, 2.36, 540, 69, 45, 36, 606.25, 363.33, 22000000, 'seed', true, 'Sells cloud infrastructure (Azure), productivity software and enterprise licenses, with AI services layered across its platforms.'),
('GOOGL', 'Alphabet Inc.', 'Communication', 'Internet Content & Information', 2800000000000, 235, 13, 25, 55, 39, 0.1, 1.05, 14, 0, 200, 59, 'medium', 23, 7.5, 0.92, 253.8, 59, 32, 30, 286.11, 169.2, 35000000, 'seed', true, 'Operates Google Search, YouTube and Google Cloud, with advertising as the dominant revenue source and cloud as a growing segment.'),
('AMZN', 'Amazon.com Inc.', 'Consumer', 'Internet Retail', 2400000000000, 225, 11, 30, 54, 44, 0.4, 1.3, 13, 0, 200, 59, 'medium', 32, 3.5, 1.07, 243, 50, 11, 10, 276.75, 158.25, 45000000, 'seed', true, 'Runs a global e-commerce marketplace and AWS, the largest cloud infrastructure provider, plus a fast-growing advertising business.'),
('META', 'Meta Platforms Inc.', 'Communication', 'Internet Content & Information', 1800000000000, 720, 20, 30, 57, 43, 0.25, 1.25, 26, 0, 200, 62, 'medium', 26, 9.5, 0.87, 777.6, 82, 42, 38, 883.8, 508.8, 14000000, 'seed', true, 'Owns Facebook, Instagram and WhatsApp, monetized primarily through targeted digital advertising, while investing heavily in AI and VR.'),
('AVGO', 'Broadcom Inc.', 'Semiconductor', 'Semiconductors', 1600000000000, 340, 25, 40, 59, 41, 0.95, 1.15, 18, 0, 200, 64, 'medium', 35, 25, 0.88, 367.2, 77, 40, 30, 415.65, 242.53, 25000000, 'seed', true, 'Supplies networking and custom AI accelerator chips to hyperscalers and owns an infrastructure software segment including VMware.'),
('TSLA', 'Tesla Inc.', 'Consumer', 'Auto Manufacturers', 1400000000000, 430, -3, -30, 47, 64, 0.15, 2.3, 5, 0, 200, 53, 'medium', 160, 14.5, NULL, 464.4, 17, 6, 6, 550.4, 273.77, 95000000, 'seed', true, 'Manufactures electric vehicles and energy storage systems; valuation reflects expectations for autonomy and robotics beyond auto sales.'),
('TSM', 'Taiwan Semiconductor Manufacturing (ADR)', 'Semiconductor', 'Semiconductors', 1300000000000, 260, 35, 45, 62, 42, 0.2, 1.2, 7, 0, 200, 67, 'medium', 22, 11, 0.49, 280.8, 59, 49, 43, 318.5, 184.6, 15000000, 'seed', true, 'The leading contract chip foundry, manufacturing advanced-node processors for Apple, NVIDIA, AMD and most fabless designers.'),
('LLY', 'Eli Lilly and Company', 'Healthcare', 'Drug Manufacturers - General', 750000000000, 820, 38, 60, 64, 27, 2, 0.45, 24, 12, 200, 69, 'low', 30, 13, 0.5, 885.6, 82, 42, 30, 973.75, 623.2, 4000000, 'seed', true, 'Large pharmaceutical company whose growth is driven by GLP-1 obesity and diabetes drugs Mounjaro and Zepbound.'),
('V', 'Visa Inc.', 'Fintech', 'Credit Services', 670000000000, 345, 10, 12, 53, 37, 0.55, 0.95, 0, 0, 200, 58, 'low', 28, 17, 2.33, 372.6, 80, 67, 54, 418.31, 250.7, 7000000, 'seed', true, 'Operates a global card payments network earning fees on transaction volume, with no direct credit risk on its own balance sheet.'),
('WMT', 'Walmart Inc.', 'Consumer', 'Discount Stores', 800000000000, 100, 5, 10, 52, 31, 0.7, 0.65, 0, 0, 200, 56, 'low', 38, 1.1, 3.8, 108, 25, 4.3, 2.9, 119.75, 74.67, 18000000, 'seed', true, 'Largest US retailer by revenue, combining grocery scale with growing e-commerce, advertising and membership income.'),
('ORCL', 'Oracle Corporation', 'Software', 'Software - Infrastructure', 800000000000, 280, 12, 15, 54, 45, 4.5, 1.35, 16, 0, 200, 59, 'medium', 35, 13, 2.33, 302.4, 70, 31, 21, 345.1, 196, 20000000, 'seed', true, 'Sells database software and enterprise applications and is rapidly expanding its cloud infrastructure capacity for AI workloads.'),
('MA', 'Mastercard Inc.', 'Fintech', 'Credit Services', 530000000000, 570, 13, 15, 54, 38, 2.4, 1, 0, 0, 200, 59, 'medium', 33, 17.5, 2.2, 615.6, 77, 58, 45, 692.55, 412.3, 3000000, 'seed', true, 'Runs the second-largest global card network, earning fees on cross-border and domestic transaction volume plus value-added services.'),
('NFLX', 'Netflix Inc.', 'Communication', 'Entertainment', 520000000000, 1200, 15, 30, 56, 44, 0.6, 1.3, 7, 0, 200, 60, 'medium', 40, 12, 1.33, 1296, 47, 30, 25, 1476, 844, 4000000, 'seed', true, 'Global subscription streaming service that has added advertising tiers and paid-sharing to grow revenue per member.'),
('XOM', 'Exxon Mobil Corporation', 'Energy', 'Oil & Gas Integrated', 470000000000, 110, -2, -10, 48, 35, 0.15, 0.85, 0, 0, 200, 54, 'low', 15, 1.4, NULL, 118.8, 33, 13, 10, 132.82, 80.67, 15000000, 'seed', true, 'Integrated oil major with upstream production, refining and chemicals; returns are sensitive to crude oil and natural gas prices.'),
('COST', 'Costco Wholesale Corporation', 'Consumer', 'Discount Stores', 420000000000, 940, 8, 10, 52, 34, 0.3, 0.8, 0, 0, 200, 57, 'low', 48, 1.5, 4.8, 1015.2, 13, 3.8, 2.9, 1132.7, 692.47, 2000000, 'seed', true, 'Membership warehouse retailer whose profits come largely from recurring membership fees and high inventory turnover.'),
('JNJ', 'Johnson & Johnson', 'Healthcare', 'Drug Manufacturers - General', 420000000000, 175, 5, 6, 51, 27, 0.55, 0.45, 15, 10, 200, 56, 'low', 15, 4.5, 2.5, 189, 69, 25, 20, 207.81, 133, 8000000, 'seed', true, 'Diversified healthcare company focused on pharmaceuticals and medical technology after spinning off its consumer health unit.'),
('ABBV', 'AbbVie Inc.', 'Healthcare', 'Drug Manufacturers - General', 370000000000, 210, 7, 10, 52, 29, 5, 0.55, 14, 9, 200, 57, 'low', 17, 6.3, 1.7, 226.8, 70, 30, 8, 250.43, 158.2, 6000000, 'seed', true, 'Pharmaceutical company transitioning from Humira to newer immunology drugs Skyrizi and Rinvoq, plus neuroscience and aesthetics.'),
('CVX', 'Chevron Corporation', 'Energy', 'Oil & Gas Integrated', 300000000000, 155, -3, -15, 48, 36, 0.2, 0.9, 0, 0, 200, 53, 'low', 17, 1.5, NULL, 167.4, 35, 11, 8, 187.55, 113.15, 8000000, 'seed', true, 'Integrated oil and gas producer with Permian Basin and international assets; earnings track commodity prices.'),
('GE', 'GE Aerospace', 'Aerospace', 'Aerospace & Defense', 300000000000, 280, 18, 30, 56, 44, 1, 1.3, 3, 0, 200, 61, 'medium', 50, 7, 1.67, 302.4, 38, 20, 17, 344.4, 196.93, 5000000, 'seed', true, 'Manufactures and services commercial and military jet engines, with a large installed base generating aftermarket revenue.'),
('UNH', 'UnitedHealth Group Inc.', 'Healthcare', 'Healthcare Plans', 300000000000, 330, 10, -35, 51, 29, 0.8, 0.55, 0, 0, 200, 58, 'low', 18, 0.7, NULL, 356.4, 20, 6, 4, 393.53, 248.6, 9000000, 'seed', true, 'Largest US health insurer, also operating Optum health services and pharmacy benefits; recent margins pressured by medical cost trends.'),
('AMD', 'Advanced Micro Devices Inc.', 'Semiconductor', 'Semiconductors', 260000000000, 160, 30, 40, 61, 56, 0.05, 1.9, 22, 0, 200, 66, 'medium', 35, 8.5, 0.88, 172.8, 53, 10, 10, 201.6, 106.13, 50000000, 'seed', true, 'Designs CPUs and GPUs for PCs, servers and AI data centers, competing with Intel in processors and NVIDIA in accelerators.'),
('CRM', 'Salesforce Inc.', 'Software', 'Software - Application', 240000000000, 250, 9, 15, 53, 43, 0.2, 1.25, 14, 0, 200, 58, 'medium', 23, 6.2, 1.53, 270, 77, 20, 16, 306.88, 176.67, 7000000, 'seed', true, 'Leading CRM software vendor selling sales, service and marketing cloud applications on a subscription basis.'),
('CAT', 'Caterpillar Inc.', 'Industrials', 'Farm & Heavy Construction Machinery', 220000000000, 470, -2, -5, 49, 40, 2, 1.1, 3, 0, 200, 54, 'medium', 24, 3.5, NULL, 507.6, 34, 19, 15, 573.4, 336.83, 3000000, 'seed', true, 'Manufactures construction, mining and energy equipment, with demand tied to infrastructure spending and commodity cycles.'),
('RTX', 'RTX Corporation', 'Aerospace', 'Aerospace & Defense', 210000000000, 158, 8, 10, 52, 33, 0.65, 0.75, 4, 0, 200, 57, 'low', 24, 2.6, 2.4, 170.64, 20, 10, 6, 190, 116.92, 5000000, 'seed', true, 'Defense and commercial aerospace supplier owning Pratt & Whitney engines, Collins Aerospace and Raytheon missile systems.'),
('UBER', 'Uber Technologies Inc.', 'Tech', 'Software - Application', 200000000000, 95, 18, 60, 58, 46, 0.5, 1.4, 7, 0, 200, 62, 'medium', 30, 4.2, 0.5, 102.6, 39, 10, 22, 117.33, 66.18, 20000000, 'seed', true, 'Operates ride-hailing and food-delivery marketplaces globally and has recently reached consistent GAAP profitability.'),
('SHOP', 'Shopify Inc.', 'Software', 'Software - Application', 200000000000, 150, 26, 20, 58, 72, 0.1, 2.7, 17, 0, 200, 64, 'medium', 90, 18, 4.5, 162, 49, 12, 18, 195, 91.5, 10000000, 'seed', true, 'Provides e-commerce software and payments for merchants of all sizes, earning subscription and transaction-based revenue.'),
('NOW', 'ServiceNow Inc.', 'Software', 'Software - Application', 190000000000, 920, 21, 25, 57, 38, 0.15, 1, 22, 0, 200, 62, 'medium', 55, 15, 2.2, 993.6, 79, 13, 14, 1117.8, 665.47, 1300000, 'seed', true, 'Sells workflow automation software for IT, HR and customer service on a subscription model with high retention.'),
('MU', 'Micron Technology Inc.', 'Semiconductor', 'Semiconductors', 180000000000, 160, 45, 200, 73, 46, 0.25, 1.4, 10, 0, 200, 73, 'medium', 11, 4.6, 0.06, 172.8, 40, 26, 22, 197.6, 111.47, 25000000, 'seed', true, 'Memory chip maker (DRAM and NAND) benefiting from high-bandwidth memory demand for AI servers; historically cyclical.'),
('VZ', 'Verizon Communications Inc.', 'Communication', 'Telecom Services', 180000000000, 43, 1, 3, 50, 26, 1.6, 0.4, 0, 0, 200, 55, 'low', 9, 1.3, 3, 46.44, 59, 22, 13, 50.96, 32.82, 18000000, 'seed', true, 'US wireless and broadband carrier with stable subscription cash flows, a high dividend yield and significant debt.'),
('ANET', 'Arista Networks Inc.', 'Tech', 'Computer Hardware', 170000000000, 135, 25, 30, 59, 46, 0, 1.4, 15, 0, 200, 64, 'medium', 45, 21, 1.5, 145.8, 64, 42, 40, 166.73, 94.05, 8000000, 'seed', true, 'Supplies high-speed Ethernet switches and software to cloud and AI data center operators.'),
('QCOM', 'Qualcomm Inc.', 'Semiconductor', 'Semiconductors', 170000000000, 160, 10, 15, 53, 43, 0.55, 1.25, 21, 0, 200, 58, 'medium', 14, 4, 0.93, 172.8, 56, 28, 26, 196.4, 113.07, 8000000, 'seed', true, 'Designs smartphone processors and modems and licenses wireless patents, diversifying into auto and PC chips.'),
('ISRG', 'Intuitive Surgical Inc.', 'Healthcare', 'Medical Instruments & Supplies', 170000000000, 480, 20, 20, 57, 45, 0, 1.35, 12, 0, 200, 62, 'medium', 65, 19, 3.25, 518.4, 66, 29, 28, 591.6, 336, 2000000, 'seed', true, 'Makes the da Vinci robotic surgery system and earns recurring revenue from instruments and service per procedure.'),
('ARM', 'Arm Holdings plc (ADR)', 'Semiconductor', 'Semiconductors', 160000000000, 150, 25, 30, 59, 88, 0.05, 3.5, 50, 0, 200, 64, 'medium', 75, 40, 2.5, 162, 96, 20, 18, 201, 83.5, 6000000, 'seed', true, 'Licenses CPU architecture used in nearly all smartphones and a growing share of data center and PC chips.'),
('AMGN', 'Amgen Inc.', 'Biotech', 'Drug Manufacturers - General', 160000000000, 295, 8, 5, 52, 28, 6.5, 0.5, 18, 15, 200, 57, 'low', 14, 4.6, 2.8, 318.6, 70, 25, 14, 351.05, 223.22, 3000000, 'seed', true, 'Large biotechnology company with established bone, cardiovascular and oncology drugs and an obesity candidate in development.'),
('GILD', 'Gilead Sciences Inc.', 'Biotech', 'Drug Manufacturers - General', 145000000000, 115, 5, 10, 52, 24, 1.1, 0.3, 20, 12, 200, 56, 'low', 14, 5, 1.4, 124.2, 78, 40, 22, 135.7, 88.55, 7000000, 'seed', true, 'Biopharmaceutical company with a leading HIV franchise, including long-acting prevention, and a growing oncology portfolio.'),
('ETN', 'Eaton Corporation plc', 'Industrials', 'Specialty Industrial Machinery', 140000000000, 360, 9, 12, 53, 40, 0.55, 1.1, 3, 0, 200, 58, 'medium', 32, 5.5, 2.67, 388.8, 38, 20, 15, 439.2, 258, 3000000, 'seed', true, 'Power management company selling electrical equipment for data centers, utilities and commercial buildings.'),
('PFE', 'Pfizer Inc.', 'Healthcare', 'Drug Manufacturers - General', 140000000000, 25, 3, 5, 51, 29, 0.7, 0.55, 17, 20, 200, 56, 'low', 8, 2.2, 1.6, 27, 72, 25, 13, 29.81, 18.83, 40000000, 'seed', true, 'Large pharmaceutical company with lower post-pandemic COVID revenue, upcoming patent expirations and a deal-driven pipeline.'),
('SPOT', 'Spotify Technology S.A.', 'Communication', 'Internet Content & Information', 140000000000, 690, 15, 90, 59, 46, 0.3, 1.4, 8, 0, 200, 61, 'medium', 60, 7, 0.67, 745.2, 32, 11, 8, 852.15, 480.7, 2000000, 'seed', true, 'Largest global audio streaming platform, recently profitable as it raises prices and grows premium subscribers.'),
('PANW', 'Palo Alto Networks Inc.', 'Software', 'Software - Infrastructure', 130000000000, 195, 15, 15, 55, 36, 0.05, 0.9, 20, 0, 200, 60, 'low', 55, 14, 3.67, 210.6, 73, 12, 20, 235.95, 142.35, 6000000, 'seed', true, 'Cybersecurity vendor consolidating firewall, cloud security and security-operations products into a platform.'),
('DE', 'Deere & Company', 'Industrials', 'Farm & Heavy Construction Machinery', 130000000000, 480, -10, -25, 45, 37, 2.5, 0.95, 5, 0, 200, 51, 'low', 25, 2.8, NULL, 518.4, 37, 18, 12, 582, 348.8, 1500000, 'seed', true, 'Manufactures agricultural, construction and forestry equipment, with demand tied to farm income cycles.'),
('HON', 'Honeywell International Inc.', 'Industrials', 'Conglomerates', 135000000000, 210, 6, 5, 52, 38, 1.6, 1, 4, 0, 200, 57, 'medium', 21, 3.5, 4.2, 226.8, 38, 21, 15, 255.15, 151.9, 4000000, 'seed', true, 'Industrial conglomerate in aerospace, building automation and process technology, undergoing a planned breakup into separate companies.'),
('CRWD', 'CrowdStrike Holdings Inc.', 'Software', 'Software - Infrastructure', 120000000000, 480, 22, 20, 57, 57, 0.2, 1.2, 22, 0, 200, 48, 'high', 110, 26, 5.5, 600, 75, -3, -3, 606, 316.8, 3000000, 'seed', true, 'Cloud-native endpoint security platform with high recurring revenue; trades at a premium multiple to its revenue.'),
('VRTX', 'Vertex Pharmaceuticals Inc.', 'Biotech', 'Biotechnology', 110000000000, 420, 10, 15, 53, 26, 0.1, 0.4, 30, 10, 200, 58, 'low', 25, 9.5, 1.67, 453.6, 86, 38, 30, 497.7, 320.6, 1500000, 'seed', true, 'Biotech with a dominant cystic fibrosis franchise expanding into pain, gene editing and kidney disease.'),
('LMT', 'Lockheed Martin Corporation', 'Aerospace', 'Aerospace & Defense', 110000000000, 470, 5, -20, 50, 26, 3.5, 0.4, 2, 0, 200, 56, 'low', 17, 1.5, NULL, 507.6, 10, 9, 6, 556.95, 358.77, 1300000, 'seed', true, 'Largest US defense contractor, producing the F-35, missiles and space systems under long-term government contracts.'),
('INTC', 'Intel Corporation', 'Semiconductor', 'Semiconductors', 105000000000, 24, -3, -80, 45, 57, 0.5, 1.2, 30, 0, 60, 38, 'high', 45, 2, NULL, 30, 32, -5, -35, 30.3, 15.84, 80000000, 'seed', true, 'Legacy x86 chip leader undergoing a costly turnaround of its manufacturing and foundry business, with depressed margins.'),
('NKE', 'Nike Inc.', 'Consumer', 'Footwear & Accessories', 105000000000, 70, -8, -40, 45, 39, 0.85, 1.05, 0, 0, 200, 51, 'medium', 35, 2.2, NULL, 75.6, 42, 7, 7, 85.23, 50.4, 12000000, 'seed', true, 'Global athletic footwear and apparel brand working through a turnaround of its product lineup and wholesale relationships.'),
('HOOD', 'Robinhood Markets Inc.', 'Fintech', 'Capital Markets', 100000000000, 115, 45, 100, 68, 64, 0.5, 2.3, 15, 0, 200, 72, 'medium', 60, 25, 0.6, 124.2, 90, 45, 50, 147.2, 73.22, 40000000, 'seed', true, 'Commission-free retail brokerage earning revenue from order flow, interest income, crypto trading and subscriptions.'),
('CEG', 'Constellation Energy Corporation', 'Energy', 'Utilities - Renewable', 100000000000, 320, 6, 30, 53, 40, 0.75, 1.1, 0, 0, 200, 57, 'medium', 32, 4.2, 1.07, 345.6, 25, 15, 14, 390.4, 229.33, 3000000, 'seed', true, 'Largest US nuclear power generator, signing long-term power agreements with data center operators.'),
('SBUX', 'Starbucks Corporation', 'Consumer', 'Restaurants', 95000000000, 84, 1, -30, 48, 38, -3, 1, 0, 0, 200, 54, 'medium', 30, 2.6, NULL, 90.72, 25, 9, 6, 102.06, 60.76, 10000000, 'seed', true, 'Global coffeehouse chain undergoing an operational turnaround to reverse declining same-store traffic.'),
('DELL', 'Dell Technologies Inc.', 'Tech', 'Computer Hardware', 90000000000, 130, 15, 15, 55, 38, -15, 1, 3, 0, 200, 60, 'medium', 13, 0.9, 0.87, 140.4, 21, 7, 5, 157.95, 94.03, 6000000, 'seed', true, 'PC and server maker experiencing strong AI server demand, with thin margins typical of hardware assembly.'),
('CVS', 'CVS Health Corporation', 'Healthcare', 'Healthcare Plans', 90000000000, 70, 6, 15, 52, 30, 0.9, 0.6, 0, 0, 200, 57, 'low', 11, 0.2, 0.73, 75.6, 14, 3, 1.5, 83.65, 52.5, 9000000, 'seed', true, 'Integrated pharmacy, pharmacy benefit manager and Aetna insurer; trades at a low earnings multiple relative to peers.'),
('COIN', 'Coinbase Global Inc.', 'Fintech', 'Financial Data & Stock Exchanges', 85000000000, 330, 40, 50, 64, 86, 0.4, 3.4, 20, 0, 200, 69, 'medium', 55, 13, 1.1, 356.4, 85, 30, 35, 440.55, 185.9, 10000000, 'seed', true, 'Largest US crypto exchange; revenue is highly sensitive to crypto prices and trading volumes.'),
('SNOW', 'Snowflake Inc.', 'Software', 'Software - Application', 75000000000, 225, 26, 30, 59, 55, 1, 1.1, 45, 0, 200, 49, 'high', 200, 17, 6.67, 281.25, 67, -38, -36, 282.94, 150, 6000000, 'seed', true, 'Cloud data warehouse platform billing on consumption; growing quickly but not yet GAAP profitable.'),
('NET', 'Cloudflare Inc.', 'Software', 'Software - Infrastructure', 75000000000, 215, 27, 30, 59, 69, 1.3, 1.8, 22, 0, 200, 49, 'high', 200, 40, 6.67, 268.75, 76, -6, -5, 277.89, 133.3, 3000000, 'seed', true, 'Operates a global edge network providing security, performance and developer services; trades at a high revenue multiple.'),
('NU', 'Nu Holdings Ltd.', 'Fintech', 'Banks - Regional', 70000000000, 15, 35, 50, 63, 40, 0.3, 1.1, 5, 0, 200, 68, 'medium', 18, 6, 0.36, 16.2, 50, 40, 28, 18.3, 10.75, 40000000, 'seed', true, 'Digital bank serving over 100 million customers in Brazil, Mexico and Colombia with credit cards and accounts.'),
('PYPL', 'PayPal Holdings Inc.', 'Fintech', 'Credit Services', 65000000000, 68, 4, 10, 51, 46, 0.55, 1.4, 9, 0, 200, 56, 'medium', 12, 2, 1.2, 73.44, 46, 18, 14, 83.98, 47.37, 15000000, 'seed', true, 'Online payments company (PayPal, Venmo, Braintree) with slower growth and a low valuation multiple relative to its history.'),
('VST', 'Vistra Corp.', 'Energy', 'Utilities - Independent Power Producers', 65000000000, 190, 15, 40, 56, 42, 3.5, 1.2, 0, 0, 200, 60, 'medium', 25, 3.5, 0.62, 205.2, 40, 22, 12, 232.75, 134.9, 6000000, 'seed', true, 'Independent power producer with gas and nuclear generation, benefiting from rising US electricity demand.'),
('REGN', 'Regeneron Pharmaceuticals Inc.', 'Biotech', 'Biotechnology', 60000000000, 560, 3, -10, 50, 25, 0.1, 0.35, 35, 30, 200, 55, 'low', 13, 4.3, NULL, 604.8, 86, 28, 30, 662.2, 429.33, 1000000, 'seed', true, 'Biotech with Eylea and Dupixent franchises; faces biosimilar competition for Eylea while expanding its antibody pipeline.'),
('ALNY', 'Alnylam Pharmaceuticals Inc.', 'Biotech', 'Biotechnology', 60000000000, 460, 60, 150, 75, 24, 6, 0.3, 40, 10, 200, 78, 'low', 90, 20, 0.6, 496.8, 82, 5, 2, 542.8, 354.2, 1000000, 'seed', true, 'RNAi therapeutics leader whose growth is driven by Amvuttra in ATTR cardiomyopathy; recently near GAAP breakeven.'),
('MRVL', 'Marvell Technology Inc.', 'Semiconductor', 'Semiconductors', 60000000000, 70, 40, 80, 66, 69, 0.3, 1.8, 28, 0, 200, 55, 'high', 25, 8.5, 0.31, 87.5, 50, -5, -5, 90.47, 43.4, 15000000, 'seed', true, 'Designs data center networking, storage and custom AI chips; earnings depend on a small number of hyperscale customers.'),
('CMG', 'Chipotle Mexican Grill Inc.', 'Consumer', 'Restaurants', 55000000000, 42, 7, 10, 52, 39, 0, 1.05, 0, 0, 200, 57, 'medium', 35, 4.6, 3.5, 45.36, 27, 17, 13, 51.13, 30.24, 25000000, 'seed', true, 'Fast-casual restaurant chain with company-owned locations and strong unit economics; recent same-store sales have slowed.'),
('AXON', 'Axon Enterprise Inc.', 'Industrials', 'Aerospace & Defense', 55000000000, 720, 33, 30, 61, 40, 0.3, 1.1, 20, 0, 200, 67, 'medium', 110, 22, 3.67, 777.6, 61, -1, 8, 878.4, 516, 800000, 'seed', true, 'Sells TASER devices, body cameras and cloud evidence software to law enforcement on multi-year subscription contracts.'),
('VRT', 'Vertiv Holdings Co.', 'Industrials', 'Electrical Equipment & Parts', 50000000000, 135, 25, 40, 59, 52, 1.2, 1.7, 4, 0, 200, 64, 'medium', 35, 5.5, 0.88, 145.8, 36, 18, 10, 168.75, 91.35, 8000000, 'seed', true, 'Supplies power and thermal management equipment for data centers, including liquid cooling for AI servers.'),
('DDOG', 'Datadog Inc.', 'Software', 'Software - Application', 48000000000, 140, 25, 10, 58, 42, 0.5, 1.2, 30, 0, 200, 64, 'medium', 85, 15, 8.5, 151.2, 80, -1, 6, 171.5, 99.4, 4000000, 'seed', true, 'Cloud observability and monitoring platform with usage-based pricing and strong net revenue retention.'),
('OXY', 'Occidental Petroleum Corporation', 'Energy', 'Oil & Gas E&P', 45000000000, 45, -5, -30, 47, 35, 0.7, 0.85, 0, 0, 200, 52, 'medium', 16, 1.7, NULL, 48.6, 35, 20, 8, 54.34, 33, 9000000, 'seed', true, 'Oil and gas producer focused on the Permian Basin, with a large chemicals unit and significant debt from its Anadarko acquisition.'),
('F', 'Ford Motor Company', 'Consumer', 'Auto Manufacturers', 45000000000, 11, 2, -20, 49, 46, 3.5, 1.4, 4, 0, 200, 55, 'medium', 8, 0.2, NULL, 11.88, 8, 2, 2, 13.59, 7.66, 60000000, 'seed', true, 'Legacy automaker profitable in trucks and fleet services while its electric vehicle unit operates at a loss; low earnings multiple.'),
('ZS', 'Zscaler Inc.', 'Software', 'Software - Infrastructure', 45000000000, 290, 23, 20, 57, 53, 0.5, 1, 18, 0, 200, 48, 'high', 75, 16, 3.75, 362.5, 77, -3, -2, 363.23, 195.27, 1500000, 'seed', true, 'Cloud security platform routing enterprise traffic through its zero-trust network, sold as subscriptions.'),
('RDDT', 'Reddit Inc.', 'Communication', 'Internet Content & Information', 40000000000, 220, 60, 200, 78, 62, 0, 2.2, 35, 0, 200, 78, 'high', 70, 22, 0.35, 237.6, 91, 20, 25, 280.5, 141.53, 7000000, 'seed', true, 'Community discussion platform monetizing through advertising and data licensing for AI model training.'),
('INSM', 'Insmed Inc.', 'Biotech', 'Biotechnology', 30000000000, 150, 20, -10, 55, 52, 1.2, 0.95, 120, 5, 30, 47, 'high', NULL, 70, NULL, 187.5, 76, -180, -200, 187.5, 101.5, 2000000, 'seed', true, 'Biotech whose recently approved bronchiectasis drug brensocatib is expected to drive growth beyond its Arikayce franchise.'),
('SMCI', 'Super Micro Computer Inc.', 'Tech', 'Computer Hardware', 28000000000, 47, 25, -30, 56, 48, 0.25, 1.5, 2, 0, 200, 63, 'medium', 18, 1.3, NULL, 50.76, 10, 5, 5, 58.28, 32.43, 30000000, 'seed', true, 'Assembles high-density servers for AI and cloud customers, operating on thin hardware margins with volatile results.'),
('DXCM', 'DexCom Inc.', 'Healthcare', 'Medical Devices', 27000000000, 70, 12, 15, 54, 41, 1, 1.15, 12, 0, 200, 59, 'medium', 35, 6, 2.33, 75.6, 61, 17, 15, 85.58, 49.93, 4000000, 'seed', true, 'Makes continuous glucose monitors for diabetes patients, expanding into non-insulin and over-the-counter markets.'),
('AFRM', 'Affirm Holdings Inc.', 'Fintech', 'Credit Services', 25000000000, 75, 40, 150, 69, 86, 2.8, 3.4, 18, 0, 200, 70, 'high', 90, 7.5, 0.6, 81, 45, 5, 3, 100.13, 42.25, 7000000, 'seed', true, 'Buy-now-pay-later lender partnering with merchants such as Amazon and Shopify; recently reached GAAP profitability.'),
('MDB', 'MongoDB Inc.', 'Software', 'Software - Infrastructure', 25000000000, 310, 20, 15, 56, 59, 0, 1.3, 25, 0, 200, 47, 'high', 85, 11, 5.67, 387.5, 73, -10, -6, 392.93, 202.53, 1500000, 'seed', true, 'Document database company whose Atlas cloud service drives consumption-based subscription growth.'),
('DKNG', 'DraftKings Inc.', 'Consumer', 'Gambling', 22000000000, 45, 30, 150, 66, 69, 1.8, 1.8, 10, 0, 200, 52, 'high', 30, 3.6, 0.2, 56.25, 43, -3, -4, 58.16, 27.9, 8000000, 'seed', true, 'Online sports betting and iGaming operator in legalized US states, approaching sustained profitability.'),
('PINS', 'Pinterest Inc.', 'Communication', 'Internet Content & Information', 22000000000, 33, 16, 25, 56, 38, 0.05, 1, 26, 0, 200, 61, 'medium', 15, 5.5, 0.6, 35.64, 80, 8, 50, 40.1, 23.87, 10000000, 'seed', true, 'Visual discovery platform monetized by advertising, with most revenue growth from international users.'),
('LULU', 'Lululemon Athletica Inc.', 'Consumer', 'Apparel Retail', 20000000000, 170, 7, -5, 51, 42, 0, 1.2, 0, 0, 200, 57, 'medium', 13, 1.9, NULL, 183.6, 58, 22, 16, 208.25, 120.7, 4000000, 'seed', true, 'Premium athletic apparel brand with strong margins but slowing US growth and rising competition.'),
('ON', 'ON Semiconductor Corporation', 'Semiconductor', 'Semiconductors', 20000000000, 50, -15, -40, 43, 52, 0.4, 1.7, 12, 0, 200, 49, 'medium', 18, 3.4, NULL, 54, 38, 10, 8, 62.5, 33.83, 8000000, 'seed', true, 'Power and sensing chip supplier for automotive and industrial markets, recovering from an EV-driven inventory downturn.'),
('ASTS', 'AST SpaceMobile Inc.', 'Space', 'Communication Equipment', 18000000000, 55, 0, -30, 48, 81, 0.2, 2.4, 0, 0, 36, 44, 'high', NULL, 500, NULL, 68.75, NULL, NULL, NULL, 72.74, 31.9, 15000000, 'seed', true, 'Building a satellite constellation designed to connect directly to standard smartphones; pre-commercial with heavy capex.'),
('IONQ', 'IonQ Inc.', 'Quantum', 'Computer Hardware', 18000000000, 60, 90, -50, 74, 85, 0.05, 2.6, 180, 0, 72, 67, 'high', NULL, 170, NULL, 75, 50, NULL, NULL, 79.95, 34, 25000000, 'seed', true, 'Trapped-ion quantum computing company with early commercial revenue and a large cash balance from equity raises.'),
('BE', 'Bloom Energy Corporation', 'Clean Energy', 'Electrical Equipment & Parts', 18000000000, 80, 30, 200, 69, 74, 2.5, 2.8, 8, 0, 200, 72, 'high', 90, 10, 0.45, 86.4, 28, 5, 2, 104.4, 48.27, 12000000, 'seed', true, 'Manufactures solid-oxide fuel cells for on-site power generation, with growing demand from data centers.'),
('OKLO', 'Oklo Inc.', 'Energy', 'Utilities - Regulated Electric', 15000000000, 100, 0, -50, 47, 83, 0, 2.5, 0, 0, 60, 44, 'high', NULL, NULL, NULL, 125, NULL, NULL, NULL, 132.75, 57.33, 15000000, 'seed', true, 'Pre-revenue developer of small fast-fission nuclear reactors targeting data center and industrial power customers.'),
('TEM', 'Tempus AI Inc.', 'Healthcare', 'Health Information Services', 14000000000, 80, 80, 40, 76, 95, 1.5, 4, 15, 0, 36, 68, 'high', NULL, 11, NULL, 100, 60, -20, -25, 108.6, 42.67, 6000000, 'seed', true, 'Genomic testing and clinical data company applying AI to precision oncology; revenue is growing but losses continue.'),
('ROKU', 'Roku Inc.', 'Communication', 'Entertainment', 14000000000, 100, 15, 90, 59, 71, 0.2, 1.9, 22, 0, 200, 51, 'high', 200, 3.2, 2.22, 125, 44, -3, -1, 129.75, 61.33, 3000000, 'seed', true, 'Leading US streaming TV operating system, earning platform revenue from advertising and content distribution.'),
('DUOL', 'Duolingo Inc.', 'EdTech', 'Software - Application', 13000000000, 280, 40, 80, 66, 36, 0.1, 0.9, 28, 0, 200, 75, 'medium', 60, 13, 0.75, 302.4, 72, 13, 30, 338.8, 204.4, 1000000, 'seed', true, 'Gamified language-learning app with a freemium model converting users to paid subscriptions; profitable and growing quickly.'),
('JOBY', 'Joby Aviation Inc.', 'Aerospace', 'Airports & Air Services', 12000000000, 15, 0, -10, 49, 79, 0.05, 2.3, 0, 0, 30, 44, 'high', NULL, NULL, NULL, 18.75, NULL, NULL, NULL, 19.76, 8.8, 20000000, 'seed', true, 'Developing an electric vertical take-off aircraft for air taxi service; pre-revenue and dependent on FAA certification.'),
('KTOS', 'Kratos Defense & Security Solutions Inc.', 'Aerospace', 'Aerospace & Defense', 12000000000, 75, 10, 20, 54, 40, 0.15, 1.1, 4, 0, 200, 63, 'medium', 100, 9.5, 5, 81, 25, 3, 1, 91.5, 53.75, 3000000, 'seed', true, 'Defense contractor focused on drones, hypersonic systems and satellite communications, trading at a high earnings multiple.'),
('CELH', 'Celsius Holdings Inc.', 'Consumer', 'Beverages - Non-Alcoholic', 12000000000, 50, 40, 10, 62, 54, 0.3, 1.8, 0, 0, 200, 74, 'medium', 40, 6, 4, 54, 51, 15, 8, 62.75, 33.5, 6000000, 'seed', true, 'Fitness energy drink brand distributed by PepsiCo, expanding through its acquisition of Alani Nu.'),
('HIMS', 'Hims & Hers Health Inc.', 'Healthcare', 'Health Information Services', 11000000000, 50, 70, 100, 76, 60, 1, 2.1, 0, 0, 200, 83, 'high', 60, 5, 0.6, 54, 76, 6, 10, 63.5, 32.5, 25000000, 'seed', true, 'Direct-to-consumer telehealth platform selling subscriptions for hair, sexual health, mental health and weight-loss treatments.'),
('EXEL', 'Exelixis Inc.', 'Biotech', 'Biotechnology', 11000000000, 40, 12, 60, 56, 27, 0.1, 0.45, 25, 6, 200, 64, 'medium', 15, 4.6, 0.25, 43.2, 96, 35, 28, 47.5, 30.4, 3000000, 'seed', true, 'Oncology biotech with the profitable Cabometyx franchise funding development of next-generation candidate zanzalintinib.'),
('MRNA', 'Moderna Inc.', 'Biotech', 'Biotechnology', 10000000000, 26, -40, 10, 38, 65, 0.05, 1.6, 110, 30, 30, 35, 'high', NULL, 4, NULL, 32.5, 30, -120, -110, 33.35, 16.47, 10000000, 'seed', true, 'mRNA vaccine developer with sharply declining COVID revenue, high R&D spend and a pipeline spanning respiratory and oncology vaccines.'),
('SMR', 'NuScale Power Corporation', 'Energy', 'Specialty Industrial Machinery', 10000000000, 35, 100, -30, 78, 83, 0, 2.5, 60, 0, 48, 68, 'high', NULL, 200, NULL, 43.75, 30, NULL, NULL, 46.46, 20.07, 15000000, 'seed', true, 'Developer of small modular nuclear reactors with the first NRC-approved SMR design; early revenue, no commercial plants yet.'),
('LSCC', 'Lattice Semiconductor Corporation', 'Semiconductor', 'Semiconductors', 9000000000, 65, -10, -30, 45, 48, 0, 1.5, 32, 0, 200, 56, 'medium', 50, 18, NULL, 70.2, 68, 5, 5, 80.6, 44.85, 2000000, 'seed', true, 'Designs low-power FPGAs for industrial, auto and communications applications, recovering from an inventory correction.'),
('QBTS', 'D-Wave Quantum Inc.', 'Quantum', 'Computer Hardware', 8000000000, 25, 100, -50, 77, 89, 0.1, 2.8, 150, 0, 72, 68, 'high', NULL, 350, NULL, 31.25, 64, NULL, NULL, 33.56, 13.83, 60000000, 'seed', true, 'Builds quantum annealing computers sold through cloud access; small revenue base and heavy reliance on equity funding.'),
('ELF', 'e.l.f. Beauty Inc.', 'Consumer', 'Household & Personal Products', 7000000000, 120, 20, -10, 55, 52, 0.4, 1.7, 0, 0, 200, 67, 'medium', 35, 4.8, NULL, 129.6, 70, 12, 8, 150, 81.2, 2000000, 'seed', true, 'Value-priced cosmetics brand gaining share with younger shoppers, expanding through the Rhode acquisition.'),
('UPST', 'Upstart Holdings Inc.', 'Fintech', 'Credit Services', 5000000000, 50, 60, 150, 75, 74, 2.5, 2.8, 20, 0, 200, 83, 'high', 30, 5, 0.2, 54, 90, 2, 1, 65.25, 30.17, 6000000, 'seed', true, 'AI-driven lending marketplace connecting borrowers with banks and credit unions; results swing with credit market conditions.'),
('ENPH', 'Enphase Energy Inc.', 'Clean Energy', 'Solar', 4500000000, 35, 5, -20, 50, 52, 0.95, 1.7, 10, 0, 200, 61, 'medium', 12, 3.2, NULL, 37.8, 44, 10, 8, 43.75, 23.68, 5000000, 'seed', true, 'Residential solar microinverter and battery maker exposed to changing US solar tax incentives and housing demand.'),
('LRN', 'Stride Inc.', 'EdTech', 'Education & Training Services', 4300000000, 100, 15, 30, 56, 24, 0.35, 0.3, 0, 0, 200, 65, 'medium', 12, 1.7, 0.4, 108, 39, 15, 11, 118, 77, 1000000, 'seed', true, 'Online K-12 education provider operating virtual public schools and career-learning programs; profitable with modest valuation.'),
('CRNX', 'Crinetics Pharmaceuticals Inc.', 'Biotech', 'Biotechnology', 3500000000, 35, 0, -20, 49, 45, 0.02, 0.6, 0, 4, 48, 44, 'high', NULL, NULL, NULL, 43.75, NULL, NULL, NULL, 43.14, 24.5, 1000000, 'seed', true, 'Endocrinology biotech developing oral therapies for rare hormonal disorders, with its first product recently approved for acromegaly.'),
('RUN', 'Sunrun Inc.', 'Clean Energy', 'Solar', 3500000000, 15, -5, -50, 46, 81, 4.5, 2.4, 0, 0, 200, 42, 'high', NULL, 1.7, NULL, 18.75, 15, -15, -90, 19.84, 8.7, 10000000, 'seed', true, 'Largest US residential solar installer leasing systems to homeowners; carries heavy debt and is sensitive to interest rates.'),
('QUBT', 'Quantum Computing Inc.', 'Quantum', 'Computer Hardware', 3000000000, 18, 0, -50, 47, 93, 0, 3, 0, 0, 60, 44, 'high', NULL, NULL, NULL, 22.5, 30, NULL, NULL, 24.34, 9.72, 30000000, 'seed', true, 'Micro-revenue photonics and quantum-hardware company with a valuation driven largely by quantum-computing enthusiasm.'),
('VKTX', 'Viking Therapeutics Inc.', 'Biotech', 'Biotechnology', 3000000000, 28, 0, -50, 47, 51, 0, 0.9, 0, 3, 60, 44, 'high', NULL, NULL, NULL, 35, NULL, NULL, NULL, 34.93, 19.04, 4000000, 'seed', true, 'Clinical-stage biotech developing injectable and oral GLP-1/GIP obesity candidates; pre-revenue.'),
('BEAM', 'Beam Therapeutics Inc.', 'Biotech', 'Biotechnology', 2300000000, 23, -50, -10, 34, 69, 0.1, 1.8, 0, 6, 48, 35, 'extreme', NULL, 40, NULL, 28.75, NULL, -600, -600, 29.73, 14.26, 2000000, 'seed', true, 'Base-editing gene therapy biotech with clinical programs in sickle cell disease and alpha-1 antitrypsin deficiency.'),
('LUNR', 'Intuitive Machines Inc.', 'Space', 'Aerospace & Defense', 2000000000, 11, 30, -50, 56, 77, 0, 2.2, 5, 0, 36, 55, 'extreme', NULL, 8, NULL, 13.75, 10, -30, -40, 14.44, 6.53, 10000000, 'seed', true, 'Lunar lander and space infrastructure company holding NASA contracts for lunar missions and data relay services.'),
('PLUG', 'Plug Power Inc.', 'Clean Energy', 'Electrical Equipment & Parts', 2000000000, 1.8, 5, -20, 50, 73, 0.4, 2, 10, 0, 12, 46, 'extreme', NULL, 3, NULL, 2.25, -60, -150, -160, 2.34, 1.09, 60000000, 'seed', true, 'Hydrogen fuel-cell and electrolyzer company with persistent negative gross margins and recurring shareholder dilution.'),
('SRPT', 'Sarepta Therapeutics Inc.', 'Biotech', 'Biotechnology', 1800000000, 18, 10, -80, 49, 49, 0.8, 0.8, 35, 6, 24, 47, 'extreme', 6, 0.8, NULL, 22.5, 80, -10, -15, 22.37, 12.36, 8000000, 'seed', true, 'Gene therapy company focused on Duchenne muscular dystrophy, facing safety-related setbacks for its Elevidys therapy.'),
('TWST', 'Twist Bioscience Corporation', 'Biotech', 'Diagnostics & Research', 1800000000, 30, 18, 30, 56, 67, 0.05, 1.7, 35, 0, 48, 51, 'extreme', NULL, 4.8, NULL, 37.5, 48, -50, -55, 38.62, 18.8, 1500000, 'seed', true, 'Synthetic DNA manufacturer selling to drug discovery, synthetic biology and genomic research customers; not yet profitable.'),
('COUR', 'Coursera Inc.', 'EdTech', 'Education & Training Services', 1600000000, 10, 8, 50, 54, 59, 0, 1.3, 20, 0, 200, 48, 'extreme', 18, 2.1, 0.36, 12.5, 54, -5, -3, 12.68, 6.53, 2000000, 'seed', true, 'Online learning platform offering university courses and professional certificates to consumers and enterprises.'),
('RDW', 'Redwire Corporation', 'Space', 'Aerospace & Defense', 1300000000, 9, 30, -50, 56, 81, 0.6, 2.4, 3, 0, 24, 55, 'extreme', NULL, 3, NULL, 11.25, 15, -15, -40, 11.9, 5.22, 5000000, 'seed', true, 'Space infrastructure supplier of solar arrays, sensors and in-space manufacturing, expanding into defense drones.'),
('NTLA', 'Intellia Therapeutics Inc.', 'Biotech', 'Biotechnology', 1200000000, 11, 0, -10, 49, 73, 0.05, 2, 0, 5, 30, 44, 'extreme', NULL, 25, NULL, 13.75, NULL, -1000, -1000, 14.33, 6.67, 4000000, 'seed', true, 'In-vivo CRISPR gene editing biotech whose lead programs target ATTR amyloidosis and hereditary angioedema.'),
('UDMY', 'Udemy Inc.', 'EdTech', 'Education & Training Services', 1000000000, 6.5, -3, 50, 51, 69, 0, 1.8, 25, 0, 200, 44, 'extreme', 15, 1.3, 0.3, 8.12, 64, -5, -5, 8.4, 4.03, 1500000, 'seed', true, 'Online course marketplace shifting toward enterprise subscriptions as consumer revenue declines.'),
('SPCE', 'Virgin Galactic Holdings Inc.', 'Space', 'Aerospace & Defense', 150000000, 3.5, -50, -10, 34, 77, 0.8, 2.2, 0, 0, 18, 35, 'extreme', NULL, 20, NULL, 4.38, NULL, NULL, NULL, 4.59, 2.08, 3000000, 'seed', true, 'Suborbital space tourism company that paused commercial flights to build its next-generation Delta spaceships; pre-revenue phase.'),
('CHGG', 'Chegg Inc.', 'EdTech', 'Education & Training Services', 150000000, 1.4, -30, -50, 38, 65, 1.1, 1.6, 15, 0, 24, 35, 'extreme', NULL, 0.4, NULL, 1.75, 60, -50, -70, 1.8, 0.89, 3000000, 'seed', true, 'Online homework-help company whose subscriber base has declined sharply amid competition from generative AI tools.')
ON CONFLICT (ticker) DO NOTHING;

-- 3. Backfill new columns on the original 24 rows only where NULL
UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  avg_volume = COALESCE(avg_volume, 1500000)
WHERE ticker = 'VERV';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  price_to_sales = COALESCE(price_to_sales, 90),
  avg_volume = COALESCE(avg_volume, 2000000)
WHERE ticker = 'CRSP';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  price_to_sales = COALESCE(price_to_sales, 30),
  avg_volume = COALESCE(avg_volume, 20000000)
WHERE ticker = 'RXRX';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  forward_pe = COALESCE(forward_pe, 25),
  price_to_sales = COALESCE(price_to_sales, 5),
  peg_ratio = COALESCE(peg_ratio, 0.5),
  gross_margin = COALESCE(gross_margin, 98),
  operating_margin = COALESCE(operating_margin, 30),
  profit_margin = COALESCE(profit_margin, 15),
  avg_volume = COALESCE(avg_volume, 900000)
WHERE ticker = 'NBIX';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  price_to_sales = COALESCE(price_to_sales, 8),
  gross_margin = COALESCE(gross_margin, 80),
  operating_margin = COALESCE(operating_margin, -30),
  profit_margin = COALESCE(profit_margin, -20),
  avg_volume = COALESCE(avg_volume, 800000)
WHERE ticker = 'BNTX';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  price_to_sales = COALESCE(price_to_sales, 20),
  avg_volume = COALESCE(avg_volume, 2000000)
WHERE ticker = 'ARWR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Health Information Services'),
  price_to_sales = COALESCE(price_to_sales, 6),
  gross_margin = COALESCE(gross_margin, 60),
  operating_margin = COALESCE(operating_margin, -80),
  profit_margin = COALESCE(profit_margin, -75),
  avg_volume = COALESCE(avg_volume, 800000)
WHERE ticker = 'SDGR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Semiconductors'),
  forward_pe = COALESCE(forward_pe, 40),
  price_to_sales = COALESCE(price_to_sales, 25),
  peg_ratio = COALESCE(peg_ratio, 1),
  gross_margin = COALESCE(gross_margin, 72),
  operating_margin = COALESCE(operating_margin, 60),
  profit_margin = COALESCE(profit_margin, 53),
  avg_volume = COALESCE(avg_volume, 180000000)
WHERE ticker = 'NVDA';

UPDATE stocks SET
  industry = COALESCE(industry, 'Software - Infrastructure'),
  forward_pe = COALESCE(forward_pe, 200),
  price_to_sales = COALESCE(price_to_sales, 90),
  peg_ratio = COALESCE(peg_ratio, 4),
  gross_margin = COALESCE(gross_margin, 80),
  operating_margin = COALESCE(operating_margin, 25),
  profit_margin = COALESCE(profit_margin, 25),
  avg_volume = COALESCE(avg_volume, 60000000)
WHERE ticker = 'PLTR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Credit Services'),
  forward_pe = COALESCE(forward_pe, 50),
  price_to_sales = COALESCE(price_to_sales, 9),
  peg_ratio = COALESCE(peg_ratio, 2),
  gross_margin = COALESCE(gross_margin, 85),
  operating_margin = COALESCE(operating_margin, 15),
  profit_margin = COALESCE(profit_margin, 15),
  avg_volume = COALESCE(avg_volume, 60000000)
WHERE ticker = 'SOFI';

UPDATE stocks SET
  industry = COALESCE(industry, 'Aerospace & Defense'),
  price_to_sales = COALESCE(price_to_sales, 40),
  gross_margin = COALESCE(gross_margin, 30),
  operating_margin = COALESCE(operating_margin, -40),
  profit_margin = COALESCE(profit_margin, -45),
  avg_volume = COALESCE(avg_volume, 20000000)
WHERE ticker = 'RKLB';

UPDATE stocks SET
  industry = COALESCE(industry, 'Software - Application'),
  gross_margin = COALESCE(gross_margin, 70),
  avg_volume = COALESCE(avg_volume, 15000000)
WHERE ticker = 'MSTR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Aerospace & Defense'),
  avg_volume = COALESCE(avg_volume, 30000000)
WHERE ticker = 'ACHR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Computer Hardware'),
  price_to_sales = COALESCE(price_to_sales, 0.2),
  gross_margin = COALESCE(gross_margin, 40),
  operating_margin = COALESCE(operating_margin, -10),
  profit_margin = COALESCE(profit_margin, -20),
  avg_volume = COALESCE(avg_volume, 500000)
WHERE ticker = 'QMCO';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  price_to_sales = COALESCE(price_to_sales, 10),
  operating_margin = COALESCE(operating_margin, -40),
  profit_margin = COALESCE(profit_margin, -40),
  avg_volume = COALESCE(avg_volume, 1500000)
WHERE ticker = 'IONS';

UPDATE stocks SET
  industry = COALESCE(industry, 'Software - Application'),
  forward_pe = COALESCE(forward_pe, 60),
  price_to_sales = COALESCE(price_to_sales, 7),
  peg_ratio = COALESCE(peg_ratio, 2.5),
  gross_margin = COALESCE(gross_margin, 75),
  operating_margin = COALESCE(operating_margin, 3),
  profit_margin = COALESCE(profit_margin, 1),
  avg_volume = COALESCE(avg_volume, 1500000)
WHERE ticker = 'AVPT';

UPDATE stocks SET
  industry = COALESCE(industry, 'Computer Hardware'),
  avg_volume = COALESCE(avg_volume, 40000000)
WHERE ticker = 'RGTI';

UPDATE stocks SET
  industry = COALESCE(industry, 'Biotechnology'),
  avg_volume = COALESCE(avg_volume, 100000)
WHERE ticker = 'QNRX';

UPDATE stocks SET
  industry = COALESCE(industry, 'Semiconductor Equipment & Materials'),
  avg_volume = COALESCE(avg_volume, 800000)
WHERE ticker = 'ATOM';

UPDATE stocks SET
  industry = COALESCE(industry, 'Specialty Business Services'),
  price_to_sales = COALESCE(price_to_sales, 8),
  gross_margin = COALESCE(gross_margin, 55),
  operating_margin = COALESCE(operating_margin, -30),
  profit_margin = COALESCE(profit_margin, -30),
  avg_volume = COALESCE(avg_volume, 10000000)
WHERE ticker = 'PL';

UPDATE stocks SET
  industry = COALESCE(industry, 'Solar'),
  forward_pe = COALESCE(forward_pe, 13),
  price_to_sales = COALESCE(price_to_sales, 4.5),
  peg_ratio = COALESCE(peg_ratio, 0.5),
  gross_margin = COALESCE(gross_margin, 45),
  operating_margin = COALESCE(operating_margin, 35),
  profit_margin = COALESCE(profit_margin, 30),
  avg_volume = COALESCE(avg_volume, 3000000)
WHERE ticker = 'FSLR';

UPDATE stocks SET
  industry = COALESCE(industry, 'Specialty Retail'),
  price_to_sales = COALESCE(price_to_sales, 1),
  gross_margin = COALESCE(gross_margin, 25),
  operating_margin = COALESCE(operating_margin, -60),
  profit_margin = COALESCE(profit_margin, -60),
  avg_volume = COALESCE(avg_volume, 10000000)
WHERE ticker = 'CHPT';

UPDATE stocks SET
  industry = COALESCE(industry, 'Software - Application')
WHERE ticker = 'INST';

UPDATE stocks SET
  industry = COALESCE(industry, 'Software - Infrastructure'),
  forward_pe = COALESCE(forward_pe, 45),
  price_to_sales = COALESCE(price_to_sales, 4.5),
  peg_ratio = COALESCE(peg_ratio, 1.2),
  gross_margin = COALESCE(gross_margin, 25),
  operating_margin = COALESCE(operating_margin, 4),
  profit_margin = COALESCE(profit_margin, 5),
  avg_volume = COALESCE(avg_volume, 8000000)
WHERE ticker = 'TOST';

-- Price-relative fields for the original rows are derived from each row's own
-- current_price/volatility so they stay internally consistent (NULL-only).
UPDATE stocks SET
  target_mean_price = COALESCE(target_mean_price, round(current_price * 1.15, 2)),
  fifty_two_week_high = COALESCE(fifty_two_week_high, round(current_price * (1.12 + volatility / 400.0), 2)),
  fifty_two_week_low = COALESCE(fifty_two_week_low, round(current_price * (0.85 - volatility / 300.0), 2))
WHERE ticker IN ('VERV', 'CRSP', 'RXRX', 'NBIX', 'BNTX', 'ARWR', 'SDGR', 'NVDA', 'PLTR', 'SOFI', 'RKLB', 'MSTR', 'ACHR', 'QMCO', 'IONS', 'AVPT', 'RGTI', 'QNRX', 'ATOM', 'PL', 'FSLR', 'CHPT', 'INST', 'TOST')
  AND ticker NOT IN ('VERV', 'INST');

-- 4. Data fixes on existing rows (explicit, scoped by ticker)
UPDATE stocks SET company_name = 'Verve Therapeutics', is_active = false
WHERE ticker = 'VERV';

UPDATE stocks SET company_name = 'Quoin Pharmaceuticals', sector = 'Biotech'
WHERE ticker = 'QNRX';

UPDATE stocks SET is_active = false
WHERE ticker = 'INST';
