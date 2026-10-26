import { INGREDIENT_FACTS, GROUP_DEFAULT_AMOUNT } from "../data/ingredientFacts.js";
import { SLOTS } from "../theme.js";

// Small deterministic PRNG so a reroll is repeatable for a given seed and tests
// can assert exact output.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];

const round1 = value => Math.round(value * 10) / 10;

const FACT_GROUPS = {
  protein: [],
  carb: [],
  veg: [],
  fat: [],
  fruit: [],
};

for (const [key, fact] of Object.entries(INGREDIENT_FACTS)) {
  if (FACT_GROUPS[fact.group]) FACT_GROUPS[fact.group].push(key);
}

const label = (key, lang = "en") => {
  const fact = INGREDIENT_FACTS[key];
  if (!fact) return "";
  return lang === "lt" ? (fact.shortLt || fact.lt) : (fact.shortEn || fact.en);
};

// Lithuanian needs the instrumental case after "su" (su agurku, su ryžiais).
// Facts carry an explicit form; this fallback covers anything added later.
function ltWith(word) {
  if (!word) return "";
  const w = word.toLowerCase();
  if (w.endsWith("os")) return w.slice(0, -2) + "omis";
  if (w.endsWith("ai")) return w.slice(0, -2) + "ais";
  if (w.endsWith("as")) return w.slice(0, -2) + "u";
  if (w.endsWith("is")) return w.slice(0, -2) + "iu";
  if (w.endsWith("us")) return w.slice(0, -2) + "umi";
  if (w.endsWith("ė")) return w.slice(0, -1) + "e";
  return w;
}

const labelLtIn = key => INGREDIENT_FACTS[key]?.ltIn || ltWith(label(key, "lt"));

