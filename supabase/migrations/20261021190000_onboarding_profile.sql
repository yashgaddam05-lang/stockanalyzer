-- Onboarding interview answers; new users default to their own stocks, not the S&P 500.
alter table public.user_preferences add column if not exists goal text check (goal in ('multibaggers','track','ideas','learn'));
alter table public.user_preferences add column if not exists experience text check (experience in ('new','some','experienced'));
alter table public.user_preferences add column if not exists risk text check (risk in ('conservative','balanced','aggressive'));
alter table public.user_preferences alter column dashboard_scope set default 'mine';
