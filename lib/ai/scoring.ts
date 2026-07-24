import type { AnalyzedAnswer } from "./types";

// Split out of orchestrator.ts for the same reason generateBuyerPrompts was split out of
// website.ts: this is a pure function, but orchestrator.ts also imports from website.ts
// (Node-only dns/net for SSRF checks via discoverBrand), so anything that imports THIS
// function FROM orchestrator.ts pulls that whole chain in too. lib/data/stats.ts needs this
// to recompute a score from stored answers for a client component — it must import from
// here, not from orchestrator.ts, or the client bundle breaks the same way it did before.
export function score(answers: AnalyzedAnswer[]) {
  if (!answers.length) return 0;
  const mentioned = answers.filter(a => a.mentioned);
  const mentionScore = mentioned.length / answers.length * 60;
  const positionScore = mentioned.reduce((sum, a) => sum + (a.position ? Math.max(0, 6 - a.position) / 5 : 0.4), 0) / answers.length * 25;
  const sentimentScore = mentioned.reduce((sum, a) => sum + (a.sentiment === "positive" ? 1 : a.sentiment === "neutral" ? .55 : .1), 0) / answers.length * 15;
  return Math.round(mentionScore + positionScore + sentimentScore);
}
