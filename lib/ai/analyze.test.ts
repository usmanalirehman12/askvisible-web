import { describe, expect, it } from "vitest";
import { analyzeCompetitors, analyzeMention, extractMentionSnippet, extractUrls, stripMarkdown } from "./analyze";

describe("analyzeMention", () => {
  it("finds the brand by name", () => {
    expect(analyzeMention("We recommend Acme Plumbing.", "Acme Plumbing", "acme.com").mentioned).toBe(true);
  });

  it("finds the brand by bare domain when the name never appears", () => {
    expect(analyzeMention("Try acme.com for this.", "Totally Different", "acme.com").mentioned).toBe(true);
  });

  it("reports not-mentioned rather than throwing when absent", () => {
    // brandKnown/reason were added by the prompt-echo change; "absent" means the brand
    // never appeared at all, as distinct from "echo-only" and "hedged".
    expect(analyzeMention("Nothing relevant here.", "Acme", "acme.com")).toEqual({ mentioned: false, position: null, sentiment: "not-mentioned", brandKnown: false, reason: "absent" });
  });

  it("does not match a name embedded inside a longer word", () => {
    expect(analyzeMention("The pancake was good.", "cake", "").mentioned).toBe(false);
  });

  // Empty alias lists used to compile to /\b(?:)\b/i, which matches nearly any text.
  // Reachable with a short name and no domain, which is ordinary for a competitor row.
  it("never reports a mention when no alias is long enough to be meaningful", () => {
    expect(analyzeMention("Some completely unrelated sentence.", "AB", "").mentioned).toBe(false);
    expect(analyzeMention("Some completely unrelated sentence.", "", "").mentioned).toBe(false);
  });

  it("reads position from the nearest preceding list marker", () => {
    const text = "1. FirstCo is great.\n2. SecondCo is solid.\n3. ThirdCo rounds it out.";
    expect(analyzeMention(text, "SecondCo", "").position).toBe(2);
    expect(analyzeMention(text, "ThirdCo", "").position).toBe(3);
  });

  it("returns a null position for prose with no ranking", () => {
    expect(analyzeMention("Acme is a solid choice for most teams.", "Acme", "").position).toBeNull();
  });

  it("classifies sentiment from the words surrounding the mention", () => {
    expect(analyzeMention("Acme is the best option here.", "Acme", "").sentiment).toBe("positive");
    expect(analyzeMention("Acme is expensive and limited.", "Acme", "").sentiment).toBe("negative");
    expect(analyzeMention("Acme is a company that exists.", "Acme", "").sentiment).toBe("neutral");
  });

  it("accepts extra aliases", () => {
    expect(analyzeMention("Everyone just calls it BigCo.", "Big Corporation", "bigcorp.com", ["BigCo"]).mentioned).toBe(true);
  });

  // Regression coverage for the reported bug: sentiment used to scan a ~300-character
  // window around the mention, so a keyword describing something else entirely -- a
  // different sentence, the prompt's own phrasing, or a plain "we don't know" answer --
  // could get misattributed to the brand.
  it("does not let a keyword in a different sentence bleed into the mention's sentiment", () => {
    const text = "Rival Co is the best choice for most teams. Acme is a company that exists.";
    expect(analyzeMention(text, "Acme", "").sentiment).toBe("neutral");
  });

  it("does not read 'best alternatives to X' as praise of X", () => {
    // The dominant false-positive pattern for this app: buyer prompts are phrased "best
    // alternatives to X", and the answer echoes that framing back near the mention.
    // Previously asserted only sentiment:"neutral" -- the prompt-echo change strengthened
    // this so the echo isn't counted as a mention at all.
    const result = analyzeMention("I'll break down the best alternatives to Acme.", "Acme", "");
    expect(result.mentioned).toBe(false);
    expect(result.reason).toBe("echo-only");
  });

  it("still reads a keyword genuinely describing the brand after the mention as positive", () => {
    expect(analyzeMention("Alternatives aside, Acme itself is the best choice here.", "Acme", "").sentiment).toBe("positive");
  });

  it("treats 'no information about the brand' as not a mention at all", () => {
    // Previously asserted sentiment:"neutral" -- the hedge guard only downgraded sentiment
    // and left mentioned:true. It now vetoes the mention, because anything a model says
    // about a brand it just admitted it can't find is improvisation.
    const text = "I'm not finding substantial information about Acme, which some call the best.";
    const result = analyzeMention(text, "Acme", "");
    expect(result.mentioned).toBe(false);
    expect(result.brandKnown).toBe(false);
    expect(result.reason).toBe("hedged");
  });

  it("classifies correctly when the match is via domain/alias rather than the brand name", () => {
    expect(analyzeMention("Try acme.com — it's the best option.", "Totally Different", "acme.com").sentiment).toBe("positive");
  });
});

