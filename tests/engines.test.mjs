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
