/*
# Watchlist ownership (owner_id + per-owner RLS)

1. watchlists.owner_id (nullable, defaults to auth.uid()). Existing rows keep
   owner_id NULL = shared anonymous lists, still fully usable by anon.
2. One default list per owner (NULL owner bucketed to the zero uuid);
   replaces the global single-default index.
3. Replace the 8 permissive anon_* policies with:
   - anon: rows with owner_id IS NULL only
   - authenticated: rows they own only
Legacy `watchlist` table untouched. Idempotent and additive only.
*/

ALTER TABLE public.watchlists
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL DEFAULT auth.uid()
  REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS watchlists_owner_id_idx ON public.watchlists (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS watchlists_default_per_owner_idx
  ON public.watchlists ((COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE is_default;
DROP INDEX IF EXISTS public.watchlists_single_default_idx;

DROP POLICY IF EXISTS "anon_select_watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "anon_insert_watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "anon_update_watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "anon_delete_watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "anon_select_watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "anon_insert_watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "anon_update_watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "anon_delete_watchlist_items" ON public.watchlist_items;

DROP POLICY IF EXISTS "anon_shared_watchlists" ON public.watchlists;
CREATE POLICY "anon_shared_watchlists" ON public.watchlists FOR ALL
  TO anon
  USING (owner_id IS NULL)
  WITH CHECK (owner_id IS NULL);

DROP POLICY IF EXISTS "user_own_watchlists" ON public.watchlists;
CREATE POLICY "user_own_watchlists" ON public.watchlists FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "anon_shared_watchlist_items" ON public.watchlist_items;
CREATE POLICY "anon_shared_watchlist_items" ON public.watchlist_items FOR ALL
  TO anon
  USING (EXISTS (SELECT 1 FROM public.watchlists w
                 WHERE w.id = watchlist_items.watchlist_id AND w.owner_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.watchlists w
                      WHERE w.id = watchlist_items.watchlist_id AND w.owner_id IS NULL));

DROP POLICY IF EXISTS "user_own_watchlist_items" ON public.watchlist_items;
CREATE POLICY "user_own_watchlist_items" ON public.watchlist_items FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.watchlists w
                 WHERE w.id = watchlist_items.watchlist_id AND w.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.watchlists w
                      WHERE w.id = watchlist_items.watchlist_id AND w.owner_id = (select auth.uid())));
