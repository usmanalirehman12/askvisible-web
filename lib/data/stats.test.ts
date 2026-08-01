import { describe, expect, it } from "vitest";
import { shareOfVoice, summarizeScan, type LatestScan, type ScanAnswerRow } from "./stats";

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

describe("shareOfVoice", () => {
  const comp = (name: string, mentioned: boolean, position: number | null = null) => ({ name, mentioned, position });

  it("returns an empty list for a scan with no answers", () => {
    expect(shareOfVoice(scan([]), "Acme")).toEqual([]);
  });

  it("counts the brand against the total answer count", () => {
    const result = shareOfVoice(scan([row(), row({ brand_mentioned: false }), row({ brand_mentioned: false }), row({ brand_mentioned: false })]), "Acme");
    expect(result[0]).toMatchObject({ name: "Acme", isBrand: true, mentions: 1, total: 4, share: 25 });
  });

  it("includes competitors from competitor_mentions", () => {
    const result = shareOfVoice(scan([
      row({ competitor_mentions: [comp("Rival", true, 2)] }),
      row({ brand_mentioned: false, competitor_mentions: [comp("Rival", true, 1)] })
    ]), "Acme");
    const rival = result.find(r => r.name === "Rival")!;
    expect(rival).toMatchObject({ isBrand: false, mentions: 2, total: 2, share: 100 });
    expect(rival.avgPosition).toBe(1.5);
  });

  it("keeps a competitor that is never mentioned, at zero", () => {
    // The zero row is the finding — dropping it would hide "AI never names them".
    const result = shareOfVoice(scan([row({ competitor_mentions: [comp("Ghost", false)] })]), "Acme");
    expect(result.find(r => r.name === "Ghost")).toMatchObject({ mentions: 0, share: 0, avgPosition: null });
  });

  it("does not force shares to sum to 100 when an answer names several brands", () => {
    const result = shareOfVoice(scan([row({ competitor_mentions: [comp("Rival", true), comp("Other", true)] })]), "Acme");
    expect(result.every(r => r.share === 100)).toBe(true);
    expect(result.reduce((s, r) => s + r.share, 0)).toBe(300);
  });

  it("treats answers predating competitor tracking as brand-only", () => {
    // Old rows have competitor_mentions [] or null; they must still count toward total.
    const result = shareOfVoice(scan([row({ competitor_mentions: null }), row({ competitor_mentions: [] })]), "Acme");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Acme", mentions: 2, total: 2 });
  });

  it("counts an answer toward the total even when nobody is named", () => {
    const result = shareOfVoice(scan([row({ brand_mentioned: false, competitor_mentions: [comp("Rival", false)] })]), "Acme");
    expect(result.every(r => r.mentions === 0 && r.total === 1)).toBe(true);
  });

  it("ignores positions from answers where the competitor wasn't mentioned", () => {
    const result = shareOfVoice(scan([
      row({ competitor_mentions: [comp("Rival", true, 4)] }),
      row({ competitor_mentions: [comp("Rival", false, 1)] })
    ]), "Acme");
    expect(result.find(r => r.name === "Rival")!.avgPosition).toBe(4);
  });

  it("sorts by mentions, with the brand winning ties", () => {
    const result = shareOfVoice(scan([
      row({ brand_mentioned: true, competitor_mentions: [comp("Rival", true), comp("Quiet", false)] }),
      row({ brand_mentioned: true, competitor_mentions: [comp("Rival", false), comp("Quiet", false)] })
    ]), "Acme");
    expect(result.map(r => r.name)).toEqual(["Acme", "Rival", "Quiet"]);
  });

  it("puts a competitor ahead of the brand when it genuinely wins", () => {
    const result = shareOfVoice(scan([
      row({ brand_mentioned: false, competitor_mentions: [comp("Rival", true)] }),
      row({ brand_mentioned: false, competitor_mentions: [comp("Rival", true)] })
    ]), "Acme");
    expect(result.map(r => r.name)).toEqual(["Rival", "Acme"]);
  });
});
