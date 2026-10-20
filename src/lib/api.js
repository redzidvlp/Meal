import { isSupabaseConfigured, supabase, supabaseUrl } from "./supabase.js";
import { createSupabaseBackend } from "./supabaseBackend.js";
import { createDemoBackend } from "./demoBackend.js";
import { isOverrideDemo, projectHost } from "./errors.js";

// Demo mode is used when Supabase is not configured at all, or when the household
// explicitly switches to the demo kitchen from the error screen / settings.
const forcedDemo = isOverrideDemo();

export const isCloudConfigured = isSupabaseConfigured;
export const isDemo = !isSupabaseConfigured || forcedDemo;
export const backendMode = isDemo ? "demo" : "cloud";
export const backendHost = isDemo ? "" : projectHost(supabaseUrl);

// One interface, two implementations. The UI never talks to Supabase directly.
export const api = isDemo ? createDemoBackend() : createSupabaseBackend(supabase);
