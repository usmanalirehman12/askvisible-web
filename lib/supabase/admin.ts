import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses all RLS policies. Use only in server-side
// contexts where there is no user session (cron jobs, webhooks, admin tasks).
// Never expose to the browser or use for user-initiated requests.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role not configured. Add SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}
