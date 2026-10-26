import { useMemo, useState } from "react";
import { C } from "../theme.js";
import { parseNutritionLabel } from "../lib/products.js";
import { Field, NumberInput, Sheet } from "./ui.jsx";

const EMPTY = { name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "" };

/**
 * Adds a product from its package. Pasting the label is the fast path on a
 * phone: it fills the four numbers the meal maths needs and nothing else.
 */
export default function ProductSheet({ open, onClose, onSave, onDelete, products = [], lang, t }) {
  const [labelText, setLabelText] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = key => value => setForm(previous => ({ ...previous, [key]: value }));

  const readLabel = () => {
    const result = parseNutritionLabel(labelText);
    setParsed(result);
    if (!result.kcal && !result.protein && !result.carbs && !result.fat) {
      setError(t.labelUnreadable);
      return;
    }
    setError("");
    setForm({
      name: result.name || form.name,
      kcal: result.kcal ? String(result.kcal) : "",
      protein: result.protein ? String(result.protein) : "",
      carbs: result.carbs ? String(result.carbs) : "",
      fat: result.fat ? String(result.fat) : "",
      portion: result.portionGrams ? String(result.portionGrams) : "",
    });
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { setError(t.nameRequired); return; }
    const kcal = Number(form.kcal) || 0;
    const macros = (Number(form.protein) || 0) + (Number(form.carbs) || 0) + (Number(form.fat) || 0);
    if (kcal <= 0 && macros <= 0) { setError(t.numbersRequired); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({
        nameEn: name,
        nameLt: name,
        kcal: kcal || Math.round((Number(form.protein) || 0) * 4 + (Number(form.carbs) || 0) * 4 + (Number(form.fat) || 0) * 9),
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
        unit: "g",
        portionGrams: Number(form.portion) || 0,
      });
      setForm(EMPTY);
      setLabelText("");
      setParsed(null);
      onClose();
    } catch (cause) {
      // A project that has not run the newer upgrade SQL has no products
      // table; say so instead of a generic failure.
      const message = String(cause?.message || "");
      setError(/products|schema cache|PGRST|relation/i.test(message) ? t.productTableMissing : t.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => {
    if (!parsed || !parsed.found?.length) return "";
    return parsed.found.filter(key => key !== "fibre").join(" · ");
  }, [parsed]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.addProductTitle}
      subtitle={t.addProductSub}
      footer={(
        <>
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1.4 }} onClick={save} disabled={busy}>
            {busy ? t.saving : t.saveProduct}
          </button>
        </>
      )}
    >
      <Field label={t.pasteLabel} hint={t.pasteLabelHint}>
        <textarea
          className="textarea"
          data-field="label"
          rows={5}
          value={labelText}
          placeholder={t.pasteLabelPlaceholder}
          onChange={event => setLabelText(event.target.value)}
        />
      </Field>
      <button
        type="button"
        className="btn btn-sm btn-soft btn-block"
        data-action="read-label"
        style={{ marginTop: 8 }}
        onClick={readLabel}
        disabled={!labelText.trim()}
      >
        🔍 {t.readLabel}
      </button>

      {parsed && summary && (
        <p className="tiny" style={{ marginTop: 8, color: C.leaf }}>
          ✓ {t.readFound}: {summary}
        </p>
      )}
      {error && <p className="tiny" style={{ marginTop: 8, color: C.danger }}>{error}</p>}

      <div className="divider" />

      <Field label={t.productName} hint={t.productNameHint}>
        <input
          className="input"
          data-field="product-name"
          value={form.name}
          maxLength={60}
          placeholder={t.productNamePlaceholder}
          onChange={event => update("name")(event.target.value)}
        />
      </Field>

      <p className="tiny" style={{ margin: "10px 0 6px" }}>{t.productPerHundred}</p>
      <div className="form-grid">
        <Field label={`🔥 ${t.caloriesShort || t.kcal}`}>
          <NumberInput value={form.kcal} min={0} max={900} ariaLabel={t.kcal} onChange={value => update("kcal")(value)} />
        </Field>
        <Field label={`💪 ${t.protein}`}>
          <NumberInput value={form.protein} min={0} max={100} ariaLabel={t.protein} onChange={value => update("protein")(value)} />
        </Field>
        <Field label={`🌾 ${t.carbs}`}>
          <NumberInput value={form.carbs} min={0} max={100} ariaLabel={t.carbs} onChange={value => update("carbs")(value)} />
        </Field>
        <Field label={`🫒 ${t.fat}`}>
          <NumberInput value={form.fat} min={0} max={100} ariaLabel={t.fat} onChange={value => update("fat")(value)} />
        </Field>
      </div>
      <div style={{ height: 10 }} />
      <Field label={t.packSize} hint={t.packSizeHint}>
        <NumberInput value={form.portion} min={0} max={2000} ariaLabel={t.packSize} onChange={value => update("portion")(value)} />
      </Field>

      {products.length > 0 && (
        <>
          <div className="divider" />
          <div className="eyebrow" style={{ marginBottom: 7 }}>{t.myProducts}</div>
          <div className="stack" style={{ gap: 6 }}>
            {products.map(product => (
              <div key={product.key} className="row-between product-row">
                <div style={{ minWidth: 0 }}>
                  <div className="product-name">{product.nameEn}</div>
                  <div className="tiny">
                    {Math.round(product.kcal)} kcal · 💪 {product.protein} g · 🌾 {product.carbs} g · 🫒 {product.fat} g
                    {product.portionGrams ? ` · ${product.portionGrams} g` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  aria-label={`${t.remove} ${product.nameEn}`}
                  onClick={() => onDelete(product.key)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
