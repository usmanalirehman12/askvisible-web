import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canInvite, canRemove, inviteEmail, isTeamRole, normaliseEmail, type TeamRole } from "@/lib/data/team";
import { emailConfigured, sendEmail } from "@/lib/email/send";

// Node runtime: every operation here needs the service role, both to read auth.users for
// addresses (profiles has no email column) and to touch invitations, which is service-only.
export const runtime = "nodejs";

type Caller = { userId: string; workspaceId: string; role: TeamRole };

// Establishes who is asking and what they may do. The caller's own membership row is read
// with their session client, so an unauthenticated or non-member request can't get past
// this even though everything after it uses the service role.
async function caller(): Promise<Caller | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership || !isTeamRole(membership.role)) return null;
  return { userId: user.id, workspaceId: membership.workspace_id, role: membership.role };
}

export async function GET() {
  const me = await caller();
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const service = createServiceClient();
  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    service.from("workspace_members").select("user_id, role, joined_at, profiles(full_name)").eq("workspace_id", me.workspaceId),
    service.from("invitations").select("id, email, role, created_at, expires_at").eq("workspace_id", me.workspaceId).is("accepted_at", null)
  ]);

  // Addresses live in auth.users, so each member needs an admin lookup. Team sizes are
  // small; if that stops being true this wants a single listUsers call instead.
  const members = await Promise.all((memberRows || []).map(async row => {
    let email: string | null = null;
    try {
      const { data } = await service.auth.admin.getUserById(row.user_id);
      email = data?.user?.email ?? null;
    } catch { /* a missing auth row shouldn't blank the whole team list */ }
    const profile = row.profiles as { full_name?: string | null } | null;
    return { userId: row.user_id, name: profile?.full_name ?? null, email, role: row.role, joinedAt: row.joined_at, isYou: row.user_id === me.userId };
  }));

  return NextResponse.json({ role: me.role, members, invitations: inviteRows || [] });
}

export async function POST(request: Request) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const role = body.role ?? "member";
  const denied = canInvite(me.role, role);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  const service = createServiceClient();

  // Re-inviting someone who's already on the team is a no-op the user should be told
  // about, not a silent duplicate row.
  const { data: existing } = await service.from("workspace_members").select("user_id, profiles(full_name)").eq("workspace_id", me.workspaceId);
  for (const row of existing || []) {
    const { data } = await service.auth.admin.getUserById(row.user_id).catch(() => ({ data: null }));
    if (data?.user?.email?.toLowerCase() === email) return NextResponse.json({ error: "They're already on this team." }, { status: 409 });
  }

  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
  // Replaces any pending invite for the same address rather than colliding with the
  // partial unique index — re-inviting should refresh the link, not fail.
  await service.from("invitations").delete().eq("workspace_id", me.workspaceId).eq("email", email).is("accepted_at", null);
  const { data: invitation, error } = await service.from("invitations").insert({
    workspace_id: me.workspaceId, email, role, token, invited_by: me.userId
  }).select("id, email, role, created_at, expires_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: workspace }, { data: inviter }] = await Promise.all([
    service.from("workspaces").select("name").eq("id", me.workspaceId).maybeSingle(),
    service.from("profiles").select("full_name").eq("id", me.userId).maybeSingle()
  ]);

  let emailed = false;
  let warning: string | undefined;
  if (emailConfigured()) {
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const result = await sendEmail(inviteEmail({
      to: email,
      workspaceName: workspace?.name || "your workspace",
      inviterName: inviter?.full_name ?? null,
      role,
      url: `${base}/invite/${token}`
    }));
    emailed = result.sent;
    if (result.error) console.error("[team-invite] send failed:", result.error);
    if (!result.sent) warning = "The invitation was created but the email could not be sent. Share the link manually.";
  } else {
    warning = "Email isn't configured, so no invitation email was sent. Share the link manually.";
  }

  // The link comes back either way. A created invite the inviter can't see is worse than
  // one they have to paste into Slack themselves.
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({ invitation, emailed, warning, url: `${base}/invite/${token}` });
}

export async function DELETE(request: Request) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const service = createServiceClient();

  if (body.invitationId) {
    const { error } = await service.from("invitations").delete().eq("id", body.invitationId).eq("workspace_id", me.workspaceId).is("accepted_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.userId) return NextResponse.json({ error: "userId or invitationId required." }, { status: 400 });

  const { data: target } = await service.from("workspace_members").select("user_id, role").eq("workspace_id", me.workspaceId).eq("user_id", body.userId).maybeSingle();
  if (!target || !isTeamRole(target.role)) return NextResponse.json({ error: "They're not on this team." }, { status: 404 });

  const denied = canRemove(me.role, me.userId, { userId: target.user_id, role: target.role });
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  const { error } = await service.from("workspace_members").delete().eq("workspace_id", me.workspaceId).eq("user_id", body.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
