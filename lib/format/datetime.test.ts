import { describe, expect, it } from "vitest";
import { formatTimestamp, isWithinDays } from "./datetime";

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

describe("isWithinDays", () => {
  const now = new Date("2026-08-06T12:00:00Z").getTime();

  it("is true for a timestamp from moments ago", () => {
    expect(isWithinDays(new Date(now - 1000).toISOString(), 7, now)).toBe(true);
  });

  it("is true right up to the edge of the window", () => {
    const edge = now - (7 * 24 * 60 * 60 * 1000 - 1000);
    expect(isWithinDays(new Date(edge).toISOString(), 7, now)).toBe(true);
  });

  it("is false once the timestamp is older than the window", () => {
    const outside = now - (7 * 24 * 60 * 60 * 1000 + 1000);
    expect(isWithinDays(new Date(outside).toISOString(), 7, now)).toBe(false);
  });

  it("is false for null, undefined, or unparseable input", () => {
    expect(isWithinDays(null, 30, now)).toBe(false);
    expect(isWithinDays(undefined, 30, now)).toBe(false);
    expect(isWithinDays("not-a-date", 30, now)).toBe(false);
  });
});
