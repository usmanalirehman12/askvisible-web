import type { SupabaseClient } from "@supabase/supabase-js";
import type { Brand, WorkspaceContext, WorkspaceSummary } from "./types";

// Chooses which workspace the dashboard shows. Separated out and pure so the fallback
// order is testable without a database.
//
// Safety note: `preferred` arrives from localStorage, so it's user-controlled. It is only
// ever honoured when it matches a row the caller could already read, and those rows come
// back through RLS — a forged id matches nothing and falls through to the default rather
// than leaking anything. The check here is for correctness, not security.
export function pickWorkspaceId(memberships: { workspace_id: string }[], preferred?: string | null): string | null {
  if (!memberships.length) return null;
  if (preferred && memberships.some(m => m.workspace_id === preferred)) return preferred;
  // Newest first. Someone who has just accepted an invite lands in that workspace rather
  // than the empty one handle_new_user built them at signup.
  return memberships[0].workspace_id;
}

export async function getWorkspaceContext(supabase: SupabaseClient, preferredWorkspaceId?: string | null): Promise<WorkspaceContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("workspace_id, role").eq("user_id", user.id).order("joined_at", { ascending: false })
  ]);

  const rows = memberships || [];
  const workspaceId = pickWorkspaceId(rows, preferredWorkspaceId);
  if (!workspaceId) return null;

  // One query for every workspace the user belongs to: the switcher needs names for all of
  // them, and it's the same round trip as fetching only the active one.
  const { data: workspaceRows } = await supabase.from("workspaces").select("id,name,plan").in("id", rows.map(r => r.workspace_id));
  const roleById = new Map(rows.map(r => [r.workspace_id, r.role as string]));
  const workspaces: WorkspaceSummary[] = (workspaceRows || [])
    .map(w => ({ id: w.id as string, name: w.name as string, plan: w.plan as string, role: roleById.get(w.id as string) || "member" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const workspace = workspaces.find(w => w.id === workspaceId);
  if (!workspace) return null;

  const { data: brands } = await supabase.from("brands").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: true });

  return {
    fullName: profile?.full_name || user.email?.split("@")[0] || "there",
    email: user.email || "",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    plan: workspace.plan,
    role: workspace.role,
    workspaces,
    brands: (brands as Brand[]) || []
  };
}
