import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSeoChecks } from "@/lib/seo/checks";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { checks, seoScore, fetchError } = await runSeoChecks(domain);
  return NextResponse.json({ checks, seoScore, domain, fetchError });
}
