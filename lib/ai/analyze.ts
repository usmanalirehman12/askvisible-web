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

// Shared by sentimentAround (classification) and extractMentionSnippet (display) so what
// gets scored and what gets shown as "the phrase" are always the same span -- otherwise a
// keyword three sentences away can drive a classification the displayed quote doesn't
// support at all.
function sentenceAround(text: string, index: number, matchEnd: number) {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1, text.lastIndexOf("\n", index) + 1);
  const nextPeriod = text.indexOf(".", matchEnd);
  const end = nextPeriod === -1 ? text.length : nextPeriod + 1;
  return { start, end, text: text.slice(start, end) };
}

const NEGATIVE_RE = /\b(drawback|weak|limited|expensive|poor|avoid|however|but)\b/gi;
const POSITIVE_RE = /\b(best|leading|strong|excellent|recommend|powerful|ideal|top)\b/gi;
// "Don't have information about X" or "not finding X" is the model saying it doesn't know
// enough to have an opinion -- treat as neutral regardless of any keyword elsewhere in the
// sentence (e.g. a nearby "best" describing the alternatives being requested, not X itself).
const UNCERTAINTY_RE = /\b(not finding|don'?t have (any )?(information|data)|no information (about|on)|not familiar with|unable to find)\b/i;

// Classifies sentiment from only the sentence containing the mention (not a fixed character
// window -- that let keywords describing a different sentence, a competitor, or the prompt's
// own phrasing bleed in), and prefers a keyword appearing AFTER the mention (describing the
// brand, as in "X is the best choice") over one appearing before it (as in "best alternatives
// to X", which describes the search, not the brand -- the dominant false-positive pattern for
// this app's "alternatives to X" buyer prompts, where the answer echoes the question's own
// wording back). A before-only hit is treated as too weak to trust and scored neutral.
function sentimentAround(text: string, index: number, matchEnd: number) {
  const sentence = sentenceAround(text, index, matchEnd);
  if (UNCERTAINTY_RE.test(sentence.text)) return "neutral" as const;

  const relativeMentionEnd = matchEnd - sentence.start;
  const positiveAfter = matchAfter(POSITIVE_RE, sentence.text, relativeMentionEnd);
  const negativeAfter = matchAfter(NEGATIVE_RE, sentence.text, relativeMentionEnd);
  if (positiveAfter || negativeAfter) return negativeAfter && !positiveAfter ? "negative" as const : "positive" as const;

  return "neutral" as const;
}

function matchAfter(re: RegExp, text: string, afterIndex: number): boolean {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m.index >= afterIndex) return true;
  return false;
}

export function analyzeMention(text: string, brand: string, domain: string, extraAliases: string[] = []) {
  const matcher = aliasMatcher([brand, domain, domain.split(".")[0], ...extraAliases]);
  const match = matcher ? text.match(matcher) : null;
  if (!match || match.index == null) return { mentioned: false as const, position: null, sentiment: "not-mentioned" as const };
  const index = match.index;
  return {
    mentioned: true as const,
    position: positionOf(text, index),
    sentiment: sentimentAround(text, index, index + match[0].length)
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
  // Same sentence-boundary logic sentimentAround classifies from, so the displayed phrase is
  // always the exact text a sentiment verdict was drawn from -- never a different sentence.
  const sentence = sentenceAround(text, index, index + match[0].length);
  // Hard cutoff at maxLen if the sentence runs long, so one run-on paragraph can't produce
  // an unreadable row.
  const capped = sentence.end - sentence.start > maxLen ? text.slice(sentence.start, Math.min(text.length, sentence.start + maxLen)) : sentence.text;
  const snippet = capped.trim().replace(/\s+/g, " ");
  return snippet || null;
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []).map(u => u.replace(/[),.\]}>"']+$/, "")))].slice(0, 12);
}
