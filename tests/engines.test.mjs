import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { sanitizeRecipe, sanitizePantryItem, sanitizeInviteCode, isInviteCode, sanitizeNote, sanitizeMenu, sanitizePhotoPayload, sanitizeLabel } from "../src/lib/validate.js";
import { ingredientKey, findForbiddenIngredients } from "../src/lib/ingredients.js";
import { buildPlan, mealFactor, eatenTotals } from "../src/engine/plan.js";
import { buildShoppingList, slotPortions } from "../src/engine/shopping.js";
import { applyDeltas, applyDeltasTracked, consumptionForRecipe, isLow, lowItems, pantryCoverage } from "../src/engine/pantry.js";
import { suggestRecipes, isVegetarianSafe } from "../src/engine/recommend.js";
import { PRESET_RECIPES, PRESET_MENUS } from "../src/data/presets.js";
import { mergeMenus, menuTotals, menuItemsFromDay } from "../src/lib/menus.js";
import { customTag, isCustomTag, tagLabel, tagsInUse, labelKey } from "../src/lib/labels.js";
import { generateRecipeDraft } from "../src/engine/generate.js";
import { offlineIdea } from "../src/lib/ideas.js";
import { parseWish, wishSatisfied, containsExcluded, wishChips, resolveIngredient } from "../src/lib/wishes.js";
import { requestRecipeIdea } from "../src/lib/ideas.js";
import { PRODUCT_USES, parseNutritionLabel, productFact, sanitizeProduct } from "../src/lib/products.js";
import { registerProductFacts, factFor } from "../src/data/ingredientFacts.js";
import { createReloader, createTableBatch } from "../src/lib/reload.js";
import { applySlot, applyMenu, applyMove, applySectionHidden, applyEaten, applyResetWeek } from "../src/lib/optimistic.js";
import {
  removedIds, isRemoved, poolRecipes, menuWithoutRemoved, menuRemovedCount,
  removalRow, removedRecipeView, removedOwnRecipes, restorableRecipe,
} from "../src/lib/library.js";
import { UNITS } from "../src/theme.js";
import { STOCK_UNITS, stockUnit, toStock } from "../src/lib/units.js";
import { parseRecipeText, parseIngredientLine, estimateMacros, readMacroLines, parseAmount } from "../src/lib/recipeText.js";

const makeRecipe = (overrides = {}) => ({
  id: "test-a",
  name: { en: "Test bowl", lt: "Testo dubenėlis" },
  emoji: "🥗",
  slot: "lunch",
  kcal: 500,
  protein: 25,
  carbs: 45,
  fat: 20,
  ingredients: [
    { key: "natural-tofu", en: "Natural tofu", lt: "Natūralus tofu", amount: 100, unit: "g" },
    { key: "tomato", en: "Tomato", lt: "Pomidoras", amount: 100, unit: "g" },
  ],
  tags: ["vegetarian", "low-fodmap"],
  vegetarian: true,
  prepMinutes: 20,
  method: { en: "Cook.", lt: "Gaminti." },
  ...overrides,
});

const makeRecipeInput = (overrides = {}) => ({
  name: { en: "Chickpea bowl", lt: "Avinžirnių dubenėlis" },
  emoji: "🥗",
  slot: "lunch",
  kcal: 500,
  protein: 22,
  carbs: 50,
  fat: 18,
  ingredients: [
    { en: "Canned chickpeas", lt: "Avinžirniai", amount: 150, unit: "g" },
    { en: "Tomato", lt: "Pomidoras", amount: 100, unit: "g" },
  ],
  method: { en: "Mix.", lt: "Sumaišyti." },
  tags: ["vegetarian", "high-protein"],
  prepMinutes: 15,
  ...overrides,
});

// ── Validation & vegetarian enforcement ────────────────────────────────────

test("preset library is strictly vegetarian", () => {
  for (const recipe of PRESET_RECIPES) {
    assert.equal(recipe.vegetarian, true, recipe.id);
    assert.ok(recipe.tags.includes("vegetarian"), recipe.id);
    assert.equal(isVegetarianSafe(recipe), true, recipe.id);
    for (const ingredient of recipe.ingredients) {
      assert.deepEqual(
        findForbiddenIngredients(`${ingredient.en} ${ingredient.lt}`),
        [],
        `${recipe.id}: ${ingredient.en}`,
      );
    }
  }
});

test("sanitizeRecipe accepts an ovo-lacto vegetarian recipe", () => {
  const { ok, errors, recipe } = sanitizeRecipe(makeRecipeInput({
    ingredients: [
      { en: "Eggs", lt: "Kiaušiniai", amount: 2, unit: "vnt" },
      { en: "Halloumi cheese", lt: "Halloumi sūris", amount: 80, unit: "g" },
    ],
  }), { existingId: "my-recipe" });
  assert.equal(ok, true, JSON.stringify(errors));
  assert.equal(recipe.id, "my-recipe");
  assert.equal(recipe.vegetarian, true);
  assert.equal(recipe.tags[0], "vegetarian");
  assert.equal(recipe.ingredients[0].key, "eggs");
});

test("sanitizeRecipe rejects meat and fish in both languages", () => {
  for (const name of ["Chicken breast", "Salmon fillet", "Vištiena", "Lašiša", "Beef mince", "Kumpis"]) {
    const { ok, errors } = sanitizeRecipe(makeRecipeInput({
      ingredients: [{ en: name, lt: name, amount: 100, unit: "g" }],
    }));
    assert.equal(ok, false, name);
    assert.equal(errors.vegetarian, "nonVegetarian", name);
  }
});

