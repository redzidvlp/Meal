const KEY_OVERRIDES = {
  egg: "eggs",
  tofu: "natural-tofu",
  "avocado (¼)": "avocado",
  "avocado (1/4)": "avocado",
};

export function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/%/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function ingredientKey(en) {
  const lowered = String(en || "").trim().toLowerCase();
  if (KEY_OVERRIDES[lowered]) return KEY_OVERRIDES[lowered];
  return slugify(en) || "ingredient";
}

export function ingredientLabel(ingredient, lang) {
  if (!ingredient) return "";
  return (lang === "lt" ? ingredient.lt : ingredient.en) || ingredient.en || ingredient.lt || "";
}

// Meat, fish and animal-derived non-vegetarian ingredients. Checked against
// every recipe the user writes so this kitchen stays strictly vegetarian.
export const FORBIDDEN_INGREDIENTS = [
  "meat", "chicken", "beef", "pork", "lamb", "turkey", "duck", "bacon", "ham",
  "sausage", "salami", "prosciutto", "chorizo", "steak", "mince", "veal",
  "fish", "salmon", "tuna", "cod", "trout", "shrimp", "prawn", "squid", "octopus",
  "mussel", "clam", "oyster", "crab", "lobster", "anchovy", "sardine", "herring",
  "gelatin", "lard", "bone broth", "meat broth", "chicken stock", "fish sauce",
  "mėsa", "mėsos", "vištiena", "vištienos", "jautiena", "jautienos", "kiauliena",
  "kiaulienos", "ėriena", "ėrienos", "kalakutiena", "antis", "kumpis", "dešra",
  "dešrelės", "lašiniai", "žuvis", "žuvies", "lašiša", "lašišos", "tunas", "menkė",
  "krevetės", "krabas", "midijos", "kalmaras", "sultinys", "želatina",
];

const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-prefix matching catches inflected Lithuanian forms (mėsa → mėsos)
// without matching inside unrelated words.
export function findForbiddenIngredients(text) {
  if (!text) return [];
  const normalized = String(text).toLocaleLowerCase();
  const hits = new Set();
  for (const term of FORBIDDEN_INGREDIENTS) {
    const pattern = new RegExp(`(^|[^a-ząčęėįšųūž])${escapeRe(term)}`, "iu");
    if (pattern.test(normalized)) hits.add(term);
  }
  return [...hits];
}
