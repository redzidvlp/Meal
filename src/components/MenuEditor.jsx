import { useEffect, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { sanitizeMenu } from "../lib/validate.js";
import { Field, Sheet, ConfirmDialog } from "./ui.jsx";

const emptySlotEntry = () => ({ mode: "both", both: "", R: "", I: "" });

const fromMenu = menu => {
  const slots = {};
  for (const slot of SLOTS) {
    const entry = menu?.items?.[slot];
    if (!entry) { slots[slot] = emptySlotEntry(); continue; }
    if (entry.both) slots[slot] = { mode: "both", both: entry.both, R: "", I: "" };
    else slots[slot] = { mode: "split", both: "", R: entry.R || "", I: entry.I || "" };
  }
  return {
    id: menu?.id || null,
    presetKey: menu?.presetKey || (menu?.isPreset ? menu.id : null),
    isPreset: !!menu?.isPreset && !menu?.presetKey,
    name: { en: menu?.name?.en || "", lt: menu?.name?.lt || "" },
    emoji: menu?.emoji || "🍱",
    slots,
  };
};

export default function MenuEditor({ open, menu, recipes, lang, t, onClose, onSave, onDelete, onReset }) {
  const [form, setForm] = useState(() => fromMenu(menu));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(fromMenu(menu));
    setError("");
    setSaving(false);
    setConfirmDelete(false);
  }, [open, menu]);

  const updateSlot = (slot, patch) =>
    setForm(previous => ({ ...previous, slots: { ...previous.slots, [slot]: { ...previous.slots[slot], ...patch } } }));

  const buildItems = () => {
    const items = {};
    for (const slot of SLOTS) {
      const entry = form.slots[slot];
      if (!entry) continue;
      if (entry.mode === "both" && entry.both) items[slot] = { both: entry.both };
      else if (entry.mode === "split" && (entry.R || entry.I)) {
        items[slot] = {};
        if (entry.R) items[slot].R = entry.R;
        if (entry.I) items[slot].I = entry.I;
      }
    }
    return items;
  };

  const submit = async () => {
    setError("");
    const payload = {
      id: form.id && !form.id.startsWith("menu-") || form.id ? form.id : undefined,
      presetKey: form.presetKey,
      name: { en: form.name.en.trim(), lt: form.name.lt.trim() },
      emoji: form.emoji,
      items: buildItems(),
    };
    const check = sanitizeMenu(payload, { existingId: menu?.id });
    if (!check.ok) {
      setError(t.menuEmpty);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...payload, id: form.presetKey ? undefined : payload.id });
      onClose();
    } catch (failure) {
      setError(failure?.errors ? t.menuEmpty : t.savingFailed);
    } finally {
      setSaving(false);
    }
  };

  const recipeOptions = slot => recipes.filter(recipe => recipe.slot === slot);
  const sorted = [...recipes].sort((a, b) => (a.name?.[lang] || a.name?.en || "").localeCompare(b.name?.[lang] || b.name?.en || "", lang === "lt" ? "lt" : "en"));

  const slotRow = slot => {
    const entry = form.slots[slot];
    const options = recipeOptions(slot).length >= 2 ? recipeOptions(slot) : sorted;
    return (
      <div key={slot} className="menu-edit-slot">
        <div className="row-between" style={{ marginBottom: 6 }}>
          <span className="slot-label">{SLOT_META[slot].icon} {SLOT_META[slot][lang]}</span>
          <div className="mini-toggle">
            {["both", "split"].map(mode => (
              <button
                key={mode}
                type="button"
                className={`mini-toggle-btn ${entry.mode === mode ? "active" : ""}`}
                onClick={() => updateSlot(slot, { mode })}
              >
                {mode === "both" ? t.sameForBoth : `✂️ ${t.splitShort || "Split"}`}
              </button>
            ))}
          </div>
        </div>
        {entry.mode === "both" ? (
          <select className="select" value={entry.both} onChange={event => updateSlot(slot, { both: event.target.value })}>
            <option value="">{t.menuEmpty}</option>
            {options.map(recipe => (
              <option key={recipe.id} value={recipe.id}>{recipe.emoji} {recipe.name?.[lang] || recipe.name?.en}</option>
            ))}
          </select>
        ) : (
          <div className="form-grid">
            {["R", "I"].map(person => (
              <select
                key={person}
                className="select"
                value={entry[person]}
                onChange={event => updateSlot(slot, { [person]: event.target.value })}
                aria-label={`${SLOT_META[slot][lang]} ${t.personFallback?.[person] || person}`}
              >
                <option value="">—</option>
                {options.map(recipe => (
                  <option key={recipe.id} value={recipe.id}>{recipe.emoji} {recipe.name?.[lang] || recipe.name?.en}</option>
                ))}
              </select>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={menu ? t.menuEdit : t.menuNew}
        subtitle={form.presetKey ? t.menuOverrideNote : t.menuSlots}
        footer={(
          <>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1.4 }} onClick={submit} disabled={saving}>
              {saving ? t.saving : t.save}
            </button>
          </>
        )}
      >
        <div className="form-grid">
          <Field label={t.menuNameEn}>
            <input className="input" value={form.name.en} maxLength={120}
              onChange={event => setForm(previous => ({ ...previous, name: { ...previous.name, en: event.target.value } }))} />
          </Field>
          <Field label={t.menuNameLt}>
            <input className="input" value={form.name.lt} maxLength={120}
              onChange={event => setForm(previous => ({ ...previous, name: { ...previous.name, lt: event.target.value } }))} />
          </Field>
        </div>

        <div className="eyebrow" style={{ margin: "16px 0 8px" }}>{t.menuSlots}</div>
        <div className="stack" style={{ gap: 12 }}>{SLOTS.map(slotRow)}</div>

        {error && <div className="field-error" style={{ marginTop: 10 }} role="alert">{error}</div>}

        <div className="row" style={{ gap: 8, marginTop: 18 }}>
          {menu && !form.presetKey && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
              {t.deleteRecipe}
            </button>
          )}
          {form.presetKey && menu?.overridden && (
            <button type="button" className="btn btn-sm btn-soft" onClick={() => { onReset(form.presetKey); onClose(); }}>
              ↺ {t.menuReset}
            </button>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.menuDeleted}
        body={t.menuDeleteConfirm}
        confirmLabel={t.deleteRecipe}
        cancelLabel={t.cancel}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await onDelete(menu.id);
            onClose();
          } catch {
            // handled upstream
          }
        }}
      />
    </>
  );
}
