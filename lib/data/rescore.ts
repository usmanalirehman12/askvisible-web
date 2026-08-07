import { analyzeMention } from "@/lib/ai/analyze";

// One stored answer row, as selected by the rescore route (answers joined to its prompt and
// that prompt's brand). Loose shapes because PostgREST returns joins as objects or arrays
// depending on the relationship it infers.
export type RescoreRow = {
  id: string;
  engine: string;
  raw_answer: string | null;
  brand_mentioned: boolean | null;
  position: number | null;
  sentiment: string | null;
  prompts?: { query?: string | null; brands?: { name?: string | null; domain?: string | null } | null } | null;
};

type RescoreDiff = {
  id: string;
  engine: string;
  promptQuery: string;
  reason: string;
  before: { mentioned: boolean | null; position: number | null; sentiment: string | null };
  after: { mentioned: boolean; position: number | null; sentiment: string };
};

export type RescorePlan = {
  total: number;
  skipped: number;
  unchanged: number;
  changed: RescoreDiff[];
  byReason: Record<string, number>;
  mentionedTrueToFalse: number;
  mentionedFalseToTrue: number;
};

// Pure: takes stored rows, returns what would change. The route does the I/O; this does the
// thinking, so the interesting half is unit-testable without a database.
//
// Recomputes from the immutable raw_answer, which makes the whole operation idempotent —
// running it twice is a no-op, and re-running it after tuning the heuristics is safe.
export function planRescore(rows: RescoreRow[]): RescorePlan {
  const plan: RescorePlan = { total: rows.length, skipped: 0, unchanged: 0, changed: [], byReason: {}, mentionedTrueToFalse: 0, mentionedFalseToTrue: 0 };

  for (const row of rows) {
    const text = row.raw_answer || "";
    // No stored text means there is nothing to recompute from. Leave the row exactly as it
    // is rather than guessing — silently zeroing these would destroy real history.
    if (!text) { plan.skipped++; continue; }

    const brand = row.prompts?.brands;
    const name = brand?.name || "";
    const domain = brand?.domain || "";
    if (!name && !domain) { plan.skipped++; continue; }

    const next = analyzeMention(text, name, domain, [], row.prompts?.query || "");
    plan.byReason[next.reason] = (plan.byReason[next.reason] || 0) + 1;

    const same = row.brand_mentioned === next.mentioned && row.position === next.position && row.sentiment === next.sentiment;
    if (same) { plan.unchanged++; continue; }

    if (row.brand_mentioned === true && !next.mentioned) plan.mentionedTrueToFalse++;
    if (row.brand_mentioned === false && next.mentioned) plan.mentionedFalseToTrue++;

    plan.changed.push({
      id: row.id,
      engine: row.engine,
      promptQuery: row.prompts?.query || "",
      reason: next.reason,
      before: { mentioned: row.brand_mentioned, position: row.position, sentiment: row.sentiment },
      after: { mentioned: next.mentioned, position: next.position, sentiment: next.sentiment },
    });
  }

  return plan;
}
