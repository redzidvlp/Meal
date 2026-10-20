# Database migrations

These files are generated — do not edit them by hand.

```bash
npm run build:sql   # rebuild from schema.sql + seed.sql
```

They exist so the **Supabase GitHub integration** can keep the database in sync
with the repository: with the integration enabled, every migration that reaches the
production branch is applied to the project automatically. Each file runs in one
transaction.

- `…_our_table_schema.sql` — moves an old "Our Meal Plan" schema out of the way
  (into a `legacy` schema, nothing deleted), then creates tables, RLS policies,
  RPCs and realtime.
- `…_our_table_seed.sql` — the preset recipe and menu library, idempotent.

The same generator also writes two files for the SQL editor, which is still the
simplest route for a one-off upgrade:

- `supabase/upgrade-existing-project.sql` — **one paste**: move the old tables aside,
  create the schema, load the library, import the old household, then print a health
  report. Nothing is dropped.
- `supabase/upgrade-from-legacy.sql` — only the first step, for when you would rather
  run `schema.sql`, `seed.sql` and `migrate-legacy-data.sql` separately.

The data import (`supabase/migrate-legacy-data.sql`) is deliberately not part of these
migrations: it copies one particular household out of `legacy.*`, which is right for a
one-time upgrade and wrong to re-run on somebody else's project. Run it once by hand.

`npm run test:db` exercises all of the above on a real Postgres engine (PGlite).
