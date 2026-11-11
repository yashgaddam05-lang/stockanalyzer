-- Paid plans (Stripe). Users can read their own row; only the server (service role) writes.
create table if not exists public.subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','founding')),
  status text not null default 'none',
  interval text check (interval in ('month','year')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_own_read on public.subscriptions;
create policy subscriptions_own_read on public.subscriptions for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;

-- Founding members: every account that exists before paid plans launch keeps Pro free until 2027-01-31.
insert into public.subscriptions (owner_id, plan, status, current_period_end)
select id, 'founding', 'active', '2027-01-31T23:59:59Z' from auth.users
on conflict (owner_id) do nothing;
