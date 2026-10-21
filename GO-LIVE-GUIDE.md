# Our Table — the complete go-live guide

Written for someone who has never done this before. Follow it top to bottom; do not skip
a phase, and check the **“You should see”** line before moving on. Total time: about
40 minutes without AI, 60 with it.

Phone version of this page: **https://redzidvlp.github.io/Meal/guide.html**

---

## Before you start: the three places involved

| Place | What it is | What lives there |
|---|---|---|
| **Supabase** (supabase.com) | Your database in the cloud | The tables, your recipes, your plan, both logins. Also the AI functions and the AI key. |
| **GitHub** (github.com) | Where the code lives and where the site is built | The app code. Two **secrets** (how the site finds your database) and one **variable** (a switch that says “use the real database”). |
| **Your phone** | Just a browser | Nothing to install from a store. You open a link and add it to the home screen. |

Two ideas that make everything below make sense:

- **A “secret” in GitHub is not a password you type into the app.** It is a value the build
  reads once, at the moment it creates the website. If you change it, the website must be
  rebuilt (Phase 4 explains how).
- **The database key that goes into the website is public on purpose.** It only identifies
  the project; Supabase’s row-level security decides what each signed-in person may read.
  The key that must never be published is the `service_role` / secret key — we never use it
  in the website.

---

## What is still missing — the short list

The code, the site and the connection are already live. Only one thing is left before you
can plan meals for real:

| # | Missing | Where it goes | State |
|---|---|---|---|
| 1 | **The database has not been upgraded yet** — the site will sign you in and then say a table is missing | Supabase SQL editor, one paste | **Do Phase 2 now** |
| 2 | The site's Supabase URL | GitHub → **Secrets** → `VITE_SUPABASE_URL` | already set |
| 3 | The public database key | GitHub → **Secrets** → `VITE_SUPABASE_ANON_KEY` | already set |
| 4 | *(nothing else — the two secrets ARE the switch)* | — | — |
| 5 | A build that contains 2–3 | GitHub → Actions | done |
| 6 | *(optional)* AI provider key, for better recipes and photo reading | Supabase → **Edge Functions → Secrets** → `AI_API_KEY` | optional |
| 7 | The new build on each phone | Open the link → **Update now** | after Phase 2 |

How to tell 2–5 are really done: open **https://redzidvlp.github.io/Meal/** — it shows the
**Sign in / Create account** card and the line *“Your data lives in your private Supabase
household”*. In demo mode it would instead show a kitchen straight away with a yellow
**Local demo** banner. You are therefore not in demo mode.

Nothing else is required. In particular you do **not** need a new Supabase project, a new
database password, a new link, or a new account.

---

## Phase 1 — Find your existing Supabase project (2 min)

You are keeping the project that already holds your logins, so there is nothing to create.

1. Go to **https://supabase.com/dashboard/projects**. If you see several projects, open the one
   the old app was using — the one with tables named `plan`, `eaten`, `water`, `recipe_notes`,
   `meal_swaps` (check **Table Editor**).
2. Write down its **Project URL**: **Project Settings → API → Project URL**.

> **You should see:** a dashboard, and in Table Editor the old tables listed.

> **No such project?** Then you are starting fresh — skip to Phase 2 and use
> `schema.sql` + `seed.sql` instead of the upgrade file; everything else is identical.

The old app will stop working after Phase 2. That is expected: this app replaces it. Your
**email and password keep working**, because logins live in `auth.users`, which is untouched.

---

## Phase 2 — Upgrade the database in one paste (10 min)

One file does everything: it moves the old tables aside (nothing is deleted), creates the new
tables, loads the recipe library, and copies your household, both logins, the planned week,
water and notes into the new structure.

### 2a. Copy the file

Open this address — it is plain text, no buttons to hunt for:

`https://raw.githubusercontent.com/redzidvlp/Meal/main/supabase/upgrade-existing-project.sql`

`Ctrl+A` / `Cmd+A`, then `Ctrl+C` / `Cmd+C`.

“Running a file” always means **copy its text, paste it, press Run**. The SQL editor cannot
open files — that is exactly what your earlier `syntax error at or near "upgrade"` was: it ran
the *filename* as if it were SQL.

### 2b. Paste and run

1. Supabase → left sidebar **SQL Editor** → **New query**.
2. Paste. Press **Run** (`Ctrl+Enter`). It takes 10–30 seconds.
3. Scroll to the **last result table**.

