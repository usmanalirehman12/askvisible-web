import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
  const cursor = searchParams.get("cursor");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let query = supabase
    .from("seo_audits")
    .select("id, overall_score, created_at, checks")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: rows } = await query;
  const audits = (rows || []).map(r => ({
    id: r.id,
    overallScore: r.overall_score,
    createdAt: r.created_at,
    checksCount: Array.isArray(r.checks) ? r.checks.length : 0,
  }));

  const nextCursor = audits.length === limit ? audits[audits.length - 1].createdAt : null;
  return NextResponse.json({ audits, nextCursor });
}
