# Our Table

A two-person vegetarian meal planner with a shared weekly plan, live shopping list,
pantry stock tracking, and a rule-based "sous-chef" that suggests similar recipes.

Built with React 18 + Vite, deployed as an installable PWA, and backed by Supabase so
both partners see the same plan in real time.

## Features

- **Weekly plan** for two people, with four meals a day (breakfast, lunch, snack, dinner).
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
- **Live shopping list**: derived from the plan and from recipe contents; edits to a
  recipe immediately change the quantities. Tick items off, then stock the pantry in
  one tap.
- **Pantry**: stock bars, low-stock alerts, manual restocking, and automatic stock
  decreases (with exact undo) when a meal is marked eaten.
- **EN / LT** interface, light warm-parchment design, installable PWA.
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
3. Put the project URL and anon key in `.env`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

4. Run the app, sign up, create a household, open **Settings** and share the 6-character
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
| `npm run seed:sql` | Regenerate `supabase/seed.sql` |

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
  data/presets.js         38 vegetarian preset recipes + 10 preset menus
  data/translations.js    EN / LT strings
supabase/schema.sql       schema, RLS, RPCs, realtime publication
```

The UI never talks to Supabase directly; `api.js` exposes one contract with two
implementations, and every mutation is followed by a refresh. Realtime subscriptions
keep a second device in sync.

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