> **You should see:** one table starting with `table | households | ok | —`. Every one of the
> 12 table rows must say **ok** and **—**. Below them: `row count` rows showing your household,
> your 2 profiles, 38 recipes, and the number of planned meals carried over (for a full week,
> 26–28). The very end shows `project | database | postgres` and your number of auth users.

What the result tells you:

| In the table | Meaning |
|---|---|
| `ok` and `—` everywhere | Done. Go to Phase 3. |
| `MISSING TABLE` on one row | The paste was cut short — run the same file again; it is safe. |
| `detail` lists columns | The paste was cut short or an old table survived; send me the row. |
| Red error | Stop; send me the text. Nothing was half-applied because the scripts are idempotent. |

### 2c. What happened to your old data

- Old tables are **moved**, not dropped, into a schema called `legacy`. You can look at them in
  Table Editor → schema dropdown `legacy`. Delete them later with
  `drop schema legacy cascade;` when you are sure.
- Carried over: household name and id, invite code (if the old project had one), both profiles
  and names, the variant chosen for each day (as the matching day menu), “eaten” ticks, water,
  and notes matched by dish name.
- Not carried over: custom swapped meals from the old app; those days show the menu dish.
- Re-running the file is safe and changes nothing that is already there.

---

## Phase 3 — Get the two values the website needs (3 min)

1. Left sidebar → **Project Settings** (gear) → **API** (some dashboards call the page
   **API Keys**).
2. Copy these two things into a temporary note:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon public** key — a long string starting with `eyJ…`
     (newer projects may show **Publishable key** starting with `sb_publishable_…` — use that
     one instead; either works.)
3. **Do not copy** `service_role` or **Secret key**. If you ever paste that into a website or
   a chat, rotate it immediately.

> **Security, in one line:** the anon/publishable key is designed to be visible in a browser;
> the service_role key bypasses all protections and stays inside Supabase only.

### 3b. Make sign-up painless for two people (recommended, 2 min)

Supabase’s free email sender allows only a couple of emails per hour, which is enough to
block your partner’s registration.

1. Left sidebar → **Authentication** → **Sign In / Providers** → **Email**.
2. Turn **Confirm email** **off**. Save.
3. Still in Authentication → **URL Configuration**:
   - **Site URL:** `https://redzidvlp.github.io/Meal/`
   - **Redirect URLs:** add `https://redzidvlp.github.io/Meal/`

Without this step, after pressing *Create account* you may see
“Account created. Confirm your email” and never receive the mail.

---

## Phase 4 — Teach GitHub where the database is (8 min)

The site is built by GitHub Actions from `.github/workflows/deploy.yml` — the only workflow
that publishes the phone link. It builds against Supabase whenever the two secrets below
exist, and falls back to the labelled demo household when they do not, so the link always
opens.

### 4a. The two secrets

1. Open your repo: `https://github.com/redzidvlp/Meal`
2. **Settings** (top bar of the repo, not your account) → left sidebar
   **Secrets and variables** → **Actions**.
3. Stay on the **Secrets** tab → **New repository secret**:
   - Name: `VITE_SUPABASE_URL` → Secret: the **Project URL** from Phase 3 → **Add secret**
   - **New repository secret** again: Name: `VITE_SUPABASE_ANON_KEY` → Secret: the
     **anon/publishable** key → **Add secret**

Names must match exactly, including the `VITE_` prefix and capitals.

### 4b. There is no switch any more

Two secrets are the whole configuration. If both exist, the deploy builds against Supabase;
if neither exists, it builds the safe demo. To go back to demo for a while, delete both
secrets — but never keep only one of them: the workflow stops with an error instead of
publishing a broken link.

### 4c. Build and publish

1. Repo → **Actions** tab → left column **Deploy to GitHub Pages**.
2. **Run workflow** (right side) → branch `main` → **Run workflow**.
   (If the button is missing, the workflow has not reached `main` yet — use the link instead.)
3. Wait ~1 minute for a green tick. Open the run: the step **Check the Supabase configuration**
   says either *“Building against Supabase at …”* or *“No Supabase secrets found — DEMO”*.

> **You should see:** the site at **https://redzidvlp.github.io/Meal/** opens with a sign-in
> screen and **no** yellow “Local demo” banner. If the banner is still there, open the run and
> read that check step — it names the reason.

