import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { score } from "@/lib/ai/scoring";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    // scan_runs has no brand_id of its own (brand association is only reachable via
    // answers.prompt_id -> prompts.brand_id), so finding "the most recent N runs" still
    // means scanning every answer row for this brand to recover run_ids -- there's no
    // index-bounded way to do that without a Postgres function. What `limit` does bound
    // is the expensive part: the full per-answer payload and the score() computation
    // below, which used to run over every run this brand has ever had, unbounded.
    const { data: allAnswers } = await supabase
      .from("answers")
      .select("run_id, brand_mentioned, position, sentiment, prompts!inner(brand_id)")
      .eq("prompts.brand_id", brandId);

    if (!allAnswers?.length) return NextResponse.json({ history: [] });

    const byRun = new Map<string, typeof allAnswers>();
    for (const a of allAnswers) {
      const list = byRun.get(a.run_id) ?? [];
      list.push(a);
      byRun.set(a.run_id, list);
    }

    const runIds = [...byRun.keys()];
    const { data: allRuns } = await supabase
      .from("scan_runs")
      .select("id, completed_at, confidence")
      .in("id", runIds)
      .order("completed_at", { ascending: false })
      .limit(limit);

    const runs = (allRuns || []).slice().reverse();

    const history = runs.map(run => {
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
