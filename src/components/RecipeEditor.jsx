import { useEffect, useState } from "react";
import { ALL_TAGS, C, SLOT_META, SLOTS, TAG_LABELS, UNITS } from "../theme.js";
import { sanitizeRecipe } from "../lib/validate.js";
import { Field, Sheet, ConfirmDialog, parseNumber } from "./ui.jsx";
import PhotoSheet from "./PhotoSheet.jsx";

const EMOJI_CHOICES = ["🥗", "🥣", "🍲", "🌯", "🍚", "🫘", "🍳", "🥑", "🍽️", "🥦"];

const blankForm = slot => ({
  id: null,
  name: { en: "", lt: "" },
  emoji: "🍽️",
  slot: slot || "lunch",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
  prepMinutes: "20",
  ingredients: [{ en: "", lt: "", amount: "", unit: "g" }],
  method: { en: "", lt: "" },
  tags: ["vegetarian", "low-fodmap", "gluten-free"],
  isPreset: false,
});

function fromRecipe(recipe) {
  return {
    id: recipe.id,
    name: { en: recipe.name?.en || "", lt: recipe.name?.lt || "" },
    emoji: recipe.emoji || "🍽️",
    slot: recipe.slot || "lunch",
    kcal: String(recipe.kcal ?? ""),
    protein: String(recipe.protein ?? ""),
    carbs: String(recipe.carbs ?? ""),
    fat: String(recipe.fat ?? ""),
    prepMinutes: String(recipe.prepMinutes ?? ""),
    ingredients: (recipe.ingredients || []).map(ingredient => ({
      en: ingredient.en || "",
      lt: ingredient.lt || "",
      amount: String(ingredient.amount ?? ""),
      unit: ingredient.unit || "g",
    })),
    method: { en: recipe.method?.en || "", lt: recipe.method?.lt || "" },
    tags: Array.isArray(recipe.tags) && recipe.tags.length ? recipe.tags : ["vegetarian"],
    isPreset: !!recipe.isPreset,
  };
}

const errorMessage = (errors, t) => {
  if (errors.nameEn) return t.nameRequired;
  if (errors.vegetarian) return t.nonVegetarian;
  if (errors.tooManyIngredients) return t.tooManyIngredients;
  if (errors.ingredients || errors.ingredient) return errors.ingredient ? t.ingredientRequired : t.ingredientsRequired;
  if (errors.kcal) return t.invalidNumber;
  return null;
};

