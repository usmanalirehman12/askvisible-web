import type { SupabaseClient } from "@supabase/supabase-js";
import { score } from "@/lib/ai/scoring";

export type ScanAnswerRow = {
  id: string;
  engine: string;
  brand_mentioned: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | "not-mentioned";
  prompt_id: string;
  prompts: { query: string } | null;
};

export type LatestScan = {
  runId: string;
  confidence: number | null;
  completedAt: string | null;
  answers: ScanAnswerRow[];
};

// A scan_run has no direct brand_id (only workspace_id) — but in practice every run is
// brand-specific, since runAndSaveScan only ever scans one brand's own prompts at a time.
// Finding "the latest run for this brand" by walking backward through answers -> prompts ->
// brand_id is correct given that construction, without needing a schema change to add a
// direct brand_id column to scan_runs.
export async function getLatestScan(supabase: SupabaseClient, brandId: string): Promise<LatestScan | null> {
  const { data: latest } = await supabase
    .from("answers")
    .select("run_id, created_at, prompts!inner(brand_id)")
    .eq("prompts.brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return null;

  const [{ data: run }, { data: answers }] = await Promise.all([
    supabase.from("scan_runs").select("id,confidence,completed_at").eq("id", latest.run_id).maybeSingle(),
    supabase.from("answers").select("id,engine,brand_mentioned,position,sentiment,prompt_id,prompts(query)").eq("run_id", latest.run_id)
  ]);
  if (!run) return null;

  return { runId: run.id, confidence: run.confidence, completedAt: run.completed_at, answers: (answers as any) || [] };
}

export function summarizeScan(scan: LatestScan) {
  const asAnalyzed = scan.answers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any;
  const mentioned = scan.answers.filter(a => a.brand_mentioned);
  const positions = mentioned.map(a => a.position).filter((p): p is number => p != null);
  return {
    score: score(asAnalyzed),
    confidence: scan.confidence ?? 0,
    mentions: mentioned.length,
    total: scan.answers.length,
    avgPosition: positions.length ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : null
  };
}
