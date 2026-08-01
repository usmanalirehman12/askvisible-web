import type { SupabaseClient } from "@supabase/supabase-js";
import type { Prompt } from "./types";

export async function getPrompts(supabase: SupabaseClient, brandId: string): Promise<Prompt[]> {
  const { data } = await supabase.from("prompts").select("*").eq("brand_id", brandId).eq("active", true).order("created_at", { ascending: true });
  return (data as Prompt[]) || [];
}
