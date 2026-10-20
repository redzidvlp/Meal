# recipe-ai

Writes one **new** vegetarian recipe draft that matches a calorie/protein target.

The app opens the result in the recipe editor, so nothing is written to the database
until the household taps **Save**.

## Deploy

```bash
supabase functions deploy recipe-ai
supabase secrets set AI_API_KEY=sk-...        # switch it on
# optional:
supabase secrets set AI_BASE_URL=https://api.openai.com/v1
supabase secrets set AI_MODEL=gpt-4o-mini
supabase secrets set ALLOW_ORIGIN=https://your-app.example
```

Without `AI_API_KEY` the function answers `{ "available": false, "reason": "ai_offline" }`
and the app falls back to the built-in offline idea engine, so the button still works.

## Safety

- Request body is validated and clamped (slot, targets, 20 pantry/avoid strings max).
- The model reply is parsed as JSON; ingredients, units and macros are clamped server-side.
- A meat/fish word list rejects the draft before it reaches the browser.
- Calories are recomputed from macros when the model's numbers disagree by >25%.
- Provider errors return generic codes; keys never reach the client.
- Deploy with the default JWT verification (no `--no-verify-jwt`).
