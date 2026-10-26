-- Per-account assistant memory. Each chat session keeps its transcript until it is summarized; the summary stays
-- in the owner's account and is the only history the assistant sees in later sessions. RLS keeps every row
-- readable and writable by its owner only, so one account's chats never reach another account's assistant.
create table if not exists public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  summarized_at timestamptz
);
create index if not exists assistant_sessions_owner_recent_idx
  on public.assistant_sessions (owner_id, last_message_at desc);

alter table public.assistant_sessions enable row level security;
drop policy if exists assistant_sessions_own on public.assistant_sessions;
create policy assistant_sessions_own on public.assistant_sessions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.assistant_sessions from anon;
