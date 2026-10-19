import { findForbiddenIngredients } from "../lib/ingredients.js";
import { SLOTS } from "../theme.js";
import { shoppingItemKey } from "./shopping.js";
import { isLow } from "./pantry.js";
import { allPlannedRecipes } from "./plan.js";

const clamp01 = value => Math.max(0, Math.min(1, value));

export function targetFromRecipe(recipe) {
  if (!recipe) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    kcal: Number(recipe.kcal) || 0,
    protein: Number(recipe.protein) || 0,
    carbs: Number(recipe.carbs) || 0,
    fat: Number(recipe.fat) || 0,
  };
}

// Defense in depth: even if a bad row slipped past validation, the sous-chef
// never suggests it.
export function isVegetarianSafe(recipe) {
  if (!recipe || recipe.vegetarian === false) return false;
  const tags = recipe.tags || [];
  if (!tags.includes("vegetarian")) return false;
  const text = (recipe.ingredients || []).map(i => `${i.en || ""} ${i.lt || ""}`).join(" | ");
  return findForbiddenIngredients(text).length === 0;
}

export function nutritionSimilarity(recipe, target) {
  const weights = { kcal: 0.45, protein: 0.25, carbs: 0.15, fat: 0.15 };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const goal = Math.max(Number(target?.[key]) || 0, 1);
    const actual = Number(recipe[key]) || 0;
    total += clamp01(1 - Math.abs(actual - goal) / (goal * 1.3 + 1)) * weight;
  }
  const kcalPct = Math.abs((Number(recipe.kcal) || 0) - (Number(target?.kcal) || 0)) / Math.max(Number(target?.kcal) || 0, 1);
  return { score: total, kcalPct };
}

function ingredientKeys(recipe) {
  return new Set((recipe.ingredients || []).map(ing => ing.key));
}

export function suggestRecipes({
  recipes = [],
  plan = {},
  reference = null,
  target = null,
  slot = null,
  pantry = [],
  recentIds = [],
  filters = {},
  excludeId = null,
  limit = 6,
} = {}) {
  const goal = target || targetFromRecipe(reference);
  if (!goal.kcal) return [];

  const pantryKeys = new Map();
  for (const item of pantry) {
    if (Number(item.quantity) > 0) pantryKeys.set(shoppingItemKey(item), item.quantity);
  }

  const referenceKeys = reference ? ingredientKeys(reference) : new Set();
  const plannedThisWeek = new Set(allPlannedRecipes(plan).map(item => item.recipe.id));

  const safe = recipes.filter(isVegetarianSafe);
  let pool = safe.filter(recipe => recipe.id !== excludeId && recipe.id !== reference?.id);

  if (filters.excludeRecent) pool = pool.filter(recipe => !recentIds.includes(recipe.id));
  if (filters.highProtein) pool = pool.filter(recipe => Number(recipe.protein) >= 25);
  if (filters.quick) pool = pool.filter(recipe => Number(recipe.prepMinutes) <= 25);
  if (filters.lowFodmap) pool = pool.filter(recipe => (recipe.tags || []).includes("low-fodmap"));

  // Prefer the same meal type, but never let that empty the result list.
  const sameSlot = slot ? pool.filter(recipe => recipe.slot === slot) : [];
  if (slot && sameSlot.length >= 3) pool = sameSlot;

  const scored = [];
  for (const recipe of pool) {
    const similarity = nutritionSimilarity(recipe, goal);
    if (Number(recipe.kcal) < goal.kcal * 0.55 || Number(recipe.kcal) > goal.kcal * 1.8) continue;

    const reasons = [];
    let score = similarity.score * 55;
    if (similarity.kcalPct <= 0.15) reasons.push({ key: "reasonKcal", values: { pct: Math.max(1, Math.round(similarity.kcalPct * 100)) } });

    const proteinPct = Math.abs(Number(recipe.protein) - goal.protein) / Math.max(goal.protein, 1);
    if (proteinPct <= 0.2) reasons.push({ key: "reasonProtein" });

    if (slot && recipe.slot === slot) {
      score += 10;
      reasons.push({ key: "reasonSlot" });
    }

    const pantryHits = (recipe.ingredients || []).filter(ing => pantryKeys.has(shoppingItemKey(ing))).length;
    if (pantryHits > 0) score += Math.min(15, pantryHits * 3);
    if (pantryHits >= 2) reasons.push({ key: "reasonPantry", values: { n: pantryHits } });

    if (referenceKeys.size) {
      const shared = [...ingredientKeys(recipe)].filter(key => referenceKeys.has(key)).length;
      if (shared > 0) score += Math.min(8, shared * 2);
      if (shared >= 2) reasons.push({ key: "reasonShared", values: { n: shared } });
    }

    const selectedTags = [];
    if (filters.highProtein) selectedTags.push("high-protein");
    if (filters.lowFodmap) selectedTags.push("low-fodmap");
    const matchedTag = selectedTags.find(tag => (recipe.tags || []).includes(tag));
    if (matchedTag) {
      score += 4;
      reasons.push({ key: "reasonTag", values: { tag: matchedTag } });
    }

    if (plannedThisWeek.has(recipe.id)) score -= 6;
    if (filters.pantryFirst) score += Math.min(12, pantryHits * 4);

    scored.push({
      recipe,
      score: Math.max(1, Math.min(99, Math.round(score))),
      reasons: reasons.slice(0, 4),
      nutritionPct: Math.round(similarity.score * 100),
      pantryHits,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Recipe ids already planned, used by the "skip repeats" rule. */
export function plannedIds(plan) {
  return [...new Set(allPlannedRecipes(plan).map(item => item.recipe.id))];
}

/** Low pantry items that appear in the upcoming plan, with meal context. */
export function pantryWatchlist(pantry, plan, days = [0, 1, 2, 3, 4, 5, 6]) {
  const low = pantry.filter(isLow);
  return low.map(item => {
    const uses = [];
    for (const day of days) {
      const dayPlan = plan?.[day];
      if (!dayPlan) continue;
      for (const slot of SLOTS) {
        const entry = dayPlan[slot];
        if (!entry || entry.mode === "empty") continue;
        const list = entry.mode === "both" ? [entry.recipes.R] : [entry.recipes.R, entry.recipes.I];
        for (const recipe of list) {
          if (!recipe) continue;
          if ((recipe.ingredients || []).some(ing => shoppingItemKey(ing) === shoppingItemKey(item))) {
            uses.push({ day, slot, recipe });
          }
        }
      }
    }
    return { ...item, uses };
  });
}