const TEMPLATES = {
  breakfast: [
    {
      id: "oats",
      emoji: "🥣",
      en: ({ carb, fruit, fat }) => `${label(fruit)} overnight ${label(carb).toLowerCase()} with ${label(fat).toLowerCase()}`,
      lt: ({ carb, fruit, fat }) => `Naktį brinkintos ${label(carb, "lt").toLowerCase()} su ${labelLtIn(fruit)} ir ${labelLtIn(fat)}`,
      methodEn: parts => `Soak the ${parts.carb} in plant milk overnight. In the morning stir through the ${parts.fruit}, top with ${parts.fat} and a pinch of cinnamon.`,
      methodLt: parts => `Užpilkite ${parts.carbLt} augaliniu pienu ir palikite per naktį. Ryte įmaišykite ${parts.fruitLt}, pabarstykite ${parts.fatIn} ir cinamonu.`,
      pickSet: random => ({ carb: "gf-rolled-oats", protein: "lactose-free-yogurt-2-5", fruit: pick(random, FACT_GROUPS.fruit.filter(key => INGREDIENT_FACTS[key].fodmap)), fat: pick(random, ["chia-seeds", "pumpkin-seeds", "hemp-seeds", "walnuts"]) }),
      amounts: { carb: 50, protein: 150, fruit: 100, fat: 12 },
      prepMinutes: 8,
    },
    {
      id: "smoothie",
      emoji: "🥤",
      en: ({ fruit, protein, fat }) => `${label(fruit)} & ${label(protein).toLowerCase()} breakfast smoothie`,
      lt: ({ fruit, protein, fat }) => `${label(fruit, "lt")} ir ${label(protein, "lt").toLowerCase()} pusryčių kokteilis`,
      methodEn: parts => `Blend the ${parts.fruit}, ${parts.protein} and a splash of plant milk until smooth, then top with ${parts.fat}.`,
      methodLt: parts => `Sutrinkite ${parts.fruitLt}, ${parts.proteinLt} ir šlakelį augalinio pieno iki vientisos masės, pabarstykite ${parts.fatIn}.`,
      pickSet: random => ({ protein: pick(random, ["lactose-free-yogurt-2-5", "natural-tofu", "soy-milk"]), fruit: pick(random, FACT_GROUPS.fruit.filter(key => INGREDIENT_FACTS[key].fodmap)), fat: pick(random, ["chia-seeds", "hemp-seeds", "pumpkin-seeds"]) }),
      amounts: { protein: 150, fruit: 120, fat: 10 },
      prepMinutes: 5,
    },
    {
      id: "eggs-toast",
      emoji: "🍳",
      en: ({ veg, fat }) => `Soft eggs on toast with ${label(veg).toLowerCase()} & ${label(fat).toLowerCase()}`,
      lt: ({ veg, fat }) => `Kiaušiniai ant skrudintos duonos su ${labelLtIn(veg)} ir ${labelLtIn(fat)}`,
      methodEn: parts => `Toast the ${parts.carb}, mash the ${parts.fat} with lemon juice and spread it on top. Fry or boil the eggs and serve with ${parts.veg}.`,
      methodLt: parts => `Paskrudinkite ${parts.carbLt}, sutrinkite ${parts.fatLt} su citrinos sultimis ir užtepkite. Išvirkite arba iškepkite kiaušinius ir patiekite su ${parts.vegIn}.`,
      pickSet: random => ({ carb: "gf-bread", protein: "eggs", veg: pick(random, FACT_GROUPS.veg), fat: "avocado" }),
      amounts: { carb: 60, protein: 100, veg: 80, fat: 45 },
      prepMinutes: 10,
    },
  ],
  lunch: [
    {
      id: "bowl",
      emoji: "🥗",
      en: ({ protein, carb, veg }) => `${label(protein)} & ${label(veg).toLowerCase()} bowl with ${label(carb).toLowerCase()}`,
      lt: ({ protein, carb, veg }) => `${label(protein, "lt")} ir ${label(veg, "lt").toLowerCase()} dubenėlis su ${labelLtIn(carb)}`,
      methodEn: parts => `Cook the ${parts.carb} in salted water. Pan-fry the ${parts.protein} with olive oil and paprika. Arrange with the ${parts.veg}, dress with lemon juice and a spoon of tahini.`,
      methodLt: parts => `Išvirkite ${parts.carbLt} pasūdytame vandenyje. Pakepinkite ${parts.proteinLt} su alyvuogių aliejumi ir paprika. Sudėkite su ${parts.vegLt}, pagardinkite citrinos sultimis ir šaukštu tahini.`,
      pickSet: random => ({ protein: pick(random, ["natural-tofu", "smoked-tofu", "canned-chickpeas", "edamame-in-brine", "lentils"]), carb: pick(random, ["brown-rice", "quinoa", "buckwheat", "millet"]), veg: pick(random, FACT_GROUPS.veg), fat: "tahini-paste" }),
      amounts: { protein: 130, carb: 55, veg: 140, fat: 12 },
      prepMinutes: 20,
    },
    {
      id: "salad",
      emoji: "🥙",
      en: ({ protein, veg, fat }) => `${label(protein)} & ${label(veg).toLowerCase()} lunch salad`,
      lt: ({ protein, veg, fat }) => `${label(protein, "lt")} ir ${label(veg, "lt").toLowerCase()} pietų salotos`,
      methodEn: parts => `Toss the ${parts.veg} with the ${parts.protein}, olive oil and lemon. Add a handful of greens and the ${parts.fat} to finish.`,
      methodLt: parts => `Sumaišykite ${parts.vegLt} su ${parts.proteinLt}, alyvuogių aliejumi ir citrina. Įdėkite žalumynų ir pabaigai ${parts.fatLt}.`,
      pickSet: random => ({ protein: pick(random, ["halloumi-cheese", "canned-chickpeas", "edamame-in-brine", "eggs"]), carb: "quinoa", veg: pick(random, FACT_GROUPS.veg), fat: pick(random, ["pumpkin-seeds", "walnuts", "avocado"]) }),
      amounts: { protein: 120, carb: 40, veg: 150, fat: 15 },
      prepMinutes: 12,
    },
    {
      id: "wrap",
      emoji: "🌯",
      en: ({ protein, veg }) => `${label(protein)} & ${label(veg).toLowerCase()} wrap`,
      lt: ({ protein, veg }) => `Tortilija su ${labelLtIn(protein)} ir ${labelLtIn(veg)}`,
      methodEn: parts => `Spread the ${parts.fat} on the tortilla, fill with ${parts.protein} and ${parts.veg}, roll tightly and toast for a minute per side.`,
      methodLt: parts => `Užtepkite ${parts.fatIn} ant tortilijos, dėkite ${parts.proteinLt} ir ${parts.vegLt}, susukite ir kepinkite po minutę iš abiejų pusių.`,
      pickSet: random => ({ carb: "gf-tortilla", protein: pick(random, ["hummus", "natural-tofu", "canned-chickpeas"]), veg: pick(random, FACT_GROUPS.veg), fat: pick(random, ["avocado", "tahini-paste"]) }),
      amounts: { carb: 65, protein: 110, veg: 100, fat: 30 },
      prepMinutes: 10,
    },
    {
      id: "pasta",
      emoji: "🍝",
      en: ({ protein, veg }) => `${label(protein)} & ${label(veg).toLowerCase()} pasta`,
      lt: ({ protein, veg }) => `Makaronai su ${labelLtIn(protein)} ir ${labelLtIn(veg)}`,
      methodEn: parts => `Boil the ${parts.carb}. Sauté the ${parts.protein} and ${parts.veg} with olive oil, add tomato paste and a splash of pasta water, then toss everything together.`,
      methodLt: parts => `Išvirkite ${parts.carbLt}. Pakepinkite ${parts.proteinLt} ir ${parts.vegLt} su aliejumi, įdėkite pomidorų pastos ir šlakelį makaronų vandens, viską sumaišykite.`,
      pickSet: random => ({ protein: pick(random, ["natural-tofu", "lentils", "halloumi-cheese", "canned-chickpeas"]), carb: "gf-pasta", veg: pick(random, FACT_GROUPS.veg), fat: "olive-oil" }),
      amounts: { protein: 120, carb: 60, veg: 140, fat: 10 },
      prepMinutes: 22,
    },
  ],
  dinner: [
    {
      id: "roast",
      emoji: "🍲",
      en: ({ protein, veg }) => `Roasted ${label(protein).toLowerCase()} with ${label(veg).toLowerCase()}`,
      lt: ({ protein, veg }) => `Keptas ${label(protein, "lt").toLowerCase()} su ${labelLtIn(veg)}`,
      methodEn: parts => `Toss the ${parts.veg} and ${parts.protein} with olive oil, oregano, salt and pepper. Roast at 190°C for 25 minutes and finish with lemon juice.`,
      methodLt: parts => `Sumaišykite ${parts.vegLt} ir ${parts.proteinLt} su aliejumi, raganiukėmis, druska ir pipirais. Kepkite 190°C apie 25 min., baigiant apšlakstykite citrinos sultimis.`,
      pickSet: random => ({ protein: pick(random, ["smoked-tofu", "natural-tofu", "halloumi-cheese", "canned-chickpeas"]), carb: "brown-or-black-rice", veg: pick(random, FACT_GROUPS.veg), fat: "olive-oil" }),
      amounts: { protein: 140, carb: 50, veg: 180, fat: 10 },
      prepMinutes: 30,
    },
    {
      id: "curry",
      emoji: "🍛",
      en: ({ protein, veg }) => `${label(protein)} & ${label(veg).toLowerCase()} coconut curry`,
      lt: ({ protein, veg }) => `Kokosų kario su ${labelLtIn(protein)} ir ${labelLtIn(veg)}`,
      methodEn: parts => `Fry the ${parts.protein} with curry powder, add the ${parts.veg} and coconut milk, then simmer for 15 minutes. Serve over ${parts.carb}.`,
      methodLt: parts => `Pakepinkite ${parts.proteinLt} su kario prieskoniais, įdėkite ${parts.vegLt} ir kokosų pieno, troškinkite 15 min. Patiekite su ${parts.carbIn}.`,
      pickSet: random => ({ protein: pick(random, ["canned-chickpeas", "lentils", "natural-tofu"]), carb: "brown-rice", veg: pick(random, FACT_GROUPS.veg), fat: "olive-oil" }),
      amounts: { protein: 130, carb: 50, veg: 180, fat: 8 },
      prepMinutes: 25,
    },
    {
      id: "skillet",
      emoji: "🍳",
      en: ({ protein, veg }) => `15-minute ${label(protein).toLowerCase()} skillet with ${label(veg).toLowerCase()}`,
      lt: ({ protein, veg }) => `15 minučių ${label(protein, "lt").toLowerCase()} keptuvėje su ${labelLtIn(veg)}`,
      methodEn: parts => `Heat the oil, add the ${parts.protein} and ${parts.veg} and cook for 10 minutes. Season, then fold through the ${parts.carb} and serve.`,
      methodLt: parts => `Įkaitinkite aliejų, dėkite ${parts.proteinLt} ir ${parts.vegLt}, kepkite 10 min. Pagardinkite, įmaišykite ${parts.carbLt} ir patiekite.`,
      pickSet: random => ({ protein: pick(random, ["natural-tofu", "canned-chickpeas", "eggs"]), carb: "quinoa", veg: pick(random, FACT_GROUPS.veg), fat: "olive-oil" }),
      amounts: { protein: 130, carb: 45, veg: 160, fat: 8 },
      prepMinutes: 15,
    },
    {
      id: "stew",
      emoji: "🥘",
      en: ({ protein, veg }) => `Slow-cooked ${label(protein).toLowerCase()} stew with ${label(veg).toLowerCase()}`,
      lt: ({ protein, veg }) => `Troškinys su ${labelLtIn(protein)} ir ${labelLtIn(veg)}`,
      methodEn: parts => `Soften the ${parts.veg} in olive oil, add the ${parts.protein}, tomato sauce and oregano. Simmer 20 minutes and serve with the ${parts.carb}.`,
      methodLt: parts => `Pakepinkite ${parts.vegLt} aliejuje, įdėkite ${parts.proteinLt}, pomidorų padažą ir raganiukes. Troškinkite 20 min. ir patiekite su ${parts.carbLt}.`,
      pickSet: random => ({ protein: pick(random, ["lentils", "canned-chickpeas", "soy-cubes", "natural-tofu"]), carb: "buckwheat", veg: pick(random, FACT_GROUPS.veg), fat: "olive-oil" }),
      amounts: { protein: 120, carb: 55, veg: 200, fat: 9 },
      prepMinutes: 25,
    },
  ],
  snack: [
    {
      id: "yogurt",
      emoji: "🫐",
      en: ({ fruit, fat }) => `Lactose-free yogurt with ${label(fruit).toLowerCase()} & ${label(fat).toLowerCase()}`,
      lt: ({ fruit, fat }) => `Jogurtas be laktozės su ${labelLtIn(fruit)} ir ${labelLtIn(fat)}`,
      methodEn: parts => `Spoon the yogurt into a glass, layer with ${parts.fruit} and scatter the ${parts.fat} on top.`,
      methodLt: parts => `Sudėkite jogurtą į stiklinę, sluoksniuokite su ${parts.fruitLt} ir pabarstykite ${parts.fatIn}.`,
      pickSet: random => ({ protein: "lactose-free-yogurt-2-5", fruit: pick(random, FACT_GROUPS.fruit.filter(key => INGREDIENT_FACTS[key].fodmap)), fat: pick(random, ["pumpkin-seeds", "chia-seeds", "walnuts", "dark-chocolate"]) }),
      amounts: { protein: 170, fruit: 90, fat: 12 },
      prepMinutes: 3,
    },
    {
      id: "toast",
      emoji: "🍞",
      en: ({ veg, protein }) => `${label(protein)} toast with ${label(veg).toLowerCase()}`,
      lt: ({ veg, protein }) => `Duona su ${labelLtIn(protein)} ir ${labelLtIn(veg)}`,
      methodEn: parts => `Toast the bread, spread the ${parts.protein} on top and add sliced ${parts.veg} with a crack of pepper.`,
      methodLt: parts => `Paskrudinkite duoną, užtepkite ${parts.proteinLt} ir sudėkite ${parts.vegLt}, pabarstykite pipirais.`,
      pickSet: random => ({ carb: "gf-bread", protein: pick(random, ["hummus", "avocado", "halloumi-cheese"]), veg: pick(random, FACT_GROUPS.veg) }),
      amounts: { carb: 50, protein: 60, veg: 70, fat: 5 },
      prepMinutes: 6,
    },
    {
      id: "crunch",
      emoji: "🥕",
      en: ({ veg, fat }) => `Crunchy ${label(veg).toLowerCase()} with ${label(fat).toLowerCase()}`,
      lt: ({ veg, fat }) => `Traškūs ${label(veg, "lt").toLowerCase()} su ${labelLtIn(fat)}`,
      methodEn: parts => `Cut the ${parts.veg} into sticks and serve with the ${parts.fat} for dipping.`,
      methodLt: parts => `Supjaustykite ${parts.vegLt} lazdynais ir patiekite su ${parts.fatLt}.`,
      pickSet: random => ({ protein: "hummus", veg: pick(random, FACT_GROUPS.veg), fat: "kalamata-olives" }),
      amounts: { protein: 60, veg: 120, fat: 20 },
      prepMinutes: 5,
    },
  ],
};

