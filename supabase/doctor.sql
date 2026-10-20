-- Our Table — read-only health check
-- Paste this whole file into the Supabase SQL editor and run it. It changes
-- nothing. One table comes back: every table the app needs, then a few counts.

with required(tbl, cols) as (
  values
    ('households',       array['id', 'name', 'invite_code', 'extra_portions', 'updated_at']),
    ('profiles',         array['id', 'household_id', 'person_key', 'display_name']),
    ('recipes',          array['id', 'household_id', 'name_en', 'name_lt', 'slot', 'kcal', 'ingredients', 'vegetarian']),
    ('meal_assignments', array['id', 'household_id', 'day_index', 'slot', 'person_key', 'recipe_id']),
    ('eaten',            array['household_id', 'day_index', 'slot', 'person_key', 'eaten', 'recipe_id']),
    ('water',            array['household_id', 'day_index', 'person_key', 'ml']),
    ('recipe_notes',     array['household_id', 'recipe_id', 'person_key', 'note']),
    ('shopping_checks',  array['household_id', 'week_start', 'item_key', 'checked']),
    ('pantry',           array['household_id', 'ingredient_key', 'item_key', 'quantity', 'low_threshold']),
    ('menus',            array['household_id', 'name_en', 'items']),
    ('day_sections',     array['household_id', 'day_index', 'slot']),
    ('labels',           array['household_id', 'key', 'label'])
),
existing as (
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
),
checks as (
  select
    r.tbl as item,
    case when e.table_name is null then 'MISSING TABLE' else 'ok' end as status,
    coalesce((
      select string_agg(c, ', ' order by c)
      from unnest(r.cols) as c
      where not exists (
        select 1 from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = r.tbl
          and ic.column_name = c
      )
    ), '—') as detail,
    1 as section
  from required r
  left join existing e on e.table_name = r.tbl
)
select * from (
select 'table' as section, item, status, detail
from checks
union all
select 'row count', 'households', count(*)::text, null::text from public.households
union all
select 'row count', 'profiles', count(*)::text, null from public.profiles
union all
select 'row count', 'recipes', count(*)::text, null from public.recipes
union all
select 'row count', 'meal_assignments', count(*)::text, null from public.meal_assignments
union all
select 'project', 'database', current_database(), null
union all
select 'project', 'auth users', (select count(*)::text from auth.users), null
) report
order by section, (status = 'ok') desc, item;
