import { useEffect, useMemo, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { fmtNum, interpolate } from "../lib/format.js";
import { menuTotals } from "../lib/menus.js";
import { customTag, tagLabel, tagsInUse } from "../lib/labels.js";
import { sanitizeSearch } from "../lib/validate.js";
import { Chip, EmptyState, Segmented, Sheet } from "./ui.jsx";

export default function RecipePicker({
  open, onClose, day, slot, mode, person, currentRecipe, recipes, recipesById, menus = [], labels = [], lang, t, people = {}, initialTab = "recipes",
  onSelect, onApplyMenu, onCreateNew, onCreateMenu, onEditMenu, onResetMenu,
}) {
  const [tab, setTab] = useState(initialTab);
  const [applyDay, setApplyDay] = useState(day ?? 0);
  const [query, setQuery] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [filterLabel, setFilterLabel] = useState("all");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab || "recipes");
    setQuery("");
    setFilterSlot("all");
    setFilterLabel("all");
    setApplyDay(day ?? 0);
  }, [open, initialTab, day]);

  const search = sanitizeSearch(query);

  const labelInfo = useMemo(() => tagsInUse(recipes, labels), [recipes, labels]);
  const labelChips = useMemo(() => [
    ...labelInfo.builtIn.map(tag => ({ value: tag, text: tagLabel(tag, lang, labels) })),
    ...labelInfo.custom.map(label => ({ value: customTag(label.key), text: label.label })),
  ], [labelInfo, lang, labels]);

  const list = useMemo(() => {
    const filtered = recipes
      .filter(recipe => filterSlot === "all" || recipe.slot === filterSlot)
      .filter(recipe => filterLabel === "all" || (recipe.tags || []).includes(filterLabel))
      .filter(recipe => {
        if (!search) return true;
        const haystack = `${recipe.name?.en || ""} ${recipe.name?.lt || ""} ${(recipe.ingredients || []).map(i => `${i.en} ${i.lt}`).join(" ")}`.toLocaleLowerCase();
        return haystack.includes(search);
      });
    return filtered.sort((a, b) => {
      const aSlot = a.slot === slot ? 0 : 1;
      const bSlot = b.slot === slot ? 0 : 1;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return (a.name?.[lang] || a.name?.en || "").localeCompare(b.name?.[lang] || b.name?.en || "", lang === "lt" ? "lt" : "en");
    });
  }, [recipes, filterSlot, filterLabel, search, slot, lang]);

  const subtitle = slot
    ? interpolate(t.pickRecipeSub, { slot: SLOT_META[slot]?.[lang], day: t.fullDays[day] })
    : t.recipesCount.replace("{n}", recipes.length);

  const menuTotal = menu => {
    let total = 0;
    for (const slotKey of SLOTS) {
      const entry = menu.items[slotKey];
      if (!entry) continue;
      if (entry.both) total += (recipesById.get(entry.both)?.kcal || 0) * 2;
      else total += (recipesById.get(entry.R)?.kcal || 0) + (recipesById.get(entry.I)?.kcal || 0);
    }
    return total;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tab === "recipes" ? t.pickRecipe : t.menuTitle}
      subtitle={tab === "recipes" ? subtitle : interpolate(t.menuSub, { day: t.fullDays[day] })}
      footer={(
        <>
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onCreateNew}>{t.newRecipe}</button>
          <button type="button" className="btn btn-ghost" style={{ flex: 0.6 }} onClick={onClose}>{t.close}</button>
        </>
      )}
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "recipes", label: t.recipes, icon: "📖" },
          { value: "menus", label: t.menus, icon: "🍱" },
        ]}
      />

      {tab === "recipes" ? (
        <>
          <div className="row" style={{ gap: 8, margin: "14px 0 10px" }}>
            <input
              className="input input-sm"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t.searchRecipes}
              aria-label={t.searchRecipes}
              style={{ flex: 1 }}
            />
          </div>
          <div className="row" style={{ gap: 5, overflowX: "auto", paddingBottom: 4, marginBottom: 8 }}>
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

          {list.length === 0 ? (
            <EmptyState icon="🔍" title={t.noRecipesMatch} body={t.noSuggestionsHint} />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {list.map(recipe => {
                const isCurrent = currentRecipe?.id === recipe.id;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    className={`recipe-option ${isCurrent ? "selected" : ""}`}
                    onClick={() => { if (!isCurrent) onSelect(recipe); }}
                    disabled={isCurrent}
                    style={isCurrent ? { opacity: 0.75 } : undefined}
                  >
                    <span className="opt-emoji" aria-hidden="true">{recipe.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="opt-name">{recipe.name?.[lang] || recipe.name?.en}</span>
                      <span className="opt-meta">
                        <span>{SLOT_META[recipe.slot]?.[lang]}</span>
                        <span>🔥 {fmtNum(recipe.kcal)}</span>
                        <span>💪 {fmtNum(recipe.protein)}g</span>
                        {(recipe.tags || []).filter(tag => tag.startsWith("x-")).slice(0, 1).map(tag => (
                          <span key={tag}>🏷 {tagLabel(tag, lang, labels)}</span>
                        ))}
                        {recipe.isPreset && <span>📚</span>}
                      </span>
                    </span>
                    {isCurrent ? <span style={{ color: C.forest, fontSize: 10, fontWeight: 700 }}>{t.current}</span> : <span style={{ color: C.muted }}>›</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm btn-soft" style={{ flex: 1 }} onClick={onCreateMenu}>
              ＋ {t.menuNew}
            </button>
            <button type="button" className="btn btn-sm btn-soft" style={{ flex: 1 }} onClick={() => onCreateMenu({ fromDay: day })}>
              📅 {t.menuFromToday}
            </button>
          </div>

          <div className="card card-pad" style={{ padding: "10px 12px" }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{t.menuDayLabel}</div>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {t.dayNames.map((name, index) => (
                <Chip key={name} active={applyDay === index} onClick={() => setApplyDay(index)}>{name}</Chip>
              ))}
            </div>
          </div>

          {menus.map(menu => {
            const totals = menuTotals(menu, recipesById);
            return (
              <div key={menu.id} className="card card-pad menu-card">
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="menu-name">{menu.emoji} {menu.name?.[lang] || menu.name?.en}</div>
                    <div className="tiny">🔥 ~{fmtNum(totals.kcal)} {t.kcal} · {t.dayTotal}</div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {menu.diff && <Chip as="span" tone="amber">✂️ {t.menuDiffNote}</Chip>}
                    {menu.overridden && <span className="chip sage static">✏️ {t.menuEdit}</span>}
                  </div>
                </div>
                <div className="stack" style={{ gap: 5, marginBottom: 10 }}>
                  {SLOTS.map(slotKey => {
                    const entry = menu.items[slotKey];
                    if (!entry) return null;
                    const recipesForSlot = entry.both
                      ? [[null, recipesById.get(entry.both)]]
                      : [["R", recipesById.get(entry.R)], ["I", recipesById.get(entry.I)]];
                    const available = recipesForSlot.filter(([, recipe]) => recipe);
                    return (
                      <div key={slotKey} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                        <span className="slot-label" style={{ width: 58, flexShrink: 0, paddingTop: 2 }}>{SLOT_META[slotKey][lang]}</span>
                        <span style={{ fontSize: 12, lineHeight: 1.5, color: C.inkSoft }}>
                          {available.map(([personKey, recipe]) => (
                            <span key={`${personKey || "both"}-${recipe.id}`} style={{ display: "block" }}>
                              {recipe.emoji} {recipe.name?.[lang] || recipe.name?.en}
                              {personKey && (
                                <span className="tiny"> · {people[personKey] || t.personFallback[personKey]}</span>
                              )}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1.5 }} onClick={() => onApplyMenu(menu, applyDay)}>
                    {interpolate(t.menuApplyTo, { day: t.dayNames[applyDay] })}
                  </button>
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => onEditMenu(menu)}>
                    ✏️ {t.menuEdit}
                  </button>
                  {menu.overridden && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onResetMenu(menu.presetKey)} title={t.menuReset}>
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