// Sweet dishes. The slot list only knows breakfast/lunch/snack/dinner, so a
// dessert is a property of the recipe, not a place in the day — ask for
// "something sweet" and these are used instead of the savoury templates.
// Every one has a protein (curd by default) so a named ingredient can be
// swapped straight in.
const SWEET_TEMPLATES = [
  {
    id: "curd-bake",
    emoji: "🍮",
    sweet: true,
    en: ({ protein, fruit }) => `Baked ${label(protein).toLowerCase()} pudding with ${label(fruit).toLowerCase()}`,
    lt: ({ protein, fruit }) => `Keptas pudingas su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Mash the ${parts.protein} with the oats and a spoon of honey, fold in the ${parts.fruit}, bake at 180 °C for 20 minutes and scatter the ${parts.fat} on top.`,
    methodLt: parts => `Sumaišykite ${parts.proteinLt} su avižomis ir šaukštu medaus, įmaišykite ${parts.fruitLt}, kepkite 180 °C temperatūroje 20 min. ir pabarstykite ${parts.fatIn}.`,
    pickSet: random => ({ protein: "curd", carb: "gf-rolled-oats", fruit: pickFruit(random), fat: pick(random, ["walnuts", "dark-chocolate"]) }),
    amounts: { protein: 180, carb: 35, fruit: 100, fat: 14 },
    prepMinutes: 25,
  },
  {
    id: "curd-mousse",
    emoji: "🍧",
    sweet: true,
    en: ({ protein, fruit }) => `Whipped ${label(protein).toLowerCase()} mousse with ${label(fruit).toLowerCase()}`,
    lt: ({ protein, fruit }) => `Saldus kremas su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Whip the ${parts.protein} with honey until fluffy, fold through the ${parts.fruit} and chill for 15 minutes. Grate the ${parts.fat} over the top.`,
    methodLt: parts => `Išplakite ${parts.proteinLt} su medumi iki purumo, įmaišykite ${parts.fruitLt} ir atvėsinkite 15 min. Pabarstykite ${parts.fatIn}.`,
    pickSet: random => ({ protein: "curd", fruit: pickFruit(random), fat: "dark-chocolate" }),
    amounts: { protein: 200, fruit: 120, fat: 12 },
    prepMinutes: 15,
  },
  {
    id: "curd-pancakes",
    emoji: "🥞",
    sweet: true,
    en: ({ protein, fruit }) => `${label(protein)} pancakes with ${label(fruit).toLowerCase()}`,
    lt: ({ protein, fruit }) => `Blyneliai su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Whisk the ${parts.protein} with the oats and one egg into a batter, fry small pancakes for 2 minutes a side and serve with the ${parts.fruit}.`,
    methodLt: parts => `Išplakite ${parts.proteinLt} su avižomis ir kiaušiniu, kepkite nedidelius blynelius po 2 min. iš abiejų pusių ir patiekite su ${parts.fruitLt}.`,
    pickSet: random => ({ protein: "curd", carb: "gf-rolled-oats", fruit: pickFruit(random), fat: "nut-butter" }),
    amounts: { protein: 170, carb: 40, fruit: 90, fat: 10 },
    prepMinutes: 20,
  },
  {
    id: "curd-glass",
    emoji: "🍨",
    sweet: true,
    en: ({ protein, fruit }) => `Layered ${label(protein).toLowerCase()} & ${label(fruit).toLowerCase()} glass`,
    lt: ({ protein, fruit }) => `Sluoksniuotas desertas su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Layer the ${parts.protein}, crushed ${parts.carb} and ${parts.fruit} in a glass, then finish with the ${parts.fat}.`,
    methodLt: parts => `Sluoksniuokite ${parts.proteinLt}, sutrupintus ${parts.carbLt} ir ${parts.fruitLt} stiklinėje, užbaikite ${parts.fatIn}.`,
    pickSet: random => ({ protein: "curd", carb: "gf-rolled-oats", fruit: pickFruit(random), fat: pick(random, ["walnuts", "dark-chocolate"]) }),
    amounts: { protein: 180, carb: 30, fruit: 110, fat: 12 },
    prepMinutes: 10,
  },
  {
    id: "curd-toast",
    emoji: "🍞",
    sweet: true,
    en: ({ protein, fruit }) => `Sweet ${label(protein).toLowerCase()} toast with ${label(fruit).toLowerCase()}`,
    lt: ({ protein, fruit }) => `Saldi duona su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Toast the bread, spread the ${parts.protein} with honey, add sliced ${parts.fruit} and finish with the ${parts.fat}.`,
    methodLt: parts => `Paskrudinkite duoną, užtepkite ${parts.proteinLt} su medumi, sudėkite ${parts.fruitLt} ir pabarstykite ${parts.fatIn}.`,
    pickSet: random => ({ protein: "curd", carb: "gf-bread", fruit: pickFruit(random), fat: "nut-butter" }),
    amounts: { protein: 150, carb: 55, fruit: 90, fat: 12 },
    prepMinutes: 8,
  },
  {
    id: "sweet-porridge",
    emoji: "🥣",
    sweet: true,
    en: ({ carb, protein, fruit }) => `Creamy ${label(carb).toLowerCase()} with ${label(protein).toLowerCase()} & ${label(fruit).toLowerCase()}`,
    lt: ({ carb, protein, fruit }) => `Kreminės ${label(carb, "lt").toLowerCase()} su ${labelLtIn(protein)} ir ${labelLtIn(fruit)}`,
    methodEn: parts => `Simmer the ${parts.carb} in plant milk, stir in the ${parts.protein} off the heat, then top with the ${parts.fruit} and the ${parts.fat}.`,
    methodLt: parts => `Virkite ${parts.carbLt} augaliniame piene, nukėlę nuo ugnies įmaišykite ${parts.proteinLt}, pabarstykite ${parts.fruitLt} ir ${parts.fatIn}.`,
    pickSet: random => ({ protein: "curd", carb: "gf-rolled-oats", fruit: pickFruit(random), fat: pick(random, ["walnuts", "chia-seeds"]) }),
    amounts: { protein: 160, carb: 50, fruit: 100, fat: 12 },
    prepMinutes: 12,
  },
];

