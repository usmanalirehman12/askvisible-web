import type { SupabaseClient } from "@supabase/supabase-js";

// Known action values. Kept as a union rather than a DB enum (see fixes.category's own
// comment on why this repo prefers free text for fields that get extended casually) so a
// new action never needs a migration to add — just a new string here and at the call site.
type AuditAction =
  | "scan_started"
  | "fix_status_changed"
  | "prompt_added"
  | "prompt_edited"
  | "prompt_deleted"
  | "brand_profile_updated"
  | "schedule_updated";

export type LogAuditEventInput = {
  workspaceId: string;
  brandId?: string | null;
  userId: string;
  action: AuditAction;
  detail?: Record<string, unknown>;
};

// Fire-and-forget by design at call sites: an audit-log insert failing should never block or
// fail the real action it's describing (a scan that can't start because logging it failed
// would be worse than a scan with a missing log line). Callers await this for ordering, but
// don't need to handle its errors — Supabase insert errors are swallowed here, not thrown.
export async function logAuditEvent(supabase: SupabaseClient, input: LogAuditEventInput): Promise<void> {
  const { workspaceId, brandId, userId, action, detail } = input;
  await supabase.from("audit_log").insert({
    workspace_id: workspaceId,
    brand_id: brandId ?? null,
    user_id: userId,
    action,
    detail: detail ?? {}
  });
}

export type FixStatusChange = {
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
};

// One status-change timeline per fix, keyed by fixId, oldest first — exactly the shape
// FixesProgressReport needs to render "Pending -> Implementing on Aug 5, 14:02" rows without
// re-sorting or re-grouping in the component.
export async function getFixStatusHistory(supabase: SupabaseClient, brandId: string): Promise<Record<string, FixStatusChange[]>> {
  const { data } = await supabase
    .from("audit_log")
    .select("detail, created_at")
    .eq("brand_id", brandId)
    .eq("action", "fix_status_changed")
    .order("created_at", { ascending: true });

  const byFix: Record<string, FixStatusChange[]> = {};
  for (const row of data || []) {
    const detail = row.detail as { fixId?: string; fromStatus?: string | null; toStatus?: string };
    if (!detail.fixId || !detail.toStatus) continue;
    const list = byFix[detail.fixId] ?? [];
    list.push({ fromStatus: detail.fromStatus ?? null, toStatus: detail.toStatus, createdAt: row.created_at as string });
    byFix[detail.fixId] = list;
  }
  return byFix;
}
