import { useMemo, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { interpolate } from "../lib/format.js";
import { tagLabel, tagsInUse, customTag } from "../lib/labels.js";
import { sanitizeSearch } from "../lib/validate.js";
import { allPlannedRecipes } from "../engine/plan.js";
import { removedOwnRecipes } from "../lib/library.js";
import { Chip, ConfirmDialog, EmptyState } from "./ui.jsx";

/**
 * The recipe book: everything the kitchen can cook, in one list.
 *
 * The picker answers "what shall we eat?" and therefore only shows what fits a
 * slot. This screen answers "what do we own?" — every recipe, where it is used
 * this week, and the way to change it or stop offering it. Two kinds of exit:
 *
 *   🗑 delete   your own recipe: the row is really deleted.
 *   🚫 remove   any recipe, including a shared library one: it leaves *your*
 *               pool and comes back with one tap. The other household is not
 *               affected, which is why a library dish cannot be deleted outright.
 */
export default function RecipesTab({ app, lang, t, onOpenRecipe, onEditRecipe, onCreateRecipe, lastPicker, onBackToPlan }) {
  const [query, setQuery] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [filterLabel, setFilterLabel] = useState("all");
  const [view, setView] = useState("pool");
  // The search and the slot chips apply to the pool only: someone looking at
  // 🚫 Removed wants to see everything they took out, even when they had just
  // filtered by "breakfast" a moment ago. The label filter is shared, because
  // it is about what a dish *is*.
  const setViewTo = next => {
    setView(next);
    if (next === "removed") {
      setQuery("");
      setFilterSlot("all");
    }
  };
  const [pending, setPending] = useState(null); // { recipe, action: "delete" | "remove" }
  const [busy, setBusy] = useState(false);

  const search = sanitizeSearch(query);
  const labels = app.labels || [];
  const removed = app.removed || [];

  // How many times each recipe is planned this week, so removing it can say what
  // it will cost before the person commits.
  const plannedCount = useMemo(() => {
    const map = new Map();
    for (const item of allPlannedRecipes(app.plan)) {
      map.set(item.recipe.id, (map.get(item.recipe.id) || 0) + 1);
    }
    return map;
  }, [app.plan]);

  const labelInfo = useMemo(() => tagsInUse(app.pool, labels), [app.pool, labels]);
  const labelChips = useMemo(() => [
    ...labelInfo.builtIn.map(tag => ({ value: tag, text: tagLabel(tag, lang, labels) })),
    ...labelInfo.custom.map(label => ({ value: customTag(label.key), text: label.label })),
  ], [labelInfo, lang, labels]);

  const own = useMemo(() => app.recipes.filter(recipe => !recipe.isPreset).length, [app.recipes]);
  // Rows that still exist but are hidden (any recipe taken out with 🚫): their
  // real name and emoji are right there.
  const hiddenRows = useMemo(() => {
    const ids = new Set(removed.map(row => row.recipeId));
    return app.recipes.filter(recipe => ids.has(recipe.id));
  }, [app.recipes, removed]);
  // Own recipes that were really deleted: only the marker remembers them, so
  // they are drawn from the snapshot — unless a later "put back" already
  // returned the row, which would otherwise list the dish twice.
  const presentIds = useMemo(() => new Set(app.recipes.map(recipe => recipe.id)), [app.recipes]);
  const hiddenDeleted = useMemo(
    () => removedOwnRecipes(removed).filter(recipe => !presentIds.has(recipe.id)),
    [removed, presentIds],
  );

  const recipes = useMemo(() => {
    const filtered = app.pool
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
    return filtered;
  }, [app.pool, filterSlot, filterLabel, search, lang]);

  const countLabel = interpolate(t.recipesOwnCount, { own, all: app.recipes.length });
  const removedCount = hiddenRows.length + hiddenDeleted.length;

  const askRemove = recipe => setPending({ recipe, action: "remove" });
  const askDelete = recipe => setPending({ recipe, action: "delete" });

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.action === "delete") await app.deleteRecipe(pending.recipe.id, { library: !!pending.recipe.isPreset });
      else await app.deleteRecipe(pending.recipe.id, { library: true });
      setPending(null);
    } catch {
      // The hook already said what went wrong; keep the dialog for a retry.
    } finally {
      setBusy(false);
    }
  };

  const restore = async id => {
    setBusy(true);
    try {
      await app.restoreRecipe(id);
    } catch {
      // The hook already spoke.
    } finally {
      setBusy(false);
    }
  };

  const row = (recipe, { hidden = false } = {}) => {
    const used = plannedCount.get(recipe.id) || 0;
    return (
      <div key={recipe.id} className={`card recipe-row ${hidden ? "is-hidden-recipe" : ""}`} data-recipe-row={recipe.id}>
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
              {recipe.isPreset && !recipe.removed && <span>📚 {t.recipeLibrary}</span>}
            </span>
          </span>
        </button>
        <div className="recipe-row-actions">
          {hidden ? (
            <button
              type="button"
              className="btn btn-xs btn-soft recipe-restore"
              onClick={() => restore(recipe.id)}
              disabled={busy}
              data-restore-recipe={recipe.id}
            >↺ {t.recipeRestore}</button>
          ) : (
            <>
              <button
                type="button"
                className="icon-btn recipe-row-btn"
                onClick={() => onEditRecipe(recipe)}
                aria-label={`${t.edit} — ${recipe.name?.[lang] || recipe.name?.en}`}
                title={recipe.isPreset ? t.copyRecipeTitle : t.editRecipeTitle}
              >✏️</button>
              <button
                type="button"
                className="icon-btn recipe-row-btn recipe-row-remove"
                onClick={() => askRemove(recipe)}
                aria-label={`${t.recipeRemove} — ${recipe.name?.[lang] || recipe.name?.en}`}
                title={t.recipeRemoveHint}
                data-remove-recipe={recipe.id}
              >🚫</button>
              {!recipe.isPreset && (
                <button
                  type="button"
                  className="icon-btn recipe-row-btn recipe-row-delete"
                  onClick={() => askDelete(recipe)}
                  aria-label={`${t.deleteRecipe} — ${recipe.name?.[lang] || recipe.name?.en}`}
                  title={t.deleteRecipe}
                  data-delete-recipe={recipe.id}
                >🗑</button>
              )}
            </>
          )}
        </div>
      </div>
    );
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

      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <Chip as="span" tone="sage">📖 {countLabel}</Chip>
        {own === 0 && <Chip as="span" tone="amber">📚 {t.recipesAllLibrary}</Chip>}
        <Chip
          active={view === "removed"}
          onClick={() => setViewTo(view === "removed" ? "pool" : "removed")}
          data-view-removed
        >
          🚫 {t.recipesRemovedTab} {removedCount > 0 ? `· ${removedCount}` : ""}
        </Chip>
      </div>

      {view === "removed" ? (
        <>
          <p className="page-sub" style={{ marginBottom: 12 }}>{t.recipesRemovedSub}</p>
          {removedCount === 0 ? (
            <EmptyState icon="🌿" title={t.recipesRemovedEmptyTitle} body={t.recipesRemovedEmptyBody} />
          ) : (
            <div className="stack" style={{ gap: 7 }}>
              {hiddenRows.map(recipe => row(recipe, { hidden: true }))}
              {hiddenDeleted.map(recipe => row(recipe, { hidden: true }))}
            </div>
          )}
        </>
      ) : (
        <>
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
          ) : recipes.length === 0 ? (
            <EmptyState icon="🔍" title={t.noRecipesMatch} />
          ) : (
            <div className="stack" style={{ gap: 7 }}>
              {recipes.map(recipe => row(recipe))}
            </div>
          )}
        </>
      )}

      <p className="tiny" style={{ marginTop: 14, lineHeight: 1.6 }}>{t.recipesLibraryHint}</p>

      <ConfirmDialog
        open={!!pending}
        title={pending?.action === "delete" ? t.recipesDeleteTitle : (pending?.recipe?.isPreset ? t.recipesRemoveLibraryTitle : t.recipesRemoveTitle)}
        body={pending
          ? interpolate(
            pending.action === "delete"
              ? (plannedCount.get(pending.recipe.id) ? t.recipesDeleteBody : t.recipesDeleteNone)
              : (pending.recipe.isPreset
                ? (plannedCount.get(pending.recipe.id) ? t.recipesRemoveLibraryBody : t.recipesRemoveLibraryNone)
                : (plannedCount.get(pending.recipe.id) ? t.recipesRemoveBody : t.recipesRemoveNone)),
            {
              name: pending.recipe.name?.[lang] || pending.recipe.name?.en || "",
              n: plannedCount.get(pending.recipe.id) || 0,
            },
          )
          : ""}
        confirmLabel={busy ? t.saving : (pending?.action === "delete" ? t.delete : t.recipeRemove)}
        cancelLabel={t.cancel}
        onClose={() => { if (!busy) setPending(null); }}
        onConfirm={confirm}
      />
    </div>
  );
}
