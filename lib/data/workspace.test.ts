import { describe, expect, it } from "vitest";
import { pickWorkspaceId } from "./workspace";

// Rows arrive ordered newest-membership-first from the query.
const rows = [{ workspace_id: "newest" }, { workspace_id: "middle" }, { workspace_id: "oldest" }];

describe("pickWorkspaceId", () => {
  it("returns null when the user belongs to nothing", () => {
    expect(pickWorkspaceId([], "anything")).toBeNull();
    expect(pickWorkspaceId([])).toBeNull();
  });

  it("honours a stored preference the user is actually a member of", () => {
    expect(pickWorkspaceId(rows, "oldest")).toBe("oldest");
    expect(pickWorkspaceId(rows, "middle")).toBe("middle");
  });

  it("falls back to the newest membership with no preference", () => {
    // This is what makes an accepted invite land in the right place instead of the empty
    // workspace signup created.
    expect(pickWorkspaceId(rows)).toBe("newest");
    expect(pickWorkspaceId(rows, null)).toBe("newest");
    expect(pickWorkspaceId(rows, "")).toBe("newest");
  });

  it("ignores a preference for a workspace the user isn't in", () => {
    // localStorage is user-controlled, and a stale id survives being removed from a team.
    expect(pickWorkspaceId(rows, "someone-elses-workspace")).toBe("newest");
  });

  it("still works for the ordinary single-workspace user", () => {
    const one = [{ workspace_id: "only" }];
    expect(pickWorkspaceId(one)).toBe("only");
    expect(pickWorkspaceId(one, "only")).toBe("only");
    expect(pickWorkspaceId(one, "stale")).toBe("only");
  });
});
