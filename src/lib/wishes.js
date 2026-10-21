import { INGREDIENT_FACTS } from "../data/ingredientFacts.js";

/**
 * Turns "I fancy curd, no avocado, something quick" into ingredients the
 * generator can actually build with.
 *
 * Two jobs:
 *   • understand what the person asked for (English or Lithuanian, with the
 *     usual synonyms: curd / cottage cheese / varškė),
 *   • prove afterwards that the result really contains it, so "I want curd"
 *     can never quietly come back as another avocado dish.
 */

const fold = value => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const words = value => fold(value).split(" ").filter(Boolean);

// Extra words people type that are not the stored names.
const EXTRA_ALIASES = {
  curd: ["curd", "curds", "curd cheese", "cottage cheese", "quark", "varske", "varskes", "varške"],
  "natural-tofu": ["tofu", "tofu cubes"],
  eggs: ["egg", "eggs", "kiausiniai", "kiaušiniai", "kiaušinis"],
  "lactose-free-yogurt-2-5": ["yogurt", "yoghurt", "jogurtas"],
  "canned-chickpeas": ["chickpeas", "chickpea", "garbanzo", "avinžirniai", "avinciu"],
  lentils: ["lentil", "lentils", "lešiai", "lesiai"],
  "brown-rice": ["rice", "ryziai", "ryžiai"],
  "gf-pasta": ["pasta", "makaronai"],
  "gf-bread": ["bread", "toast", "duona", "duonos"],
  "gf-rolled-oats": ["oats", "oatmeal", "porridge", "avizos", "avižos"],
  "halloumi-cheese": ["halloumi", "cheese", "suris", "sūris"],
  "sweet-potato": ["sweet potato", "sweet potatoes", "batatai", "batatas"],
  potato: ["potato", "potatoes", "bulves", "bulvės"],
  mushrooms: ["mushroom", "mushrooms", "pievagrybiai"],
  avocado: ["avocado", "avocados", "avokadas", "avokado"],
  tomato: ["tomato", "tomatoes", "pomidoras", "pomidorai"],
  cucumber: ["cucumber", "agurkas", "agurkai"],
  spinach: ["spinach", "špinatai", "spenaciai"],
  broccoli: ["broccoli", "brokolis"],
  carrot: ["carrot", "carrots", "morkos"],
  courgette: ["courgette", "zucchini", "cukinija"],
  feta: ["feta", "feta cheese"],
  "kalamata-olives": ["olives", "alyvuoges", "alyvuogės"],
  banana: ["banana", "bananas", "bananai"],
  berries: ["berries", "berry", "uogos"],
  orange: ["orange", "oranges", "apelsinas"],
  kiwi: ["kiwi", "kivis"],
};

const ALIAS_TO_KEY = (() => {
  const map = new Map();
  const add = (phrase, key) => {
    const clean = fold(phrase);
    if (clean && !map.has(clean)) map.set(clean, key);
  };
  for (const [key, fact] of Object.entries(INGREDIENT_FACTS)) {
    for (const name of [fact.en, fact.lt, fact.shortEn, fact.shortLt, key.replace(/-/g, " ")]) add(name, key);
  }
  for (const [key, list] of Object.entries(EXTRA_ALIASES)) {
    if (!INGREDIENT_FACTS[key]) continue;
    for (const phrase of list) add(phrase, key);
  }
  return map;
})();

const KEY_PHRASES = (() => {
  const map = new Map();
  for (const [phrase, key] of ALIAS_TO_KEY) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(phrase);
  }
  return map;
})();

// Longest phrases first, so "sweet potato" wins over "potato".
const ALIAS_PHRASES = [...ALIAS_TO_KEY.keys()].sort((a, b) => b.length - a.length);

const EXCLUDE_CUES = ["no ", "without ", "skip ", "avoid ", "not ", "minus ", "be ", "nes ", "be"];
const QUICK_PATTERN = /\b(quick|fast|speedy|15|20|25)\b|greit|per 20|iki 20/;

// "sweet potato" is a vegetable, not a dessert.
const SWEET_PATTERN = /\b(sweet|dessert|pudding|cake|mousse|treat|sugary|sald\w*|desert\w*|pyrag\w*)\b/;
const SAVOURY_PATTERN = /\b(savoury|savory|salty|not sweet|nesald\w*)\b/;
const LACTOSE_PATTERN = /\b(lactose|lactosefree|be laktozes|laktozes)\b/;
const DAIRY_FREE_PATTERN = /\b(dairy free|no dairy|be pieno|be pienu|vegan)\b/;