// Verbatim answers from production for the brand "The Greeting Shelf", which none of the
// engines actually know. Every one of these used to score as a real mention, inflating the
// visibility score by ~78/n points each.
describe("analyzeMention — hallucinated / echoed brands", () => {
  const BRAND = "The Greeting Shelf";

  it("rejects an 'Assuming X is...' answer as hedged", () => {
    const text = "Assuming **The Greeting Shelf** is a service for choosing and sending physical greeting cards—sometimes with scheduled reminders and mailing—these are the stron";
    const result = analyzeMention(text, BRAND, "");
    expect(result).toMatchObject({ mentioned: false, brandKnown: false, reason: "hedged" });
  });

  it("rejects 'Assuming you mean X...' as hedged despite markdown around the name", () => {
    const text = "Assuming you mean **The Greeting Shelf as a service for choosing, scheduling, and sending physical greeting cards**, these are strong alternatives:";
    const result = analyzeMention(text, BRAND, "");
    expect(result).toMatchObject({ mentioned: false, brandKnown: false, reason: "hedged" });
  });

  it("rejects an explicit 'not finding information' answer", () => {
    // Regression: UNCERTAINTY_RE previously reached only sentiment, never `mentioned`.
    const text = "# Alternatives to The Greeting Shelf\nI'm not finding substantial information about a product called \"The Greeting Shelf\" specifically.";
    const result = analyzeMention(text, BRAND, "");
    expect(result).toMatchObject({ mentioned: false, brandKnown: false, reason: "hedged" });
  });

  it("rejects a name echoed out of an 'alternatives to' frame", () => {
    // The parenthetical gloss here is fabricated, but is textually indistinguishable from a
    // real description -- it's caught via the "alternatives to" frame, not via its content.
    const text = "As an independent software and services analyst, I'll break down the best alternatives to **The Greeting Shelf** (a digital greeting card service known for its";
    const result = analyzeMention(text, BRAND, "");
    expect(result).toMatchObject({ mentioned: false, reason: "echo-only" });
  });

  it("still counts a genuine ranked entry that follows a preamble echo", () => {
    // The load-bearing case for the all-occurrences scan: scoring off the FIRST occurrence
    // (the preamble) would report this brand as unmentioned despite it placing 3rd.
    const text = "Here are the best alternatives to Acme:\n1. Widgetly — strong for small teams.\n2. Boxly — cheapest option.\n3. Acme is excellent for enterprise rollouts.";
    const result = analyzeMention(text, "Acme", "");
    expect(result.mentioned).toBe(true);
    expect(result.position).toBe(3);
    expect(result.reason).toBe("substantive");
  });

  it("treats a hedge as scoped to its own clause, not the whole sentence", () => {
    const text = "I'm not finding information about Acme, but Rival Co is a strong option.";
    expect(analyzeMention(text, "Acme", "").reason).toBe("hedged");
    expect(analyzeMention(text, "Rival Co", "").mentioned).toBe(true);
  });

  it("suppresses a sentence that mostly restates the prompt", () => {
    const prompt = "Which tools are the leading alternatives for customers considering Acme?";
    const echoed = "Tools that are leading alternatives for customers considering Acme.";
    expect(analyzeMention(echoed, "Acme", "", [], prompt).mentioned).toBe(false);
    // A sentence sharing only incidental wording is untouched.
    expect(analyzeMention("Acme ships a excellent onboarding flow.", "Acme", "", [], prompt).mentioned).toBe(true);
  });

  it("lets a citation of the brand's own domain override the echo verdict", () => {
    const text = "Looking at alternatives to Acme — see https://acme.com/pricing for details.";
    const result = analyzeMention(text, "Acme", "acme.com");
    expect(result).toMatchObject({ mentioned: true, brandKnown: true });
  });

  it("reproduces pre-change behaviour when no prompt is supplied", () => {
    // The compatibility contract: prompt is optional and defaults to "", so every existing
    // caller and test keeps its old semantics until it opts in.
    expect(analyzeMention("Acme is the best option here.", "Acme", "", [], "").mentioned).toBe(true);
    expect(analyzeMention("Acme is the best option here.", "Acme", "").mentioned).toBe(true);
  });
});