test("sanitizeRecipe rejects missing names, empty ingredient lists and zero nutrition", () => {
  assert.equal(sanitizeRecipe(makeRecipeInput({ name: { en: "" } })).errors.nameEn, "nameRequired");
  assert.equal(sanitizeRecipe(makeRecipeInput({ ingredients: [] })).errors.ingredients, "ingredientsRequired");
  assert.equal(sanitizeRecipe(makeRecipeInput({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).errors.kcal, "invalidNumber");
});

test("sanitizeRecipe clamps nutrition, units and unknown tags", () => {
  const { recipe } = sanitizeRecipe(makeRecipeInput({
    kcal: 99999,
    protein: -5,
    tags: ["vegetarian", "hacker", "quick", "quick"],
    ingredients: [{ en: "Olive oil", lt: "Aliejus", amount: 999999, unit: "buckets" }],
  }));
  assert.equal(recipe.kcal, 5000);
  assert.equal(recipe.protein, 0);
  assert.equal(recipe.ingredients[0].amount, 5000);
  assert.equal(recipe.ingredients[0].unit, "g");
  assert.ok(recipe.tags.includes("quick"));
  assert.ok(!recipe.tags.includes("hacker"));
  assert.equal(recipe.tags.filter(tag => tag === "quick").length, 1);
});

test("ingredient keys normalise synonyms and punctuation", () => {
  assert.equal(ingredientKey("Egg"), "eggs");
  assert.equal(ingredientKey("Eggs"), "eggs");
  assert.equal(ingredientKey("Tofu"), "natural-tofu");
  assert.equal(ingredientKey("Lactose-free yogurt 2.5%"), "lactose-free-yogurt-2-5");
  assert.equal(ingredientKey("Avocado (¼)"), "avocado");
});

test("invite codes are normalised and validated", () => {
  assert.equal(sanitizeInviteCode(" ab-c12 3 "), "ABC123");
  assert.equal(isInviteCode("ABC123"), true);
  assert.equal(isInviteCode("ABC12"), false);
  assert.equal(isInviteCode("../../x"), false);
});

test("notes are bounded", () => {
  assert.equal(sanitizeNote("  hello   world  "), "hello world");
  assert.equal(sanitizeNote("x".repeat(1000)).length, 500);
});

test("pantry items get a safe key, unit and bounds", () => {
  const { ok, item } = sanitizePantryItem({ nameEn: "Olive oil", unit: "ml", quantity: -10, lowThreshold: 999999 });
  assert.equal(ok, true);
  assert.equal(item.key, "olive-oil");
  assert.equal(item.quantity, 0);
  assert.equal(item.lowThreshold, 100000);
  assert.equal(sanitizePantryItem({ nameEn: "" }).ok, false);
});

// ── Plan resolution ───────────────────────────────────────────────────────

test("shared and split assignments resolve correctly", () => {
  const tofu = makeRecipe({ id: "tofu", name: { en: "Tofu", lt: "Tofu" } });
  const soup = makeRecipe({ id: "soup", name: { en: "Soup", lt: "Sriuba" } });
  const map = new Map([[tofu.id, tofu], [soup.id, soup]]);
  const plan = buildPlan([
    { day: 0, slot: "lunch", personKey: "both", recipeId: "tofu" },
    { day: 0, slot: "dinner", personKey: "R", recipeId: "tofu" },
    { day: 0, slot: "dinner", personKey: "I", recipeId: "soup" },
  ], map);
  assert.equal(plan[0].lunch.mode, "both");
  assert.equal(plan[0].lunch.recipes.R.id, "tofu");
  assert.equal(plan[0].lunch.recipes.I.id, "tofu");
  assert.equal(plan[0].dinner.mode, "split");
  assert.equal(plan[0].dinner.recipes.R.id, "tofu");
  assert.equal(plan[0].dinner.recipes.I.id, "soup");
  assert.equal(plan[1].lunch.mode, "empty");
});

test("meal factors include extra portions per slot", () => {
  const tofu = makeRecipe();
  const map = new Map([[tofu.id, tofu]]);
  const plan = buildPlan([
    { day: 0, slot: "lunch", personKey: "both", recipeId: "test-a" },
    { day: 0, slot: "dinner", personKey: "R", recipeId: "test-a" },
    { day: 0, slot: "breakfast", personKey: "R", recipeId: "test-a" },
    { day: 0, slot: "breakfast", personKey: "I", recipeId: "test-a" },
  ], map);
  assert.equal(mealFactor(plan[0], "lunch", 0), 2);
  assert.equal(mealFactor(plan[0], "lunch", 2), 4);
  assert.equal(mealFactor(plan[0], "dinner", 2), 3);
  assert.equal(mealFactor(plan[0], "breakfast", 2), 4);
  assert.equal(mealFactor(plan[0], "snack", 2), 0);
});

test("eaten totals count shared and split meals separately", () => {
  const tofu = makeRecipe({ kcal: 500, protein: 25 });
  const map = new Map([[tofu.id, tofu]]);
  const plan = buildPlan([
    { day: 0, slot: "lunch", personKey: "both", recipeId: "test-a" },
    { day: 0, slot: "dinner", personKey: "R", recipeId: "test-a" },
    { day: 0, slot: "dinner", personKey: "I", recipeId: "test-a" },
  ], map);
  const eaten = new Set(["lunch:both", "dinner:R"]);
  const r = eatenTotals(plan[0], "R", eaten);
  const i = eatenTotals(plan[0], "I", eaten);
  assert.equal(r.eatenMeals, 2);
  assert.equal(r.totals.kcal, 1000);
  assert.equal(i.eatenMeals, 1);
  assert.equal(i.totals.kcal, 500);
});

// ── Shopping list ─────────────────────────────────────────────────────────

test("shopping list doubles shared meals and follows split meals", () => {
  const tofu = makeRecipe({ ingredients: [{ key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" }] });
  const soup = makeRecipe({
    id: "soup",
    ingredients: [
      { key: "tomato", en: "Tomato", lt: "Pomidoras", amount: 150, unit: "g" },
      { key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 50, unit: "g" },
    ],
  });
  const map = new Map([[tofu.id, tofu], [soup.id, soup]]);
  const plan = buildPlan([
    { day: 0, slot: "lunch", personKey: "both", recipeId: "test-a" },
    { day: 0, slot: "dinner", personKey: "R", recipeId: "test-a" },
    { day: 0, slot: "dinner", personKey: "I", recipeId: "soup" },
  ], map);
  const list = buildShoppingList({ plan, days: [0], lang: "en" });
  const tofuRow = list.find(row => row.ingredientKey === "natural-tofu");
  const tomatoRow = list.find(row => row.ingredientKey === "tomato");
  assert.equal(tofuRow.total, 350); // 2× shared + 1× R + 1× I
  assert.equal(tofuRow.sources.length, 3);
  assert.equal(tomatoRow.total, 150);
});

test("shopping list changes when the meal changes (the old bug)", () => {
  const tofu = makeRecipe({ id: "tofu" });
  const soup = makeRecipe({ id: "soup", ingredients: [{ key: "tomato", en: "Tomato", lt: "Pomidoras", amount: 200, unit: "g" }] });
  const map = new Map([[tofu.id, tofu], [soup.id, soup]]);
  const before = buildShoppingList({
    plan: buildPlan([{ day: 1, slot: "lunch", personKey: "both", recipeId: "tofu" }], map),
    days: [1],
    lang: "en",
  });
  assert.ok(before.some(row => row.ingredientKey === "natural-tofu"));
  const after = buildShoppingList({
    plan: buildPlan([{ day: 1, slot: "lunch", personKey: "both", recipeId: "soup" }], map),
    days: [1],
    lang: "en",
  });
  assert.ok(!after.some(row => row.ingredientKey === "natural-tofu"));
  assert.equal(after.find(row => row.ingredientKey === "tomato").total, 400);
});

test("extra portions are whole numbers, never halves", () => {
  assert.deepEqual(slotPortions({ mode: "both", eaters: 2, extraPortions: 0 }), [2]);
  assert.deepEqual(slotPortions({ mode: "both", eaters: 2, extraPortions: 3 }), [5]);
  // A split dish feeds one person, so it is bought once — not twice.
  assert.deepEqual(slotPortions({ mode: "split", eaters: 2, extraPortions: 0 }), [1, 1]);
  for (const extra of [1, 2, 3, 5, 8]) {
    for (const day of [0, 1, 2, 3]) {
      const portions = slotPortions({ mode: "split", eaters: 2, extraPortions: extra, day });
      assert.equal(portions.length, 2);
      assert.ok(portions.every(value => Number.isInteger(value) && value >= 1), `extra ${extra}, day ${day}: ${portions}`);
      assert.equal(portions.reduce((sum, value) => sum + value, 0), 2 + extra, "totals always match the setting");
    }
  }
  // Odd days hand the first extra portion to the other person, so a week balances.
  assert.deepEqual(slotPortions({ mode: "split", eaters: 2, extraPortions: 1, day: 0 }), [2, 1]);
  assert.deepEqual(slotPortions({ mode: "split", eaters: 2, extraPortions: 1, day: 1 }), [1, 2]);
  // Only one of the two has a dish in a split slot: all extras land on it.
  assert.deepEqual(slotPortions({ mode: "split", eaters: 1, extraPortions: 2, day: 0 }), [3]);
});

test("a split day does not double both dishes when extras are set", () => {
  const mine = makeRecipe({
    id: "mine",
    ingredients: [{ key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" }],
  });
  const hers = makeRecipe({
    id: "hers",
    ingredients: [{ key: "eggs", en: "Eggs", lt: "Kiaušiniai", amount: 2, unit: "vnt" }],
  });
  const map = new Map([[mine.id, mine], [hers.id, hers]]);
  const plan = buildPlan([
    { day: 0, slot: "dinner", personKey: "R", recipeId: "mine" },
    { day: 0, slot: "dinner", personKey: "I", recipeId: "hers" },
  ], map);

  const none = buildShoppingList({ plan, days: [0], lang: "en" });
  assert.equal(none.find(row => row.ingredientKey === "natural-tofu").total, 100);
  assert.equal(none.find(row => row.ingredientKey === "eggs").total, 2);

  const oneExtra = buildShoppingList({ plan, days: [0], extraPortions: 1, lang: "en" });
  assert.equal(oneExtra.find(row => row.ingredientKey === "natural-tofu").total, 200); // 2 portions
  assert.equal(oneExtra.find(row => row.ingredientKey === "eggs").total, 2); // 1 portion

  const twoExtra = buildShoppingList({ plan, days: [0], extraPortions: 2, lang: "en" });
  assert.equal(twoExtra.find(row => row.ingredientKey === "natural-tofu").total, 200);
  assert.equal(twoExtra.find(row => row.ingredientKey === "eggs").total, 4);
});

test("shopping list handles extra portions, selected days and pantry stock", () => {
  const tofu = makeRecipe({ ingredients: [{ key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" }] });
  const map = new Map([[tofu.id, tofu]]);
  const plan = buildPlan([
    { day: 0, slot: "lunch", personKey: "both", recipeId: "test-a" },
    { day: 3, slot: "lunch", personKey: "both", recipeId: "test-a" },
  ], map);
  const list = buildShoppingList({ plan, days: [0], extraPortions: 2, lang: "en", pantry: [{ key: "natural-tofu", unit: "g", quantity: 300 }] });
  const row = list.find(item => item.ingredientKey === "natural-tofu");
  assert.equal(row.total, 400);
  assert.equal(row.inPantry, 300);
});

// ── Pantry ────────────────────────────────────────────────────────────────

test("eating a meal subtracts ingredients and never goes negative", () => {
  const recipe = makeRecipe({ ingredients: [
    { key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" },
    { key: "eggs", en: "Eggs", lt: "Kiaušiniai", amount: 2, unit: "vnt" },
  ] });
  const deltas = consumptionForRecipe(recipe, 2);
  assert.deepEqual(deltas, [
    { itemKey: "natural-tofu|g", delta: -200 },
    { itemKey: "eggs|vnt", delta: -4 },
  ]);
  const pantry = [
    { key: "natural-tofu", unit: "g", quantity: 150, lowThreshold: 100 },
    { key: "eggs", unit: "vnt", quantity: 3, lowThreshold: 2 },
  ];
  const next = applyDeltas(pantry, deltas);
  assert.equal(next[0].quantity, 0);
  assert.equal(next[1].quantity, 0);
  assert.equal(isLow(next[0]), true);
  assert.equal(lowItems(next).length, 2);
});

test("pantry coverage estimates portions from the plan", () => {
  const recipe = makeRecipe({ ingredients: [{ key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" }] });
  const map = new Map([[recipe.id, recipe]]);
  const plan = buildPlan([{ day: 0, slot: "lunch", personKey: "both", recipeId: recipe.id }], map);
  const coverage = pantryCoverage({ key: "natural-tofu", unit: "g", quantity: 400 }, plan, [0]);
  assert.equal(coverage.uses, 1);
  assert.equal(coverage.plannedAmount, 200);
  assert.equal(coverage.portionsLeft, 4);
});

// ── Sous-chef ─────────────────────────────────────────────────────────────

test("suggestions never include meat, even if a row was tampered with", () => {
  const safe = makeRecipe({ id: "safe" });
  const tampered = makeRecipe({
    id: "meat",
    name: { en: "Chicken bowl", lt: "Vištienos dubenėlis" },
    ingredients: [{ key: "chicken", en: "Chicken", lt: "Vištiena", amount: 100, unit: "g" }],
  });
  const safeB = makeRecipe({ id: "safe-b", kcal: 480 });
  const results = suggestRecipes({
    recipes: [safe, tampered, safeB],
    target: { kcal: 500, protein: 25, carbs: 45, fat: 20 },
    slot: "lunch",
    limit: 10,
  });
  assert.ok(results.length > 0);
  assert.ok(results.every(result => result.recipe.id !== "meat"));
});

test("suggestion score rewards similarity, pantry and shared ingredients", () => {
  const reference = makeRecipe({ id: "reference", kcal: 500, protein: 25, ingredients: [{ key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" }] });
  const close = makeRecipe({
    id: "close",
    kcal: 505,
    protein: 24,
    carbs: 44,
    fat: 21,
    ingredients: [
      { key: "natural-tofu", en: "Natural tofu", lt: "Tofu", amount: 100, unit: "g" },
      { key: "tomato", en: "Tomato", lt: "Pomidoras", amount: 80, unit: "g" },
      { key: "cucumber", en: "Cucumber", lt: "Agurkas", amount: 50, unit: "g" },
    ],
  });
  const far = makeRecipe({ id: "far", kcal: 800, protein: 8, carbs: 120, fat: 30, ingredients: [{ key: "rice", en: "Rice", lt: "Ryžiai", amount: 100, unit: "g" }] });
  const results = suggestRecipes({
    recipes: [close, far],
    reference,
    target: { kcal: 500, protein: 25, carbs: 45, fat: 20 },
    slot: "lunch",
    pantry: [
      { key: "natural-tofu", unit: "g", quantity: 300 },
      { key: "tomato", unit: "g", quantity: 100 },
    ],
    limit: 5,
  });
  assert.equal(results[0].recipe.id, "close");
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[0].reasons.length > 0);
  assert.ok(results[0].score <= 99);
});

test("suggestion rules filter high protein, quick and recent meals", () => {
  const quickHigh = makeRecipe({ id: "quick-high", protein: 30, prepMinutes: 10 });
  const slowLow = makeRecipe({ id: "slow-low", protein: 10, prepMinutes: 60 });
  const recent = makeRecipe({ id: "recent", protein: 40, prepMinutes: 10 });
  const target = { kcal: 500, protein: 25, carbs: 45, fat: 20 };
  const highProtein = suggestRecipes({ recipes: [quickHigh, slowLow, recent], target, slot: "lunch", recentIds: ["recent"], filters: { highProtein: true, excludeRecent: true } });
  assert.deepEqual(highProtein.map(result => result.recipe.id), ["quick-high"]);
  const quick = suggestRecipes({ recipes: [quickHigh, slowLow], target, slot: "lunch", filters: { quick: true } });
  assert.ok(quick.every(result => result.recipe.id === "quick-high"));
});

test("suggestion target drives the match percentage", () => {
  const recipe = makeRecipe({ id: "target-test", kcal: 500, protein: 25, carbs: 45, fat: 20 });
  const exact = suggestRecipes({ recipes: [recipe], target: { kcal: 500, protein: 25, carbs: 45, fat: 20 }, slot: "lunch" })[0];
  const off = suggestRecipes({ recipes: [recipe], target: { kcal: 750, protein: 25, carbs: 45, fat: 20 }, slot: "lunch" })[0];
  assert.ok(exact.nutritionPct > off.nutritionPct);
  assert.ok(exact.score > off.score);
});

test("a clamped pantry subtraction is reported so undo restores exactly", () => {
  const pantry = [
    { key: "tomato", unit: "g", quantity: 180, lowThreshold: 100 },
    { key: "eggs", unit: "vnt", quantity: 6, lowThreshold: 2 },
  ];
  const result = applyDeltasTracked(pantry, [
    { itemKey: "tomato|g", delta: -200 },
    { itemKey: "eggs|vnt", delta: -2 },
  ]);
  assert.equal(result.items[0].quantity, 0);
  assert.equal(result.items[1].quantity, 4);
  assert.deepEqual(result.applied, [
    { itemKey: "tomato|g", delta: -180 },
    { itemKey: "eggs|vnt", delta: -2 },
  ]);

  const undo = applyDeltasTracked(result.items, result.applied.map(row => ({ itemKey: row.itemKey, delta: -row.delta })));
  assert.equal(undo.items[0].quantity, 180);
  assert.equal(undo.items[1].quantity, 6);
});

test("menu overrides replace the library root variant", () => {
  const preset = PRESET_MENUS[0];
  const merged = mergeMenus(PRESET_MENUS, []);
  assert.equal(merged.length, PRESET_MENUS.length);
  assert.equal(merged[0].isPreset, true);

  const edited = mergeMenus(PRESET_MENUS, [{
    id: "override-1",
    presetKey: preset.id,
    name: { en: "My Monday", lt: "Mano pirmadienis" },
    emoji: "📅",
    items: { breakfast: { both: "kiwi" } },
  }]);
  assert.equal(edited.length, PRESET_MENUS.length);
  const first = edited.find(menu => menu.id === preset.id);
  assert.equal(first.name.en, "My Monday");
  assert.equal(first.overridden, true);
  assert.equal(first.isPreset, false);
  assert.deepEqual(first.items, { breakfast: { both: "kiwi" } });

  const custom = mergeMenus(PRESET_MENUS, [{ id: "menu-custom-1", name: { en: "Custom" }, items: { lunch: { both: "kiwi" } } }]);
  assert.equal(custom.length, PRESET_MENUS.length + 1);
});

test("day menu totals count two portions for shared meals", () => {
  const recipesById = new Map(PRESET_RECIPES.map(recipe => [recipe.id, recipe]));
  const menu = { items: { breakfast: { both: "kiwi" }, lunch: { R: "kiwi", I: "kiwi" } } };
  const totals = menuTotals(menu, recipesById);
  assert.equal(totals.portions, 4);
  assert.equal(totals.kcal, Math.round((recipesById.get("kiwi").kcal * 4) * 10) / 10);
});

test("menus can be captured from a planned day and validated", () => {
  const dayPlan = {
    breakfast: { mode: "both", recipes: { R: { id: "kiwi" }, I: { id: "kiwi" } } },
    lunch: { mode: "split", recipes: { R: { id: "kiwi" }, I: { id: "nuts" } } },
    snack: { mode: "empty", recipes: {} },
  };
  const items = menuItemsFromDay(dayPlan);
  assert.deepEqual(items, { breakfast: { both: "kiwi" }, lunch: { R: "kiwi", I: "nuts" } });

  const good = sanitizeMenu({ name: { en: "Saved day" }, items });
  assert.equal(good.ok, true);
  assert.equal(good.menu.diff, true);

  const empty = sanitizeMenu({ name: { en: "Nothing" }, items: {} });
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.items);

  const badIds = sanitizeMenu({ name: { en: "Bad" }, items: { lunch: { both: "../../etc/passwd" } } });
  assert.equal(badIds.ok, false);
});

test("photo payloads accept only small image data urls", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(sanitizePhotoPayload({ image: png, mode: "label" }).ok, true);
  assert.equal(sanitizePhotoPayload({ image: png, mode: "meal" }).payload.mode, "meal");
  assert.equal(sanitizePhotoPayload({ image: "https://example.com/a.jpg" }).ok, false);
  assert.equal(sanitizePhotoPayload({ image: "javascript:alert(1)" }).ok, false);
  assert.equal(sanitizePhotoPayload({ image: "data:image/svg+xml;base64,abc" }).ok, false);
  assert.equal(sanitizePhotoPayload({ image: `data:image/jpeg;base64,${"A".repeat(2_000_000)}` }).ok, false);
});


test("household labels are sanitized into safe tag keys", () => {
  const good = sanitizeLabel({ label: "  Made in 10 min  " });
  assert.equal(good.ok, true);
  assert.equal(good.label.label, "Made in 10 min");
  assert.equal(good.label.key, "made-in-10-min");
  assert.equal(customTag(good.label.key), "x-made-in-10-min");
  assert.equal(isCustomTag("x-made-in-10-min"), true);
  assert.equal(labelKey("Šventinis 10 min"), "sventinis-10-min");

  assert.equal(sanitizeLabel({ label: "" }).ok, false);
  assert.equal(sanitizeLabel({ label: "   " }).ok, false);
  assert.equal(sanitizeLabel({ label: "x".repeat(60) }).label.label.length <= 24, true);

  const tagged = sanitizeRecipe(makeRecipeInput({ tags: ["vegetarian", "x-made-in-10-min", "x-<script>", "not-a-tag"] }));
  assert.equal(tagged.ok, true);
  assert.deepEqual(tagged.recipe.tags, ["vegetarian", "x-made-in-10-min"]);

  const labels = [{ key: "made-in-10-min", label: "Made in 10 min" }];
  assert.equal(tagLabel("x-made-in-10-min", "en", labels), "Made in 10 min");
  assert.equal(tagLabel("x-missing", "en", labels), "missing");
  assert.equal(tagLabel("low-fodmap", "lt", labels).length > 0, true);
});

test("labels in use only include ones attached to a recipe", () => {
  const labels = [
    { key: "made-in-10-min", label: "Made in 10 min" },
    { key: "weekend", label: "Weekend" },
  ];
  const recipes = [
    makeRecipe({ tags: ["vegetarian", "quick", "x-made-in-10-min"] }),
    makeRecipe({ id: "test-b", tags: ["vegetarian", "quick"] }),
  ];
  const info = tagsInUse(recipes, labels);
  assert.deepEqual(info.builtIn, ["quick"]);
  assert.deepEqual(info.custom.map(label => label.key), ["made-in-10-min"]);
  assert.equal(info.counts.get("x-made-in-10-min"), 1);
});

test("the offline generator lands near the target and is vegetarian", () => {
  for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
    const draft = generateRecipeDraft({ slot, target: { kcal: 520, protein: 26, carbs: 48, fat: 22 }, seed: 11 });
    assert.ok(draft, `draft for ${slot}`);
    assert.equal(draft.slot, slot);
    assert.equal(draft.vegetarian, true);
    assert.equal(draft.tags.includes("vegetarian"), true);
    assert.ok(draft.name.en.length > 3 && draft.name.lt.length > 3);
    assert.ok(draft.ingredients.length >= 3);
    assert.ok(draft.kcal >= 520 * 0.7 && draft.kcal <= 520 * 1.3, `${slot} kcal ${draft.kcal}`);
    assert.ok(draft.protein > 0 && draft.carbs > 0 && draft.fat > 0);
  }
});

test("rerolling an idea returns new names even across many taps", () => {
  const seen = [];
  for (let index = 0; index < 6; index += 1) {
    const draft = offlineIdea({
      slot: "dinner",
      target: { kcal: 560, protein: 28, carbs: 50, fat: 22 },
      seed: 41 + index * 37,
      excludeNames: seen,
    });
    assert.ok(draft, `idea ${index}`);
    assert.equal(seen.includes(draft.name.en), false, "name is fresh");
    seen.push(draft.name.en);
  }
  assert.equal(new Set(seen).size, 6);
});

test("a wish is understood in English and Lithuanian", () => {
  assert.deepEqual(parseWish("curd").includes, ["curd"]);
  assert.deepEqual(parseWish("I really want curd").includes, ["curd"]);
  assert.deepEqual(parseWish("varškės").includes, ["curd"]);
  assert.deepEqual(parseWish("curd, no avocado").excludes, ["avocado"]);
  assert.deepEqual(parseWish("be avokado").excludes, ["avocado"]);
  assert.equal(parseWish("something quick").quick, true);
  assert.deepEqual(parseWish("").includes, []);
});

test("asking for an ingredient actually produces it", () => {
  const wish = parseWish("curd, no avocado");
  for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const draft = generateRecipeDraft({
        slot,
        target: { kcal: 520, protein: 26, carbs: 48, fat: 22 },
        seed,
        wish,
      });
      assert.ok(draft, `${slot} ${seed}`);
      const keys = draft.ingredients.map(item => item.key);
      assert.ok(keys.includes("curd"), `${slot} ${seed} has curd: ${keys.join(",")}`);
      assert.ok(!keys.includes("avocado"), `${slot} ${seed} has no avocado`);
      assert.equal(wishSatisfied(draft, wish), true);
      assert.deepEqual(containsExcluded(draft, wish), []);
    }
  }
});

test("a wish is a sentence: 'lactose free curd sweet' is a dessert", () => {
  const wish = parseWish("lactose free curd sweet");
  assert.equal(wish.course, "sweet");
  assert.deepEqual(wish.includes, ["curd"]);
  assert.equal(wish.modifiers.lactoseFree, true);
  assert.deepEqual(wishChips(wish).map(chip => chip.label), ["Sweet", "Lactose-free"]);

  // "sweet potato" is a vegetable, not a pudding.
  const potato = parseWish("sweet potato curry");
  assert.equal(potato.course, null);
  assert.deepEqual(potato.includes, ["sweet-potato"]);
});

test("asking for something sweet and curd gives a dessert with curd in it", () => {
  const wish = parseWish("lactose free curd sweet");
  for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
    for (let seed = 1; seed <= 5; seed += 1) {
      const draft = generateRecipeDraft({
        slot,
        target: { kcal: 430, protein: 22, carbs: 45, fat: 18 },
        seed,
        wish,
      });
      assert.ok(draft, `${slot} ${seed}`);
      assert.equal(draft.course, "sweet", `${slot} ${seed} course`);
      assert.ok(draft.ingredients.some(item => item.key === "curd"), `${slot} ${seed} contains curd`);
      assert.equal(draft.vegetarian, true);
      assert.ok(draft.kcal >= 430 * 0.7 && draft.kcal <= 430 * 1.3, `${slot} ${seed} kcal ${draft.kcal}`);
    }
  }
});

test("a savoury AI answer is thrown away when a dessert was asked for", async () => {
  const wish = parseWish("lactose free curd sweet");
  const curd = [{ en: "Curd cheese", lt: "Varškė", amount: 150, unit: "g" }];
  const reply = (name, course) => ({
    available: true,
    recipe: {
      name: { en: name, lt: name },
      emoji: "🍮",
      slot: "lunch",
      kcal: 420,
      protein: 20,
      carbs: 40,
      fat: 18,
      prepMinutes: 20,
      ingredients: curd,
      method: { en: "Bake.", lt: "Kepkite." },
      tags: [],
      course,
    },
  });

  const savoury = await requestRecipeIdea({
    api: { generateRecipe: async () => reply("Curd pasta", "savoury") },
    slot: "lunch",
    target: { kcal: 430, protein: 22, carbs: 45, fat: 18 },
    seed: 3,
    notes: "lactose free curd sweet",
    wish,
  });
  assert.equal(savoury.ai, false, "savoury draft replaced by the engine");
  assert.equal(savoury.course, "sweet");
  assert.ok(savoury.ingredients.some(item => item.key === "curd"));

  const sweet = await requestRecipeIdea({
    api: { generateRecipe: async () => reply("Curd pudding", "sweet") },
    slot: "lunch",
    target: { kcal: 430, protein: 22, carbs: 45, fat: 18 },
    seed: 3,
    notes: "lactose free curd sweet",
    wish,
  });
  assert.equal(sweet.ai, true, "a dessert that contains curd is accepted");
  assert.equal(sweet.name.en, "Curd pudding");
});

test("a broken or old AI function is explained, not silently swapped", async () => {
  const wish = parseWish("curd sweet");
  const base = {
    slot: "lunch",
    target: { kcal: 430, protein: 22, carbs: 45, fat: 18 },
    seed: 5,
    notes: "curd sweet",
    wish,
  };
  const offline = (label, draft) => {
    assert.equal(draft.ai, false, label);
    assert.equal(draft.course, "sweet", `${label} still answers the wish`);
    assert.ok(draft.ingredients.some(item => item.key === "curd"), `${label} contains curd`);
  };

  // No function deployed at all.
  offline("no function", await requestRecipeIdea({ ...base, api: {} }));
  // The function fails or times out.
  offline("function throws", await requestRecipeIdea({
    ...base,
    api: { generateRecipe: async () => { throw new Error("boom"); } },
  }));
  // An older deployment that does not know about `course`: the answer cannot be
  // verified, so it is ignored rather than trusted.
  const legacy = await requestRecipeIdea({
    ...base,
    api: {
      generateRecipe: async () => ({
        available: true,
        recipe: {
          name: { en: "Curd pasta", lt: "Varškės makaronai" },
          emoji: "🍝", slot: "lunch", kcal: 420, protein: 20, carbs: 40, fat: 18,
          prepMinutes: 20,
          ingredients: [{ en: "Curd cheese", lt: "Varškė", amount: 150, unit: "g" }],
          method: { en: "Bake.", lt: "Kepkite." },
          tags: [],
        },
      }),
    },
  });
  assert.equal(legacy.ai, false, "a draft without a course cannot prove it is a dessert");
  assert.equal(legacy.aiNote, "ignored", "the reason is reported to the card");
  assert.equal(legacy.course, "sweet");

  // And a proper answer is accepted, so the AI badge can appear again.
  const good = await requestRecipeIdea({
    ...base,
    api: {
      generateRecipe: async () => ({
        available: true,
        recipe: {
          name: { en: "Curd pudding", lt: "Varškės pudingas" },
          emoji: "🍮", slot: "lunch", kcal: 420, protein: 20, carbs: 40, fat: 18,
          prepMinutes: 20, course: "sweet",
          ingredients: [{ en: "Curd cheese", lt: "Varškė", amount: 150, unit: "g" }],
          method: { en: "Bake.", lt: "Kepkite." },
          tags: [],
        },
      }),
    },
  });
  assert.equal(good.ai, true, "AI recipe accepted");
  assert.equal(good.aiNote, undefined, "no warning when the AI answered properly");
});

test("the time budget reaches both layers", async () => {
  let seen = null;
  const draft = await requestRecipeIdea({
    api: { generateRecipe: async payload => { seen = payload; return { available: false }; } },
    slot: "dinner",
    target: { kcal: 560, protein: 28, carbs: 50, fat: 22 },
    seed: 9,
    notes: "mushrooms",
    wish: parseWish("mushrooms"),
    maxMinutes: 20,
  });
  assert.equal(seen.filters.maxMinutes, 20, "the function is told about the time budget");
  assert.ok(draft.prepMinutes <= 20, `offline engine respects it (${draft.prepMinutes})`);
});

test("a plant product may use a meat word — and nothing else may", async () => {
  // The user's own product is called "vegan meat". It is vegetarian.
  for (const name of ["Vegan meat", "Veganiška mėsa", "plant-based steak", "soy mince", "meat-free mince"]) {
    assert.deepEqual(findForbiddenIngredients(name), [], `${name} is allowed`);
  }
  // The same words without a plant qualifier are still banned.
  for (const name of ["Chicken breast", "Beef steak", "mince", "mėsa", "ham"]) {
    assert.ok(findForbiddenIngredients(name).length > 0, `${name} is rejected`);
  }
  // And the name resolves to a real ingredient the engine can compute with.
  assert.equal(resolveIngredient("my vegan meat"), "vegan-meat");
  assert.equal(resolveIngredient("Veganiška mėsa"), "vegan-meat");
  assert.equal(resolveIngredient("sriracha"), null);
});

test("a named ingredient is in the dish and the plate still fits", async () => {
  for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
    for (let seed = 1; seed <= 40; seed += 1) {
      const draft = generateRecipeDraft({
        slot,
        target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
        seed,
        mustInclude: ["vegan-meat"],
      });
      assert.ok(draft, `${slot} ${seed} produced a draft`);
      assert.ok(
        draft.ingredients.some(item => item.key === "vegan-meat"),
        `${slot} ${seed} contains the ingredient that was asked for`,
      );
      assert.ok(
        draft.kcal >= 500 * 0.72 && draft.kcal <= 500 * 1.25,
        `${slot} ${seed} stays in the calorie range (${draft.kcal})`,
      );
      assert.ok(draft.protein >= 22, `${slot} ${seed} protein ${draft.protein} is fitted to the target`);
    }
  }
});

test("several named ingredients all end up on the plate", () => {
  const draft = generateRecipeDraft({
    slot: "lunch",
    target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
    seed: 7,
    mustInclude: ["vegan-meat", "gf-bread", "hummus"],
  });
  assert.ok(draft);
  for (const key of ["vegan-meat", "gf-bread", "hummus"]) {
    assert.ok(draft.ingredients.some(item => item.key === key), `${key} is present`);
  }
  assert.ok(draft.kcal <= 500 * 1.25, `still inside the range (${draft.kcal})`);
});

test("an unknown ingredient is reported, never silently dropped", async () => {
  const base = {
    target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
    slot: "lunch",
    seed: 4,
    mustNames: ["grandma's mushroom spread"],
  };
  // Offline: the engine cannot know it, so the draft says what is missing.
  const offline = await requestRecipeIdea({ ...base, api: {} });
  assert.equal(offline.ai, false);
  assert.deepEqual(offline.missing, ["grandma's mushroom spread"]);
  assert.equal(offline.aiNote, "unavailable");

  // The model is the one that can cook with it, and it is told to.
  let sent = null;
  const withAi = await requestRecipeIdea({
    ...base,
    api: {
      generateRecipe: async payload => {
        sent = payload;
        return {
          available: true,
          recipe: {
            name: { en: "Mushroom spread toast", lt: "Skrudinta duona su pievagrybių tepuku" },
            emoji: "🍞", slot: "lunch", kcal: 480, protein: 31, carbs: 44, fat: 18,
            prepMinutes: 15, course: "savoury",
            ingredients: [
              { en: "Grandma's mushroom spread", lt: "Močiutės pievagrybių tepukas", amount: 60, unit: "g" },
              { en: "GF bread", lt: "Duona be glitimo", amount: 70, unit: "g" },
              { en: "Skyr", lt: "Skyr", amount: 120, unit: "g" },
            ],
            method: { en: "Toast and spread.", lt: "Paskrudinkite ir užtepkite." },
            tags: [],
          },
        };
      },
    },
  });
  assert.equal(sent.mustInclude.includes("grandma's mushroom spread"), true, "the model is told what must be in it");
  assert.equal(withAi.ai, true);
  assert.deepEqual(withAi.missing, []);
});

// The exact label pasted by the user: a Lithuanian vegan ham product.
const HAM_LABEL = `**Veganiški pjausniai kumpio stiliaus, 80 g**

**Maistinė vertė (100 g/ml)**

Energinė vertė922.00 kJ / 220.00 Kcal

Riebalai9.50 g

Sočiosios riebalų rūgštys0.80 g

Angliavandeniai8.40 g

Cukrūs2.20 g

Baltymai24.30 g

Druska1.30 g`;

test("a pasted label gives back the four numbers a meal needs", () => {
  const parsed = parseNutritionLabel(HAM_LABEL);
  assert.equal(parsed.name, "Veganiški pjausniai kumpio stiliaus");
  assert.equal(parsed.portionGrams, 80, "the pack size is read, not confused with a nutrient");
  assert.equal(parsed.kcal, 220, "kcal wins over the kJ figure on the same line");
  assert.equal(parsed.protein, 24.3);
  assert.equal(parsed.carbs, 8.4);
  assert.equal(parsed.fat, 9.5, "total fat, not the saturates line");

  const english = parseNutritionLabel(
    "Vegan ham slices, 80 g\nNutrition per 100 g\nEnergy 922 kJ / 220 kcal\nFat 9.5 g\n"
    + "of which saturates 0.8 g\nCarbohydrate 8.4 g\nof which sugars 2.2 g\nProtein 24.3 g\nSalt 1.3 g",
  );
  assert.equal(english.kcal, 220);
  assert.equal(english.protein, 24.3);

  // kJ only, and a label printed per portion: both converted to per 100 g.
  const kj = parseNutritionLabel("Tempeh\nper 100 g\nEnergy 800 kJ\nFat 11 g\nCarbohydrate 8 g\nProtein 20 g");
  assert.equal(kj.kcal, 191);
  const portion = parseNutritionLabel("Protein yoghurt\nPer portion 150 g\nEnergy 90 kcal\nFat 1 g\nCarbohydrate 6 g\nProtein 15 g");
  assert.equal(portion.kcal, 60, "per-portion energy scaled to 100 g");
  assert.equal(portion.protein, 10);
});

test("a saved product behaves like any other ingredient", () => {
  const { ok, product } = sanitizeProduct({
    nameEn: "Veganiški pjausniai kumpio stiliaus",
    kcal: 220, protein: 24.3, carbs: 8.4, fat: 9.5, portionGrams: 80,
  });
  assert.equal(ok, true);
  assert.match(product.key, /^p-veganiski-pjausniai/);
  assert.match(product.key, /^p-[a-z0-9-]{1,40}$/, "key fits the database rule");
  const fact = productFact(product);
  assert.equal(fact.group, "protein", "dense in protein, so it fills the protein slot");
  assert.equal(fact.kcal, 220);

  // Nothing is saved without a name or without numbers.
  assert.equal(sanitizeProduct({ nameEn: "", kcal: 200 }).ok, false);
  assert.equal(sanitizeProduct({ nameEn: "Mystery", kcal: 0, protein: 0, carbs: 0, fat: 0 }).ok, false);

  // The engine cooks with it and still lands in range.
  registerProductFacts([fact]);
  assert.ok(factFor(product.key), "registered with the ingredient table");
  for (const seed of [2, 5, 9, 13]) {
    const draft = generateRecipeDraft({
      slot: "lunch",
      target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
      seed,
      mustInclude: [product.key],
    });
    assert.ok(draft, `draft ${seed}`);
    assert.ok(draft.ingredients.some(item => item.key === product.key), `seed ${seed} uses the product`);
    assert.ok(draft.kcal >= 360 && draft.kcal <= 625, `seed ${seed} kcal ${draft.kcal}`);
  }
  // An optional filter must not veto the ingredient that was asked for.
  registerProductFacts([fact]);
  const strict = generateRecipeDraft({
    slot: "lunch",
    target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
    seed: 6,
    filters: { lowFodmap: true, highProtein: true },
    mustInclude: [product.key],
  });
  assert.ok(strict, "a pinned product survives the low-FODMAP and high-protein filters");
  assert.ok(strict.ingredients.some(item => item.key === product.key));

  // It is never chosen at random for a dish nobody asked for.
  const plain = generateRecipeDraft({ slot: "lunch", target: { kcal: 500, protein: 30, carbs: 45, fat: 20 }, seed: 4 });
  assert.equal(plain.ingredients.some(item => item.key === product.key), false);
  registerProductFacts([]);
});

test("a sliced product is never stewed", () => {
  // The user's vegan ham: sliced, so sandwiches, wraps, pizza and salad — not a
  // slow-cooked stew or a coconut curry.
  const { product } = sanitizeProduct({
    nameEn: "Vegan ham slices",
    kcal: 220, protein: 24.3, carbs: 8.4, fat: 9.5,
    uses: ["sandwich", "wrap", "pizza", "salad"],
  });
  assert.deepEqual(product.uses, ["sandwich", "wrap", "pizza", "salad"], "uses survive sanitising");
  registerProductFacts([productFact(product)]);

  const seen = {};
  for (const slot of ["lunch", "dinner"]) {
    seen[slot] = new Set();
    for (let seed = 1; seed <= 30; seed += 1) {
      const draft = generateRecipeDraft({
        slot,
        target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
        seed,
        mustInclude: [product.key],
      });
      assert.ok(draft, `${slot} ${seed}`);
      assert.ok(draft.ingredients.some(item => item.key === product.key), `${slot} ${seed} keeps the product`);
      seen[slot].add(draft.template);
    }
  }
  const forbidden = ["stew", "curry", "roast", "skillet"];
  for (const slot of ["lunch", "dinner"]) {
    for (const shape of forbidden) {
      assert.equal(seen[slot].has(shape), false, `${slot} never uses the ${shape} shape for a slice (${[...seen[slot]].join(",")})`);
    }
    assert.ok(seen[slot].has("sandwich") || seen[slot].has("pizza"), `${slot} offers a sandwich or a pizza`);
  }
  assert.ok(seen.dinner.has("pizza"), "pizza is available at dinner too");

  // Snacking on slices is a toast, breakfast is eggs on toast.
  const breakfast = generateRecipeDraft({ slot: "breakfast", target: { kcal: 500, protein: 30, carbs: 45, fat: 20 }, seed: 3, mustInclude: [product.key] });
  assert.equal(breakfast.template, "eggs-toast");

  // A product with no uses keeps the old freedom, so nothing regresses.
  const free = sanitizeProduct({ nameEn: "Mystery block", kcal: 200, protein: 15, carbs: 10, fat: 12 }).product;
  assert.deepEqual(free.uses, []);
  registerProductFacts([productFact(free)]);
  const shapes = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const draft = generateRecipeDraft({ slot: "dinner", target: { kcal: 500, protein: 30, carbs: 45, fat: 20 }, seed, mustInclude: [free.key] });
    shapes.add(draft.template);
  }
  assert.ok(shapes.size > 1, `an unclassified product still gets variety (${[...shapes].join(",")})`);

  // Unknown uses are dropped rather than stored.
  const odd = sanitizeProduct({ nameEn: "Odd", kcal: 100, uses: ["sandwich", "teleport", 42] }).product;
  assert.deepEqual(odd.uses, ["sandwich"]);
  registerProductFacts([]);
});

test("every built-in template declares where it belongs", () => {
  const known = new Set(PRODUCT_USES.map(use => use.key));
  for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const draft = generateRecipeDraft({ slot, target: { kcal: 500, protein: 25, carbs: 45, fat: 20 }, seed });
      assert.ok(draft, `${slot} ${seed}`);
    }
  }
  // A product tagged only for a shape the slot lacks falls back and says so.
  const { product } = sanitizeProduct({ nameEn: "Soup-only cube", kcal: 120, protein: 12, carbs: 5, fat: 6, uses: ["soup"] });
  registerProductFacts([productFact(product)]);
  const breakfast = generateRecipeDraft({ slot: "breakfast", target: { kcal: 500, protein: 25, carbs: 45, fat: 20 }, seed: 2, mustInclude: [product.key] });
  assert.ok(breakfast, "a fallback still produces an idea");
  assert.equal(breakfast.usesIgnored, true, "the card is told the shape had to change");
  registerProductFacts([]);
  assert.ok(known.size >= 10);
});

test("typing the product name in the wish box pins it", () => {
  const { product } = sanitizeProduct({ nameEn: "Vegan ham slices", kcal: 220, protein: 24.3, carbs: 8.4, fat: 9.5 });
  registerProductFacts([productFact(product)]);
  for (const typed of ["vegan ham", "Vegan ham slices"]) {
    const wish = parseWish(`something with ${typed}`);
    assert.ok(wish.includes.includes(product.key), `"${typed}" resolved to the saved product`);
  }
  registerProductFacts([]);
});

test("rerolling changes the dish, not just the garnish", () => {
  const wish = parseWish("curd");
  let used = [];
  const seen = [];
  const mains = [];
  for (let index = 0; index < 6; index += 1) {
    const draft = offlineIdea({
      slot: "dinner",
      target: { kcal: 560, protein: 28, carbs: 50, fat: 22 },
      seed: 13 + index * 37,
      excludeNames: seen,
      wish,
      avoidKeys: used,
    });
    assert.ok(draft, `idea ${index}`);
    assert.ok(draft.ingredients.some(item => item.key === "curd"), `idea ${index} still honours the wish`);
    seen.push(draft.name.en);
    used = [...new Set([...used, ...draft.ingredients.map(item => item.key)])];
    mains.push(draft.ingredients.find(item => item.key !== "curd")?.key);
  }
  assert.equal(new Set(mains).size >= 3, true, `main ingredients vary: ${mains.join(",")}`);
  // Avocado may come back eventually, but not in every single idea.
  assert.ok(mains.filter(key => key === "avocado").length <= 2, mains.join(","));
});

test("quick ideas really are quick and never reuse a name", () => {
  for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
    for (let seed = 3; seed <= 7; seed += 1) {
      const draft = generateRecipeDraft({
        slot,
        target: { kcal: 480, protein: 24, carbs: 45, fat: 20 },
        filters: { quick: true },
        seed,
      });
      assert.ok(draft, `${slot} draft ${seed}`);
      assert.ok(draft.prepMinutes <= 15, `${slot} prep ${draft.prepMinutes}`);
      assert.equal(draft.tags.includes("quick"), true);
    }
  }
});

// ── Connection diagnostics ──────────────────────────────────────────────────
import { describeLoadError, schemaState } from "../src/lib/errors.js";
import { createSupabaseBackend } from "../src/lib/supabaseBackend.js";

test("load errors are explained, not swallowed", () => {
  const missing = describeLoadError({ code: "42P01", message: 'relation "public.labels" does not exist' }, "labels");
  assert.equal(missing.kind, "missing_schema");
  assert.equal(missing.table, "labels");

  const expired = describeLoadError({ status: 401, message: "JWT expired" }, "recipes");
  assert.equal(expired.kind, "auth");

  const blocked = describeLoadError({ code: "42501", message: "new row violates row-level security policy" }, "pantry");
  assert.equal(blocked.kind, "permission");

  const offline = describeLoadError(new TypeError("Failed to fetch"), "households");
  assert.equal(offline.kind, "network");

  assert.equal(schemaState([missing]).level, 1, "only the new tables missing → usable kitchen");
  assert.equal(schemaState([describeLoadError({ code: "42P01", message: "no table" }, "recipes")]).level, 0);
  assert.equal(schemaState([]).level, 2);
});

test("a broken table does not take the whole kitchen down", async () => {
  const rows = {
    households: { id: "h1", name: "Kitchen", invite_code: "ABC123", extra_portions: 0 },
    profiles: [{ id: "u1", household_id: "h1", person_key: "R", display_name: "Regita" }],
    recipes: [],
    meal_assignments: [],
    eaten: [],
    water: [],
    recipe_notes: [],
    shopping_checks: [],
    pantry: [],
    menus: [],
    day_sections: [],
    labels: [],
  };
  const fake = {
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: table === "households" ? rows[table] : null, error: table === "labels" ? { code: "42P01", message: "does not exist" } : null }),
        then: (resolve, reject) => Promise.resolve({
          data: rows[table] || [],
          error: table === "labels" ? { code: "42P01", message: 'relation "labels" does not exist' } : null,
        }).then(resolve, reject),
      };
      return query;
    },
  };
  const backend = createSupabaseBackend(fake);
  backend.setContext({ userId: "u1", householdId: "h1" });
  const loaded = await backend.loadAll();
  assert.equal(loaded.household.name, "Kitchen");
  assert.equal(loaded.issues.length, 1);
  assert.equal(loaded.issues[0].kind, "missing_schema");
  assert.equal(loaded.issues[0].table, "labels");
  assert.deepEqual(loaded.labels, []);
});

test("the app never swaps builds before the update button is tapped", () => {
  const config = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /registerType:\s*"prompt"/, "service worker must run in prompt mode");
  assert.match(config, /injectRegister:\s*null/, "the app registers the worker itself");
  assert.doesNotMatch(config, /skipWaiting:\s*true/, "a new build must not take over on install");
  assert.doesNotMatch(config, /clientsClaim:\s*true/, "a new build must not claim open pages");
  assert.doesNotMatch(config, /autoUpdate/, "autoUpdate would replace the running build silently");
});

test("the build gate only asks once per version", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  const build = await import("../src/lib/build.js");
  assert.equal(build.currentBuildId(), "", "no injected build id in unit tests");
  assert.equal(build.readStoredBuild(), "");

  build.writeBuild("abc1234");
  assert.equal(build.readStoredBuild(), "abc1234");
  build.writeBuild("");
  assert.equal(build.readStoredBuild(), "");

  // A service-worker update marks itself so the cold-start gate stays quiet.
  build.markUpdating();
  assert.equal(build.takePendingUpdate(), true);
  assert.equal(build.takePendingUpdate(), false, "the flag is consumed once");
  delete globalThis.localStorage;
});

test("startup does not wait on third-party fonts or the Supabase client", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /@import\s+url\(\s*["']https?:/, "no remote @import in the stylesheet");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, "no font preconnects");
  const api = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");
  assert.doesNotMatch(api, /^import[^;]*supabase\.js/m, "the Supabase client is not a static import");
  assert.match(api, /import\("\.\/supabase\.js"\)/, "it is loaded on demand");
});

test("a label photo is read once and then thrown away", async () => {
  const { prepareImage, discardImage } = await import("../src/lib/photo.js");
  // The smallest fake browser that can run the helper: a bitmap and a canvas.
  const calls = [];
  globalThis.createImageBitmap = async () => ({ width: 2048, height: 1536, close: () => calls.push("bitmap-closed") });
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (bitmap, x, y, width, height) => calls.push(`draw ${width}x${height}`) }),
      toDataURL: (type, quality) => { calls.push(`encode ${type} ${quality}`); return "data:image/jpeg;base64,AAAA"; },
    }),
  };
  const photo = await prepareImage({ type: "image/jpeg" });
  assert.equal(photo.width, 1024, "the long edge is capped at 1024 px");
  assert.equal(photo.height, 768, "the short edge keeps the aspect ratio");
  assert.equal(photo.data, "data:image/jpeg;base64,AAAA");
  assert.ok(calls.includes("encode image/jpeg 0.82"), "the upload is a compressed JPEG");
  assert.ok(calls.includes("bitmap-closed"), "the decoded bitmap is released");
  // Nothing but the string exists: dropping the photo really drops it.
  discardImage(photo);
  assert.equal(photo.data, null, "the picture is gone once the numbers are read");
  delete globalThis.document;
  delete globalThis.createImageBitmap;
});

