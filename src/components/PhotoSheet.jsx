import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { Sheet } from "./ui.jsx";

const MAX_EDGE = 1024;
const QUALITY = 0.82;

/** Downscales a picked photo in the browser so uploads stay small and fast on mobile. */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("unreadable");
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const data = canvas.toDataURL("image/jpeg", QUALITY);
  return { data, width, height };
}

const emptyNutrition = { kcal: "", protein: "", carbs: "", fat: "" };

export default function PhotoSheet({ open, onClose, t, app, initialMode = "label", onApply }) {
  const [mode, setMode] = useState(initialMode);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | ready | analyzing | result | offline
  const [error, setError] = useState("");
  const [values, setValues] = useState(emptyNutrition);
  const [name, setName] = useState("");
  const [portion, setPortion] = useState("");
  const [source, setSource] = useState("");
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPhoto(null);
    setBusy(false);
    setStatus("idle");
    setError("");
    setValues(emptyNutrition);
    setName("");
    setPortion("");
    setSource("");
  }, [open, initialMode]);

  const hasValues = useMemo(() => Number(values.kcal) > 0, [values.kcal]);

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.scanFailed);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      setPhoto(prepared);
      setStatus("ready");
    } catch {
      setError(t.scanFailed);
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!photo?.data) {
      setError(t.scanNoImage);
      return;
    }
    setError("");
    setStatus("analyzing");
    try {
      const result = await app.analyzePhoto({ image: photo.data, mode });
      if (!result?.available) {
        setStatus("offline");
        return;
      }
      const nutrition = result.nutrition || {};
      setValues({
        kcal: nutrition.kcal ? String(Math.round(nutrition.kcal)) : "",
        protein: nutrition.protein ? String(nutrition.protein) : "",
        carbs: nutrition.carbs ? String(nutrition.carbs) : "",
        fat: nutrition.fat ? String(nutrition.fat) : "",
      });
      if (result.name) setName(String(result.name).slice(0, 80));
      setSource(result.mode === "label" ? t.scanLabelDetected : "");
      setStatus("result");
    } catch {
      setStatus("offline");
      setError(t.scanFailed);
    }
  };

  const apply = () => {
    if (!hasValues) {
      setError(t.scanFailed);
      return;
    }
    onApply?.({
      kcal: Number(values.kcal) || 0,
      protein: Number(values.protein) || 0,
      carbs: Number(values.carbs) || 0,
      fat: Number(values.fat) || 0,
      name: name.trim(),
      portionGrams: Number(portion) || 0,
      mode,
      photo: photo?.data || null,
    });
    onClose?.();
  };

  const update = key => event => setValues(previous => ({ ...previous, [key]: event.target.value.replace(/[^0-9.,]/g, "") }));

  return (
    <Sheet open={open} onClose={onClose} title={t.scanTitle} subtitle={t.scanSub}>
      <div className="segmented" role="tablist" aria-label={t.scanTitle} style={{ marginBottom: 14 }}>
        {[
          { value: "meal", label: t.scanMeal, icon: "🍽️" },
          { value: "label", label: t.scanLabel, icon: "🏷️" },
        ].map(option => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={mode === option.value}
            className={`segment ${mode === option.value ? "active" : ""}`}
            onClick={() => { setMode(option.value); setStatus(photo ? "ready" : "idle"); }}
          >
            <span aria-hidden="true">{option.icon}</span> {option.label}
          </button>
        ))}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onFile} />

      {photo ? (
        <div className="photo-frame">
          <img src={photo.data} alt="" className="photo-preview" />
          <button type="button" className="btn btn-sm btn-ghost photo-retake" onClick={() => cameraRef.current?.click()}>
            ↻ {t.scanRetake}
          </button>
        </div>
      ) : (
        <div className="scan-drop">
          <div className="scan-art" aria-hidden="true">{mode === "label" ? "🏷️" : "🍲"}</div>
          <p className="scan-hint">{t.scanHint}</p>
          <div className="scan-actions">
            <button type="button" className="btn btn-primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
              📷 {t.scanTake}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => galleryRef.current?.click()} disabled={busy}>
              🖼️ {t.scanPick}
            </button>
          </div>
        </div>
      )}

      {error && <div className="field-error" role="alert" style={{ marginTop: 10 }}>{error}</div>}

      {photo && status !== "offline" && (
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={analyze} disabled={status === "analyzing"}>
          {status === "analyzing" ? `⏳ ${t.scanAnalyzing}` : `✨ ${t.scanAnalyze}`}
        </button>
      )}

      {status === "offline" && (
        <div className="scan-offline">
          <div className="scan-offline-title">🔌 {t.scanUnavailableTitle}</div>
          <p>{t.scanUnavailableBody}</p>
        </div>
      )}

      {(status === "offline" || status === "result") && (
        <div className="scan-fields">
          {source && <div className="scan-source">{source}</div>}
          <div className="form-grid">
            <label className="field">
              <span className="eyebrow">{t.kcal}</span>
              <input className="input" inputMode="numeric" value={values.kcal} onChange={update("kcal")} placeholder="0" />
            </label>
            <label className="field">
              <span className="eyebrow">{t.proteinShort || "Protein"}</span>
              <input className="input" inputMode="decimal" value={values.protein} onChange={update("protein")} placeholder="g" />
            </label>
            <label className="field">
              <span className="eyebrow">{t.carbsShort || "Carbs"}</span>
              <input className="input" inputMode="decimal" value={values.carbs} onChange={update("carbs")} placeholder="g" />
            </label>
            <label className="field">
              <span className="eyebrow">{t.fatShort || "Fat"}</span>
              <input className="input" inputMode="decimal" value={values.fat} onChange={update("fat")} placeholder="g" />
            </label>
          </div>
          {mode === "meal" && (
            <>
              <label className="field">
                <span className="eyebrow">{t.recipeNameEn}</span>
                <input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Photo meal" />
              </label>
              <label className="field">
                <span className="eyebrow">{t.portionGrams || "Portion"}</span>
                <input className="input" inputMode="numeric" value={portion} onChange={event => setPortion(event.target.value.replace(/[^0-9]/g, ""))} placeholder="g" />
              </label>
            </>
          )}
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={apply} disabled={!hasValues}>
            ✓ {t.scanApply}
          </button>
        </div>
      )}

      {app?.isDemo && (
        <p className="tiny" style={{ textAlign: "center", marginTop: 12, color: C.muted }}>{t.scanDemoNote}</p>
      )}
      <p className="tiny scan-privacy">{t.scanPrivacy}</p>
    </Sheet>
  );
}
