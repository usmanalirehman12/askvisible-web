import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateFixes, fixGeneratorConfigured } from "@/lib/ai/fix-generator";
import { saveFixes } from "@/lib/data/fixes";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { scanRunId, brandId } = body;
    if (!scanRunId || !brandId) return NextResponse.json({ error: "scanRunId and brandId required." }, { status: 400 });

    if (!fixGeneratorConfigured()) return NextResponse.json({ fixesGenerated: 0, skipped: true });

    const [{ data: brandRow }, { data: answers }] = await Promise.all([
      supabase.from("brands").select("name,domain").eq("id", brandId).maybeSingle(),
      supabase.from("answers")
        .select("engine,raw_answer,brand_mentioned,position,sentiment")
        .eq("run_id", scanRunId)
        .limit(18)
    ]);
    if (!brandRow) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

    const mapped = (answers || []).map((a: any) => ({
      provider: a.engine,
      model: "",
      prompt: "",
      text: a.raw_answer || "",
      citations: [],
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      mentioned: a.brand_mentioned,
      position: a.position,
      sentiment: a.sentiment
    }));

    const generated = await generateFixes(brandRow as any, mapped as any);
    const saved = await saveFixes(supabase, brandId, generated);
    return NextResponse.json({ fixesGenerated: saved.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fix generation failed.", fixesGenerated: 0 }, { status: 500 });
  }
}
