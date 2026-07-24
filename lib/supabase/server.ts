import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side client for Server Components, Route Handlers, and Server Actions. Reads/writes
// the session via Next.js's cookies() so auth state survives across requests without any
// client-side token handling. The try/catch on setAll matches Supabase's documented pattern:
// Server Components can't set cookies directly, and that's fine as long as middleware.ts is
// also refreshing the session on every request (which it does — see middleware.ts).
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — ignore; middleware.ts refreshes the session.
        }
      }
    }
  });
}
