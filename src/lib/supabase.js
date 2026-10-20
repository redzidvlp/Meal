import { createClient } from "@supabase/supabase-js";

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

export const supabaseUrl = url;
export const isSupabaseConfigured = validUrl(url) && anonKey.length > 20;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // Only the public anon key belongs in the browser. Never add a service key here.
  console.info("[our-table] Supabase env vars missing — using local demo mode.");
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
      realtime: { params: { eventsPerSecond: 5 } },
      global: { headers: { "x-application-name": "our-table" } },
    })
  : null;
