import { applyDeltas, applyDeltasTracked, consumptionForRecipe } from "../engine/pantry.js";

/**
 * Local copies of what the database will do.
 *
 * A tap used to wait for a write and then for a full kitchen reload before the
 * screen changed. These functions produce the new state immediately, using the
 * same rules the SQL functions use, so the plan, the pantry and the shopping
 * list move under the finger. The write still runs; if it fails the caller puts
 * the old rows back.
 */

const slotRows = (rows = []) => rows
  .filter(row => row && row.recipeId)
  .map(row => ({ personKey: row.personKey, recipeId: row.recipeId }));

/** Pantry goes back up by whatever this meal took out of it. */
function restoreRows(pantry, eatenRows) {
  const restore = [];
  for (const row of eatenRows) {
    for (const applied of row.applied || []) {
      if (!applied?.itemKey || !Number.isFinite(Number(applied.delta))) continue;
      restore.push({ itemKey: applied.itemKey, delta: -Number(applied.delta) });
    }
  }
  if (!restore.length) return pantry;
  return applyDeltas(pantry, restore);
}

function withoutSlot(state, day, slot) {
  const eatenRows = state.eaten.filter(row => row.day === day && row.slot === slot);
  return {
    ...state,
    pantry: restoreRows(state.pantry, eatenRows),
    eaten: state.eaten.filter(row => !(row.day === day && row.slot === slot)),
    assignments: state.assignments.filter(row => !(row.day === day && row.slot === slot)),
  };
}

/** set_slot: replaces a slot and puts back anything already eaten from it. */
export function applySlot(state, day, slot, rows) {
  const base = withoutSlot(state, day, slot);
  const next = slotRows(rows).map(row => ({ day, slot, personKey: row.personKey, recipeId: row.recipeId }));
  return { ...base, assignments: [...base.assignments, ...next] };
}

/** apply_day_menu: all four slots are replaced, then the day's hidden flags drop. */
export function applyMenu(state, day, menu) {
  let base = state;
  for (const slot of ["breakfast", "lunch", "snack", "dinner"]) base = withoutSlot(base, day, slot);
  const next = [];
  for (const [slot, entry] of Object.entries(menu?.items || {})) {
    if (!entry) continue;
    if (entry.both) next.push({ day, slot, personKey: "both", recipeId: entry.both });
    else {
      if (entry.R) next.push({ day, slot, personKey: "R", recipeId: entry.R });
      if (entry.I) next.push({ day, slot, personKey: "I", recipeId: entry.I });
    }
  }
  const touched = new Set(Object.keys(menu?.items || {}));
  return {
    ...base,
    assignments: [...base.assignments, ...next],
    hiddenSections: base.hiddenSections.filter(row => !(row.day === day && touched.has(row.slot))),
  };
}

/** move_slot: two slots trade places, both are un-hidden, eaten marks go. */
export function applyMove(state, day, fromSlot, toSlot) {
  if (fromSlot === toSlot) return state;
  const take = slot => state.assignments
    .filter(row => row.day === day && row.slot === slot)
    .map(row => ({ personKey: row.personKey, recipeId: row.recipeId }));
  const fromRows = take(fromSlot);
  const toRows = take(toSlot);
  const base = withoutSlot(withoutSlot(state, day, fromSlot), day, toSlot);
  return {
    ...base,
    assignments: [
      ...base.assignments,
      ...toRows.map(row => ({ day, slot: fromSlot, ...row })),
      ...fromRows.map(row => ({ day, slot: toSlot, ...row })),
    ],
    hiddenSections: base.hiddenSections.filter(row => !(row.day === day && [fromSlot, toSlot].includes(row.slot))),
  };
}

/** set_section_hidden: hiding clears the slot too; restoring only drops the flag. */
export function applySectionHidden(state, day, slot, hidden) {
  const base = hidden ? withoutSlot(state, day, slot) : state;
  const hiddenSections = base.hiddenSections.filter(row => !(row.day === day && row.slot === slot));
  if (hidden) hiddenSections.push({ day, slot });
  return { ...base, hiddenSections };
}

/**
 * toggle_eaten: either puts a meal back (undo), or takes its ingredients out of
 * the pantry and records exactly what left. Clamping matches the SQL function.
 */
export function applyEaten(state, { day, slot, personKey, recipe, factor = 1 }) {
  const existing = state.eaten.find(row => row.day === day && row.slot === slot && row.personKey === personKey);
  if (existing?.eaten) {
    return {
      ...state,
      pantry: restoreRows(state.pantry, [existing]),
      eaten: state.eaten.filter(row => row !== existing),
    };
  }
  if (!recipe) return state;
  const tracked = applyDeltasTracked(state.pantry, consumptionForRecipe(recipe, factor));
  return {
    ...state,
    pantry: tracked.items,
    eaten: [
      ...state.eaten.filter(row => !(row.day === day && row.slot === slot && row.personKey === personKey)),
      { day, slot, personKey, eaten: true, recipeId: recipe.id, applied: tracked.applied },
    ],
  };
}

/** reset_week: put every eaten meal back, clear the plan, keep the pantry and notes. */
export function applyResetWeek(state) {
  return {
    ...state,
    pantry: restoreRows(state.pantry, state.eaten),
    assignments: [],
    eaten: [],
    water: [],
    shoppingChecks: [],
    hiddenSections: [],
  };
}
