-- AI cost control: a ledger of every model call with its real cost, monthly credit budgets per plan, credit packs,
-- a Pro+ plan, and a shared research cache that scheduled jobs and on-demand answers fill once and every user reuses.

-- Pro+ is a third paid plan.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('free','pro','pro_plus','founding'));

-- Every model call: answers (charged in credits), plus research, routing, summaries, guests and voice (cost only).
create table if not exists public.ai_usage (
  id bigserial primary key,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('answer','guest','research','router','summary','voice')),
  size text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12,6) not null default 0,
  credits int not null default 0,
  -- Part of `credits` paid from purchased packs instead of the monthly allowance.
  from_pack int not null default 0,
  ticker text,
  research_hits int not null default 0,
  status text not null default 'ok' check (status in ('pending','ok','refunded','failed'))
);
create index if not exists ai_usage_owner_recent_idx on public.ai_usage (owner_id, created_at desc);
create index if not exists ai_usage_recent_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_own_read on public.ai_usage;
create policy ai_usage_own_read on public.ai_usage for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;

-- Purchased credit packs (and manual grants). Pack credits never expire.
create table if not exists public.ai_credit_grants (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  credits int not null check (credits > 0),
  reason text not null,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_grants_owner_idx on public.ai_credit_grants (owner_id);
alter table public.ai_credit_grants enable row level security;
drop policy if exists ai_credit_grants_own_read on public.ai_credit_grants;
create policy ai_credit_grants_own_read on public.ai_credit_grants for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.ai_credit_grants from anon;
revoke insert, update, delete on public.ai_credit_grants from authenticated;

-- Shared research briefs. ticker 'MARKET' is the whole-market brief. Server only (no client policies).
create table if not exists public.market_research (
  id bigserial primary key,
  ticker text not null,
  slot text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  price_at numeric,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  model text,
  cost_usd numeric(12,6) not null default 0,
  trigger text not null default 'schedule' check (trigger in ('schedule','demand','admin'))
);
create index if not exists market_research_ticker_recent_idx on public.market_research (ticker, created_at desc);
alter table public.market_research enable row level security;
revoke all on public.market_research from anon, authenticated;

-- Balance for one account: what is left of this month's allowance and of purchased packs.
create or replace function public.ai_balance(p_owner uuid, p_allowance int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  used_monthly int; granted int; pack_used int;
begin
  select coalesce(sum(credits - from_pack), 0) into used_monthly from public.ai_usage
    where owner_id = p_owner and created_at >= month_start;
  select coalesce(sum(credits), 0) into granted from public.ai_credit_grants where owner_id = p_owner;
  select coalesce(sum(from_pack), 0) into pack_used from public.ai_usage where owner_id = p_owner;
  return jsonb_build_object(
    'monthly_left', greatest(p_allowance - used_monthly, 0),
    'pack_left', greatest(granted - pack_used, 0),
    'allowance', p_allowance,
    'resets_at', (month_start + interval '1 month')
  );
end $$;

-- Atomically charges an answer's credits (monthly allowance first, then packs). Returns ok=false when short.
create or replace function public.ai_charge(p_owner uuid, p_credits int, p_allowance int, p_size text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare bal jsonb; monthly_left int; pack_left int; take_pack int; new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ai_charge:' || p_owner::text));
  bal := public.ai_balance(p_owner, p_allowance);
  monthly_left := (bal->>'monthly_left')::int;
  pack_left := (bal->>'pack_left')::int;
  if p_credits > monthly_left + pack_left then
    return bal || jsonb_build_object('ok', false);
  end if;
  take_pack := greatest(p_credits - monthly_left, 0);
  insert into public.ai_usage (owner_id, kind, size, credits, from_pack, status)
    values (p_owner, 'answer', p_size, p_credits, take_pack, 'pending') returning id into new_id;
  return bal || jsonb_build_object('ok', true, 'id', new_id,
    'monthly_left', monthly_left - (p_credits - take_pack), 'pack_left', pack_left - take_pack);
end $$;

revoke all on function public.ai_balance(uuid, int) from public, anon, authenticated;
revoke all on function public.ai_charge(uuid, int, int, text) from public, anon, authenticated;
grant execute on function public.ai_balance(uuid, int) to service_role;
grant execute on function public.ai_charge(uuid, int, int, text) to service_role;

-- AI economics for the admin page.
create or replace function public.admin_ai_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
declare month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cost_today', (select coalesce(sum(cost_usd), 0) from public.ai_usage where created_at >= day_start),
    'cost_month', (select coalesce(sum(cost_usd), 0) from public.ai_usage where created_at >= month_start),
    'research_cost_month', (select coalesce(sum(cost_usd), 0) from public.ai_usage where kind = 'research' and created_at >= month_start),
    'answers_today', (select count(*) from public.ai_usage where kind = 'answer' and status = 'ok' and created_at >= day_start),
    'credits_month', (select coalesce(sum(credits), 0) from public.ai_usage where kind = 'answer' and created_at >= month_start),
    'research_briefs_today', (select count(*) from public.market_research where created_at >= day_start),
    'by_size', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select size, count(*) answers, round(avg(cost_usd)::numeric, 4) avg_cost, round(sum(cost_usd)::numeric, 2) cost,
        sum(credits) credits
      from public.ai_usage where kind = 'answer' and status = 'ok' and created_at >= month_start
      group by size order by sum(cost_usd) desc) r),
    'by_kind', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
      select kind, count(*) calls, round(sum(cost_usd)::numeric, 2) cost
      from public.ai_usage where created_at >= month_start group by kind order by sum(cost_usd) desc) r)
  );
