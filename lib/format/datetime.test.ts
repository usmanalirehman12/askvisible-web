import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./datetime";

describe("formatTimestamp", () => {
  it("returns a fallback for null/undefined", () => {
    expect(formatTimestamp(null)).toBe("Unknown date");
    expect(formatTimestamp(undefined)).toBe("Unknown date");
  });

  it("returns a fallback for an unparseable string", () => {
    expect(formatTimestamp("not-a-date")).toBe("Invalid date");
  });

  it("formats a valid date without time by default", () => {
    const out = formatTimestamp("2026-03-05T12:00:00Z");
    expect(out).not.toBe("Unknown date");
    expect(out).not.toBe("Invalid date");
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("includes time-of-day when style is datetime", () => {
    const out = formatTimestamp("2026-03-05T12:00:00Z", "datetime");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});
