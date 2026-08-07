function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// An empty alias list would compile to /\b(?:)\b/i, which matches almost any text and
// reports a mention everywhere. That's reachable with a short name and no domain
// (competitor names are user-entered), so the guard belongs here rather than at each call.
function usableAliases(aliases: string[]): string[] {
  return [...new Set(aliases.map(a => a.trim()).filter(a => a.length > 2))];
}

function aliasMatcher(aliases: string[], global = false): RegExp | null {
  const usable = usableAliases(aliases);
  return usable.length ? new RegExp(`\\b(?:${usable.map(escaped).join("|")})\\b`, global ? "gi" : "i") : null;
}

// "Assuming X is a service for..." is the model announcing it's guessing at what the brand
// even does. Unlike HEDGE_RE this has to be built per-brand, because the hedge only counts
// when the brand itself is its object -- "assuming you want a cheap option, Acme is great"
// is a real recommendation, not a guess about Acme.
function assumptionMatcher(aliases: string[]): RegExp | null {
  const usable = usableAliases(aliases);
  if (!usable.length) return null;
  const brand = `(?:${usable.map(escaped).join("|")})`;
  return new RegExp(
    `\\b(?:assum(?:ing|e|ed)|presumably|if (?:you mean|by)|taking (?:it|this) to mean)\\b[^.\\n]{0,80}?${brand}`
    + `|${brand}[^.\\n]{0,40}?\\bassum(?:ing|e|ed)\\b`,
    "i"
  );
}

// Walks back from the mention to the nearest preceding "1." / "2)" list marker. Answers
// are usually ranked lists, so that number is the brand's position in the recommendation.
function positionOf(text: string, index: number): number | null {
  const before = text.slice(0, index);
  const numbered = [...text.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(\d+)[.)]\s+/g)];
  const marker = numbered.filter(m => m.index! < before.length).at(-1)?.[1];
  return marker ? Number(marker) : null;
}

// Answers arrive as markdown. Nothing in lib/ stripped it before, so bold markers, headings,
// table pipes and link syntax leaked straight into displayed phrases. Applied to the chosen
// snippet only (not before index math), so every offset in this module still refers to the
// original text -- see the note on extractMentionSnippet.
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*•][ \t]+/gm, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
    .replace(/^[ \t]*\|?[-:| ]{5,}\|?[ \t]*$/gm, " ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// A "." only ends a sentence when whitespace follows. That single rule keeps acme.com, v2.0
// and 3.5x intact -- the old lastIndexOf(".") split straight through them.
const ABBREVIATION_RE = /\b(?:Inc|Ltd|Co|Corp|vs|etc|e\.g|i\.e|No|Mr|Mrs|Ms|Dr|St|Jr|Sr)\.$/i;
function isSentenceBoundary(text: string, i: number): boolean {
  const ch = text[i];
  if (ch !== "." && ch !== "!" && ch !== "?") return false;
  const next = text[i + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  return !ABBREVIATION_RE.test(text.slice(Math.max(0, i - 6), i + 1));
}

// Shared by the sentiment gates (classification) and extractMentionSnippet (display) so what
// gets scored and what gets shown as "the phrase" are always the same span.
//
// A newline is a hard boundary in both directions. Answers are markdown: list items, table
// rows and headings are line-scoped, and a table row contains no period at all -- without
// this cap the "sentence" ran on for paragraphs and then truncated mid-word.
function sentenceAround(text: string, index: number, matchEnd: number) {
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (text[i] === "\n") { start = i + 1; break; }
    if (isSentenceBoundary(text, i)) { start = i + 1; break; }
  }
  let end = text.length;
  for (let i = matchEnd; i < text.length; i++) {
    if (text[i] === "\n") { end = i; break; }
    if (isSentenceBoundary(text, i)) { end = i + 1; break; }
  }
  return { start, end, text: text.slice(start, end) };
}

function truncateAtWord(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  const cut = value.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:—-]+$/, "") + "…";
}

const NEGATIVE_RE = /\b(drawback|weak|limited|expensive|poor|avoid|however|but)\b/gi;
const POSITIVE_RE = /\b(best|leading|strong|excellent|recommend|powerful|ideal|top)\b/gi;
const LIST_MARKER_RE = /^\s*(?:\d+[.)]|[-*•]|\|)\s/;

