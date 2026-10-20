/* Deep workflow smoke test against the demo backend in jsdom.
   Run with: npx vite-node scripts/smoke-flows.mjs */
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;
global.Element.prototype.scrollIntoView = () => {};
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const App = (await import("../src/App.jsx")).default;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = createRoot(document.getElementById("root"));
const errors = [];
const originalError = console.error;
console.error = (...args) => {
  const message = args.map(String).join(" ");
  const expected = message.includes("not wrapped in act") || message.includes("deprecated");
  if (!expected) {
    errors.push(message);
    originalError(...args);
  }
};

const run = async fn => act(async () => { await fn(); await sleep(160); });
const text = () => document.body.textContent.replace(/\s+/g, " ").trim();
const state = () => JSON.parse(localStorage.getItem("our-table-demo-v2"));
const button = (needle, scope = document) => [...scope.querySelectorAll("button")].find(el => el.textContent.includes(needle));
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT: ${message}`); };

const click = async (element, wait = 160) => {
  if (!element) throw new Error("click target missing");
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await sleep(wait);
  });
};

const setInput = async (input, value) => {
  if (!input) throw new Error("input target missing");
  const proto = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await sleep(50);
  });
};

const chooseSelect = async (select, value) => {
  if (!select) throw new Error("select target missing");
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set;
  await act(async () => {
    setter.call(select, value);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await sleep(60);
  });
};

const nav = label => click(button(label, document.querySelector(".bottom-nav")), 250);
const sheet = () => document.querySelector(".sheet");
const confirmDialog = () => document.querySelector(".modal-backdrop.center");
const confirm = () => [...document.querySelectorAll(".modal-foot button")].at(-1);

await run(async () => { root.render(React.createElement(App)); });
await sleep(350);

// 1. Eaten → pantry decreases → undo restores.
await nav("Plan");
const pantryTotal = () => state().pantry.reduce((sum, item) => sum + item.quantity, 0);
const beforeTotal = pantryTotal();
const ate = [...document.querySelectorAll("button")].find(el => el.textContent.includes("Ate it"));
assert(ate, "ate button exists");
await click(ate, 450);
const afterTotal = pantryTotal();
assert(afterTotal < beforeTotal, `pantry should decrease (${beforeTotal} → ${afterTotal})`);
const eatenRow = state().eaten.find(row => row.eaten);
assert(eatenRow, "meal marked as eaten");
console.log(`EAT: ${eatenRow.slot} on day ${eatenRow.day} used ${eatenRow.applied.length} pantry items (${beforeTotal} → ${afterTotal})`);

const undo = button("✓");
assert(undo, "eaten state rendered");
await click(undo, 450);
const restored = pantryTotal();
assert(restored === beforeTotal, `pantry should restore (${restored} vs ${beforeTotal})`);
console.log("UNDO EAT: pantry restored");

// 2. Split a shared meal, then merge it back.
const splitButton = button("✂️");
assert(splitButton, "split button exists");
const planKey = row => `${row.day}:${row.slot}:${row.personKey}`;
const beforeSplit = new Set(state().assignments.map(planKey));
await click(splitButton, 450);
const added = state().assignments.filter(row => !beforeSplit.has(planKey(row)) && row.personKey !== "both");
assert(added.length > 0, "split creates one row per person");
const splitTarget = { day: added[0].day, slot: added[0].slot };
assert(document.querySelectorAll(".meal-card").length >= 2, "split renders two person cards");
console.log(`SPLIT: day ${splitTarget.day} ${splitTarget.slot} → two person cards`);

const mergeButton = [...document.querySelectorAll("button")]
  .filter(el => el.textContent.includes("⇄"))
  .find(el => el.closest(".row-between")?.textContent.toLowerCase().includes(splitTarget.slot));
assert(mergeButton, "merge control is visible");
await click(mergeButton, 300);
const keepOptions = [...document.querySelectorAll(".modal .recipe-option")];
if (keepOptions.length) await click(keepOptions[0], 450);
else await sleep(300);
const mergedRows = state().assignments.filter(row => row.day === splitTarget.day && row.slot === splitTarget.slot);
assert(mergedRows.length === 1 && mergedRows[0].personKey === "both", "slot is shared again");
console.log("MERGE BACK: shared meal restored");

// 2b. Merge a slot whose two variants are different recipes — the app asks which one to keep.
const differentMerge = [...document.querySelectorAll("button")]
  .filter(el => el.textContent.includes("⇄"))
  .find(el => el.closest(".row-between")?.textContent.toLowerCase().includes("breakfast"));
if (differentMerge) {
  await click(differentMerge, 300);
  const keepVariant = [...document.querySelectorAll(".modal .recipe-option")];
  assert(keepVariant.length === 2, "different variants offer a choice");
  const keepName = keepVariant[1].querySelector(".opt-name").textContent;
  const keepRecipe = state().recipes.find(recipe => recipe.name.en === keepName);
  await click(keepVariant[1], 500);
  const breakfastRows = state().assignments.filter(row => row.day === 0 && row.slot === "breakfast");
  assert(breakfastRows.length === 1 && breakfastRows[0].personKey === "both" && breakfastRows[0].recipeId === keepRecipe.id, "chosen variant becomes the shared meal");
  console.log(`MERGE VARIANTS: kept "${keepName}" for both`);
}

// 3. Change a meal through the picker and watch the shopping list follow.
const changeButton = button("Change");
assert(changeButton, "change button exists");
await click(changeButton, 300);
assert(text().includes("Choose a recipe"), "picker opened");
const options = [...document.querySelectorAll(".recipe-option")].filter(option => !option.disabled);
const chosen = options[0];
assert(chosen, "picker lists recipes");
const chosenName = chosen.querySelector(".opt-name")?.textContent || "";
await click(chosen, 600);
assert(text().includes(chosenName.slice(0, 15)), "chosen recipe appears on the plan");
const chosenRecipe = state().recipes.find(recipe => recipe.name.en === chosenName);
console.log(`PICKER: changed meal to "${chosenName}"`);

await nav("Shopping");
const shopRows = [...document.querySelectorAll(".shop-row")];
assert(shopRows.length > 0, `shopping list has rows (${shopRows.length})`);
const shoppingText = text();
const shoppingIngredient = chosenRecipe?.ingredients?.[0]?.name?.en || "";
if (shoppingIngredient) {
  assert(shoppingText.toLowerCase().includes(shoppingIngredient.toLowerCase().split(" ")[0]), `shopping follows the change (${shoppingIngredient})`);
}
console.log(`SHOPPING: ${shopRows.length} live rows, includes the new recipe's ingredients`);

