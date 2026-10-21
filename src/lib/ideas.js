import { generateRecipeDraft } from "../engine/generate.js";
import { sanitizeRecipe } from "./validate.js";
import { INGREDIENT_FACTS } from "../data/ingredientFacts.js";
import { parseWish, wishSatisfied, containsExcluded, wishIngredientNames, wishSummary } from "./wishes.js";

/**
 * Walks forward through deterministic seeds until one draft avoids every name
 * already on screen. This is what makes "Reroll" feel fresh rather than random.
 */
export function offlineIdea({ slot, target, filters = {}, seed = 1, excludeNames = [], wish = null, avoidKeys = [] }) {
  const merged = { ...filters, quick: filters.quick || !!wish?.quick };
  for (let step = 0; step < 24; step += 1) {
    const draft = generateRecipeDraft({
      slot,
      target,
      filters: merged,
      seed: seed + step,
      excludeNames,
      wish,
      avoidKeys,
    });
    if (draft) return draft;
  }
  // The wish may be impossible for this slot (nobody wants curd in a smoothie).
  // Better a recipe without the wish than no recipe at all.
  for (let step = 0; step < 24; step += 1) {
    const draft = generateRecipeDraft({
      slot,
      target,
      filters: merged,
      seed: seed + step,
      excludeNames,
    });
    if (draft) return draft;
  }
  return null;
}

function fromAi(recipe, seed) {
  const check = sanitizeRecipe({
    ...recipe,
    tags: (Array.isArray(recipe?.tags) ? recipe.tags : []).filter(tag => tag !== "vegetarian"),
  });
  if (!check.ok) return null;
  return {
    ...check.recipe,
    id: null,
    isDraft: true,
    generated: true,
    ai: true,
    course: recipe?.course === "sweet" ? "sweet" : "savoury",
    seed,
  };
}

const excludedNames = wish =>
  (wish?.excludes || []).map(key => INGREDIENT_FACTS[key]?.en || key.replace(/-/g, " "));

/**
 * Asks the configured AI function first, then falls back to the offline engine.
 * Both paths return the same draft shape, so the editor does not care which ran.
 *
 * Whatever the model writes, the result is checked against the person's own
 * words: if they asked for curd and got avocado, that draft is thrown away
 * rather than shown as if it had listened.
 */
export async function requestRecipeIdea({
  api,
  slot,
  target,
  filters = {},
  seed = 1,
  excludeNames = [],
  notes = "",
  wish = null,
  avoidKeys = [],
  pantry = [],
}) {
  const parsed = wish || parseWish(notes);
  const merged = { ...filters, quick: filters.quick || !!parsed.quick };
  const mustInclude = wishIngredientNames(parsed);
  const mustAvoid = excludedNames(parsed);
  const hasWish = (parsed.includes?.length || parsed.excludes?.length || parsed.quick) > 0;

  if (api?.generateRecipe) {
    try {
      const result = await api.generateRecipe({
        slot,
        target,
        filters: {
          quick: !!merged.quick,
          lowFodmap: !!merged.lowFodmap,
          highProtein: !!merged.highProtein,
        },
        avoid: excludeNames.slice(0, 20),
        notes: String(notes || "").replace(/[<>{}]/g, "").trim().slice(0, 160),
        // The model gets the wish as a sentence, not only a list of keys:
        // "lactose free curd sweet" reads as a dessert built on curd.
        wish: wishSummary(parsed).slice(0, 400),
        course: parsed.course,
        modifiers: parsed.modifiers,
        mustInclude,
        avoidIngredients: mustAvoid,
        seed: Number(seed) || 1,
        pantry: pantry.map(item => (typeof item === "string" ? item : item?.nameEn || item?.key)).filter(Boolean).slice(0, 20),
      });
      if (result?.available && result.recipe) {
        const draft = fromAi(result.recipe, seed);
        const keepsWish = draft && wishSatisfied(draft, parsed);
        const cleanOfBans = draft && containsExcluded(draft, parsed).length === 0;
        // A sweet wish answered with a savoury dish is a miss, however good it
        // sounds: the offline engine can build the dessert instead.
        const wrongCourse = draft && parsed.course && draft.course && draft.course !== parsed.course;
        if (draft && keepsWish && cleanOfBans && !wrongCourse) return draft;
        // The model ignored the request (or slipped in a banned ingredient):
        // fall through to the engine, which is built to honour it.
      }
    } catch {
      // A missing function, quota error or offline network all fall through to
      // the local engine — generating an idea must never dead-end.
    }
  }

  const draft = offlineIdea({ slot, target, filters: merged, seed, excludeNames, wish: hasWish ? parsed : null, avoidKeys });
  return draft ? { ...draft, ai: false } : null;
}
