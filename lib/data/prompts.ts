import type { SupabaseClient } from "@supabase/supabase-js";
import type { Prompt } from "./types";

export async function getPrompts(supabase: SupabaseClient, brandId: string): Promise<Prompt[]> {
  const { data } = await supabase.from("prompts").select("*").eq("brand_id", brandId).eq("active", true).order("created_at", { ascending: true });
  return (data as Prompt[]) || [];
}

export async function createPrompts(supabase: SupabaseClient, brandId: string, queries: string[]): Promise<Prompt[]> {
  if (!queries.length) return [];
  const { data, error } = await supabase.from("prompts").insert(queries.map(query => ({ brand_id: brandId, query }))).select();
  if (error) throw new Error(error.message || error.details || "Database error inserting prompts");
  return data as Prompt[];
}
