import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestAuditWithTrend } from "@/lib/seo/latestAudit";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const result = await getLatestAuditWithTrend(supabase, brandId);
  return NextResponse.json(result);
}
