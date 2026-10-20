import { useEffect, useMemo, useRef, useState } from "react";
import { C, UNITS } from "../theme.js";
import { fmtNum, interpolate } from "../lib/format.js";
import { isLow, pantryCoverage, stockRatio } from "../engine/pantry.js";
import { sanitizeSearch } from "../lib/validate.js";
import { ConfirmDialog, EmptyState, Field, Sheet, Stepper } from "./ui.jsx";

const stepFor = unit => (unit === "vnt" ? 1 : 50);

function ItemForm({ open, item, lang, t, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ nameEn: "", nameLt: "", unit: "g", quantity: "0", lowThreshold: "100" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(item ? {
      nameEn: item.nameEn || "",
      nameLt: item.nameLt || "",
      unit: item.unit || "g",
      quantity: String(item.quantity ?? 0),
      lowThreshold: String(item.lowThreshold ?? 0),
      key: item.key,
    } : { nameEn: "", nameLt: "", unit: "g", quantity: "0", lowThreshold: "100" });
  }, [open, item]);

  const submit = async () => {
    if (!form.nameEn.trim()) { setError(t.itemName); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({
        key: form.key,
        nameEn: form.nameEn.trim(),
        nameLt: form.nameLt.trim() || form.nameEn.trim(),
        unit: form.unit,
        quantity: Number(String(form.quantity).replace(",", ".")) || 0,
        lowThreshold: Number(String(form.lowThreshold).replace(",", ".")) || 0,
      });
      onClose();
    } catch {
      setError(t.savingFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={item ? t.edit : t.addItem}
        subtitle={t.pantrySub}
        footer={(
          <>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1.3 }} onClick={submit} disabled={saving}>{saving ? t.saving : t.save}</button>
          </>
        )}
      >
        <div className="stack" style={{ gap: 13 }}>
          <Field label={t.itemName}>
            <input className="input" value={form.nameEn} maxLength={80} placeholder={t.itemNamePlaceholder}
              onChange={event => setForm({ ...form, nameEn: event.target.value })} />
          </Field>
          <Field label={`${t.itemName} — LT`}>
            <input className="input" value={form.nameLt} maxLength={80}
              onChange={event => setForm({ ...form, nameLt: event.target.value })} />
          </Field>
          <div className="form-grid">
            <Field label={t.quantity}>
              <input className="input" type="number" inputMode="decimal" min={0} max={100000} step={0.1}
                value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} />
            </Field>
            <Field label={t.unit}>
              <select className="select" value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })}>
                {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t.lowThreshold} hint={t.thresholdHint}>
            <input className="input" type="number" inputMode="decimal" min={0} max={100000} step={0.1}
              value={form.lowThreshold} onChange={event => setForm({ ...form, lowThreshold: event.target.value })} />
          </Field>
          {error && <div className="field-error">{error}</div>}
          {item && (
            <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>{t.delete}</button>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title={t.delete}
        body={t.deleteItemConfirm}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await onDelete(item.itemKey || `${item.key}|${item.unit}`);
            onClose();
          } catch {
            setError(t.savingFailed);
          }
        }}
      />
    </>
  );
}

