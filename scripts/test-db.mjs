// Runs the real SQL against a real Postgres engine (PGlite, WASM) with the
// pieces Supabase provides stubbed: auth.users, auth.uid(), anon/authenticated.
//
//   npm run test:db
//
// Covers the three paths that matter:
//   1. fresh project        → schema + seed, twice
//   2. old project          → one-paste upgrade, twice
//   3. old project without a households table, and with display names + invite code
// A failing assertion here means someone's database would break, not just the UI.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSql = file => readFileSync(join(root, "supabase", file), "utf8").replace(/create\s+extension[^;]+;/gi, "");

const HOUSEHOLD = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REGITA = "11111111-1111-1111-1111-111111111111";
const IEVA = "22222222-2222-2222-2222-222222222222";

async function freshDatabase() {
  const db = await new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  return db;
}

async function seedOldApp(db, { withHouseholds = true, withNames = true, withInvite = true } = {}) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${REGITA}', 'regita@example.com'),
      ('${IEVA}', 'ieva@example.com');
  `);
  if (withHouseholds) {
    await db.exec(
      withInvite
        ? `create table public.households (id uuid primary key default gen_random_uuid(), name text, invite_code text, created_at timestamptz default now());`
        : `create table public.households (id uuid primary key default gen_random_uuid(), name text, created_at timestamptz default now());`,
    );
    const code = withInvite ? "'OLD123'" : "null";
    await db.exec(`insert into public.households (id, name${withInvite ? ", invite_code" : ""}) values ('${HOUSEHOLD}', 'Mūsų virtuvė'${withInvite ? `, ${code}` : ""});`);
  }
  await db.exec(
    withNames
      ? `create table public.profiles (id uuid primary key, household_id uuid, person_key text, display_name text);`
      : `create table public.profiles (id uuid primary key, household_id uuid, person_key text);`,
  );
  await db.exec(`
    create table public.plan (household_id uuid, day_index int, variant_id int, updated_by uuid, primary key (household_id, day_index));
    create table public.eaten (household_id uuid, day_index int, slot text, person_key text, eaten boolean, primary key (household_id, day_index, slot, person_key));
    create table public.water (household_id uuid, day_index int, person_key text, ml int, primary key (household_id, day_index, person_key));
    create table public.recipe_notes (household_id uuid, meal_name_en text, person_key text, note text, updated_by uuid, primary key (household_id, meal_name_en, person_key));
    create table public.meal_swaps (household_id uuid, day_index int, slot text, person_key text, meal_json text, primary key (household_id, day_index, slot, person_key));
  `);
  await db.exec(
    withNames
      ? `insert into public.profiles (id, household_id, person_key, display_name) values
           ('${REGITA}', '${HOUSEHOLD}', 'R', 'Regita'),
           ('${IEVA}', '${HOUSEHOLD}', 'I', 'Ieva');`
      : `insert into public.profiles (id, household_id, person_key) values
           ('${REGITA}', '${HOUSEHOLD}', 'R'),
           ('${IEVA}', '${HOUSEHOLD}', 'I');`,
  );
  await db.exec(`
    insert into public.plan (household_id, day_index, variant_id) values
      ('${HOUSEHOLD}', 0, 1), ('${HOUSEHOLD}', 1, 2), ('${HOUSEHOLD}', 2, 3);
    insert into public.eaten (household_id, day_index, slot, person_key, eaten) values
      ('${HOUSEHOLD}', 0, 'breakfast', 'R', true),
      ('${HOUSEHOLD}', 0, 'breakfast', 'I', true),
      ('${HOUSEHOLD}', 1, 'lunch', 'both', true);
    insert into public.water (household_id, day_index, person_key, ml) values
      ('${HOUSEHOLD}', 0, 'R', 750), ('${HOUSEHOLD}', 0, 'I', 500);
    insert into public.recipe_notes (household_id, meal_name_en, person_key, note) values
      ('${HOUSEHOLD}', 'Avocado toast with boiled eggs', 'R', 'add chili'),
      ('${HOUSEHOLD}', 'Rice bowl with Edamame & Tahini', 'I', 'swap rice for quinoa');
  `);
}

const one = async (db, text) => (await db.query(text)).rows[0];
const doctorRows = async db =>
  (await db.query(readSql("doctor.sql"))).rows.filter(row => row.section === "table");

// Every table reachable through the public API must have RLS on. Supabase's
// linter warns about this at paste time, but a fresh install has no linter.
const expectRlsEverywhere = async (db, label) => {
  const rows = (await db.query(`
    select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename
  `)).rows;
  assert.ok(rows.length >= 12, `${label}: public tables present`);
  const open = rows.filter(row => !row.rowsecurity).map(row => row.tablename);
  assert.deepEqual(open, [], `${label}: tables without RLS`);
};
const count = async (db, table) => Number((await one(db, `select count(*)::int as n from public.${table}`)).n);

async function expectUpgraded(db, label) {
  const household = await one(db, `select id, name, invite_code from public.households`);
  assert.equal(household.id, HOUSEHOLD, `${label}: household id preserved`);
  assert.ok(household.name && household.name.length > 0, `${label}: household name`);
  assert.match(household.invite_code, /^[A-Z0-9]{6}$/, `${label}: invite code is usable`);

  const profiles = (await db.query(`select id, person_key, display_name from public.profiles`)).rows;
  assert.equal(profiles.length, 2, `${label}: both logins kept their profile`);
  const byKey = Object.fromEntries(profiles.map(p => [p.person_key, p]));
  assert.equal(byKey.R?.id, REGITA, `${label}: Regita keeps her auth id`);
  assert.equal(byKey.I?.id, IEVA, `${label}: Ieva keeps her auth id`);
  assert.ok(byKey.R?.display_name && byKey.I?.display_name, `${label}: display names filled`);

  // Day 0 was Variant I (two breakfasts), days 1 and 2 four shared meals each.
  assert.equal(await count(db, "meal_assignments"), 13, `${label}: the week was recreated`);
  const day0 = (await db.query(`select recipe_id from public.meal_assignments where day_index = 0 order by slot, person_key`)).rows;
  assert.equal(day0.length, 5, `${label}: split breakfast is still split`);

  assert.equal(await count(db, "eaten"), 3, `${label}: eaten ticks`);
  const eaten = (await db.query(`select recipe_id from public.eaten where day_index = 1 and slot = 'lunch'`)).rows[0];
  assert.equal(eaten.recipe_id, "baked-tofu-with-lentils-sun-dried-tomatoes", `${label}: eaten points at the real dish`);
  assert.equal(await count(db, "water"), 2, `${label}: water`);
  assert.equal(await count(db, "recipe_notes"), 2, `${label}: notes matched by dish name`);

  // Every expected table/column must report ok.
  const doctor = await doctorRows(db);
  assert.ok(doctor.length >= 12, `${label}: doctor lists every table`);
  assert.ok(doctor.every(row => row.status === "ok"), `${label}: doctor says ok`);
  assert.ok(doctor.every(row => row.detail === "—"), `${label}: no missing columns`);
}

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (error) {
    results.push(`✗ ${name}\n   ${error.message}`);
    process.exitCode = 1;
  }
}

await scenario("fresh project: schema + seed, run twice", async () => {
  const db = await freshDatabase();
  const schema = readSql("schema.sql");
  const seed = readSql("seed.sql");
  await db.exec(schema);
  await db.exec(seed);
  await db.exec(schema);
  await db.exec(seed);
  await expectRlsEverywhere(db, "fresh install");
  const doctor = await doctorRows(db);
  assert.ok(doctor.every(row => row.status === "ok" && row.detail === "—"));
  assert.equal(Number((await one(db, `select count(*)::int as n from public.recipes where household_id is null`)).n), 38);
  assert.equal(Number((await one(db, `select count(*)::int as n from public.menus where household_id is null`)).n), 10);
  await db.close();
});

await scenario("old project: one-paste upgrade keeps logins and the week", async () => {
  const db = await freshDatabase();
  await seedOldApp(db);
  await db.exec(readSql("upgrade-existing-project.sql"));
  await expectUpgraded(db, "first run");
  await expectRlsEverywhere(db, "upgrade");
  await db.exec(readSql("upgrade-existing-project.sql"));
  await expectUpgraded(db, "second run (idempotent)");
  const legacy = await one(db, `select count(*)::int as n from legacy.plan`);
  assert.equal(Number(legacy.n), 3, "old rows stay readable in the legacy schema");
  await db.close();
});

await scenario("old project without households, without display names", async () => {
  const db = await freshDatabase();
  await seedOldApp(db, { withHouseholds: false, withNames: false });
  await db.exec(readSql("upgrade-existing-project.sql"));
  const household = await one(db, `select id, name from public.households`);
  assert.equal(household.id, HOUSEHOLD, "household recreated from profiles");
  assert.equal(household.name, "Our kitchen");
  const profiles = (await db.query(`select person_key, display_name from public.profiles`)).rows;
  const names = Object.fromEntries(profiles.map(p => [p.person_key, p.display_name]));
  assert.equal(names.R, "Regita");
  assert.equal(names.I, "Ieva");
  assert.equal(await count(db, "meal_assignments"), 13);
  await db.close();
});

await scenario("old project with its own invite code and display names", async () => {
  const db = await freshDatabase();
  await seedOldApp(db, { withNames: true, withInvite: true });
  await db.exec(readSql("upgrade-existing-project.sql"));
  const household = await one(db, "select invite_code, name from public.households");
  assert.equal(household.invite_code, "OLD123", "the invite code you already shared still works");
  assert.equal(household.name, "Mūsų virtuvė");
  await db.close();
});


// The exact situation of a database upgraded one release ago: everything is
// current except that `products` has no `uses` column yet, and the household
// already saved a product. Running the newer paste must add the column and
// keep the row — this is the "is it safe to press Run again?" case.
await scenario("project upgraded last week: the paste only adds what is missing", async () => {
  const db = await freshDatabase();
  await seedOldApp(db);
  await db.exec(readSql("upgrade-existing-project.sql"));
  // Roll the schema back to the previous release.
  await db.exec(`
    alter table public.products drop column if exists uses;
    insert into public.products (household_id, key, name_en, name_lt, kcal, protein, carbs, fat, unit, portion_grams)
    values ('${HOUSEHOLD}', 'p-veganiski-pjausniai', 'Veganiški pjausniai kumpio stiliaus', 'Veganiški pjausniai kumpio stiliaus', 220, 24.3, 8.4, 9.5, 'g', 80);
  `);
  const before = await one(db, `select count(*)::int as n from public.products`);
  assert.equal(Number(before.n), 1, "the saved product is there before the upgrade");

  await db.exec(readSql("upgrade-existing-project.sql"));

  const columns = (await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'products' order by column_name
  `)).rows.map(row => row.column_name);
  assert.ok(columns.includes("uses"), `the new column was added (${columns.join(", ")})`);

  const product = await one(db, `select name_en, kcal, protein, uses from public.products where key = 'p-veganiski-pjausniai'`);
  assert.equal(product.name_en, "Veganiški pjausniai kumpio stiliaus", "the saved product survived");
  assert.equal(Number(product.kcal), 220, "its calories survived");
  assert.equal(Number(product.protein), 24.3, "its protein survived");
  assert.deepEqual(product.uses, [], "existing rows get an empty uses list, not null");

  // The week, the pantry and the people are untouched by a second paste.
  assert.equal(await count(db, "meal_assignments"), 13, "the week is unchanged");
  assert.equal(await count(db, "profiles"), 2, "both logins are unchanged");
  const doctor = await doctorRows(db);
  assert.ok(doctor.every(row => row.status === "ok"), "doctor reports ok after the second paste");

  // And it is still idempotent a third time.
  await db.exec(readSql("upgrade-existing-project.sql"));
  assert.equal(await count(db, "meal_assignments"), 13);
  assert.equal(Number((await one(db, `select count(*)::int as n from public.products`)).n), 1);
  await db.close();
});

await scenario("empty project: one-paste upgrade works and reports ok", async () => {
  const db = await freshDatabase();
  await db.exec(readSql("upgrade-existing-project.sql"));
  const doctor = await doctorRows(db);
  assert.ok(doctor.every(row => row.status === "ok" && row.detail === "—"));
  assert.equal(await count(db, "households"), 0);
  await db.close();
});

console.log(results.join("\n"));
if (!process.exitCode) console.log("DB TESTS OK");
