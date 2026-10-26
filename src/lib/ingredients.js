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

/**
 * A plant product may legitimately carry a meat word: "vegan meat",
 * "plant-based steak", "soy mince", "veganiška mėsa". The qualifier is what
 * makes it vegetarian. Without one the very same word is still a real ban, so
 * "chicken" or "beef" alone is rejected exactly as before.
 */
const LETTERS = "a-ząčęėįšųūž";
const PLANT_QUALIFIER = new RegExp(
  `(?:^|[^${LETTERS}])(?:vegan[${LETTERS}]*|plant[\\s-]?based|plant[\\s-]?protein[${LETTERS}]*|augalin[${LETTERS}]*|be\\s*m[eė]sos|meat[\\s-]?free|meatless|vegetarian|vegetari[${LETTERS}]*|veggie|faux|mock|imitation|soy|soya|soj[${LETTERS}]*|pea[\\s-]?protein|mycoprotein|quorn)\\s*$`,
  "iu",
);
// "meat-free mince": the qualifier follows the word instead.
const PLANT_SUFFIX = new RegExp(`^\\s*[- ]?free(?:[^${LETTERS}]|$)`, "iu");

// Word-prefix matching catches inflected Lithuanian forms (mėsa → mėsos)
// without matching inside unrelated words.
export function findForbiddenIngredients(text) {
  if (!text) return [];
  const normalized = String(text).toLocaleLowerCase();
  const hits = new Set();
  for (const term of FORBIDDEN_INGREDIENTS) {
    const pattern = new RegExp(`(^|[^a-ząčęėįšųūž])${escapeRe(term)}`, "giu");
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      // Look at what was written just before the meat word.
      const before = normalized.slice(0, match.index + match[1].length);
      const after = normalized.slice(match.index + match[0].length);
      if (PLANT_QUALIFIER.test(before) || PLANT_SUFFIX.test(after)) continue;
      hits.add(term);
      break;
    }
  }
  return [...hits];
}
