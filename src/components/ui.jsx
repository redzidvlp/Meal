import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, TAG_LABELS } from "../theme.js";
import { tagLabel } from "../lib/labels.js";
import { fmtNum } from "../lib/format.js";

export function Sheet({ open, onClose, title, subtitle, children, footer, labelledBy = "sheet-title" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={title ? labelledBy : undefined}>
        <div className="grabber" aria-hidden="true" />
        {(title || onClose) && (
          <div className="sheet-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && <h2 className="sheet-title" id={labelledBy}>{title}</h2>}
              {subtitle && <div className="sheet-sub">{subtitle}</div>}
            </div>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, labelledBy = "modal-title" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop center" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={title ? labelledBy : undefined}>
        {(title || onClose) && (
          <div className="modal-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && <h2 className="modal-title" id={labelledBy}>{title}</h2>}
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, danger = true, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={onClose}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? "btn-accent" : "btn-primary"}`} style={{ flex: 1 }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.inkSoft }}>{body}</p>
    </Modal>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return createPortal(
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.message}</div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon = "🍽️", title, body, action }) {
  return (
    <div className="empty-state">
      <div className="big" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Chip({ active, children, onClick, tone = "", title, as = "button", ...rest }) {
  const className = `chip ${active ? "active" : ""} ${tone} ${onClick ? "" : "static"}`.trim();
  if (as === "span") return <span className={className} title={title} {...rest}>{children}</span>;
  return (
    <button type="button" className={className} onClick={onClick} title={title} {...rest}>
      {children}
    </button>
  );
}

export function TagChips({ tags = [], lang, labels = [], limit = 3 }) {
  return (
    <>
      {tags.slice(0, limit).map(tag => (
        <Chip as="span" key={tag} tone={tag === "vegetarian" ? "sage" : tag === "high-protein" ? "sky" : ""}>
          {tag.startsWith("x-") ? "🏷 " : ""}{tagLabel(tag, lang, labels)}
        </Chip>
      ))}
    </>
  );
}

export function MacroPills({ recipe, t, compact = false }) {
  if (!recipe) return null;
  const items = [
    ["🔥", `${fmtNum(recipe.kcal)} ${t.kcal}`],
    ["💪", `${fmtNum(recipe.protein)}g`],
    ...(compact ? [] : [["🌾", `${fmtNum(recipe.carbs)}g`], ["🫒", `${fmtNum(recipe.fat)}g`]]),
  ];
  return (
    <div className="macro-row">
      {items.map(([icon, value]) => (
        <span className="macro-pill" key={icon}><span aria-hidden="true">{icon}</span>{value}</span>
      ))}
    </div>
  );
}

export function PersonBadge({ personKey, name, small = false }) {
  return (
    <span className="row" style={{ gap: 5, minWidth: 0 }}>
      <span className="person-dot" style={{ background: personKey === "R" ? C.R : C.I }} />
      <span style={{
        fontSize: small ? 10.5 : 11.5,
        fontWeight: 700,
        color: personKey === "R" ? C.R : C.I,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {name}
      </span>
    </span>
  );
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <span aria-hidden="true">{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error && <div className="field-error">{error}</div>}
      {hint && !error && <div className="tiny">{hint}</div>}
    </div>
  );
}

export function NumberInput({ value, onChange, min = 0, max = 9999, step = 1, id, ariaLabel }) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className="input input-sm"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 100000, label }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))} aria-label="Decrease">−</button>
      <span className="qty-value">{fmtNum(value)}</span>
      <button type="button" onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} aria-label="Increase">+</button>
    </div>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const copy = async text => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, copy };
}

export function AutoTextarea({ value, onChange, placeholder, style, maxLength, id }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={2}
      style={{ ...style, resize: "none", overflow: "hidden" }}
    />
  );
}

export function parseNumber(value) {
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}
