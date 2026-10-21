# Our Table

> **Setting it up? Start with [GO-LIVE-GUIDE.md](GO-LIVE-GUIDE.md)** — the click-by-click
> walkthrough for upgrading the existing Supabase project, putting the keys in GitHub, and
> installing the app on both phones.

A two-person vegetarian meal planner with a shared weekly plan, live shopping list,
pantry stock tracking, and a rule-based "sous-chef" that suggests similar recipes.

Built with React 18 + Vite, deployed as an installable PWA, and backed by Supabase so
both partners see the same plan in real time.

## Features

- **Phone-first design**: one column, large tap targets, safe-area spacing, installable PWA.
- **Weekly plan** for two people, with four meals a day (breakfast, lunch, snack, dinner).
- **Reusable day menus**: apply a whole day in one tap to any day you choose, edit the
  root variant once and everyone gets your version next time, or save a planned day as
  a new menu.
- **Same or different** for any meal: split a shared meal, change one person's portion,
  or merge two variants back into one shared meal (the app asks which variant to keep).
- **Recipe CRUD**: edit any recipe, edit a library recipe as a personal copy, create or
  delete your own recipes.
- **Strictly vegetarian**: the recipe editor and the data layer reject meat and fish
  ingredients (English and Lithuanian), and the recommendation engine only considers
  vegetarian recipes.
- **Sous-chef suggestions**: scores recipes against macro targets, low-FODMAP,
  gluten-free, quick-prep filters, pantry coverage and recently eaten meals, with
  explanations for every match.
- **New recipe ideas**: a generate button writes a brand-new vegetarian draft around
  your targets. With an AI key configured it asks the `recipe-ai` function; without a
  key the offline generator composes one from the nutrition table. Every draft opens in
  the editor for review before it is saved.
- **Your own labels**: add short labels such as "made in 10 min" while creating or
  editing a recipe. They are stored with the household and filter the whole recipe book.
- **Drag & drop meals**: grab a meal's ⠿ handle and drop it on another section for that
  day (dinner eaten at lunch, for example); tapping the handle offers the same move as
  a list. Occupied targets swap.
- **Remove a whole section**: hide snack (or any section) for one day; the day keeps
  only the meals you want, and the section can be restored later.
- **Updates need a tap**: the PWA runs in prompt mode. After a deploy the new build
  downloads and waits; a full-screen "A fresh version is ready" gate appears with
  **Update now** / **Later** before anything on screen changes, and keeps the current
  week, pantry and shopping list intact until the button is pressed. Settings has a
  manual **Check for updates** as well.
- **Live shopping list**: derived from the plan and from recipe contents; edits to a
  recipe immediately change the quantities. Tick items off, then stock the pantry in
  one tap.
- **Pantry**: stock bars, low-stock alerts, manual restocking, and automatic stock
  decreases (with exact undo) when a meal is marked eaten.
- **Photo capture**: take a picture of a nutrition label or a plated meal and read the
  calories and macros into the recipe editor (with a manual fallback when the AI
  function is not configured).
- **EN / LT** interface.
- **Fast, quiet startup**: system fonts only (no third-party font request to block the
  first paint), the Supabase client is a lazy chunk that a demo build never downloads,
  and the service worker registers after the first screen is drawn. A loading screen
  covers the profile and kitchen fetch, so "connect household" never flashes for an
  account that already has one; after five seconds it explains what is taking so long.
- **Demo mode** when Supabase is not configured, so the UI can be explored without a
  backend (data is then kept in the browser only).

## Quick start

```bash
npm install
cp .env.example .env       # fill in your Supabase project values
npm run dev                # http://localhost:5173
```

Without `.env` values the app starts in demo mode with a sample household and week.

### Supabase setup

> **Upgrading the old "Our Meal Plan" project in place?** Do not create a new project and
> do not touch `auth.users` — the logins stay. Paste
> **`supabase/upgrade-existing-project.sql`** once: it moves the old tables into a
> `legacy` schema (nothing is deleted), builds the new schema, loads the recipe library and
> copies the household, profiles, planned week, eaten ticks, water and notes across. See
> `GO-LIVE-GUIDE.md` for the click-by-click version.

1. Create a Supabase project (or reuse the existing one).
2. In the SQL editor run, in order:
   - `supabase/schema.sql` — tables, RLS policies, grants and RPC functions.
   - `supabase/seed.sql` — the preset recipe library and preset menus.
   - `supabase/migrate-legacy-data.sql` — **only** when upgrading an old project, after
     the two above.
   Re-run `schema.sql` after updating the app: v4 adds `labels`, `day_sections` and the
   `move_slot` / `set_section_hidden` RPCs.
3. (Optional) Deploy the two AI functions and set the shared key:

```bash
supabase functions deploy nutrition-scan   # photo → calories
supabase functions deploy recipe-ai        # brand-new recipe drafts
supabase secrets set AI_API_KEY=sk-...
```

   Details: `supabase/functions/nutrition-scan/README.md` and
   `supabase/functions/recipe-ai/README.md`. Without the key, photo capture falls back
   to manual entry and recipe ideas use the offline generator — both features still work.
