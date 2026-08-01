import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteExpired } from "@/lib/data/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Message({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return <main className="landing"><div className="container" style={{ maxWidth: 520, padding: "80px 0" }}>
    <h1 style={{ font: "800 30px 'Outfit',system-ui", letterSpacing: "-1px", marginBottom: 12 }}>{title}</h1>
    <p style={{ color: "#94A3B8", lineHeight: 1.6 }}>{body}</p>
    {cta && <p style={{ marginTop: 26 }}><Link className="button" href={cta.href}>{cta.label}</Link></p>}
  </div></main>;
}

export default async function InvitePage({ params }: { params: { token: string } }) {
  const service = createServiceClient();
  const { data: invitation } = await service
    .from("invitations")
    .select("id, workspace_id, email, role, expires_at, accepted_at, workspaces(name)")
    .eq("token", params.token)
    .maybeSingle();

  if (!invitation) return <Message title="This invitation doesn't exist" body="The link may have been mistyped, or the invitation was revoked. Ask whoever invited you to send a new one." />;
  if (invitation.accepted_at) return <Message title="This invitation was already used" body="If that was you, just sign in." cta={{ href: "/login", label: "Sign in" }} />;
  if (inviteExpired(invitation.expires_at)) return <Message title="This invitation has expired" body="Invitations are valid for seven days. Ask whoever invited you to send a new one." />;

  const workspaceName = (invitation.workspaces as { name?: string } | null)?.name || "the workspace";

  // Signed out: send them to sign up with the token in tow. Signing up creates their own
  // workspace via handle_new_user, then they land back here and this same page accepts.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signup?invite=${params.token}&email=${encodeURIComponent(invitation.email)}`);

  // The invite names an address, so accepting from a different account would silently put
  // the wrong person on the team.
  if ((user.email || "").toLowerCase() !== invitation.email) {
    return <Message
      title="This invitation is for a different address"
      body={`It was sent to ${invitation.email}, but you're signed in as ${user.email}. Sign out and sign in with the invited address.`}
      cta={{ href: "/logout", label: "Sign out" }}
    />;
  }

  const { data: already } = await service.from("workspace_members").select("user_id").eq("workspace_id", invitation.workspace_id).eq("user_id", user.id).maybeSingle();
  if (!already) {
    const { error } = await service.from("workspace_members").insert({ workspace_id: invitation.workspace_id, user_id: user.id, role: invitation.role });
    if (error) return <Message title="We couldn't add you to the team" body={error.message} />;
  }
  // Marked accepted after the membership lands, so a failure leaves the invite reusable.
  await service.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

  return <Message
    title={`You've joined ${workspaceName}`}
    body={`You're in as ${invitation.role === "admin" ? "an" : "a"} ${invitation.role}. Everything the team tracks is on the dashboard.`}
    cta={{ href: "/app", label: "Open the dashboard" }}
  />;
}
