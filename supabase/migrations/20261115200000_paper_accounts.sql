-- Paper accounts: forward-tracked virtual $100,000 accounts (8 standard V01-V08 + user experiments).
-- Valued from adjusted daily closes in paper_prices; nothing here is real money.
create table if not exists public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  code text unique,
  name text not null check (char_length(name) between 1 and 60),
  stocks int not null check (stocks between 0 and 100),
  bonds int not null check (bonds between 0 and 100),
  cash int not null check (cash between 0 and 100),
  sleeve text not null,
  holdings jsonb not null,
  benchmark jsonb not null,
  start_value numeric not null default 100000,
  target_multiple numeric not null default 3 check (target_multiple between 1.5 and 10),
  horizon_years int not null default 15 check (horizon_years between 1 and 30),
  assumptions jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  constraint paper_mix_sums check (stocks + bonds + cash = 100)
);
create index if not exists paper_accounts_user_idx on public.paper_accounts (user_id);
alter table public.paper_accounts enable row level security;
drop policy if exists paper_accounts_read on public.paper_accounts;
create policy paper_accounts_read on public.paper_accounts for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

create table if not exists public.paper_prices (
  symbol text not null,
  d date not null,
  adj numeric not null,
  primary key (symbol, d)
);
alter table public.paper_prices enable row level security;
-- No policies: written and read by the server with the service role only.

-- The 8 standard accounts: stocks 40% VTI / 30% VXUS / 30% Balanced Bot picks (2026-10-01 rebalance,
-- equal weight); bonds split VGSH/BND; cash SGOV. Benchmark swaps the stock part for 70% VTI / 30% VXUS.
with picks(sym) as (values ('INCY'),('EXE'),('EQT'),('PTC'),('TFC'),('REGN'),('RF'),('FFIV'),('L'),('VEEV'),
  ('AMCR'),('T'),('DIS'),('EG'),('NI'),('SBAC'),('ALL'),('BXP'),('DXCM'),('KVUE')),
ladder(code, name, st, bo, ca) as (values
  ('V01','Liquidity focused',0,20,80),('V02','Conservative',10,70,20),('V03','Conservative growth',25,65,10),
  ('V04','Moderate',40,55,5),('V05','Balanced growth',60,35,5),('V06','Growth',75,20,5),
  ('V07','Aggressive growth',90,5,5),('V08','Maximum equity',100,0,0))
insert into public.paper_accounts (code, name, stocks, bonds, cash, sleeve, holdings, benchmark, assumptions, created_at)
select l.code, l.name, l.st, l.bo, l.ca, 'mix',
  (select jsonb_agg(jsonb_build_object('symbol', h.s, 'weight', round(h.w, 6))) from (
     select 'VTI' s, l.st * 0.004 w union all select 'VXUS', l.st * 0.003
     union all select p.sym, l.st * 0.003 / 20 from picks p
     union all select 'VGSH', l.bo / 200.0 union all select 'BND', l.bo / 200.0 union all select 'SGOV', l.ca / 100.0
   ) h where h.w > 0),
  (select jsonb_agg(jsonb_build_object('symbol', h.s, 'weight', round(h.w, 6))) from (
     select 'VTI' s, l.st * 0.007 w union all select 'VXUS', l.st * 0.003
     union all select 'VGSH', l.bo / 200.0 union all select 'BND', l.bo / 200.0 union all select 'SGOV', l.ca / 100.0
   ) h where h.w > 0),
  '{"objective":"Standard scenario for the 3x goal: $100,000 to $300,000 within 15 years.","rebalancing":"None (buy and hold from inception). Drift is shown, not corrected.","costs":"0.10% one-time entry cost. Fund expenses are already inside fund prices.","income":"Dividends and interest reinvested through adjusted closing prices.","execution":"Bought at the first market close after the account was created.","benchmark":"Same bond and cash mix, stock part 70% VTI / 30% VXUS.","taxes":"Excluded.","data":"Yahoo Finance adjusted daily closes, updated each weekday evening.","picks":"Balanced Bot picks from the 2026-10-01 rebalance, equal weight, frozen at inception."}'::jsonb, '2026-11-15T18:00:00Z'
from ladder l
on conflict (code) do nothing;
