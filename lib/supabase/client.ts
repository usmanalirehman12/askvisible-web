import { createBrowserClient } from "@supabase/ssr";

// Browser-side client for use inside "use client" components. Throws clearly if Supabase
// isn't configured yet rather than silently constructing a client pointed at "undefined" —
// callers should check supabaseConfigured() before rendering anything that calls this.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
  return createBrowserClient(url, key);
}