end $$;
revoke all on function public.admin_ai_stats() from public, anon;
grant execute on function public.admin_ai_stats() to authenticated;

-- MRR and paying counts include Pro+.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return (
    with real_users as (
      select * from auth.users where coalesce(raw_user_meta_data->>'qa', '') <> 'true'
    ), real_subs as (
      select s.* from public.subscriptions s join real_users u on u.id = s.owner_id
    )
    select jsonb_build_object(
      'users', (select count(*) from real_users),
      'new_7d', (select count(*) from real_users where created_at > now() - interval '7 days'),
      'active_7d', (select count(*) from real_users where last_sign_in_at > now() - interval '7 days'),
      'active_30d', (select count(*) from real_users where last_sign_in_at > now() - interval '30 days'),
      'paying', (select count(*) from real_subs where plan in ('pro','pro_plus') and status in ('active','trialing','past_due')),
      'paying_plus', (select count(*) from real_subs where plan = 'pro_plus' and status in ('active','trialing','past_due')),
      'founding', (select count(*) from real_subs where plan = 'founding' and current_period_end > now()),
      'mrr_usd', (select coalesce(sum(case
          when plan = 'pro_plus' and interval = 'year' then 399.0/12 when plan = 'pro_plus' then 49
          when interval = 'year' then 149.0/12 else 19 end), 0)
        from real_subs where plan in ('pro','pro_plus') and status in ('active','trialing','past_due')),
      'assistant_today', (select coalesce(sum(a.messages), 0) from public.assistant_usage a join real_users u on u.id = a.owner_id where a.day = (now() at time zone 'utc')::date),
      'portfolios', (select count(*) from public.portfolios p join real_users u on u.id = p.owner_id),
      'watchlist_items', (select count(*) from public.watchlist_items),
      'recent_users', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select u.email, u.created_at, u.last_sign_in_at,
          case when coalesce(u.raw_user_meta_data->>'qa', '') = 'true' then 'test' else coalesce(s.plan, 'free') end plan
        from auth.users u left join public.subscriptions s on s.owner_id = u.id
        order by u.created_at desc limit 25) r)
    )
  );
end $function$;
