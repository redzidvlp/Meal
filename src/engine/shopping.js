import { SLOTS } from "../theme.js";
import { ingredientLabel } from "../lib/ingredients.js";
import { fmtNum } from "../lib/format.js";

export function shoppingItemKey(ingredient) {
  return `${ingredient.key}|${ingredient.unit}`;
}

/**
 * Builds the shopping list straight from the live plan. Any meal change,
 * split, or portion change is reflected on the next render — nothing is
 * cached, which is why the old "list never updates" bug cannot happen.
 */
export function buildShoppingList({
  plan,
  days = [0, 1, 2, 3, 4, 5, 6],
  extraPortions = 0,
  lang = "en",
  pantry = [],
}) {
  const map = new Map();
  const pantryByKey = new Map(pantry.map(item => [shoppingItemKey(item), item.quantity]));

  days.forEach(day => {
    const dayPlan = plan?.[day];
    if (!dayPlan) return;
    for (const slot of SLOTS) {
      const entry = dayPlan[slot];
      if (!entry || entry.mode === "empty") continue;
      const persons = entry.mode === "both" ? ["both"] : ["R", "I"];
      const eaters = entry.mode === "both"
        ? 2
        : ["R", "I"].filter(person => !!entry.recipes[person]).length;

      for (const person of persons) {
        const recipe = person === "both" ? entry.recipes.R : entry.recipes[person];
        if (!recipe) continue;
        const factor = person === "both" ? 2 + extraPortions : 1 + extraPortions / Math.max(eaters, 1);

        for (const ing of recipe.ingredients || []) {
          const key = shoppingItemKey(ing);
          if (!map.has(key)) {
            map.set(key, {
              key,
              ingredientKey: ing.key,
              name: ingredientLabel(ing, lang),
              nameEn: ing.en,
              nameLt: ing.lt,
              unit: ing.unit,
              total: 0,
              inPantry: pantryByKey.get(key) ?? null,
              sources: [],
            });
          }
          const row = map.get(key);
          const amount = Math.round(ing.amount * factor * 10) / 10;
          row.total += amount;
          row.sources.push({
            recipeId: recipe.id,
            emoji: recipe.emoji,
            name: recipe.name?.[lang] || recipe.name?.en,
            day,
            slot,
            person,
            amount,
          });
        }
      }
    }
  });

  return [...map.values()]
    .map(row => ({ ...row, total: Math.round(row.total * 10) / 10, display: `${fmtNum(row.total)} ${row.unit}` }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

