export function fmtNum(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function todayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7; // Monday = 0
}

export function mondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function dayDate(monday, index) {
  const [y, m, d] = String(monday).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + index);
  return date;
}

export function dayNumber(monday, index) {
  return dayDate(monday, index).getUTCDate();
}

export function createId(prefix = "") {
  const base = prefix ? `${prefix}-` : "";
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${base}${crypto.randomUUID()}`;
  return `${base}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, wait = 350) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

// Replaces {placeholders} in a translated string.
export function interpolate(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
