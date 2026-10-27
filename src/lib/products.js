import { slugify } from "./ingredients.js";

/**
 * A product the household actually buys — "Veganiški pjausniai kumpio
 * stiliaus", a particular spread, a protein yoghurt. Its numbers come straight
 * from the package, so a meal built around it lands on the real calories
 * instead of a guess.
 *
 * Everything is stored per 100 g/ml, the same basis as the built-in table,
 * because that is the only way the engine can scale an amount.
 */

const NOT_LETTER = "(?![a-ząčęėįšųūž])";
const ENERGY_WORDS = new RegExp(`^(energin[ėe]\\s*vert[ėe]|energija|energy|calories|kalorijos|energie)${NOT_LETTER}`, "u");
const FAT_WORDS = new RegExp(`^(riebalai|fat|total\\s+fat|fett)${NOT_LETTER}`, "u");
const SATURATES_WORDS = /^(so[čc]iosios|iš\s*jų\s*so[čc]iosios|of\s+which\s+saturat|saturat|mono|poly)/u;
const CARB_WORDS = /^(angliavandeniai|angl\.|carboh|kohlenhydrate|kohlenhydrate)/u;
const SUGAR_WORDS = /^(cukr[ūu]s|cukr[ūu]?|sugars?|of\s+which\s+sugars?|davon\s+zucker)/u;
const PROTEIN_WORDS = /^(baltymai|protein|eiweiß|eiweiss)/u;
const SALT_WORDS = new RegExp(`^(druska|salt|salz)${NOT_LETTER}`, "u");
const FIBRE_WORDS = /^(skaidulos|skaidul[ųu]|fibre|fiber|ballaststoffe)/u;

