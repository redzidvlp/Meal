import { ALL_TAGS, SLOTS, UNITS } from "../theme.js";
import { findForbiddenIngredients, ingredientKey, slugify } from "./ingredients.js";
import { clamp } from "./format.js";

export const LIMITS = {
  name: 120,
  ingredientName: 80,
  method: 4000,
  note: 500,
  ingredients: 40,
  tags: 8,
  emoji: 8,
  search: 80,
};

export function cleanText(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanMultiline(value, max = LIMITS.method) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

export function toNumber(value, min, max, fallback = 0) {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n * 10) / 10, min, max);
}

export function sanitizeEmoji(value) {
  const raw = cleanText(value, 32);
  if (!raw) return "🍽️";
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      const first = segmenter.segment(raw)[Symbol.iterator]().next();
      if (first.value?.segment) return first.value.segment.slice(0, 12);
    }
  } catch {
    // Fall through to code-point slicing.
  }
  return Array.from(raw).slice(0, 2).join("");
}

export function sanitizeIngredient(input) {
  const en = cleanText(input?.en, LIMITS.ingredientName);
  const lt = cleanText(input?.lt, LIMITS.ingredientName);
  if (!en) return null;
  return {
    key: ingredientKey(en),
    en,
    lt: lt || en,
    amount: toNumber(input?.amount, 0.1, 5000, 0),
    unit: UNITS.includes(input?.unit) ? input.unit : "g",
  };
}