describe("analyzeCompetitors", () => {
  const text = "1. Acme Plumbing leads the pack.\n2. Rival Pipes is a strong second.\n3. Third Wheel also appears.";

  it("returns a row for every competitor, including ones never named", () => {
    const result = analyzeCompetitors(text, [{ name: "Rival Pipes" }, { name: "Ghost Company" }]);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.name)).toEqual(["Rival Pipes", "Ghost Company"]);
  });

  it("marks the absent competitor as not mentioned rather than dropping it", () => {
    // Share of voice needs the zero rows — an absence is a result.
    const [ghost] = analyzeCompetitors(text, [{ name: "Ghost Company" }]);
    expect(ghost).toMatchObject({ mentioned: false, position: null, sentiment: "not-mentioned" });
  });

  it("captures each competitor's own position in the same answer", () => {
    const result = analyzeCompetitors(text, [{ name: "Rival Pipes" }, { name: "Third Wheel" }]);
    expect(result[0].position).toBe(2);
    expect(result[1].position).toBe(3);
  });

  it("passes through the competitor id so rows can be joined back", () => {
    expect(analyzeCompetitors(text, [{ id: "c1", name: "Rival Pipes" }])[0].id).toBe("c1");
  });

  it("matches on the competitor's domain and aliases", () => {
    const byDomain = analyzeCompetitors("Check rivalpipes.com for pricing.", [{ name: "Unrelated Name", domain: "rivalpipes.com" }]);
    expect(byDomain[0].mentioned).toBe(true);
    const byAlias = analyzeCompetitors("Locals call them RP Plumbing.", [{ name: "Rival Pipes", aliases: ["RP Plumbing"] }]);
    expect(byAlias[0].mentioned).toBe(true);
  });

  it("tolerates null domain and aliases from the database", () => {
    expect(analyzeCompetitors(text, [{ name: "Rival Pipes", domain: null, aliases: null }])[0].mentioned).toBe(true);
  });

  it("returns an empty array when nothing is tracked", () => {
    expect(analyzeCompetitors(text, [])).toEqual([]);
  });

  it("does not report a mention for a short name with no domain", () => {
    expect(analyzeCompetitors("An ordinary sentence about plumbing.", [{ name: "AB" }])[0].mentioned).toBe(false);
  });
});