test("a shelf: swiping down closes it, a short wobble does not", async () => {
  const { dismissOnRelease, DRAG_SLOP } = await import("../src/lib/gesture.js");
  // A 520 px sheet: a fifth of it (104 px) is far enough.
  assert.equal(dismissOnRelease({ y: 40, velocity: 0.1, height: 520 }), false, "a short, slow pull goes back");
  assert.equal(dismissOnRelease({ y: 120, velocity: 0.1, height: 520 }), true, "a long pull closes");
  assert.equal(dismissOnRelease({ y: 60, velocity: 0.9, height: 520 }), true, "a short flick closes");
  assert.equal(dismissOnRelease({ y: 60, velocity: 0.5, height: 520 }), false, "a short, unhurried pull does not");
  assert.equal(dismissOnRelease({ y: 400, velocity: 0.9, height: 1200 }), true, "a very tall sheet still closes well before the bottom");
  assert.equal(dismissOnRelease({ y: 140, velocity: 0.1, height: 1200 }), false, "…but 150 px is the most a tall sheet ever asks for");
  assert.equal(dismissOnRelease({ y: 0, velocity: 9, height: 520 }), false, "a tap is not a swipe");
  assert.equal(dismissOnRelease({ y: -30, velocity: 0, height: 520 }), false, "dragging the sheet up never closes it");
  assert.ok(DRAG_SLOP > 0 && DRAG_SLOP < 12, "there is a few pixels of tolerance before a drag starts");
});