export default function RecipeEditor({ open, recipe, defaultSlot, lang, t, app, onClose, onSave, onDelete, onSaved }) {
  const [form, setForm] = useState(() => blankForm(defaultSlot));
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(recipe ? fromRecipe(recipe) : blankForm(defaultSlot));
    setErrors({});
    setGeneralError("");
    setConfirmDelete(false);
  }, [open, recipe, defaultSlot]);

  const update = (patch) => setForm(previous => ({ ...previous, ...patch }));
  const updateIngredient = (index, patch) => {
    setForm(previous => ({
      ...previous,
      ingredients: previous.ingredients.map((ingredient, i) => (i === index ? { ...ingredient, ...patch } : ingredient)),
    }));
  };

  const toggleTag = tag => {
    if (tag === "vegetarian") return;
    setForm(previous => {
      const has = previous.tags.includes(tag);
      return { ...previous, tags: has ? previous.tags.filter(value => value !== tag) : [...previous.tags, tag] };
    });
  };

  const submit = async event => {
    event?.preventDefault();
    setGeneralError("");
    const payload = {
      id: form.id || undefined,
      name: { en: form.name.en.trim(), lt: form.name.lt.trim() },
      emoji: form.emoji,
      slot: form.slot,
      kcal: parseNumber(form.kcal),
      protein: parseNumber(form.protein),
      carbs: parseNumber(form.carbs),
      fat: parseNumber(form.fat),
      prepMinutes: parseNumber(form.prepMinutes),
      ingredients: form.ingredients.map(ingredient => ({
        en: ingredient.en.trim(),
        lt: ingredient.lt.trim(),
        amount: parseNumber(ingredient.amount),
        unit: ingredient.unit,
      })),
      method: form.method,
      tags: form.tags,
      isPreset: form.isPreset,
    };

    const check = sanitizeRecipe(payload, { existingId: form.id });
    if (!check.ok) {
      setErrors(check.errors);
      setGeneralError(errorMessage(check.errors, t));
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave(payload);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      if (error?.errors) {
        setErrors(error.errors);
        setGeneralError(errorMessage(error.errors, t));
      } else {
        setGeneralError(t.savingFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  const errorText = generalError;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={recipe && !recipe.isDraft ? (recipe.isPreset ? t.copyRecipeTitle : t.editRecipeTitle) : t.newRecipeTitle}
        subtitle={recipe?.isPreset ? t.presetNotice : t.perPortionHint}
        footer={(
          <>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1.4 }} onClick={submit} disabled={saving}>
              {saving ? t.saving : t.save}
            </button>
          </>
        )}
      >
        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          {recipe?.isPreset && (
            <div className="demo-banner" style={{ margin: 0, background: "#eef3e7", borderColor: C.sage, color: C.forest }}>
              <span aria-hidden="true">📚</span>
              <span>{t.presetNotice}</span>
            </div>
          )}

          {errorText && <div className="field-error" role="alert" style={{ padding: "8px 10px", background: "#fbeeea", borderRadius: 8 }}>{errorText}</div>}

          <div className="form-grid">
            <Field label={t.recipeNameEn} error={errors.nameEn ? t.nameRequired : ""}>
              <input className={`input ${errors.nameEn ? "error" : ""}`} value={form.name.en} maxLength={120} required
                onChange={event => update({ name: { ...form.name, en: event.target.value } })} />
            </Field>
            <Field label={t.recipeNameLt}>
              <input className="input" value={form.name.lt} maxLength={120}
                onChange={event => update({ name: { ...form.name, lt: event.target.value } })} />
            </Field>
          </div>

          <div className="form-grid">
            <Field label={t.slot}>
              <select className="select" value={form.slot} onChange={event => update({ slot: event.target.value })}>
                {SLOTS.map(slot => <option key={slot} value={slot}>{SLOT_META[slot].icon} {SLOT_META[slot][lang]}</option>)}
              </select>
            </Field>
            <Field label={`${t.prepTime} (${t.minutes})`}>
              <input className="input" type="number" inputMode="numeric" min={0} max={600} value={form.prepMinutes}
                onChange={event => update({ prepMinutes: event.target.value })} />
            </Field>
          </div>

          <Field label={t.emoji}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <input className="input input-sm" style={{ width: 68, textAlign: "center", fontSize: 18 }} value={form.emoji}
                maxLength={12} onChange={event => update({ emoji: event.target.value })} aria-label={t.emoji} />
              {EMOJI_CHOICES.map(emoji => (
                <button key={emoji} type="button" className="btn btn-sm btn-soft" style={{ padding: "5px 8px", fontSize: 16 }}
                  onClick={() => update({ emoji })}>{emoji}</button>
              ))}
            </div>
          </Field>

          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="eyebrow">{t.nutrition}</span>
              <button type="button" className="btn btn-xs btn-soft" onClick={() => setScanOpen(true)}>
                📷 {t.scanLabel}
              </button>
            </div>
            <div className="form-grid">
              <Field label={`${t.kcal} 🔥`} error={errors.kcal ? t.invalidNumber : ""}>
                <input className={`input input-sm ${errors.kcal ? "error" : ""}`} type="number" inputMode="decimal" min={0} max={5000}
                  value={form.kcal} onChange={event => update({ kcal: event.target.value })} />
              </Field>
              <Field label={`${t.protein} 💪 (g)`}>
                <input className="input input-sm" type="number" inputMode="decimal" min={0} max={500}
                  value={form.protein} onChange={event => update({ protein: event.target.value })} />
              </Field>
              <Field label={`${t.carbs} 🌾 (g)`}>
                <input className="input input-sm" type="number" inputMode="decimal" min={0} max={800}
                  value={form.carbs} onChange={event => update({ carbs: event.target.value })} />
              </Field>
              <Field label={`${t.fat} 🫒 (g)`}>
                <input className="input input-sm" type="number" inputMode="decimal" min={0} max={500}
                  value={form.fat} onChange={event => update({ fat: event.target.value })} />
              </Field>
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="eyebrow">{t.ingredientsTitle}</span>
              <span className="tiny">{form.ingredients.length}/40</span>
            </div>
            {errors.ingredients && <div className="field-error" style={{ marginBottom: 6 }}>{t.ingredientsRequired}</div>}
            <div className="stack" style={{ gap: 8 }}>
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="card-soft" style={{ padding: 9 }}>
                  <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                    <input className="input input-sm" placeholder={t.ingredientEn} aria-label={t.ingredientEn}
                      value={ingredient.en} maxLength={80}
                      onChange={event => updateIngredient(index, { en: event.target.value })} style={{ flex: 2 }} />
                    <input className="input input-sm" placeholder={t.ingredientLt} aria-label={t.ingredientLt}
                      value={ingredient.lt} maxLength={80}
                      onChange={event => updateIngredient(index, { lt: event.target.value })} style={{ flex: 2 }} />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input input-sm" type="number" inputMode="decimal" min={0.1} max={5000} step={0.1}
                      placeholder={t.amount} aria-label={t.amount} value={ingredient.amount}
                      onChange={event => updateIngredient(index, { amount: event.target.value })} style={{ flex: 1 }} />
                    <select className="select input-sm" aria-label={t.unit} value={ingredient.unit}
                      onChange={event => updateIngredient(index, { unit: event.target.value })} style={{ width: 76 }}>
                      {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ color: C.danger }}
                      onClick={() => setForm(previous => ({ ...previous, ingredients: previous.ingredients.filter((_, i) => i !== index) }))}
                      disabled={form.ingredients.length <= 1} aria-label={t.remove}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-sm btn-soft" style={{ marginTop: 8 }}
              onClick={() => setForm(previous => ({ ...previous, ingredients: [...previous.ingredients, { en: "", lt: "", amount: "", unit: "g" }] }))}
              disabled={form.ingredients.length >= 40}>
              {t.addIngredient}
            </button>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{t.tags}</div>
            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
              <span className="chip sage static">🌿 {TAG_LABELS[lang].vegetarian}</span>
              {ALL_TAGS.filter(tag => tag !== "vegetarian").map(tag => (
                <button key={tag} type="button" className={`chip ${form.tags.includes(tag) ? "active" : ""}`} onClick={() => toggleTag(tag)}>
                  {TAG_LABELS[lang][tag] || tag}
                </button>
              ))}
            </div>
          </div>

          <Field label={`${t.methodTitle} — EN`}>
            <textarea className="textarea" value={form.method.en} maxLength={4000} rows={4}
              onChange={event => update({ method: { ...form.method, en: event.target.value } })} />
          </Field>
          <Field label={`${t.methodTitle} — LT`}>
            <textarea className="textarea" value={form.method.lt} maxLength={4000} rows={4}
              onChange={event => update({ method: { ...form.method, lt: event.target.value } })} />
          </Field>

          {recipe && !recipe.isPreset && (
            <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
              {t.deleteRecipe}
            </button>
          )}
        </form>
      </Sheet>

      <PhotoSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        t={t}
        app={app}
        initialMode="label"
        onApply={result => update({
          kcal: String(Math.round(result.kcal)),
          protein: String(result.protein),
          carbs: String(result.carbs),
          fat: String(result.fat),
        })}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t.deleteRecipe}
        body={t.deleteRecipeConfirm}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await onDelete?.(recipe.id);
            onClose();
          } catch {
            setGeneralError(t.savingFailed);
          }
        }}
      />
    </>
  );
}
