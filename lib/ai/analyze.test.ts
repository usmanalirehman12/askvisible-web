import { describe, expect, it } from "vitest";
import { analyzeCompetitors, analyzeMention, extractMentionSnippet, extractUrls } from "./analyze";

describe("analyzeMention", () => {
  it("finds the brand by name", () => {
    expect(analyzeMention("We recommend Acme Plumbing.", "Acme Plumbing", "acme.com").mentioned).toBe(true);
  });

  it("finds the brand by bare domain when the name never appears", () => {
    expect(analyzeMention("Try acme.com for this.", "Totally Different", "acme.com").mentioned).toBe(true);
  });

  it("reports not-mentioned rather than throwing when absent", () => {
    expect(analyzeMention("Nothing relevant here.", "Acme", "acme.com")).toEqual({ mentioned: false, position: null, sentiment: "not-mentioned" });
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
    expect(analyzeMention("I'll break down the best alternatives to Acme.", "Acme", "").sentiment).toBe("neutral");
  });

  it("still reads a keyword genuinely describing the brand after the mention as positive", () => {
    expect(analyzeMention("Alternatives aside, Acme itself is the best choice here.", "Acme", "").sentiment).toBe("positive");
  });

  it("treats 'no information about the brand' as neutral even when a keyword appears after the mention in the same sentence", () => {
    // Without the uncertainty guard, "best" appearing after "Acme" here would otherwise
    // score positive under the after-mention rule -- the guard must take priority.
    const text = "I'm not finding substantial information about Acme, which some call the best.";
    expect(analyzeMention(text, "Acme", "").sentiment).toBe("neutral");
  });

  it("classifies correctly when the match is via domain/alias rather than the brand name", () => {
    expect(analyzeMention("Try acme.com — it's the best option.", "Totally Different", "acme.com").sentiment).toBe("positive");
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
