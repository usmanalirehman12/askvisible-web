import { describe, expect, it } from "vitest";
import { canInvite, canManageTeam, canRemove, inviteEmail, inviteExpired, isInvitableRole, isTeamRole, normaliseEmail } from "./team";

describe("role guards", () => {
  it("recognises the four stored roles", () => {
    expect(["owner", "admin", "member", "viewer"].every(isTeamRole)).toBe(true);
    expect(isTeamRole("superuser")).toBe(false);
    expect(isTeamRole(undefined)).toBe(false);
  });

  it("never lets owner be handed out — it's created at signup and there's one per workspace", () => {
    expect(isInvitableRole("owner")).toBe(false);
    expect(["admin", "member", "viewer"].every(isInvitableRole)).toBe(true);
  });

  it("limits team management to owners and admins", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });
});

describe("canInvite", () => {
  it("lets an owner invite any grantable role", () => {
    for (const role of ["admin", "member", "viewer"] as const) expect(canInvite("owner", role)).toBeNull();
  });

  it("lets an admin invite a peer admin and below", () => {
    for (const role of ["admin", "member", "viewer"] as const) expect(canInvite("admin", role)).toBeNull();
  });

  it("blocks members and viewers entirely", () => {
    expect(canInvite("member", "viewer")).toMatch(/Only owners and admins/);
    expect(canInvite("viewer", "viewer")).toMatch(/Only owners and admins/);
    expect(canInvite(null, "viewer")).toMatch(/Only owners and admins/);
  });

  it("rejects a role that isn't grantable, even from an owner", () => {
    expect(canInvite("owner", "owner" as never)).toMatch(/can't be assigned/);
    expect(canInvite("owner", "root" as never)).toMatch(/can't be assigned/);
  });
});

describe("canRemove", () => {
  const owner = { userId: "u-owner", role: "owner" as const };
  const admin = { userId: "u-admin", role: "admin" as const };
  const member = { userId: "u-member", role: "member" as const };

  it("never allows removing the owner, not even by themselves", () => {
    // workspaces.owner_id points at them; removing would orphan the workspace.
    expect(canRemove("owner", "u-owner", owner)).toMatch(/owner can't be removed/);
    expect(canRemove("admin", "u-admin", owner)).toMatch(/owner can't be removed/);
  });

  it("lets anyone remove themselves", () => {
    expect(canRemove("member", "u-member", member)).toBeNull();
    expect(canRemove("viewer", "u-viewer", { userId: "u-viewer", role: "viewer" })).toBeNull();
    expect(canRemove("admin", "u-admin", admin)).toBeNull();
  });

  it("lets owners and admins remove ordinary members", () => {
    expect(canRemove("owner", "u-owner", member)).toBeNull();
    expect(canRemove("admin", "u-admin", member)).toBeNull();
  });

  it("stops members removing anyone but themselves", () => {
    expect(canRemove("member", "u-other", member)).toMatch(/Only owners and admins/);
    expect(canRemove("viewer", "u-other", member)).toMatch(/Only owners and admins/);
  });

  it("reserves removing an admin for the owner", () => {
    // Admin-removes-admin is a privilege fight with no tiebreaker.
    expect(canRemove("admin", "u-other-admin", admin)).toMatch(/Only the owner/);
    expect(canRemove("owner", "u-owner", admin)).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases so the unique index actually catches duplicates", () => {
    expect(normaliseEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("rejects empty, malformed and non-string input", () => {
    for (const bad of ["", "   ", "nope", "no@domain", "@example.com", "a@b", null, undefined, 42]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });

  it("rejects an address longer than the 254-char limit", () => {
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("accepts ordinary addresses with plus tags and subdomains", () => {
    expect(normaliseEmail("first.last+tag@mail.example.co.uk")).toBe("first.last+tag@mail.example.co.uk");
  });
});

describe("inviteExpired", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("is live before the expiry", () => {
    expect(inviteExpired("2026-08-02T12:00:00Z", now)).toBe(false);
  });

  it("is expired at and after the expiry", () => {
    expect(inviteExpired("2026-08-01T12:00:00Z", now)).toBe(true);
    expect(inviteExpired("2026-07-31T12:00:00Z", now)).toBe(true);
  });

  it("treats an unparseable date as expired", () => {
    // Failing closed on a bearer token beats honouring one we can't reason about.
    expect(inviteExpired("not a date", now)).toBe(true);
    expect(inviteExpired("", now)).toBe(true);
  });
});

describe("inviteEmail", () => {
  const base = { to: "new@example.com", workspaceName: "Acme's workspace", role: "member" as const, url: "https://app.example.com/invite/tok" };

  it("names the workspace in the subject", () => {
    expect(inviteEmail({ ...base, inviterName: "Sam" }).subject).toContain("Acme's workspace");
  });

  it("credits the inviter when known and stays neutral when not", () => {
    expect(inviteEmail({ ...base, inviterName: "Sam" }).text).toContain("Sam has invited you");
    expect(inviteEmail({ ...base, inviterName: null }).text).toContain("You've been invited");
  });

  it("includes the accept link and the expiry", () => {
    const mail = inviteEmail({ ...base, inviterName: null });
    expect(mail.text).toContain(base.url);
    expect(mail.text).toContain("7 days");
  });

  it("gets the article right for admin", () => {
    expect(inviteEmail({ ...base, inviterName: null, role: "admin" }).text).toContain("as an admin");
    expect(inviteEmail({ ...base, inviterName: null, role: "member" }).text).toContain("as a member");
  });
});
