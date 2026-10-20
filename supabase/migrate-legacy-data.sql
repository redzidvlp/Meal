-- Our Table — carry the old "Our Meal Plan" data into the new schema
--
-- Run AFTER schema.sql (and seed.sql) and AFTER upgrade-from-legacy.sql.
-- Nothing is deleted: this only adds rows to the new tables.
--
--   Step 1  upgrade-from-legacy.sql   → old tables move to the `legacy` schema
--   Step 2  schema.sql                → new tables are created
--   Step 3  seed.sql                  → preset recipes and day menus
--   Step 4  this file                 → your household, logins, week, water, notes
--   Step 5  doctor.sql                → check everything reads "ok"
--
-- What is carried over
--   • the household (same id, so the login keeps its kitchen) and a new invite code
--   • both profiles (same auth user ids → same email/password keeps working)
--   • the planned variant of every day, expanded into the matching day menu
--   • "eaten" ticks, water, and recipe notes matched by dish name
-- What is not: custom "swap" meals from the old app (their format does not map to
-- recipe rows). Those days will show the original menu dish instead.

begin;

do $$
declare
  v_households integer := 0;
  v_profiles integer := 0;
  v_days integer := 0;
  v_assignments integer := 0;
  v_eaten integer := 0;
  v_water integer := 0;
  v_notes integer := 0;
  has_household_col boolean;
  has_invite boolean;
  has_name boolean;
  r record;
  v_code text;
  v_slot record;
  v_person text;
  v_recipe text;
  v_menu_recipe text;
  v_day integer;
  v_person_key text;
  v_name text;
  v_legacy_code text;
  v_display text;