// Ticking "bought" also stocks the pantry.
const pantrySumBefore = state().pantry.reduce((sum, item) => sum + item.quantity, 0);
const checkbox = shopRows[0].querySelector(".checkbox");
assert(checkbox, "shopping checkbox exists");
await click(checkbox, 450);
const pantrySumAfter = state().pantry.reduce((sum, item) => sum + item.quantity, 0);
assert(pantrySumAfter > pantrySumBefore, `ticking restocks pantry (${pantrySumBefore} → ${pantrySumAfter})`);
console.log("SHOPPING: ticking a bought item stocks the pantry");

// 3b. Editing a recipe updates the plan and the shopping quantities.
await nav("Plan");
const firstCard = document.querySelector(".meal-card");
const firstMealName = firstCard.querySelector(".meal-name")?.textContent?.trim() || "";
const plannedRecipe = state().recipes.find(recipe => recipe.name.en === firstMealName);
assert(plannedRecipe, `planned recipe found (${firstMealName})`);
const editedIngredient = plannedRecipe.ingredients[0].en;
const shopRowFor = () => [...document.querySelectorAll(".shop-row")]
  .find(row => row.querySelector(".shop-name")?.textContent.includes(editedIngredient));
const qtyOf = row => parseFloat(row.querySelector(".shop-qty").textContent.replace(/[^0-9.,]/g, "").replace(",", "."));
await nav("Shopping");
const rowBeforeEdit = shopRowFor();
assert(rowBeforeEdit, `shopping lists ${editedIngredient}`);
const qtyBeforeEdit = qtyOf(rowBeforeEdit);

await nav("Plan");
await click(button("Recipe", document.querySelector(".meal-card")), 450);
assert(sheet()?.textContent.includes(firstMealName), "recipe viewer opened");
await click(button("Edit", sheet()), 450);
assert(document.querySelector(".sheet .card-soft input[type=number]"), "editor opened");
const qtyInputs = [...document.querySelectorAll(".sheet .card-soft input[type=number]")];
await setInput(qtyInputs[0], "777");
const editorSheet = [...document.querySelectorAll(".sheet")].at(-1);
await click(button("Save", editorSheet.querySelector(".sheet-foot")), 1000);
const openClose = document.querySelector(".sheet .close-btn");
if (openClose) await click(openClose, 300);
const activeDay = eatenRow?.day ?? 0;
const updatedPlanRow = state().assignments.find(row => row.day === activeDay && row.slot === "breakfast");
const updatedRecipe = state().recipes.find(recipe => recipe.id === updatedPlanRow.recipeId);
assert(updatedRecipe?.ingredients[0].amount === 777, "edited recipe is saved onto the slot");
await nav("Shopping");
const rowAfterEdit = shopRowFor();
const qtyAfterEdit = qtyOf(rowAfterEdit);
assert(qtyAfterEdit > qtyBeforeEdit, `shopping quantity follows recipe edit (${qtyBeforeEdit} → ${qtyAfterEdit})`);
console.log(`EDIT RECIPE: ${editedIngredient} ${qtyBeforeEdit} → ${qtyAfterEdit} in the shopping list`);

