-- Analyst consensus from Yahoo financialData, refreshed with the rest of the stock row.
alter table public.stocks add column if not exists target_high_price numeric;
alter table public.stocks add column if not exists target_low_price numeric;
alter table public.stocks add column if not exists recommendation_mean numeric;   -- 1 = strong buy ... 5 = sell
alter table public.stocks add column if not exists recommendation_key text;       -- strong_buy | buy | hold | underperform | sell
alter table public.stocks add column if not exists analyst_count integer;
