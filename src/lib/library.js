/**
 * What a kitchen is still willing to cook.
 *
 * The recipe library holds a few dozen shared dishes (household_id null) that
 * every household sees. A kitchen that is bored of one cannot delete the shared
 * row — the other household may still plan it — so "we never want this again"
 * is stored as a marker for this household only.
 *
 * Two kinds of marker exist:
 *   • a shared library recipe the household removed             (id only)
 *   • its own recipe, deleted, remembered so a re-seed of the
 *     library cannot quietly bring it back                     (id + a snapshot)
 *
 * Everything else in the app asks this module, so the picker, the sous-chef,
 * the plan and the shopping list can never disagree about what is on offer.
 */

const str = value => (typeof value === "string" ? value : "");

/** Ids the household has taken out of its pool. */
export function removedIds(removed = []) {
  const set = new Set();
  for (const row of Array.isArray(removed) ? removed : []) {
    const id = str(row?.recipeId ?? row?.recipe_id ?? row?.id);
    if (id) set.add(id);
  }
  return set;
}

/** True when this recipe must not be offered or planned again. */
export function isRemoved(recipeOrId, removed = []) {
  const id = typeof recipeOrId === "string" ? recipeOrId : str(recipeOrId?.id);
  if (!id) return false;
  return removedIds(removed).has(id);
}

/** The pool: everything the household still wants to be offered. */
export function poolRecipes(recipes = [], removed = []) {
  const gone = removedIds(removed);
  return (recipes || []).filter(recipe => recipe?.id && !gone.has(recipe.id));
}

/**
 * A day menu is a reusable suggestion. When it points at a dish the household
 * removed, that row is dropped from the slot — the same rule the database
 * applies in apply_day_menu, so the screen and the server agree.
 */
export function menuWithoutRemoved(menu, removed = []) {
  const gone = removedIds(removed);
  if (!menu || !gone.size) return menu;
  const items = {};
  for (const [slot, entry] of Object.entries(menu.items || {})) {
    if (!entry) continue;
    if (entry.both) {
      if (!gone.has(entry.both)) items[slot] = { both: entry.both };
      continue;
    }
    const row = {};
    if (entry.R && !gone.has(entry.R)) row.R = entry.R;
    if (entry.I && !gone.has(entry.I)) row.I = entry.I;
    if (Object.keys(row).length) items[slot] = row;
  }
  return { ...menu, items };
}

/** How many people a menu would fill after removals — used to warn before applying. */
export function menuRemovedCount(menu, removed = []) {
  const gone = removedIds(removed);
  if (!menu || !gone.size) return 0;
  let count = 0;
  for (const entry of Object.values(menu.items || {})) {
    if (!entry) continue;
    if (entry.both) {
      if (gone.has(entry.both)) count += 2;
      continue;
    }
    if (entry.R && gone.has(entry.R)) count += 1;
    if (entry.I && gone.has(entry.I)) count += 1;
  }
  return count;
}

/**
 * The marker row to store. `snapshot` is set only for a recipe the household
 * owns and is deleting, so the Recipes screen can still show what was removed
 * after the row itself is gone.
 */
export function removalRow(recipe, at = null) {
  const id = str(recipe?.id);
  if (!id) return null;
  const row = { recipeId: id };
  if (at) row.removedAt = at;
  if (recipe && !recipe.isPreset) {
    // Keep the whole dish, not just its label: "put back" on an own recipe has
    // to re-create the row, and the plan's shopping list needs its ingredients.
    row.snapshot = {
      name: {
        en: str(recipe.name?.en) || id,
        lt: str(recipe.name?.lt) || str(recipe.name?.en) || id,
      },
      emoji: str(recipe.emoji) || "🍽️",
      slot: str(recipe.slot) || "lunch",
      kcal: Number(recipe.kcal) || 0,
      protein: Number(recipe.protein) || 0,
      carbs: Number(recipe.carbs) || 0,
      fat: Number(recipe.fat) || 0,
      prepMinutes: Number(recipe.prepMinutes) || 0,
      tags: Array.isArray(recipe.tags) ? recipe.tags.filter(tag => typeof tag === "string") : [],
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(ing => ({
        key: str(ing?.key),
        en: str(ing?.en),
        lt: str(ing?.lt) || str(ing?.en),
        amount: Number(ing?.amount) || 0,
        unit: str(ing?.unit) || "g",
      })) : [],
      method: {
        en: str(recipe.method?.en),
        lt: str(recipe.method?.lt) || str(recipe.method?.en),
      },
      isPreset: false,
    };
  }
  return row;
}

/** A removed own recipe, shaped like a recipe so the list can show and restore it. */
export function removedRecipeView(row, fallback = {}) {
  const id = str(row?.recipeId ?? row?.recipe_id);
  if (!id) return null;
  const snap = row?.snapshot || fallback.snapshot || null;
  const name = snap?.name || fallback.name || { en: id, lt: id };
  return {
    id,
    isPreset: true, // shown as a library-style row: 📚, no delete button
    removed: true,
    removedAt: str(row?.removedAt ?? row?.removed_at) || "",
    name: { en: str(name.en) || id, lt: str(name.lt) || str(name.en) || id },
    emoji: str(snap?.emoji) || "🍽️",
    slot: str(snap?.slot) || "lunch",
    kcal: Number(snap?.kcal) || 0,
    tags: Array.isArray(snap?.tags) && snap.tags.length ? snap.tags : ["vegetarian"],
    // A full snapshot can rebuild the dish; an older, label-only one cannot —
    // the screens still draw it, but it has no ingredients to cook with.
    protein: Number(snap?.protein) || 0,
    carbs: Number(snap?.carbs) || 0,
    fat: Number(snap?.fat) || 0,
    prepMinutes: Number(snap?.prepMinutes) || 0,
    method: {
      en: str(snap?.method?.en),
      lt: str(snap?.method?.lt) || str(snap?.method?.en),
    },
    ingredients: Array.isArray(snap?.ingredients) ? snap.ingredients : [],
    restorable: Array.isArray(snap?.ingredients) && snap.ingredients.length > 0,
  };
}

/**
 * Rebuild the recipe an own-row deletion remembers, ready for `saveRecipe`.
 * Null when the marker predates full snapshots or nothing is left to rebuild:
 * the caller then just clears the marker rather than invent an empty dish.
 */
export function restorableRecipe(row) {
  const view = removedRecipeView(row);
  if (!view || !view.restorable) return null;
  return {
    id: view.id,
    name: { ...view.name },
    emoji: view.emoji,
    slot: view.slot,
    kcal: view.kcal,
    protein: view.protein,
    carbs: view.carbs,
    fat: view.fat,
    prepMinutes: view.prepMinutes,
    tags: [...view.tags],
    method: { ...view.method },
    ingredients: view.ingredients.map(ing => ({ ...ing })),
  };
}

/**
 * Dishes that no longer have a row (an own recipe was really deleted) but can
 * still be named. A library marker has no snapshot — its row is still in the
 * library — so it must not be drawn from here: the list would show the id slug
 * next to the real dish.
 */
export function removedOwnRecipes(removed = []) {
  return (Array.isArray(removed) ? removed : [])
    .filter(row => row && row.snapshot)
    .map(row => removedRecipeView(row))
    .filter(Boolean);
}
