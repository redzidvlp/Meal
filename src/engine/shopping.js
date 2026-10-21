import { SLOTS } from "../theme.js";
import { ingredientLabel } from "../lib/ingredients.js";
import { fmtNum } from "../lib/format.js";

export function shoppingItemKey(ingredient) {
  return `${ingredient.key}|${ingredient.unit}`;
}

/**
 * How many portions of each dish to buy for one slot.
 *
 * A shared dish is cooked once for both of you, so it starts at 2. A split slot
 * is two different dishes eaten by one person each, so each dish starts at 1 —
 * setting "3 portions" must not double both of them.
 *
 * Extra portions are whole: they are handed out one at a time, never split into
 * halves. On a split day they rotate between the two dishes (starting with a
 * different person on odd days) so a week of leftovers stays fair.
 */
export function slotPortions({ mode, eaters, extraPortions = 0, day = 0 }) {
  if (mode === "both") return [2 + extraPortions];
  if (!eaters) return [];
  if (!extraPortions) return new Array(eaters).fill(1);
  const start = day % eaters;
  return Array.from({ length: eaters }, (_, index) => {
    const offset = (index - start + eaters) % eaters;
    return 1 + Math.floor(extraPortions / eaters) + (offset < extraPortions % eaters ? 1 : 0);
  });
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
      const persons = entry.mode === "both"
        ? ["both"]
        : ["R", "I"].filter(person => !!entry.recipes[person]);
      if (!persons.length) continue;
      const portions = slotPortions({
        mode: entry.mode,
        eaters: persons.length,
        extraPortions,
        day,
      });

      persons.forEach((person, index) => {
        const recipe = person === "both" ? entry.recipes.R : entry.recipes[person];
        if (!recipe) return;
        const factor = portions[index] ?? 0;

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
      });
    }
  });

  return [...map.values()]
    .map(row => ({ ...row, total: Math.round(row.total * 10) / 10, display: `${fmtNum(row.total)} ${row.unit}` }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

