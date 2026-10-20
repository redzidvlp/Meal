import { shoppingItemKey } from "./shopping.js";

export function pantryKey(key, unit) {
  return `${key}|${unit}`;
}

/** Ingredient deltas for marking one meal eaten (factor = portions). */
export function consumptionForRecipe(recipe, factor = 1) {
  if (!recipe) return [];
  return (recipe.ingredients || []).map(ing => ({
    itemKey: shoppingItemKey(ing),
    delta: -(Math.round(ing.amount * factor * 10) / 10),
  }));
}

/**
 * Applies { itemKey, delta } rows to the pantry, never below zero, and reports the
 * delta that actually landed. Callers store the reported value so undo restores the
 * stock that was really used (a clamped subtraction must not add stock back).
 */
export function applyDeltasTracked(items, deltas) {
  const byKey = new Map();
  for (const d of deltas) {
    byKey.set(d.itemKey, (byKey.get(d.itemKey) || 0) + d.delta);
  }
  const applied = [];
  const next = items.map(item => {
    const key = pantryKey(item.key, item.unit);
    const delta = byKey.get(key);
    if (!delta) return item;
    const before = Number(item.quantity) || 0;
    const after = Math.max(0, Math.round((before + delta) * 10) / 10);
    if (after !== before) applied.push({ itemKey: key, delta: Math.round((after - before) * 10) / 10 });
    return { ...item, quantity: after };
  });
  return { items: next, applied };
}

/** Applies a list of { itemKey, delta } to pantry rows, never below zero. */
export function applyDeltas(items, deltas) {
  return applyDeltasTracked(items, deltas).items;
}

export function isLow(item) {
  return Number(item.quantity) <= Number(item.lowThreshold);
}

export function stockRatio(item) {
  const threshold = Math.max(Number(item.lowThreshold) || 0, 1);
  return Math.max(0, Math.min(1, Number(item.quantity) / (threshold * 3)));
}

export function lowItems(pantry) {
  return pantry.filter(isLow).sort((a, b) => {
    const ratioA = Number(a.quantity) / Math.max(Number(a.lowThreshold), 1);
    const ratioB = Number(b.quantity) / Math.max(Number(b.lowThreshold), 1);
    return ratioA - ratioB;
  });
}

/**
 * How much of this pantry item the week's plan needs, and roughly how many
 * portions the current stock can still cover.
 */
export function pantryCoverage(item, plan, days = [0, 1, 2, 3, 4, 5, 6]) {
  let uses = 0;
  let plannedAmount = 0;
  let portions = 0;
  const target = pantryKey(item.key, item.unit);

  for (const day of days) {
    const dayPlan = plan?.[day];
    if (!dayPlan) continue;
    for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
      const entry = dayPlan[slot];
      if (!entry || entry.mode === "empty") continue;
      const recipes = entry.mode === "both"
        ? [{ recipe: entry.recipes.R, people: 2 }]
        : [
            { recipe: entry.recipes.R, people: 1 },
            { recipe: entry.recipes.I, people: 1 },
          ];
      for (const { recipe, people } of recipes) {
        if (!recipe) continue;
        const match = (recipe.ingredients || []).find(ing => shoppingItemKey(ing) === target);
        if (!match) continue;
        uses += 1;
        portions += people;
        plannedAmount += match.amount * people;
      }
    }
  }

  if (!uses) return { uses: 0, portionsLeft: null, plannedAmount: 0 };
  const avgPerPortion = plannedAmount / Math.max(portions, 1);
  return {
    uses,
    portionsLeft: avgPerPortion > 0 ? Math.floor(Number(item.quantity) / avgPerPortion) : null,
    plannedAmount: Math.round(plannedAmount * 10) / 10,
  };
}
