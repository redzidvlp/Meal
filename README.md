# Our Table

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
  explanations for every match. **Reroll** walks down that ranking for a different set.
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
- **Recurring update prompt**: the PWA runs in prompt mode, checks for a fresh build in
  the background and shows "A fresh version is ready" after every deploy.
- **Live shopping list**: derived from the plan and from recipe contents; edits to a
  recipe immediately change the quantities. Tick items off, then stock the pantry in
  one tap.
- **Pantry**: stock bars, low-stock alerts, manual restocking, and automatic stock
  decreases (with exact undo) when a meal is marked eaten.
- **Photo capture**: take a picture of a nutrition label or a plated meal and read the
  calories and macros into the recipe editor (with a manual fallback when the AI
  function is not configured).
- **EN / LT** interface.
- **Smooth startup**: a loading screen covers the profile and kitchen fetch, so
  "connect household" never flashes for an account that already has one.
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

1. Create a Supabase project.
2. In the SQL editor run, in order:
   - `supabase/schema.sql` — tables, RLS policies, grants and RPC functions.
   - `supabase/seed.sql` — the preset recipe library and preset menus.
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

The anon key is safe to ship: every table is protected by row-level security, writes go
through validated RPC functions, and all access is scoped to the caller's household.
Never put the `service_role` key in the client.

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
   protein), pantry coverage, shared ingredients and recently eaten meals. Reroll rotates
   the same ranked list, so every card stays a real match while the visible set changes.
2. **Brand-new recipes.** `lib/ideas.js` first asks the `recipe-ai` Edge Function. If the
   function is not deployed or `AI_API_KEY` is missing, it falls back to
   `engine/generate.js`, which composes a recipe from `ingredientFacts.js`, scales the
   energy and protein ingredients toward the target and derives diet tags. The result is
   always a draft: it opens in the normal editor and is only written to Supabase when you
   tap Save.

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
