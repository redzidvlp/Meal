// Turns whatever Supabase/PostgREST/fetch throws into something a person can act
// on. The app must never answer a broken connection with a bare "try again".

const text = error => String(error?.message || error?.error_description || error || "").toLowerCase();

const statusOf = error => Number(error?.status || error?.code || 0) || 0;

/**
 * @returns {{ kind: "auth"|"config"|"missing_schema"|"permission"|"network"|"paused"|"unknown",
 *             table: string|null, status: number, message: string, technical: string }}
 */
export function describeLoadError(error, table = null) {
  const message = String(error?.message || error?.error_description || error || "").slice(0, 300);
  const haystack = `${message} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  const status = statusOf(error);
  const code = String(error?.code || "");

  const base = { table, status, message, technical: [code, status, message].filter(Boolean).join(" · ") };

  // A wrong or rotated anon key is a deployment problem, not an expired session.
  if (/invalid api key|no api key|invalid apikey|apikey is invalid|invalid jwt/.test(haystack)) {
    return { ...base, kind: "config" };
  }
  if (
    /jwt|token|unauthorized|not authenticated|refresh token/.test(haystack) ||
    status === 401
  ) {
    return { ...base, kind: "auth" };
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|could not find the table|schema cache|undefined table|relation .* not found/.test(haystack)
  ) {
    return { ...base, kind: "missing_schema" };
  }
  if (/row-level security|permission denied|insufficient privilege|rls/.test(haystack) || status === 403) {
    return { ...base, kind: "permission" };
  }
  if (status === 540 || /project .*paused|paused project|upstream|timeout|timed out|econn|503|502/.test(haystack)) {
    return { ...base, kind: "paused" };
  }
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed|err_internet|dns/.test(haystack)
  ) {
    return { ...base, kind: "network" };
  }
  return { ...base, kind: "unknown" };
}

// Which tables a project must have before the kitchen can open at all.
export const CORE_TABLES = ["households", "profiles", "recipes", "meal_assignments"];

// 0 = unknown, 1 = core only, 2 = current schema.
export function schemaState(issues = []) {
  const missing = new Set(issues.filter(issue => issue.kind === "missing_schema").map(issue => issue.table));
  if (!missing.size) return { level: 2, missing: [] };
  if ([...missing].some(table => CORE_TABLES.includes(table))) return { level: 0, missing: [...missing] };
  return { level: 1, missing: [...missing] };
}

// Host only — never render keys or full query strings.
export function projectHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function isOverrideDemo() {
  try {
    return localStorage.getItem("our-table-mode") === "demo";
  } catch {
    return false;
  }
}

export function setOverrideDemo(on) {
  try {
    if (on) localStorage.setItem("our-table-mode", "demo");
    else localStorage.removeItem("our-table-mode");
  } catch {
    // Private browsing without storage: the session simply keeps the current mode.
  }
}