// ── Must include: the suggestion list has to exist on a phone too ─────────
const { matchIngredients } = await import("../src/lib/picker.js");

test("the ingredient list ranks what was typed first", () => {
  const facts = {
    "natural-tofu": { en: "Natural tofu", lt: "Natūralus tofu", shortEn: "Tofu", kcal: 144, protein: 15.8, group: "protein" },
    "smoked-tofu": { en: "Smoked tofu", lt: "Rūkytas tofu", kcal: 172, protein: 17, group: "protein" },
    "canned-chickpeas": { en: "Canned chickpeas", lt: "Avinžirniai (konservuoti)", shortEn: "Chickpeas", kcal: 139, protein: 7.5, group: "protein" },
    avocado: { en: "Avocado", lt: "Avokadas", kcal: 160, protein: 2, group: "fat" },
  };
  const top = matchIngredients("tofu", { facts, lang: "en" });
  assert.equal(top[0].key, "natural-tofu", "an exact short name wins");
  assert.ok(top.some(row => row.key === "smoked-tofu"), "the other tofu is still offered");
  assert.ok(!top.some(row => row.key === "avocado"), "an unrelated ingredient is not offered");

  const chick = matchIngredients("chick", { facts, lang: "en" });
  assert.deepEqual(chick.map(row => row.key), ["canned-chickpeas"], "a prefix finds one row");

  // Lithuanian is typed with its own letters, and folding has to cope.
  assert.equal(matchIngredients("avokad", { facts, lang: "lt" })[0].label, "Avokadas");
  assert.equal(matchIngredients("AVOKADAS", { facts, lang: "lt" }).length, 1, "case does not matter");
});

