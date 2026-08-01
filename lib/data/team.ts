// Both lists back a type and a guard in this file; callers use the guards, not the arrays.
const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

// Roles that can be handed out. "owner" is absent on purpose: it's created by
// handle_new_user at signup and there is exactly one per workspace, so it can't be granted.
const INVITABLE_ROLES = ["admin", "member", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const RANK: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function canManageTeam(actor: TeamRole | null): boolean {
  return actor === "owner" || actor === "admin";
}

// An admin can invite another admin but not an owner, which INVITABLE_ROLES already
// prevents. The rank check stops any future role above admin from being grantable by an
// admin without someone revisiting this function.
export function canInvite(actor: TeamRole | null, role: InvitableRole): string | null {
  if (!canManageTeam(actor)) return "Only owners and admins can invite people.";
  if (!isInvitableRole(role)) return "That role can't be assigned.";
  if (RANK[role] > RANK[actor as TeamRole]) return "You can't invite someone above your own role.";
  return null;
}

// Returns an error message, or null when the removal is allowed.
export function canRemove(actor: TeamRole | null, actorUserId: string, target: { userId: string; role: TeamRole }): string | null {
  // Leaving is always allowed, except for the owner — see below.
  const isSelf = actorUserId === target.userId;
  // The owner is the workspace's only guaranteed admin and the FK target for
  // workspaces.owner_id. Removing them would orphan the workspace, so it's blocked
  // outright rather than left to a confusing foreign-key error.
  if (target.role === "owner") return "The workspace owner can't be removed.";
  if (isSelf) return null;
  if (!canManageTeam(actor)) return "Only owners and admins can remove people.";
  // An admin removing a peer admin is a privilege fight with no tiebreaker, so only the
  // owner can do it.
  if (target.role === "admin" && actor !== "owner") return "Only the owner can remove an admin.";
  return null;
}

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // Deliberately permissive: this catches typos and empty submissions, and delivery is the
  // real validator. A strict RFC 5322 regex rejects addresses that genuinely work.
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function inviteExpired(expiresAt: string, now: Date = new Date()): boolean {
  const expiry = new Date(expiresAt).getTime();
  // An unparseable date is treated as expired: failing closed on a bearer token beats
  // honouring one we can't reason about.
  return Number.isNaN(expiry) || expiry <= now.getTime();
}

export function inviteEmail(options: { to: string; workspaceName: string; inviterName: string | null; role: InvitableRole; url: string }) {
  const { to, workspaceName, inviterName, role, url } = options;
  const who = inviterName ? `${inviterName} has` : "You've been";
  return {
    to,
    subject: `Join ${workspaceName} on AskVisible`,
    text: [
      `${who} invited you to join ${workspaceName} on AskVisible as ${role === "admin" ? "an" : "a"} ${role}.`,
      "",
      "AskVisible tracks how often AI assistants recommend a brand, and what to fix when they don't.",
      "",
      "Accept the invitation:",
      url,
      "",
      "The link expires in 7 days."
    ].join("\n")
  };
}
