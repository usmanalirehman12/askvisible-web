import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { score } from "@/lib/ai/scoring";

export const runtime = "edge";

export async function GET(request: Request, { params }: { params: { runId: string } }) {
  const { runId } = params;
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, confidence, completed_at")
    .eq("id", runId)
    .maybeSingle();

  if (!run) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const { data: rawAnswers } = await supabase
    .from("answers")
    .select("id, engine, raw_answer, brand_mentioned, position, sentiment, created_at, prompts(query, brand_id, brands(id, name, domain))")
    .eq("run_id", runId);

  if (!rawAnswers?.length) return NextResponse.json({ error: "No data for this run" }, { status: 404 });

  const firstAnswer = rawAnswers[0] as any;
  const brandId = firstAnswer.prompts?.brand_id;
  const brand = firstAnswer.prompts?.brands || { name: "Unknown", domain: "" };

  const analyzed = rawAnswers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any[];
  const runScore = score(analyzed);
  const mentions = rawAnswers.filter(a => a.brand_mentioned).length;

  let fixes: any[] = [];
  if (brandId) {
    const { data: fixRows } = await supabase
      .from("fixes")
      .select("id, category, title, rationale, impact_low, impact_high, status")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(8);
    fixes = fixRows || [];
  }

  return NextResponse.json({
    run: { id: run.id, completedAt: run.completed_at, confidence: run.confidence, score: runScore, mentions, total: rawAnswers.length },
    brand,
    answers: rawAnswers.map((a: any) => ({
      id: a.id,
      engine: a.engine,
      text: a.raw_answer || "",
      brand_mentioned: a.brand_mentioned,
      position: a.position,
      sentiment: a.sentiment,
      createdAt: a.created_at,
      prompt: a.prompts?.query || "—"
    })),
    fixes
  });
}
