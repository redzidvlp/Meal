-- Our Table — isolate the schema of the previous "Our Meal Plan" app
--
-- The old app used public.plan, public.meal_swaps and narrower versions of
-- public.eaten / water / recipe_notes / profiles / households. Running
-- schema.sql next to them would silently keep the old columns, so the new app
-- would open but fail when writing (for example eaten.recipe_id is missing).
--
-- This script does not delete anything. It moves those seven tables into a
-- `legacy` schema, so `schema.sql` can build clean tables with the same names
-- in `public`. Auth accounts stay in auth.users and keep working; you sign in
-- again and create or join a kitchen (the old plan is not carried over).
--
-- Use it only on a project that contains the old app. Then run, in order:
--   1. supabase/schema.sql
--   2. supabase/seed.sql
--   3. supabase/doctor.sql   (should report every table as "ok")

begin;

do $$
begin
  if to_regclass('public.meal_assignments') is not null then
    raise exception 'This project already has the new schema. Nothing was changed.';
  end if;
  if to_regclass('public.plan') is null then
    raise exception 'No legacy "plan" table found. If the project is empty, just run schema.sql.';
  end if;
end $$;

create schema if not exists legacy;

do $$
declare
  t text;
begin
  foreach t in array array[
    'plan', 'meal_swaps', 'recipe_notes', 'eaten', 'water', 'profiles', 'households',
    'recipes', 'meal_assignments', 'shopping_checks', 'pantry', 'menus', 'day_sections', 'labels'
  ] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) and not exists (
      select 1 from information_schema.tables
      where table_schema = 'legacy' and table_name = t
    ) then
      execute format('alter table public.%I set schema legacy', t);
      raise notice 'moved public.% to legacy.%', t, t;
    end if;
  end loop;
end $$;

-- Keep the old helper functions from being called by the new app.
drop function if exists public.create_household(text, text, text);
drop function if exists public.join_household(text, text, text);

commit;

-- Old data stays readable at legacy.plan, legacy.eaten, ... Drop the schema
-- manually once you are sure you no longer need it:
--   drop schema legacy cascade;
