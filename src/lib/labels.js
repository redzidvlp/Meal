import { ALL_TAGS, TAG_LABELS } from "../theme.js";
import { slugify } from "./ingredients.js";

export const CUSTOM_PREFIX = "x-";
export const MAX_LABEL_LENGTH = 24;

/** Label keys are slugs so they stay safe as database keys and array values. */
export function labelKey(raw) {
  return slugify(String(raw || "").slice(0, MAX_LABEL_LENGTH)).slice(0, 32);
}

export function customTag(key) {
  return `${CUSTOM_PREFIX}${labelKey(key)}`;
}

export function isCustomTag(tag) {
  return typeof tag === "string" && tag.startsWith(CUSTOM_PREFIX);
}

export function customKeyFromTag(tag) {
  return isCustomTag(tag) ? tag.slice(CUSTOM_PREFIX.length) : "";
}

/** A label can be any of the built-in tags or one the household created. */
export function isKnownTag(tag, labels = []) {
  if (ALL_TAGS.includes(tag)) return true;
  if (!isCustomTag(tag)) return false;
  const key = customKeyFromTag(tag);
  return (labels || []).some(label => label.key === key);
}

export function tagLabel(tag, lang, labels = []) {
  if (!tag) return "";
  if (isCustomTag(tag)) {
    const key = customKeyFromTag(tag);
    const found = (labels || []).find(label => label.key === key);
    return found?.label || key.replace(/-/g, " ");
  }
  return TAG_LABELS[lang]?.[tag] || TAG_LABELS.en?.[tag] || tag;
}

/** Labels present on a list of recipes, so filters only offer something useful. */
export function tagsInUse(recipes = [], labels = []) {
  const counts = new Map();
  for (const recipe of recipes) {
    for (const tag of recipe.tags || []) {
      if (tag === "vegetarian") continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const builtIn = [...counts.keys()].filter(tag => ALL_TAGS.includes(tag));
  const custom = (labels || []).filter(label => counts.has(customTag(label.key)));
  return { builtIn, custom, counts };
}
