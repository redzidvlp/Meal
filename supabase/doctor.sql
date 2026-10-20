-- Our Table — read-only health check
-- Paste this whole file into the Supabase SQL editor and run it.
-- It changes nothing. The first result lists every table the app needs and any
-- missing columns; the second shows the household/profile rows the app will read.

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
)
select
  r.tbl as table_name,
  case when e.table_name is null then 'MISSING TABLE' else 'ok' end as table_status,
  coalesce((
    select string_agg(c, ', ' order by c)
    from unnest(r.cols) as c
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = r.tbl
        and ic.column_name = c
    )
  ), '—') as missing_columns
from required r
left join existing e on e.table_name = r.tbl
order by (e.table_name is null) desc, r.tbl;

-- What the app will actually see once the schema is in place.
select
  (select count(*) from public.households) as households,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.recipes) as recipes;

-- Helpful extras from the project itself.
select
  current_database() as database,
  (select count(*) from auth.users) as auth_users;
