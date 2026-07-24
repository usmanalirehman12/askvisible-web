import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBuyerPrompts } from "@/lib/ai/buyer-prompts";
import { createPrompts } from "./prompts";
import type { Brand, WorkspaceContext } from "./types";

// v1 simplification: a user can belong to multiple workspaces (schema supports it via
// workspace_members), but the dashboard only ever shows one at a time. We take the first
// membership row. Multi-workspace switching is real, deferred scope, not an oversight —
// nothing here blocks adding it later since workspace_members already supports it.
export async function getWorkspaceContext(supabase: SupabaseClient): Promise<WorkspaceContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id).limit(1).maybeSingle()
  ]);
  if (!membership) return null;

  const { data: workspace } = await supabase.from("workspaces").select("id,name,plan").eq("id", membership.workspace_id).maybeSingle();
  if (!workspace) return null;

  const { data: brands } = await supabase.from("brands").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: true });

  return {
    fullName: profile?.full_name || user.email?.split("@")[0] || "there",
    email: user.email || "",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    plan: workspace.plan,
    brands: (brands as Brand[]) || []
  };
}

// Auto-generates the same 3 buyer-intent prompts the public checker generates on the fly
// (generateBuyerPrompts), but persists them as real, editable rows this time instead of
// throwing them away after one ephemeral check — this is what makes a scan against this
// brand meaningful the moment it's created, not just an empty shell waiting for the user to
// hand-write questions first.
export async function createBrand(supabase: SupabaseClient, workspaceId: string, name: string, domain: string): Promise<Brand> {
  const { data, error } = await supabase.from("brands").insert({ workspace_id: workspaceId, name, domain }).select().single();
  if (error) throw new Error(error.message || error.details || "Database error inserting brand");
  const brand = data as Brand;
  const prompts = generateBuyerPrompts({ name: brand.name, title: "", description: "" });
  await createPrompts(supabase, brand.id, prompts);
  return brand;
}