test("an empty box offers a starter list, proteins first", () => {
  const facts = {
    oregano: { en: "Oregano", kcal: 265, protein: 9, group: "flavor" },
    tofu: { en: "Natural tofu", kcal: 144, protein: 15.8, group: "protein" },
    rice: { en: "Brown rice", kcal: 360, protein: 7.5, group: "carb" },
  };
  const rows = matchIngredients("", { facts, lang: "en", limit: 2 });
  assert.equal(rows.length, 2, "the list is capped");
  assert.equal(rows[0].key, "tofu", "a protein comes before a grain");
  assert.equal(rows[1].key, "rice", "…and a grain before a herb");
});

test("an ingredient already pinned is shown as taken, not hidden", () => {
  const facts = { tofu: { en: "Natural tofu", kcal: 144, protein: 15.8, group: "protein" } };
  const [row] = matchIngredients("tofu", { facts, lang: "en", exclude: ["tofu"] });
  assert.equal(row.pinned, true, "the row says it is already in the box");
});

test("a saved product is offered with its own numbers", () => {
  const facts = {
    "p-ham": { key: "p-ham", en: "Veganiški pjausniai kumpio stiliaus", lt: "Veganiški pjausniai", kcal: 220, protein: 24.3, group: "protein", product: true },
  };
  const row = matchIngredients("pjausniai", { facts, lang: "lt" })[0];
  assert.equal(row.label, "Veganiški pjausniai", "the Lithuanian name is used in Lithuanian");
  assert.equal(row.product, true);
  assert.equal(row.protein, 24.3);
});

