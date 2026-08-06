import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateSchedule } from "@/lib/data/scan-schedule";
import { logAuditEvent } from "@/lib/data/auditLog";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { brandId, scan_frequency, scan_day, name, domain, description } = body;

  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  // scan_day was previously unvalidated, so a value like 999 stored fine and the cron
  // then never matched it — the scan silently stopped running with no error anywhere.
  const scheduleError = validateSchedule(scan_frequency, scan_day);
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 });

  if (name !== undefined && !name.trim()) return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
  if (domain !== undefined && !domain.trim()) return NextResponse.json({ error: "Website is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("brands")
    .update({ scan_frequency, scan_day, name, domain, description })
    .eq("id", brandId)
    .select("workspace_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One shared handler serves two distinct forms (schedule vs. brand profile), told apart
  // by which fields the caller actually sent -- Settings never sends both at once.
  const scheduleChanged = scan_frequency !== undefined || scan_day !== undefined;
  const profileChanged = name !== undefined || domain !== undefined || description !== undefined;
  if (data?.workspace_id) {
    if (scheduleChanged) await logAuditEvent(supabase, { workspaceId: data.workspace_id, brandId, userId: user.id, action: "schedule_updated", detail: { scan_frequency, scan_day } });
    if (profileChanged) await logAuditEvent(supabase, { workspaceId: data.workspace_id, brandId, userId: user.id, action: "brand_profile_updated", detail: { name, domain, description } });
  }

  return NextResponse.json({ ok: true });
}
