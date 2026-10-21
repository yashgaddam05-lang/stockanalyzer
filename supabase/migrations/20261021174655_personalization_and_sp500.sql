-- Universe membership + provenance for user-added stocks.
alter table public.stocks add column if not exists in_sp500 boolean not null default false;
alter table public.stocks add column if not exists added_by uuid references auth.users(id) on delete set null;
alter table public.stocks add column if not exists added_at timestamptz;
alter table public.stocks add column if not exists scored_at timestamptz;
create index if not exists stocks_in_sp500_idx on public.stocks (in_sp500) where in_sp500;
create index if not exists stocks_last_refreshed_idx on public.stocks (last_refreshed_at nulls first);
create index if not exists stocks_added_by_idx on public.stocks (added_by);

-- Per-user dashboard preferences (one row per user).
create table if not exists public.user_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  dashboard_scope text not null default 'sp500' check (dashboard_scope in ('mine', 'sp500', 'all')),
  sectors text[] not null default '{}',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists user_own_preferences on public.user_preferences;
create policy user_own_preferences on public.user_preferences
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.user_preferences from anon;
-- S&P 500 constituents are loaded from supabase/seed/sp500_constituents.json (503 rows, Oct 2026).