// ── Why the AI did not answer ─────────────────────────────────────────────
const { functionErrorReason } = await import("../src/lib/supabaseBackend.js");

test("a function that fails with a reason is not a shrug", async () => {
  const response = new Response(JSON.stringify({ available: true, error: "upstream_failed", reason: "bad_key" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(await functionErrorReason({ name: "FunctionsHttpError", context: response }), "bad_key");

  const quota = new Response(JSON.stringify({ error: "upstream_failed", reason: "quota" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(await functionErrorReason({ name: "FunctionsHttpError", context: quota }), "quota");

  // A dead network has no body at all; the error type still says something.
  assert.equal(await functionErrorReason({ name: "FunctionsFetchError", context: new Error("offline") }), "network");
  assert.equal(await functionErrorReason({ name: "FunctionsRelayError", context: {} }), "relay");
});

test("the idea carries the reason forward instead of one vague note", async () => {
  const blocked = await requestRecipeIdea({
    api: { generateRecipe: async () => { throw Object.assign(new Error("nope"), { reason: "bad_key" }); } },
    slot: "lunch",
    target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
    seed: 3,
  });
  assert.equal(blocked.ai, false, "the offline engine still produced a dish");
  assert.equal(blocked.aiNote, "failed");
  assert.equal(blocked.aiReason, "bad_key", "the card can now say which key is wrong");

  const quota = await requestRecipeIdea({
    api: { generateRecipe: async () => ({ available: false, reason: "quota" }) },
    slot: "lunch",
    target: { kcal: 500, protein: 30, carbs: 45, fat: 20 },
    seed: 4,
  });
  assert.equal(quota.aiReason, "quota");
});

test("every screen can be read in both languages", async () => {
  const { T } = await import("../src/data/translations.js");
  const { readFileSync, readdirSync } = await import("node:fs");
  const english = new Set(Object.keys(T.en));
  const lithuanian = new Set(Object.keys(T.lt));
  const missingInLt = [...english].filter(key => !lithuanian.has(key));
  const missingInEn = [...lithuanian].filter(key => !english.has(key));
  assert.deepEqual(missingInLt, [], "nothing is left English-only");
  assert.deepEqual(missingInEn, [], "nothing is left Lithuanian-only");

  // A key the code asks for but the table does not have renders as "undefined"
  // on screen, which is how the new photo labels could have shipped.
  const files = readdirSync("src/components")
    .filter(name => name.endsWith(".jsx"))
    .map(name => `src/components/${name}`)
    .concat(["src/App.jsx"]);
  const used = new Set();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bt\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) used.add(match[1]);
  }
  const unknown = [...used].filter(key => !english.has(key) && !lithuanian.has(key));
  assert.deepEqual(unknown, [], `screens ask for keys that do not exist: ${unknown.join(", ")}`);
});


// ── The tap must not wait for the kitchen ───────────────────────────────────
// A controlled clock instead of real timers, so these tests describe the
// reloader exactly rather than racing it.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        // Let the run promise and the catch/finally chain settle.
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
      }
      now = target;
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    },
    pending: () => timers.size,
  };
}

