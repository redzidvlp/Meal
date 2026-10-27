// Supabase Edge Function: nutrition-scan
// Reads a nutrition label or estimates a plated meal from a photo.
//
// Deploy:  supabase functions deploy nutrition-scan
// Secrets: supabase secrets set AI_API_KEY=... AI_BASE_URL=... AI_MODEL=...
//
// Privacy: the image is forwarded to the model provider for this one request and is
// never written to storage or logs by this function.

const MAX_BYTES = 1_800_000;
const ALLOWED = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const cors = origin => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

const clampNumber = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
};

const prompt = mode => {
  const base = [
    "You are a nutrition assistant for a vegetarian two-person kitchen.",
    "Reply with JSON only, no prose, no markdown.",
    'Schema: {"name": string, "kcal": number, "protein": number, "carbs": number, "fat": number, "portionGrams": number}',
    "Values are for the portion shown (one plate) or for the label's stated serving.",
    "Never invent meat or fish: if the photo shows meat or fish, return kcal 0 and name \"unsupported\".",
  ];
  if (mode === "label") {
    base.push(
      "The image is a packaged-food nutrition label.",
      "Read the values per 100 g if available, otherwise per serving, and say which in name.",
      "Also return per100 = the same macros converted to per 100 g (use portionGrams when the label states a serving), and basis = \"per100\" or \"serving\" for how the label itself is printed.",
      "portionGrams = the serving or pack size in grams if the label states one, otherwise 0.",
      "Round to one decimal. If a value is unreadable use 0.",
    );
  } else {
    base.push(
      "The image is a plated meal.",
      "Estimate the visible portion's energy and macros conservatively.",
      "Use a short dish name in English.",
    );
  }
  return base.join(" ");
};

Deno.serve(async request => {
  // Only echo origins we trust; the browser blocks the reply otherwise.
  // Override with a comma-separated list (e.g. add http://localhost:5173).
  const allowedOrigins = (Deno.env.get("ALLOW_ORIGIN") || "https://redzidvlp.github.io")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) {
    // The app shows a friendly "not connected yet" state instead of failing.
    return json({ available: false, reason: "ai_offline" }, 200, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const image = typeof payload?.image === "string" ? payload.image : "";
  const mode = payload?.mode === "label" ? "label" : "meal";
  if (!ALLOWED.test(image) || image.length > MAX_BYTES) {
    return json({ error: "invalid_image" }, 400, origin);
  }

  const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

  const requestBody = {
    model,
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt(mode) },
      {
        role: "user",
        content: [
          { type: "text", text: mode === "label" ? "Read this label." : "Estimate this meal." },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
  };

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return json({ available: true, error: "upstream_unreachable" }, 502, origin);
  }

  if (!response.ok) {
    // Never leak provider details or keys to the client.
    return json({ available: true, error: "upstream_failed" }, 502, origin);
  }

  let parsed;
  try {
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    parsed = JSON.parse(content);
  } catch {
    return json({ available: true, error: "unreadable_result" }, 502, origin);
  }

  const nutrition = {
    kcal: clampNumber(parsed.kcal, 0, 5000),
    protein: clampNumber(parsed.protein, 0, 500),
    carbs: clampNumber(parsed.carbs, 0, 800),
    fat: clampNumber(parsed.fat, 0, 500),
  };
  const name = String(parsed.name || "").replace(/[^\p{L}\p{N} .,&'-]/gu, "").slice(0, 80);
  const portionGrams = clampNumber(parsed.portionGrams, 0, 3000);

  if (nutrition.kcal <= 0 || name.toLowerCase() === "unsupported") {
    return json({ available: true, error: "not_food" }, 200, origin);
  }

  // A product saved from a label has to be per 100 g; a recipe is per portion.
  // The caller picks, so both are returned and an older function simply omits
  // per100 (the app then says to check the numbers).
  const rawPer100 = parsed?.per100 && typeof parsed.per100 === "object" ? parsed.per100 : null;
  const per100 = rawPer100 ? {
    kcal: clampNumber(rawPer100.kcal, 0, 900),
    protein: clampNumber(rawPer100.protein, 0, 100),
    carbs: clampNumber(rawPer100.carbs, 0, 100),
    fat: clampNumber(rawPer100.fat, 0, 100),
  } : null;

  return json({
    available: true,
    mode,
    name,
    nutrition,
    portionGrams,
    per100: per100 && per100.kcal > 0 ? per100 : null,
    basis: parsed?.basis === "serving" ? "serving" : parsed?.basis === "per100" ? "per100" : null,
  }, 200, origin);
});
