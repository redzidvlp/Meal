import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { tagLabel } from "../lib/labels.js";
import { AutoTextarea, MacroPills } from "./ui.jsx";
import { sanitizeNote } from "../lib/validate.js";

export default function MealCard({
  meal,
  slotLabel,
  personKey = "both",
  personName = null,
  personColor = null,
  eaten = false,
  note = "",
  labels = [],
  lang,
  t,
  onToggleEaten,
  onOpenRecipe,
  onChange,
  onSplit,
  onMerge,
  onMove,
  onRemove,
  onDragStart,
  onNoteChange,
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(note || "");

  useEffect(() => { setDraft(note || ""); }, [note]);
  if (!meal) return null;

  const save = () => {
    onNoteChange?.(sanitizeNote(draft));
    setEditingNote(false);
  };

  const tags = (meal.tags || []).filter(tag => tag !== "vegetarian");

  return (
    <article className={`meal-card ${eaten ? "eaten" : ""}`} style={{ "--person-color": personColor || C.leaf, marginBottom: 8 }}>
      <div className="meal-card-head">
        <div className="meal-emoji" aria-hidden="true">{meal.emoji}</div>
        <div className="meal-main">
          <div className="row" style={{ gap: 6 }}>
            <span className="slot-label">{slotLabel}</span>
            {personName && (
              <span className="row" style={{ gap: 4 }}>
                <span className="person-dot" style={{ background: personColor || C.leaf }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: personColor || C.leaf }}>{personName}</span>
              </span>
            )}
          </div>
          <button
            type="button"
            className="meal-name-btn"
            onClick={onOpenRecipe}
            title={t.viewRecipe}
            aria-label={`${meal.name?.[lang] || meal.name?.en} — ${t.viewRecipe}`}
          >
            {meal.name?.[lang] || meal.name?.en}
          </button>
          <div style={{ marginTop: 5 }}><MacroPills recipe={meal} t={t} compact /></div>
          <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="stock-badge">{tagLabel(tag, lang, labels)}</span>
            ))}
            {meal.prepMinutes > 0 && <span className="stock-badge">⏱ {meal.prepMinutes} {t.minutes}</span>}
          </div>
        </div>
        <div className="meal-card-icons">
          <button
            type="button"
            className="icon-btn meal-grip"
            onPointerDown={onDragStart}
            aria-label={t.dragHandle}
            title={t.dragHint}
          >
            ⠿
          </button>
          <button
            type="button"
            className="icon-btn meal-delete"
            onClick={onRemove}
            aria-label={t.removeMeal}
            title={t.removeMeal}
          >
            🗑
          </button>
        </div>
      </div>

      <div className="meal-actions">
        <button
          type="button"
          className={`btn btn-sm btn-soft meal-action ${eaten ? "is-eaten" : ""}`}
          onClick={onToggleEaten}
          aria-pressed={eaten}
        >
          {eaten ? `✓ ${t.eaten}` : `🍴 ${t.markEaten}`}
        </button>
        <button type="button" className="btn btn-sm btn-soft meal-action" onClick={onChange}>{t.changeMeal}</button>
        {onSplit && (
          <button type="button" className="btn btn-sm btn-soft meal-action" onClick={onSplit} title={t.splitHint}>
            ✂️ {t.splitShort}
          </button>
        )}
        {onMerge && (
          <button type="button" className="btn btn-sm btn-soft meal-action" onClick={onMerge} title={t.mergeHint}>
            ⇄ {t.mergeShort}
          </button>
        )}
        {onMove && (
          <button type="button" className="btn btn-sm btn-soft meal-action" onClick={onMove} title={t.moveMeal}>
            ↔ {t.moveMeal}
          </button>
        )}
      </div>

      <div className="meal-note" onClick={() => { if (!editingNote) setEditingNote(true); }} role="button" tabIndex={0}
        onKeyDown={event => { if (event.key === "Enter" && !editingNote) setEditingNote(true); }}>
        {editingNote ? (
          <div onClick={event => event.stopPropagation()}>
            <AutoTextarea
              value={draft}
              onChange={setDraft}
              placeholder={t.notePlaceholder}
              maxLength={500}
              style={{ width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "7px 9px", fontSize: 12, background: "var(--surface)", outline: "none" }}
            />
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <button type="button" className="btn btn-xs btn-primary" onClick={save}>{t.save}</button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setDraft(note || ""); setEditingNote(false); }}>{t.cancel}</button>
            </div>
          </div>
        ) : note ? (
          <div className="row" style={{ alignItems: "flex-start", gap: 5 }}>
            <span aria-hidden="true">📝</span>
            <span className="note-text">{note}</span>
          </div>
        ) : (
          <span className="note-empty">＋ {t.addNote}</span>
        )}
      </div>
    </article>
  );
}
