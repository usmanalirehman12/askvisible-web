import type { SupabaseClient } from "@supabase/supabase-js";
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
