import { describe, expect, it } from "vitest";
import { summarizeScan, type LatestScan, type ScanAnswerRow } from "./stats";

const row = (over: Partial<ScanAnswerRow> = {}): ScanAnswerRow => ({
  id: "a1",
  engine: "openai",
  brand_mentioned: true,
  position: 1,
  sentiment: "positive",
  prompt_id: "p1",
  prompts: { query: "best widgets" },
  ...over
});

const scan = (answers: ScanAnswerRow[], confidence: number | null = 80): LatestScan => ({
  runId: "run-1",
  confidence,
  completedAt: "2026-07-31T00:00:00Z",
  answers
});

describe("summarizeScan", () => {
  it("counts mentions against the total answer count", () => {
    const result = summarizeScan(scan([row(), row({ brand_mentioned: false }), row({ brand_mentioned: false })]));
    expect(result.mentions).toBe(1);
    expect(result.total).toBe(3);
  });

  it("averages position across mentioned answers only, rounded to one decimal", () => {
    const result = summarizeScan(scan([row({ position: 1 }), row({ position: 2 }), row({ position: 2 })]));
    expect(result.avgPosition).toBe(1.7); // 5/3 = 1.666… → 1.7
  });

  it("ignores null positions when averaging", () => {
    const result = summarizeScan(scan([row({ position: 2 }), row({ position: 4 }), row({ position: null })]));
    expect(result.avgPosition).toBe(3);
  });

  it("returns null avgPosition when nothing has a position", () => {
    expect(summarizeScan(scan([row({ position: null })])).avgPosition).toBeNull();
    expect(summarizeScan(scan([row({ brand_mentioned: false, position: null })])).avgPosition).toBeNull();
  });

  it("passes confidence through, defaulting a null to 0", () => {
    expect(summarizeScan(scan([row()], 65)).confidence).toBe(65);
    expect(summarizeScan(scan([row()], null)).confidence).toBe(0);
  });

  it("handles an empty scan without throwing", () => {
    const result = summarizeScan(scan([]));
    expect(result).toMatchObject({ score: 0, mentions: 0, total: 0, avgPosition: null });
  });

  it("computes a score consistent with the answers", () => {
    // All mentioned, position 1, positive → the perfect-case score.
    expect(summarizeScan(scan([row(), row()])).score).toBe(100);
    // None mentioned → 0.
    expect(summarizeScan(scan([row({ brand_mentioned: false }), row({ brand_mentioned: false })])).score).toBe(0);
  });
});
