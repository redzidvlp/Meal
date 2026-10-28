import { useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { PRODUCT_USES, parseNutritionLabel, useLabel } from "../lib/products.js";
import { discardImage, prepareImage } from "../lib/photo.js";
import { Field, NumberInput, Sheet } from "./ui.jsx";
import { aiReasonKey } from "../lib/aiReasons.js";

const EMPTY = { name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "", uses: [] };

/**
 * Adds a product from its package. Pasting the label is the fast path on a
 * phone: it fills the four numbers the meal maths needs and nothing else.
 */
export default function ProductSheet({ open, onClose, onSave, onDelete, products = [], lang, t, app }) {
  const [labelText, setLabelText] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The label photo exists only until the numbers are read out of it.
  const [photo, setPhoto] = useState(null);
  const [reading, setReading] = useState("");
  // Why the reading failed, when the machine can say: a wrong key is worth
  // knowing about, and a quota error is worth waiting out.
  const [readReason, setReadReason] = useState("");
  // Which saved product is asking "remove me?" — an accidental tap on ✕ must
  // not throw away the label someone just typed in.
  const [confirmKey, setConfirmKey] = useState("");
  const [removing, setRemoving] = useState("");
  // The key of the product being changed, if any. Keeping the key is what
  // stops an edit from turning one product into a second one under a new slug
  // and leaving every pin pointing at the old name.
  const [editing, setEditing] = useState("");
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const closeSheet = () => {
    setPhoto(current => discardImage(current));
    setReading("");
    setReadReason("");
    setEditing("");
    setConfirmKey("");
    setForm(EMPTY);
    setLabelText("");
    setParsed(null);
    setError("");
    onClose();
  };

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t.scanFailed); return; }
    setError("");
    setReading("preparing");
    try {
      const prepared = await prepareImage(file);
      setPhoto(previous => {
        discardImage(previous);
        return prepared;
      });
      setReadReason("");
      setReading("ready");
    } catch {
      setError(t.scanFailed);
      setReading("");
    }
  };

  /**
   * Reads the photographed label with the AI function, fills the form, then
   * deletes the picture. It is sent once, held in memory for the length of the
   * request, and never saved anywhere.
   */
  const readPhoto = async () => {
    if (!photo?.data) { setError(t.scanNoImage); return; }
    if (!app?.analyzePhoto) { setError(t.photoNeedsAi); return; }
    setError("");
    setReadReason("");
    setReading("reading");
    try {
      const result = await app.analyzePhoto({ image: photo.data, mode: "label" });
      if (!result?.available) {
        setReadReason(result?.reason || "");
        setReading("offline");
        return;
      }
      // Per-100 g is what a product stores. The old function deployment only
      // returns per-portion numbers, so scaling is done here when it can be.
      const per100 = result.per100 || null;
      const serving = Number(result.portionGrams) || 0;
      // The first deployment of the function returned per-portion numbers only,
      // with no basis. Treat that as "serving" whenever a serving size came back.
      const basis = result.basis || (per100 ? "per100" : "serving");
      const scale = !per100 && basis === "serving" && serving > 0 ? 100 / serving : 1;
      const numbers = per100 || result.nutrition || {};
      const round = value => Math.round((Number(value) || 0) * scale * 10) / 10;
      setForm(previous => ({
        ...previous,
        name: previous.name || String(result.name || "").slice(0, 60),
        kcal: numbers.kcal ? String(Math.round((Number(numbers.kcal) || 0) * scale)) : "",
        protein: numbers.protein ? String(round(numbers.protein)) : "",
        carbs: numbers.carbs ? String(round(numbers.carbs)) : "",
        fat: numbers.fat ? String(round(numbers.fat)) : "",
        portion: previous.portion || (serving ? String(serving) : ""),
      }));
      setReading("done");
    } catch (cause) {
      setReadReason(cause?.reason || "");
      setReading("offline");
    } finally {
      // The picture has served its purpose either way.
      setPhoto(current => discardImage(current));
    }
  };

  const update = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const toggleUse = key => setForm(previous => ({
    ...previous,
    uses: previous.uses.includes(key)
      ? previous.uses.filter(use => use !== key)
      : [...previous.uses, key].slice(0, 8),
  }));

  const readLabel = () => {
    const result = parseNutritionLabel(labelText);
    setParsed(result);
    if (!result.kcal && !result.protein && !result.carbs && !result.fat) {
      setError(t.labelUnreadable);
      return;
    }
    setError("");
    setForm({
      ...form,
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
        // An edit keeps the row it came from, even when the name changes.
        key: editing || undefined,
        nameEn: name,
        nameLt: name,
        kcal: kcal || Math.round((Number(form.protein) || 0) * 4 + (Number(form.carbs) || 0) * 4 + (Number(form.fat) || 0) * 9),
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
        unit: "g",
        portionGrams: Number(form.portion) || 0,
        uses: form.uses,
      });
      setForm(EMPTY);
      setLabelText("");
      setParsed(null);
      setEditing("");
      // Whatever happened in the sheet, no picture leaves it.
      setPhoto(current => discardImage(current));
      setReading("");
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

  const startEdit = product => {
    setConfirmKey("");
    setEditing(product.key);
    setLabelText("");
    setParsed(null);
    setError("");
    setForm({
      name: product.nameEn || "",
      kcal: product.kcal ? String(Math.round(product.kcal)) : "",
      protein: product.protein ? String(product.protein) : "",
      carbs: product.carbs ? String(product.carbs) : "",
      fat: product.fat ? String(product.fat) : "",
      portion: product.portionGrams ? String(product.portionGrams) : "",
      uses: Array.isArray(product.uses) ? [...product.uses] : [],
    });
    // The form is below the list, so bring it into view after it has rendered.
    setTimeout(() => {
      const field = document.querySelector("[data-field='product-name']");
      field?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      field?.focus?.({ preventScroll: true });
    }, 60);
  };

  const stopEditing = () => {
    setEditing("");
    setForm(EMPTY);
    setLabelText("");
    setParsed(null);
    setError("");
  };

  const remove = async key => {
    setRemoving(key);
    setError("");
    try {
      await onDelete?.(key);
      setConfirmKey("");
    } catch {
      setError(t.saveFailed);
    } finally {
      setRemoving("");
    }
  };

  const summary = useMemo(() => {
    if (!parsed || !parsed.found?.length) return "";
    return parsed.found.filter(key => key !== "fibre").join(" · ");
  }, [parsed]);

  return (
    <Sheet
      open={open}
      onClose={closeSheet}
      title={editing ? t.editProductTitle : products.length ? t.myProducts : t.addProductTitle}
      subtitle={editing
        ? t.editProductSub
        : products.length ? t.myProductsSub : t.addProductSub}
      footer={(
        <>
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={editing ? stopEditing : closeSheet}>
            {editing ? t.cancel : t.cancel}
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1.4 }} onClick={save} disabled={busy} data-action="save-product">
            {busy ? t.saving : editing ? t.saveChanges : t.saveProduct}
          </button>
        </>
      )}
    >
      {products.length > 0 && (
        <>
          {/* The list is the first thing you see, because "where did my product
              go, and how do I get rid of it" is the question this sheet gets. */}
          <div className="stack" style={{ gap: 6 }} data-products="list">
            {products.map(product => {
              const confirming = confirmKey === product.key;
              return (
                <div key={product.key} className={`product-row ${confirming ? "asking" : ""}`} data-product-row={product.key}>
                  <div style={{ minWidth: 0 }}>
                    <div className="product-name">{lang === "lt" && product.nameLt ? product.nameLt : product.nameEn}</div>
                    {confirming ? (
                      <div className="tiny product-ask">{t.deleteProductConfirm}</div>
                    ) : (
                      <div className="tiny">
                        {Math.round(product.kcal)} kcal · 💪 {product.protein} g · 🌾 {product.carbs} g · 🫒 {product.fat} g
                        {product.portionGrams ? ` · ${product.portionGrams} g` : ""}
                        {(product.uses || []).length ? ` · ${product.uses.map(use => useLabel(use, lang)).join(", ")}` : ""}
                      </div>
                    )}
                  </div>
                  {confirming ? (
                    <div className="row" style={{ gap: 5, flexShrink: 0 }}>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={() => setConfirmKey("")} disabled={removing === product.key}>
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        data-action="delete-product"
                        onClick={() => remove(product.key)}
                        disabled={removing === product.key}
                      >
                        {removing === product.key ? t.saving : t.remove}
                      </button>
                    </div>
                  ) : (
                    <div className="product-actions">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        aria-label={`${t.editProduct} ${product.nameEn}`}
                        data-action="edit-product"
                        onClick={() => startEdit(product)}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        aria-label={`${t.remove} ${product.nameEn}`}
                        data-action="delete-product-ask"
                        onClick={() => setConfirmKey(product.key)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="divider" />
          {editing ? (
            <button type="button" className="btn btn-xs btn-ghost" data-action="new-product" style={{ marginBottom: 8 }} onClick={stopEditing}>
              {t.backToAdd}
            </button>
          ) : (
            <div className="eyebrow" style={{ marginBottom: 8 }}>＋ {t.addAnotherProduct}</div>
          )}
        </>
      )}

      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-photo="camera" />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} data-photo="gallery" />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          data-action="photo-label"
          style={{ flex: 1 }}
          disabled={reading === "preparing" || reading === "reading"}
          onClick={() => cameraRef.current?.click()}
        >
          📷 {t.photoLabel}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-soft"
          disabled={reading === "preparing" || reading === "reading"}
          onClick={() => galleryRef.current?.click()}
        >
          🖼️ {t.scanPick}
        </button>
      </div>

      {photo && (
        <div className="photo-frame" style={{ marginBottom: 10 }}>
          <img src={photo.data} alt="" className="photo-preview" />
          <button type="button" className="btn btn-sm btn-ghost photo-retake" onClick={() => cameraRef.current?.click()}>
            ↻ {t.scanRetake}
          </button>
        </div>
      )}

      {photo && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          data-action="read-photo"
          style={{ marginBottom: 10 }}
          onClick={readPhoto}
          disabled={reading === "reading"}
        >
          {reading === "reading" ? `⏳ ${t.scanAnalyzing}` : `✨ ${t.scanAnalyze}`}
        </button>
      )}

      {reading === "done" && <p className="tiny" style={{ color: C.leaf, marginBottom: 8 }} data-note="photo-read">✓ {t.photoReadAndDiscarded}</p>}
      {reading === "offline" && (
        <p className="tiny" style={{ color: C.amber, marginBottom: 8 }}>
          {t.photoNeedsAi}
          {aiReasonKey(readReason) ? ` ${t[aiReasonKey(readReason)]}` : ""}
        </p>
      )}

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
      <p className="tiny" style={{ marginTop: 6 }}>{t.orTypeInstead}</p>

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

      <div className="divider" />

      <Field label={`🍽️ ${t.productUses}`} hint={t.productUsesHint}>
        <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
          {PRODUCT_USES.map(use => (
            <button
              key={use.key}
              type="button"
              className={`chip ${form.uses.includes(use.key) ? "active" : ""}`}
              data-use={use.key}
              onClick={() => toggleUse(use.key)}
            >
              {use.icon} {useLabel(use.key, lang)}
            </button>
          ))}
        </div>
      </Field>
      {form.uses.length === 0 && <p className="tiny" style={{ marginTop: 6 }}>{t.productUsesEmpty}</p>}
    </Sheet>
  );
}
