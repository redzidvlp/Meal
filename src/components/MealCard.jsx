import { useEffect, useState } from "react";
import { C, TAG_LABELS } from "../theme.js";
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
  lang,
  t,
  onToggleEaten,
  onOpenRecipe,
  onChange,
  onSplit,
  onMerge,
  onRemove,
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

  return (
    <article className={`meal-card ${eaten ? "eaten" : ""}`} style={{ "--person-color": personColor || C.leaf, marginBottom: 8 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 11 }}>
        <div className="meal-emoji" aria-hidden="true">{meal.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="slot-label">{slotLabel}</span>
            {personName && (
              <span className="row" style={{ gap: 4 }}>
                <span className="person-dot" style={{ background: personColor || C.leaf }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: personColor || C.leaf }}>{personName}</span>
              </span>
            )}
          </div>
          <div className="meal-name">{meal.name?.[lang] || meal.name?.en}</div>
          <div style={{ marginTop: 5 }}><MacroPills recipe={meal} t={t} compact /></div>
          <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {(meal.tags || []).filter(tag => tag !== "vegetarian").slice(0, 2).map(tag => (
              <span key={tag} className="stock-badge">{TAG_LABELS[lang]?.[tag] || tag}</span>
            ))}
            {meal.prepMinutes > 0 && <span className="stock-badge">⏱ {meal.prepMinutes} {t.minutes}</span>}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onOpenRecipe} aria-label={t.viewRecipe} title={t.viewRecipe}>👁</button>
      </div>

      <div className="meal-actions">
        <button
          type="button"
          className={`btn btn-sm ${eaten ? "btn-primary" : "btn-soft"}`}
          onClick={onToggleEaten}
          aria-pressed={eaten}
          style={eaten ? { background: C.leaf, borderColor: C.leaf } : undefined}
        >
          {eaten ? `✓ ${t.eaten}` : `🍴 ${t.markEaten}`}
        </button>
        <button type="button" className="btn btn-sm btn-soft" onClick={onOpenRecipe}>{t.viewRecipe}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onChange}>{t.changeMeal}</button>
        {onSplit && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onSplit} title={t.splitHint} style={{ color: C.amber }}>
            ✂️ {t.makeDifferent}
          </button>
        )}
        {onMerge && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onMerge} title={t.mergeHint} style={{ color: C.amber }}>
            ⇄ {t.makeSame}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onRemove} aria-label={t.removeMeal} title={t.removeMeal} style={{ color: C.muted }}>
          ✕
        </button>
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
              style={{ width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "7px 9px", fontSize: 12, background: "#fff", outline: "none" }}
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
