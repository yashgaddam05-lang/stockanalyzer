-- Read-only brokerage connections (SnapTrade). The secret is server-only: RLS on, no policies, no grants.
create table if not exists public.brokerage_links (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'snaptrade' check (provider in ('snaptrade')),
  provider_user_id text not null unique,
  provider_user_secret text not null,
  status text not null default 'pending' check (status in ('pending','connected','error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brokerage_links enable row level security;
revoke all on public.brokerage_links from anon, authenticated;

-- Portfolios synced from a brokerage account (positions are replaced on every sync).
alter table public.portfolios add column if not exists source text not null default 'manual' check (source in ('manual','brokerage'));
alter table public.portfolios add column if not exists external_account_id text;
alter table public.portfolios add column if not exists institution text;
alter table public.portfolios add column if not exists synced_at timestamptz;
create unique index if not exists portfolios_owner_external_idx on public.portfolios (owner_id, external_account_id) where external_account_id is not null;
