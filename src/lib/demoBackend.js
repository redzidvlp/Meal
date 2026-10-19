import { PRESET_RECIPES, PRESET_MENUS } from "../data/presets.js";
import { mondayISO, createId } from "./format.js";
import { applyDeltas, consumptionForRecipe } from "../engine/pantry.js";
import { sanitizePantryItem, sanitizeRecipe, sanitizeNote, sanitizeWater } from "./validate.js";

const STORAGE_KEY = "our-table-demo-v2";
const EVENT = "our-table-demo-change";

const clone = value => JSON.parse(JSON.stringify(value));

function seedState() {
  const weekStart = mondayISO();
  const recipes = PRESET_RECIPES.map(recipe => ({ ...recipe, householdId: null, isPreset: true }));
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));

  const assignments = [];
  const addMenu = (menuIndex, day) => {
    const menu = PRESET_MENUS[menuIndex];
    if (!menu) return;
    for (const [slot, entry] of Object.entries(menu.items)) {
      if (entry.both) assignments.push({ day, slot, personKey: "both", recipeId: entry.both });
      else {
        if (entry.R) assignments.push({ day, slot, personKey: "R", recipeId: entry.R });
        if (entry.I) assignments.push({ day, slot, personKey: "I", recipeId: entry.I });
      }
    }
  };

  // A lived-in sample week so the preview shows the whole app working.
  [0, 1, 2, 3, 4, 5, 6].forEach(day => addMenu(day, day));
  const validAssignments = assignments.filter(row => byId.has(row.recipeId));

  const pantry = [
    { key: "olive-oil", nameEn: "Olive oil", nameLt: "Alyvuogių aliejus", unit: "g", quantity: 260, lowThreshold: 120 },
    { key: "eggs", nameEn: "Eggs", nameLt: "Kiaušiniai", unit: "vnt", quantity: 2, lowThreshold: 3 },
    { key: "natural-tofu", nameEn: "Natural tofu", nameLt: "Natūralus tofu", unit: "g", quantity: 400, lowThreshold: 150 },
    { key: "tomato", nameEn: "Tomato", nameLt: "Pomidoras", unit: "g", quantity: 180, lowThreshold: 200 },
    { key: "brown-rice", nameEn: "Brown rice", nameLt: "Rudieji ryžiai", unit: "g", quantity: 500, lowThreshold: 150 },
    { key: "tahini-paste", nameEn: "Tahini paste", nameLt: "Sezamų pasta", unit: "g", quantity: 45, lowThreshold: 60 },
    { key: "lactose-free-yogurt-2-5", nameEn: "Lactose-free yogurt 2.5%", nameLt: "Jogurtas be laktozės 2,5%", unit: "g", quantity: 400, lowThreshold: 200 },
    { key: "gf-bread", nameEn: "GF bread", nameLt: "Duona be glitimo", unit: "g", quantity: 160, lowThreshold: 80 },
    { key: "broccoli", nameEn: "Broccoli", nameLt: "Brokolis", unit: "g", quantity: 250, lowThreshold: 150 },
    { key: "canned-chickpeas", nameEn: "Canned chickpeas", nameLt: "Avinžirniai (konservuoti)", unit: "g", quantity: 240, lowThreshold: 100 },
  ];

  return {
    version: 2,
    household: {
      id: "demo-household",
      name: "Demo kitchen",
      inviteCode: "DEMO01",
      extraPortions: 0,
    },
    profiles: [
      { id: "demo-user", householdId: "demo-household", personKey: "R", displayName: "Regita" },
      { id: "demo-partner", householdId: "demo-household", personKey: "I", displayName: "Ieva" },
    ],
    recipes,
    assignments: validAssignments,
    eaten: [],
    water: [],
    notes: [
      { recipeId: "rice-bowl-with-edamame-tahini", personKey: "both", note: "A little more tahini next time — so good." },
    ],
    shoppingChecks: [],
    pantry,
    weekStart,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.recipes)) {
      const seeded = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return parsed;
  } catch {
    return seedState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private mode — the app still works in memory.
  }
}

