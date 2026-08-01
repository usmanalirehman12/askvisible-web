import { describe, expect, it } from "vitest";
import { analyzeCompetitors, analyzeMention, extractUrls } from "./analyze";

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
