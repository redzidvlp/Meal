import { isSupabaseConfigured, supabase } from "./supabase.js";
import { createSupabaseBackend } from "./supabaseBackend.js";
import { createDemoBackend } from "./demoBackend.js";

export const isDemo = !isSupabaseConfigured;

// One interface, two implementations. The UI never talks to Supabase directly.
export const api = isDemo ? createDemoBackend() : createSupabaseBackend(supabase);
