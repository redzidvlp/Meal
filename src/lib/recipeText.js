/**
 * Reading a recipe the way a person pastes it.
 *
 * People arrive with a recipe written somewhere else: a cooking site, a message
 * from a friend, a notebook photo, or the AI answer pasted out of a chat. All of
 * it is one blob of text — name, portions, ingredients and method mixed together,
 * often with the nutrition lines at the bottom. Typing that into the editor field
 * by field is the slow part; this module does the sorting.
 *
 * Two jobs, kept in one place so the editor and the tests cannot disagree:
 *   • parseRecipeText()  — split the blob into the editor's fields
 *   • estimateMacros()   — fill calories/protein/carbs/fat from the ingredients
 *
 * Nothing here is allowed to invent numbers. A macro line that was written wins;
 * otherwise the estimate says which ingredients it recognised, and anything it
 * did not recognise is reported rather than silently counted as zero.
 */

import { factFor } from "../data/ingredientFacts.js";
import { resolveIngredient } from "./wishes.js";
import { ingredientKey } from "./ingredients.js";
import { toStock } from "./units.js";
import { SPOON_ML } from "./units.js";

// ── Text helpers ────────────────────────────────────────────────────────────

const BULLET = /^\s*(?:[-*•·–—]|\d{1,2}[.)])\s+/;
const stripBullet = line => String(line || "").replace(BULLET, "").trim();
const clean = value => String(value ?? "")
  .replace(/[*_`#>]/g, " ")
  .replace(/\u00a0/g, " ")
  .replace(/[ \t]+/g, " ")
  .trim();

const SECTION_WORDS = {
  ingredients: /^(ingredients?|ingredientai|sud[ėe]tos\s+dalys|you\s+will\s+need|what\s+you\s+need|reikia)\b/i,
  method: /^(method|instructions?|directions?|steps|preparation|gaminimas|paruo[šs]imas|instrukcijos|eiga|method\s+en)\b/i,
  nutrition: /^(nutrition|nutritional|per\s+serving|maistin[ėe]\s+vert[ėe]|maistin[ėe]s\s+vert[ėe]s)\b/i,
  name: /^(name|title|pavadinimas)\b/i,
  portions: /^(serves|servings|yield|porcijos|porcij[ųu])\b/i,
};

/**
 * Fractions people actually type in recipes. "½" has no ASCII form, "1/2" does,
 * and "1 1/2" is a mixed number — all three have to become 1.5.
 */
const UNICODE_FRACTIONS = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const round1 = value => Math.round((Number(value) || 0) * 10) / 10;
// Fractions are the whole point of a recipe: 3/4 must stay 0.75, not 0.8.
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

/** "1 1/2", "1,5", "½", "2 x 400 g" → a number. */
export function parseAmount(raw) {
  const text = String(raw || "").trim().toLowerCase().replace(",", ".");
  if (!text) return 0;
  // Mixed number: "1 1/2"
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) return round2(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]));
  // Plain fraction: "3/4"
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fraction) return round2(Number(fraction[1]) / Number(fraction[2]));
  // Unicode fraction, optionally after a whole number: "1½"
  const glyph = text.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);
  if (glyph) return round2(Number(glyph[1] || 0) + UNICODE_FRACTIONS[glyph[2]]);
  const plain = text.match(/^\d+(?:\.\d+)?/);
  return plain ? round2(Number(plain[0])) : 0;
}

// Units, with the spellings a person or a foreign recipe uses.
const UNIT_ALIASES = [
  [/^(?:tbsp|tbsps?|tablespoons?|tablespoon|šaukštai?|šaukštų|šaukštas|valgomasis\s+šaukštas|valg\.?\s*š)/i, "tbsp"],
  [/^(?:tsp|tsps?|teaspoons?|teaspoon|šaukšteliai?|šaukštelių|šaukštelis|arbatinis\s+šaukštelis|arb\.?\s*š)/i, "tsp"],
  [/^(?:ml|millilit(?:er|re)s?|mililitr(?:ai|ų|as)?)/i, "ml"],
  [/^(?:g|gr|grams?|gramų|gramai|gramas)\b/i, "g"],
  [/^(?:kg|kilograms?|kilogram(?:ai|ų)?)\b/i, "kg"],
  [/^(?:l|lit(?:er|re)s?|litr(?:ai|ų|as)?)\b/i, "l"],
  [/^(?:vnt|pcs?|pieces?|piece|units?|vienet(?:ai|ų|as)?|items?)\b/i, "vnt"],
];

const unitFromText = text => {
  for (const [pattern, unit] of UNIT_ALIASES) {
    if (pattern.test(text)) return unit;
  }
  return "";
};

// Measures a home cook writes but a shop does not sell. Each one is given the
// conventional metric size so the shopping list and the macro estimate can use
// it; the recipe still shows the words the person wrote.
const HOUSEHOLD_MEASURES = [
  [/^(?:cups?|puodeli[aiųs]?)\b/i, { unit: "ml", size: 240 }],
  [/^(?:handfuls?|sauj[oaų]s?|saujel[ėe]s?)\b/i, { unit: "g", size: 30 }],
  [/^(?:pinch(?:es)?|žiupsn[ieė]l[įi]?)\b/i, { unit: "g", size: 0.5 }],
  [/^(?:cloves?|skiltel[ėe]s?|skilteli[ųu]?)\b/i, { unit: "vnt" }],
  [/^(?:slices?|rieken[ėe]l[ėe]s?|gabaliuk[aių]?)\b/i, { unit: "vnt" }],
  [/^(?:dash(?:es)?|plash[oa])\b/i, { unit: "ml", size: 2 }],
];

const measureFromText = text => {
  for (const [pattern, measure] of HOUSEHOLD_MEASURES) {
    if (pattern.test(text)) return measure;
  }
  return null;
};

/**
 * The size of one piece when a recipe counts pieces and the table knows the
 * ingredient's weight. "2 eggs" must land in the pantry as grams, because the
 * pantry counts eggs in grams too (the built-in table is per 100 g). Only used
 * to explain a quantity, never to override what a person typed.
 */
const PIECE_GRAMS = {
  eggs: 55,
  "gf-tortilla": 60,
  "flaxseed-cracker": 12,
  banana: 120,
  kiwi: 75,
  orange: 140,
  pear: 170,
};

const pieceGrams = key => PIECE_GRAMS[key] || 0;

/**
 * One ingredient line → { en, lt, amount, unit, key, note }.
 *
 * Accepted shapes, in the order people write them:
 *   "150 g tofu"        "tofu — 150 g"      "2 tbsp olive oil"
 *   "1 1/2 cups oats"   "2 eggs"            "Salt to taste"
 * The name is everything the quantity and unit are not.
 */
export function parseIngredientLine(raw) {
  const line = clean(stripBullet(raw));
  if (!line) return null;
  // A line with no letters is a stray number, not an ingredient.
  if (!/[a-ząčęėįšųūž]/i.test(line)) return null;

  // Parenthesised asides keep the name readable but never become the name.
  const withoutParens = (text, keep = false) => keep ? text : text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const source = withoutParens(line);

  // "to taste" / "pagal skonį" means no measurable amount.
  const toTaste = /(to\s+taste|pagal\s+skon[įi]|as\s+needed|kiek\s+reikia|pinch|žiupsnelis)/i.test(source);

  // Quantity at the start: "150 g", "1 1/2 cups", "½ tsp", "1½ tbsp".
  // Two alternatives, longest first: a mixed number ("1 1/2"), then a plain
  // number with an optional unicode fraction ("1½", "½").
  const AMOUNT = "(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?\\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])";
  const leading = source.match(new RegExp(`^(${AMOUNT})\\s*(.*)$`));
  // Quantity at the end: "tofu — 150 g", "olive oil 1 tbsp".
  const trailing = source.match(new RegExp(`^(.*?)[\\s,—–-]+(${AMOUNT})\\s*(.*)$`));

  let amount = 0;
  let unit = "";
  let name = source;

  // "Juice of ½ lemon" is a measure of juice, not half a lemon in the fruit
  // bowl: one lemon gives about 30 ml, so the shopping list asks for the juice.
  const juice = source.match(/^juice\s+of\s+(.+?)\s+(?:lemons?|limes?|citron[ąa]s?|laim[ąa]s?)$/i);
  if (juice) {
    const lemons = parseAmount(juice[1]) || 1;
    return {
      en: source.slice(0, 80),
      lt: "",
      amount: Math.round(lemons * 30),
      unit: "ml",
      key: /lime|laim/i.test(juice[2]) ? "lime-juice" : "lemon-juice",
      toTaste: false,
    };
  }

  let measureSize = 0;
  const readTail = tail => {
    const trimmed = String(tail || '').trim();
    const word = trimmed.match(/^([a-ząčęėįšųūž.]{1,16})\b\s*(.*)$/i);
    if (!word) return { unit: "", rest: trimmed };
    const found = unitFromText(word[1]);
    if (found) return { unit: found, rest: word[2] };
    // "2 handfuls spinach" is still a real quantity — just not a metric one.
    const measure = measureFromText(word[1]);
    if (measure) {
      measureSize = measure.size || 0;
      return { unit: measure.unit, rest: word[2] };
    }
    return { unit: "", rest: trimmed };
  };

  if (leading) {
    amount = parseAmount(leading[1]);
    let rest = leading[2];
    // "2 x 400 g canned tomatoes" is a package count, not a measure: 800 g.
    const packs = rest.match(/^[x×]\s*(\d+(?:[.,]\d+)?)\s*([a-ząčęėįšųūž.]{0,12})\b\s*(.*)$/i);
    if (packs && amount > 0 && parseAmount(packs[1]) > 0) {
      amount = round1(amount * parseAmount(packs[1]));
      rest = `${packs[2]} ${packs[3] || ""}`;
    }
    const tail = readTail(rest);
    unit = tail.unit;
    name = tail.rest;
    // "1 onion" — no unit word, the count is the ingredient's own unit.
    if (!unit && /^[a-ząčęėįšųūž]/i.test(name)) unit = amount % 1 === 0 ? "vnt" : "g";
  } else if (trailing) {
    const namePart = trailing[1].replace(/[\s,—–-]+$/, "").trim();
    // Only take the trailing quantity when what is left reads like a name
    // ("olive oil 1 tbsp"), not when the number is part of it ("vitamin B12")
    // or the sentence continues ("Juice of ½ lemon").
    const readsLikeName = namePart.length > 3
      && !/\b(?:of|and|or|with|into|from)$/i.test(namePart);
    if (readsLikeName) {
      amount = parseAmount(trailing[2]);
      const tail = readTail(trailing[3]);
      unit = tail.unit || "vnt";
      name = namePart;
    }
  }

  // Canonical units: spoons stay spoons (converted when stock is counted), kg/l
  // become g/ml because nothing downstream divides by a thousand, and a
  // handful/pinch/cup is turned into the grams or millilitres it stands for.
  if (unit === "kg") { amount = round1(amount * 1000); unit = "g"; }
  if (unit === "l") { amount = round1(amount * 1000); unit = "ml"; }
  if (measureSize) { amount = round1(amount * measureSize); }
  if (!unit && amount > 0) unit = "vnt";

  // The parenthesised aside is often the Lithuanian name: "Tofu (Natūralus tofu)".
  const parens = line.match(/\(([^)]{2,60})\)/);
  const nameClean = clean(name)
    .replace(/^[\s,—–-]+|[\s,—–-]+$/g, "")
    .replace(/\s+(?:or|arba)\s*$/i, "")
    // "Salt to taste" is salt; the rest is an instruction, not a name.
    .replace(/[\s,]+(?:to\s+taste|as\s+needed|pagal\s+skon[įi]|kiek\s+reikia)\s*$/i, "")
    .trim();
  if (nameClean.length < 2) return null;

  const key = resolveIngredient(nameClean) || ingredientKey(nameClean);
  const alt = parens && !/^\d/.test(parens[1]) ? clean(parens[1]) : "";

  return {
    en: nameClean.slice(0, 80),
    lt: alt.slice(0, 80),
    amount: toTaste && !amount ? 1 : amount,
    unit: unit || "g",
    key,
    toTaste: toTaste && !amount,
  };
}

/** Splits "Title / serves 2 / Ingredients / … / Method / …" into sections. */
export function splitSections(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trimEnd());
  const sections = { head: [], ingredients: [], method: [], nutrition: [], other: [] };
  let current = "head";
  for (const line of lines) {
    const bare = stripBullet(line).replace(/:\s*$/, "").trim();
    if (!bare) continue;
    // "Ingredients: 200 g tofu" — a heading with its content on the same line.
    const inline = bare.match(/^([a-ząčęėįšųūž ]{3,24}):\s+(.+)$/i);
    if (inline) {
      const heading = inline[1].trim();
      if (SECTION_WORDS.ingredients.test(heading)) {
        current = "ingredients";
        sections.ingredients.push(...inline[2].split(/\s*(?:;|·|•|\|)\s*/).filter(Boolean));
        continue;
      }
      if (SECTION_WORDS.method.test(heading)) {
        current = "method";
        // "Method: step one. step two." keeps its sentence structure.
        sections.method.push(...inline[2].split(/(?<=[.!?])\s+/).filter(Boolean));
        continue;
      }
      if (SECTION_WORDS.nutrition.test(heading)) {
        sections.nutrition.push(inline[2]);
        current = "other";
        continue;
      }
    }
    // A section heading is short and is not itself an ingredient ("2 eggs").
    if (bare.length <= 32 && !/\d/.test(bare)) {
      if (SECTION_WORDS.ingredients.test(bare)) { current = "ingredients"; continue; }
      if (SECTION_WORDS.method.test(bare)) { current = "method"; continue; }
      if (SECTION_WORDS.nutrition.test(bare)) { current = "nutrition"; continue; }
      if (SECTION_WORDS.name.test(bare)) { current = "head"; continue; }
      if (SECTION_WORDS.portions.test(bare)) { current = "head"; continue; }
    }
    sections[current].push(line);
  }
  return sections;
}

// A label writes "Protein 18 g"; a chat answer writes "22 g protein"; a shop
// page writes "Energy 922 kJ / 220 kcal". A nutrition line is therefore read in
// segments — one measurement at a time — and each segment is named by the word
// next to it. That is the only way "922 kJ / 220 kcal" keeps the kcal figure
// people recognise rather than converting the kJ one.
const MACRO_LABELS = [
  ["protein", /protein|baltym/i],
  ["carbs", /carbs?|carbohydrate|angliavand/i],
  ["fat", /fat|riebal/i],
  ["energy", /energy|energij|energin|calorie|kalorij|kcal|kj/i],
];

const MEASURE_AFTER = /^\s*(kcal|cal|kj|g|mg|gr|grams?|gram[ųu]|kalorij[ųu])/i;

/**
 * One "310 kcal" / "22 g protein" / "Protein: 18 g" segment → { key, value }.
 * The name can sit before or after the number; the measure decides calories.
 */
function readSegment(segment) {
  const number = segment.match(/(\d+(?:[.,]\d+)?)/);
  if (!number) return null;
  const value = parseAmount(number[1]);
  if (!value) return null;
  const after = segment.slice(number.index + number[0].length);
  const afterUnit = after.match(MEASURE_AFTER);
  const before = segment.slice(0, number.index);

  const words = `${before} ${after}`;
  let key = MACRO_LABELS.find(([, pattern]) => pattern.test(words))?.[0] || "";
  const unit = (afterUnit?.[1] || "").toLowerCase();

  // "220 kcal" on its own carries no name at all: the measure is the name.
  if (!key && /^(kcal|cal|kalorij[ųu])$/.test(unit)) key = "energy";
  if (!key) return null;

  if (key === "energy") return /^kj$/.test(unit) ? { key: "kj", value } : { key: "kcal", value };
  // A "g" measure is what macros are written in; anything else (ml, mg) is
  // still the macro, just scaled down.
  if (unit === "mg") return { key, value: round1(value / 1000) };
  return { key, value };
}

/** Numbers written into the text ("Per serving: 420 kcal, 22 g protein…"). */
export function readMacroLines(text) {
  const found = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  // Per-portion macros are usually inline: search line by line so a "22 g
  // protein" ingredient cannot be read as the dish's protein.
  for (const line of String(text || "").split(/\n+/)) {
    if (!/kcal|kj|calorie|kalorij|protein|baltym|carbs?|angliavand|fat|riebal/i.test(line)) continue;
    const segments = line.split(/[,;|]|\s+\/\s+|\s+and\s+/i);
    for (const segment of segments) {
      const read = readSegment(segment);
      if (!read) continue;
      // kJ is collected, not applied: it only fills a kcal box that nothing
      // else filled, so "922 kJ / 220 kcal" keeps 220.
      if (read.key === "kj") found.kj = Math.max(found.kj || 0, read.value);
      else found[read.key] = Math.max(found[read.key], read.value);
    }
  }
  if (!found.kcal && found.kj) found.kcal = Math.round(found.kj / 4.184);
  delete found.kj;
  return found;
}

const cleanMethodLength = value => String(value || "").replace(/\s+\n/g, "\n").trim().slice(0, 4000);

const looksLikeHeading = line => {
  const bare = clean(stripBullet(line)).replace(/:\s*$/, "");
  return bare.length > 1 && bare.length <= 32 && !/\d/.test(bare) && !/[.!?]$/.test(bare);
};

/**
 * The whole job: a pasted recipe → the editor's fields.
 *
 * Returns
 *   { name, lt, slot, servings, prepMinutes, ingredients, method, macros, found, warnings }
 * `found` says which fields were actually present in the text, so the editor
 * can report "6 ingredients, method, 4 macros" instead of a silent guess.
 */
export function parseRecipeText(raw, { slot = "lunch" } = {}) {
  const text = String(raw || "");
  const result = {
    name: { en: "", lt: "" },
    slot,
    servings: 0,
    prepMinutes: 0,
    ingredients: [],
    method: { en: "", lt: "" },
    macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    found: { name: false, ingredients: false, method: false, macros: false, servings: false },
    warnings: [],
  };
  if (!text.trim()) return result;

  const sections = splitSections(text);

  // ── Name ────────────────────────────────────────────────────────────────
  const head = [...sections.head, ...sections.other].map(clean).filter(Boolean);
  const labelledName = head.find(line => SECTION_WORDS.name.test(line));
  const nameLine = labelledName
    ? clean(labelledName.replace(SECTION_WORDS.name, "").replace(/^[:\s]+/, ""))
    : head.find(line => !/^(serves|servings|yield|porcijos)/i.test(line) && !looksLikeHeading(line))
      || head.find(line => !/^(serves|servings|yield|porcijos)/i.test(line))
      || "";
  if (nameLine) {
    // "Tofu bowl (Tofu dubenėlis)" carries both languages.
    const both = nameLine.match(/^(.*?)\s*\(([^)]{2,80})\)\s*$/);
    result.name.en = clean(both ? both[1] : nameLine).replace(/[.!;]$/, "").slice(0, 120);
    if (both) result.name.lt = clean(both[2]).slice(0, 120);
    result.found.name = result.name.en.length >= 2;
  }

  // ── Servings and prep time ──────────────────────────────────────────────
  const servings = text.match(/(?:serves|servings?|yield|porcijos|porcij[ųu]|skirta)\s*[:=]?\s*(\d{1,2})/i);
  if (servings) {
    result.servings = Number(servings[1]);
    result.found.servings = result.servings > 0;
  }
  const minutes = text.match(/(?:ready\s+in|prep(?:aration)?\s+time|cook(?:ing)?\s+time|total\s+time|minutes?|min\.?|paruo[šs]imo\s+laikas|užtrunka)\s*[:=]?\s*(\d{1,3})/i);
  if (minutes && Number(minutes[1]) <= 600) result.prepMinutes = Number(minutes[1]);

  // ── Ingredients ─────────────────────────────────────────────────────────
  // The explicit section first; without one, a run of lines that each start
  // with a quantity is the ingredient list.
  let ingredientLines = sections.ingredients;
  if (!ingredientLines.length) {
    ingredientLines = text.split(/\n/)
      .map(stripBullet)
      .filter(line => /^\s*(\d|½|¼|¾|⅓|⅔)/.test(line)
        && !/\b(?:min|minutes|°c|°f|kcal|kj|protein|carbs|fat)\b/i.test(line)
        && !/\b(?:add|heat|cook|stir|mix|serve|bake|simmer|fry|combine|press|preheat|boil)\b/i.test(line))
      .slice(0, 40);
  }
  result.ingredients = ingredientLines
    .map(parseIngredientLine)
    .filter(Boolean)
    .slice(0, 40);
  result.found.ingredients = result.ingredients.length > 0;

  // ── Method ──────────────────────────────────────────────────────────────
  const methodLines = sections.method;
  if (methodLines.length) {
    result.method.en = cleanMethodLength(methodLines.map(stripBullet).join("\n"));
    result.found.method = result.method.en.length > 0;
  } else {
    // No "Method" heading: long sentences after the ingredients are the method.
    const tail = text.split(/\n+/).map(stripBullet)
      .filter(line => line.length > 45 && !/^\s*\d/.test(line))
      .slice(0, 12);
    if (tail.length) {
      result.method.en = cleanMethodLength(tail.join("\n"));
      result.found.method = true;
    }
  }

  // ── Macros ──────────────────────────────────────────────────────────────
  const written = readMacroLines(sections.nutrition.length ? sections.nutrition.join("\n") : text);
  if (written.kcal || written.protein || written.carbs || written.fat) {
    result.macros = {
      kcal: Math.round(written.kcal),
      protein: written.protein,
      carbs: written.carbs,
      fat: written.fat,
    };
    result.found.macros = true;
  }

  if (!result.found.name) result.warnings.push("noName");
  if (!result.found.ingredients) result.warnings.push("noIngredients");
  return result;
}

/**
 * Nutrition from the ingredient list, using the same table the offline recipe
 * generator uses (built-ins plus the kitchen's own products).
 *
 * Spoons become millilitres first, so "1 tbsp olive oil" is 15 ml of oil rather
 * than one unit of nothing. A recognised ingredient with no quantity is counted
 * at a small default so a "salt to taste" does not read as zero calories — but
 * it is listed as estimated rather than known.
 */
export function estimateMacros(ingredients = []) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const known = [];
  const unknown = [];
  for (const ingredient of ingredients) {
    const fact = factFor(ingredient?.key) || factFor(ingredientKey(ingredient?.en || ""));
    const stock = toStock(ingredient);
    const grams = amountInGrams(stock, fact);
    if (!fact || !grams) {
      unknown.push(ingredient?.en || ingredient?.key || "");
      continue;
    }
    const factor = grams / 100;
    totals.kcal += (fact.kcal || 0) * factor;
    totals.protein += (fact.protein || 0) * factor;
    totals.carbs += (fact.carbs || 0) * factor;
    totals.fat += (fact.fat || 0) * factor;
    known.push({ en: ingredient.en, key: ingredient.key, grams: Math.round(grams) });
  }
  return {
    kcal: Math.round(totals.kcal),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
    known,
    unknown: unknown.filter(Boolean),
  };
}

/**
 * How many grams (or millilitres) an ingredient amount represents. `vnt` uses
 * the piece weights above; when a piece weight is unknown the ingredient cannot
 * be counted and is reported, never guessed at 100 g.
 */
function amountInGrams(ingredient, fact) {
  const amount = Number(ingredient?.amount) || 0;
  if (!amount) return 0;
  const unit = ingredient?.unit;
  if (unit === "kg") return amount * 1000;
  if (unit === "l") return amount * 1000;
  if (unit === "tsp" || unit === "tbsp") return amount * SPOON_ML[unit];
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "vnt") {
    const grams = pieceGrams(ingredient?.key);
    return grams ? amount * grams : 0;
  }
  return 0;
}

/** "2 tbsp" style summary for the editor's import note. */
export const describeImport = parsed => {
  const bits = [];
  if (parsed.found.name) bits.push("name");
  if (parsed.found.ingredients) bits.push(`${parsed.ingredients.length} ingredients`);
  if (parsed.found.method) bits.push("method");
  if (parsed.found.macros) bits.push("nutrition");
  return bits.join(", ");
};
