import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, TAG_LABELS } from "../theme.js";
import { tagLabel } from "../lib/labels.js";
import { DRAG_SLOP, dismissOnRelease } from "../lib/gesture.js";
import { fmtNum } from "../lib/format.js";


/**
 * Locks the page behind a sheet or a dialog.
 *
 * `overflow: hidden` on <body> stops a desktop wheel but not iOS: Safari keeps
 * scrolling the document, which is why the day plan slid around behind an open
 * recipe. Pinning the body in place is the reliable version — the page keeps
 * its scroll position and gets it back untouched when the sheet closes.
 */
const SCROLL_LOCK_STYLE = {
  touchAction: "pan-y",
  overscrollBehavior: "contain",
  overflowX: "hidden",
  // A flex child must be allowed to shrink, or the sheet clips instead of
  // scrolling; the same value is in the stylesheet, this keeps it honest.
  minHeight: 0,
};

function useBodyLock(open) {
  useEffect(() => {
    if (!open) return undefined;
    const body = document.body;
    const scrollY = window.scrollY || 0;
    body.classList.add("is-locked");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.overflow = "hidden";
    return () => {
      body.classList.remove("is-locked");
      body.style.position = "";
      body.style.top = "";
      body.style.overflow = "";
      // Only move the page if it actually moved; jsdom has no scrollTo.
      if ((window.scrollY || 0) !== scrollY) window.scrollTo(0, scrollY);
    };
  }, [open]);
}

export function Sheet({ open, onClose, title, subtitle, children, footer, labelledBy = "sheet-title", dismissible = true }) {
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const closeTimer = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useBodyLock(open);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // A drag moves the element itself rather than React state: sixty re-renders
  // a second would leave the sheet lagging behind the finger.
  const moveTo = (y, animate) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = animate ? "transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s ease" : "none";
    sheet.style.transform = y ? `translateY(${y}px)` : "";
  };

  const sheetHeight = () => sheetRef.current?.getBoundingClientRect().height || 520;

  const finishDrag = ({ y, velocity }) => {
    if (!(y > 0)) { moveTo(0, true); return; }
    if (!dismissOnRelease({ y, velocity, height: sheetHeight() })) { moveTo(0, true); return; }
    // Far enough, or flicked: slide it out and close.
    moveTo(sheetHeight(), true);
    if (sheetRef.current) sheetRef.current.style.opacity = "0";
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeRef.current?.();
      // A parent that ignores onClose must not leave an invisible sheet behind.
      closeTimer.current = setTimeout(() => {
        const sheet = sheetRef.current;
        if (!sheet?.isConnected) return;
        sheet.style.opacity = "";
        moveTo(0, true);
      }, 260);
    }, 170);
  };

  /**
   * Touch is handled natively, not through React: React registers touchmove as
   * passive, and a passive listener cannot stop the page from scrolling while
   * the sheet is being dragged.
   */
  useEffect(() => {
    if (!open || !dismissible) return undefined;
    const sheet = sheetRef.current;
    if (!sheet) return undefined;

    let gesture = null;

    function stop() {
      gesture = null;
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    }

    function onMove(event) {
      if (!gesture) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      const dy = touch.clientY - gesture.y0;
      const dx = touch.clientX - gesture.x0;
      if (!gesture.claimed) {
        if (dy <= DRAG_SLOP) { if (Math.abs(dx) > 12) stop(); return; }
        if (Math.abs(dx) > dy) { stop(); return; }
        // A drag may only start from the head, or from the body when it is at
        // its very top; anywhere else the finger is scrolling, and that has to
        // keep working.
        if (!gesture.inHandle && (bodyRef.current?.scrollTop || 0) > 0) { stop(); return; }
        gesture.claimed = true;
      }
      event.preventDefault();
      gesture.y = Math.max(0, dy);
      const now = Date.now();
      const since = now - gesture.sampledAt;
      if (since > 0) gesture.velocity = (gesture.y - gesture.sampledY) / Math.max(16, since);
      gesture.sampledY = gesture.y;
      gesture.sampledAt = now;
      moveTo(gesture.y, false);
    }

    function onEnd() {
      const finished = gesture;
      stop();
      // A finger that dragged and then held still has no speed left, and must
      // be judged on distance alone.
      if (finished?.claimed) finishDrag({ y: finished.y, velocity: Date.now() - finished.sampledAt > 90 ? 0 : finished.velocity });
    }

    function onStart(event) {
      if (event.touches?.length !== 1) return;
      const target = event.target;
      if (typeof target?.closest !== "function") return;
      // Buttons, fields and links keep their own taps.
      if (target.closest("button, a, input, textarea, select, label")) return;
      const inHandle = !!target.closest(".sheet-head, .grabber");
      if (!inHandle && (bodyRef.current?.scrollTop || 0) > 0) return;
      const touch = event.touches[0];
      gesture = {
        x0: touch.clientX, y0: touch.clientY, t0: Date.now(),
        inHandle, claimed: false, y: 0, velocity: 0,
        sampledY: 0, sampledAt: Date.now(),
      };
      // Only while a drag is possible, so ordinary scrolling keeps the
      // browser's fast path.
      sheet.addEventListener("touchmove", onMove, { passive: false });
      sheet.addEventListener("touchend", onEnd);
      sheet.addEventListener("touchcancel", onEnd);
    }

    sheet.addEventListener("touchstart", onStart, { passive: true });
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      stop();
    };
  }, [open, dismissible]);

  // The same gesture with a mouse, for the desktop preview.
  const onPointerDown = event => {
    if (event.pointerType === "touch" || event.button !== 0 || !dismissible) return;
    const target = event.target;
    if (typeof target?.closest !== "function") return;
    if (!target.closest(".sheet-head, .grabber") || target.closest("button, a, input")) return;
    const startY = event.clientY;
    let claimed = false;
    let y = 0;
    let velocity = 0;
    let sampledY = 0;
    let sampledAt = Date.now();
    const move = moveEvent => {
      const dy = moveEvent.clientY - startY;
      if (!claimed) {
        if (dy <= DRAG_SLOP) return;
        claimed = true;
      }
      y = Math.max(0, dy);
      const now = Date.now();
      const since = now - sampledAt;
      if (since > 0) velocity = (y - sampledY) / Math.max(16, since);
      sampledY = y;
      sampledAt = now;
      moveTo(y, false);
    };
    const up = upEvent => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!claimed) return;
      finishDrag({ y, velocity: Date.now() - sampledAt > 90 ? 0 : velocity });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        ref={sheetRef}
        onPointerDown={onPointerDown}
      >
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
        <div className="sheet-body" style={SCROLL_LOCK_STYLE} ref={bodyRef}>{children}</div>
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
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useBodyLock(open);

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
        <div className="modal-body" style={SCROLL_LOCK_STYLE}>{children}</div>
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
