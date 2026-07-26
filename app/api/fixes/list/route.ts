import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data, error } = await supabase
      .from("fixes")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ fixes: [], rlsError: error.message || error.details || "Unknown Supabase error" });
    return NextResponse.json({ fixes: data || [] });
  } catch (err) {
    return NextResponse.json({ fixes: [], error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