4. Put the project URL and anon key in `.env`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

5. Run the app, sign up, create a household, open **Settings** and share the 6-character
   invite code with your partner. They sign up, choose *Join household* and enter it.

### When the kitchen will not open

The app never shows a bare "try again" screen. If Supabase cannot be read it names the
failing table and the likely cause — expired sign-in, wrong anon key, missing tables,
row-level security, a paused project or no network — with the project host and the raw
error behind a **Details** toggle. **Open the demo kitchen instead** keeps the app usable
on the phone while you fix the project.

`supabase/doctor.sql` is a read-only health check: paste it into the Supabase SQL editor
to list every table the app expects and any columns that are missing. Run it whenever the
connection screen says a table is missing.

If the screen says **"This account points at a missing kitchen"**, the profile row survived
an older schema but its `household_id` no longer exists. Unlink it once in the SQL editor
and reload; the app then offers *create kitchen* again:

```sql
delete from public.profiles where id = auth.uid();
```

The anon key is safe to ship: every table is protected by row-level security, writes go
through validated RPC functions, and all access is scoped to the caller's household.
Never put the `service_role` key in the client.

### Publishing the phone preview

Every push to `main` deploys to GitHub Pages through
`.github/workflows/deploy.yml`, at `https://<owner>.github.io/Meal/`. It is the only
workflow that publishes that link — two publishers used to race on every merge, and the
demo build could win.

The link runs your **real Supabase household** as soon as the two secrets exist, and the
labelled **demo household** when they do not:

1. Settings → Secrets and variables → Actions → **Secrets**: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` (both or neither).
2. Re-run **Deploy to GitHub Pages** (or push). The run's **Check the Supabase
   configuration** step states which of the two you are getting.
3. Remove both secrets to fall back to demo instantly.

### Keeping the database in sync with GitHub

The **Supabase GitHub integration** (Dashboard → Project Settings → Integrations →
GitHub) is for *schema*, not for app configuration. When it is enabled with
**Deploy to production** on your production branch, every file in
`supabase/migrations/` that reaches that branch is applied to the project
automatically — no SQL editor.

It does **not** give the web app its URL and anon key. Those are read at build time by
Vite and must still live in GitHub → Settings → Secrets and variables → Actions.

The SQL you run by hand and the SQL the integration applies are generated from one set of
readable sources, so the two routes cannot drift:

```bash
npm run build:sql    # schema.sql, seed.sql, migrate-legacy-data.sql
                     #   → supabase/migrations/*.sql
                     #   → supabase/upgrade-existing-project.sql   (one paste, whole upgrade)
                     #   → supabase/upgrade-from-legacy.sql        (step 1 only)
```

The schema migration first moves an old "Our Meal Plan" schema into a `legacy` schema
(nothing deleted) and then creates the new tables, so a single merge can upgrade an old
project as well as a fresh one. It deliberately does **not** run the data migration: that
imports one particular household, which is right for a one-off upgrade and wrong for a
shared migration file. Run `migrate-legacy-data.sql` by hand once, then leave the
integration to handle schema from then on. If you prefer to stay in control, keep the
integration off and paste `supabase/upgrade-existing-project.sql` into the SQL editor.

### Go-live checklist

1. **Database** — fresh project: `schema.sql`, then `seed.sql`. Existing project: paste
   `upgrade-existing-project.sql` once (or `upgrade-from-legacy.sql` → `schema.sql` →
   `seed.sql` → `migrate-legacy-data.sql`). Finish with `doctor.sql`; every table must
   read `ok`. `npm run test:db` proves all of it on a real Postgres engine first.
2. **Phone link** — repository secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   Re-run the **Deploy to GitHub Pages** workflow. Remove both secrets at any time to fall
   back to the demo kitchen.
3. **Household** — after an in-place upgrade, sign in with the **old** email and password
   and the kitchen is already there. Otherwise *Create kitchen*, open Settings and share
   the invite code; your partner signs up and chooses *Join kitchen*.
4. **AI agent (optional)** — see below; without it the offline engine still writes new
   recipes and photo capture falls back to manual entry.
5. **Install on both phones** — open the link, then *Share → Add to Home Screen* (iOS)
   or *Install app* (Android). Later launches open without a browser bar.
6. **Updates** — every future deploy asks **Update now / Later** before changing
   anything; Settings shows the running build id.

### Turning the AI agent on

```bash
supabase functions deploy recipe-ai        # new recipe drafts
supabase functions deploy nutrition-scan   # photo → calories
supabase secrets set AI_API_KEY=sk-...     # the provider key, server-side only
# optional
supabase secrets set AI_MODEL=gpt-4o-mini
supabase secrets set AI_BASE_URL=https://api.openai.com/v1
supabase secrets set ALLOW_ORIGIN=https://redzidvlp.github.io
```

Verify it: open **✨ Sous-chef → Generate**. The small badge on the idea card must read
**🤖 AI recipe**; if it reads **✨ Offline idea engine**, the function is not deployed, the
key is missing or `ALLOW_ORIGIN` does not include the site you are using. Photo capture is
confirmed the same way from **📷** — a successful scan fills calories and macros.

Deploy without `--no-verify-jwt`: the functions expect a signed-in household, and the key
never reaches the browser.

### Preset library

`supabase/seed.sql` is generated from `src/data/presets.js`:

```bash
npm run seed:sql     # rewrites supabase/seed.sql from the JS presets
```

Do not hand-edit the SQL seed; change the JS data and regenerate.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (also injects the CSP meta tag and PWA service worker) |
| `npm run preview` | Preview the production build |
| `npm test` | Engine + validation unit tests (`node --test`) |
| `npm run test:ui` | Render smoke test of the whole app in jsdom |
| `npm run test:flows` | End-to-end workflow test in jsdom (eat/undo, split/merge, picker, shopping, recipes, pantry, reset) |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` (recipes + library menus) |
| `npm run build:sql` | Regenerate `supabase/migrations/*.sql` and the two upgrade files |
| `npm run test:db` | Run the real SQL on a real Postgres engine (PGlite): fresh install, in-place upgrade, idempotent re-run, edge cases |