describe("extractMentionSnippet", () => {
  it("returns the sentence containing the mention", () => {
    const text = "Some intro sentence. Acme is the best option here for most teams. A trailing sentence.";
    expect(extractMentionSnippet(text, "Acme", "")).toBe("Acme is the best option here for most teams.");
  });

  it("returns null when the brand isn't mentioned", () => {
    expect(extractMentionSnippet("Nothing relevant here.", "Acme", "acme.com")).toBeNull();
  });

  it("returns null when no alias is long enough to be meaningful", () => {
    expect(extractMentionSnippet("Some completely unrelated sentence.", "", "")).toBeNull();
  });

  it("falls back to a hard cutoff for a run-on sentence with no nearby period", () => {
    const longRun = "Acme is " + "very ".repeat(60) + "good";
    const result = extractMentionSnippet(longRun, "Acme", "", [], 40);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(40);
  });

  it("matches by domain when the brand name never appears", () => {
    expect(extractMentionSnippet("Try acme.com for this need.", "Totally Different", "acme.com")).toBe("Try acme.com for this need.");
  });

  it("returns the same sentence analyzeMention classified sentiment from, not a different one", () => {
    const text = "Rival Co is the best choice for most teams. Acme is a company that exists.";
    expect(analyzeMention(text, "Acme", "").sentiment).toBe("neutral");
    expect(extractMentionSnippet(text, "Acme", "")).toBe("Acme is a company that exists.");
  });

  it("returns null when every occurrence is scaffolding", () => {
    // This is what kept "I'll break down the best alternatives to X..." out of the panel.
    expect(extractMentionSnippet("I'll break down the best alternatives to Acme.", "Acme", "")).toBeNull();
  });

  it("strips markdown out of the returned phrase", () => {
    const text = "Rival is fine. **Acme** is the `best` option for [teams](https://x.com) here.";
    expect(extractMentionSnippet(text, "Acme", "")).toBe("Acme is the best option for teams here.");
  });

  it("does not split inside a domain, decimal or abbreviation", () => {
    // Regression: the old lastIndexOf(".") boundary cut straight through acme.com and v2.0.
    expect(extractMentionSnippet("Widgetly Inc. ships v2.0 now. Acme runs acme.com and is excellent.", "Acme", ""))
      .toBe("Acme runs acme.com and is excellent.");
  });

  it("stops at the end of a markdown table row instead of running to the next period", () => {
    // Regression: a table row contains no period, so the "sentence" used to run on for
    // paragraphs and then truncate mid-word.
    const text = "| Tool | Price |\n| Acme | $49/mo |\n\nSeparately, a long paragraph follows with a period.";
    const result = extractMentionSnippet(text, "Acme", "");
    expect(result).toBe("Acme · $49/mo");
  });

  it("truncates on a word boundary with an ellipsis, never mid-word", () => {
    // Regression: produced "...known for its cura" and "...these are the stron" in production.
    const text = "Acme is a wonderfully comprehensive platform for orchestrating distributed workloads across many regions.";
    const result = extractMentionSnippet(text, "Acme", "", [], 40)!;
    expect(result.endsWith("…")).toBe(true);
    expect(result.replace("…", "")).toMatch(/\w$/);
    expect(text).toContain(result.replace("…", ""));
  });
});

describe("stripMarkdown", () => {
  it("unwraps bold, italic, code and links", () => {
    expect(stripMarkdown("**bold** and *em* and `code` and [label](https://x.com)")).toBe("bold and em and code and label");
  });

  it("removes heading, quote and list prefixes", () => {
    expect(stripMarkdown("## Heading\n> quoted\n- bullet\n1. numbered")).toBe("Heading\nquoted\nbullet\nnumbered");
  });

  it("converts table pipes to separators and drops separator rows", () => {
    expect(stripMarkdown("| Acme | $49 |\n| --- | --- |")).toBe("Acme · $49");
  });

  it("leaves plain prose untouched", () => {
    expect(stripMarkdown("Acme is the best option here.")).toBe("Acme is the best option here.");
  });
});

describe("extractUrls", () => {
  it("pulls urls out and strips trailing punctuation", () => {
    expect(extractUrls("See https://acme.com/pricing, or https://rival.io.")).toEqual(["https://acme.com/pricing", "https://rival.io"]);
  });

  it("deduplicates", () => {
    expect(extractUrls("https://a.com and https://a.com again")).toEqual(["https://a.com"]);
  });

  it("returns empty for text with no links", () => {
    expect(extractUrls("no links here")).toEqual([]);
  });
});