const pickFruit = random => pick(random, FACT_GROUPS.fruit.filter(key => INGREDIENT_FACTS[key].fodmap));

function macrosFor(ingredients) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ingredient of ingredients) {
    const fact = INGREDIENT_FACTS[ingredient.key];
    if (!fact) continue;
    const factor = ingredient.amount / 100;
    total.kcal += fact.kcal * factor;
    total.protein += fact.protein * factor;
    total.carbs += fact.carbs * factor;
    total.fat += fact.fat * factor;
  }
  return {
    kcal: Math.round(total.kcal),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  };
}

function tagsFor(keys, macros, prepMinutes) {
  const facts = keys.map(key => INGREDIENT_FACTS[key]).filter(Boolean);
  const tags = ["vegetarian"];
  if (facts.every(fact => fact.vegan)) tags.push("vegan", "dairy-free");
  if (facts.every(fact => fact.glutenFree)) tags.push("gluten-free");
  if (facts.every(fact => fact.fodmap)) tags.push("low-fodmap");
  if (macros.protein >= 25) tags.push("high-protein");
  if (prepMinutes <= 15) tags.push("quick");
  return tags;
}

/**
 * Builds a vegetarian recipe draft that matches a nutrition target.
 * Runs fully offline; the same function powers the "AI idea" fallback.
 */
