import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only operations that need to bypass RLS —
// cron jobs, admin routes, etc. Never expose this to the browser. The key
// is read from SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC_*) so it stays
// server-side only. Add it to Vercel env vars from Supabase → Settings → API.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}