export function createDemoBackend() {
  let state = loadState();
  const listeners = new Set();
  let context = { householdId: state.household.id, personKey: "R", userId: "demo-user" };

  const emit = () => {
    saveState(state);
    listeners.forEach(fn => fn());
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", event => {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      listeners.forEach(fn => fn());
    });
  }

  const session = { user: { id: "demo-user", email: "demo@local" } };

  const getProfile = () => state.profiles.find(p => p.id === "demo-user") || null;

  const fullState = () => ({
    household: state.household,
    profiles: state.profiles,
    recipes: state.recipes,
    assignments: state.assignments,
    eaten: state.eaten.filter(row => row.eaten),
    water: state.water,
    notes: state.notes,
    shoppingChecks: state.shoppingChecks.filter(row => row.weekStart === mondayISO()),
    pantry: state.pantry,
  });

  const findEaten = (day, slot, personKey) =>
    state.eaten.find(row => row.day === day && row.slot === slot && row.personKey === personKey);

  const restoreEaten = (day, slot, personKey) => {
    const row = findEaten(day, slot, personKey);
    if (!row || !row.eaten) return;
    if (Array.isArray(row.applied)) state.pantry = applyDeltas(state.pantry, row.applied.map(i => ({ itemKey: i.itemKey, delta: -i.delta })));
    row.eaten = false;
    row.applied = null;
  };

  return {
    mode: "demo",
    demo: true,

    async getSession() { return session; },
    onAuthChange(cb) { cb(session); return () => {}; },
    async signIn() { return { session }; },
    async signUp() { return { needsConfirmation: false }; },
    async signOut() { return; },
    async getUser() { return session.user; },

    setContext(ctx) { context = { ...context, ...ctx }; },
    async getProfile() { return getProfile(); },
    async createHousehold(name) {
      state.household.name = String(name || "Our kitchen").slice(0, 80);
      emit();
      return getProfile();
    },
    async joinHousehold() { return getProfile(); },

    async loadAll() {
      return clone(fullState());
    },

    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    async saveRecipe(input) {
      const { ok, errors, recipe } = sanitizeRecipe(input, { existingId: input?.id });
      if (!ok) throw Object.assign(new Error("Invalid recipe"), { errors });
      const existing = state.recipes.find(r => r.id === recipe.id);
      const next = { ...recipe, householdId: state.household.id, isPreset: false, updatedAt: new Date().toISOString() };
      if (existing && existing.householdId === null) {
        next.id = `${recipe.id}-${Math.random().toString(36).slice(2, 6)}`;
      }
      state.recipes = [...state.recipes.filter(r => r.id !== next.id), next];
      emit();
      return clone(next);
    },

    async deleteRecipe(id) {
      const target = state.recipes.find(r => r.id === id);
      if (!target || target.householdId === null) throw new Error("Library recipes are read-only");
      state.recipes = state.recipes.filter(r => r.id !== id);
      // Planned meals keep a snapshot so the plan never breaks.
      state.assignments = state.assignments.filter(row => row.recipeId !== id);
      emit();
      return true;
    },

    async clearSlot(day, slot) {
      state.eaten.filter(row => row.day === day && row.slot === slot)
        .forEach(row => restoreEaten(day, slot, row.personKey));
      state.eaten = state.eaten.filter(row => !(row.day === day && row.slot === slot));
      emit();
    },

    async clearDay(day) {
      for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
        state.eaten.filter(row => row.day === day && row.slot === slot)
          .forEach(row => restoreEaten(day, slot, row.personKey));
      }
      state.eaten = state.eaten.filter(row => row.day !== day);
      emit();
    },

    async setSlot(day, slot, rows) {
      state.eaten.filter(row => row.day === day && row.slot === slot)
        .forEach(row => restoreEaten(day, slot, row.personKey));
      state.assignments = state.assignments.filter(row => !(row.day === day && row.slot === slot));
      for (const row of rows || []) {
        if (row.recipeId) state.assignments.push({ day, slot, personKey: row.personKey, recipeId: row.recipeId });
      }
      state.eaten = state.eaten.filter(row => !(row.day === day && row.slot === slot));
      emit();
      return true;
    },

    async applyMenu(day, menu) {
      for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
        state.eaten.filter(row => row.day === day && row.slot === slot)
          .forEach(row => restoreEaten(day, slot, row.personKey));
        const entry = menu.items[slot];
        state.assignments = state.assignments.filter(row => !(row.day === day && row.slot === slot));
        if (!entry) continue;
        if (entry.both) state.assignments.push({ day, slot, personKey: "both", recipeId: entry.both });
        else {
          if (entry.R) state.assignments.push({ day, slot, personKey: "R", recipeId: entry.R });
          if (entry.I) state.assignments.push({ day, slot, personKey: "I", recipeId: entry.I });
        }
      }
      state.eaten = state.eaten.filter(row => row.day !== day);
      emit();
      return true;
    },

    async toggleEaten({ day, slot, personKey, factor = 1, recipeId = null }) {
      const recipe = state.recipes.find(r => r.id === recipeId) || null;
      const existing = findEaten(day, slot, personKey);
      if (existing?.eaten) {
        restoreEaten(day, slot, personKey);
        emit();
        return false;
      }
      const applied = consumptionForRecipe(recipe, factor);
      state.pantry = applyDeltas(state.pantry, applied);
      state.eaten = state.eaten.filter(row => !(row.day === day && row.slot === slot && row.personKey === personKey));
      state.eaten.push({ day, slot, personKey, eaten: true, applied, recipeId });
      emit();
      return true;
    },

    async setWater(day, personKey, ml) {
      const value = sanitizeWater(ml);
      const row = state.water.find(r => r.day === day && r.personKey === personKey);
      if (row) row.ml = value;
      else state.water.push({ day, personKey, ml: value });
      emit();
      return value;
    },

    async saveNote(recipeId, personKey, note) {
      const value = sanitizeNote(note);
      state.notes = state.notes.filter(row => !(row.recipeId === recipeId && row.personKey === personKey));
      if (value) state.notes.push({ recipeId, personKey, note: value });
      emit();
      return value;
    },

    async setShoppingChecked(weekStart, itemKey, checked) {
      state.shoppingChecks = state.shoppingChecks.filter(row => !(row.weekStart === weekStart && row.itemKey === itemKey));
      if (checked) state.shoppingChecks.push({ weekStart, itemKey, checked: true });
      emit();
      return checked;
    },

    async clearShoppingChecks(weekStart) {
      state.shoppingChecks = state.shoppingChecks.filter(row => row.weekStart !== weekStart);
      emit();
    },

    async savePantryItem(input) {
      const { ok, item } = sanitizePantryItem(input);
      if (!ok) throw new Error("Invalid pantry item");
      const itemKey = `${item.key}|${item.unit}`;
      state.pantry = state.pantry.filter(row => `${row.key}|${row.unit}` !== itemKey);
      state.pantry.push({ ...item, itemKey });
      emit();
      return clone(item);
    },

    async deletePantryItem(itemKey) {
      state.pantry = state.pantry.filter(row => `${row.key}|${row.unit}` !== itemKey);
      emit();
      return true;
    },

    async stockPantry(items) {
      for (const input of items) {
        const { ok, item } = sanitizePantryItem(input);
        if (!ok) continue;
        const itemKey = `${item.key}|${item.unit}`;
        const existing = state.pantry.find(row => `${row.key}|${row.unit}` === itemKey);
        if (existing) existing.quantity = Math.round((Number(existing.quantity) + Number(item.quantity)) * 10) / 10;
        else state.pantry.push({ ...item, itemKey });
      }
      emit();
      return state.pantry.length;
    },

    async setExtraPortions(value) {
      state.household.extraPortions = Math.max(0, Math.min(8, Math.round(Number(value) || 0)));
      emit();
      return state.household.extraPortions;
    },

    async updateHousehold(patch = {}) {
      if (patch.name) state.household.name = String(patch.name).slice(0, 80);
      if (patch.extraPortions !== undefined) {
        state.household.extraPortions = Math.max(0, Math.min(8, Math.round(Number(patch.extraPortions) || 0)));
      }
      emit();
      return clone(state.household);
    },

    async updateProfile(patch = {}) {
      const profile = getProfile();
      if (profile && patch.displayName) profile.displayName = String(patch.displayName).slice(0, 40);
      emit();
      return clone(profile);
    },

    async resetWeek() {
      state.eaten.filter(row => row.eaten).forEach(row => restoreEaten(row.day, row.slot, row.personKey));
      state.assignments = [];
      state.eaten = [];
      state.water = [];
      state.shoppingChecks = [];
      state.notes = [];
      emit();
      return true;
    },

    generateId: prefix => createId(prefix),
  };
}
