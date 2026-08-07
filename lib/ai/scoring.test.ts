import { describe, expect, it } from "vitest";
import { score } from "./scoring";
import type { AnalyzedAnswer } from "./types";

// score() = mentionScore(60) + positionScore(25) + sentimentScore(15), all averaged
// over the TOTAL answer count (not just the mentioned ones), then rounded.
const answer = (over: Partial<AnalyzedAnswer> = {}): AnalyzedAnswer =>
  ({ mentioned: true, position: 1, sentiment: "positive", ...over }) as AnalyzedAnswer;

describe("score", () => {
  it("returns 0 for no answers", () => {
    expect(score([])).toBe(0);
  });

  it("returns 0 when the brand is never mentioned", () => {
    expect(score([answer({ mentioned: false }), answer({ mentioned: false })])).toBe(0);
  });

  it("returns 100 for the perfect case (all mentioned, position 1, positive)", () => {
    expect(score([answer(), answer(), answer()])).toBe(100);
  });

  it("scales linearly with mention rate", () => {
    // 1 of 2 mentioned at position 1 positive → exactly half of each component.
    expect(score([answer(), answer({ mentioned: false })])).toBe(50);
  });

  describe("position component", () => {
    it("gives full credit at position 1 and decreasing credit through position 5", () => {
      expect(score([answer({ position: 1 })])).toBe(100); // 60 + 25 + 15
      expect(score([answer({ position: 2 })])).toBe(95); // 60 + 20 + 15
      expect(score([answer({ position: 5 })])).toBe(80); // 60 + 5 + 15
    });

    it("gives zero position credit at position 6 and clamps beyond it", () => {
      expect(score([answer({ position: 6 })])).toBe(75); // 60 + 0 + 15
      expect(score([answer({ position: 99 })])).toBe(75); // clamped at 0, never negative
    });

    it("treats a missing position as partial credit, not zero", () => {
      // Mentioned but unranked scores 0.4 of the position component: 60 + 10 + 15.
      expect(score([answer({ position: null })])).toBe(85);
    });
  });

  describe("sentiment component", () => {
    it("weights positive above neutral above negative", () => {
      const positive = score([answer({ sentiment: "positive" })]); // 60 + 25 + 15
      const neutral = score([answer({ sentiment: "neutral" })]); // 60 + 25 + 8.25
      const negative = score([answer({ sentiment: "negative" })]); // 60 + 25 + 1.5
      expect(positive).toBe(100);
      expect(neutral).toBe(93);
      expect(negative).toBe(87);
      expect(positive).toBeGreaterThan(neutral);
      expect(neutral).toBeGreaterThan(negative);
    });
  });

  it("never exceeds 100 or drops below 0", () => {
    const best = score(Array.from({ length: 20 }, () => answer()));
    const worst = score(Array.from({ length: 20 }, () => answer({ mentioned: false })));
    expect(best).toBeLessThanOrEqual(100);
    expect(worst).toBeGreaterThanOrEqual(0);
  });

  it("ignores position and sentiment on answers that aren't mentioned", () => {
    // An unmentioned answer with a position/sentiment set must not contribute anything.
    const withNoise = score([answer(), answer({ mentioned: false, position: 1, sentiment: "positive" })]);
    expect(withNoise).toBe(50);
  });

  it("documents the cost of a single phantom mention", () => {
    // Why scores dropped when prompt-echo detection shipped. A prompt-echo mention has no
    // list position, and the unranked default (0.4) is worth as much as a genuine #4 finish,
    // so one phantom mention in a 5-answer scan was carrying ~16 points on its own:
    //   mention  60/5           = 12
    //   position 0.4 * 25/5     = 2
    //   sentiment 0.55 * 15/5   = 1.65   -> 15.65, rounds into a ~16 point swing.
    const real = [answer(), answer(), answer(), answer()];
    const withPhantom = score([...real, answer({ mentioned: true, position: null, sentiment: "neutral" })]);
    const withoutPhantom = score([...real, answer({ mentioned: false, position: null, sentiment: "not-mentioned" })]);
    expect(withPhantom - withoutPhantom).toBe(16);
  });
});
