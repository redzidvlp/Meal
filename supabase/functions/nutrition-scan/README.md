# nutrition-scan

Edge Function that turns a photo into nutrition values:

- `mode: "label"` — reads a packaged-food nutrition label.
- `mode: "meal"` — estimates the energy and macros of a plated meal.

## Deploy

```bash
supabase functions deploy nutrition-scan
supabase secrets set AI_API_KEY=sk-...            # required to switch it on
# optional:
supabase secrets set AI_BASE_URL=https://api.openai.com/v1
supabase secrets set AI_MODEL=gpt-4o-mini
supabase secrets set ALLOW_ORIGIN=https://your-app.example
```

`ALLOW_ORIGIN` is a comma-separated allowlist and defaults to
`https://redzidvlp.github.io`; add `http://localhost:5173` if you use AI from local dev.

Without `AI_API_KEY` the function answers `{ "available": false, "reason": "ai_offline" }`.
The app then shows the manual-entry fallback instead of an error.

## Safety

- Only `data:image/(png|jpeg|webp);base64` payloads under 1.8 MB are accepted.
- The image is forwarded for a single request and never stored or logged.
- The model response is parsed as JSON and clamped to sane nutrition ranges.
- Provider errors are returned as generic codes, so keys and upstream bodies never
  reach the browser.
- JWTs are verified by the platform by default — deploy without `--no-verify-jwt`.