const RECIPE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function sanitizeRecipe(input, { existingId = null } = {}) {
  const errors = {};
  const nameEn = cleanText(input?.name?.en, LIMITS.name);
  const nameLt = cleanText(input?.name?.lt, LIMITS.name) || nameEn;

  if (nameEn.length < 2) errors.nameEn = "nameRequired";

  const ingredients = [];
  const rawIngredients = Array.isArray(input?.ingredients) ? input.ingredients.slice(0, LIMITS.ingredients + 1) : [];
  if (rawIngredients.length > LIMITS.ingredients) errors.ingredients = "tooManyIngredients";
  rawIngredients.slice(0, LIMITS.ingredients).forEach(raw => {
    const ing = sanitizeIngredient(raw);
    if (!ing || ing.amount <= 0) {
      if (!errors.ingredient) errors.ingredient = "ingredientRequired";
      return;
    }
    ingredients.push(ing);
  });
  if (ingredients.length === 0) errors.ingredients = errors.ingredients || "ingredientsRequired";

  const forbidden = findForbiddenIngredients(
    ingredients.map(i => `${i.en} ${i.lt}`).join(" | "),
  );
  if (forbidden.length) errors.vegetarian = "nonVegetarian";

  const nutrition = {
    kcal: toNumber(input?.kcal, 0, 5000, 0),
    protein: toNumber(input?.protein, 0, 500, 0),
    carbs: toNumber(input?.carbs, 0, 800, 0),
    fat: toNumber(input?.fat, 0, 500, 0),
  };
  if (nutrition.kcal === 0) errors.kcal = "invalidNumber";
  if (nutrition.protein === 0 && nutrition.carbs === 0 && nutrition.fat === 0) errors.kcal = "invalidNumber";

  const tags = [...new Set(
    (Array.isArray(input?.tags) ? input.tags : [])
      .filter(tag => ALL_TAGS.includes(tag) && tag !== "vegetarian")
      .slice(0, LIMITS.tags),
  )];
  tags.unshift("vegetarian");

  let id = existingId && RECIPE_ID_RE.test(existingId) ? existingId : null;
  if (!id) {
    const base = (slugify(nameEn) || "recipe").slice(0, 60);
    id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const recipe = {
    id,
    name: { en: nameEn, lt: nameLt },
    emoji: sanitizeEmoji(input?.emoji),
    slot: SLOTS.includes(input?.slot) ? input.slot : "lunch",
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    ingredients,
    method: {
      en: cleanMultiline(input?.method?.en, LIMITS.method),
      lt: cleanMultiline(input?.method?.lt, LIMITS.method) || cleanMultiline(input?.method?.en, LIMITS.method),
    },
    tags,
    vegetarian: true,
    prepMinutes: Math.round(toNumber(input?.prepMinutes, 0, 600, 15)),
    householdId: input?.householdId || null,
  };

  return { ok: Object.keys(errors).length === 0, errors, recipe };
}

const PANTRY_KEY_RE = /^[a-z0-9-]{1,80}$/;

export function sanitizePantryItem(input) {
  const nameEn = cleanText(input?.nameEn ?? input?.name?.en, LIMITS.ingredientName);
  if (!nameEn) return { ok: false, errors: { nameEn: "required" } };
  const nameLt = cleanText(input?.nameLt ?? input?.name?.lt, LIMITS.ingredientName) || nameEn;
  const unit = UNITS.includes(input?.unit) ? input.unit : "g";
  const providedKey = input?.key || input?.itemKey;
  const key = providedKey && PANTRY_KEY_RE.test(providedKey) ? providedKey : ingredientKey(nameEn);
  const item = {
    key,
    nameEn,
    nameLt,
    unit,
    quantity: toNumber(input?.quantity, 0, 100000, 0),
    lowThreshold: toNumber(input?.lowThreshold, 0, 100000, unit === "vnt" ? 2 : 100),
  };
  return { ok: true, errors: {}, item };
}

export function sanitizeNote(value) {
  return cleanText(value, LIMITS.note);
}

export function sanitizeWater(value) {
  return Math.round(toNumber(value, 0, 5000, 0));
}

export function sanitizeInviteCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function sanitizeSearch(value) {
  return cleanText(value, LIMITS.search).toLocaleLowerCase();
}

export function isInviteCode(value) {
  return /^[A-Z0-9]{6}$/.test(sanitizeInviteCode(value));
}


const MENU_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_MENU_ITEMS_BYTES = 6000;

/** Validates a reusable full-day menu. Preset menus can be edited by storing an override. */
export function sanitizeMenu(input, { existingId = null } = {}) {
  const errors = {};
  const nameEn = cleanText(input?.name?.en, LIMITS.name);
  const nameLt = cleanText(input?.name?.lt, LIMITS.name) || nameEn;
  if (!nameEn) errors.name = "required";

  const items = {};
  const rawItems = input?.items && typeof input.items === "object" ? input.items : {};
  for (const slot of SLOTS) {
    const entry = rawItems[slot];
    if (!entry || typeof entry !== "object") continue;
    if (entry.both) {
      if (!MENU_ID_RE.test(String(entry.both))) { errors.items = "invalidRecipe"; continue; }
      items[slot] = { both: entry.both };
      continue;
    }
    const row = {};
    if (entry.R && MENU_ID_RE.test(String(entry.R))) row.R = entry.R;
    if (entry.I && MENU_ID_RE.test(String(entry.I))) row.I = entry.I;
    if (Object.keys(row).length) items[slot] = row;
  }
  if (Object.keys(items).length === 0) errors.items = "emptyMenu";
  if (JSON.stringify(items).length > MAX_MENU_ITEMS_BYTES) errors.items = "tooLarge";

  let id = existingId && MENU_ID_RE.test(existingId) ? existingId : null;
  if (!id) {
    const base = (slugify(nameEn) || "menu").slice(0, 56);
    id = `menu-${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const presetKey = input?.presetKey && MENU_ID_RE.test(input.presetKey) ? input.presetKey : null;

  const menu = {
    id,
    presetKey,
    name: { en: nameEn, lt: nameLt },
    emoji: sanitizeEmoji(input?.emoji),
    items,
    diff: ["breakfast", "lunch", "snack", "dinner"].some(slot => items[slot] && !items[slot].both),
  };

  return { ok: Object.keys(errors).length === 0, errors, menu };
}

const PHOTO_DATA_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_BYTES = 1_800_000; // ~1.3 MB of image data

/** Returns a narrow, validated payload for the photo analysis function. */
export function sanitizePhotoPayload(input) {
  const image = typeof input?.image === "string" ? input.image.trim() : "";
  const mode = input?.mode === "label" ? "label" : "meal";
  if (!PHOTO_DATA_RE.test(image)) return { ok: false, error: "invalidImage" };
  if (image.length > MAX_PHOTO_BYTES) return { ok: false, error: "imageTooLarge" };
  return { ok: true, payload: { image, mode } };
}