test("a burst of taps becomes one reload, not one per tap", async () => {
  const clock = fakeClock();
  let runs = 0;
  const reloader = createReloader(async () => { runs += 1; }, { wait: 250, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

  for (let i = 0; i < 12; i += 1) reloader.request();
  await clock.advance(249);
  assert.equal(runs, 0, "nothing is read while the burst is still arriving");
  await clock.advance(1);
  assert.equal(runs, 1, "twelve requests cost exactly one read");
  assert.equal(clock.pending(), 0, "and nothing is left waiting");
});

test("a realtime event asked for during a read becomes one follow-up", async () => {
  const clock = fakeClock();
  let runs = 0;
  let release = null;
  const reloader = createReloader(async () => {
    runs += 1;
    if (runs === 1) await new Promise(resolve => { release = resolve; });
  }, { wait: 200, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

  reloader.request();
  await clock.advance(200);
  assert.equal(runs, 1, "the first read is on the wire");
  // Three events land while the first read is still running.
  reloader.request();
  reloader.request();
  reloader.request();
  release();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await clock.advance(200);
  assert.equal(runs, 2, "the whole in-flight burst collapses into one follow-up");
});

test("a later tap joins the waiting read instead of pushing it back", async () => {
  const clock = fakeClock();
  let runs = 0;
  const reloader = createReloader(async () => { runs += 1; }, { wait: 250, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  reloader.request();
  await clock.advance(200);
  reloader.request(); // a debounce would restart the 250 ms here and keep doing so
  await clock.advance(50);
  assert.equal(runs, 1, "the read still happened at the original deadline");
  await clock.advance(1000);
  assert.equal(runs, 1, "and the tap it absorbed did not earn a second read");
});

test("flushing on leaving the screen sends the pending read once", async () => {
  const clock = fakeClock();
  let runs = 0;
  const reloader = createReloader(async () => { runs += 1; }, { wait: 250, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  reloader.request();
  await reloader.flush();
  assert.equal(runs, 1, "flush does not wait for the window");
  await clock.advance(1000);
  assert.equal(runs, 1, "and the timer it replaced does not fire a second read");
});

test("cancelling drops the waiting read (signing out, changing household)", async () => {
  const clock = fakeClock();
  let runs = 0;
  const reloader = createReloader(async () => { runs += 1; }, { wait: 250, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  reloader.request();
  reloader.cancel();
  await clock.advance(1000);
  assert.equal(runs, 0, "a cancelled read never runs");
  assert.equal(reloader.pending, false, "and the reloader reports itself idle");
});

// ── Optimistic state must match what the database will do ───────────────────
const baseState = () => ({
  recipes: [],
  assignments: [
    { day: 0, slot: "breakfast", personKey: "both", recipeId: "porridge" },
    { day: 0, slot: "lunch", personKey: "R", recipeId: "soup" },
  ],
  eaten: [],
  water: [],
  shoppingChecks: [],
  hiddenSections: [],
  notes: [],
  pantry: [{ key: "oats", unit: "g", quantity: 200 }, { key: "tofu", unit: "g", quantity: 100 }],
});

test("choosing a meal paints the slot without waiting for a read", () => {
  const before = baseState();
  const next = applySlot(before, 0, "breakfast", [{ personKey: "both", recipeId: "eggs" }]);
  assert.equal(next.assignments.filter(row => row.day === 0 && row.slot === "breakfast").length, 1);
  assert.equal(next.assignments.find(row => row.slot === "breakfast").recipeId, "eggs");
  assert.equal(before.assignments.find(row => row.slot === "breakfast").recipeId, "porridge", "the old state is not mutated");
});

test("a null recipe id leaves the other person's lunch alone", () => {
  // "Keep R, forget I" arrives as rows for R only; nothing may be drawn for I
  // because its recipe id is unknown on this device.
  const before = baseState();
  const next = applySlot(before, 0, "lunch", [{ personKey: "R", recipeId: "soup" }]);
  assert.equal(next.assignments.find(row => row.slot === "lunch").personKey, "R");
  assert.equal(next.assignments.filter(row => row.slot === "lunch").length, 1);
});

test("marking a meal eaten takes the ingredients out of the pantry at once", () => {
  const recipe = { id: "porridge", ingredients: [
    { key: "oats", unit: "g", amount: 60 },
    { key: "tofu", unit: "g", amount: 40 },
  ] };
  const state = baseState();
  const next = applyEaten(state, { day: 0, slot: "breakfast", personKey: "both", recipe, factor: 2 });
  assert.equal(next.pantry.find(item => item.key === "oats").quantity, 80, "120 g of oats were used");
  assert.equal(next.pantry.find(item => item.key === "tofu").quantity, 20, "80 g of tofu were used");
  assert.equal(next.eaten.length, 1);
  assert.equal(next.eaten[0].applied.length, 2, "the applied deltas are stored so undo can restore exactly");

  const undone = applyEaten(next, { day: 0, slot: "breakfast", personKey: "both", recipe, factor: 2 });
  assert.equal(undone.pantry.find(item => item.key === "oats").quantity, 200, "undo puts it all back");
  assert.equal(undone.eaten.length, 0);
});

test("choosing a new meal for a slot that was eaten puts the ingredients back", () => {
  const recipe = { id: "porridge", ingredients: [{ key: "oats", unit: "g", amount: 50 }] };
  const eatenState = applyEaten(baseState(), { day: 0, slot: "breakfast", personKey: "both", recipe, factor: 1 });
  assert.equal(eatenState.pantry.find(item => item.key === "oats").quantity, 150);
  const switched = applySlot(eatenState, 0, "breakfast", [{ personKey: "both", recipeId: "eggs" }]);
  assert.equal(switched.pantry.find(item => item.key === "oats").quantity, 200, "the cancelled meal returns its oats");
  assert.equal(switched.eaten.length, 0, "and its eaten mark goes");
});

test("moving a meal swaps both slots and un-hides them", () => {
  const state = {
    ...baseState(),
    assignments: [
      { day: 0, slot: "breakfast", personKey: "both", recipeId: "porridge" },
      { day: 0, slot: "lunch", personKey: "both", recipeId: "soup" },
    ],
    hiddenSections: [{ day: 0, slot: "dinner" }],
  };
  const next = applyMove(state, 0, "breakfast", "lunch");
  assert.equal(next.assignments.find(row => row.slot === "breakfast").recipeId, "soup");
  assert.equal(next.assignments.find(row => row.slot === "lunch").recipeId, "porridge");
  assert.deepEqual(next.hiddenSections, [{ day: 0, slot: "dinner" }], "unrelated hidden sections stay hidden");
});

test("hiding a section clears it, restoring only drops the flag", () => {
  const hidden = applySectionHidden(baseState(), 0, "breakfast", true);
  assert.equal(hidden.assignments.filter(row => row.slot === "breakfast").length, 0);
  assert.deepEqual(hidden.hiddenSections, [{ day: 0, slot: "breakfast" }]);
  const shown = applySectionHidden(hidden, 0, "breakfast", false);
  assert.deepEqual(shown.hiddenSections, []);
  assert.equal(shown.assignments.filter(row => row.slot === "breakfast").length, 0, "restoring does not invent a meal");
});

test("applying a day menu fills four slots in one paint", () => {
  const menu = { items: {
    breakfast: { both: "porridge" },
    lunch: { R: "soup", I: "salad" },
    dinner: { both: "pasta" },
  } };
  const next = applyMenu(baseState(), 0, menu);
  assert.equal(next.assignments.filter(row => row.day === 0 && row.slot === "lunch").length, 2);
  assert.equal(next.assignments.find(row => row.slot === "dinner").recipeId, "pasta");
  assert.equal(next.assignments.filter(row => row.slot === "breakfast").length, 1);
});

test("resetting the week puts the pantry back and keeps notes", () => {
  const recipe = { id: "porridge", ingredients: [{ key: "oats", unit: "g", amount: 30 }] };
  const eaten = applyEaten(baseState(), { day: 0, slot: "breakfast", personKey: "both", recipe, factor: 1 });
  const withNote = { ...eaten, notes: [{ recipeId: "porridge", personKey: "both", note: "more honey" }] };
  const reset = applyResetWeek(withNote);
  assert.equal(reset.pantry.find(item => item.key === "oats").quantity, 200, "eaten meals are un-consumed");
  assert.deepEqual(reset.assignments, []);
  assert.deepEqual(reset.eaten, []);
  assert.equal(reset.notes.length, 1, "notes are not part of the week");
});


test("a reload batch widens to the whole kitchen when a table is unknown", () => {
  const batch = createTableBatch();
  batch.add(["pantry"]);
  batch.add(["recipes", "pantry"]);
  assert.deepEqual(batch.take().sort(), ["pantry", "recipes"], "narrow requests merge into one slice");
  assert.equal(batch.take(), null, "the batch is emptied when it is taken");

  batch.add(["pantry"]);
  batch.add(null); // another tab wrote; its table is unknown
  batch.add(["water"]); // a later narrow request must not shrink the read
  assert.equal(batch.take(), null, "an unknown table means read everything");
  assert.equal(batch.pending, false, "and the batch is empty afterwards");

  batch.add([]);
  assert.equal(batch.take(), null, "an empty batch is a safe full read, never a crash");
});


// ── "We are bored of these" ─────────────────────────────────────────────────
test("a removed dish leaves the pool but stays in the library for everyone", () => {
  const library = [makeRecipe({ id: "lib-a", isPreset: true }), makeRecipe({ id: "lib-b", isPreset: true })];
  const own = makeRecipe({ id: "own-a" });
  const removed = removalRow(library[0]);
  assert.deepEqual(removedIds([removed]), new Set(["lib-a"]));
  assert.equal(isRemoved("lib-a", [removed]), true);
  assert.equal(isRemoved(library[1], [removed]), false);

  const pool = poolRecipes([...library, own], [removed]);
  assert.deepEqual(pool.map(recipe => recipe.id), ["lib-b", "own-a"], "only the removed dish leaves the pool");
  assert.equal(library.length, 2, "the shared rows themselves are untouched");
  assert.equal(removed.snapshot, undefined, "a library dish needs no snapshot: its row still exists");
});

test("poolRecipes tolerates the raw database shape and bad rows", () => {
  const pool = poolRecipes([makeRecipe({ id: "a" }), null, { name: { en: "no id" } }], [{ recipe_id: "a" }]);
  assert.deepEqual(pool.map(recipe => recipe.id), [], "a raw removed_recipes row hides the same id");
  assert.deepEqual(poolRecipes([], undefined), [], "missing markers are an empty set, not a crash");
});

test("a day menu drops removed dishes and counts what it dropped", () => {
  const menu = {
    id: "m1",
    items: {
      breakfast: { both: "lib-a" },
      lunch: { R: "own-a", I: "lib-b" },
      snack: { both: "lib-b" },
    },
  };
  const removed = [removalRow({ id: "lib-a", isPreset: true })];
  const pruned = menuWithoutRemoved(menu, removed);
  assert.deepEqual(pruned.items.breakfast, undefined, "a slot whose only dish was removed disappears");
  assert.deepEqual(pruned.items.lunch, { R: "own-a", I: "lib-b" }, "the other person's meal is kept");
  assert.deepEqual(pruned.items.snack, { both: "lib-b" });
  assert.equal(menu.items.breakfast.both, "lib-a", "the saved menu itself is not rewritten");

  const removedBoth = [removalRow({ id: "lib-b", isPreset: true })];
  assert.equal(menuRemovedCount(menu, removedBoth), 3, "a shared meal counts two people, snacks one");
  assert.equal(menuRemovedCount(menu, []), 0, "nothing removed, nothing to warn about");
});

test("an own recipe is remembered whole, so 'put back' can rebuild it", () => {
  const recipe = makeRecipe({ id: "own-a" });
  const marker = removalRow(recipe);
  const rebuilt = restorableRecipe(marker);
  assert.ok(rebuilt, "the marker can rebuild the dish");
  assert.deepEqual(rebuilt.name, recipe.name);
  assert.deepEqual(rebuilt.ingredients, recipe.ingredients, "ingredients survive, so shopping works again");
  assert.equal(rebuilt.kcal, recipe.kcal);
  assert.deepEqual(rebuilt.method, recipe.method);
  assert.equal(rebuilt.isPreset, undefined, "a rebuilt dish is saved as the household's own");

  const view = removedRecipeView(marker);
  assert.equal(view.name.en, "Test bowl", "the list can still name it");
  assert.equal(view.kcal, 500);
  assert.equal(view.restorable, true);
  assert.deepEqual(removedOwnRecipes([marker]).map(row => row.id), ["own-a"]);
  assert.deepEqual(removedOwnRecipes([removalRow({ id: "lib-a", isPreset: true })]), [],
    "a hidden library dish is drawn from its own row, never from its id slug");
});

test("an old label-only marker still lists the dish but does not invent it", () => {
  const old = { recipeId: "own-old", snapshot: { name: { en: "Old soup" }, emoji: "🍲", slot: "lunch", kcal: 300 } };
  const view = removedRecipeView(old);
  assert.equal(view.name.en, "Old soup");
  assert.equal(view.restorable, false, "no ingredients means it cannot be rebuilt");
  assert.equal(restorableRecipe(old), null, "the caller clears the marker instead of saving an empty dish");
  assert.equal(restorableRecipe({ recipeId: "x", snapshot: null }), null);
});

// ── Spoons, and pasting a recipe in ─────────────────────────────────────────
test("a spoon is a recipe unit and millilitres in the stock", () => {
  assert.deepEqual(UNITS, ["g", "ml", "vnt", "tsp", "tbsp"], "the editor offers spoons");
  assert.deepEqual(STOCK_UNITS, ["g", "ml", "vnt"], "the pantry and the shop do not");
  assert.equal(stockUnit("tbsp"), "ml");
  assert.equal(stockUnit("tsp"), "ml");
  assert.equal(stockUnit("g"), "g");
  assert.deepEqual(toStock({ key: "olive-oil", amount: 2, unit: "tbsp" }),
    { key: "olive-oil", amount: 30, unit: "ml" }, "1 tbsp = 15 ml");
  assert.deepEqual(toStock({ key: "salt", amount: 1, unit: "tsp" }),
    { key: "salt", amount: 5, unit: "ml" }, "1 tsp = 5 ml");
  assert.deepEqual(toStock({ key: "tofu", amount: 100, unit: "g" }),
    { key: "tofu", amount: 100, unit: "g" }, "a gram is untouched");
});

test("a recipe's spoons and grams add up on one shopping line", () => {
  const recipe = makeRecipe({
    id: "spooned",
    ingredients: [
      { key: "olive-oil", en: "Olive oil", lt: "Aliejus", amount: 1, unit: "tbsp" },
    ],
  });
  const grams = makeRecipe({
    id: "grams",
    ingredients: [{ key: "olive-oil", en: "Olive oil", lt: "Aliejus", amount: 10, unit: "g" }],
  });
  const plan = buildPlan(
    [
      { day: 0, slot: "lunch", personKey: "both", recipeId: "spooned" },
      { day: 1, slot: "lunch", personKey: "both", recipeId: "grams" },
    ],
    new Map([["spooned", recipe], ["grams", grams]]),
  );
  const list = buildShoppingList({ plan, days: [0, 1] });
  const oil = list.find(item => item.key === "olive-oil|ml");
  assert.ok(oil, "a tablespoon of oil is bought in millilitres, not in spoons");
  assert.equal(oil.total, 30, "2 portions × 15 ml");
  assert.equal(list.filter(item => /tbsp|tsp/.test(item.key)).length, 0, "no spoon rows reach the shop");

  // Eating the dish takes millilitres out of the millilitre pantry row.
  const deltas = consumptionForRecipe(recipe, 2);
  assert.deepEqual(deltas, [{ itemKey: "olive-oil|ml", delta: -30 }]);
});

test("a recipe pasted into one box is sorted into the right fields", () => {
  const parsed = parseRecipeText(`Creamy Chickpea Bowl (Kreminis avinžirnių dubenėlis)
Serves 2
Prep time: 20 minutes

Ingredients
- 150 g canned chickpeas
- 2 tbsp olive oil
- 1 1/2 tsp ground cumin
- 1 onion
- Salt to taste

Method
1. Heat the oil and soften the onion.
2. Add the chickpeas and cumin, then simmer.

Nutrition per serving
Energy: 420 kcal
Protein: 18 g
Carbs: 48 g
Fat: 17 g`);

  assert.equal(parsed.name.en, "Creamy Chickpea Bowl");
  assert.equal(parsed.name.lt, "Kreminis avinžirnių dubenėlis", "the Lithuanian name in brackets is kept");
  assert.equal(parsed.servings, 2);
  assert.equal(parsed.prepMinutes, 20);
  assert.equal(parsed.ingredients.length, 5);
  assert.deepEqual(
    parsed.ingredients.map(item => [item.en, item.amount, item.unit]),
    [
      ["canned chickpeas", 150, "g"],
      ["olive oil", 2, "tbsp"],
      ["ground cumin", 1.5, "tsp"],
      ["onion", 1, "vnt"],
      ["Salt", 1, "g"],
    ],
  );
  assert.equal(parsed.ingredients[0].key, "canned-chickpeas", "a known ingredient is recognised, not just named");
  assert.match(parsed.method.en, /Heat the oil/);
  assert.deepEqual(parsed.macros, { kcal: 420, protein: 18, carbs: 48, fat: 17 });
  assert.equal(parsed.found.macros, true, "written nutrition is used as written");
});

test("pasting without nutrition estimates the macros and says what it could not count", () => {
  const parsed = parseRecipeText(`Quick tofu scramble
Ingredients:
1 tbsp olive oil
200 g firm tofu
1 tsp turmeric

Method: Crumble the tofu into a hot pan, add turmeric, cook five minutes.`);
  assert.equal(parsed.found.macros, false);
  assert.equal(parsed.found.method, true, "an inline Method: line still fills the method");
  assert.equal(parsed.ingredients.length, 3, "the method line is not read as an ingredient");

  const estimate = estimateMacros(parsed.ingredients);
  assert.ok(estimate.kcal > 200, `oil and tofu together are a real meal (${estimate.kcal} kcal)`);
  assert.equal(estimate.known.length, 2, "the tofu and the spoon of oil were recognised");
  assert.ok(estimate.unknown.includes("turmeric"), "the spice is reported, not silently counted as zero");
  assert.equal(estimate.kcal, Math.round(15 * 8.84 + 200 * 1.44), "spoons land as 15 ml of oil, not as 1 unit");
});

test("a macro line written as '22 g protein' is read like 'Protein 22 g'", () => {
  const written = readMacroLines("Per serving: 310 kcal, 22 g protein, 8 g carbs, 21 g fat");
  assert.deepEqual(written, { kcal: 310, protein: 22, carbs: 8, fat: 21 });
  const labelled = readMacroLines("Energinė vertė 420 kcal\nBaltymai 18 g\nAngliavandeniai 48 g\nRiebalai 17 g");
  assert.deepEqual(labelled, { kcal: 420, protein: 18, carbs: 48, fat: 17 });
});

test("awkward quantities in a pasted recipe still become numbers", () => {
  assert.equal(parseAmount("1 1/2"), 1.5);
  assert.equal(parseAmount("½"), 0.5);
  assert.equal(parseAmount("1½"), 1.5);
  assert.equal(parseAmount("3/4"), 0.75);
  assert.equal(parseAmount("1,5"), 1.5);
  assert.equal(parseAmount("two"), 0);

  const cup = parseIngredientLine("1 cup rolled oats");
  assert.equal(cup.amount, 240, "a cup is 240 ml");
  assert.equal(cup.unit, "ml");
  const handful = parseIngredientLine("2 handfuls spinach");
  assert.equal(handful.amount, 60, "a handful is about 30 g");
  const packs = parseIngredientLine("2 x 400 g canned tomatoes");
  assert.equal(packs.amount, 800, "two tins are 800 g");
  const juice = parseIngredientLine("Juice of ½ lemon");
  assert.equal(juice.amount, 15);
  assert.equal(juice.unit, "ml");
  assert.equal(juice.key, "lemon-juice");
});