// 3d. Day menus: edit a library menu once, and the edited root variant is what comes back.
await nav("Plan");
await click(button("Change"), 300);
await click(button("Menus"), 300);
const menuCards = [...document.querySelectorAll(".menu-card")];
assert(menuCards.length >= 5, `menu library renders (${menuCards.length} menus)`);
const firstMenu = menuCards[0];
const menuLabel = card => (card.querySelector(".menu-name")?.textContent || "").replace(/[^\p{L}\p{N} ]/gu, "").trim();
const firstMenuName = menuLabel(firstMenu);
await click(button("Edit", firstMenu), 500);
assert(document.querySelector(".menu-edit-slot"), "menu editor opened");
const editorSelects = [...document.querySelectorAll(".menu-edit-slot select")];
assert(editorSelects.length >= 4, "menu editor lists a selector per day part");
const morningSelect = editorSelects[0];
const morningOptions = [...morningSelect.options].filter(option => option.value && option.value !== morningSelect.value);
assert(morningOptions.length > 0, "menu slot offers alternative recipes");
const replacement = { id: morningOptions[0].value, name: { en: morningOptions[0].textContent.replace(/^\S+\s/, "") } };
await chooseSelect(morningSelect, replacement.id);
await click(button("Save", [...document.querySelectorAll(".sheet-foot")].at(-1)), 900);
await click(button("Menus", [...document.querySelectorAll(".sheet")].at(-1)), 300);
const editedCard = [...document.querySelectorAll(".menu-card")]
  .find(card => menuLabel(card) === firstMenuName);
assert(editedCard, "menu is still listed after editing");
assert(editedCard.textContent.includes("✏️"), "edited menu is flagged as a household variant");
assert(editedCard.textContent.includes(replacement.name.en.slice(0, 10)), `edited root variant shows the new meal (${replacement.name.en})`);

const menuSheet = [...document.querySelectorAll(".sheet")].at(-1);
const wedChip = [...menuSheet.querySelectorAll("button.chip")].find(chip => chip.textContent === "Wed");
assert(wedChip, "day chooser offers Wed");
await click(wedChip, 250);
const applyButton = [...editedCard.querySelectorAll("button")].find(el => el.textContent.includes("Apply to") || el.textContent.includes("Use this menu"));
assert(applyButton.textContent.includes("Wed"), `apply button names the chosen day (${applyButton.textContent})`);
await click(applyButton, 900);
const appliedRows = state().assignments.filter(row => row.recipeId === replacement.id);
assert(appliedRows.some(row => Number(row.day) === 2), "edited menu applied to Wednesday, not a random day");
assert(state().assignments.filter(row => Number(row.day) === 2).length >= 4, "the whole day was filled");
console.log(`DAY MENUS: edited "${firstMenuName}" root variant, applied to Wednesday`);

await click(button("Change"), 300);
await click(button("Menus"), 300);
const reopened = [...document.querySelectorAll(".menu-card")]
  .find(card => menuLabel(card) === firstMenuName);
assert(reopened.textContent.includes(replacement.name.en.slice(0, 10)), "edited variant persists when the menu is reopened");
console.log("DAY MENUS: edit persists as the new root variant");
await click(document.querySelector(".sheet .close-btn"), 300);

// 4. Sous-chef: add a suggestion to the plan.
await nav("Sous-chef");
await sleep(250);
const suggestCards = [...document.querySelectorAll(".suggest-card")];
assert(suggestCards.length > 0, "suggestions rendered");
assert(!/chicken|beef|pork|salmon|tuna/i.test(text()), "no meat or fish in suggestions");
const suggestedName = suggestCards[0].querySelector("div[style*='font-family']")?.textContent?.trim()
  || suggestCards[0].textContent.replace(/\s+/g, " ").trim();
const suggestedRecipe = state().recipes.find(recipe => (recipe.name.en || "").trim() === suggestedName)
  || state().recipes.find(recipe => suggestedName.includes(recipe.name.en));
assert(suggestedRecipe, `suggestion matches a recipe (${suggestedName})`);
await click(button("Add to plan", suggestCards[0]), 300);
assert(text().includes("Which day?"), "day/slot modal opened");
await click(confirm(), 600);
assert(state().assignments.some(row => row.recipeId === suggestedRecipe.id), "suggestion added to the plan");
console.log(`SOUS-CHEF: ${suggestCards.length} suggestions, added "${suggestedRecipe.name.en}"`);