begin
  if to_regclass('legacy.profiles') is null then
    raise notice 'No legacy.profiles table found — nothing to carry over. If this is a fresh project, ignore this notice.';
    return;
  end if;

  -- ── Households ────────────────────────────────────────────────────────────
  select exists (select 1 from information_schema.columns where table_schema='legacy' and table_name='households' and column_name='name') into has_name;
  select exists (select 1 from information_schema.columns where table_schema='legacy' and table_name='households' and column_name='invite_code') into has_invite;
  has_household_col := to_regclass('legacy.households') is not null;

  if has_household_col then
    for r in execute format('select * from legacy.households') loop
      if exists (select 1 from public.households h where h.id = r.id) then
        continue;
      end if;

      -- Read old columns dynamically: the previous schema did not always have
      -- name / invite_code, and a record field that does not exist raises.
      v_name := 'Our kitchen';
      v_legacy_code := null;
      if has_name and has_invite then
        execute 'select name, invite_code from legacy.households where id = $1'
          into v_name, v_legacy_code using r.id;
      elsif has_name then
        execute 'select name from legacy.households where id = $1' into v_name using r.id;
      elsif has_invite then
        execute 'select invite_code from legacy.households where id = $1' into v_legacy_code using r.id;
      end if;
      v_name := coalesce(nullif(btrim(v_name), ''), 'Our kitchen');

      v_code := null;
      if v_legacy_code is not null and v_legacy_code ~ '^[A-Z0-9]{6}$'
         and not exists (select 1 from public.households h where h.invite_code = v_legacy_code) then
        v_code := v_legacy_code;
      end if;
      if v_code is null then
        -- Deterministic, unique, same alphabet the app uses for invites.
        v_code := upper(substr(replace(md5(r.id::text), '-', ''), 1, 6));
        while exists (select 1 from public.households h where h.invite_code = v_code) loop
          v_code := upper(substr(md5(random()::text || v_code), 1, 6));
        end loop;
      end if;

      insert into public.households (id, name, invite_code)
      values (r.id, left(v_name, 80), v_code)
      on conflict (id) do nothing;
      v_households := v_households + 1;
    end loop;
  end if;

  -- A profile can point at a household row the old project never had (some
  -- setups created profiles by hand). Recreate it so the login keeps a kitchen.
  for r in execute 'select distinct household_id from legacy.profiles where household_id is not null' loop
    if r.household_id is null or exists (select 1 from public.households h where h.id = r.household_id) then
      continue;
    end if;
    v_code := upper(substr(replace(md5(r.household_id::text), '-', ''), 1, 6));
    while exists (select 1 from public.households h where h.invite_code = v_code) loop
      v_code := upper(substr(md5(random()::text || v_code), 1, 6));
    end loop;
    insert into public.households (id, name, invite_code)
    values (r.household_id, 'Our kitchen', v_code)
    on conflict (id) do nothing;
    v_households := v_households + 1;
    raise notice 'Recreated household % from the old profiles table.', r.household_id;
  end loop;

  -- ── Profiles (this is what keeps the old logins in their kitchen) ─────────
  for r in execute 'select * from legacy.profiles order by id' loop
    if r.household_id is null or not exists (select 1 from public.households h where h.id = r.household_id) then
      continue;
    end if;
    if exists (select 1 from public.profiles p where p.id = r.id) then
      continue;
    end if;

    v_person_key := case when r.person_key in ('R', 'I') then r.person_key else 'R' end;
    -- The new schema allows one profile per person key in a household.
    if exists (select 1 from public.profiles p where p.household_id = r.household_id and p.person_key = v_person_key) then
      v_person_key := case when v_person_key = 'R' then 'I' else 'R' end;
    end if;
    if exists (select 1 from public.profiles p where p.household_id = r.household_id and p.person_key = v_person_key) then
      raise notice 'Skipping profile % — both person slots are already taken in that household.', r.id;
      continue;
    end if;

    v_display := null;
    if exists (select 1 from information_schema.columns where table_schema='legacy' and table_name='profiles' and column_name='display_name') then
      execute 'select nullif(btrim(display_name), '''') from legacy.profiles where id = $1' into v_display using r.id;
    end if;
    v_display := coalesce(v_display, case v_person_key when 'R' then 'Regita' else 'Ieva' end);

    insert into public.profiles (id, household_id, person_key, display_name)
    values (r.id, r.household_id, v_person_key, left(v_display, 40))
    on conflict (id) do nothing;
    v_profiles := v_profiles + 1;
  end loop;

  -- ── The planned week: variant N becomes the matching library day menu ─────
  if to_regclass('legacy.plan') is not null then
    for r in execute 'select * from legacy.plan order by household_id, day_index' loop
      if r.day_index is null or r.day_index < 0 or r.day_index > 6 then
        continue;
      end if;
      if not exists (select 1 from public.households h where h.id = r.household_id) then
        continue;
      end if;

      v_day := r.day_index;
      if exists (select 1 from public.meal_assignments a where a.household_id = r.household_id and a.day_index = v_day) then
        continue; -- this day already has a plan; never overwrite real data
      end if;

      select m.id into v_recipe from public.menus m
      where m.id = 'menu-' || r.variant_id::text and m.household_id is null;
      continue when v_recipe is null;

      for v_slot in
        select key as slot, value as people from public.menus m, jsonb_each(m.items)
        where m.id = v_recipe
      loop
        if v_slot.slot not in ('breakfast', 'lunch', 'snack', 'dinner') then
          continue;
        end if;
        for v_person in select jsonb_object_keys(v_slot.people) loop
          if v_person not in ('R', 'I', 'both') then
            continue;
          end if;
          v_menu_recipe := v_slot.people ->> v_person;
          if not exists (select 1 from public.recipes rc where rc.id = v_menu_recipe) then
            continue;
          end if;
          insert into public.meal_assignments (household_id, day_index, slot, person_key, recipe_id)
          values (r.household_id, v_day, v_slot.slot, v_person, v_menu_recipe)
          on conflict (household_id, day_index, slot, person_key) do nothing;
          v_assignments := v_assignments + 1;
        end loop;
      end loop;
      v_days := v_days + 1;
    end loop;
  end if;

  -- ── Eaten ticks (need the recipe the day now points at) ───────────────────
  if to_regclass('legacy.eaten') is not null then
    for r in execute 'select * from legacy.eaten where eaten is true order by household_id, day_index' loop
      select a.recipe_id into v_recipe
      from public.meal_assignments a
      where a.household_id = r.household_id
        and a.day_index = r.day_index
        and a.slot = r.slot
        and (a.person_key = r.person_key or a.person_key = 'both')
      order by (a.person_key = r.person_key) desc
      limit 1;

      insert into public.eaten (household_id, day_index, slot, person_key, eaten, recipe_id, applied)
      values (r.household_id, r.day_index, r.slot, r.person_key, true, v_recipe, '[]'::jsonb)
      on conflict (household_id, day_index, slot, person_key) do nothing;
      v_eaten := v_eaten + 1;
      v_recipe := null;
    end loop;
  end if;

  -- ── Water ────────────────────────────────────────────────────────────────
  if to_regclass('legacy.water') is not null then
    for r in execute 'select * from legacy.water order by household_id, day_index' loop
      if r.person_key not in ('R', 'I') or r.day_index is null or r.day_index < 0 or r.day_index > 6 then
        continue;
      end if;
      insert into public.water (household_id, day_index, person_key, ml)
      values (r.household_id, r.day_index, r.person_key, least(5000, greatest(0, coalesce(r.ml, 0))))
      on conflict (household_id, day_index, person_key) do nothing;
      v_water := v_water + 1;
    end loop;
  end if;

  -- ── Notes (old rows were keyed by dish name) ─────────────────────────────
  if to_regclass('legacy.recipe_notes') is not null
     and exists (select 1 from information_schema.columns where table_schema='legacy' and table_name='recipe_notes' and column_name='meal_name_en') then
    for r in execute 'select * from legacy.recipe_notes where note is not null and btrim(note) <> '''' order by household_id' loop
      select rc.id into v_recipe
      from public.recipes rc
      where lower(rc.name_en) = lower(btrim(r.meal_name_en))
        and (rc.household_id is null or rc.household_id = r.household_id)
      order by (rc.household_id is not null) desc
      limit 1;

      continue when v_recipe is null;

      if r.person_key in ('R', 'I', 'both') then
        v_person_key := r.person_key;
      else
        v_person_key := 'both';
      end if;

      insert into public.recipe_notes (household_id, recipe_id, person_key, note)
      values (r.household_id, v_recipe, v_person_key, left(btrim(r.note), 500))
      on conflict (household_id, recipe_id, person_key) do update
        set note = excluded.note, updated_at = now();
      v_notes := v_notes + 1;
      v_recipe := null;
    end loop;
  end if;

  raise notice 'Carried over: % household(s), % profile(s), % day(s) → % meal row(s), % eaten tick(s), % water row(s), % note(s).',
    v_households, v_profiles, v_days, v_assignments, v_eaten, v_water, v_notes;
  raise notice 'Old tables still exist in the legacy schema. Nothing was deleted.';
end $$;

commit;

-- Report: expect one row per partner, and 4 rows per planned day.
select 'households' as what, count(*)::text as value from public.households
union all select 'profiles', count(*)::text from public.profiles
union all select 'planned meals', count(*)::text from public.meal_assignments
union all select 'eaten ticks', count(*)::text from public.eaten
union all select 'water rows', count(*)::text from public.water
union all select 'notes', count(*)::text from public.recipe_notes;
