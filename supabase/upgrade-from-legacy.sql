-- Our Table — isolate the schema of the previous "Our Meal Plan" app
--
-- The old app used public.plan, public.meal_swaps and narrower versions of
-- public.eaten / water / recipe_notes / profiles / households. Running
-- schema.sql next to them would silently keep the old columns, so the new app
-- would open but fail when writing (for example eaten.recipe_id is missing).
--
-- This script does not delete anything. It moves those tables into a `legacy`
-- schema, so `schema.sql` can build clean tables with the same names in
-- `public`. Auth accounts stay in auth.users and keep working; the data itself
-- is carried over by migrate-legacy-data.sql.
--
-- Most people only need the one-paste file: supabase/upgrade-existing-project.sql
--
-- Re-running is safe: a second run finds nothing to move and only drops the two
-- old helper functions so schema.sql can recreate them.

-- Step 1 — step the old "Our Meal Plan" tables aside.
-- Nothing is deleted: they are moved into a `legacy` schema so the new tables can
-- be created with the same names. No-op on a fresh project or a second run.
do $$
declare
  t text;
begin
  if to_regclass('public.meal_assignments') is null then
    create schema if not exists legacy;
    foreach t in array array[
      'plan', 'meal_swaps', 'recipe_notes', 'eaten', 'water', 'profiles', 'households',
      'recipes', 'meal_assignments', 'shopping_checks', 'pantry', 'menus', 'day_sections', 'labels'
    ] loop
      if exists (
        select 1 from information_schema.tables where table_schema = 'public' and table_name = t
      ) and not exists (
        select 1 from information_schema.tables where table_schema = 'legacy' and table_name = t
      ) then
        execute format('alter table public.%I set schema legacy', t);
        raise notice 'moved public.% to legacy.%', t, t;
      end if;
    end loop;
  end if;
end $$;

-- The old helpers have the same arguments but a different return type, which
-- blocks CREATE OR REPLACE. schema.sql recreates them.
drop function if exists public.create_household(text, text, text);
drop function if exists public.join_household(text, text, text);
