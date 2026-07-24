import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's email-confirmation and magic-link emails point here with a `code` param.
// Exchanging it for a session is what actually logs the user in after they click the link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=Could not confirm your account. Try signing in, or request a new link.`);
}