The UI tests run against the demo backend; they need no browser or network.

## Architecture

```
src/
  App.jsx                 app shell, tabs, gate screens, picker/editor wiring
  hooks/useAppData.js     one data hook: session, household, plan, pantry, actions
  lib/api.js              picks the Supabase or demo backend
  lib/supabaseBackend.js  production backend (REST + RPC + realtime)
  lib/demoBackend.js      local demo backend (same contract, localStorage)
  lib/validate.js         sanitisation and limits for every write
  lib/ingredients.js      ingredient keys, units, meat/fish detection
  engine/plan.js          plan resolution, totals, eaten state
  engine/shopping.js      shopping aggregation from plan + recipes + pantry
  engine/pantry.js        stock deltas, low stock, coverage
  engine/recommend.js     scoring and filters for suggestions
  engine/generate.js      offline vegetarian recipe generator (targets, filters, seeds)
  lib/ideas.js            AI-first, offline-fallback recipe idea service
  lib/labels.js           household labels ↔ x- tags, filters and display text
  data/ingredientFacts.js nutrition table for the generator
  data/presets.js         38 vegetarian preset recipes + 10 preset menus
  lib/menus.js            library menus + household overrides
  data/translations.js    EN / LT strings
supabase/functions/nutrition-scan/  photo → nutrition Edge Function
supabase/functions/recipe-ai/       new recipe drafts (optional AI)
supabase/schema.sql       schema, RLS, RPCs, realtime publication
```

The UI never talks to Supabase directly; `api.js` exposes one contract with two
implementations, and every mutation is followed by a refresh. Realtime subscriptions
keep a second device in sync.

## How the sous-chef works

There are two different jobs behind the sparkle tab:

1. **Existing recipes.** `engine/recommend.js` scores every vegetarian recipe against
   the chosen reference meal or manual targets, diet filters (low-FODMAP, quick, high
   protein), pantry coverage, shared ingredients and recently eaten meals. The best
   matches are shown with the reasons behind each score.
2. **Brand-new recipes.** `lib/ideas.js` first asks the `recipe-ai` Edge Function. If the
   function is not deployed or `AI_API_KEY` is missing, it falls back to
   `engine/generate.js`, which composes a recipe from `ingredientFacts.js`, scales the
   energy and protein ingredients toward the target and derives diet tags. **Reroll**
   advances the seed and excludes the names already on screen, so it composes a genuinely
   different dish. The result is always a draft: it opens in the normal editor and is only
   written to Supabase when you tap Save.

To switch AI recipe writing on: run the updated `schema.sql`, deploy `recipe-ai`, and set
`AI_API_KEY` (optionally `AI_MODEL` / `AI_BASE_URL`). The function validates the model's
reply, clamps every number, rejects meat and fish, and never returns provider errors or
keys to the browser. Photo reading works the same way through `nutrition-scan`.

## Security notes

- Row-level security on every table; policies resolve the caller's household through
  `my_household_id()`.
- Direct writes to `meal_assignments` and `eaten` are revoked for clients; mutations go
  through validated `security definer` RPCs with revoked public execute.
- Invite codes are generated server-side, unguessable, and constrained to
  `^[A-Z0-9]{6}$`.
- Server-side constraints mirror the client limits (name lengths, ≤40 ingredients,
  nutrition bounds, pantry quantities, note length).
- Production CSP restricts scripts, connections and frames; no `unsafe-eval`, no
  third-party scripts.
- Inputs are sanitised on both sides, including Unicode control characters and emoji
  handling.
