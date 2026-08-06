import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/auditLog";

export const runtime = "edge";

const VALID_STATUSES = ["pending", "implementing", "done"];

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { fixId, status } = await request.json().catch(() => ({}));
    if (!fixId || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "fixId and status (pending|implementing|done) required" }, { status: 400 });
    }

    // Fetched before the update so the audit log can record the from-status, not just the
    // to-status -- "moved to done" is a lot less useful for a dispute than "moved from
    // implementing to done".
    const { data: before } = await supabase.from("fixes").select("status,brand_id,brands(workspace_id)").eq("id", fixId).maybeSingle();

    const { data, error } = await supabase.from("fixes").update({ status }).eq("id", fixId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const workspaceId = (before?.brands as unknown as { workspace_id?: string } | null)?.workspace_id;
    if (workspaceId) {
      await logAuditEvent(supabase, {
        workspaceId,
        brandId: before?.brand_id ?? data.brand_id,
        userId: user.id,
        action: "fix_status_changed",
        detail: { fixId, fromStatus: before?.status ?? null, toStatus: status, title: data.title }
      });
    }

    return NextResponse.json({ fix: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
