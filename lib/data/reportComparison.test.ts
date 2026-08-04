import { describe, expect, it } from "vitest";
import { compareToPrevious } from "./reportComparison";

describe("compareToPrevious", () => {
  it("returns isBaseline for an unknown runId with no history", () => {
    expect(compareToPrevious([], "missing")).toEqual({
      current: 0, previous: null, absoluteDelta: null, percentDelta: null, direction: null, isBaseline: true
    });
  });

  it("treats the first run in history as a baseline, never a fake zero delta", () => {
    const history = [{ runId: "a", score: 40 }];
    const result = compareToPrevious(history, "a");
    expect(result.isBaseline).toBe(true);
    expect(result.previous).toBeNull();
    expect(result.absoluteDelta).toBeNull();
    expect(result.current).toBe(40);
  });

  it("computes a positive delta against the immediately preceding run", () => {
    const history = [{ runId: "a", score: 40 }, { runId: "b", score: 55 }];
    const result = compareToPrevious(history, "b");
    expect(result.isBaseline).toBe(false);
    expect(result.previous).toBe(40);
    expect(result.absoluteDelta).toBe(15);
    expect(result.percentDelta).toBe(38);
    expect(result.direction).toBe("up");
  });

  it("computes a negative delta and direction down", () => {
    const history = [{ runId: "a", score: 60 }, { runId: "b", score: 45 }];
    const result = compareToPrevious(history, "b");
    expect(result.absoluteDelta).toBe(-15);
    expect(result.direction).toBe("down");
  });

  it("reports unchanged when scores are equal", () => {
    const history = [{ runId: "a", score: 50 }, { runId: "b", score: 50 }];
    const result = compareToPrevious(history, "b");
    expect(result.absoluteDelta).toBe(0);
    expect(result.direction).toBe("unchanged");
  });

  it("only compares against the immediately preceding run, not an arbitrary earlier one", () => {
    const history = [{ runId: "a", score: 10 }, { runId: "b", score: 90 }, { runId: "c", score: 92 }];
    const result = compareToPrevious(history, "c");
    expect(result.previous).toBe(90);
    expect(result.absoluteDelta).toBe(2);
  });

  it("never divides by zero when the previous score was 0", () => {
    const history = [{ runId: "a", score: 0 }, { runId: "b", score: 20 }];
    const result = compareToPrevious(history, "b");
    expect(result.percentDelta).toBe(0);
    expect(result.absoluteDelta).toBe(20);
  });
});