---

## Phase 5 — Open the kitchen with your old login (5 min)

Because the migration kept your profiles, **do not create a new kitchen**.

1. Open the link → **Sign in** with the email and password you already used in the old app.
   - If you never created an account (the old app may have been opened only on one device),
     use **Create account** instead; you will be asked to create a kitchen.
2. The app should land straight on this week's plan, with the migrated meals, water and notes.
3. Open **⚙️ Settings** → the **invite code** is there.
   - Your partner also just signs in with her old password — she is already in the household.
   - If she is new, she creates an account and chooses **Join kitchen** with that code.
4. Mark a meal eaten on one phone; the other phone updates within a second or two (the
   realtime connection).

> **You should see:** the plan filled from the old week, both names in Settings, and no
> “Create kitchen” screen.
>
> **If “Create kitchen” appears:** the old `profiles` table was empty in that project, so
> there was no login to carry over. Create the kitchen once and invite your partner — the
> rest of this guide still applies.

> **You should see:** two people listed (e.g. *Regita*, *Ieva*), a shared week, and a
> shopping list already filled from the plan.

---

## Phase 6 — Put it on the home screen (2 min per phone)

It is a website that behaves like an app; no store, no install file.

- **iPhone (Safari):** open the link → **Share** → **Add to Home Screen** → Add.
- **Android (Chrome):** open the link → **⋮** menu → **Install app** / **Add to Home screen**.

From then on it opens without a browser bar. The first launch downloads ~0.4 MB and then
works from the phone’s cache; later launches are immediate.

---

## Phase 7 — The AI agent (optional, 15 min)

The app works without this: suggestions, new recipe ideas and photo reading all have an
offline fallback. The AI simply writes nicer, more varied recipes and reads photos properly.

### 7a. Get an API key

Use an **OpenAI-compatible** provider. The simplest is OpenAI:

1. https://platform.openai.com → sign in → **API keys** → **Create new secret key**.
2. Copy it once (starts with `sk-…`), keep it private.
3. OpenAI requires a payment method with a few dollars of credit. Each recipe costs a
   fraction of a cent.

(OpenRouter works too: key from openrouter.ai, and later set `AI_BASE_URL` and `AI_MODEL`.)

### 7b. Put the key into Supabase (never GitHub, never the app)

1. Supabase → **Edge Functions** → **Secrets** (older dashboard: Project Settings →
   Edge Functions → Secrets).
2. **Add new secret**: Name `AI_API_KEY`, Value: your `sk-…` key. Save.

Optional extras, same screen: `AI_MODEL` = `gpt-4o-mini`, `AI_BASE_URL` =
`https://api.openai.com/v1`, `ALLOW_ORIGIN` = `https://redzidvlp.github.io`.

### 7c. Deploy the two functions

**Without installing anything (recommended):**

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via editor**.
2. Name it exactly `recipe-ai`.
3. Delete the sample code, paste the whole of
   `https://raw.githubusercontent.com/redzidvlp/Meal/main/supabase/functions/recipe-ai/index.ts`
   → **Deploy**.
4. Repeat with name `nutrition-scan` and
   `https://raw.githubusercontent.com/redzidvlp/Meal/main/supabase/functions/nutrition-scan/index.ts`.
5. Leave **Verify JWT** ON for both (the app sends the signed-in user’s token).

### 7c-bis. Keeping it fresh

The functions change as the app does. If you deployed them before, paste `recipe-ai`
once more: **Edge Functions → recipe-ai → edit → select all → paste the file from
`main` → Deploy updates**.

What the new version adds:

- the **“Anything you feel like?”** line is sent to the model and treated as a hard
  requirement — ask for curd and it must be in the ingredients;
- a **Ready in** budget is passed through as “ready in N minutes or less”;
- if the model ignores it, the function asks again once, and the app falls back to the
  built-in engine, which is now guaranteed to include the ingredient you named;
- rerolling also avoids the ingredients of the last few ideas, so you stop getting the
  same dish with one vegetable swapped.

Without the update the app still works: it notices the model ignored your wish and
answers with the offline engine instead — so you get your curd either way.

### 7c-ter. How the sous-chef is laid out

The whole page is one card, read top to bottom:

1. **Anything you feel like?** — type a few ingredients, or a sentence.
2. **Ready in** — *Any time*, 15, 20 or 30 minutes.
3. **Meal type** — breakfast, lunch, snack or dinner.
4. **Course** — either, sweet or savoury.
5. **Rules** — high protein, low-FODMAP, prefer what is in the pantry, skip repeats.
6. **✨ Generate recipe**, with **Will make:** directly underneath.

Nothing on this page changes a recipe you already have. The result appears as its own card
below; **Review & save** is the only thing that puts it into your recipe book. The
**Start from a meal I already planned** line at the bottom is optional and starts closed —
it only copies calories and meal type, never the dish.

Under the Generate button, the “From your own recipe book” list is a separate thing: it
scores recipes you already own against the same targets, for the nights you would rather
reuse something.

### 7c-quater. What the sous-chef can be asked for

Type into **“Anything you feel like?”** the way you would say it out loud:

- an ingredient — `curd`, `chickpeas`, `varškė` (it must end up in the recipe)
- something to leave out — `no mushrooms`, `be svogūnų`
- a kind of dish — `sweet`, `dessert` (builds a dessert, not a savoury plate)
- a modifier — `lactose free`, `quick`, `high protein`

The chips under the box show what it understood, and **Will make:** under the Generate
button says what will be cooked. If a chip is wrong, change a word — the app only acts on
what it recognised, it does not guess silently.

`lactose free curd` is the one combination worth knowing: curd is dairy, so the app keeps
your curd and asks for the lactose-free version of it rather than swapping it out.

### 7d. Prove it works

1. Open the app → **✨ Sous-chef** → press **✨ Generate recipe**.
2. The small badge on the idea card must read **🤖 AI recipe**.
   If it says **✨ Offline idea engine**, the card now says why, in one line:
   - *“The AI function is not set up…”* → step 7a–7c was skipped (no function, or no key).
   - *“The AI function did not answer…”* → the key is wrong, quota is empty, or the
     function was updated but not redeployed.
   - *“The model’s answer did not match what you asked for…”* → the function is running,
     but it produced something the app refused (missing your ingredient, or a savoury
     dish when you asked for sweet). Reroll; the offline engine is already giving you a
     correct recipe in the meantime.
3. Press **🎲 Reroll** — a different dish must appear.
4. Plan tab → **📷** → photograph a nutrition label → it fills calories and macros.

---

## Phase 8 — Prove the update button works (2 min)

This matters to you: your partner must never see changes without pressing a button.

After any future deploy, her phone shows a full-screen card **“A fresh version is ready”**
with **Update now** / **Later**. If she presses Later, the old version keeps running and her
week, pantry and shopping list stay exactly as they are.

To see it once deliberately: make a tiny change (or ask me to), let the workflow go green,
then open the app on a phone that already has it installed. Settings shows the running
**build id** (short commit hash) so you can compare phones.

---

## Phase 9 — Optional: let Supabase read the repository itself

Your screenshot (Supabase → Integrations → GitHub) is a *different* feature from Phase 4:

| It does | It does not |
|---|---|
| Apply `supabase/migrations/*.sql` to your database when commits reach the production branch | Provide `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the website |
| Deploy Edge Functions declared in `supabase/config.toml` | Store your AI key |

So it never replaces Phase 4 or 7b. It is only worth enabling once you stop wanting to paste
SQL by hand — and it only does something when `main` contains a `supabase/migrations/` folder
(the working branch has one prepared; `main` does not yet).

---

## If something goes wrong

The app names the failure instead of saying “refresh to retry”. Match the title on screen:

| On screen | Real cause | Fix |
|---|---|---|
| **The database is missing tables** (lists a table) | Phase 2 skipped or partially run | Run `upgrade-existing-project.sql` again, then `doctor.sql` |
| **This build has the wrong Supabase key** | Secret pasted wrong / belongs to another project | Re-do 4a with the URL and anon key of the *same* project, then 4c |
| **Your sign-in expired** | Account from a different project, or session invalid | Sign out, sign in; if it repeats, check that the secrets are from this project |
| **The Supabase project is paused or unreachable** | Free projects pause after ~a week idle | Supabase dashboard → Restore project |
| **No answer from Supabase** | Wi-Fi, VPN, ad-blocker, or the project URL is wrong | Try mobile data; re-check 4a |
| **The database said no** | Row-level security blocked the account | Confirm the account joined a kitchen; re-run `schema.sql` |
| Yellow **Local demo** banner after going live | the deploy built without the Supabase secrets (check the **Check the Supabase configuration** step) | Do 4a, then 4c again |
| Your phone shows demo data but the site works on a laptop | the installed app kept an older demo build in its cache | close the app fully and reopen it; if the yellow banner stays, remove the home-screen icon and add it again |
| `syntax error at or near "upgrade"` | The *filename* was run instead of the file’s text | Open the `raw.githubusercontent.com` link → select all → paste |
| `MISSING TABLE` in Phase 2’s last table | Paste cut short, or an older run stopped halfway | Run the same file again — it is idempotent |
| “Account created. Confirm your email.” and no email | Confirmation is on / free email limit | Phase 3b: turn Confirm email off, sign in again |
| Generate shows **Offline idea engine** | AI key or function missing | Phase 7b and 7c; redeploy both functions after changing secrets |

When asking for help, send: the connection screen with **Details** open, the result of
`doctor.sql`, and the failed step from the **Actions** tab.

---

## Where each value lives — one-page cheat sheet

| Value | Correct home | Where you find it later |
|---|---|---|
| Database URL | GitHub → Settings → Secrets and variables → Actions → **Secrets** (`VITE_SUPABASE_URL`) | Supabase → Project Settings → API |
| Database anon key | GitHub → same **Secrets** (`VITE_SUPABASE_ANON_KEY`) | Supabase → Project Settings → API |
| “Use the real database” switch | none — the two **Secrets** are the switch | — |
| AI provider key | Supabase → **Edge Functions → Secrets** (`AI_API_KEY`) | OpenAI / OpenRouter dashboard |
| Database password | Your password manager only | Not needed day to day |
| Invite code | Inside the app: Settings (visible to both partners) | — |
| `service_role` / secret key | **Nowhere.** Never in GitHub, never in chat | — |

---

## Appendix A — From zero, with no old project

Only if Phase 1 found nothing. Everything else in this guide is unchanged.

1. **Create the project** at https://supabase.com/dashboard/projects → **New project**.
   Region: the one closest to you (e.g. *Frankfurt*). Save the database password in your
   password manager; you will not need it again.
2. **SQL Editor → New query**, paste **`supabase/schema.sql`** → Run
   (`Success. No rows returned`).
3. New query, paste **`supabase/seed.sql`** → Run. This adds the 38 recipes and 10 menus.
4. New query, paste **`supabase/doctor.sql`** → Run. Twelve `ok` rows, then row counts of 0.
5. Continue at Phase 3 with the URL and anon key of this new project.

> Do **not** run `upgrade-from-legacy.sql` on an empty project. It is only for a project that
> still holds the old `plan` / `eaten` / `water` tables, and the one-paste file already
> includes it.

---

## Appendix B — What the upgrade did to each old table

| Old table | New home |
|---|---|
| `households` | `households` (same id; old invite code kept, otherwise a new 6-character one) |
| `profiles` | `profiles` (same auth user ids — same email and password) |
| `plan` (`variant_id` 1–3 per day) | the matching reusable day menu, expanded into `meal_assignments` |
| `eaten` | `eaten`, now pointing at the actual recipe |
| `water` | `water` (ml clamped to 0–5000) |
| `recipe_notes` | `recipe_notes`, matched by the English dish name |
| `meal_swaps` | **not migrated** — the old rows store no recipe ids; those slots show the menu dish |

Nothing is deleted. Every old table is renamed into the `legacy` schema and stays readable in
**Table Editor → schema `legacy`**. When you are confident, remove them with
`drop schema legacy cascade;`.

---

## This page on your phone

The same guide, formatted for a phone screen:

**https://redzidvlp.github.io/Meal/guide.html**

Keep it in a second tab while you work through the phases — the SQL link and the Supabase
and GitHub screens are much easier to follow on a big screen, so doing Phase 2 on a computer
and the rest on the phone is the comfortable way.

Everything below is already live on `main`:

- the app and its build id — https://redzidvlp.github.io/Meal/
- the one-paste upgrade — `supabase/upgrade-existing-project.sql`
- the database migration and its tests — `supabase/migrate-legacy-data.sql`, `npm run test:db`
- this guide — `GO-LIVE-GUIDE.md`
