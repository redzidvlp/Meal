/**
 * Suggestions for the "Must include" box.
 *
 * The box used to lean on the browser's own <datalist>, which is a desktop
 * feature: Chrome and Firefox show a little arrow and a list of a hundred
 * ingredients, iOS Safari shows nothing at all, so on a phone the box looked
 * like plain text with no way to discover what could be typed. This module does
 * the matching itself, so the list looks and behaves the same everywhere.
 *
 * The ranking is deliberately simple and predictable: an exact name first, then
 * names that start with what was typed, then a word inside a name that starts
 * with it, and only then a match anywhere. That is what makes typing "tofu"
 * offer Natural tofu before Smoked tofu instead of listing everything with a
 * "t" in it.
 */

/** Lower-case, accent-free form, so "cukinija" finds "Cukinija" and "ą" finds "a". */
export const fold = value => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const GROUP_ORDER = ["protein", "carb", "fat", "veg", "fruit", "flavor"];

/** 0 exact · 1 starts with · 2 a word starts with · 3 appears inside. */
function rankOf(query, names) {
  let best = null;
  for (const name of names) {
    if (!name) continue;
    if (name === query) return 0;
    if (name.startsWith(query)) best = best === null || best > 1 ? 1 : best;
    else if (name.split(/[\s-]+/).some(word => word.startsWith(query))) best = best === null || best > 2 ? 2 : best;
    else if (name.includes(query)) best = best === null ? 3 : best;
  }
  return best;
}

/**
 * Matches for what has been typed.
 *
 * @param {string} query        what is in the box (may be empty: then the list
 *                              is a starter menu, proteins first)
 * @param {object} options
 * @param {object} options.facts   key → fact (built-ins and saved products)
 * @param {string} options.lang    "en" | "lt", for the visible label
 * @param {number} options.limit   how many rows to return
 * @param {string[]} options.exclude keys already pinned, so they show as taken
 */
export function matchIngredients(query, { facts = {}, lang = "en", limit = 8, exclude = [] } = {}) {
  const needle = fold(query);
  const rows = [];
  let order = 0;

  for (const [key, fact] of Object.entries(facts)) {
    if (!fact || !fact.en) { order += 1; continue; }
    const names = [fact.en, fact.lt, fact.shortEn, fact.shortLt].filter(Boolean).map(fold);
    const rank = needle ? rankOf(needle, names) : 0;
    order += 1;
    if (rank === null) continue;
    rows.push({
      key,
      label: (lang === "lt" && fact.lt) || fact.en,
      short: (lang === "lt" && fact.shortLt) || fact.shortEn || fact.en,
      group: fact.product ? "product" : (fact.group || "veg"),
      kcal: Number(fact.kcal) || 0,
      protein: Number(fact.protein) || 0,
      product: !!fact.product,
      pinned: exclude.includes(key),
      rank,
      order,
    });
  }

  // With nothing typed, the list is a starter menu: the things a meal is built
  // around first, condiments last.
  const groupRank = row => (row.product ? -1 : GROUP_ORDER.indexOf(row.group));
  rows.sort((a, b) => a.rank - b.rank || groupRank(a) - groupRank(b) || a.order - b.order);
  return rows.slice(0, Math.max(1, limit));
}
