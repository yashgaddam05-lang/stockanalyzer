-- Searchable master list of US-listed companies (SEC company_tickers_exchange.json),
-- so users can find and add any stock without depending on rate-limited search APIs.
-- Data: supabase/seed/securities_sec.json (7,689 Nasdaq/NYSE/Cboe tickers, Oct 2026).
create extension if not exists pg_trgm with schema extensions;
create table if not exists public.securities (
  ticker text primary key check (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  name text not null,
  cik integer,
  exchange text not null,
  updated_at timestamptz not null default now()
);
create index if not exists securities_name_trgm on public.securities using gin (name extensions.gin_trgm_ops);
alter table public.securities enable row level security;
drop policy if exists securities_read_all on public.securities;
create policy securities_read_all on public.securities for select to anon, authenticated using (true);
