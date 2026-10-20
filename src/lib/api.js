import { createDemoBackend } from "./demoBackend.js";
import { isOverrideDemo, projectHost } from "./errors.js";

// ── Which backend? ──────────────────────────────────────────────────────────
// Decided from the build-time env alone, so the demo build never downloads the
// Supabase client. On a phone that is roughly 120 kB of JavaScript saved before
// the first screen can paint.
const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

function validUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

const forcedDemo = isOverrideDemo();

export const isCloudConfigured = validUrl(url) && anonKey.length > 20;
export const isDemo = !isCloudConfigured || forcedDemo;
export const backendMode = isDemo ? "demo" : "cloud";
export const backendHost = isDemo ? "" : projectHost(url);

let backend = null;
let pendingContext = {};

function loadCloud() {
  // Split into its own chunk by the bundler; only fetched when configured.
  return Promise.all([import("./supabase.js"), import("./supabaseBackend.js")]).then(([{ supabase }, { createSupabaseBackend }]) => {
    backend = createSupabaseBackend(supabase);
    if (Object.keys(pendingContext).length) backend.setContext(pendingContext);
    return backend;
  });
}

export const apiReady = isDemo
  ? Promise.resolve(createDemoBackend()).then(instance => {
      backend = instance;
      return instance;
    })
  : loadCloud().catch(error => {
      console.error("[our-table] could not start the Supabase client", error);
      throw error;
    });

// Methods that must return synchronously (subscriptions hand back an
// unsubscribe function) are wrapped by hand; everything else is awaited.
const surface = {
  mode: backendMode,
  ready: apiReady,
  setContext(next) {
    pendingContext = { ...pendingContext, ...next };
    apiReady.then(instance => instance.setContext?.(next)).catch(() => {});
  },
  onAuthChange(callback) {
    let cancelled = false;
    let unsubscribe = null;
    apiReady
      .then(instance => {
        if (!cancelled) unsubscribe = instance.onAuthChange(callback);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
  subscribe(callback) {
    let cancelled = false;
    let unsubscribe = null;
    apiReady
      .then(instance => {
        if (!cancelled) unsubscribe = instance.subscribe(callback);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
};

export const api = new Proxy(surface, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop !== "string") return undefined;
    return (...args) => apiReady.then(instance => instance[prop](...args));
  },
});
