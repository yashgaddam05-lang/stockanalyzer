-- Retire the pre-auth anonymous shared watchlist. Watchlists are per-user only.
-- Access is removed; existing owner_id IS NULL rows are kept (invisible to anon/authenticated)
-- until the owner decides to reassign or delete them.
drop policy if exists anon_shared_watchlists on public.watchlists;
drop policy if exists anon_shared_watchlist_items on public.watchlist_items;

-- Legacy single-list table from the original Bolt build (0 rows, superseded by watchlists).
drop policy if exists anon_select_watchlist on public.watchlist;
drop policy if exists anon_insert_watchlist on public.watchlist;
drop policy if exists anon_delete_watchlist on public.watchlist;

-- Defense in depth: anon has no table privileges on any watchlist table.
revoke all on public.watchlists, public.watchlist_items, public.watchlist from anon;