const NUMBER = "([0-9]+(?:[.,][0-9]+)?)";
const toNumber = value => {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** First number on a line, ignoring the "of which" sub-lines. */
function firstNumber(line) {
  const match = line.match(new RegExp(NUMBER));
  return match ? toNumber(match[1]) : 0;
}

/** "80 g" in the product name is the pack size, not a nutrient. */
function packFromName(line) {
  const match = line.match(/(\d{2,4})\s*(?:g|ml|gram[ųu]?)\b/iu);
  return match ? toNumber(match[1]) : 0;
}

const stripMarkdown = value => String(value || "")
  .replace(/[*_`#>|]/g, " ")
  .replace(/\u00a0/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** "220 kcal" wins over "922 kJ" when a label prints both. */
function energyFrom(line) {
  const kcal = line.match(new RegExp(`${NUMBER}\\s*(?:kcal|kalorij|cal)`, "iu"));
  if (kcal) return { kcal: toNumber(kcal[1]), fromKj: false };
  const kj = line.match(new RegExp(`${NUMBER}\\s*kj`, "iu"));
  if (kj) return { kcal: Math.round((toNumber(kj[1]) / 4.184) * 10) / 10, fromKj: true };
  // "Energinė vertė 922 / 220" with the units on the header line only.
  const plain = line.match(new RegExp(NUMBER, "g"));
  return plain ? { kcal: toNumber(plain[1]), fromKj: false } : { kcal: 0, fromKj: false };
}

/**
 * Reads a pasted nutrition label, English or Lithuanian, with or without the
 * markdown a shop page carries. Only the four numbers the engine needs are
 * kept — saturated fat, sugars and salt do not change the calorie fit.
 */
export function parseNutritionLabel(text) {
  const raw = String(text || "");
  const lines = raw
    .split(/\r?\n/)
    .map(line => stripMarkdown(line.replace(/<\/?[a-z][^>]*>/gi, " ")))
    .filter(Boolean);

  const result = { name: "", portionGrams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fromKj: false, found: [] };
  if (!lines.length) return result;

  // The product name is the first line that is not a number or a nutrient row.
  const nameIndex = lines.findIndex(line => (
    !/^[\d.,\s]+$/.test(line)
    && !ENERGY_WORDS.test(line.toLowerCase())
    && !FAT_WORDS.test(line.toLowerCase())
  ));
  const nameLine = nameIndex >= 0 ? lines[nameIndex] : "";
  if (nameLine) {
    const lower = nameLine.toLowerCase();
    if (!/maistin[ėe]\s*vert|nutrition|per\s+100/.test(lower)) {
      result.name = nameLine.replace(/[,;]?\s*\d{2,4}\s*(?:g|ml)\s*$/iu, "").trim().slice(0, 60);
      result.portionGrams = packFromName(nameLine);
    }
  }

  // "per 100 g" or "per portion" decides the basis; a per-portion label is
  // converted so everything downstream stays per 100 g.
  const basisLine = lines.find(line => /100\s*(?:g|ml)/i.test(line)) || "";
  const portionBasis = !basisLine && lines.find(line => /(porcij|portion|serving|vnt|piece)/i.test(line));
  let basis = 100;
  if (portionBasis) {
    const grams = portionBasis.match(/(\d{2,4})\s*(?:g|ml)/i);
    basis = grams ? toNumber(grams[1]) : 100;
    const count = Number((portionBasis.match(/(?:\d+\s*(?:vnt|piece|slices?))/i) || [""])[0].match(/\d+/)?.[0]) || 1;
    basis = Math.max(1, Math.round(basis / Math.max(1, count)));
  }
  const scale = 100 / basis;

  for (const [index, line] of lines.entries()) {
    // "Protein yoghurt" is a name, not a nutrient row.
    if (index === nameIndex) continue;
    const lower = line.toLowerCase();
    if (ENERGY_WORDS.test(lower)) {
      const energy = energyFrom(line);
      if (energy.kcal > 0) {
        result.kcal = energy.kcal;
        result.fromKj = energy.fromKj;
        result.found.push("kcal");
      }
      continue;
    }
    if (SATURATES_WORDS.test(lower)) continue;
    if (SUGAR_WORDS.test(lower)) continue;
    if (SALT_WORDS.test(lower)) continue;
    if (FAT_WORDS.test(lower)) { result.fat = firstNumber(line); result.found.push("fat"); continue; }
    if (CARB_WORDS.test(lower)) { result.carbs = firstNumber(line); result.found.push("carbs"); continue; }
    if (PROTEIN_WORDS.test(lower)) { result.protein = firstNumber(line); result.found.push("protein"); continue; }
    if (FIBRE_WORDS.test(lower)) { result.found.push("fibre"); continue; }
  }

  // A per-portion label ("per slice 35 g") must be scaled up to 100 g.
  if (scale !== 1) {
    result.kcal = Math.round(result.kcal * scale);
    result.fat = Math.round(result.fat * scale * 10) / 10;
    result.carbs = Math.round(result.carbs * scale * 10) / 10;
    result.protein = Math.round(result.protein * scale * 10) / 10;
  }

  // A label that only lists macros still gives a calorie figure; and when the
  // printed energy disagrees badly with the macros, the macros are the safer
  // basis for a meal calculation.
  const fromMacros = result.protein * 4 + result.carbs * 4 + result.fat * 9;
  if (!result.kcal && fromMacros > 0) result.kcal = Math.round(fromMacros);
  else if (result.kcal > 0 && fromMacros > 0 && Math.abs(fromMacros - result.kcal) > result.kcal * 0.3) {
    result.kcal = Math.round(fromMacros);
    result.kcalFromMacros = true;
  }
  result.kcal = Math.round(result.kcal);
  result.found = [...new Set(result.found)];
  return result;
}

/**
 * How a product gets used in a kitchen. A sliced product belongs in a sandwich
 * or on a pizza; a block of tofu belongs in a pan. The generator asks the
 * question once, when the product is saved, and never stews a slice.
 */
export const PRODUCT_USES = [
  { key: "sandwich", icon: "🥪", en: "Sandwich", lt: "Sumuštinis" },
  { key: "wrap", icon: "🌯", en: "Wrap", lt: "Tortilija" },
  { key: "pizza", icon: "🍕", en: "Pizza", lt: "Pica" },
  { key: "salad", icon: "🥗", en: "Salad", lt: "Salotos" },
  { key: "bowl", icon: "🍚", en: "Bowl", lt: "Dubenėlis" },
  { key: "pasta", icon: "🍝", en: "Pasta", lt: "Makaronai" },
  { key: "soup", icon: "🍲", en: "Stew / soup", lt: "Troškinys / sriuba" },
  { key: "pan", icon: "🍳", en: "Pan-fried", lt: "Kepta keptuvėje" },
  { key: "bake", icon: "🔥", en: "Oven", lt: "Orkaitė" },
  { key: "breakfast", icon: "🥞", en: "Breakfast", lt: "Pusryčiai" },
  { key: "cold", icon: "🧊", en: "Cold, no cooking", lt: "Šaltai, be virimo" },
  { key: "sweet", icon: "🍰", en: "Sweet", lt: "Saldumynai" },
];

const USE_KEYS = new Set(PRODUCT_USES.map(use => use.key));
export const useLabel = (key, lang = "en") => {
  const found = PRODUCT_USES.find(use => use.key === key);
  return found ? (lang === "lt" ? found.lt : found.en) : key;
};

const round1 = value => Math.round((Number(value) || 0) * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

/**
 * Which slot in a recipe template this product can fill. Derived from the
 * macros so the person never has to answer a nutrition question.
 */
export function productGroup(fact) {
  if (!fact) return "protein";
  if (fact.fat >= 30) return "fat";
  if (fact.protein >= 12) return "protein";
  if (fact.carbs >= 40) return "carb";
  return "veg";
}

/** Turns a saved product row into the same shape as INGREDIENT_FACTS entries. */
export function productFact(product) {
  if (!product || !product.key) return null;
  const kcal = clamp(product.kcal, 0, 900);
  const protein = clamp(product.protein, 0, 100);
  const carbs = clamp(product.carbs, 0, 100);
  const fat = clamp(product.fat, 0, 100);
  const name = product.nameEn || product.name?.en || product.name || product.key;
  const nameLt = product.nameLt || product.name?.lt || name;
  // A dish title reads better with "Veganiški pjausniai" than with the whole
  // packaging name, so cut on a word boundary rather than mid-word.
  const short = value => {
    if (value.length <= 26) return value;
    const words = value.split(" ");
    let out = "";
    for (const word of words) {
      if ((out ? `${out} ${word}` : word).length > 26) break;
      out = out ? `${out} ${word}` : word;
    }
    return out || `${value.slice(0, 25)}…`;
  };
  const fact = {
    key: product.key,
    en: name,
    lt: nameLt,
    shortEn: short(name),
    shortLt: short(nameLt),
    kcal,
    protein,
    carbs,
    fat,
    unit: product.unit === "ml" || product.unit === "vnt" ? product.unit : "g",
    foo: true,
    product: true,
    portion: Number(product.portionGrams) || 0,
    vegan: false,
    glutenFree: false,
    // A household product has no FODMAP certification; leave the filter honest.
    fodmap: false,
    uses: Array.isArray(product.uses) ? product.uses.filter(use => USE_KEYS.has(use)) : [],
  };
  fact.group = productGroup(fact);
  return fact;
}

export function sanitizeProduct(input) {
  const nameEn = stripMarkdown(input?.nameEn || input?.name?.en || "").slice(0, 60);
  const nameLt = stripMarkdown(input?.nameLt || input?.name?.lt || nameEn).slice(0, 60) || nameEn;
  if (nameEn.length < 1) return { ok: false, errors: { name: "required" } };
  const kcal = Math.round(clamp(input?.kcal, 0, 900));
  const protein = round1(clamp(input?.protein, 0, 100));
  const carbs = round1(clamp(input?.carbs, 0, 100));
  const fat = round1(clamp(input?.fat, 0, 100));
  if (kcal <= 0 && protein + carbs + fat <= 0) return { ok: false, errors: { kcal: "invalidNumber" } };
  const unit = ["g", "ml", "vnt"].includes(input?.unit) ? input.unit : "g";
  const keyBase = slugify(input?.key || nameEn).replace(/^p-/, "").slice(0, 34) || "product";
  const key = `p-${keyBase}`;
  return {
    ok: true,
    errors: {},
    product: {
      key,
      nameEn,
      nameLt,
      kcal: kcal || Math.round(protein * 4 + carbs * 4 + fat * 9),
      protein,
      carbs,
      fat,
      unit,
      portionGrams: clamp(input?.portionGrams, 0, 2000) || 0,
      uses: [...new Set((Array.isArray(input?.uses) ? input.uses : [])
        .filter(use => USE_KEYS.has(use)))].slice(0, 8),
    },
  };
}
