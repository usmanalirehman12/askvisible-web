import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runScanForPrompts } from "@/lib/ai/orchestrator";
import { analyzeCompetitors } from "@/lib/ai/analyze";
import type { ScanResultWithAnswers } from "./types";

// Known simplification: cost_usd stays at its schema default (0) here — computing real
// per-token cost needs a per-provider pricing table, which is separate scope from "make
// scans real." Token counts themselves ARE captured (tokens_in/tokens_out per answer), so
// cost can be backfilled later without a re-scan once pricing is added.
export async function runAndSaveScan(supabase: SupabaseClient, workspaceId: string, brand: { id: string; name: string; domain: string }): Promise<ScanResultWithAnswers> {
  const { data: promptRows } = await supabase.from("prompts").select("id,query").eq("brand_id", brand.id).eq("active", true);
  const prompts = (promptRows || []).map(p => p.query as string);
  if (!prompts.length) throw new Error("This client has no tracked prompts yet.");

  // Scheduled scans go through here while manual ones go through /api/scan/prompt, so
  // both paths have to write competitor_mentions or share of voice would only ever
  // populate from a button click and quietly stay empty for cron-driven brands.
  const { data: competitorRows } = await supabase.from("competitors").select("id,name,domain,aliases").eq("brand_id", brand.id);
  const competitors = competitorRows || [];

  const result = await runScanForPrompts({ name: brand.name, domain: brand.domain }, prompts);
  if (result.failures?.length) console.log("[scan-failures]", result.failures.map((f: any) => `${f.provider}: ${f.error}`));

  const { data: run, error: runErr } = await supabase.from("scan_runs").insert({
    workspace_id: workspaceId,
    status: "complete",
    started_at: result.scannedAt,
    completed_at: new Date().toISOString(),
    confidence: result.confidence,
    idempotency_key: randomUUID()
  }).select().single();
  if (runErr) throw runErr;

  const promptIdByQuery = new Map((promptRows || []).map(p => [p.query as string, p.id as string]));
  const answerRows = result.answers
    .map(a => ({
      run_id: run.id,
      prompt_id: promptIdByQuery.get(a.prompt),
      engine: a.provider,
      raw_answer: a.text,
      brand_mentioned: a.mentioned,
      position: a.position,
      sentiment: a.sentiment,
      cited_sources: a.citations,
      competitor_mentions: analyzeCompetitors(a.text, competitors),
      tokens_in: a.tokensIn,
      tokens_out: a.tokensOut
    }))
    .filter((row): row is typeof row & { prompt_id: string } => Boolean(row.prompt_id));

  const { error: ansErr } = await supabase.from("answers").insert(answerRows);
  if (ansErr) throw ansErr;

  return {
    scanRunId: run.id,
    score: result.score,
    confidence: result.confidence,
    mentions: result.mentions,
    total: result.total,
    opportunities: result.opportunities,
    brand: { name: brand.name, domain: brand.domain },
    answers: result.answers
  };
}