const splitClauses = text => String(text || "")
  .toLowerCase()
  .split(/[,;.]|\band\b|\bwith\b|\bir\b|\bsu\b/)
  .map(fold)
  .filter(Boolean);

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseRegex = (phrase, flags = "") => new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`, flags);

/**
 * @returns {{ raw: string, includes: string[], excludes: string[], quick: boolean }}
 */
export function parseWish(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      raw, includes: [], excludes: [], quick: false,
      course: null, modifiers: { lactoseFree: false, dairyFree: false },
    };
  }

  const includes = new Set();
  const excludes = new Set();

  for (const clause of splitClauses(raw)) {
    // "no avocado", "be svogunų" — anything after the cue in the same clause is
    // a ban, anything before it is a wish.
    const cueIndexes = [];
    for (const cue of EXCLUDE_CUES) {
      const regex = phraseRegex(cue.trim(), "g");
      let match;
      while ((match = regex.exec(clause))) cueIndexes.push(match.index);
    }

    // Longest phrase wins: "sweet potato" must not also count as "potato".
    const found = [];
    for (const phrase of ALIAS_PHRASES) {
      const key = ALIAS_TO_KEY.get(phrase);
      if (!key) continue;
      const regex = phraseRegex(phrase, "g");
      let match;
      while ((match = regex.exec(clause))) {
        found.push({ key, start: match.index, end: match.index + match[0].length, banned: cueIndexes.some(index => index <= match.index) });
      }
    }
    found.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const kept = [];
    for (const item of found) {
      if (kept.some(other => item.start < other.end && other.start < item.end)) continue;
      kept.push(item);
    }
    for (const item of kept) {
      if (item.banned) excludes.add(item.key);
      else includes.add(item.key);
    }
  }

  for (const key of excludes) includes.delete(key);

  // A wish is a sentence, not just a list of ingredients. "lactose free curd
  // sweet" means: a dessert, built on curd. Without this the sugar words were
  // dropped and the app answered with a curd pasta.
  const plain = ` ${fold(raw).replace(/-/g, " ").replace(/\bsweet potato(es)?\b/g, " potato ")} `;
  const sweet = SWEET_PATTERN.test(plain);
  const savoury = !sweet && SAVOURY_PATTERN.test(plain);

  return {
    raw,
    includes: [...includes],
    excludes: [...excludes],
    quick: QUICK_PATTERN.test(plain),
    course: sweet ? "sweet" : savoury ? "savoury" : null,
    modifiers: {
      lactoseFree: LACTOSE_PATTERN.test(plain),
      dairyFree: DAIRY_FREE_PATTERN.test(plain),
    },
  };
}

/** English names to send to the model, e.g. ["Curd cheese"]. */
export const wishIngredientNames = wish =>
  (wish?.includes || []).map(key => INGREDIENT_FACTS[key]?.en).filter(Boolean).slice(0, 5);

const lower = value => fold(value);

/** Only ingredients count: a dish titled "...with curd" but not listing it is a lie. */
const ingredientText = recipe =>
  (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .flatMap(item => [item?.key, item?.en, item?.lt])
    .map(lower)
    .join(" | ");

const phraseIn = (haystack, phrase) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(haystack);

/** True when every ingredient the person asked for is actually in the recipe. */
export function wishSatisfied(recipe, wish) {
  const wanted = wish?.includes || [];
  if (!wanted.length) return true;
  const haystack = ingredientText(recipe);
  return wanted.every(key => {
    const phrases = KEY_PHRASES.get(key) || [key.replace(/-/g, " ")];
    return phrases.some(phrase => phraseIn(haystack, phrase));
  });
}

/** What is missing, for a helpful message rather than a silent substitution. */
export function missingWishIngredients(recipe, wish) {
  const wanted = wish?.includes || [];
  if (!wanted.length) return [];
  return wanted.filter(key => !wishSatisfied(recipe, { includes: [key] }));
}

/** Ingredients the person asked to leave out. */
export function containsExcluded(recipe, wish) {
  const banned = wish?.excludes || [];
  if (!banned.length) return [];
  const haystack = ingredientText(recipe);
  return banned.filter(key => {
    const phrases = KEY_PHRASES.get(key) || [key.replace(/-/g, " ")];
    return phrases.some(phrase => phraseIn(haystack, phrase));
  });
}

/** Short phrases for the chips under the box. */
export function wishChips(wish) {
  if (!wish) return [];
  const chips = [];
  if (wish.course === "sweet") chips.push({ key: "course-sweet", label: "Sweet" });
  if (wish.course === "savoury") chips.push({ key: "course-savoury", label: "Savoury" });
  if (wish.quick) chips.push({ key: "quick", label: "Quick" });
  if (wish.modifiers?.lactoseFree) chips.push({ key: "lactose-free", label: "Lactose-free" });
  if (wish.modifiers?.dairyFree) chips.push({ key: "dairy-free", label: "No dairy" });
  return chips;
}

/** One sentence for the model, so it hears the wish in the person's own words. */
export function wishSummary(wish) {
  if (!wish?.raw) return "";
  const bits = [];
  if (wish.course === "sweet") bits.push("This should be a sweet dish (dessert style)");
  if (wish.course === "savoury") bits.push("This should be savoury");
  if (wish.modifiers?.lactoseFree) bits.push("It must be lactose-free");
  if (wish.modifiers?.dairyFree) bits.push("It must contain no dairy at all");
  if (wish.includes?.length) {
    bits.push(`It must contain ${wish.includes.map(key => INGREDIENT_FACTS[key]?.en || key).join(" and ")}`);
  }
  if (wish.excludes?.length) {
    bits.push(`It must not contain ${wish.excludes.map(key => INGREDIENT_FACTS[key]?.en || key).join(" or ")}`);
  }
  return bits.join(". ");
}

export const wishWordList = value => words(value).slice(0, 8);
