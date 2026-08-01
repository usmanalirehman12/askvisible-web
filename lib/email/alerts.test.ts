import { describe, expect, it } from "vitest";
import { SCORE_DROP_THRESHOLD, scoreDropEmail, shouldAlertOnDrop } from "./alerts";

describe("shouldAlertOnDrop", () => {
  it("stays quiet when there is no previous scan", () => {
    // A brand's first result is not a drop, however low the score.
    expect(shouldAlertOnDrop(null, 0)).toBe(false);
    expect(shouldAlertOnDrop(null, 100)).toBe(false);
  });

  it("fires exactly at the threshold", () => {
    expect(shouldAlertOnDrop(70, 60)).toBe(true);
    expect(shouldAlertOnDrop(70, 61)).toBe(false);
  });

  it("stays quiet for the ordinary few-point wobble between scans", () => {
    for (const current of [70, 69, 66, 62]) expect(shouldAlertOnDrop(70, current)).toBe(false);
  });

  it("never fires on an improvement", () => {
    expect(shouldAlertOnDrop(40, 90)).toBe(false);
    expect(shouldAlertOnDrop(40, 40)).toBe(false);
  });

  it("fires on a collapse to zero", () => {
    expect(shouldAlertOnDrop(55, 0)).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(shouldAlertOnDrop(70, 65, 5)).toBe(true);
    expect(shouldAlertOnDrop(70, 65, 20)).toBe(false);
  });

  it("treats a previous score of 0 as a real baseline, not a missing one", () => {
    // 0 is falsy — an `if (!previous)` check here would silently disable alerting for any
    // brand recovering from zero.
    expect(shouldAlertOnDrop(0, 0)).toBe(false);
    expect(shouldAlertOnDrop(15, 0)).toBe(true);
  });

  it("uses a threshold big enough to survive model variance", () => {
    expect(SCORE_DROP_THRESHOLD).toBeGreaterThanOrEqual(5);
  });
});

describe("scoreDropEmail", () => {
  const base = { to: "owner@example.com", brandName: "Acme Plumbing", previous: 72, current: 55, mentions: 4, total: 15 };

  it("puts the drop and both scores in the subject so it's triageable unopened", () => {
    const mail = scoreDropEmail(base);
    expect(mail.subject).toContain("Acme Plumbing");
    expect(mail.subject).toContain("17");
    expect(mail.subject).toContain("72");
    expect(mail.subject).toContain("55");
  });

  it("addresses the recipient passed in", () => {
    expect(scoreDropEmail(base).to).toBe("owner@example.com");
  });

  it("states the drop and the mention count in the body", () => {
    const mail = scoreDropEmail(base);
    expect(mail.text).toContain("dropped 17 points");
    expect(mail.text).toContain("4 of 15 answers");
  });

  it("includes the app link only when one is configured", () => {
    expect(scoreDropEmail(base).text).not.toContain("http");
    expect(scoreDropEmail({ ...base, appUrl: "https://example.vercel.app/app" }).text).toContain("https://example.vercel.app/app");
  });

  it("handles a drop to zero without odd phrasing", () => {
    const mail = scoreDropEmail({ ...base, previous: 30, current: 0 });
    expect(mail.subject).toContain("30 → 0");
    expect(mail.text).toContain("dropped 30 points");
  });
});
