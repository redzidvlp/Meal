// Design tokens shared by inline styles. Layout styles live in styles.css.
export const C = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  soft: "var(--surface-soft)",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  muted: "var(--muted)",
  line: "var(--line)",
  forest: "var(--forest)",
  forestDeep: "var(--forest-deep)",
  leaf: "var(--leaf)",
  sage: "var(--sage)",
  coral: "var(--coral)",
  amber: "var(--amber)",
  sky: "var(--sky)",
  danger: "var(--danger)",
  R: "var(--person-r)",
  I: "var(--person-i)",
};

export const SLOT_META = {
  breakfast: { icon: "☀️", en: "Breakfast", lt: "Pusryčiai" },
  lunch: { icon: "🥗", en: "Lunch", lt: "Pietūs" },
  snack: { icon: "🍎", en: "Snack", lt: "Užkandis" },
  dinner: { icon: "🌙", en: "Dinner", lt: "Vakarienė" },
};

export const SLOTS = ["breakfast", "lunch", "snack", "dinner"];
export const UNITS = ["g", "ml", "vnt"];

export const TAG_LABELS = {
  en: {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    "dairy-free": "Dairy-free",
    "low-fodmap": "Low-FODMAP",
    "gluten-free": "Gluten-free",
    "high-protein": "High protein",
    quick: "Quick",
    "meal-prep": "Meal prep",
  },
  lt: {
    vegetarian: "Vegetariška",
    vegan: "Veganiška",
    "dairy-free": "Be pieno",
    "low-fodmap": "Mažai FODMAP",
    "gluten-free": "Be glitimo",
    "high-protein": "Daug baltymų",
    quick: "Greita",
    "meal-prep": "Ruošti iš anksto",
  },
};

export const ALL_TAGS = ["vegetarian", "vegan", "dairy-free", "low-fodmap", "gluten-free", "high-protein", "quick", "meal-prep"];
