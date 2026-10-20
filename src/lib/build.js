// Build identity, shared by the update gates and the Settings footer.
// __BUILD_ID__ is injected by vite.config.js (commit short SHA in CI, "dev"
// locally), so a rebuild of the same commit is not treated as a new version.

const BUILD_KEY = "our-table-build";
const PENDING_KEY = "our-table-updating";

export function currentBuildId() {
  if (typeof __BUILD_ID__ === "undefined") return "";
  const id = String(__BUILD_ID__ || "");
  return id && id !== "dev" ? id : "";
}

export function readStoredBuild() {
  try {
    return localStorage.getItem(BUILD_KEY) || "";
  } catch {
    return "";
  }
}

export function writeBuild(id) {
  try {
    if (id) localStorage.setItem(BUILD_KEY, id);
    else localStorage.removeItem(BUILD_KEY);
  } catch {
    // Storage can be blocked; the gates then simply stay quiet.
  }
}

/** Called right before a service-worker update reloads the page. */
export function markUpdating() {
  try {
    localStorage.setItem(PENDING_KEY, "1");
  } catch {
    // ignore
  }
}

export function takePendingUpdate() {
  try {
    const pending = localStorage.getItem(PENDING_KEY) === "1";
    if (pending) localStorage.removeItem(PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}
