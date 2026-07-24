import type { SupabaseClient } from "@supabase/supabase-js";
import type { Competitor } from "./types";

export async function getCompetitors(supabase: SupabaseClient, brandId: string): Promise<Competitor[]> {
  const { data } = await supabase.from("competitors").select("*").eq("brand_id", brandId).order("name", { ascending: true });
  return (data as Competitor[]) || [];
}

export async function createCompetitor(supabase: SupabaseClient, brandId: string, name: string, domain: string): Promise<Competitor> {
  const { data, error } = await supabase.from("competitors").insert({ brand_id: brandId, name, domain: domain || null }).select().single();
  if (error) throw error;
  return data as Competitor;
}
