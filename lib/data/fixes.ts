import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedFix } from "@/lib/ai/fix-generator";
import type { Fix } from "./types";

export async function getFixes(supabase: SupabaseClient, brandId: string): Promise<Fix[]> {
  const { data } = await supabase.from("fixes").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
  return (data as Fix[]) || [];
}

// Keyed by scan_runs.id -> completed_at, for the AI Fixes progress report's "generated from
// scan on [date]" line. A separate small query rather than a join on getFixes, since most
// callers of getFixes don't need it and fixes.scan_run_id is nullable (fixes generated
// before it existed have no scan to look up).
export async function getScanDates(supabase: SupabaseClient, scanRunIds: string[]): Promise<Record<string, string | null>> {
  if (!scanRunIds.length) return {};
  const { data } = await supabase.from("scan_runs").select("id,completed_at").in("id", scanRunIds);
  const map: Record<string, string | null> = {};
  for (const row of data || []) map[row.id as string] = row.completed_at as string | null;
  return map;
}

export async function saveFixes(supabase: SupabaseClient, brandId: string, fixes: GeneratedFix[], scanRunId?: string | null): Promise<Fix[]> {
  if (!fixes.length) return [];
  const { data, error } = await supabase.from("fixes").insert(fixes.map(f => ({
    brand_id: brandId,
    scan_run_id: scanRunId ?? null,
    category: f.category,
    title: f.title,
    rationale: f.rationale,
    generated_content: f.generatedContent,
    impact_low: f.impactLow,
    impact_high: f.impactHigh
  }))).select();
  if (error) throw new Error(error.message || error.details || "Database error saving fixes");
  return data as Fix[];
}
