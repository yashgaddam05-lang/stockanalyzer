-- Admin role (app_admins), maintenance switch (app_settings), admin-only RPCs. Applied via MCP 2026-11-11.
create table if not exists public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.app_admins enable row level security;
drop policy if exists app_admins_self_read on public.app_admins;
create policy app_admins_self_read on public.app_admins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.app_admins from anon;
revoke insert, update, delete on public.app_admins from authenticated;
create table if not exists public.app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.app_settings enable row level security;
drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings for select to anon, authenticated using (key in ('maintenance'));
revoke insert, update, delete on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('maintenance', '{"enabled": false, "message": "We are making 3x Hunter better and will be back shortly."}') on conflict (key) do nothing;
-- is_app_admin(), admin_set_maintenance(boolean, text), admin_stats(): security definer, admin-checked,
-- executable by authenticated only. See the applied migration in Supabase for full bodies.
insert into public.app_admins (user_id) select id from auth.users where email = 'yashgaddam05@gmail.com' on conflict do nothing;