// 5. Create a new recipe and verify it is saved.
await nav("Plan");
await click(button("Change"), 300);
await click(button("New recipe", [...document.querySelectorAll(".sheet")].at(-1)), 400);
assert(text().includes("New recipe"), "recipe editor opened");
await setInput([...document.querySelectorAll(".sheet input")][0], "Smoke test bowl");
const numeric = [...document.querySelectorAll(".sheet input[type=number]")];
await setInput(numeric[0], "25");
await setInput(numeric[1], "450");
await setInput(numeric[2], "18");
await setInput(numeric[3], "55");
await setInput(numeric[4], "14");
const ingredientInputs = [...document.querySelectorAll(".sheet .card-soft input")];
await setInput(ingredientInputs[0], "Smoked tofu");
await setInput(ingredientInputs[1], "Rūkytas tofu");
await setInput(ingredientInputs[2], "120");
const textareas = [...document.querySelectorAll(".sheet textarea")];
await setInput(textareas[0], "Slice and fry.");
await setInput(textareas[1], "Supjaustyti ir pakepinti.");
await click(button("Save", document.querySelector(".sheet-foot")), 800);
const saved = state().recipes.find(recipe => recipe.name.en === "Smoke test bowl");
assert(saved, "recipe saved");
assert(saved.ingredients[0].key === "smoked-tofu", "ingredient key generated");
assert(saved.vegetarian === true, "saved recipe is vegetarian");
console.log(`NEW RECIPE: "${saved.name.en}" saved with ${saved.ingredients.length} ingredient`);

// 6. Non-vegetarian input is blocked client-side.
await click(button("Change"), 300);
await click(button("New recipe", [...document.querySelectorAll(".sheet")].at(-1)), 400);
await setInput([...document.querySelectorAll(".sheet input")][0], "Chicken surprise");
await setInput([...document.querySelectorAll(".sheet input[type=number]")][1], "500");
const meatInputs = [...document.querySelectorAll(".sheet .card-soft input")];
await setInput(meatInputs[0], "Chicken breast");
await setInput(meatInputs[2], "150");
await click(button("Save", document.querySelector(".sheet-foot")), 500);
assert(text().includes("Remove meat or fish"), "vegetarian guard message");
assert(!state().recipes.some(recipe => recipe.name.en === "Chicken surprise"), "meat recipe not saved");
console.log("VEGETARIAN GUARD: chicken rejected");
await click(button("Cancel", document.querySelector(".sheet-foot")), 250);

// 7. Language switch.
await click(document.querySelector(".header-actions .lang-btn"), 350);
assert(text().includes("Mūsų stalas"), "Lithuanian UI");
assert(text().includes("Planas"), "Lithuanian nav");
console.log("LANGUAGE: Lithuanian renders");
await click(document.querySelector(".header-actions .lang-btn"), 350);
assert(text().includes("Our Table"), "English UI restored");

// 7b. Photo capture entry points.
await nav("Plan");
await click(document.querySelector(".scan-btn"), 350);
assert(document.querySelector(".sheet-title")?.textContent.includes("Snap it"), "photo sheet opened from the plan");
const scanTabs = [...document.querySelectorAll(".sheet .segmented button")].map(el => el.textContent);
assert(scanTabs.some(label => label.includes("Meal photo")) && scanTabs.some(label => label.includes("Nutrition label")), "photo sheet offers meal and label modes");
assert(button("Take a photo", document.querySelector(".sheet")), "camera action present");
await click(document.querySelector(".sheet .close-btn"), 250);

await click(button("Change"), 300);
await click(button("New recipe", [...document.querySelectorAll(".sheet")].at(-1)), 400);
const editor = [...document.querySelectorAll(".sheet")].at(-1);
await click(button("Nutrition label", editor), 350);
assert([...document.querySelectorAll(".sheet-title")].some(el => el.textContent.includes("Snap it")), "photo sheet opened from the recipe editor");
await click([...document.querySelectorAll(".sheet .close-btn")].at(-1), 300);
await click(button("Cancel", [...document.querySelectorAll(".sheet-foot")].at(-1)), 300);
console.log("PHOTO: camera sheet reachable from the plan and the recipe editor");

// 8. Week reset keeps pantry, clears plan.
await nav("Pantry");
const pantryBefore = state().pantry.length;
await click(button("⚙️", document.querySelector(".header-actions")), 300);
assert(text().includes("Invite code"), "settings open");
await click(button("Clear the current week"), 300);
await click(confirm(), 900);
assert(state().assignments.length === 0, "plan cleared");
assert(state().pantry.length === pantryBefore, "pantry kept");
console.log("RESET WEEK: plan cleared, pantry kept");

assert(errors.length === 0, `console errors: ${errors.slice(0, 3).join(" | ")}`);
root.unmount();
console.log("FLOW SMOKE OK");
