// Supabase Edge Function: recipe-ai
// Writes one brand-new vegetarian recipe draft around the household's targets.
// The app always opens the draft for review before it is saved.
//
// Deploy:  supabase functions deploy recipe-ai
// Secrets: supabase secrets set AI_API_KEY=...   (optional AI_BASE_URL, AI_MODEL, ALLOW_ORIGIN)

const UNITS = ["g", "ml", "vnt"];
const SLOTS = ["breakfast", "lunch", "snack", "dinner"];

// Hard guard: a generated recipe can never contain meat or fish.
const FORBIDDEN = [
  "chicken", "beef", "pork", "lamb", "turkey", "duck", "bacon", "ham", "prosciutto",
  "sausage", "salmon", "tuna", "cod", "fish", "shrimp", "prawn", "anchovy", "squid",
  "mussel", "oyster", "gelatin", "lard", "veal", "venison", "meat", "mince", "steak",
];

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

const clean = (value, max) =>
  String(value ?? "").replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

const prompt = input => [
  "You are a vegetarian recipe developer for a two-person kitchen in Lithuania.",
  "Reply with JSON only, no prose, no markdown.",
  "The recipe must be strictly vegetarian (no meat, no fish, no seafood, no gelatin).",
  "Prefer low-FODMAP ingredients when the filter says so; keep it gluten-free unless told otherwise.",
  "Use metric amounts in g, ml or vnt. Exact Lithuanian translations are welcome.",
  'Schema: {"name_en":string,"name_lt":string,"emoji":string,"slot":string,"course":"sweet"|"savoury","kcal":number,"protein":number,"carbs":number,"fat":number,"prep_minutes":number,"ingredients":[{"en":string,"lt":string,"amount":number,"unit":"g"|"ml"|"vnt"}],"method_en":string,"method_lt":string,"tags":string[]}',
  `Slot: ${input.slot}. Target per person: ${input.target.kcal} kcal, ${input.target.protein} g protein, ${input.target.carbs} g carbs, ${input.target.fat} g fat.`,
  `Filters: ${input.filters.lowFodmap ? "low-FODMAP" : "no FODMAP restriction"}, ${input.maxMinutes ? `ready in ${input.maxMinutes} minutes or less` : input.filters.quick ? "ready in 15 minutes or less" : "any prep time"}, ${input.filters.highProtein ? "high protein" : "normal protein"}.`,
  (input.must || []).length
    ? `HARD REQUIREMENT: the recipe MUST contain ${input.must.join(" and ")} as a real ingredient with a metric amount. These are at least as important as the calorie target.`
    : "",
  (input.banned || []).length ? `Never use: ${input.banned.join(", ")}.` : "",
  input.wish ? `What the cook asked for, in their words: ${input.wish}` : "",
  input.course === "sweet"
    ? "This must be a SWEET dish (dessert style: pudding, mousse, pancakes, baked curd). It is not a savoury meal."
    : input.course === "savoury"
      ? "This must be a savoury dish, not a dessert."
      : "",
  input.modifiers && input.modifiers.lactoseFree ? "Every dairy ingredient must be the lactose-free version (e.g. lactose-free curd or yogurt)." : "",
  input.modifiers && input.modifiers.dairyFree ? "Use no dairy at all." : "",
  input.notes ? `The cook asked for: ${input.notes}` : "",
  input.variety ? `This is idea number ${input.variety}: pick a different cuisine and a different main ingredient from the obvious one.` : "",
  input.pantry.length ? `Already in the pantry: ${input.pantry.join(", ")}. Try to use some of it.` : "",
  input.avoid.length ? `Do not repeat these dishes: ${input.avoid.join("; ")}.` : "",
  "Keep the method to 3–5 short sentences. Use 4–8 ingredients. Tags may only be: vegan, dairy-free, low-fodmap, gluten-free, high-protein, quick, meal-prep.",
].filter(Boolean).join(" ");

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
    return json({ available: false, reason: "ai_offline" }, 200, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const slot = SLOTS.includes(payload?.slot) ? payload.slot : "lunch";
  const target = {
    kcal: clampNumber(payload?.target?.kcal, 180, 1400),
    protein: clampNumber(payload?.target?.protein, 0, 100),
    carbs: clampNumber(payload?.target?.carbs, 0, 200),
    fat: clampNumber(payload?.target?.fat, 0, 150),
  };
  const filters = {
    lowFodmap: payload?.filters?.lowFodmap === true,
    quick: payload?.filters?.quick === true,
    highProtein: payload?.filters?.highProtein === true,
  };
  const maxMinutes = clampNumber(payload?.filters?.maxMinutes, 0, 240);
  const pantry = (Array.isArray(payload?.pantry) ? payload.pantry : [])
    .map(item => clean(item, 40)).filter(Boolean).slice(0, 20);
  const avoid = (Array.isArray(payload?.avoid) ? payload.avoid : [])
    .map(item => clean(item, 90)).filter(Boolean).slice(0, 20);
  // Free-text wish ("chickpeas, no onion, 20 min"). Treated as a hint only:
  // the vegetarian check below still runs on whatever comes back.
  const notes = clean(payload?.notes, 120);
  // What the person asked for, as plain English ingredient names. Checked below.
  const must = (Array.isArray(payload?.mustInclude) ? payload.mustInclude : [])
    .map(item => clean(item, 40)).filter(Boolean).slice(0, 5);
  const banned = (Array.isArray(payload?.avoidIngredients) ? payload.avoidIngredients : [])
    .map(item => clean(item, 40)).filter(Boolean).slice(0, 5);
  const variety = Number.isFinite(Number(payload?.seed)) ? Number(payload.seed) : 0;
  const wish = clean(payload?.wish, 400);
  const course = payload?.course === "sweet" ? "sweet" : payload?.course === "savoury" ? "savoury" : "";
  const modifiers = {
    lactoseFree: payload?.modifiers?.lactoseFree === true,
    dairyFree: payload?.modifiers?.dairyFree === true,
  };

  const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

  async function ask(messages) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: messages.length > 1 ? 0.5 : 0.9,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!response.ok) return { error: "upstream_failed" };
    try {
      const data = await response.json();
      return { parsed: JSON.parse(data?.choices?.[0]?.message?.content || "{}") };
    } catch {
      return { error: "unreadable_result" };
    }
  }

  const basePrompt = prompt({ slot, target, filters, pantry, avoid, notes, must, banned, variety, wish, course, modifiers, maxMinutes });
  let attempt = await ask([{ role: "user", content: basePrompt }]);
  if (attempt.error) {
    return json({ available: true, error: attempt.error === "upstream_failed" ? "upstream_failed" : "unreadable_result" }, 502, origin);
  }

  // Did it actually include what was asked for? If not, say so plainly and ask
  // once more; a second failure is caught by the app, which falls back to the
  // offline engine that can guarantee the ingredient.
  const lower = value => String(value ?? "").toLowerCase();
  const recipeText = parsed => [
    parsed?.name_en, parsed?.name_lt,
    ...(Array.isArray(parsed?.ingredients) ? parsed.ingredients.flatMap(item => [item?.en, item?.lt]) : []),
  ].map(lower).join(" | ");
  const missingFrom = parsed => must.filter(item => !recipeText(parsed).includes(lower(item)));

  if (must.length && missingFrom(attempt.parsed).length) {
    attempt = await ask([
      { role: "user", content: basePrompt },
      { role: "assistant", content: JSON.stringify(attempt.parsed ?? {}).slice(0, 3000) },
      {
        role: "user",
        content: `That recipe did not contain ${missingFrom(attempt.parsed).join(" or ")}. Return the whole JSON again, and this time ${missingFrom(attempt.parsed).join(" and ")} must be one of the ingredients with a metric amount.`,
      },
    ]);
    if (attempt.error) {
      return json({ available: true, error: "unreadable_result" }, 502, origin);
    }
  }

  let parsed = attempt.parsed;

  const nameEn = clean(parsed.name_en, 90);
  const nameLt = clean(parsed.name_lt, 90) || nameEn;
  if (nameEn.length < 2) {
    return json({ available: true, error: "unreadable_result" }, 502, origin);
  }

  const ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
    .slice(0, 20)
    .map(item => ({
      en: clean(item?.en, 60),
      lt: clean(item?.lt, 60),
      amount: clampNumber(item?.amount, 0, 2000),
      unit: UNITS.includes(item?.unit) ? item.unit : "g",
    }))
    .filter(item => item.en && item.amount > 0);

  const haystack = [nameEn, nameLt, parsed.method_en, parsed.method_lt, ...ingredients.flatMap(item => [item.en, item.lt])]
    .join(" ").toLowerCase();
  if (FORBIDDEN.some(word => new RegExp(`\\b${word}\\b`).test(haystack))) {
    return json({ available: true, error: "not_vegetarian" }, 200, origin);
  }

  const macros = {
    protein: clampNumber(parsed.protein, 0, 200),
    carbs: clampNumber(parsed.carbs, 0, 400),
    fat: clampNumber(parsed.fat, 0, 200),
  };
  const computedKcal = Math.round(macros.protein * 4 + macros.carbs * 4 + macros.fat * 9);
  const statedKcal = clampNumber(parsed.kcal, 0, 3000);
  const kcal = computedKcal > 0 && Math.abs(computedKcal - statedKcal) > statedKcal * 0.25
    ? computedKcal
    : statedKcal;

  // The model sometimes writes "Dessert" or "sweet dish"; only the canonical
  // word is used, and when it says nothing the course that was asked for wins.
  const courseWord = String(parsed.course ?? "").toLowerCase();
  const modelCourse = /sweet|dessert|pudding|cake|pastry/.test(courseWord)
    ? "sweet"
    : /savoury|savory|main|meal/.test(courseWord)
      ? "savoury"
      : "";
  const answerCourse = modelCourse || course || "savoury";

  const allowedTags = ["vegan", "dairy-free", "low-fodmap", "gluten-free", "high-protein", "quick", "meal-prep"];
  const tags = [...new Set((Array.isArray(parsed.tags) ? parsed.tags : []).filter(tag => allowedTags.includes(tag)))];

  return json({
    available: true,
    recipe: {
      course: answerCourse,
      name: { en: nameEn, lt: nameLt },
      emoji: clean(parsed.emoji, 6) || "🍽️",
      slot,
      kcal: Math.max(0, kcal),
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      prepMinutes: Math.round(clampNumber(parsed.prep_minutes, 0, 600)),
      ingredients,
      method: { en: clean(parsed.method_en, 900), lt: clean(parsed.method_lt, 900) },
      tags,
    },
  }, 200, origin);
});
