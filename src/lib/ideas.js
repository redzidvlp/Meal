import { generateRecipeDraft } from "../engine/generate.js";
import { sanitizeRecipe } from "./validate.js";
import { factFor } from "../data/ingredientFacts.js";
import { parseWish, wishSatisfied, containsExcluded, wishSummary } from "./wishes.js";

/**
 * Walks forward through deterministic seeds until one draft avoids every name
 * already on screen. This is what makes "Reroll" feel fresh rather than random.
 */
export function offlineIdea({ slot, target, filters = {}, seed = 1, excludeNames = [], wish = null, avoidKeys = [], mustInclude = [] }) {
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
      mustInclude,
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

const foldText = value => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

/** Loose match: every meaningful word of the name must appear in the list. */
function draftContains(draft, name) {
  const haystack = (draft?.ingredients || [])
    .flatMap(item => [item?.key, item?.en, item?.lt])
    .map(foldText)
    .join(" | ");
  const words = foldText(name).split(/[^a-z0-9]+/).filter(word => word.length > 2);
  if (!words.length) return haystack.includes(foldText(name));
  return words.every(word => haystack.includes(word));
}

const keepsNamed = (draft, names) => names.every(name => draftContains(draft, name));

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
    // Unknown course stays unknown: an older deployed function does not send
    // it, and guessing "savoury" silently rejected every dessert it wrote.
    course: recipe?.course === "sweet" ? "sweet" : recipe?.course === "savoury" ? "savoury" : null,
    seed,
  };
}

const excludedNames = wish =>
  (wish?.excludes || []).map(key => factFor(key)?.en || key.replace(/-/g, " "));

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
  maxMinutes = 0,
  pantry = [],
  mustInclude = [],
  mustNames = [],
}) {
  const parsed = wish || parseWish(notes);
  // Ingredients named explicitly (picker or "must include" box). They are the
  // one thing the recipe may not quietly leave out.
  const pins = [...new Set([...(parsed.includes || []), ...(Array.isArray(mustInclude) ? mustInclude : [])])]
    .filter(key => factFor(key));
  const customNames = (Array.isArray(mustNames) ? mustNames : [])
    .map(name => String(name || "").trim())
    .filter(name => name.length > 1)
    .slice(0, 4);
  const pinnedWish = { ...parsed, includes: pins };
  const requested = [...pins.map(key => factFor(key).en), ...customNames];
  const minutes = Number(maxMinutes) || 0;
  const merged = { ...filters, quick: filters.quick || !!parsed.quick || (minutes > 0 && minutes <= 15), maxMinutes: minutes };
  const mustForAi = [...new Set([...pins.map(key => factFor(key).en), ...customNames])].slice(0, 5);
  const mustAvoid = excludedNames(parsed);
  const hasWish = Boolean(
    pins.length
    || customNames.length
    || parsed.includes?.length
    || parsed.excludes?.length
    || parsed.quick
    || parsed.course
    || parsed.modifiers?.lactoseFree
    || parsed.modifiers?.dairyFree,
  );

  let aiNote = "unavailable";
  // Why the model was not used, in one word: bad_key, quota, model, network,
  // unreadable_result, ignored… The card turns this into a sentence a person
  // can act on instead of one shrug for every possible failure.
  let aiReason = "";
  if (api?.generateRecipe) {
    try {
      const result = await api.generateRecipe({
        slot,
        target,
        filters: {
          quick: !!merged.quick,
          lowFodmap: !!merged.lowFodmap,
          highProtein: !!merged.highProtein,
          maxMinutes: minutes,
        },
        avoid: excludeNames.slice(0, 20),
        notes: String(notes || "").replace(/[<>{}]/g, "").trim().slice(0, 160),
        // The model gets the wish as a sentence, not only a list of keys:
        // "lactose free curd sweet" reads as a dessert built on curd.
        wish: wishSummary(pinnedWish).slice(0, 400),
        course: parsed.course,
        modifiers: parsed.modifiers,
        mustInclude: mustForAi,
        avoidIngredients: mustAvoid,
        seed: Number(seed) || 1,
        pantry: pantry.map(item => (typeof item === "string" ? item : item?.nameEn || item?.key)).filter(Boolean).slice(0, 20),
      });
      if (result?.available && result.recipe) {
        const draft = fromAi(result.recipe, seed);
        const keepsWish = draft && wishSatisfied(draft, pinnedWish) && keepsNamed(draft, customNames);
        const cleanOfBans = draft && containsExcluded(draft, pinnedWish).length === 0;
        // A sweet wish answered with a savoury dish is a miss, however good it
        // sounds: the offline engine can build the dessert instead.
        const wrongCourse = draft && parsed.course && draft.course !== parsed.course;
        if (draft && keepsWish && cleanOfBans && !wrongCourse) {
          return { ...draft, requested, missing: [] };
        }
        // The model ignored the request (or slipped in a banned ingredient):
        // fall through to the engine, which is built to honour it.
        aiNote = "ignored";
      } else {
        aiNote = "unavailable";
        aiReason = result?.reason || "ai_offline";
      }
    } catch (error) {
      aiNote = "failed";
      aiReason = error?.reason || "unknown";
      // A missing function, quota error or offline network all fall through to
      // the local engine — generating an idea must never dead-end.
    }
  }

  const draft = offlineIdea({
    slot,
    target,
    filters: merged,
    seed,
    excludeNames,
    wish: hasWish ? pinnedWish : null,
    avoidKeys,
    mustInclude: pins,
  });
  if (!draft) return null;
  // Be explicit about what could not be honoured. A free-text ingredient the
  // built-in table does not know can only be cooked by the model; saying so is
  // better than handing back a dish that quietly lacks it.
  const missing = requested.filter(name => !draftContains(draft, name));
  return { ...draft, ai: false, aiNote, aiReason, requested, missing };
}
