import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { score } from "@/lib/ai/scoring";
import { analyzeMention } from "@/lib/ai/analyze";
import { getLatestAuditWithTrend } from "@/lib/seo/latestAudit";
import { fetchGscTraffic, type GscTraffic } from "@/lib/gsc/metrics";

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
    .select("id, engine, raw_answer, brand_mentioned, position, sentiment, created_at, prompts(query, brand_id, brands(id, name, domain, workspace_id))")
    .eq("run_id", runId);

  if (!rawAnswers?.length) return NextResponse.json({ error: "No data for this run" }, { status: 404 });

  const firstAnswer = rawAnswers[0] as any;
  const brandId = firstAnswer.prompts?.brand_id;
  const brandRow = firstAnswer.prompts?.brands;
  // Empty rather than "Unknown": a >2-char placeholder compiles into a live alias matcher
  // that matches the literal word "Unknown" wherever it appears in answer text.
  const brand = brandRow || { name: "", domain: "" };

  const analyzed = rawAnswers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any[];
  const runScore = score(analyzed);
  const mentions = rawAnswers.filter(a => a.brand_mentioned).length;

  let fixes: any[] = [];
  let seoAudit: Awaited<ReturnType<typeof getLatestAuditWithTrend>> = { audit: null, previousAudit: null };
  let traffic: GscTraffic = { connected: false };

  if (brandId) {
    const [fixRows, auditResult, trafficResult] = await Promise.all([
      supabase.from("fixes").select("id, category, title, rationale, impact_low, impact_high, status, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(8),
      getLatestAuditWithTrend(supabase, brandId),
      brandRow?.workspace_id
        ? fetchGscTraffic(supabase, brandRow.workspace_id, brand.domain, "30d", null, null).catch(() => ({ connected: false }) as GscTraffic)
        : Promise.resolve({ connected: false } as GscTraffic),
    ]);
    fixes = fixRows.data || [];
    seoAudit = auditResult;
    traffic = trafficResult;
  }

  // brandKnown is derived here rather than stored: raw_answer + the prompt are already in
  // hand, and a new column would need null-tolerance for every pre-existing row anyway.
  // Uses the same analyzeMention the scan path does, so read-time and scan-time agree.
  const answers = rawAnswers.map((a: any) => {
    const text = a.raw_answer || "";
    const derived = text ? analyzeMention(text, brand.name, brand.domain, [], a.prompts?.query || "") : null;
    return {
      id: a.id,
      engine: a.engine,
      text,
      brand_mentioned: a.brand_mentioned,
      position: a.position,
      sentiment: a.sentiment,
      createdAt: a.created_at,
      prompt: a.prompts?.query || "—",
      brandKnown: derived ? derived.brandKnown : null,
      reason: derived ? derived.reason : null,
    };
  });

  // An engine is "unrecognized" only when it never produced a real mention across this run
  // AND openly hedged at least once — an engine that simply didn't name the brand is a
  // different (ordinary) result and shouldn't be reported as not knowing it.
  const byEngine = new Map<string, { hedged: boolean; substantive: boolean }>();
  for (const a of answers) {
    const entry = byEngine.get(a.engine) || { hedged: false, substantive: false };
    if (a.reason === "hedged") entry.hedged = true;
    if (a.reason === "substantive") entry.substantive = true;
    byEngine.set(a.engine, entry);
  }
  const unrecognizedEngines = [...byEngine.entries()].filter(([, v]) => v.hedged && !v.substantive).map(([engine]) => engine);

  return NextResponse.json({
    run: { id: run.id, completedAt: run.completed_at, confidence: run.confidence, score: runScore, mentions, total: rawAnswers.length },
    brand: { name: brand.name, domain: brand.domain },
    answers,
    unrecognizedEngines,
    fixes,
    seoAudit,
    traffic,
  });
}
