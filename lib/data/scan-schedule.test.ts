import { describe, expect, it } from "vitest";
import { isScanFrequency, validateSchedule } from "./scan-schedule";

describe("isScanFrequency", () => {
  it("accepts the three frequencies the cron understands", () => {
    expect(["weekly", "monthly", "off"].every(isScanFrequency)).toBe(true);
  });

  it("rejects anything else, including near-misses and non-strings", () => {
    for (const bad of ["daily", "Weekly", "", null, undefined, 1, {}]) expect(isScanFrequency(bad)).toBe(false);
  });
});

describe("validateSchedule", () => {
  it("passes when both fields are absent (a PATCH that touches neither)", () => {
    expect(validateSchedule(undefined, undefined)).toBeNull();
  });

  it("rejects an unknown frequency", () => {
    expect(validateSchedule("daily", 1)).toBe("Invalid frequency");
  });

  it("accepts a frequency change with no day", () => {
    expect(validateSchedule("monthly", undefined)).toBeNull();
  });

  describe("weekly — day is a day of the week", () => {
    it("accepts 0 through 6", () => {
      for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(validateSchedule("weekly", d)).toBeNull();
    });

    it("rejects 7 and above, which the cron could never match", () => {
      expect(validateSchedule("weekly", 7)).toMatch(/day of the week/);
      expect(validateSchedule("weekly", 31)).toMatch(/day of the week/);
    });

    it("rejects negatives", () => {
      expect(validateSchedule("weekly", -1)).toMatch(/day of the week/);
    });
  });

  describe("monthly — day is a day of the month", () => {
    it("accepts 1 through 31", () => {
      for (const d of [1, 15, 28, 31]) expect(validateSchedule("monthly", d)).toBeNull();
    });

    it("rejects 0, since no month has a day zero", () => {
      expect(validateSchedule("monthly", 0)).toMatch(/day of the month/);
    });

    it("rejects 32 and above", () => {
      expect(validateSchedule("monthly", 32)).toMatch(/day of the month/);
    });
  });

  describe("partial updates where frequency is absent", () => {
    // The stored frequency is unknown here, so the check has to span both modes.
    // Rejecting 15 would break a monthly brand editing only its day.
    it("accepts anything in the union of both ranges", () => {
      for (const d of [0, 1, 15, 31]) expect(validateSchedule(undefined, d)).toBeNull();
    });

    it("still rejects values outside every mode", () => {
      expect(validateSchedule(undefined, 32)).toMatch(/between 0 and 31/);
      expect(validateSchedule(undefined, -1)).toMatch(/between 0 and 31/);
    });
  });

  describe("type guards on the day", () => {
    it("rejects fractional days", () => {
      expect(validateSchedule("weekly", 1.5)).toBe("Scan day must be a whole number");
    });

    it("rejects strings, even numeric ones — the column is an integer", () => {
      expect(validateSchedule("weekly", "3")).toBe("Scan day must be a whole number");
    });

    it("rejects NaN and null", () => {
      expect(validateSchedule("weekly", NaN)).toBe("Scan day must be a whole number");
      expect(validateSchedule("weekly", null)).toBe("Scan day must be a whole number");
    });
  });

  it("matches the database check constraint's outer bounds (0-31)", () => {
    // schema.sql: check (scan_day between 0 and 31). Anything this function lets through
    // must satisfy that, or users get a 500 from Postgres instead of a 400 from us.
    for (const d of [0, 31]) expect(validateSchedule(undefined, d)).toBeNull();
    for (const d of [-1, 32]) expect(validateSchedule(undefined, d)).not.toBeNull();
  });
});
