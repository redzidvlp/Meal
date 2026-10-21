import { generateRecipeDraft } from "../engine/generate.js";
import { sanitizeRecipe } from "./validate.js";

/**
 * Walks forward through deterministic seeds until one draft avoids every name
 * already on screen. This is what makes "Reroll" feel fresh rather than random.
 */
export function offlineIdea({ slot, target, filters = {}, seed = 1, excludeNames = [] }) {
  for (let step = 0; step < 18; step += 1) {
    const draft = generateRecipeDraft({
      slot,
      target,
      filters,
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
    seed,
  };
}

/**
 * Asks the configured AI function first, then falls back to the offline engine.
 * Both paths return the same draft shape, so the editor does not care which ran.
 */
export async function requestRecipeIdea({
  api,
  slot,
  target,
  filters = {},
  seed = 1,
  excludeNames = [],
  notes = "",
  pantry = [],
}) {
  if (api?.generateRecipe) {
    try {
      const result = await api.generateRecipe({
        slot,
        target,
        filters: {
          quick: !!filters.quick,
          lowFodmap: !!filters.lowFodmap,
          highProtein: !!filters.highProtein,
        },
        avoid: excludeNames.slice(0, 20),
        notes: String(notes || "").replace(/[<>{}]/g, "").trim().slice(0, 120),
        pantry: pantry.map(item => (typeof item === "string" ? item : item?.nameEn || item?.key)).filter(Boolean).slice(0, 20),
      });
      if (result?.available && result.recipe) {
        const draft = fromAi(result.recipe, seed);
        if (draft) return draft;
      }
    } catch {
      // A missing function, quota error or offline network all fall through to
      // the local engine — generating an idea must never dead-end.
    }
  }

  const draft = offlineIdea({ slot, target, filters, seed, excludeNames });
  return draft ? { ...draft, ai: false } : null;
}
