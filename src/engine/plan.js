import { SLOTS } from "../theme.js";

// assignments: [{ day, slot, personKey: 'R'|'I'|'both', recipeId }]
// Returns { [dayIndex]: { [slot]: { mode, recipes: { R, I } } } }
export function buildPlan(assignments = [], recipesById = new Map()) {
  const plan = {};
  for (let day = 0; day < 7; day += 1) {
    plan[day] = {};
    for (const slot of SLOTS) plan[day][slot] = { mode: "empty", recipes: { R: null, I: null } };
  }

  const grouped = new Map();
  for (const row of assignments) {
    const day = Number(row.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!SLOTS.includes(row.slot)) continue;
    const key = `${day}:${row.slot}`;
    if (!grouped.has(key)) grouped.set(key, {});
    grouped.get(key)[row.personKey] = recipesById.get(row.recipeId) || null;
  }

  for (const [key, rows] of grouped.entries()) {
    const [day, slot] = key.split(":");
    if (rows.both) {
      plan[day][slot] = { mode: "both", recipes: { R: rows.both, I: rows.both } };
    } else if (rows.R || rows.I) {
      plan[day][slot] = { mode: "split", recipes: { R: rows.R || null, I: rows.I || null } };
    }
  }
  return plan;
}

export function slotMeal(dayPlan, slot, person) {
  const entry = dayPlan?.[slot];
  if (!entry) return null;
  return entry.recipes?.[person] || null;
}

export function participants(dayPlan, slot) {
  const entry = dayPlan?.[slot];
  if (!entry || entry.mode === "empty") return [];
  if (entry.mode === "both") return ["R", "I"];
  return ["R", "I"].filter(person => !!entry.recipes?.[person]);
}

export function dayRecipes(dayPlan) {
  const list = [];
  for (const slot of SLOTS) {
    const entry = dayPlan?.[slot];
    if (!entry || entry.mode === "empty") continue;
    if (entry.mode === "both" && entry.recipes.R) list.push({ slot, person: "both", recipe: entry.recipes.R });
    else {
      if (entry.recipes.R) list.push({ slot, person: "R", recipe: entry.recipes.R });
      if (entry.recipes.I) list.push({ slot, person: "I", recipe: entry.recipes.I });
    }
  }
  return list;
}

export function allPlannedRecipes(plan) {
  const list = [];
  for (let day = 0; day < 7; day += 1) {
    for (const item of dayRecipes(plan[day])) list.push({ ...item, day });
  }
  return list;
}

export function fullDayTotals(dayPlan, person) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const slot of SLOTS) {
    const recipe = dayPlan?.[slot]?.recipes?.[person];
    if (!recipe) continue;
    totals.kcal += recipe.kcal;
    totals.protein += recipe.protein;
    totals.carbs += recipe.carbs;
    totals.fat += recipe.fat;
  }
  return totals;
}

// eatenSet contains `${slot}:${personKey}` keys for the day in question.
export function eatenTotals(dayPlan, person, eatenSet = new Set()) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let meals = 0;
  let eatenMeals = 0;
  for (const slot of SLOTS) {
    const entry = dayPlan?.[slot];
    const recipe = entry?.recipes?.[person];
    if (!recipe) continue;
    const personKey = entry.mode === "both" ? "both" : person;
    meals += 1;
    if (eatenSet.has(`${slot}:${personKey}`)) {
      eatenMeals += 1;
      totals.kcal += recipe.kcal;
      totals.protein += recipe.protein;
      totals.carbs += recipe.carbs;
      totals.fat += recipe.fat;
    }
  }
  return { totals, meals, eatenMeals };
}

export function mealFactor(dayPlan, slot, extraPortions = 0) {
  const entry = dayPlan?.[slot];
  if (!entry || entry.mode === "empty") return 0;
  if (entry.mode === "both") return 2 + extraPortions;
  const count = participants(dayPlan, slot).length;
  return count + extraPortions;
}
