import { useMemo, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { interpolate } from "../lib/format.js";
import { tagLabel, tagsInUse, customTag } from "../lib/labels.js";
import { sanitizeSearch } from "../lib/validate.js";
import { allPlannedRecipes } from "../engine/plan.js";
import { Chip, ConfirmDialog, EmptyState } from "./ui.jsx";

/**
 * The recipe book: everything the kitchen can cook, in one list.
 *
 * The picker answers "what shall we eat?" and therefore only shows what fits a
 * slot. This screen answers "what do we own?" — every recipe, where it is used
 * this week, and a way to edit or delete it. Deleting a library recipe is not
 * possible (it is shared read-only), so those rows say so instead of offering a
 * button that would fail.
 */
export default function RecipesTab({ app, lang, t, onOpenRecipe, onEditRecipe, onCreateRecipe, lastPicker, onBackToPlan }) {
  const [query, setQuery] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [filterLabel, setFilterLabel] = useState("all");
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = sanitizeSearch(query);
  const labels = app.labels || [];

  // How many times each recipe is planned this week, so "remove" can say what
  // it will cost before the person commits.
  const plannedCount = useMemo(() => {
    const map = new Map();
    for (const item of allPlannedRecipes(app.plan)) {
      map.set(item.recipe.id, (map.get(item.recipe.id) || 0) + 1);
    }
    return map;
  }, [app.plan]);

  const labelInfo = useMemo(() => tagsInUse(app.recipes, labels), [app.recipes, labels]);
  const labelChips = useMemo(() => [
    ...labelInfo.builtIn.map(tag => ({ value: tag, text: tagLabel(tag, lang, labels) })),
    ...labelInfo.custom.map(label => ({ value: customTag(label.key), text: label.label })),
  ], [labelInfo, lang, labels]);

  const recipes = useMemo(() => {
    const own = app.recipes.filter(recipe => !recipe.isPreset).length;
    const filtered = app.recipes
      .filter(recipe => filterSlot === "all" || recipe.slot === filterSlot)
      .filter(recipe => filterLabel === "all" || (recipe.tags || []).includes(filterLabel))
      .filter(recipe => {
        if (!search) return true;
        const haystack = `${recipe.name?.en || ""} ${recipe.name?.lt || ""} ${(recipe.ingredients || []).map(item => `${item.en} ${item.lt}`).join(" ")}`.toLocaleLowerCase();
        return haystack.includes(search);
      });
    filtered.sort((a, b) => {
      // Your own recipes first: those are the ones you can change.
      if (!!a.isPreset !== !!b.isPreset) return a.isPreset ? 1 : -1;
      return (a.name?.[lang] || a.name?.en || "").localeCompare(b.name?.[lang] || b.name?.en || "", lang === "lt" ? "lt" : "en");
    });
    return { list: filtered, own, presets: app.recipes.length - own };
  }, [app.recipes, filterSlot, filterLabel, search, lang]);

  const countLabel = interpolate(t.recipesOwnCount, { own: recipes.own, all: app.recipes.length });

  const askDelete = recipe => setDeleting(recipe);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await app.deleteRecipe(deleting.id);
      setDeleting(null);
    } catch {
      // The hook already said what went wrong; keep the dialog for a retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">📖 {t.navRecipes}</div>
          <h1 className="page-title">{t.recipesTitle}</h1>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onCreateRecipe(null)}>
          ＋ {t.newRecipeShort}
        </button>
      </div>
      <p className="page-sub">{t.recipesSub}</p>

      {lastPicker?.slot && (
        <button type="button" className="back-to-picker" onClick={onBackToPlan} data-back-to-picker>
          <span aria-hidden="true">←</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{t.backToPicker}</b>
            <span className="tiny" style={{ display: "block" }}>{t.backToPickerHint}</span>
          </span>
        </button>
      )}

      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <Chip as="span" tone="sage">📖 {countLabel}</Chip>
        {recipes.own === 0 && <Chip as="span" tone="amber">📚 {t.recipesAllLibrary}</Chip>}
      </div>

      <input
        className="input input-sm"
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t.searchRecipes}
        aria-label={t.searchRecipes}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <div className="row" style={{ gap: 5, overflowX: "auto", paddingBottom: 4, marginBottom: 6 }}>
        <Chip active={filterSlot === "all"} onClick={() => setFilterSlot("all")}>{t.filterAll}</Chip>
        {SLOTS.map(slotKey => (
          <Chip key={slotKey} active={filterSlot === slotKey} onClick={() => setFilterSlot(slotKey)}>
            {SLOT_META[slotKey].icon} {SLOT_META[slotKey][lang]}
          </Chip>
        ))}
      </div>

      {labelChips.length > 0 && (
        <div className="row" style={{ gap: 5, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
          <Chip active={filterLabel === "all"} onClick={() => setFilterLabel("all")}>🏷 {t.filterAll}</Chip>
          {labelChips.map(item => (
            <Chip key={item.value} active={filterLabel === item.value} onClick={() => setFilterLabel(item.value)}>
              {item.text}
            </Chip>
          ))}
        </div>
      )}

      {app.recipes.length === 0 ? (
        <EmptyState
          icon="📖"
          title={t.recipesEmptyTitle}
          body={t.recipesEmptyBody}
          action={<button type="button" className="btn btn-primary" onClick={() => onCreateRecipe(null)}>＋ {t.newRecipeShort}</button>}
        />
      ) : recipes.list.length === 0 ? (
        <EmptyState icon="🔍" title={t.noRecipesMatch} />
      ) : (
        <div className="stack" style={{ gap: 7 }}>
          {recipes.list.map(recipe => {
            const used = plannedCount.get(recipe.id) || 0;
            return (
              <div key={recipe.id} className="card recipe-row" data-recipe-row={recipe.id}>
                <button
                  type="button"
                  className="recipe-row-main"
                  onClick={() => onOpenRecipe(recipe)}
                  aria-label={`${recipe.name?.[lang] || recipe.name?.en} — ${t.viewRecipe}`}
                >
                  <span className="opt-emoji" aria-hidden="true">{recipe.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="opt-name">{recipe.name?.[lang] || recipe.name?.en}</span>
                    <span className="opt-meta">
                      <span>{SLOT_META[recipe.slot]?.icon} {SLOT_META[recipe.slot]?.[lang]}</span>
                      <span>🔥 {Math.round(recipe.kcal || 0)}</span>
                      {used > 0 && <span className="recipe-used">📅 {interpolate(t.recipeUsedTimes, { n: used })}</span>}
                      {recipe.isPreset && <span>📚 {t.recipeLibrary}</span>}
                    </span>
                  </span>
                </button>
                <div className="recipe-row-actions">
                  <button
                    type="button"
                    className="icon-btn recipe-row-btn"
                    onClick={() => onEditRecipe(recipe)}
                    aria-label={`${t.edit} — ${recipe.name?.[lang] || recipe.name?.en}`}
                    title={recipe.isPreset ? t.copyRecipeTitle : t.editRecipeTitle}
                  >✏️</button>
                  {recipe.isPreset ? (
                    <span className="recipe-lock" title={t.recipeLibraryLocked} aria-label={t.recipeLibraryLocked}>📚</span>
                  ) : (
                    <button
                      type="button"
                      className="icon-btn recipe-row-btn recipe-row-delete"
                      onClick={() => askDelete(recipe)}
                      aria-label={`${t.deleteRecipe} — ${recipe.name?.[lang] || recipe.name?.en}`}
                      title={t.deleteRecipe}
                    >🗑</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="tiny" style={{ marginTop: 14, lineHeight: 1.6 }}>{t.recipesLibraryHint}</p>

      <ConfirmDialog
        open={!!deleting}
        title={t.recipesDeleteTitle}
        body={deleting
          ? interpolate(
            plannedCount.get(deleting.id) ? t.recipesDeleteBody : t.recipesDeleteNone,
            {
              name: deleting.name?.[lang] || deleting.name?.en || "",
              n: plannedCount.get(deleting.id) || 0,
            },
          )
          : ""}
        confirmLabel={busy ? t.saving : t.delete}
        cancelLabel={t.cancel}
        onClose={() => { if (!busy) setDeleting(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