// "I'm not finding information about X" / "assuming X is..." is the model telling you it does
// not know the brand. Everything after that in the answer is improvisation, including
// confident-looking list entries -- so this is a veto on the mention itself, not just a
// sentiment downgrade (which is all it used to do).
const HEDGE_RE = /\b(?:not finding|don'?t have (?:any )?(?:information|data|details)|no (?:public |widely available |specific )?information (?:about|on)|not familiar with|unable to find|couldn'?t find|could not find|not aware of|(?:little|limited) (?:public )?information|doesn'?t appear to be (?:a )?(?:widely|well)[- ]known|may be a (?:small|new|niche|lesser-known|regional)|based (?:only )?on (?:the|its) name)\b/i;
// Clause splitter: a hedge only applies to the subject in its own clause. Without this,
// "I'm not finding info about Acme, but Rival Co is well known" would veto Rival Co too.
const CONTRAST_RE = /\b(?:but|however|although|though|that said|whereas|on the other hand)\b/i;
// "alternatives to X" is the question's own noun phrase, not praise of X. This is the single
// biggest false-positive source: 1 in 5 generated prompts is literally "alternatives to {brand}".
const ECHO_CONTEXT_RE = /\b(?:alternatives?|competitors?|competing|similar(?: to)?|instead of|compared to|vs\.?|versus|rather than|considering|options?(?: to| for)?|replacements? for)\s+(?:to\s+)?(?:the\s+)?[\s*_"']*$/i;
const PREAMBLE_RE = /\b(?:here are|these are|below are|I(?:'|’)?ll (?:break down|list|cover|walk)|let(?:'|’)?s look|great question)\b/i;

const STOPWORDS = new Set("a an and are as at be been being by can could did do does for from had has have how in into is it its me my not of on or our out so some than that the their them there these they this those to up us was we were what when where which who whom why will with would you your".split(" "));
function contentWords(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function matchAfter(re: RegExp, text: string, afterIndex: number): boolean {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m.index >= afterIndex) return true;
  return false;
}

// The clause containing the mention, so a hedge about one subject doesn't veto another named
// after a contrast marker.
function clauseFor(sentence: string, offsetInSentence: number): string {
  const parts: { start: number; text: string }[] = [];
  let cursor = 0;
  const splitter = new RegExp(CONTRAST_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = splitter.exec(sentence))) {
    parts.push({ start: cursor, text: sentence.slice(cursor, m.index) });
    cursor = m.index;
  }
  parts.push({ start: cursor, text: sentence.slice(cursor) });
  return parts.find(p => offsetInSentence >= p.start && offsetInSentence < p.start + p.text.length)?.text ?? sentence;
}

type MentionReason = "substantive" | "hedged" | "echo-only" | "absent";
type Occurrence = { index: number; end: number; sentence: ReturnType<typeof sentenceAround>; kind: "substantive" | "echo" | "hedged" };

// Classifies every occurrence of the brand in the answer, not just the first. The first
// occurrence is almost always the preamble ("Here are the best alternatives to X:"), so
// scoring off it meant the real verdict later in the answer was never seen.
function classifyOccurrences(text: string, aliases: string[], prompt: string): Occurrence[] {
  const gre = aliasMatcher(aliases, true);
  if (!gre) return [];
  const promptWords = new Set(contentWords(prompt));
  const aliasWords = new Set(aliases.flatMap(a => contentWords(a)));
  for (const w of aliasWords) promptWords.delete(w);

  const out: Occurrence[] = [];
  for (const m of text.matchAll(gre)) {
    const index = m.index!;
    const end = index + m[0].length;
    const sentence = sentenceAround(text, index, end);
    const offsetInSentence = index - sentence.start;
    const clause = clauseFor(sentence.text, offsetInSentence);

    if (HEDGE_RE.test(clause)) { out.push({ index, end, sentence, kind: "hedged" }); continue; }

    // Only ever suppress on positive evidence of an echo. Requiring positive evidence of
    // substance instead (e.g. a verdict verb after the name) wrongly killed ordinary
    // recommendation phrasing like "We recommend Acme" or "Try acme.com", where the verb
    // precedes the name -- and over-suppression is the more dangerous failure here.
    const before = text.slice(Math.max(0, index - 40), index);
    if (ECHO_CONTEXT_RE.test(before)) { out.push({ index, end, sentence, kind: "echo" }); continue; }

    // A list-marker line is a ranked recommendation entry. That outranks the softer
    // overlap/preamble heuristics below, which would otherwise fire on a terse entry
    // like "1. Acme — best for teams" that reuses the question's wording.
    const lineStart = text.lastIndexOf("\n", index) + 1;
    if (LIST_MARKER_RE.test(text.slice(lineStart, index + 1))) { out.push({ index, end, sentence, kind: "substantive" }); continue; }

    let isEcho = false;
    if (promptWords.size) {
      const words = contentWords(sentence.text);
      if (words.length && words.length <= 30) {
        const shared = words.filter(w => promptWords.has(w)).length;
        if (shared / words.length >= 0.6) isEcho = true;
      }
    }
    if (!isEcho && index < 200 && (sentence.text.trimEnd().endsWith(":") || PREAMBLE_RE.test(sentence.text))) isEcho = true;

    out.push({ index, end, sentence, kind: isEcho ? "echo" : "substantive" });
  }
  return out;
}

function sentimentFor(occurrence: Occurrence): "positive" | "neutral" | "negative" {
  const afterOffset = occurrence.end - occurrence.sentence.start;
  const positive = matchAfter(POSITIVE_RE, occurrence.sentence.text, afterOffset);
  const negative = matchAfter(NEGATIVE_RE, occurrence.sentence.text, afterOffset);
  if (!positive && !negative) return "neutral";
  return negative && !positive ? "negative" : "positive";
}

// The engine citing the brand's own domain is hard evidence it knows the brand, which
// outranks the echo heuristic (but not a hedge -- a model can cite a URL it guessed at).
function citesBrandDomain(text: string, domain: string): boolean {
  if (!domain || domain.length <= 2) return false;
  const root = domain.replace(/^www\./, "");
  return extractUrls(text).some(u => { try { return new URL(u).hostname.replace(/^www\./, "").endsWith(root); } catch { return false; } });
}

export type MentionAnalysis = {
  mentioned: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | "not-mentioned";
  brandKnown: boolean;
  reason: MentionReason;
};

// `prompt` is optional and last so every existing call site and test keeps compiling; passing
// "" reproduces the pre-echo-detection behaviour exactly.
export function analyzeMention(text: string, brand: string, domain: string, extraAliases: string[] = [], prompt = ""): MentionAnalysis {
  const aliases = [brand, domain, domain.split(".")[0], ...extraAliases];
  const occurrences = classifyOccurrences(text, aliases, prompt);
  if (!occurrences.length) return { mentioned: false, position: null, sentiment: "not-mentioned", brandKnown: false, reason: "absent" };

  // A hedge anywhere about this subject poisons the whole answer, including any
  // confident-looking list entry further down.
  const assumption = assumptionMatcher(aliases);
  if (occurrences.some(o => o.kind === "hedged") || (assumption && assumption.test(text))) {
    return { mentioned: false, position: null, sentiment: "not-mentioned", brandKnown: false, reason: "hedged" };
  }

  let substantive = occurrences.filter(o => o.kind === "substantive");
  if (!substantive.length && citesBrandDomain(text, domain)) substantive = occurrences;
  if (!substantive.length) {
    return { mentioned: false, position: null, sentiment: "not-mentioned", brandKnown: false, reason: "echo-only" };
  }

  const first = substantive[0];
  return {
    mentioned: true,
    position: positionOf(text, first.index),
    sentiment: sentimentFor(first),
    brandKnown: true,
    reason: "substantive",
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
export function analyzeCompetitors(text: string, competitors: CompetitorInput[], prompt = ""): CompetitorMention[] {
  return competitors.map(competitor => {
    const analysis = analyzeMention(text, competitor.name, competitor.domain || "", competitor.aliases || [], prompt);
    return { id: competitor.id, name: competitor.name, mentioned: analysis.mentioned, position: analysis.position, sentiment: analysis.sentiment };
  });
}

// Post-hoc phrase mining for "Common sentiment phrases": given the same raw answer text
// already persisted on every answer row (answers.raw_answer), pull out the sentence
// containing the brand mention so the app can show *what AI engines are actually saying*.
// Returns null when every occurrence is an echo or a hedge, so scaffolding like "here are the
// best alternatives to X:" never reaches the panel.
export function extractMentionSnippet(text: string, brand: string, domain: string, extraAliases: string[] = [], maxLen = 160, prompt = ""): string | null {
  const aliases = [brand, domain, domain.split(".")[0], ...extraAliases];
  const substantive = classifyOccurrences(text, aliases, prompt).filter(o => o.kind === "substantive");
  if (!substantive.length) return null;
  // Prefer the occurrence whose sentence carries the keyword that drove the sentiment verdict,
  // so the displayed phrase is always the phrase that was actually scored.
  const chosen = substantive.find(o => sentimentFor(o) !== "neutral") ?? substantive[0];
  const snippet = truncateAtWord(stripMarkdown(chosen.sentence.text).replace(/^[\s:\-–—*|>]+/, "").trim(), maxLen);
  return snippet || null;
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []).map(u => u.replace(/[),.\]}>"']+$/, "")))].slice(0, 12);
}
