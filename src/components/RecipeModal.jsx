import { useEffect, useState } from "react";
import { C, SLOT_META, TAG_LABELS } from "../theme.js";
import { fmtNum } from "../lib/format.js";
import { Sheet, TagChips } from "./ui.jsx";

export default function RecipeModal({ recipe, lang, t, onClose, onEdit }) {
  const [scale, setScale] = useState(1);
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    setScale(1);
    setChecked(new Set());
  }, [recipe?.id]);

  if (!recipe) return null;
  const name = recipe.name?.[lang] || recipe.name?.en || "";
  const slotLabel = SLOT_META[recipe.slot]?.[lang] || recipe.slot;

  const toggle = index => {
    setChecked(previous => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <Sheet
      open={!!recipe}
      onClose={onClose}
      title={name}
      subtitle={`${slotLabel}${recipe.prepMinutes ? ` · ⏱ ${recipe.prepMinutes} ${t.minutes}` : ""}`}
      footer={(
        <>
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => onEdit(recipe)}>
            ✏️ {t.edit}
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>{t.close}</button>
        </>
      )}
    >
      <div className="recipe-hero" style={{ margin: "-16px -18px 16px", borderBottom: `1px solid ${C.line}` }}>
        <div className="recipe-emoji" aria-hidden="true">{recipe.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <TagChips tags={recipe.tags || []} lang={lang} limit={4} />
          </div>
          <div className="macro-row">
            {[["🔥", `${fmtNum(recipe.kcal * scale)} ${t.kcal}`], ["💪", `${fmtNum(recipe.protein * scale)}g`], ["🌾", `${fmtNum(recipe.carbs * scale)}g`], ["🫒", `${fmtNum(recipe.fat * scale)}g`]].map(([icon, value]) => (
              <span key={icon} className="macro-pill" style={{ background: "#fff" }}><span aria-hidden="true">{icon}</span>{value}</span>
            ))}
          </div>
          <div className="tiny" style={{ marginTop: 6 }}>{t.perServing}</div>
        </div>
      </div>

      <div className="row-between" style={{ marginBottom: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>{t.ingredientsTitle}</div>
        <div className="row" style={{ gap: 3 }}>
          {[1, 2, 3, 4].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setScale(value)}
              aria-pressed={scale === value}
              style={{
                width: 27, height: 27, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: scale === value ? `1.5px solid ${C.forest}` : `1px solid ${C.line}`,
                background: scale === value ? C.forest : "#fff",
                color: scale === value ? "#fff" : C.inkSoft,
              }}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
      <div className="tiny" style={{ marginBottom: 8 }}>{t.servings} · ×{scale}</div>

      <div>
        {(recipe.ingredients || []).map((ingredient, index) => {
          const isChecked = checked.has(index);
          return (
            <div
              key={`${ingredient.key}-${index}`}
              className={`ingredient-row ${isChecked ? "checked" : ""}`}
              onClick={() => toggle(index)}
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(index); } }}
            >
              <span className="row" style={{ gap: 9, minWidth: 0 }}>
                <span className={`checkbox ${isChecked ? "checked" : ""}`} aria-hidden="true">{isChecked ? "✓" : ""}</span>
                <span className="ing-name">{lang === "lt" ? ingredient.lt : ingredient.en}</span>
              </span>
              <span className="ing-amount">{fmtNum(ingredient.amount * scale)} {ingredient.unit}</span>
            </div>
          );
        })}
      </div>

      <div className="section-title" style={{ marginBottom: 6 }}>{t.methodTitle}</div>
      <p className="method-text">{recipe.method?.[lang] || recipe.method?.en || "—"}</p>

      {recipe.isPreset && <p className="tiny" style={{ marginTop: 18 }}>📚 {t.presetNotice}</p>}
    </Sheet>
  );
}
