import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { score } from "@/lib/ai/scoring";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    // Get all answers for this brand across all runs via prompts join
    const { data: allAnswers } = await supabase
      .from("answers")
      .select("run_id, brand_mentioned, position, sentiment, prompts!inner(brand_id)")
      .eq("prompts.brand_id", brandId);

    if (!allAnswers?.length) return NextResponse.json({ history: [] });

    // Group by run_id
    const byRun = new Map<string, typeof allAnswers>();
    for (const a of allAnswers) {
      const list = byRun.get(a.run_id) ?? [];
      list.push(a);
      byRun.set(a.run_id, list);
    }

    // Fetch run metadata for all run_ids
    const runIds = [...byRun.keys()];
    const { data: runs } = await supabase
      .from("scan_runs")
      .select("id, completed_at, confidence")
      .in("id", runIds)
      .order("completed_at", { ascending: true });

    const history = (runs || []).map(run => {
      const answers = byRun.get(run.id) || [];
      const analyzed = answers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any[];
      const runScore = score(analyzed);
      const mentions = answers.filter(a => a.brand_mentioned).length;
      return { runId: run.id, completedAt: run.completed_at, score: runScore, mentions, total: answers.length, confidence: run.confidence };
    });

    return NextResponse.json({ history });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
