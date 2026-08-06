function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// An empty alias list would compile to /\b(?:)\b/i, which matches almost any text and
// reports a mention everywhere. That's reachable with a short name and no domain
// (competitor names are user-entered), so the guard belongs here rather than at each call.
function aliasMatcher(aliases: string[]): RegExp | null {
  const usable = [...new Set(aliases.map(a => a.trim()).filter(a => a.length > 2))];
  return usable.length ? new RegExp(`\\b(?:${usable.map(escaped).join("|")})\\b`, "i") : null;
}

// Walks back from the mention to the nearest preceding "1." / "2)" list marker. Answers
// are usually ranked lists, so that number is the brand's position in the recommendation.
function positionOf(text: string, index: number): number | null {
  const before = text.slice(0, index);
  const numbered = [...text.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(\d+)[.)]\s+/g)];
  const marker = numbered.filter(m => m.index! < before.length).at(-1)?.[1];
  return marker ? Number(marker) : null;
}

function sentimentAround(text: string, index: number, span: number) {
  const hit = text.slice(Math.max(0, index - 120), index + span + 180).toLowerCase();
  const negative = /\b(drawback|weak|limited|expensive|poor|avoid|however|but)\b/.test(hit);
  const positive = /\b(best|leading|strong|excellent|recommend|powerful|ideal|top)\b/.test(hit);
  return negative && !positive ? "negative" as const : positive ? "positive" as const : "neutral" as const;
}

export function analyzeMention(text: string, brand: string, domain: string, extraAliases: string[] = []) {
  const matcher = aliasMatcher([brand, domain, domain.split(".")[0], ...extraAliases]);
  const index = matcher ? text.search(matcher) : -1;
  if (index < 0) return { mentioned: false as const, position: null, sentiment: "not-mentioned" as const };
  return {
    mentioned: true as const,
    position: positionOf(text, index),
    sentiment: sentimentAround(text, index, brand.length)
  };
}

export type CompetitorInput = { id?: string; name: string; domain?: string | null; aliases?: string[] | null };
export type CompetitorMention = { id?: string; name: string; mentioned: boolean; position: number | null; sentiment: "positive" | "neutral" | "negative" | "not-mentioned" };

// Runs the same matcher over the same answer text the brand was scored against, so the
// comparison is apples-to-apples from a single scan. Scanning competitors with their own
// prompts would cost one full provider fan-out per competitor and still not answer the
// question that matters — "when someone asks OUR question, who gets named?"
//
// Every competitor comes back, mentioned or not. A competitor that never appears is a
// result, not an absence, and share-of-voice needs the zero rows to compute a denominator.
export function analyzeCompetitors(text: string, competitors: CompetitorInput[]): CompetitorMention[] {
  return competitors.map(competitor => {
    const analysis = analyzeMention(text, competitor.name, competitor.domain || "", competitor.aliases || []);
    return { id: competitor.id, name: competitor.name, mentioned: analysis.mentioned, position: analysis.position, sentiment: analysis.sentiment };
  });
}

// Post-hoc phrase mining for "Common sentiment phrases": given the same raw answer text
// already persisted on every answer row (answers.raw_answer), pull out the sentence
// containing the brand mention so the app can show *what AI engines are actually saying*,
// not just a positive/neutral/negative bucket. Deliberately separate from analyzeMention --
// that runs at scan time and its return shape is persisted; this runs on-demand against
// already-stored text and adds no new columns or scan-time cost.
export function extractMentionSnippet(text: string, brand: string, domain: string, extraAliases: string[] = [], maxLen = 160): string | null {
  const matcher = aliasMatcher([brand, domain, domain.split(".")[0], ...extraAliases]);
  if (!matcher) return null;
  const match = text.match(matcher);
  if (!match || match.index == null) return null;
  const index = match.index;
  // Search for the closing period starting after the full matched alias, not at its start --
  // a domain alias (e.g. "acme.com") contains its own period, which would otherwise be
  // mistaken for the sentence boundary and truncate the snippet mid-domain.
  const matchEnd = index + match[0].length;
  // Expand outward to sentence boundaries around the match; fall back to a hard cutoff at
  // maxLen if the sentence runs long, so one run-on paragraph can't produce an unreadable row.
  const start = Math.max(0, text.lastIndexOf(".", index) + 1, text.lastIndexOf("\n", index) + 1);
  const nextPeriod = text.indexOf(".", matchEnd);
  const end = nextPeriod === -1 || nextPeriod - start > maxLen ? Math.min(text.length, start + maxLen) : nextPeriod + 1;
  const snippet = text.slice(start, end).trim().replace(/\s+/g, " ");
  return snippet || null;
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []).map(u => u.replace(/[),.\]}>"']+$/, "")))].slice(0, 12);
}