export function generateRecipeDraft({
  slot = "lunch",
  target = { kcal: 500, protein: 25, carbs: 45, fat: 22 },
  filters = {},
  seed = 1,
  excludeNames = [],
  wish = null,
  avoidKeys = [],
  mustInclude = [],
} = {}) {
  const safeSlot = SLOTS.includes(slot) ? slot : "lunch";
  const wantsSweet = wish?.course === "sweet" || filters.sweet === true;
  // A dessert can land in any slot; only the savoury list is slot-specific.
  let templates = wantsSweet ? SWEET_TEMPLATES : TEMPLATES[safeSlot];
  const maxMinutes = Number(filters.maxMinutes) > 0 ? Number(filters.maxMinutes) : (filters.quick ? 15 : 0);
  if (maxMinutes) {
    const fast = templates.filter(template => template.prepMinutes <= maxMinutes);
    if (fast.length) templates = fast;
  }

  // Ingredients the person named. They must end up in the dish; everything
  // else is the engine's to fit around them. Two pins of the same role both
  // count — the first fills the role, the rest are added on top.
  const pinned = [...new Set([
    ...(Array.isArray(mustInclude) ? mustInclude : []),
    ...((wish && wish.includes) || []),
  ])].filter(key => INGREDIENT_FACTS[key]);

  let chosen = null;
  // A dense pin can make the calorie window unreachable: 150 g of vegan meat
  // leaves no room for a vegetable. Rather than dropping what was asked for,
  // try once more with a wider window and mark the result, so the card can say
  // why it sits outside the range instead of silently ignoring the request.
  const passes = pinned.length ? [false, true] : [false];
  attempts: for (const relaxed of passes) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      // Mix the seed so neighbouring rerolls do not land on the same template.
      const mixed = Math.imul((Number(seed) || 1) ^ 0x9e3779b9, 2654435761) + Math.imul(attempt + 1, 40503);
      const random = mulberry32(mixed >>> 0);
      const template = pick(random, templates);
      let keys = template.pickSet(random);

      // Rerolling used to hand back the same template with one vegetable swapped,
      // so every idea had avocado in it. Anything used by a recent idea is out
      // unless the person asked for it by name.
      // Only enforced for the first dozen attempts: after a long reroll streak
      // everything is "recent", and a repeated ingredient beats no idea at all.
      const fresh = attempt < 12
        ? (avoidKeys || []).filter(key => !(wish?.includes || []).includes(key))
        : [];
      if (fresh.length && Object.values(keys).some(key => fresh.includes(key))) continue;

      // Honour an explicit "I want curd / no avocado": swap the matching role for
      // the requested ingredient and refuse any template that insists on a banned
      // one.
      if (wish) {
        const banned = wish.excludes || [];
        if (Object.values(keys).some(key => banned.includes(key))) continue;
      }

      const filledRoles = new Set();
      const extras = [];
      const nextKeys = { ...keys };
      for (const key of pinned) {
        const role = INGREDIENT_FACTS[key].group;
        if (role in nextKeys && !filledRoles.has(role)) {
          nextKeys[role] = key;
          filledRoles.add(role);
        } else {
          extras.push(key);
        }
      }
      keys = nextKeys;

      if (filters.lowFodmap) {
        const ok = Object.entries(keys).every(([role, key]) => role === "carb" || INGREDIENT_FACTS[key]?.fodmap);
        if (!ok) continue;
      }
      if (filters.highProtein) {
        const proteinFact = INGREDIENT_FACTS[keys.protein];
        if (!proteinFact || proteinFact.protein < 10) continue;
      }

      const ingredients = [];
      for (const [role, key] of Object.entries(keys)) {
        const fact = INGREDIENT_FACTS[key];
        if (!fact) continue;
        const amount = template.amounts[role] ?? 50;
        ingredients.push({ key, en: fact.en, lt: fact.lt, amount, unit: fact.unit });
      }
      // Pins that had no matching role still go on the plate.
      for (const key of extras) {
        if (ingredients.some(item => item.key === key)) continue;
        const fact = INGREDIENT_FACTS[key];
        if (!fact) continue;
        const amount = GROUP_DEFAULT_AMOUNT[fact.group] ?? 60;
        ingredients.push({ key, en: fact.en, lt: fact.lt, amount, unit: fact.unit, pinned: true });
      }

      // Scale the energy ingredient so the plate lands near the calorie target.
      const base = macrosFor(ingredients);
      const energyKey = keys.fat || keys.carb;
      const energyFact = INGREDIENT_FACTS[energyKey];
      if (!energyFact) continue;
      const desired = Math.max(180, Number(target.kcal) || 500);
      const missing = desired - base.kcal;
      const perGram = energyFact.kcal / 100;
      const energyIngredient = ingredients.find(item => item.key === energyKey);
      const bumped = Math.min(
        energyFact.group === "fat" ? 26 : 125,
        Math.max(energyFact.group === "fat" ? 4 : 30, (energyIngredient?.amount || 0) + missing / perGram),
      );
      if (energyIngredient) energyIngredient.amount = Math.round(bumped);

      // Nudge the protein ingredient when the target asks for noticeably more.
      const wantedProtein = Number(target.protein) || 0;
      const proteinFact = INGREDIENT_FACTS[keys.protein];
      const proteinIngredient = ingredients.find(item => item.key === keys.protein);
      if (wantedProtein && proteinFact && proteinIngredient && proteinFact.protein > 0) {
        const current = macrosFor(ingredients).protein;
        if (current < wantedProtein * 0.8) {
          // The named ingredient is allowed to carry more of the plate than a
          // template one: the person asked for it by name.
          const ceiling = pinned.includes(keys.protein) ? 220 : 70;
          const extra = Math.min(ceiling, (wantedProtein * 0.92 - current) / (proteinFact.protein / 100));
          proteinIngredient.amount = Math.max(40, Math.round(proteinIngredient.amount + extra));
        }
      }

      // If the plate is still too heavy, trim the starchy base before rejecting.
      let macros = macrosFor(ingredients);
      if (macros.kcal > desired * 1.12) {
        const carbIngredient = ingredients.find(item => item.key === keys.carb);
        const carbKcal = (INGREDIENT_FACTS[keys.carb]?.kcal || 0) / 100;
        if (carbIngredient && carbIngredient.amount > 30 && carbKcal > 0) {
          const trim = Math.min(carbIngredient.amount - 30, (macros.kcal - desired) / carbKcal);
          carbIngredient.amount = Math.max(30, Math.round(carbIngredient.amount - trim));
          macros = macrosFor(ingredients);
        }
      }
      const lowFactor = relaxed ? 0.6 : 0.72;
      const highFactor = relaxed ? 1.5 : 1.25;
      if (macros.kcal < desired * lowFactor || macros.kcal > desired * highFactor) continue;

      const nameEn = template.en(keys);
      if (excludeNames.some(name => name.toLowerCase() === nameEn.toLowerCase())) continue;

      const parts = {
        carb: label(keys.carb).toLowerCase() || "grain",
        carbLt: label(keys.carb, "lt").toLowerCase() || "grūdai",
        protein: label(keys.protein).toLowerCase() || "tofu",
        proteinLt: label(keys.protein, "lt").toLowerCase() || "tofu",
        veg: label(keys.veg).toLowerCase() || "vegetables",
        vegLt: label(keys.veg, "lt").toLowerCase() || "daržovės",
        fruit: label(keys.fruit).toLowerCase() || "fruit",
        fruitLt: label(keys.fruit, "lt").toLowerCase() || "vaisiai",
        fat: label(keys.fat).toLowerCase() || "seeds",
        fatLt: label(keys.fat, "lt").toLowerCase() || "sėklos",
        proteinIn: labelLtIn(keys.protein) || "tofu",
        vegIn: labelLtIn(keys.veg) || "daržovėmis",
        carbIn: labelLtIn(keys.carb) || "grūdais",
        fruitIn: labelLtIn(keys.fruit) || "vaisiais",
        fatIn: labelLtIn(keys.fat) || "sėklomis",
      };

      const prepMinutes = template.prepMinutes;

      chosen = {
        id: null,
        isDraft: true,
        name: { en: nameEn, lt: template.lt(keys) },
        emoji: template.emoji,
        slot: safeSlot,
        kcal: macros.kcal,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        ingredients,
        method: {
          en: template.methodEn(parts),
          lt: template.methodLt(parts),
        },
        tags: tagsFor(ingredients.map(item => item.key), macros, prepMinutes),
        course: template.sweet ? "sweet" : "savoury",
        vegetarian: true,
        prepMinutes,
        generated: true,
        seed,
        template: template.id,
        requested: pinned.map(key => INGREDIENT_FACTS[key].en),
        relaxed: relaxed ? true : undefined,
      };
      break attempts;
    }
  }

  return chosen;
}
