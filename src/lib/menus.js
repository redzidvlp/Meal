import { SLOTS } from "../theme.js";

/**
 * A menu is a reusable full day: { id, presetKey, name: {en, lt}, emoji, items, isPreset }.
 * Household edits of a preset are stored as an override carrying `presetKey`, so the
 * edited "root variant" is what everyone sees the next time they open the menu list.
 */
export function mergeMenus(presets = [], overrides = []) {
  const byPreset = new Map();
  const custom = [];
  for (const row of overrides) {
    if (row?.presetKey) byPreset.set(row.presetKey, row);
    else if (row?.id) custom.push(row);
  }
  const merged = presets.map(preset => {
    const override = byPreset.get(preset.id);
    return override
      ? { ...preset, ...override, id: preset.id, presetKey: preset.id, isPreset: false, overridden: true }
      : { ...preset, isPreset: true, overridden: false };
  });
  const seen = new Set(merged.map(menu => menu.id));
  for (const row of custom) {
    if (seen.has(row.id)) continue;
    merged.push({ ...row, isPreset: false, overridden: false });
    seen.add(row.id);
  }
  return merged;
}

export function menuRecipeIds(menu) {
  const ids = [];
  for (const slot of SLOTS) {
    const entry = menu?.items?.[slot];
    if (!entry) continue;
    if (entry.both) ids.push(entry.both);
    else {
      if (entry.R) ids.push(entry.R);
      if (entry.I) ids.push(entry.I);
    }
  }
  return ids;
}

export function menuTotals(menu, recipesById) {
  let kcal = 0;
  let portions = 0;
  for (const slot of SLOTS) {
    const entry = menu?.items?.[slot];
    if (!entry) continue;
    if (entry.both) {
      kcal += (recipesById.get(entry.both)?.kcal || 0) * 2;
      portions += 2;
    } else {
      for (const person of ["R", "I"]) {
        if (!entry[person]) continue;
        kcal += recipesById.get(entry[person])?.kcal || 0;
        portions += 1;
      }
    }
  }
  return { kcal, portions };
}

/** Turns a resolved day plan into menu items, used by "save this day as a menu". */
export function menuItemsFromDay(dayPlan = {}) {
  const items = {};
  for (const slot of SLOTS) {
    const entry = dayPlan?.[slot];
    if (!entry || entry.mode === "empty") continue;
    if (entry.mode === "both" && entry.recipes?.R) {
      items[slot] = { both: entry.recipes.R.id };
      continue;
    }
    const row = {};
    if (entry.recipes?.R) row.R = entry.recipes.R.id;
    if (entry.recipes?.I) row.I = entry.recipes.I.id;
    if (Object.keys(row).length) items[slot] = row;
  }
  return items;
}

export function menuAppliesTo(menu, recipesById) {
  return menuRecipeIds(menu).every(id => recipesById.has(id));
}