export default function PantryTab({ app, lang, t, onGoShopping }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [confirmRemove, setConfirmRemove] = useState(null);
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const search = sanitizeSearch(query);
  const items = useMemo(() => {
    return app.pantry
      .filter(item => {
        if (!search) return true;
        const text = `${item.nameEn} ${item.nameLt}`.toLocaleLowerCase();
        return text.includes(search);
      })
      .sort((a, b) => {
        const lowA = isLow(a) ? 0 : 1;
        const lowB = isLow(b) ? 0 : 1;
        if (lowA !== lowB) return lowA - lowB;
        return (lang === "lt" ? a.nameLt : a.nameEn).localeCompare(lang === "lt" ? b.nameLt : b.nameEn, lang === "lt" ? "lt" : "en");
      });
  }, [app.pantry, search, lang]);

  const lowCount = app.lowPantry.length;

  const queueSave = (item, quantity) => {
    const key = item.itemKey || `${item.key}|${item.unit}`;
    setDrafts(previous => ({ ...previous, [key]: quantity }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      try {
        await app.savePantryItem({
          key: item.key,
          nameEn: item.nameEn,
          nameLt: item.nameLt,
          unit: item.unit,
          quantity,
          lowThreshold: item.lowThreshold,
        });
      } catch {
        // The hook already showed an error toast.
      } finally {
        setDrafts(previous => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }
    }, 450);
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = item => { setEditing(item); setFormOpen(true); };

  return (
    <div className="fade-in">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">🥫 {t.navPantry}</div>
          <h1 className="page-title">{t.pantryTitle}</h1>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={openNew}>＋ {t.addItem}</button>
      </div>
      <p className="page-sub">{t.pantrySub}</p>

      {lowCount > 0 ? (
        <div className="low-callout">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div>
              <b>⏰ {t.lowCalloutTitle}</b>
              <div style={{ marginTop: 3 }}>{t.lowCalloutBody}</div>
              <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 7 }}>
                {app.lowPantry.slice(0, 8).map(item => (
                  <span key={item.itemKey || `${item.key}|${item.unit}`} className="chip amber static" style={{ padding: "3px 8px", fontSize: 10 }}>
                    {lang === "lt" ? item.nameLt : item.nameEn} · {fmtNum(item.quantity)} {item.unit}
                  </span>
                ))}
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={onGoShopping} aria-label={t.navShopping}>🛒</button>
          </div>
        </div>
      ) : app.pantry.length > 0 ? (
        <div className="card card-pad" style={{ marginBottom: 12, background: "#f1f6ec", borderColor: "#d9e6d2" }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 14, color: C.forest }}>✓ {t.allGood}</div>
          <div className="tiny" style={{ marginTop: 2 }}>{t.allGoodHint}</div>
        </div>
      ) : null}

      {app.pantry.length > 0 && (
        <input
          className="input input-sm"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t.searchPantry}
          aria-label={t.searchPantry}
          style={{ marginBottom: 10 }}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="🫙"
          title={app.pantry.length ? t.noPantryMatch : t.emptyPantry}
          body={app.pantry.length ? null : t.emptyPantryHint}
          action={app.pantry.length ? null : <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>＋ {t.addItem}</button>}
        />
      ) : (
        <div className="shop-list">
          {items.map(item => {
            const key = item.itemKey || `${item.key}|${item.unit}`;
            const quantity = drafts[key] ?? item.quantity;
            const low = isLow({ ...item, quantity });
            const ratio = stockRatio({ ...item, quantity });
            const coverage = pantryCoverage({ ...item, quantity }, app.plan);
            const color = low ? C.coral : C.leaf;
            return (
              <div key={key} className={`pantry-row ${low ? "low" : ""}`}>
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{lang === "lt" ? item.nameLt : item.nameEn}</span>
                      {low && <span className="stock-badge" style={{ color: C.amber, borderColor: "#e8d4ac", background: "#fdf8ee" }}>{t.low}</span>}
                    </div>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {coverage.uses > 0
                        ? interpolate(t.usedInMeals, { n: coverage.uses })
                        : t.emptyPantryStock}
                      {coverage.portionsLeft != null && ` · ~${coverage.portionsLeft} ${t.servings}`}
                    </div>
                  </div>
                  <span className="qty-value" style={{ color, fontSize: 13 }}>
                    {fmtNum(quantity)} <span className="tiny">{item.unit}</span>
                  </span>
                </div>

                <div className="pantry-bar" style={{ marginTop: 2 }}>
                  <div style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
                </div>

                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className="tiny">{t.lowThreshold}: {fmtNum(item.lowThreshold)} {item.unit}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <Stepper
                      value={quantity}
                      step={stepFor(item.unit)}
                      min={0}
                      label={t.adjustHint}
                      onChange={value => queueSave(item, value)}
                    />
                    <button type="button" className="icon-btn" onClick={() => openEdit(item)} aria-label={t.edit} style={{ width: 28, height: 28, fontSize: 12 }}>✏️</button>
                    <button type="button" className="icon-btn" onClick={() => setConfirmRemove(item)} aria-label={t.delete} style={{ width: 28, height: 28, fontSize: 12 }}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="tiny" style={{ textAlign: "center", marginTop: 14 }}>{t.adjustHint}</p>

      <ItemForm
        open={formOpen}
        item={editing}
        lang={lang}
        t={t}
        onClose={() => setFormOpen(false)}
        onSave={app.savePantryItem}
        onDelete={app.deletePantryItem}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title={t.delete}
        body={t.deleteItemConfirm}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        onClose={() => setConfirmRemove(null)}
        onConfirm={async () => {
          const item = confirmRemove;
          setConfirmRemove(null);
          if (item) {
            try {
              await app.deletePantryItem(item.itemKey || `${item.key}|${item.unit}`);
            } catch {
              // handled by the hook
            }
          }
        }}
      />
    </div>
  );
}
