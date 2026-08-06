import { describe, expect, it } from "vitest";
import { checklistProgress, computeChecklistSteps } from "./checklistState";

describe("computeChecklistSteps", () => {
  it("marks every step undone for a brand-new workspace with no brand", () => {
    const steps = computeChecklistSteps({ hasBrand: false, promptCount: 0, scanCount: 0 });
    expect(steps.every(s => !s.done)).toBe(true);
  });

  it("marks only brand done once a brand exists but has no prompts or scans", () => {
    const steps = computeChecklistSteps({ hasBrand: true, promptCount: 0, scanCount: 0 });
    expect(steps.find(s => s.id === "brand")?.done).toBe(true);
    expect(steps.find(s => s.id === "prompts")?.done).toBe(false);
    expect(steps.find(s => s.id === "scan")?.done).toBe(false);
    expect(steps.find(s => s.id === "report")?.done).toBe(false);
  });

  it("does not credit prompts without a brand, even if promptCount is somehow nonzero", () => {
    const steps = computeChecklistSteps({ hasBrand: false, promptCount: 5, scanCount: 0 });
    expect(steps.find(s => s.id === "prompts")?.done).toBe(false);
  });

  it("marks scan and report done together once a scan has run", () => {
    const steps = computeChecklistSteps({ hasBrand: true, promptCount: 8, scanCount: 1 });
    expect(steps.find(s => s.id === "scan")?.done).toBe(true);
    expect(steps.find(s => s.id === "report")?.done).toBe(true);
  });

  it("marks every step done once brand, prompts and a scan all exist", () => {
    const steps = computeChecklistSteps({ hasBrand: true, promptCount: 8, scanCount: 3 });
    expect(steps.every(s => s.done)).toBe(true);
  });
});

describe("checklistProgress", () => {
  it("reports 0 of N for a brand-new workspace", () => {
    const steps = computeChecklistSteps({ hasBrand: false, promptCount: 0, scanCount: 0 });
    expect(checklistProgress(steps)).toEqual({ done: 0, total: 4, complete: false });
  });

  it("reports complete: true only when every step is done", () => {
    const steps = computeChecklistSteps({ hasBrand: true, promptCount: 8, scanCount: 3 });
    const progress = checklistProgress(steps);
    expect(progress.done).toBe(progress.total);
    expect(progress.complete).toBe(true);
  });
});
