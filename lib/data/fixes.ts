import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedFix } from "@/lib/ai/fix-generator";
import type { Fix } from "./types";

export async function getFixes(supabase: SupabaseClient, brandId: string): Promise<Fix[]> {
  const { data } = await supabase.from("fixes").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
  return (data as Fix[]) || [];
}

export async function saveFixes(supabase: SupabaseClient, brandId: string, fixes: GeneratedFix[]): Promise<Fix[]> {
  if (!fixes.length) return [];
  const { data, error } = await supabase.from("fixes").insert(fixes.map(f => ({
    brand_id: brandId,
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
