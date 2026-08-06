import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: row } = await supabase
    .from("seo_audits")
    .select("id, brand_id, domain, checks, overall_score, created_at")
    .eq("id", auditId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  return NextResponse.json({
    audit: { id: row.id, domain: row.domain, overallScore: row.overall_score, createdAt: row.created_at, checks: row.checks },
  });
}
