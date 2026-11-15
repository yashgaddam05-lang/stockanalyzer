alter table public.paper_accounts add column if not exists alert_state jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists weekly_email boolean not null default true;
