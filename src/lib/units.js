/**
 * Spoon measures.
 *
 * A recipe may say "1 tbsp olive oil"; the shopping list and the pantry count
 * stock in grams and millilitres, because that is what a package says. Spoons
 * are therefore a *recipe-writing* unit: they are shown exactly as written in
 * the recipe, and converted to millilitres when a quantity has to be summed,
 * bought or subtracted from the pantry.
 *
 *   1 tsp = 5 ml      1 tbsp = 15 ml
 *
 * The conversion lives here and in toggle_eaten() in schema.sql; those two must
 * agree or the optimistic screen and the database would disagree by a few grams.
 */

export const SPOON_ML = { tsp: 5, tbsp: 15 };

/** Units a recipe ingredient may use. */
export const RECIPE_UNITS = ["g", "ml", "vnt", "tsp", "tbsp"];

/** Units stock is counted in (pantry, shopping list, products). */
export const STOCK_UNITS = ["g", "ml", "vnt"];

export const isSpoon = unit => unit === "tsp" || unit === "tbsp";

/** The unit a quantity is stored as. A spoon becomes millilitres. */
export function stockUnit(unit) {
  return isSpoon(unit) ? "ml" : unit;
}

/**
 * An ingredient as the stock side of the app sees it: same ingredient, same
 * quantity, but in a unit that can be summed with other recipes and with a
 * pantry row. A spoon of oil is 15 ml of oil, not a new kind of stock.
 */
export function toStock(ingredient) {
  if (!ingredient) return ingredient;
  const unit = stockUnit(ingredient.unit);
  if (unit === ingredient.unit) return ingredient;
  const amount = Number(ingredient.amount) || 0;
  return { ...ingredient, unit, amount: Math.round(amount * SPOON_ML[ingredient.unit] * 10) / 10 };
}

/** "tbsp" → "15 ml" — the shelf label for a pantry row or a shopping line. */
export const spoonHint = (unit, lang = "en") => {
  if (unit === "tsp") return lang === "lt" ? "šaukštelis (5 ml)" : "tsp (5 ml)";
  if (unit === "tbsp") return lang === "lt" ? "šaukštas (15 ml)" : "tbsp (15 ml)";
  return unit;
};
