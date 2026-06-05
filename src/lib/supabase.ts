import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  // Accept either SUPABASE_URL (server-only) or NEXT_PUBLIC_SUPABASE_URL (public)
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
