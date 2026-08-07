import { describe, expect, it } from "vitest";
import { planRescore, type RescoreRow } from "./rescore";

const row = (over: Partial<RescoreRow> = {}): RescoreRow => ({
  id: "a1",
  engine: "openai",
  raw_answer: "Acme is the best option here.",
  brand_mentioned: true,
  position: null,
  sentiment: "positive",
  prompts: { query: "best tools", brands: { name: "Acme", domain: "acme.com" } },
  ...over
});

describe("planRescore", () => {
  it("reports no change when the stored values already match the analyzer", () => {
    const plan = planRescore([row()]);
    expect(plan.unchanged).toBe(1);
    expect(plan.changed).toHaveLength(0);
  });

  it("flags a stored echo that should no longer count as a mention", () => {
    const plan = planRescore([row({
      raw_answer: "I'll break down the best alternatives to Acme.",
      brand_mentioned: true,
      sentiment: "positive"
    })]);
    expect(plan.changed).toHaveLength(1);
    expect(plan.mentionedTrueToFalse).toBe(1);
    expect(plan.changed[0].after.mentioned).toBe(false);
    expect(plan.changed[0].reason).toBe("echo-only");
  });

  it("skips rows with no stored answer text rather than guessing", () => {
    // Zeroing these would destroy real history for no reason.
    const plan = planRescore([row({ raw_answer: null }), row({ raw_answer: "" })]);
    expect(plan.skipped).toBe(2);
    expect(plan.changed).toHaveLength(0);
  });

  it("skips rows whose brand join is missing", () => {
    expect(planRescore([row({ prompts: { query: "q", brands: null } })]).skipped).toBe(1);
  });

  it("is idempotent — applying the computed result yields no further change", () => {
    const original = row({ raw_answer: "I'll break down the best alternatives to Acme.", brand_mentioned: true, sentiment: "positive" });
    const first = planRescore([original]);
    const applied = row({ ...original, ...{
      brand_mentioned: first.changed[0].after.mentioned,
      position: first.changed[0].after.position,
      sentiment: first.changed[0].after.sentiment,
    } });
    const second = planRescore([applied]);
    expect(second.changed).toHaveLength(0);
    expect(second.unchanged).toBe(1);
  });

  it("counts reasons so a dry run can be sanity-checked before writing", () => {
    const plan = planRescore([
      row(),
      row({ id: "a2", raw_answer: "I'm not finding information about Acme." }),
      row({ id: "a3", raw_answer: "I'll break down the best alternatives to Acme." }),
    ]);
    expect(plan.byReason).toMatchObject({ substantive: 1, hedged: 1, "echo-only": 1 });
    expect(plan.total).toBe(3);
  });
});
